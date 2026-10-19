-- เพิ่มคอลัมน์สำหรับฟีเจอร์ "รายงานการจัดส่ง" (สแกน QR + ถ่ายรูปยืนยัน -> Status = ສຳເລັດ)
-- รันครั้งเดียวกับ DB ที่มีข้อมูลอยู่แล้ว: npx wrangler d1 execute <database_name> --file=./migration_add_delivery_confirmation.sql

ALTER TABLE assets ADD COLUMN delivery_photo TEXT;   -- รูปถ่ายยืนยันตอนจัดส่งสำเร็จ (เก็บเป็น base64)
ALTER TABLE assets ADD COLUMN delivered_at DATETIME; -- วันเวลาที่ยืนยันจัดส่งสำเร็จ
ALTER TABLE assets ADD COLUMN delivered_by TEXT;     -- ผู้ยืนยันจัดส่ง (email)
