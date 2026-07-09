"""
routes_meetings.py - Module NHÂN VIÊN (WBS 2.5.1)
  - Xem lịch họp (Ngày/Tuần/Tháng) + Lọc lịch (người tổ chức, phòng, thời gian trống)
  - Tạo cuộc họp (chọn phòng, thời gian, người tham gia; tự động kiểm tra
    trùng phòng & người tham gia bận)
  - Quản lý cuộc họp đã tạo (xem danh sách, điều chỉnh, hủy)
  - Phản hồi lời mời (xem chi tiết, xác nhận / từ chối)
  - Thông báo (moi hop / huy hop / thay doi lich)
"""
import math
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, session

from db import get_connection, dict_rows, dict_row
from auth_utils import login_required

meetings_bp = Blueprint("meetings", __name__, url_prefix="/api/meetings")
notif_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")

PAGE_SIZE = 8


def bad_request(message, extra=None):
    payload = {"success": False, "message": message}
    if extra:
        payload.update(extra)
    return jsonify(payload), 400


def conflict(message, extra=None):
    payload = {"success": False, "message": message}
    if extra:
        payload.update(extra)
    return jsonify(payload), 409


def server_error(err):
    print("ERROR:", err)
    return jsonify({"success": False, "message": "Lỗi máy chủ"}), 500


def parse_dt(value):
    return datetime.fromisoformat(value)


# ---------------------------------------------------------------
# Tính khoảng ngày [start, end) theo view=day|week|month quanh `date`
# ---------------------------------------------------------------
def compute_range(view, date_str):
    anchor = datetime.strptime(date_str, "%Y-%m-%d")
    if view == "day":
        start = anchor
        end = anchor + timedelta(days=1)
    elif view == "week":
        start = anchor - timedelta(days=anchor.weekday())  # Thứ 2
        end = start + timedelta(days=7)
    else:  # month
        start = anchor.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    return start, end


