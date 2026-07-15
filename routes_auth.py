"""
routes_auth.py - Chức năng "Xác thực tài khoản" (WBS 2.5.1 - Chức năng chung)
  - Đăng nhập / Đăng xuất
  - Đổi mật khẩu
  - Cập nhật hồ sơ cá nhân
Sử dụng Flask session (cookie phía server) để lưu trạng thái đăng nhập.
"""
from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

from db import get_connection, dict_row
from auth_utils import login_required

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def bad_request(message):
    return jsonify({"success": False, "message": message}), 400


def server_error(err):
    print("ERROR:", err)
    return jsonify({"success": False, "message": "Lỗi máy chủ"}), 500


def public_user(row):
    return {
        "id": row["id"], "code": row["code"], "full_name": row["full_name"],
        "email": row["email"], "role": row["role"],
    }


# =================================================================
# ĐĂNG NHẬP — POST /api/auth/login  { code, password }
# =================================================================
@auth_bp.route("/login", methods=["POST"])
def login():
    body = request.get_json(force=True) or {}
    code = (body.get("code") or "").strip()
    password = body.get("password") or ""
    if not code or not password:
        return bad_request("Vui lòng nhập Tên tài khoản và Mật khẩu.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, code, full_name, email, password_hash, role, is_locked "
            "FROM dbo.users WHERE code = ?",
            code,
        )
        user = dict_row(cur)
        conn.close()

        if not user or not check_password_hash(user["password_hash"], password):
            return bad_request("Tên tài khoản hoặc mật khẩu không đúng.")
        if user["is_locked"]:
            return bad_request("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.")

        session["user_id"] = user["id"]
        session["role"] = user["role"]
        session["code"] = user["code"]

        return jsonify({"success": True, "data": public_user(user)})
    except Exception as err:
        return server_error(err)


# =================================================================
# ĐĂNG XUẤT — POST /api/auth/logout
# =================================================================
@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


# =================================================================
# THÔNG TIN NGƯỜI DÙNG ĐANG ĐĂNG NHẬP — GET /api/auth/me
# =================================================================
@auth_bp.route("/me", methods=["GET"])
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "message": "Chưa đăng nhập."}), 401
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, code, full_name, email, role FROM dbo.users WHERE id = ?",
            user_id,
        )
        user = dict_row(cur)
        conn.close()
        if not user:
            session.clear()
            return jsonify({"success": False, "message": "Chưa đăng nhập."}), 401
        return jsonify({"success": True, "data": user})
    except Exception as err:
        return server_error(err)


# =================================================================
# ĐỔI MẬT KHẨU — PUT /api/auth/change-password { old_password, new_password }
# =================================================================
@auth_bp.route("/change-password", methods=["PUT"])
@login_required()
def change_password():
    body = request.get_json(force=True) or {}
    old_password = body.get("old_password") or ""
    new_password = body.get("new_password") or ""
    if not old_password or not new_password:
        return bad_request("Vui lòng nhập mật khẩu cũ và mật khẩu mới.")
    if len(new_password) < 6:
        return bad_request("Mật khẩu mới phải có ít nhất 6 ký tự.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT password_hash FROM dbo.users WHERE id = ?", session["user_id"])
        row = dict_row(cur)
        if not row or not check_password_hash(row["password_hash"], old_password):
            conn.close()
            return bad_request("Mật khẩu cũ không đúng.")

        cur.execute(
            "UPDATE dbo.users SET password_hash = ?, updated_at = SYSDATETIME() WHERE id = ?",
            generate_password_hash(new_password), session["user_id"],
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Đổi mật khẩu thành công."})
    except Exception as err:
        return server_error(err)


# =================================================================
# CẬP NHẬT HỒ SƠ CÁ NHÂN — PUT /api/auth/profile { full_name, email }
# =================================================================
@auth_bp.route("/profile", methods=["PUT"])
@login_required()
def update_profile():
    body = request.get_json(force=True) or {}
    full_name = (body.get("full_name") or "").strip()
    email = (body.get("email") or "").strip()
    if not full_name:
        return bad_request("Vui lòng nhập họ tên.")

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE dbo.users SET full_name = ?, email = ?, updated_at = SYSDATETIME() WHERE id = ?",
            full_name, email, session["user_id"],
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Cập nhật hồ sơ thành công."})
    except Exception as err:
        return server_error(err)
