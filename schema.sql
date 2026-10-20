DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS mde_list;
DROP TABLE IF EXISTS dsm_list;
DROP TABLE IF EXISTS dsm_sign_links;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS asset_requests;
DROP TABLE IF EXISTS warehouse_stock; -- ตารางเก่า (เลิกใช้แล้ว) ลบทิ้งเผื่อยังมีอยู่จาก DB เดิม
DROP TABLE IF EXISTS warehouse_stock_history;
DROP TABLE IF EXISTS cooler_brands;
DROP TABLE IF EXISTS cooler_types;
DROP TABLE IF EXISTS cooler_models;
DROP TABLE IF EXISTS special_cooler_brands;
DROP TABLE IF EXISTS doc_types;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS login_logs;
DROP TABLE IF EXISTS password_reset_requests;
DROP TABLE IF EXISTS no_doc_deliveries;
DROP TABLE IF EXISTS cooler_events;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS announcement_reads;
DROP TABLE IF EXISTS ship_trip_plan_items;
DROP TABLE IF EXISTS ship_trip_stops;
DROP TABLE IF EXISTS ship_trip_stock;
DROP TABLE IF EXISTS ship_trips;
DROP TABLE IF EXISTS new_coolers;
DROP TABLE IF EXISTS new_cooler_receipts;
DROP TABLE IF EXISTS stock_count_items;
DROP TABLE IF EXISTS stock_counts;
DROP TABLE IF EXISTS wh_warehouses;
DROP TABLE IF EXISTS outlets;
DROP TABLE IF EXISTS loan_contracts;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    team TEXT,
    mde_code TEXT UNIQUE,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME,         -- ໃຊ້ງານລ້າສຸດ (UTC) - ອັບເດດຜ່ານ /api/app-ping
    last_mode TEXT,                  -- 'app' | 'browser'
    last_platform TEXT,              -- 'android' | 'ios' | 'desktop'
    app_installed INTEGER DEFAULT 0, -- 1 = ເຄີຍເປີດຜ່ານແອັບທີ່ຕິດຕັ້ງ
    app_installed_at DATETIME,
    notif_permission TEXT            -- 'granted' | 'denied' | 'default' | 'unsupported'
);

CREATE TABLE mde_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team TEXT NOT NULL,
    mde_code TEXT UNIQUE NOT NULL,
    mde_name TEXT NOT NULL,
    phone TEXT,                    -- ເບີໂທ MDE (ໃຊ້ສະແດງໃນ popup ແຜນທີ່ Asset Tracking)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ตัวอย่างข้อมูลเริ่มต้น (ลบ/แก้ไขได้ตามต้องการ)
INSERT INTO mde_list (team, mde_code, mde_name) VALUES
    ('VTE_TEAM', 'MDE001', 'ร้านตัวอย่าง 1'),
    ('VTE_TEAM', 'MDE002', 'ร้านตัวอย่าง 2');

-- DSM List: ຊື່ DSM (ຫົວໜ້າທີມ) ຜູກກັບ Team ຂອງ MDE - ໃຊ້ດຶງຊື່ DSM ອັດຕະໂນມັດໃສ່ໃບສັນຍາຢືມ
CREATE TABLE dsm_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team TEXT NOT NULL UNIQUE,
    dsm_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dsm_list_team ON dsm_list(team);

-- Master List: Cooler Brand / Cooler Type (Admin เพิ่ม/แก้ไข/ลบได้เอง แทนการกรอกข้อความอิสระ)
CREATE TABLE cooler_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO cooler_brands (name) VALUES
    ('Coca-Cola'),
    ('Pepsi');

-- Master List: Brand ພິເສດ (ໃຊ້ສະເພາະໜ້າ "ລາຍງານຕູ້ແຊ່ Event" - ນອກເໜືອຈາກ Cooler Brand ປົກກະຕິຂ້າງເທິງ)
CREATE TABLE special_cooler_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cooler_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO cooler_types (name) VALUES
    ('Upright'),
    ('Chest');

-- Master List: Model ຂອງຕູ້ແຊ່ (Admin ເພີ່ມ/ແກ້ໄຂ/ລຶບໄດ້ເອງ ແທນການກອກຂໍ້ຄວາມອິສະຫຼະໃນຟອມສະຕັອກສາງ)
CREATE TABLE cooler_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE doc_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO doc_types (name) VALUES
    ('ເກັບຄືນສາງ'),
    ('ຕູ້ປ່ຽນແທນ'),
    ('ຕູ້ເຄື່ອນຍ້າຍ'),
    ('ມອບຕູ້ໃຫມ່ຄັ້ງແລກ'),
    ('ມອບຕູ້ເພີ່ມ');

CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_no TEXT UNIQUE NOT NULL,
    outlet_code TEXT,
    outlet_name TEXT,
    cooler_brand TEXT,
    cooler_type TEXT,
    mde_code TEXT NOT NULL,
    doc_type TEXT,
    asset_condition TEXT DEFAULT 'new', -- 'new' = ใหม่ (ตัดงบ), 'used' = มือสอง (ไม่ตัดงบ)
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    latitude REAL,
    longitude REAL,
    old_outlet_code TEXT, -- ร้านเดิม (ใช้กับ Doc Type "ຕູ້ເຄື່ອນຍ້າຍ" / ตู้เคลื่อนย้าย)
    old_outlet_name TEXT, -- ร้านเดิม (ใช้กับ Doc Type "ຕູ້ເຄື່ອນຍ້າຍ" / ตู้เคลื่อนย้าย)
    old_latitude REAL,    -- Lat ของร้านเดิม
    old_longitude REAL,   -- Long ของร้านเดิม
    status TEXT DEFAULT 'Active',
    delivery_photo TEXT,   -- (ของเดิม เลิกใช้แล้ว) รูปถ่ายยืนยันตอนจัดส่งสำเร็จ (เก็บเป็น base64)
    delivery_photo_qr TEXT,     -- รูปถ่าย QR Code ตอนจัดส่งสำเร็จ (เก็บเป็น R2 object key, รูปจริงอยู่ใน R2 bucket "PHOTOS")
    delivery_photo_serial TEXT, -- รูปถ่าย Serial Number ตอนจัดส่งสำเร็จ (เก็บเป็น R2 object key)
    delivery_photo_capex TEXT,  -- รูปถ่าย CapEx ตอนจัดส่งสำเร็จ (เก็บเป็น R2 object key)
    delivery_photo_asset TEXT,  -- รูปถ่าย Asset (ตู้เย็น) ตอนจัดส่งสำเร็จ (เก็บเป็น R2 object key)
    delivery_photo_document TEXT, -- รูปถ่ายเอกสาร ตอนจัดส่งสำเร็จ (เก็บเป็น R2 object key)
    delivered_at DATETIME, -- วันเวลาที่ยืนยันจัดส่งสำเร็จ
    delivered_by TEXT,     -- ผู้ยืนยันจัดส่ง (email)
    admin_verified INTEGER DEFAULT 0,  -- 1 = Admin ຢືນຢັນຄວາມຖືກຕ້ອງຂອງລາຍການ (ຮູບ/ຂໍ້ມູນ) ແລ້ວ
    admin_verified_at DATETIME,        -- ວັນເວລາທີ່ Admin ຢືນຢັນ
    admin_verified_by TEXT,            -- Admin ຄົນທີ່ຢືນຢັນ (email)
    flagged INTEGER DEFAULT 0,         -- 1 = Admin ຕິດທຸງ (flag) ລາຍການນີ້ໄວ້ ເພື່ອຕິດຕາມເປັນພິເສດ (ຄືກັນກັບ flag ອີເມວ)
    flagged_at DATETIME,               -- ວັນເວລາທີ່ຕິດທຸງ
    flagged_by TEXT,                   -- Admin ຄົນທີ່ຕິດທຸງ (email)
    contract_doc_manual INTEGER DEFAULT 0, -- 1 = Admin ໝາຍວ່າ "ສັນຍາ: ມີເອກະສານ" ດ້ວຍມື (ມີເອກະສານຕົວຈິງ ແຕ່ບໍ່ມີໃນລະບົບ)
    contract_doc_manual_at DATETIME,       -- ວັນເວລາທີ່ Admin ໝາຍ
    contract_doc_manual_by TEXT,           -- Admin ຄົນທີ່ໝາຍ (email)
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index ใส่ mde_code/status กันไม่ให้ query ตาม mde_code (user ทั่วไป) ต้อง scan เต็มตาราง
CREATE INDEX IF NOT EXISTS idx_assets_mde_code_status ON assets(mde_code, status);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);

-- ตัวอย่างข้อมูล Asset Tracking (ลบ/แก้ไขได้ตามต้องการ)
INSERT INTO assets (tracking_no, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, status) VALUES
    ('TRK0001', 'OUT001', 'ร้านตัวอย่าง 1', 'Coca-Cola', 'Upright', 'MDE001', 'Contract', 'Active'),
    ('TRK0002', 'OUT002', 'ร้านตัวอย่าง 2', 'Pepsi', 'Chest', 'MDE002', 'Loan', 'Active');

-- งบประมาณ/โควต้าการเบิก Asset ต่อทีม (Admin ตั้งว่าทีมไหน เบิก Brand/Type ไหนได้กี่อัน)
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team TEXT NOT NULL,
    cooler_brand TEXT,
    cooler_type TEXT,
    quota INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ตัวอย่างข้อมูลงบประมาณ (ลบ/แก้ไขได้ตามต้องการ)
INSERT INTO budgets (team, cooler_brand, cooler_type, quota) VALUES
    ('VTE_TEAM', 'Coca-Cola', 'Upright', 10),
    ('VTE_TEAM', 'Pepsi', 'Chest', 5);

-- คำขอเบิก Asset ใหม่จาก User (รออนุมัติ/อนุมัติ/ปฏิเสธ)
CREATE TABLE asset_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    team TEXT,
    mde_code TEXT NOT NULL,
    outlet_code TEXT,
    outlet_name TEXT,
    cooler_brand TEXT,
    cooler_type TEXT,
    doc_type TEXT,
    contract_type TEXT, -- ປະເພດສັນຍາ: partner_club | competitive | none (ໃຊ້ຕອນອອກໃບສັນຍາຢືມອັດຕະໂນມັດ)
    outlet_owner TEXT, outlet_type TEXT, outlet_level TEXT, outlet_province TEXT, outlet_village TEXT, outlet_district TEXT, outlet_phone TEXT, -- ຂໍ້ມູນຮ້ານທີ່ບໍ່ມີ Outlet Code
    asset_condition TEXT DEFAULT 'new', -- 'new' = ใหม่ (ตัดงบประมาณ), 'used' = มือสอง (ไม่ตัดงบประมาณ)
    reason TEXT,
    qr_code TEXT,       -- กรอกโดย Admin ตอนอนุมัติ
    serial_number TEXT, -- กรอกโดย Admin ตอนอนุมัติ
    capex TEXT,         -- กรอกโดย Admin ตอนอนุมัติ
    asset_id INTEGER,   -- Asset ที่ถูกสร้างตอนอนุมัติ (ใช้ตรวจว่าออกใบสัญญายืมแล้วหรือยัง)
    status TEXT DEFAULT 'pending',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_requests_user_id ON asset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_requests_status ON asset_requests(status);
CREATE INDEX IF NOT EXISTS idx_asset_requests_asset_id ON asset_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_requests_status_mde ON asset_requests(status, mde_code);

-- ตาราง Push Notification Subscription (แจ้งเตือนไปยังมือถือ/เบราว์เซอร์ของผู้ใช้)
CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ຕາຕະລາງ Log ການເຂົ້າສູ່ລະບົບ (ບັນທຶກທຸກຄັ້ງທີ່ login ສຳເລັດ - ໃຫ້ Admin ກວດເບິ່ງພາຍຫຼັງ)
CREATE TABLE login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT,
    mde_code TEXT,
    team TEXT,
    role TEXT,
    logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_login_logs_logged_in_at ON login_logs(logged_in_at);