# =================================================================
# 1) XEM LỊCH HỌP (Ngày/Tuần/Tháng) + LỌC (người tổ chức, phòng)
#    GET /api/meetings?view=day|week|month&date=YYYY-MM-DD
#        &organizer_id=&room_id=&scope=mine|all
# =================================================================
@meetings_bp.route("", methods=["GET"])
@login_required()
def list_meetings():
    view = request.args.get("view", "week")
    date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    organizer_id = request.args.get("organizer_id")
    room_id = request.args.get("room_id")
    scope = request.args.get("scope", "mine")
    start, end = compute_range(view, date_str)
    user_id = session["user_id"]

    conditions = ["m.status <> 'DA_HUY'", "m.start_time < ?", "m.end_time > ?"]
    params = [end, start]

    if scope == "mine":
        conditions.append(
            "(m.created_by = ? OR EXISTS (SELECT 1 FROM dbo.meeting_participants mp "
            "WHERE mp.meeting_id = m.id AND mp.user_id = ?))"
        )
        params += [user_id, user_id]
    if organizer_id:
        conditions.append("m.created_by = ?")
        params.append(organizer_id)
    if room_id:
        conditions.append("m.room_id = ?")
        params.append(room_id)

    where_clause = "WHERE " + " AND ".join(conditions)

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT m.id, m.title, m.start_time, m.end_time, m.status,
                   r.name AS room_name, u.full_name AS organizer_name, u.code AS organizer_code,
                   m.created_by,
                   (SELECT TOP 1 mp.response FROM dbo.meeting_participants mp
                     WHERE mp.meeting_id = m.id AND mp.user_id = ?) AS my_response
            FROM dbo.meetings m
            JOIN dbo.rooms r ON r.id = m.room_id
            JOIN dbo.users u ON u.id = m.created_by
            {where_clause}
            ORDER BY m.start_time
            """,
            user_id, *params,
        )
        rows = dict_rows(cur)
        conn.close()

        for r in rows:
            r["start_time"] = r["start_time"].isoformat()
            r["end_time"] = r["end_time"].isoformat()
            r["is_owner"] = r["created_by"] == user_id

        return jsonify({"success": True, "data": rows, "range": {
            "start": start.strftime("%Y-%m-%d"), "end": (end - timedelta(days=1)).strftime("%Y-%m-%d")
        }})
    except Exception as err:
        return server_error(err)


# Danh sách người dùng để chọn khi lọc / mời tham gia
@meetings_bp.route("/users", methods=["GET"])
@login_required()
def list_users_for_meeting():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, code, full_name FROM dbo.users WHERE is_locked = 0 ORDER BY full_name"
        )
        rows = dict_rows(cur)
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as err:
        return server_error(err)


# =================================================================
# 2) TẠO CUỘC HỌP MỚI
#    POST /api/meetings { title, room_id, start_time, end_time, participant_ids[] }
#    Tự động kiểm tra trùng phòng & người tham gia bận
# =================================================================
@meetings_bp.route("", methods=["POST"])
@login_required()
def create_meeting():
    body = request.get_json(force=True) or {}
    title = (body.get("title") or "").strip()
    room_id = body.get("room_id")
    start_time = body.get("start_time")
    end_time = body.get("end_time")
    participant_ids = body.get("participant_ids") or []
    user_id = session["user_id"]

    if not title or not room_id or not start_time or not end_time:
        return bad_request("Vui lòng nhập đầy đủ Tiêu đề, Phòng họp và Thời gian.")
    try:
        start_dt, end_dt = parse_dt(start_time), parse_dt(end_time)
    except ValueError:
        return bad_request("Định dạng thời gian không hợp lệ.")
    if end_dt <= start_dt:
        return bad_request("Thời gian kết thúc phải sau thời gian bắt đầu.")

    try:
        conn = get_connection()
        cur = conn.cursor()

        # (a) Kiểm tra trùng phòng
        cur.execute(
            """
            SELECT COUNT(*) FROM dbo.meetings
             WHERE room_id = ? AND status <> 'DA_HUY'
               AND start_time < ? AND end_time > ?
            """,
            room_id, end_dt, start_dt,
        )
        room_busy = cur.fetchone()[0] > 0

        # (b) Kiểm tra người tham gia (và người tạo) có đang bận không
        all_people = list(set(participant_ids + [user_id]))
        busy_people = []
        for pid in all_people:
            cur.execute(
                """
                SELECT COUNT(*) FROM dbo.meetings m
                 WHERE m.status <> 'DA_HUY' AND m.start_time < ? AND m.end_time > ?
                   AND (m.created_by = ? OR EXISTS (
                        SELECT 1 FROM dbo.meeting_participants mp
                         WHERE mp.meeting_id = m.id AND mp.user_id = ? AND mp.response <> 'TU_CHOI'))
                """,
                end_dt, start_dt, pid, pid,
            )
            if cur.fetchone()[0] > 0:
                cur.execute("SELECT code, full_name FROM dbo.users WHERE id = ?", pid)
                u = dict_row(cur)
                if u:
                    busy_people.append(u)

        if room_busy or busy_people:
            conn.close()
            return conflict(
                "Không thể tạo cuộc họp do trùng lịch.",
                {"room_conflict": room_busy, "busy_users": busy_people},
            )

        cur.execute(
            "INSERT INTO dbo.meetings (room_id, title, start_time, end_time, created_by) "
            "OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?)",
            room_id, title, start_dt, end_dt, user_id,
        )
        meeting_id = cur.fetchone()[0]

        for pid in participant_ids:
            cur.execute(
                "INSERT INTO dbo.meeting_participants (meeting_id, user_id, response) VALUES (?, ?, 'CHO_PHAN_HOI')",
                meeting_id, pid,
            )
            cur.execute(
                "INSERT INTO dbo.notifications (user_id, meeting_id, type, message) VALUES (?, ?, 'MOI_HOP', ?)",
                pid, meeting_id, f'Bạn được mời tham gia cuộc họp "{title}"',
            )

        conn.commit()
        conn.close()
        return jsonify({"success": True, "data": {"id": meeting_id}}), 201
    except Exception as err:
        return server_error(err)


# =================================================================
# 3) QUẢN LÝ CUỘC HỌP ĐÃ TẠO — xem danh sách / điều chỉnh / hủy
# =================================================================
@meetings_bp.route("/created", methods=["GET"])
@login_required()
def list_created_meetings():
    page = max(1, int(request.args.get("page", 1)))
    offset = (page - 1) * PAGE_SIZE
    user_id = session["user_id"]

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT m.id, m.title, m.start_time, m.end_time, m.status, r.name AS room_name,
                   (SELECT COUNT(*) FROM dbo.meeting_participants mp WHERE mp.meeting_id = m.id) AS so_nguoi_moi
            FROM dbo.meetings m JOIN dbo.rooms r ON r.id = m.room_id
            WHERE m.created_by = ?
            ORDER BY m.start_time DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            user_id, offset, PAGE_SIZE,
        )
        rows = dict_rows(cur)
        for r in rows:
            r["start_time"] = r["start_time"].isoformat()
            r["end_time"] = r["end_time"].isoformat()

        cur.execute("SELECT COUNT(*) FROM dbo.meetings WHERE created_by = ?", user_id)
        total = cur.fetchone()[0]
        conn.close()
        return jsonify({
            "success": True, "data": rows,
            "pagination": {"page": page, "pageSize": PAGE_SIZE, "total": total,
                            "totalPages": max(1, math.ceil(total / PAGE_SIZE))},
        })
    except Exception as err:
        return server_error(err)


@meetings_bp.route("/<int:meeting_id>", methods=["GET"])
@login_required()
def get_meeting(meeting_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT m.id, m.title, m.room_id, m.start_time, m.end_time, m.status, m.created_by,
                   r.name AS room_name, u.full_name AS organizer_name
            FROM dbo.meetings m
            JOIN dbo.rooms r ON r.id = m.room_id
            JOIN dbo.users u ON u.id = m.created_by
            WHERE m.id = ?
            """,
            meeting_id,
        )
        meeting = dict_row(cur)
        if not meeting:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy cuộc họp."}), 404

        cur.execute(
            """
            SELECT u.id, u.code, u.full_name, mp.response
            FROM dbo.meeting_participants mp JOIN dbo.users u ON u.id = mp.user_id
            WHERE mp.meeting_id = ?
            """,
            meeting_id,
        )
        participants = dict_rows(cur)
        conn.close()

        meeting["start_time"] = meeting["start_time"].isoformat()
        meeting["end_time"] = meeting["end_time"].isoformat()
        meeting["participants"] = participants
        return jsonify({"success": True, "data": meeting})
    except Exception as err:
        return server_error(err)


