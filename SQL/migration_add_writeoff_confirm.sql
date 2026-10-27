-- ລາຍງານຕູ້ແຊ່ສະສາງ: ຕ້ອງໃຫ້ Admin ຢືນຢັນອີກຄັ້ງ
--   ຫຼັງບັນທຶກລາຍງານ -> ສະຖານະສະຕັອກ = 'pending_write_off' (ລໍຖ້າສະສາງ), ລາຍງານ status = 'pending'
--   Admin ກົດຢືນຢັນ -> ສະຕັອກ = 'write_off' (ສະສາງ), ລາຍງານ status = 'confirmed'
-- ລາຍງານເກົ່າທີ່ມີຢູ່ແລ້ວຖືກຕັ້ງເປັນ 'confirmed' (ຄ່າ default) - ບໍ່ກະທົບສະຕັອກເກົ່າ
-- ຕ້ອງຮັນ "ກ່ອນ" deploy ໂຄດໃໝ່:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_writeoff_confirm.sql
-- (ທົດສອບໃນເຄື່ອງ: ປ່ຽນ --remote ເປັນ --local)

ALTER TABLE cooler_writeoffs ADD COLUMN status TEXT DEFAULT 'confirmed';   -- pending | confirmed
ALTER TABLE cooler_writeoffs ADD COLUMN confirmed_by TEXT;
ALTER TABLE cooler_writeoffs ADD COLUMN confirmed_at DATETIME;