-- ຕາຕະລາງຄຳຂໍ/ລະຫັດ Reset ລະຫັດຜ່ານ (ລືມລະຫັດຜ່ານ)
CREATE TABLE password_reset_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' (ລໍຖ້າ admin) | 'issued' (admin ອອກລະຫັດແລ້ວ) | 'used' (ໃຊ້ແລ້ວ) | 'cancelled'
    note TEXT,                               -- ຂໍ້ຄວາມຈາກ user (ເຊັ່ນ ເບີໂທຕິດຕໍ່ກັບ)
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    code_hash TEXT,                          -- hash (PBKDF2) ຂອງລະຫັດ Reset - ບໍ່ເກັບລະຫັດຕົວຈິງ
    code_expires_at DATETIME,                -- ໝົດອາຍຸ (UTC)
    attempts INTEGER NOT NULL DEFAULT 0,     -- ຈຳນວນຄັ້ງທີ່ປ້ອນລະຫັດຜິດ (ຜິດ 5 ຄັ້ງ = ລະຫັດຖືກຍົກເລີກ)
    issued_by INTEGER,
    issued_at DATETIME,
    used_at DATETIME
);

CREATE INDEX idx_pwreset_user_status ON password_reset_requests(user_id, status);

-- ຕາຕະລາງລາຍງານການຈັດສົ່ງ "ບໍ່ມີເອກະສານ" (ປ້ອນຂໍ້ມູນເອງ, ແຍກຕ່າງຫາກຈາກ assets/asset_requests)
CREATE TABLE no_doc_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outlet_code TEXT,
    outlet_name TEXT,
    cooler_brand TEXT,
    cooler_type TEXT,
    mde_code TEXT,
    doc_type TEXT,
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    photo_qr TEXT,       -- R2 object key ของรูปถ่าย QR Code (ไม่บังคับ)
    photo_serial TEXT,   -- R2 object key ของรูปถ่าย Serial Number (ไม่บังคับ)
    photo_capex TEXT,    -- R2 object key ของรูปถ่าย CapEx (ไม่บังคับ)
    photo_asset TEXT,    -- R2 object key ของรูปถ่าย Asset/ตู้เย็น (ไม่บังคับ)
    delivered_date TEXT,   -- วันที่จัดส่ง (ผู้ใช้กรอกเอง, เก็บเป็น YYYY-MM-DD)
    reason TEXT,           -- ເຫດຜົນ/ໝາຍເຫດ ທີ່ບໍ່ມີເອກະສານ
    reported_by TEXT,      -- ຜູ້ບັນທຶກ (email)
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    old_outlet_code TEXT,  -- Outlet Code ຮ້ານເດີມ (ໃຊ້ກັບ Doc Type "ຕູ້ເຄື່ອນຍ້າຍ")
    old_outlet_name TEXT,  -- Outlet Name ຮ້ານເດີມ (ໃຊ້ກັບ Doc Type "ຕູ້ເຄື່ອນຍ້າຍ")
    old_latitude REAL,     -- Latitude ຮ້ານເດີມ
    old_longitude REAL     -- Longitude ຮ້ານເດີມ
);

CREATE INDEX idx_no_doc_deliveries_mde_code ON no_doc_deliveries(mde_code);

-- ຕາຕະລາງລາຍງານ "ຕູ້ແຊ່ Event" (ເອົາຕູ້ແຊ່ອອກໄປໃຊ້ງານຊົ່ວຄາວ ເຊັ່ນ event/ໂປໂມຊັນ - ບໍ່ຜູກກັບ Asset ໃນລະບົບ, ປ້ອນຂໍ້ມູນຕູ້ເອງ)
CREATE TABLE cooler_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cooler_brand TEXT,
    cooler_type TEXT,
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    event_name TEXT,
    event_location TEXT,
    taken_date TEXT,
    taken_by TEXT,
    taken_photo TEXT,
    expected_return_date TEXT,
    returned INTEGER DEFAULT 0,
    returned_date TEXT,
    returned_by TEXT,
    returned_photo TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cooler_events_returned ON cooler_events(returned);
CREATE INDEX idx_cooler_events_taken_date ON cooler_events(taken_date);

-- ຕາຕະລາງລາຍງານ "ຕູ້ແຊ່ສະສາງ" (ຊຳລຸດ/ໝົດອາຍຸ/ສູນຫາຍ) - ຮັນ migration_add_cooler_writeoffs.sql ສຳລັບ DB ທີ່ deploy ແລ້ວ
DROP TABLE IF EXISTS cooler_writeoffs;
CREATE TABLE cooler_writeoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER,
    prev_status TEXT,
    warehouse_name TEXT,
    cooler_brand TEXT,
    cooler_type TEXT,
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    reason TEXT,          -- broken | old | lost | other
    writeoff_date TEXT,
    written_off_by TEXT,
    photo TEXT,
    status TEXT DEFAULT 'confirmed',   -- pending (ລໍຖ້າ Admin ຢືນຢັນ) | confirmed
    confirmed_by TEXT,
    confirmed_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cooler_writeoffs_date ON cooler_writeoffs(writeoff_date);
CREATE INDEX idx_cooler_writeoffs_qr ON cooler_writeoffs(qr_code);
CREATE INDEX idx_cooler_writeoffs_serial ON cooler_writeoffs(serial_number);

-- ຕາຕະລາງ "ໜ້າແຈ້ງເຕືອນ" ໃນແອັບ (Notification Inbox) - ບັນທຶກແຈ້ງເຕືອນທຸກອັນໄວ້ໃນ DB ນອກຈາກ Push Notification
-- ເພື່ອໃຫ້ user ເຂົ້າມາເບິ່ງຄືນໄດ້ ເຖິງແມ່ນ Push ຈະສົ່ງອອກໄປບໍ່ໄດ້ (ເຊັ່ນ Android ບໍ່ໄດ້ອະນຸຍາດ)
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT,
    body TEXT,
    url TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- ຕາຕະລາງ "ປະກາດພາຍໃນບໍລິສັດ" (Announcements) - Admin ປະກາດຂ່າວ/ແຈ້ງການເຖິງພະນັກງານທຸກຄົນ
