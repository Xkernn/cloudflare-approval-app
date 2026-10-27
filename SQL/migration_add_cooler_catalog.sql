-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_catalog.sql

-- ฟีเจอร์: จัดการ Cooler Brand / Cooler Type เป็น Master List ที่ Admin เซ็ตอัพเองได้ผ่านหน้า Admin
-- (แทนการกรอกข้อความอิสระในฟอร์ม Asset/Budget)
CREATE TABLE IF NOT EXISTS cooler_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cooler_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ดึงชื่อ Brand/Type ที่มีอยู่แล้วในระบบ (จากตาราง assets และ budgets) มาใส่เป็นค่าเริ่มต้น
-- เพื่อไม่ให้ตัวเลือกเดิมหายไปจาก Dropdown หลังอัปเดต
INSERT OR IGNORE INTO cooler_brands (name)
  SELECT DISTINCT cooler_brand FROM assets WHERE cooler_brand IS NOT NULL AND cooler_brand != ''
  UNION
  SELECT DISTINCT cooler_brand FROM budgets WHERE cooler_brand IS NOT NULL AND cooler_brand != '';

INSERT OR IGNORE INTO cooler_types (name)
  SELECT DISTINCT cooler_type FROM assets WHERE cooler_type IS NOT NULL AND cooler_type != ''
  UNION
  SELECT DISTINCT cooler_type FROM budgets WHERE cooler_type IS NOT NULL AND cooler_type != '';