@meetings_bp.route("/<int:meeting_id>", methods=["PUT"])
@login_required()
def update_meeting(meeting_id):
    body = request.get_json(force=True) or {}
    title = (body.get("title") or "").strip()
    room_id = body.get("room_id")
    start_time = body.get("start_time")
    end_time = body.get("end_time")
    participant_ids = body.get("participant_ids") or []
    user_id = session["user_id"]

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT created_by FROM dbo.meetings WHERE id = ?", meeting_id)
        row = dict_row(cur)
        if not row:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy cuộc họp."}), 404
        if row["created_by"] != user_id:
            conn.close()
            return jsonify({"success": False, "message": "Bạn không có quyền sửa cuộc họp này."}), 403

        if not title or not room_id or not start_time or not end_time:
            conn.close()
            return bad_request("Vui lòng nhập đầy đủ Tiêu đề, Phòng họp và Thời gian.")
        start_dt, end_dt = parse_dt(start_time), parse_dt(end_time)
        if end_dt <= start_dt:
            conn.close()
            return bad_request("Thời gian kết thúc phải sau thời gian bắt đầu.")

        cur.execute(
            """
            SELECT COUNT(*) FROM dbo.meetings
             WHERE room_id = ? AND status <> 'DA_HUY' AND id <> ?
               AND start_time < ? AND end_time > ?
            """,
            room_id, meeting_id, end_dt, start_dt,
        )
        if cur.fetchone()[0] > 0:
            conn.close()
            return conflict("Phòng đã có lịch họp khác trong khung giờ này.", {"room_conflict": True})

        cur.execute(
            "UPDATE dbo.meetings SET title=?, room_id=?, start_time=?, end_time=?, updated_at=SYSDATETIME() WHERE id=?",
            title, room_id, start_dt, end_dt, meeting_id,
        )
        cur.execute("DELETE FROM dbo.meeting_participants WHERE meeting_id = ?", meeting_id)
        for pid in participant_ids:
            cur.execute(
                "INSERT INTO dbo.meeting_participants (meeting_id, user_id, response) VALUES (?, ?, 'CHO_PHAN_HOI')",
                meeting_id, pid,
            )
            cur.execute(
                "INSERT INTO dbo.notifications (user_id, meeting_id, type, message) VALUES (?, ?, 'THAY_DOI_LICH', ?)",
                pid, meeting_id, f'Cuộc họp "{title}" đã được thay đổi lịch',
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as err:
        return server_error(err)


@meetings_bp.route("/<int:meeting_id>", methods=["DELETE"])
@login_required()
def cancel_meeting(meeting_id):
    user_id = session["user_id"]
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT created_by, title FROM dbo.meetings WHERE id = ?", meeting_id)
        row = dict_row(cur)
        if not row:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy cuộc họp."}), 404
        if row["created_by"] != user_id:
            conn.close()
            return jsonify({"success": False, "message": "Bạn không có quyền hủy cuộc họp này."}), 403

        cur.execute("UPDATE dbo.meetings SET status = 'DA_HUY', updated_at = SYSDATETIME() WHERE id = ?", meeting_id)

        cur.execute("SELECT user_id FROM dbo.meeting_participants WHERE meeting_id = ?", meeting_id)
        for (pid,) in cur.fetchall():
            cur.execute(
                "INSERT INTO dbo.notifications (user_id, meeting_id, type, message) VALUES (?, ?, 'HUY_HOP', ?)",
                pid, meeting_id, f'Cuộc họp "{row["title"]}" đã bị hủy',
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Đã hủy cuộc họp."})
    except Exception as err:
        return server_error(err)


# =================================================================
# 4) PHẢN HỒI LỜI MỜI — xem danh sách / xác nhận / từ chối
# =================================================================
@meetings_bp.route("/invitations", methods=["GET"])
@login_required()
def list_invitations():
    status = request.args.get("status", "all")  # all | pending
    page = max(1, int(request.args.get("page", 1)))
    offset = (page - 1) * PAGE_SIZE
    user_id = session["user_id"]

    conditions = ["mp.user_id = ?", "m.status <> 'DA_HUY'"]
    params = [user_id]
    if status == "pending":
        conditions.append("mp.response = 'CHO_PHAN_HOI'")
    where_clause = "WHERE " + " AND ".join(conditions)

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT m.id, m.title, m.start_time, m.end_time, r.name AS room_name,
                   u.full_name AS organizer_name, mp.response
            FROM dbo.meeting_participants mp
            JOIN dbo.meetings m ON m.id = mp.meeting_id
            JOIN dbo.rooms r ON r.id = m.room_id
            JOIN dbo.users u ON u.id = m.created_by
            {where_clause}
            ORDER BY m.start_time
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            *params, offset, PAGE_SIZE,
        )
        rows = dict_rows(cur)
        for r in rows:
            r["start_time"] = r["start_time"].isoformat()
            r["end_time"] = r["end_time"].isoformat()

        cur.execute(
            f"""
            SELECT COUNT(*) FROM dbo.meeting_participants mp
            JOIN dbo.meetings m ON m.id = mp.meeting_id {where_clause}
            """,
            *params,
        )
        total = cur.fetchone()[0]
        conn.close()
        return jsonify({
            "success": True, "data": rows,
            "pagination": {"page": page, "pageSize": PAGE_SIZE, "total": total,
                            "totalPages": max(1, math.ceil(total / PAGE_SIZE))},
        })
    except Exception as err:
        return server_error(err)


@meetings_bp.route("/<int:meeting_id>/respond", methods=["PUT"])
@login_required()
def respond_invitation(meeting_id):
    body = request.get_json(force=True) or {}
    response = body.get("response")
    if response not in ("XAC_NHAN", "TU_CHOI"):
        return bad_request("Phản hồi không hợp lệ.")
    user_id = session["user_id"]

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.meeting_participants SET response = ? WHERE meeting_id = ? AND user_id = ?",
            response, meeting_id, user_id,
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy lời mời."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as err:
        return server_error(err)


# =================================================================
# THÔNG BÁO
# =================================================================
@notif_bp.route("", methods=["GET"])
@login_required()
def list_notifications():
    user_id = session["user_id"]
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT TOP 30 id, type, message, is_read, created_at
            FROM dbo.notifications WHERE user_id = ? ORDER BY created_at DESC
            """,
            user_id,
        )
        rows = dict_rows(cur)
        for r in rows:
            r["created_at"] = r["created_at"].isoformat()
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as err:
        return server_error(err)


@notif_bp.route("/<int:notif_id>/read", methods=["PUT"])
@login_required()
def mark_notification_read(notif_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
            notif_id, session["user_id"],
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as err:
        return server_error(err)