CREATE TABLE announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    always_show INTEGER DEFAULT 0,
    image_key TEXT, -- R2 object key ຂອງຮູບປະກອບປະກາດ (ບໍ່ບັງຄັບ)
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

-- ບັນທຶກວ່າ user ຄົນໃດອ່ານປະກາດອັນໃດແລ້ວ (ໃຊ້ນັບ unread badge)
CREATE TABLE announcement_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, user_id)
);

CREATE INDEX idx_announcements_active ON announcements(is_active, is_pinned, created_at);
CREATE INDEX idx_announcement_reads_user ON announcement_reads(user_id);

-- ຕາຕະລາງ "ສາງ" (Warehouse) — Master List ທີ່ Admin ຈັດການເອງ, ໃຊ້ເປັນຈຸດເລີ່ມຕົ້ນຂອງໂມດູນຕູ້ແຊ່
-- (ອອກໃບຢືມ/ຍົກເລີກ/ສູນຫາຍ ແລະ ກວດນັບສາງ) — ແຍກຕ່າງຫາກຈາກ assets/mde_code/outlet_code ເດີມ
CREATE TABLE wh_warehouses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT UNIQUE NOT NULL,   -- ລະຫັດສາງ ເຊັ່ນ WOF, WVTE
    name       TEXT NOT NULL,          -- ຊື່ສາງ ເຊັ່ນ "ສາງໃຫຍ່ ວຽງຈັນ"
    province   TEXT,
    is_main    INTEGER DEFAULT 0,      -- 1 = ສາງຫຼັກ
    active     INTEGER DEFAULT 1,      -- 0 = ປິດໃຊ້ງານ (ເຊື່ອງອອກຈາກ dropdown, ບໍ່ລຶບຂໍ້ມູນເກົ່າ)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ຕົວຢ່າງຂໍ້ມູນເລີ່ມຕົ້ນ (ລຶບ/ແກ້ໄຂໄດ້ຕາມຕ້ອງການ)
INSERT INTO wh_warehouses (code, name, is_main, active) VALUES
    ('WMAIN', 'ສາງໃຫຍ່', 1, 1);

-- ຕາຕະລາງ "Outlet" (ຮ້ານຄ້າ) — Master List ທີ່ Admin ຈັດການເອງ, ໃຊ້ແທນການພິມ Outlet Code/Name ແບບ free-text
-- (ແຍກຕ່າງຫາກຈາກ assets.outlet_code/outlet_name ເດີມ — ຍັງບໍ່ໄດ້ຜູກ FK ນຳກັນ, ເປັນ master reference ກ່ອນ)
CREATE TABLE outlets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT UNIQUE NOT NULL,   -- Outlet Code ເຊັ່ນ OUT001
    name         TEXT NOT NULL,          -- ຊື່ຮ້ານ
    owner_name   TEXT,                   -- ຊື່ເຈົ້າຂອງຮ້ານ
    outlet_type  TEXT,                   -- ປະເພດຮ້ານຄ້າ
    outlet_level TEXT,                   -- ລະດັບຮ້ານ
    province     TEXT,                   -- ແຂວງ
    address      TEXT,                   -- ທີ່ຢູ່
    phone        TEXT,                   -- ເບີໂທຜູ້ຕິດຕໍ່
    latitude     REAL,
    longitude    REAL,
    active       INTEGER DEFAULT 1,      -- 0 = ປິດໃຊ້ງານ (ເຊື່ອງອອກຈາກ dropdown, ບໍ່ລຶບຂໍ້ມູນເກົ່າ)
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ສະຕັອກເຄື່ອງໃນສາງ (Warehouse Stock) — ຕິດຕາມແຕ່ລະໜ່ວຍດ້ວຍ QR Code / Serial Number ຢູ່ໃນແຕ່ລະສາງ
-- ຜູກກັບ wh_warehouses ຜ່ານ warehouse_id (ບໍ່ໃຊ້ຊື່ສາງແບບ free-text ອີກຕໍ່ໄປ)
CREATE TABLE warehouse_stock (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id   INTEGER NOT NULL REFERENCES wh_warehouses(id),
    cooler_brand   TEXT NOT NULL,
    cooler_type    TEXT NOT NULL,
    cooler_model   TEXT,
    cooler_status  TEXT DEFAULT 'new',         -- 'new' = ໃໝ່, 'second_hand' = ມືສອງ, 'broken' = ຊຳລຸດ
    qr_code        TEXT,
    serial_number  TEXT,
    capex          TEXT,
    status         TEXT DEFAULT 'in_warehouse', -- 'in_warehouse' = ຢູ່ໃນສາງ, 'reserved' = ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ, 'outlet' = ອອກໄປຮ້ານແລ້ວ, 'event' = ກຳລັງໃຊ້ງານ Event, 'shipped_out' = ສົ່ງຕ່າງແຂວງແລ້ວ (ຜ່ານຖ້ຽວລົດ), 'write_off' = ສະສາງ
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_warehouse_stock_warehouse ON warehouse_stock(warehouse_id);
CREATE INDEX idx_warehouse_stock_status ON warehouse_stock(status);
CREATE INDEX idx_warehouse_stock_qr ON warehouse_stock(qr_code);
CREATE INDEX idx_warehouse_stock_serial ON warehouse_stock(serial_number);

-- ປະຫວັດການເຄື່ອນໄຫວສະຕັອກສາງ — ບັນທຶກທຸກການ ເພີ່ມ/ແກ້ໄຂ/ລຶບ ລາຍການໃນ warehouse_stock
CREATE TABLE warehouse_stock_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id       INTEGER,
    warehouse_id   INTEGER NOT NULL,
    old_warehouse_id INTEGER,          -- ສາງເກົ່າກ່ອນຍ້າຍ (null ຖ້າຍັງບໍ່ເຄີຍຍ້າຍ/ຫາກສ້າງໃໝ່)
    action         TEXT NOT NULL,     -- 'create' | 'update' | 'delete'
    cooler_brand   TEXT,
    cooler_type    TEXT,
    cooler_model   TEXT,
    qr_code        TEXT,
    serial_number  TEXT,
    capex          TEXT,
    old_status     TEXT,
    new_status     TEXT,
    changed_by     TEXT,
    changed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes          TEXT
);

