-- ປິດລ໋ອດ: ຫຼັງປິດ ເພີ່ມຕູ້ເຂົ້າລ໋ອດນັ້ນບໍ່ໄດ້ອີກ (ຕ້ອງຮັນ migration_add_new_cooler_receipts.sql ກ່ອນ)
-- ຮັນຄັ້ງດຽວ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_cooler_receipts_close.sql
ALTER TABLE new_cooler_receipts ADD COLUMN closed_at DATETIME;
ALTER TABLE new_cooler_receipts ADD COLUMN closed_by TEXT;
