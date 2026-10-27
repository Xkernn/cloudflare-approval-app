-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_delivery_photo_document.sql
-- (ทดสอบในเครื่อง: เปลี่ยน --remote เป็น --local)
-- ต้องรันก่อน deploy โค้ดใหม่ ไม่เช่นนั้นการยืนยันการจัดส่งจะ error

-- ฟีเจอร์: รายงานการจัดส่ง เพิ่มรูปถ่าย "เอกสาร" อีก 1 รูป (รวมเป็น 5 รูป)
ALTER TABLE assets ADD COLUMN delivery_photo_document TEXT; -- รูปถ่ายเอกสาร