CREATE INDEX idx_wsh_stock ON warehouse_stock_history(stock_id);
CREATE INDEX idx_wsh_warehouse ON warehouse_stock_history(warehouse_id);
CREATE INDEX idx_wsh_old_warehouse ON warehouse_stock_history(old_warehouse_id);
CREATE INDEX idx_wsh_changed_at ON warehouse_stock_history(changed_at);

-- ລະບົບກວດນັບສາງປະຈຳເດືອນ (Stock Count)
-- ຮອບກວດນັບ: 1 ສາງ + 1 ເດືອນ (period = 'YYYY-MM') = 1 ຮອບ
CREATE TABLE stock_counts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id),
    period       TEXT NOT NULL,                 -- 'YYYY-MM'
    status       TEXT NOT NULL DEFAULT 'open',  -- 'open' = ກຳລັງກວດນັບ, 'completed' = ປິດຮອບແລ້ວ
    notes        TEXT,
    started_by   TEXT,
    started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_by TEXT,
    completed_at DATETIME,
    UNIQUE (warehouse_id, period)
);

-- ລາຍການໃນແຕ່ລະຮອບ: ຖ່າຍ snapshot ສະຕັອກທີ່ "ຢູ່ໃນສາງ" ຕອນເລີ່ມຮອບ (expected = 1)
-- ແລະ ເກັບລາຍການທີ່ສະແກນເຈິແຕ່ບໍ່ຢູ່ໃນ snapshot (expected = 0, result = 'extra')
CREATE TABLE stock_count_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id      INTEGER NOT NULL REFERENCES stock_counts(id),
    stock_id      INTEGER,
    qr_code       TEXT,
    serial_number TEXT,
    capex         TEXT,
    cooler_brand  TEXT,
    cooler_type   TEXT,
    cooler_model  TEXT,
    expected      INTEGER NOT NULL DEFAULT 1,
    result        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'found' | 'missing' | 'extra'
    counted_by    TEXT,
    counted_at    DATETIME,
    notes         TEXT,
    UNIQUE (count_id, stock_id)
);

CREATE INDEX idx_stock_counts_wh ON stock_counts(warehouse_id, period);
CREATE INDEX idx_sci_count ON stock_count_items(count_id, result);

-- บัญชี Admin เริ่มต้น (email: admin@example.com / password: Admin@123)
-- **สำคัญ: ให้เข้าไปเปลี่ยนรหัสผ่านทันทีหลังใช้งานจริง ผ่านหน้า "เปลี่ยนรหัสผ่าน" หรือแก้ตรง DB**
-- หมายเหตุ: password_hash ด้านล่างเป็น plaintext ชั่วคราว ระบบจะ hash ให้อัตโนมัติ (PBKDF2)
-- ทันทีที่ login ครั้งแรกสำเร็จ (ดู src/auth.js) ไม่ต้องรัน migration อะไรเพิ่ม
INSERT INTO users (email, password_hash, team, mde_code, role, status) VALUES
    ('admin@example.com', 'Admin@123', 'ADMIN_TEAM', 'ADMIN', 'admin', 'approved');

-- ຟັງຊັນ "ອອກໃບສັນຍາຢືມ" (ເບິ່ງລາຍລະອຽດຄໍລຳໃນ migration_add_loan_contracts.sql)

CREATE TABLE IF NOT EXISTS loan_contracts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no           TEXT UNIQUE,              -- ຕັ້ງຫຼັງ insert ຄື DOC0001 (ຄືຮູບແບບ tracking_no)
    asset_id         INTEGER REFERENCES assets(id),
    tracking_no      TEXT,                     -- ອ້າງອີງ assets.tracking_no ຕອນອອກໃບ (ຖ້າມີ)

    -- ຮ້ານຄ້າ (ຄັດລອກມາຈາກ outlets/assets ຕອນອອກໃບ ເພື່ອໃຫ້ໃບເກົ່າຄົງທີ່ຖ້າຮ້ານມີການແກ້ໄຂພາຍຫຼັງ)
    outlet_code      TEXT,
    outlet_name      TEXT,
    outlet_owner     TEXT,
    outlet_type      TEXT,
    outlet_grade     TEXT,
    outlet_phone     TEXT,
    village          TEXT,
    district         TEXT,
    province         TEXT,

    -- ປະເພດສັນຍາ/ການມອບຕູ້/ຂະໜາດ — ເດົາຈາກ assets.doc_type ອັດຕະໂນມັດ, ແກ້ໄຂໄດ້ກ່ອນອອກໃບ
    contract_type    TEXT,                     -- partner_club | competitive | none
    handover_type    TEXT,                     -- new | move | extra | replace | survey
    doors            INTEGER,                  -- 1 | 2 | 3 (ຜູ້ອອກໃບເລືອກເອງ - ບໍ່ມີໃນ master data)
    door_variant     TEXT,                     -- modern_small | table_cooler (ສະເພາະ doors = 1; ຕໍ່ທ້າຍຊື່ຍີ່ຫໍ້ຕູ້ໃນ PDF)
    cooler_type      TEXT,                     -- Cooler Type ທີ່ເລືອກໃນຟອມ (ໃຊ້ສ້າງ Asset Tracking ອັດຕະໂນມັດຂອງ "ຕູ້ເຄື່ອນຍ້າຍ")

    -- ຕູ້ແຊ່
    cooler_brand     TEXT,
    qr_cd            TEXT,
    serial_no        TEXT,
    capx             TEXT,

    -- ສະເພາະ handover_type = 'move' (ຕູ້ເຄື່ອນຍ້າຍ)
    old_doc_no       TEXT,
    old_outlet_code  TEXT,
    old_outlet_name  TEXT,
    old_outlet_phone TEXT,
    move_reason      TEXT,
    sig_old_outlet      TEXT,   -- R2 key (bucket PHOTOS)
    sig_old_outlet_name TEXT,
    sig_old_outlet_at   DATETIME,

    -- MDE (ຜູ້ຂໍ)
    mde_code         TEXT,
    mde_phone        TEXT,
    sig_mde          TEXT,      -- R2 key
    sig_mde_name     TEXT,
    sig_mde_at       DATETIME,

    -- DSM — ບໍ່ມີບົດບາດນີ້ໃນລະບົບປັດຈຸບັນ, ຄໍລຳໄວ້ຮອງຮັບອະນາຄົດ (ປະຫວ່າງ = ຂຽນມືໃນເຈ້ຍ)
    sig_dsm          TEXT,
    sig_dsm_name     TEXT,
    sig_dsm_at       DATETIME,

    -- Admin (ຝ່າຍບໍລິສັດ)
    sig_admin        TEXT,      -- R2 key
    sig_admin_name   TEXT,
    sig_admin_at     DATETIME,

    -- ເຈົ້າຂອງຮ້ານ
    sig_outlet       TEXT,      -- R2 key
    sig_outlet_name  TEXT,
    sig_outlet_at    DATETIME,

    status           TEXT DEFAULT 'draft',   -- draft = MDE ຍັງບໍ່ເຊັນ, awaiting_dsm = MDE ເຊັນແລ້ວ ລໍຖ້າ DSM ເຊັນ, completed = ເຊັນຄົບ/ເປີດ PDF ໄດ້
    created_by       TEXT,                   -- email ຜູ້ອອກໃບ
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loan_contracts_asset    ON loan_contracts(asset_id);
CREATE INDEX IF NOT EXISTS idx_loan_contracts_tracking ON loan_contracts(tracking_no);
CREATE INDEX IF NOT EXISTS idx_loan_contracts_outlet   ON loan_contracts(outlet_code);

