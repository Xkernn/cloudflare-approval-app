-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_asset_latlng.sql

-- ฟีเจอร์: Map Tracking - บันทึกพิกัด Latitude/Longitude ของแต่ละ Asset เพื่อแสดงบนแผนที่
ALTER TABLE assets ADD COLUMN latitude REAL;
ALTER TABLE assets ADD COLUMN longitude REAL;
