-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_asset_condition.sql

-- ฟีเจอร์: แยกคำขอ "ใหม่" (ตัดงบ) กับ "มือสอง" (ไม่ตัดงบ)
ALTER TABLE asset_requests ADD COLUMN asset_condition TEXT DEFAULT 'new';
ALTER TABLE assets ADD COLUMN asset_condition TEXT DEFAULT 'new';

-- ฟีเจอร์: กรอก QR Code / Serial Number / CapEx ตอนอนุมัติ
ALTER TABLE asset_requests ADD COLUMN qr_code TEXT;
ALTER TABLE asset_requests ADD COLUMN serial_number TEXT;
ALTER TABLE asset_requests ADD COLUMN capex TEXT;
ALTER TABLE assets ADD COLUMN qr_code TEXT;
ALTER TABLE assets ADD COLUMN serial_number TEXT;
ALTER TABLE assets ADD COLUMN capex TEXT;