-- ຕູ້ແຊ່ເຂົ້າໃຫມ່ (New Coolers) - Admin Import ລາຍການຕູ້ໃໝ່ ແລ້ວສະແກນ/ພິມຫາເລກເພື່ອຮັບເຂົ້າສາງ
CREATE TABLE new_coolers (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    cooler_brand           TEXT NOT NULL,
    cooler_type            TEXT NOT NULL,
    cooler_model           TEXT,
    qr_code                TEXT,
    serial_number          TEXT,
    capex                  TEXT,
    notes                  TEXT,
    status                 TEXT NOT NULL DEFAULT 'pending',  -- 'pending' = ຍັງບໍ່ໄດ້ສະແກນ, 'confirmed' = ສະແກນຢືນຢັນແລ້ວ (ລໍຖ້າຮັບເຂົ້າສາງ), 'received' = ຮັບເຂົ້າສາງແລ້ວ, 'shipped_out' = ສົ່ງອອກຕ່າງແຂວງເລີຍ (ບໍ່ຜ່ານສາງ)
    confirmed_by           TEXT,
    confirmed_at           DATETIME,
    ship_province          TEXT,                             -- ແຂວງປາຍທາງ ຕອນສົ່ງອອກຕ່າງແຂວງ
    ship_warehouse         TEXT,                             -- ສາງສະເພາະແຂວງປາຍທາງ (ship_province_warehouses.name) — ໃຊ້ຕັດງົບຕໍ່ສາງ
    ship_note              TEXT,
    shipped_by             TEXT,
    shipped_at             DATETIME,
    ship_requested         INTEGER NOT NULL DEFAULT 0,       -- 1 = ຕິກສົ່ງອອກຕ່າງແຂວງ ລໍຖ້າຢືນຢັນ
    trip_id                INTEGER,                          -- ຖ້ຽວລົດ (ship_trips.id) ທີ່ຕູ້ນີ້ຢູ່
    trip_scanned_at        DATETIME,                         -- ສະແກນຢືນຢັນວ່າມີຕູ້ຂຶ້ນລົດ (ໃນຖ້ຽວ)
    trip_scanned_by        TEXT,
    received_warehouse_id  INTEGER REFERENCES wh_warehouses(id),
    received_stock_id      INTEGER,                          -- id ຂອງແຖວທີ່ສ້າງໃນ warehouse_stock ຕອນຮັບເຂົ້າ
    received_by            TEXT,
    received_at            DATETIME,
    receipt_id             INTEGER,                          -- ການຮັບເຂົ້າ (new_cooler_receipts.id) ທີ່ຕູ້ນີ້ຢູ່ — ລ໋ອດ/ຄອນເທນເນີ
    lot_no                 TEXT,                             -- ເລກລ໋ອດ (ສຳເນົາຈາກ new_cooler_receipts)
    created_by             TEXT,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ລ໋ອດ + ຄອນເທນເນີ ຂອງຕູ້ທີ່ຮັບເຂົ້າສາງ (1 ການຮັບເຂົ້າ = 1 ແຖວ)
CREATE TABLE new_cooler_receipts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_no           TEXT NOT NULL,
    container_count  INTEGER NOT NULL DEFAULT 0,
    container_units  TEXT,
    total_units      INTEGER NOT NULL DEFAULT 0,
    received_count   INTEGER NOT NULL DEFAULT 0,
    warehouse_id     INTEGER REFERENCES wh_warehouses(id),
    note             TEXT,
    received_by      TEXT,
    received_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at        DATETIME,   -- ປິດລ໋ອດແລ້ວ (ເພີ່ມຕູ້ບໍ່ໄດ້)
    closed_by        TEXT
);
CREATE INDEX idx_new_cooler_receipts_lot ON new_cooler_receipts(lot_no);
CREATE INDEX idx_new_coolers_lot ON new_coolers(lot_no);

CREATE INDEX idx_new_coolers_status ON new_coolers(status);
CREATE INDEX idx_new_coolers_qr ON new_coolers(qr_code);
CREATE INDEX idx_new_coolers_serial ON new_coolers(serial_number);
CREATE INDEX idx_new_coolers_capex ON new_coolers(capex);

