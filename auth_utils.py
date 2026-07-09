"""
auth_utils.py - Decorator kiểm tra đăng nhập / phân quyền theo role,
dùng chung cho các blueprint (rooms, meetings, admin).
Xác thực bằng session cookie do Flask quản lý (server-side session).
"""
from functools import wraps
from flask import session, jsonify


def get_current_user_id():
    return session.get("user_id")


def get_current_user_role():
    return session.get("role")


def login_required(roles=None):
    """
    Decorator: yêu cầu đăng nhập. Nếu truyền `roles` (list) thì chỉ các
    role trong danh sách mới được phép truy cập (403 nếu sai role).
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user_id = session.get("user_id")
            if not user_id:
                return jsonify({"success": False, "message": "Vui lòng đăng nhập."}), 401
            if roles and session.get("role") not in roles:
                return jsonify({"success": False, "message": "Bạn không có quyền thực hiện thao tác này."}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
