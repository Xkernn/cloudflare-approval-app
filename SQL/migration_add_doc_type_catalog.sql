-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_doc_type_catalog.sql

-- ฟีเจอร์: จัดการ Doc Type เป็น Master List ที่ Admin เพิ่ม/แก้ไข/ลบเองได้ผ่านหน้า Admin
-- (แทนการ hardcode ตัวเลือกไว้ในหน้าเว็บ)
CREATE TABLE IF NOT EXISTS doc_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ค่าเริ่มต้น 5 รายการ (ชุดเดิมที่เคย hardcode ไว้ในฟอร์ม)
INSERT OR IGNORE INTO doc_types (name) VALUES
    ('ເກັບຄືນສາງ'),
    ('ຕູ້ປ່ຽນແທນ'),
    ('ຕູ້ເຄື່ອນຍ້າຍ'),
    ('ມອບຕູ້ໃຫມ່ຄັ້ງແລກ'),
    ('ມອບຕູ້ເພີ່ມ');

-- ดึง Doc Type ที่มีอยู่แล้วในข้อมูลจริง (assets / asset_requests) มาใส่ด้วย
-- เพื่อไม่ให้ค่าเดิมที่เคยพิมพ์อิสระหายไปจาก Dropdown หลังอัปเดต
INSERT OR IGNORE INTO doc_types (name)
  SELECT DISTINCT doc_type FROM assets WHERE doc_type IS NOT NULL AND doc_type != ''
  UNION
  SELECT DISTINCT doc_type FROM asset_requests WHERE doc_type IS NOT NULL AND doc_type != '';