CREATE INDEX idx_new_coolers_trip ON new_coolers(trip_id);
CREATE INDEX idx_new_coolers_trip_cover ON new_coolers(trip_id, trip_scanned_at, ship_province); -- covering: ໃຊ້ນັບຕູ້/ສະແກນ/ແຂວງ ຕໍ່ຖ້ຽວ ໂດຍບໍ່ອ່ານແຖວຕາຕະລາງ

-- ຖ້ຽວລົດສົ່ງອອກຕ່າງແຂວງ: ລົດ 1 ຄັນ ເອົາຕູ້ຫຼາຍແຂວງໃສ່ຖ້ຽວດຽວກັນໄດ້ ແລ້ວພິມໃບສົ່ງ
CREATE TABLE ship_trips (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_no       TEXT NOT NULL UNIQUE,
    truck_plate   TEXT NOT NULL,
    driver_name   TEXT,
    driver_phone  TEXT,
    trip_date     TEXT,
    note          TEXT,
    status        TEXT NOT NULL DEFAULT 'open',  -- 'open' = ກຳລັງຈັດຕູ້ຂຶ້ນລົດ, 'departed' = ລົດອອກແລ້ວ
    created_by    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    departed_by   TEXT,
    departed_at   DATETIME,
    depart_photo  TEXT,                          -- key ຮູບຖ່າຍຕອນລົດອອກ (R2: trip/<id>/depart-*.jpg)
    budget_override    INTEGER NOT NULL DEFAULT 0,   -- 1 = admin ອະນຸມັດເອົາໄປນອກງົບຕອນສ້າງແຜນ (ຂ້າມການກວດງົບຕອນລົດອອກ) — ເບິ່ງ migration_add_ship_trip_budget_override.sql
    budget_override_by TEXT,
    sig_sender    TEXT,                          -- key ລາຍເຊັນ ຜູ້ຈັດສົ່ງ/ຜູ້ກວດນັບຕູ້ (R2: trip/<id>/sig-sender-*.png)
    sig_driver    TEXT,                          -- key ລາຍເຊັນ ຄົນຂັບລົດ
    sig_approver  TEXT                           -- key ລາຍເຊັນ ຜູ້ອະນຸມັດ (ບໍ່ບັງຄັບ)
);

-- ຕູ້ຈາກສາງທີ່ເອົາໄປກັບຖ້ຽວລົດ (ເພີ່ມເຂົ້າຖ້ຽວ = reserved, ລົດອອກ = shipped_out)
CREATE TABLE ship_trip_stock (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id       INTEGER NOT NULL REFERENCES ship_trips(id),
    stock_id      INTEGER NOT NULL UNIQUE REFERENCES warehouse_stock(id),
    ship_province TEXT,
    ship_warehouse TEXT,
    ship_note     TEXT,
    added_by      TEXT,
    added_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    scanned_at    DATETIME,                         -- ສະແກນຢືນຢັນວ່າມີຕູ້ຂຶ້ນລົດ
    scanned_by    TEXT
);
CREATE INDEX idx_ship_trip_stock_trip ON ship_trip_stock(trip_id);
CREATE INDEX idx_ship_trip_stock_trip_cover ON ship_trip_stock(trip_id, scanned_at, ship_province);

-- ລິ້ງເຊັນຮັບຕູ້ປາຍທາງ (ໃຊ້ໄດ້ຄັ້ງດຽວ) ຂອງຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ — 1 ລິ້ງ ຕໍ່ 1 ແຂວງ ຕໍ່ 1 ຖ້ຽວ (token ເກັບສະເພາະ hash)
CREATE TABLE ship_trip_receipts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id        INTEGER NOT NULL,
    province       TEXT NOT NULL,
    token_hash     TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',  -- 'pending' = ລໍຖ້າເຊັນ, 'signed' = ເຊັນແລ້ວ
    expected_count INTEGER NOT NULL DEFAULT 0,
    expires_at     DATETIME NOT NULL,
    created_by     TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    receiver_name  TEXT,
    receiver_phone TEXT,
    received_count INTEGER,
    note           TEXT,
    sig_receiver   TEXT,                             -- key ລາຍເຊັນ (R2: trip/<id>/recv-*.png)
    signed_at      DATETIME,
    nonce          TEXT,                             -- ໃຊ້ຄິດ token ຄືນ (HMAC) ເພື່ອສະແດງ/ສົ່ງລິ້ງເກົ່າ
    UNIQUE (trip_id, province)
);
CREATE UNIQUE INDEX idx_ship_trip_receipts_token ON ship_trip_receipts(token_hash);

-- ລຳດັບແຂວງຂອງຖ້ຽວ (seq). ລົດຮອດແຂວງນັ້ນ = ຜູ້ຮັບເຊັນຮັບແລ້ວ (ship_trip_receipts) — ຄິດໃນໜ້າເວັບ
CREATE TABLE ship_trip_stops (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id     INTEGER NOT NULL,
    province    TEXT NOT NULL,
    seq         INTEGER NOT NULL DEFAULT 0,
    UNIQUE (trip_id, province)
);
CREATE INDEX idx_ship_trip_stops_trip ON ship_trip_stops(trip_id);

-- ແຜນຂອງຖ້ຽວທີ່ສ້າງຈາກແຜນສົ່ງຕູ້ (ແຂວງ/ສາງ/ຊະນິດຕູ້/ຈຳນວນ) — ເບິ່ງ migration_add_ship_trip_plan_items.sql
CREATE TABLE ship_trip_plan_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id    INTEGER NOT NULL,
    province   TEXT NOT NULL,
    warehouse  TEXT NOT NULL DEFAULT '',
    brand      TEXT NOT NULL DEFAULT '',   -- '' = ບໍ່ກຳນົດ Brand (ຮັບທຸກ Brand) — ເບິ່ງ migration_add_ship_trip_plan_brand.sql
    size_id    INTEGER NOT NULL,
    size_label TEXT,
    qty        INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ship_trip_plan_items_trip ON ship_trip_plan_items(trip_id);

