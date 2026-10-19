-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_no_doc_delivery_old_outlet.sql

-- ฟีเจอร์: หน้า "ລາຍງານຈັດສົ່ງບໍ່ມີເອກະສານ" (no-doc delivery) ต้องรองรับ Doc Type "ຕູ້ເຄື່ອນຍ້າຍ"
-- (ตู้เคลื่อนย้าย) เหมือนหน้า Asset ปกติ จึงต้องเก็บข้อมูลร้านเดิม (Outlet Code/Name) และ Lat/Long ของร้านเดิมไว้ด้วย
ALTER TABLE no_doc_deliveries ADD COLUMN old_outlet_code TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN old_outlet_name TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN old_latitude REAL;
ALTER TABLE no_doc_deliveries ADD COLUMN old_longitude REAL;
