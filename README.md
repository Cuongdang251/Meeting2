# Hệ Thống Đặt Lịch Họp — Công Ty XYZ
### Python (Flask) + Microsoft SQL Server — 3 module: Nhân viên / Quản lý phòng họp / Admin

Dự án gồm **3 module độc lập**, mỗi module là **1 file blueprint riêng** ở
backend (không gộp chung logic), dùng chung 1 CSDL SQL Server:

| Module | WBS | File backend | File frontend |
|---|---|---|---|
| Xác thực tài khoản (dùng chung) | 2.5.1 - Chức năng chung | `routes_auth.py` | `common.js` |
| **Nhân viên** | 2.5.1 | `routes_meetings.py` | `employee.js` |
| **Quản lý phòng họp** | 2.5.2 | `routes_rooms.py` | `app.js` |
| **Admin** | 2.5.3 | `routes_admin.py` | `admin.js` |

## Chức năng theo từng module

### 1) Nhân viên (`routes_meetings.py` / `employee.js`)
- Đăng nhập / Đăng xuất / Đổi mật khẩu / Cập nhật hồ sơ cá nhân (chung, `routes_auth.py`)
- Xem lịch họp cá nhân theo **Ngày / Tuần / Tháng**
- Lọc lịch họp theo **người tổ chức**, theo **phòng họp**
- **Tạo cuộc họp mới**: chọn phòng, thời gian, mời người tham gia — hệ thống
  **tự động kiểm tra trùng phòng** và **kiểm tra người tham gia có đang bận**
  trước khi cho tạo
- **Quản lý cuộc họp đã tạo**: xem danh sách, điều chỉnh (đổi giờ/phòng/người
  mời — có kiểm tra trùng lại), hủy cuộc họp (tự động thông báo cho người được mời)
- **Phản hồi lời mời**: xem danh sách lời mời, xác nhận / từ chối tham gia
- Thông báo (mời họp / hủy họp / đổi lịch) lưu trong bảng `notifications`

### 2) Quản lý phòng họp (`routes_rooms.py` / `app.js`)
- Thêm / sửa / xóa phòng họp (mã phòng, tên phòng, số chỗ, thiết bị multi-select, trạng thái)
- Giám sát sử dụng phòng: lịch sử đã dùng, lịch đặt sắp tới (lọc phòng + khoảng
  ngày), thời gian trống theo ngày (timeline 08:00–18:00)
- Chỉ tài khoản vai trò **Quản lý phòng họp** hoặc **Admin** mới được thêm/sửa/xóa
  phòng; các vai trò khác chỉ xem được danh sách

### 3) Admin (`routes_admin.py` / `admin.js`)
- **Quản lý tài khoản**: tạo tài khoản, khóa/mở khóa tài khoản, cấp quyền (đổi vai trò)
- **Dashboard & thống kê**: số cuộc họp theo từng tháng (biểu đồ cột), phòng
  sử dụng nhiều nhất, người tổ chức nhiều cuộc họp nhất, hiệu suất sử dụng
  từng phòng (số cuộc họp + tổng giờ sử dụng)

## Giao diện được bổ sung thêm so với các mockup Figma ban đầu
Các mockup bạn gửi ban đầu chỉ vẽ chi tiết cho module **Quản lý phòng họp**
(7 màn hình). Để module **Nhân viên** và **Admin** hoạt động đầy đủ theo đúng
WBS/Use Case, mình đã tự thiết kế thêm các màn hình sau (giữ đúng phong cách:
navbar xanh, card trắng bo góc, bảng viền, modal xanh — đồng bộ với bản gốc):

- **Đăng nhập** (dùng chung cho cả 3 module)
- **Lịch họp cá nhân** (Ngày/Tuần/Tháng + bộ lọc người tổ chức/phòng)
- **Tạo cuộc họp mới** (kèm cảnh báo trùng phòng / người tham gia bận)
- **Cuộc họp đã tạo** (danh sách + Sửa/Hủy)
- **Lời mời họp** (danh sách + Xác nhận/Từ chối)
- **Hồ sơ cá nhân / Đổi mật khẩu**
- **Quản lý tài khoản** (Admin) — bảng danh sách + modal Tạo tài khoản + khóa/mở + đổi vai trò
- **Dashboard & Thống kê** (Admin) — thẻ số liệu nổi bật + biểu đồ cột theo tháng + bảng hiệu suất phòng

## Cấu trúc thư mục
```
meeting-room-python/
├── app.py                # Khởi tạo Flask, đăng ký 4 blueprint
├── db.py                  # Kết nối SQL Server (pyodbc) dùng chung
├── auth_utils.py           # Decorator kiểm tra đăng nhập / phân quyền
├── routes_auth.py          # Đăng nhập, đăng xuất, đổi mật khẩu, hồ sơ
├── routes_meetings.py      # Module NHÂN VIÊN (lịch họp, tạo/sửa/hủy, lời mời)
├── routes_rooms.py         # Module QUẢN LÝ PHÒNG HỌP
├── routes_admin.py         # Module ADMIN (tài khoản, dashboard)
├── requirements.txt
├── .env.example
├── db/
│   └── schema.sql            # Script T-SQL đầy đủ (chạy trong SSMS)
└── public/
    ├── index.html             # Giao diện gộp cả 3 module (điều hướng bằng tab)
    ├── style.css
    ├── common.js               # Điều hướng module + phiên đăng nhập (dùng chung)
    ├── app.js                  # Logic module Quản lý phòng họp
    ├── employee.js              # Logic module Nhân viên
    └── admin.js                 # Logic module Admin
```

