-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_delivery_photos_4.sql

-- ฟีเจอร์: ตอนยืนยันการจัดส่ง (รายงานการจัดส่ง) ให้ถ่ายรูปแยก 4 อย่าง แทนรูปเดียว
-- คอลัมน์เดิม delivery_photo ยังคงอยู่ (ไม่ลบ) เผื่อมีข้อมูลเก่าที่เคยบันทึกไว้
ALTER TABLE assets ADD COLUMN delivery_photo_qr TEXT;     -- รูปถ่าย QR Code
ALTER TABLE assets ADD COLUMN delivery_photo_serial TEXT; -- รูปถ่าย Serial Number
ALTER TABLE assets ADD COLUMN delivery_photo_capex TEXT;  -- รูปถ่าย CapEx
ALTER TABLE assets ADD COLUMN delivery_photo_asset TEXT;  -- รูปถ่าย Asset (ตู้เย็น)
