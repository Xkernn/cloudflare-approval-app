-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_old_outlet_info.sql

-- ฟีเจอร์: Doc Type "ຕູ້ເຄື່ອນຍ້າຍ" (ตู้เคลื่อนย้าย) ต้องเก็บข้อมูลร้านเดิม (Outlet Code/Name) และ Lat/Long ของร้านเดิมไว้ด้วย
ALTER TABLE assets ADD COLUMN old_outlet_code TEXT;
ALTER TABLE assets ADD COLUMN old_outlet_name TEXT;
ALTER TABLE assets ADD COLUMN old_latitude REAL;
ALTER TABLE assets ADD COLUMN old_longitude REAL;