## Tài khoản demo (sau khi chạy `schema.sql`)
Mật khẩu cho **tất cả** tài khoản demo: **`123456`**

| Mã NV | Vai trò |
|---|---|
| NV_A, NV_B | Nhân viên |
| QL_C | Quản lý phòng họp |
| ADMIN | Admin |

## 1. Cài đặt SQL Server & tạo CSDL bằng SSMS
1. Cài **SQL Server** (bản Express là đủ) và **SQL Server Management Studio (SSMS)**.
2. Mở SSMS, kết nối instance (VD: `localhost\SQLEXPRESS`).
3. Mở file `db/schema.sql`, nhấn **Execute (F5)** — script tự tạo database
   `xyz_meeting_room`, đầy đủ bảng (`users`, `rooms`, `equipment`,
   `room_equipment`, `meetings`, `meeting_participants`, `notifications`) và
   dữ liệu mẫu (đã bao gồm mật khẩu đã băm sẵn cho các tài khoản demo).

## 2. Cài driver ODBC (bắt buộc để Python kết nối SQL Server)
**Windows:** tải **"ODBC Driver 18 for SQL Server"**:
https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server

**macOS:**
```bash
brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release
HOMEBREW_ACCEPT_EULA=Y brew install msodbcsql18
```

**Ubuntu/Debian:**
```bash
curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt-get update && sudo ACCEPT_EULA=Y apt-get install -y msodbcsql18
```

## 3. Kết nối code Python với SSMS
```bash
cp .env.example .env
# mở .env, chỉnh SQL_SERVER / SQL_DATABASE / SQL_USERNAME / SQL_PASSWORD
```
Chuỗi kết nối được `db.py` tự dựng từ các biến trên (SQL Authentication hoặc
Windows Authentication qua `SQL_AUTH_MODE`). Xem chi tiết trong file `.env.example`.

## 4. Cài đặt & chạy
```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env             # rồi chỉnh thông tin kết nối
python app.py
```
Truy cập **http://localhost:3000**, đăng nhập bằng 1 trong các tài khoản demo ở trên.

## API Endpoints
| Module | Method | Endpoint | Chức năng |
|---|---|---|---|
| Auth | POST | `/api/auth/login` | Đăng nhập |
| Auth | POST | `/api/auth/logout` | Đăng xuất |
| Auth | GET | `/api/auth/me` | Thông tin phiên đăng nhập |
| Auth | PUT | `/api/auth/change-password` | Đổi mật khẩu |
| Auth | PUT | `/api/auth/profile` | Cập nhật hồ sơ |
| Nhân viên | GET | `/api/meetings?view=&date=&organizer_id=&room_id=` | Xem/lọc lịch họp |
| Nhân viên | POST | `/api/meetings` | Tạo cuộc họp (tự kiểm tra trùng lịch) |
| Nhân viên | GET | `/api/meetings/created` | Cuộc họp đã tạo |
| Nhân viên | PUT/DELETE | `/api/meetings/<id>` | Sửa / Hủy cuộc họp |
| Nhân viên | GET | `/api/meetings/invitations` | Danh sách lời mời |
| Nhân viên | PUT | `/api/meetings/<id>/respond` | Xác nhận / Từ chối |
| Nhân viên | GET | `/api/notifications` | Danh sách thông báo |
| Phòng họp | GET/POST | `/api/rooms` | Danh sách / Thêm phòng |
| Phòng họp | PUT/DELETE | `/api/rooms/<id>` | Sửa / Xóa phòng |
| Phòng họp | GET | `/api/rooms/usage-history` `/booking-history` `/availability` | Giám sát sử dụng phòng |
| Admin | GET/POST | `/api/admin/users` | Danh sách / Tạo tài khoản |
| Admin | PUT | `/api/admin/users/<id>/lock` | Khóa / Mở khóa |
| Admin | PUT | `/api/admin/users/<id>/role` | Cấp quyền |
| Admin | GET | `/api/admin/dashboard/*` | Thống kê |

## Ghi chú kỹ thuật
- Xác thực bằng **session cookie phía server** (Flask session), không dùng JWT
  để đơn giản hóa vì frontend/backend cùng origin.
- Mật khẩu được băm bằng `werkzeug.security` (thuật toán scrypt), không lưu plaintext.
- Kiểm tra trùng lịch (phòng và người tham gia) thực hiện ở tầng backend
  (`routes_meetings.py`) bằng điều kiện chồng lấp khoảng thời gian
  `start_time < end_time_khac AND end_time > start_time_khac`.
- Đổi sang MS SQL Server (từ PostgreSQL ở bản trước): `SERIAL` → `IDENTITY(1,1)`,
  `NOW()` → `GETDATE()`/`SYSDATETIME()`, `TO_CHAR` → `FORMAT`, `ILIKE` → `LIKE`,
  `LIMIT/OFFSET` → `OFFSET ... FETCH NEXT ... ROWS ONLY`, `RETURNING` → `OUTPUT INSERTED`.

## Đưa code lên GitHub
Mình không có quyền truy cập tài khoản GitHub của bạn nên không thể tự đẩy code
lên hộ. Tạo repo trống trên https://github.com/new rồi chạy:
```bash
git init
git add -A
git commit -m "He thong dat lich hop XYZ - 3 module Python/Flask + SQL Server"
git branch -M main
git remote add origin https://github.com/<ten-tai-khoan>/<ten-repo>.git
git push -u origin main
```
File `.env` (chứa mật khẩu CSDL) đã được loại trừ qua `.gitignore` — chỉ
`.env.example` được commit.
