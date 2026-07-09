-- =========================================================
-- SCHEMA: HE THONG DAT LICH HOP - CONG TY XYZ
-- CSDL: MICROSOFT SQL SERVER (chay trong SSMS)
-- Gom 3 module: Quan ly phong hop | Nhan vien | Admin
-- =========================================================

IF DB_ID('xyz_meeting_room') IS NULL
BEGIN
    CREATE DATABASE xyz_meeting_room;
END
GO

USE xyz_meeting_room;
GO

IF OBJECT_ID('dbo.notifications', 'U') IS NOT NULL DROP TABLE dbo.notifications;
IF OBJECT_ID('dbo.meeting_participants', 'U') IS NOT NULL DROP TABLE dbo.meeting_participants;
IF OBJECT_ID('dbo.meetings', 'U') IS NOT NULL DROP TABLE dbo.meetings;
IF OBJECT_ID('dbo.room_equipment', 'U') IS NOT NULL DROP TABLE dbo.room_equipment;
IF OBJECT_ID('dbo.equipment', 'U') IS NOT NULL DROP TABLE dbo.equipment;
IF OBJECT_ID('dbo.rooms', 'U') IS NOT NULL DROP TABLE dbo.rooms;
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;
GO

-- ---------------------------------------------------------------
-- NGUOI DUNG (dung chung cho ca 3 module: Nhan vien / Quan ly phong / Admin)
--   password_hash : mat khau da bam (werkzeug.security, thuat toan scrypt)
--   is_locked     : Admin khoa tai khoan -> khong the dang nhap
--   role          : NHAN_VIEN | QUAN_LY_PHONG | ADMIN  (Admin co the doi - phan quyen)
-- ---------------------------------------------------------------
CREATE TABLE dbo.users (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    code           VARCHAR(20)   NOT NULL UNIQUE,
    full_name      NVARCHAR(100) NOT NULL,
    email          VARCHAR(150) UNIQUE,
    password_hash  NVARCHAR(255) NOT NULL,
    role           VARCHAR(20)   NOT NULL DEFAULT 'NHAN_VIEN',
    is_locked      BIT           NOT NULL DEFAULT 0,
    created_at     DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    updated_at     DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

-- ---------------------------------------------------------------
-- PHONG HOP
-- ---------------------------------------------------------------
CREATE TABLE dbo.rooms (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    room_code     VARCHAR(20)   NOT NULL UNIQUE,
    name          NVARCHAR(150) NOT NULL,
    capacity      INT           NOT NULL CHECK (capacity > 0),
    admin_status  VARCHAR(20)   NOT NULL DEFAULT 'DANG_HOAT_DONG',
                  -- DANG_HOAT_DONG | BAO_TRI | NGUNG_HOAT_DONG
    is_deleted    BIT           NOT NULL DEFAULT 0,
    created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    updated_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE TABLE dbo.equipment (
    id     INT IDENTITY(1,1) PRIMARY KEY,
    name   NVARCHAR(100) NOT NULL UNIQUE
);
GO

CREATE TABLE dbo.room_equipment (
    room_id      INT NOT NULL REFERENCES dbo.rooms(id) ON DELETE CASCADE,
    equipment_id INT NOT NULL REFERENCES dbo.equipment(id) ON DELETE CASCADE,
    PRIMARY KEY (room_id, equipment_id)
);
GO

-- ---------------------------------------------------------------
-- CUOC HOP (module Nhan vien tao; module Quan ly phong giam sat)
-- ---------------------------------------------------------------
CREATE TABLE dbo.meetings (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    room_id       INT NOT NULL REFERENCES dbo.rooms(id),
    title         NVARCHAR(200) NOT NULL,
    start_time    DATETIME2 NOT NULL,
    end_time      DATETIME2 NOT NULL,
    created_by    INT NOT NULL REFERENCES dbo.users(id),
    status        VARCHAR(20) NOT NULL DEFAULT 'DA_XAC_NHAN',
                  -- DA_XAC_NHAN | DA_HUY | HOAN_THANH
    created_at    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_meetings_time CHECK (end_time > start_time)
);
GO

-- Nguoi duoc moi tham gia cuoc hop - ho tro "phan hoi loi moi" (Xac nhan/Tu choi)
CREATE TABLE dbo.meeting_participants (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    meeting_id    INT NOT NULL REFERENCES dbo.meetings(id) ON DELETE CASCADE,
    user_id       INT NOT NULL REFERENCES dbo.users(id),
    response      VARCHAR(20) NOT NULL DEFAULT 'CHO_PHAN_HOI',
                  -- CHO_PHAN_HOI | XAC_NHAN | TU_CHOI
    CONSTRAINT UQ_meeting_user UNIQUE (meeting_id, user_id)
);
GO

-- Thong bao (moi hop / huy hop / doi lich) - actor "Mail Server" trong use case
CREATE TABLE dbo.notifications (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    user_id       INT NOT NULL REFERENCES dbo.users(id),
    meeting_id    INT NULL REFERENCES dbo.meetings(id) ON DELETE SET NULL,
    type          VARCHAR(30) NOT NULL, -- MOI_HOP | HUY_HOP | THAY_DOI_LICH
    message       NVARCHAR(300) NOT NULL,
    is_read       BIT NOT NULL DEFAULT 0,
    created_at    DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

CREATE INDEX idx_meetings_room_time
    ON dbo.meetings(room_id, start_time, end_time)
    WHERE status <> 'DA_HUY';
GO
CREATE INDEX idx_rooms_name ON dbo.rooms(name);
GO
CREATE INDEX idx_notifications_user ON dbo.notifications(user_id, is_read);
GO

-- =========================================================
-- SEED DATA
-- Mat khau demo cho TAT CA tai khoan duoi day: 123456
-- =========================================================
DECLARE @pwd NVARCHAR(255) = N'scrypt:32768:8:1$E01CUxibQTIRwuUz$3c225f6ed723a723d43f6563db2dc4bbc8af3f224a3a6410bf738a8fa57ed5482d5910f17984965c2d274b6eb070a6fe11745a264ab5e5dce4673b53cf1f3a15';

INSERT INTO dbo.users (code, full_name, email, password_hash, role) VALUES
 ('NV_A', N'Nguyễn Văn A', 'nva@xyz.com', @pwd, 'NHAN_VIEN'),
 ('NV_B', N'Trần Thị B',  'ntb@xyz.com', @pwd, 'NHAN_VIEN'),
 ('QL_C', N'Lê Văn C',    'lvc@xyz.com', @pwd, 'QUAN_LY_PHONG'),
 ('ADMIN', N'Quản trị viên', 'admin@xyz.com', @pwd, 'ADMIN');
GO

INSERT INTO dbo.equipment (name) VALUES
 (N'Máy chiếu'), (N'Camera'), (N'Loa'), (N'Micro'),
 (N'Tivi'), (N'Bảng trắng'), (N'Hệ thống mic'), (N'Camera họp trực tuyến'),
 (N'Wifi tốc độ cao'), (N'Điều hòa');
GO

INSERT INTO dbo.rooms (room_code, name, capacity, admin_status) VALUES
 ('PH001', N'Phòng Sáng Tạo',  15, 'DANG_HOAT_DONG'),
 ('PH002', N'Phòng Công Nghệ', 25, 'DANG_HOAT_DONG');
GO

INSERT INTO dbo.room_equipment (room_id, equipment_id)
SELECT r.id, e.id FROM dbo.rooms r, dbo.equipment e
WHERE r.room_code = 'PH001' AND e.name IN (N'Máy chiếu', N'Tivi', N'Bảng trắng');
GO
INSERT INTO dbo.room_equipment (room_id, equipment_id)
SELECT r.id, e.id FROM dbo.rooms r, dbo.equipment e
WHERE r.room_code = 'PH002' AND e.name IN (N'Hệ thống mic', N'Camera họp trực tuyến');
GO

INSERT INTO dbo.meetings (room_id, title, start_time, end_time, created_by, status) VALUES
 (1, N'Họp Sprint 1',    '2026-06-25T09:30:00', '2026-06-25T10:30:00', 1, 'HOAN_THANH'),
 (2, N'Gặp đối tác',     '2026-06-25T08:00:00', '2026-06-25T09:00:00', 2, 'HOAN_THANH'),
 (1, N'Lên kế hoạch Q3', '2026-06-28T09:30:00', '2026-06-28T10:30:00', 1, 'DA_XAC_NHAN'),
 (2, N'Đào tạo nội bộ',  '2026-06-28T08:00:00', '2026-06-28T09:00:00', 2, 'DA_XAC_NHAN');
GO

INSERT INTO dbo.meeting_participants (meeting_id, user_id, response) VALUES
 (1, 2, 'XAC_NHAN'),
 (2, 1, 'XAC_NHAN'),
 (3, 2, 'CHO_PHAN_HOI'),
 (4, 1, 'CHO_PHAN_HOI');
GO
