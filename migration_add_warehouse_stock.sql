-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE ทั้งฐานข้อมูล)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_warehouse_stock.sql

-- ฟีเจอร์: Warehouse Management - ติดตามสต็อกในคลังทีละชิ้นด้วย QR Code / Serial Number
--
-- หมายเหตุ: ถ้าเคยรัน migration เวอร์ชันเก่า (แบบนับจำนวน quantity) ไปแล้ว ให้ลบตารางเดิมทิ้งก่อน
-- (ข้อมูลใน warehouse_stock เดิมจะหายไป ถ้ามีข้อมูลสำคัญให้ backup ก่อนรัน)
DROP TABLE IF EXISTS warehouse_stock;

CREATE TABLE warehouse_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_name TEXT,
    cooler_status TEXT DEFAULT 'new', -- 'new' = ใหม่, 'second_hand' = มือสอง, 'broken' = ชำรุด
    cooler_brand TEXT NOT NULL,
    cooler_type TEXT NOT NULL,
    cooler_model TEXT,
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    status TEXT DEFAULT 'in_warehouse', -- 'in_warehouse' = อยู่ในคลัง, 'outlet' = ออกไปหน้าร้านแล้ว, 'write_off' = ตัดจำหน่าย
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
