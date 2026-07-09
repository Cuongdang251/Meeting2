"""
============================================================
HỆ THỐNG ĐẶT LỊCH HỌP - CÔNG TY XYZ
Backend: Python (Flask) + Microsoft SQL Server (pyodbc)
============================================================
Ứng dụng gồm 3 module độc lập (mỗi module 1 file blueprint riêng,
không gộp chung logic):
  - routes_rooms.py     -> Module QUẢN LÝ PHÒNG HỌP   (WBS 2.5.2)
  - routes_auth.py       -> Xác thực tài khoản (đăng nhập/đăng xuất/đổi mật khẩu)
  - routes_meetings.py   -> Module NHÂN VIÊN           (WBS 2.5.1)
  - routes_admin.py      -> Module ADMIN                (WBS 2.5.3)
============================================================
"""
import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from routes_rooms import rooms_bp, equipment_bp
from routes_auth import auth_bp
from routes_meetings import meetings_bp, notif_bp
from routes_admin import admin_bp

app = Flask(__name__, static_folder="public", static_url_path="")
app.secret_key = os.getenv("SECRET_KEY", "doi-chuoi-bi-mat-nay-truoc-khi-trien-khai-that")

# Cho phép gọi API kèm cookie session từ frontend (same-origin mặc định là đủ,
# cấu hình CORS này hữu ích khi chạy frontend/backend ở cổng khác nhau lúc dev)
CORS(app, supports_credentials=True)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

# Đăng ký các blueprint (mỗi module 1 file riêng biệt)
app.register_blueprint(rooms_bp)      # /api/rooms/...      - Quản lý phòng họp
app.register_blueprint(equipment_bp)  # /api/equipment/...  - Danh mục thiết bị
app.register_blueprint(auth_bp)       # /api/auth/...       - Xác thực tài khoản
app.register_blueprint(meetings_bp)   # /api/meetings/...   - Module Nhân viên
app.register_blueprint(notif_bp)      # /api/notifications/...
app.register_blueprint(admin_bp)      # /api/admin/...      - Module Admin


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
