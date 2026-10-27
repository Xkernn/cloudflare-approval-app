-- ใช้ไฟล์นี้เฉพาะกรณีที่ DB ถูก deploy ไปแล้วและมีข้อมูลอยู่ (ไม่ต้องการ DROP TABLE)
-- รันด้วยคำสั่ง: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_admin_verified.sql
-- (ทดสอบในเครื่อง: เปลี่ยน --remote เป็น --local)

-- ฟีเจอร์: ໜ້າ "ປະຫວັດການຈັດສົ່ງ Asset" (status = ສຳເລັດ) ໃຫ້ Admin ກົດຢືນຢັນວ່າໄດ້ກວດສອບ/ຢືນຢັນຄວາມຖືກຕ້ອງ
-- ຂອງລາຍການ (ຮູບ/ຂໍ້ມູນ) ແລ້ວ
ALTER TABLE assets ADD COLUMN admin_verified INTEGER DEFAULT 0;      -- 1 = Admin ຢືນຢັນຄວາມຖືກຕ້ອງແລ້ວ
ALTER TABLE assets ADD COLUMN admin_verified_at DATETIME;            -- ວັນເວລາທີ່ Admin ຢືນຢັນ
ALTER TABLE assets ADD COLUMN admin_verified_by TEXT;                -- Admin ຄົນທີ່ຢືນຢັນ (email)