-- ແຜນສົ່ງຕູ້ແຊ່ຕ່າງແຂວງ: ກະບະລົດບັນທຸກ + ຊະນິດຕູ້ (ຂະໜາດ/ຈຳກັດຕໍ່ລົດ ຕາມ Model) — ເບິ່ງ migration_add_truck_types.sql
CREATE TABLE IF NOT EXISTS truck_types (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    bed_w        INTEGER NOT NULL DEFAULT 230,
    bed_l        INTEGER NOT NULL DEFAULT 500,
    allow_rotate INTEGER NOT NULL DEFAULT 1,
    note         TEXT,
    updated_by   TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS truck_cooler_sizes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    label         TEXT NOT NULL,
    doors         INTEGER NOT NULL,
    models        TEXT,
    w             INTEGER NOT NULL,
    l             INTEGER NOT NULL,
    max_per_truck INTEGER NOT NULL,
    is_default    INTEGER NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0
);

-- ລິ້ງເຊັນ DSM (ໃຊ້ໄດ້ຄັ້ງດຽວ) ສຳລັບໃບສັນຍາຢືມ (DOC-) ແລະ ໃບເກັບຕູ້ເຂົ້າສາງ (T-) — token ເກັບສະເພາະ hash (ເບິ່ງ migration_add_dsm_sign_links.sql)
CREATE TABLE dsm_sign_links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,                    -- 'loan' | 'cancel'
    doc_id     INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'signed'
    expires_at DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    signer_name TEXT,
    signed_at  DATETIME,
    nonce      TEXT,                              -- ໃຊ້ຄິດ token ຄືນ (HMAC) ເພື່ອສະແດງ/ສົ່ງລິ້ງເກົ່າ
    UNIQUE (kind, doc_id)
);
CREATE UNIQUE INDEX idx_dsm_sign_links_token ON dsm_sign_links(token_hash);

-- Cooler Master Data (ຂໍ້ມູນຕູ້ແຊ່ທົ່ວປະເທດ) — Admin Import ຈາກ Excel, ໃຊ້ຄົ້ນຫາ/ສະແກນວ່າຕູ້ຢູ່ໃສ
-- ແຍກຂາດຈາກ warehouse_stock / assets (ຮັນ migration_add_cooler_master.sql ສຳລັບ DB ທີ່ deploy ແລ້ວ)
CREATE TABLE cooler_master (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    qr_code        TEXT,
    serial_number  TEXT,
    capex          TEXT,
    qr_norm        TEXT,   -- ຄ່າ trim + UPPER ໄວ້ຄົ້ນຫາໄວ (ມີ index)
    serial_norm    TEXT,
    capex_norm     TEXT,
    cooler_brand   TEXT,
    cooler_type    TEXT,
    cooler_model   TEXT,
    outlet_code    TEXT,
    outlet_name    TEXT,
    province       TEXT,
    district       TEXT,
    address        TEXT,
    status         TEXT,   -- ສະຖານະຕາມຂໍ້ມູນຕົ້ນທາງ (free text)
    notes          TEXT,
    extra_json     TEXT,   -- ຖັນອື່ນໆໃນ Excel ທີ່ບໍ່ຢູ່ໃນລາຍການຂ້າງເທິງ (ເກັບເປັນ JSON {"ຊື່ຖັນ":"ຄ່າ"})
    imported_by    TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cooler_master_qr       ON cooler_master(qr_norm);
CREATE INDEX idx_cooler_master_serial   ON cooler_master(serial_norm);
CREATE INDEX idx_cooler_master_capex    ON cooler_master(capex_norm);
CREATE INDEX idx_cooler_master_province ON cooler_master(province);
CREATE INDEX idx_cooler_master_outlet   ON cooler_master(outlet_code);

-- ===== index ຄົ້ນຫາແບບບໍ່ສົນຕົວພິມໃຫຍ່-ນ້ອຍ (migration_add_new_cooler_search_indexes.sql) =====
CREATE INDEX idx_new_coolers_qr_nc      ON new_coolers(qr_code COLLATE NOCASE);
CREATE INDEX idx_new_coolers_serial_nc  ON new_coolers(serial_number COLLATE NOCASE);
CREATE INDEX idx_new_coolers_capex_nc   ON new_coolers(capex COLLATE NOCASE);
CREATE INDEX idx_warehouse_stock_qr_nc     ON warehouse_stock(qr_code COLLATE NOCASE);
CREATE INDEX idx_warehouse_stock_serial_nc ON warehouse_stock(serial_number COLLATE NOCASE);
CREATE INDEX idx_warehouse_stock_capex_nc  ON warehouse_stock(capex COLLATE NOCASE);
CREATE INDEX idx_new_coolers_ship_plan ON new_coolers(status, ship_requested, trip_id);

-- Cooler Master perf (ດູ migration_add_cooler_master_perf.sql)
CREATE INDEX IF NOT EXISTS idx_assets_qr_nc      ON assets(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_assets_serial_nc  ON assets(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_assets_capex_nc   ON assets(capex COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_events_qr_nc     ON cooler_events(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_events_serial_nc ON cooler_events(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_events_capex_nc  ON cooler_events(capex COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_qr_nc     ON cooler_writeoffs(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_serial_nc ON cooler_writeoffs(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_capex_nc  ON cooler_writeoffs(capex COLLATE NOCASE);
DROP TABLE IF EXISTS cooler_master_stats;
CREATE TABLE cooler_master_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1), total INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT, provinces_json TEXT, refreshed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ໂໝດປິດລະບົບ (ເບິ່ງ migration_add_maintenance_mode.sql)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('maintenance_enabled', '0');
CREATE TABLE IF NOT EXISTS budget_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_team TEXT NOT NULL,
    to_team TEXT NOT NULL,
    cooler_brand TEXT,
    cooler_type TEXT,
    quantity INTEGER NOT NULL,
    note TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_budget_transfers_to_team ON budget_transfers(to_team, created_at);
