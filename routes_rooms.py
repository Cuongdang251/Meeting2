"""
routes_rooms.py - Module QUẢN LÝ PHÒNG HỌP (WBS 2.5.2)
Thêm/sửa/xóa phòng, giám sát sử dụng phòng (lịch sử dùng, lịch đặt sắp tới,
thời gian trống).
"""
import math
from flask import Blueprint, request, jsonify

from db import get_connection, dict_rows
from auth_utils import login_required

rooms_bp = Blueprint("rooms", __name__, url_prefix="/api/rooms")

PAGE_SIZE = 8
ADMIN_STATUS_LABEL = {
    "DANG_HOAT_DONG": "Đang hoạt động",
    "BAO_TRI": "Bảo trì",
    "NGUNG_HOAT_DONG": "Ngừng hoạt động",
}
OCCUPANCY_LABEL = {"TRONG": "Đang trống", "DANG_HOP": "Đang họp"}


def bad_request(message):
    return jsonify({"success": False, "message": message}), 400


def server_error(err):
    print("ERROR:", err)
    return jsonify({"success": False, "message": "Lỗi máy chủ"}), 500


# =================================================================
# 1) DANH SÁCH / TÌM KIẾM / PHÂN TRANG PHÒNG HỌP
# =================================================================
@rooms_bp.route("", methods=["GET"])
def list_rooms():
    search = request.args.get("search", "")
    page = max(1, int(request.args.get("page", 1)))
    offset = (page - 1) * PAGE_SIZE

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.id, r.room_code, r.name, r.capacity, r.admin_status,
                   COALESCE(STUFF((
                       SELECT ', ' + e.name
                       FROM dbo.room_equipment re
                       JOIN dbo.equipment e ON e.id = re.equipment_id
                       WHERE re.room_id = r.id
                       ORDER BY e.name
                       FOR XML PATH('')
                   ), 1, 2, ''), '') AS equipment,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM dbo.meetings m
                        WHERE m.room_id = r.id AND m.status = 'DA_XAC_NHAN'
                          AND GETDATE() BETWEEN m.start_time AND m.end_time
                   ) THEN 'DANG_HOP' ELSE 'TRONG' END AS occupancy_status
            FROM dbo.rooms r
            WHERE r.is_deleted = 0 AND r.name LIKE ?
            ORDER BY r.id
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            f"%{search}%", offset, PAGE_SIZE,
        )
        rooms = dict_rows(cur)

        cur.execute(
            "SELECT COUNT(*) FROM dbo.rooms WHERE is_deleted = 0 AND name LIKE ?",
            f"%{search}%",
        )
        total = cur.fetchone()[0]
        conn.close()

        for r in rooms:
            r["admin_status_label"] = ADMIN_STATUS_LABEL.get(r["admin_status"], "")
            r["occupancy_label"] = OCCUPANCY_LABEL.get(r["occupancy_status"], "")

        return jsonify({
            "success": True, "data": rooms,
            "pagination": {
                "page": page, "pageSize": PAGE_SIZE, "total": total,
                "totalPages": max(1, math.ceil(total / PAGE_SIZE)),
            },
        })
    except Exception as err:
        return server_error(err)


# =================================================================
# 2) THÊM PHÒNG HỌP MỚI
# =================================================================
@rooms_bp.route("", methods=["POST"])
@login_required(roles=["QUAN_LY_PHONG", "ADMIN"])
def create_room():
    body = request.get_json(force=True) or {}
    room_code = (body.get("room_code") or "").strip()
    name = (body.get("name") or "").strip()
    capacity = body.get("capacity")
    equipment_ids = body.get("equipment_ids") or []
    admin_status = body.get("admin_status") or "DANG_HOAT_DONG"

    if not room_code or not name or not capacity:
        return bad_request("Vui lòng nhập đầy đủ Mã phòng, Tên phòng và Số chỗ ngồi.")
    try:
        capacity = int(capacity)
        if capacity <= 0:
            raise ValueError
    except ValueError:
        return bad_request("Số chỗ ngồi phải là số nguyên dương.")
    if admin_status not in ADMIN_STATUS_LABEL:
        return bad_request("Trạng thái phòng không hợp lệ.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM dbo.rooms WHERE room_code = ? AND is_deleted = 0", room_code)
        if cur.fetchone():
            conn.close()
            return bad_request(f'Mã phòng "{room_code}" đã tồn tại.')

        cur.execute(
            "INSERT INTO dbo.rooms (room_code, name, capacity, admin_status) "
            "OUTPUT INSERTED.id VALUES (?, ?, ?, ?)",
            room_code, name, capacity, admin_status,
        )
        new_id = cur.fetchone()[0]
        for eq_id in equipment_ids:
            cur.execute(
                "INSERT INTO dbo.room_equipment (room_id, equipment_id) VALUES (?, ?)",
                new_id, eq_id,
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "data": {"id": new_id}}), 201
    except Exception as err:
        return server_error(err)


