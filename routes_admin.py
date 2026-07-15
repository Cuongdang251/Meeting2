"""
routes_admin.py - Module ADMIN (WBS 2.5.3)
  - Quản lý tài khoản: tạo tài khoản, mở/khóa tài khoản, cấp quyền người dùng
  - Dashboard & thống kê: số cuộc họp theo tháng, hiệu suất sử dụng phòng
    (phòng dùng nhiều nhất, người tổ chức nhiều cuộc họp nhất)
Toàn bộ endpoint yêu cầu role = ADMIN.
"""
import math
from datetime import datetime

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash

from db import get_connection, dict_rows, dict_row
from auth_utils import login_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

PAGE_SIZE = 8
ROLE_LABEL = {"NHAN_VIEN": "Nhân viên", "QUAN_LY_PHONG": "Quản lý phòng họp", "ADMIN": "Admin"}


def bad_request(message):
    return jsonify({"success": False, "message": message}), 400


def server_error(err):
    print("ERROR:", err)
    return jsonify({"success": False, "message": "Lỗi máy chủ"}), 500


# =================================================================
# 1) QUẢN LÝ TÀI KHOẢN — danh sách / tạo / khóa-mở / phân quyền
# =================================================================
@admin_bp.route("/users", methods=["GET"])
@login_required(roles=["ADMIN"])
def list_users():
    search = request.args.get("search", "")
    page = max(1, int(request.args.get("page", 1)))
    offset = (page - 1) * PAGE_SIZE

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, code, full_name, email, role, is_locked, created_at
            FROM dbo.users
            WHERE full_name LIKE ? OR code LIKE ?
            ORDER BY id
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            f"%{search}%", f"%{search}%", offset, PAGE_SIZE,
        )
        rows = dict_rows(cur)
        for r in rows:
            r["role_label"] = ROLE_LABEL.get(r["role"], r["role"])
            r["created_at"] = r["created_at"].isoformat()

        cur.execute(
            "SELECT COUNT(*) FROM dbo.users WHERE full_name LIKE ? OR code LIKE ?",
            f"%{search}%", f"%{search}%",
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


@admin_bp.route("/users", methods=["POST"])
@login_required(roles=["ADMIN"])
def create_user():
    body = request.get_json(force=True) or {}
    code = (body.get("code") or "").strip()
    full_name = (body.get("full_name") or "").strip()
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    role = body.get("role") or "NHAN_VIEN"

    if not code or not full_name or not password:
        return bad_request("Vui lòng nhập đầy đủ Tên tài khoản, Họ tên và Mật khẩu.")
    if len(password) < 6:
        return bad_request("Mật khẩu phải có ít nhất 6 ký tự.")
    if role not in ROLE_LABEL:
        return bad_request("Vai trò không hợp lệ.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM dbo.users WHERE code = ?", code)
        if cur.fetchone():
            conn.close()
            return bad_request(f'Tên tài khoản "{code}" đã tồn tại.')

        cur.execute(
            "INSERT INTO dbo.users (code, full_name, email, password_hash, role) "
            "OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?)",
            code, full_name, email, generate_password_hash(password), role,
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return jsonify({"success": True, "data": {"id": new_id}}), 201
    except Exception as err:
        return server_error(err)


@admin_bp.route("/users/<int:user_id>/lock", methods=["PUT"])
@login_required(roles=["ADMIN"])
def toggle_lock_user(user_id):
    body = request.get_json(force=True) or {}
    locked = bool(body.get("locked"))
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.users SET is_locked = ?, updated_at = SYSDATETIME() WHERE id = ?",
            1 if locked else 0, user_id,
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy người dùng."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Đã khóa tài khoản." if locked else "Đã mở khóa tài khoản."})
    except Exception as err:
        return server_error(err)


@admin_bp.route("/users/<int:user_id>/role", methods=["PUT"])
@login_required(roles=["ADMIN"])
def change_role(user_id):
    body = request.get_json(force=True) or {}
    role = body.get("role")
    if role not in ROLE_LABEL:
        return bad_request("Vai trò không hợp lệ.")
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.users SET role = ?, updated_at = SYSDATETIME() WHERE id = ?",
            role, user_id,
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "message": "Không tìm thấy người dùng."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Đã cập nhật quyền người dùng."})
    except Exception as err:
        return server_error(err)


# =================================================================
# 2) DASHBOARD & THỐNG KÊ
# =================================================================
@admin_bp.route("/dashboard/meetings-by-month", methods=["GET"])
@login_required(roles=["ADMIN"])
def meetings_by_month():
    year = int(request.args.get("year", datetime.now().year))
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT MONTH(start_time) AS thang, COUNT(*) AS so_luong
            FROM dbo.meetings
            WHERE YEAR(start_time) = ? AND status <> 'DA_HUY'
            GROUP BY MONTH(start_time)
            ORDER BY thang
            """,
            year,
        )
        rows = {r["thang"]: r["so_luong"] for r in dict_rows(cur)}
        conn.close()
        data = [{"thang": m, "so_luong": rows.get(m, 0)} for m in range(1, 13)]
        return jsonify({"success": True, "year": year, "data": data})
    except Exception as err:
        return server_error(err)


@admin_bp.route("/dashboard/room-usage", methods=["GET"])
@login_required(roles=["ADMIN"])
def room_usage():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT r.id, r.name,
                   COUNT(m.id) AS so_cuoc_hop,
                   COALESCE(SUM(DATEDIFF(MINUTE, m.start_time, m.end_time)), 0) AS tong_phut
            FROM dbo.rooms r
            LEFT JOIN dbo.meetings m ON m.room_id = r.id AND m.status <> 'DA_HUY'
            WHERE r.is_deleted = 0
            GROUP BY r.id, r.name
            ORDER BY so_cuoc_hop DESC
            """
        )
        rows = dict_rows(cur)
        conn.close()
        for r in rows:
            r["tong_gio"] = round(r["tong_phut"] / 60, 1)
        return jsonify({"success": True, "data": rows})
    except Exception as err:
        return server_error(err)


@admin_bp.route("/dashboard/top-room", methods=["GET"])
@login_required(roles=["ADMIN"])
def top_room():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT TOP 1 r.name, COUNT(m.id) AS so_cuoc_hop
            FROM dbo.rooms r JOIN dbo.meetings m ON m.room_id = r.id AND m.status <> 'DA_HUY'
            WHERE r.is_deleted = 0
            GROUP BY r.name
            ORDER BY so_cuoc_hop DESC
            """
        )
        row = dict_row(cur)
        conn.close()
        return jsonify({"success": True, "data": row})
    except Exception as err:
        return server_error(err)


@admin_bp.route("/dashboard/top-organizer", methods=["GET"])
@login_required(roles=["ADMIN"])
def top_organizer():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT TOP 1 u.full_name, u.code, COUNT(m.id) AS so_cuoc_hop
            FROM dbo.users u JOIN dbo.meetings m ON m.created_by = u.id AND m.status <> 'DA_HUY'
            GROUP BY u.full_name, u.code
            ORDER BY so_cuoc_hop DESC
            """
        )
        row = dict_row(cur)
        conn.close()
        return jsonify({"success": True, "data": row})
    except Exception as err:
        return server_error(err)