# =================================================================
# 3) CHỈNH SỬA THÔNG TIN PHÒNG HỌP
# =================================================================
@rooms_bp.route("/<int:room_id>", methods=["PUT"])
@login_required(roles=["QUAN_LY_PHONG", "ADMIN"])
def update_room(room_id):
    body = request.get_json(force=True) or {}
    name = (body.get("name") or "").strip()
    capacity = body.get("capacity")
    equipment_ids = body.get("equipment_ids") or []
    admin_status = body.get("admin_status")

    if not name or not capacity:
        return bad_request("Vui lòng nhập đầy đủ Tên phòng và Số chỗ ngồi.")
    try:
        capacity = int(capacity)
        if capacity <= 0:
            raise ValueError
    except ValueError:
        return bad_request("Số chỗ ngồi phải là số nguyên dương.")
    if admin_status and admin_status not in ADMIN_STATUS_LABEL:
        return bad_request("Trạng thái phòng không hợp lệ.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE dbo.rooms
               SET name = ?, capacity = ?, admin_status = COALESCE(?, admin_status),
                   updated_at = SYSDATETIME()
             WHERE id = ? AND is_deleted = 0
            """,
            name, capacity, admin_status, room_id,
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy phòng họp."}), 404

        cur.execute("DELETE FROM dbo.room_equipment WHERE room_id = ?", room_id)
        for eq_id in equipment_ids:
            cur.execute(
                "INSERT INTO dbo.room_equipment (room_id, equipment_id) VALUES (?, ?)",
                room_id, eq_id,
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as err:
        return server_error(err)


# =================================================================
# 4) XÓA PHÒNG HỌP
# =================================================================
@rooms_bp.route("/<int:room_id>", methods=["DELETE"])
@login_required(roles=["QUAN_LY_PHONG", "ADMIN"])
def delete_room(room_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM dbo.meetings WHERE room_id = ? "
            "AND start_time > GETDATE() AND status = 'DA_XAC_NHAN'",
            room_id,
        )
        if cur.fetchone()[0] > 0:
            conn.close()
            return bad_request(
                "Không thể xóa: phòng đang có lịch họp sắp tới. Vui lòng hủy các lịch họp trước."
            )
        cur.execute(
            "UPDATE dbo.rooms SET is_deleted = 1, updated_at = SYSDATETIME() WHERE id = ?",
            room_id,
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy phòng họp."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Đã xóa phòng họp."})
    except Exception as err:
        return server_error(err)


# =================================================================
# 5) LỊCH SỬ SỬ DỤNG PHÒNG
# =================================================================
@rooms_bp.route("/usage-history", methods=["GET"])
def usage_history():
    room_id = request.args.get("room_id", "all")
    page = max(1, int(request.args.get("page", 1)))
    offset = (page - 1) * PAGE_SIZE

    conditions = ["m.end_time < GETDATE()", "m.status <> 'DA_HUY'"]
    params = []
    if room_id and room_id != "all":
        conditions.append("m.room_id = ?")
        params.append(room_id)
    where_clause = "WHERE " + " AND ".join(conditions)

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT r.name AS room_name, m.title,
                   FORMAT(m.start_time, 'dd/MM/yyyy') AS ngay,
                   FORMAT(m.start_time, 'HH:mm') + ' - ' + FORMAT(m.end_time, 'HH:mm') AS gio,
                   u.code AS nguoi_tao
            FROM dbo.meetings m
            JOIN dbo.rooms r ON r.id = m.room_id
            LEFT JOIN dbo.users u ON u.id = m.created_by
            {where_clause}
            ORDER BY m.start_time DESC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            *params, offset, PAGE_SIZE,
        )
        rows = dict_rows(cur)
        cur.execute(f"SELECT COUNT(*) FROM dbo.meetings m {where_clause}", *params)
        total = cur.fetchone()[0]
        conn.close()
        return jsonify({
            "success": True, "data": rows,
            "pagination": {"page": page, "pageSize": PAGE_SIZE, "total": total,
                            "totalPages": max(1, math.ceil(total / PAGE_SIZE))},
        })
    except Exception as err:
        return server_error(err)


# =================================================================
# 6) LỊCH SỬ ĐẶT PHÒNG SẮP TỚI
# =================================================================
@rooms_bp.route("/booking-history", methods=["GET"])
def booking_history():
    room_id = request.args.get("room_id", "all")
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    page = max(1, int(request.args.get("page", 1)))
    offset = (page - 1) * PAGE_SIZE

    conditions = ["m.start_time >= GETDATE()", "m.status = 'DA_XAC_NHAN'"]
    params = []
    if room_id and room_id != "all":
        conditions.append("m.room_id = ?")
        params.append(room_id)
    if date_from:
        conditions.append("CAST(m.start_time AS DATE) >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("CAST(m.start_time AS DATE) <= ?")
        params.append(date_to)
    where_clause = "WHERE " + " AND ".join(conditions)

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT r.name AS room_name, m.title,
                   FORMAT(m.start_time, 'dd/MM/yyyy') AS ngay,
                   FORMAT(m.start_time, 'HH:mm') + ' - ' + FORMAT(m.end_time, 'HH:mm') AS gio,
                   u.code AS nguoi_tao
            FROM dbo.meetings m
            JOIN dbo.rooms r ON r.id = m.room_id
            LEFT JOIN dbo.users u ON u.id = m.created_by
            {where_clause}
            ORDER BY m.start_time ASC
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            *params, offset, PAGE_SIZE,
        )
        rows = dict_rows(cur)
        cur.execute(f"SELECT COUNT(*) FROM dbo.meetings m {where_clause}", *params)
        total = cur.fetchone()[0]
        conn.close()
        return jsonify({
            "success": True, "data": rows,
            "pagination": {"page": page, "pageSize": PAGE_SIZE, "total": total,
                            "totalPages": max(1, math.ceil(total / PAGE_SIZE))},
        })
    except Exception as err:
        return server_error(err)


# =================================================================
# 7) THỜI GIAN TRỐNG CỦA CÁC PHÒNG (timeline theo ngày)
# =================================================================
@rooms_bp.route("/availability", methods=["GET"])
def room_availability():
    date_str = request.args.get("date")
    if not date_str:
        return bad_request("Thiếu tham số ngày (date).")

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM dbo.rooms WHERE is_deleted = 0 ORDER BY id")
        rooms = dict_rows(cur)

        cur.execute(
            """
            SELECT room_id, title, start_time, end_time
              FROM dbo.meetings
             WHERE CAST(start_time AS DATE) = CAST(? AS DATE)
               AND status <> 'DA_HUY'
             ORDER BY start_time
            """,
            date_str,
        )
        meetings = dict_rows(cur)
        conn.close()

        result = []
        for room in rooms:
            bookings = []
            for m in meetings:
                if m["room_id"] == room["id"]:
                    start_dt = m["start_time"]
                    end_dt = m["end_time"]
                    bookings.append({
                        "label": f'{start_dt.strftime("%H:%M")} - {end_dt.strftime("%H:%M")}',
                        "start_ts": int(start_dt.timestamp()),
                        "end_ts": int(end_dt.timestamp()),
                    })
            result.append({"room_id": room["id"], "room_name": room["name"], "bookings": bookings})

        return jsonify({"success": True, "date": date_str, "data": result})
    except Exception as err:
        return server_error(err)


# =================================================================
# DANH SÁCH PHÒNG CHO DROPDOWN LỌC / CHỌN PHÒNG KHI TẠO CUỘC HỌP
# =================================================================
@rooms_bp.route("/options", methods=["GET"])
def room_options():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, capacity FROM dbo.rooms "
            "WHERE is_deleted = 0 AND admin_status = 'DANG_HOAT_DONG' ORDER BY name"
        )
        rows = dict_rows(cur)
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as err:
        return server_error(err)


@rooms_bp.route("/codes/available", methods=["GET"])
def available_room_codes():
    import os
    pool_size = int(os.getenv("ROOM_CODE_POOL_SIZE", 20))
    candidate_codes = [f"PH{str(i).zfill(3)}" for i in range(1, pool_size + 1)]
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT room_code FROM dbo.rooms WHERE is_deleted = 0")
        used_codes = {row[0] for row in cur.fetchall()}
        conn.close()
        return jsonify({"success": True, "data": [c for c in candidate_codes if c not in used_codes]})
    except Exception as err:
        return server_error(err)


@rooms_bp.route("/names/suggestions", methods=["GET"])
def room_name_suggestions():
    suggestions = [
        "Phòng họp A", "Phòng họp B", "Phòng họp C", "Phòng họp D",
        "Phòng Sáng Tạo", "Phòng Công Nghệ", "Phòng Hội Nghị", "Phòng Đa Năng",
    ]
    return jsonify({"success": True, "data": suggestions})


@rooms_bp.route("/<int:room_id>/equipment", methods=["GET"])
def room_equipment(room_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT equipment_id FROM dbo.room_equipment WHERE room_id = ?", room_id)
        ids = [row[0] for row in cur.fetchall()]
        conn.close()
        return jsonify({"success": True, "data": ids})
    except Exception as err:
        return server_error(err)


@rooms_bp.route("/<int:room_id>", methods=["GET"])
def get_room(room_id):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, room_code, name, capacity, admin_status FROM dbo.rooms "
            "WHERE id = ? AND is_deleted = 0",
            room_id,
        )
        rows = dict_rows(cur)
        conn.close()
        if not rows:
            return jsonify({"success": False, "message": "Không tìm thấy phòng họp."}), 404
        return jsonify({"success": True, "data": rows[0]})
    except Exception as err:
        return server_error(err)


# =================================================================
# DANH MỤC THIẾT BỊ (blueprint riêng /api/equipment)
# =================================================================
equipment_bp = Blueprint("equipment", __name__, url_prefix="/api/equipment")


@equipment_bp.route("/options", methods=["GET"])
def equipment_options():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM dbo.equipment ORDER BY name")
        rows = dict_rows(cur)
        conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as err:
        return server_error(err)
