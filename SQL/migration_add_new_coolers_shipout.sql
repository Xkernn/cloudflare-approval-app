-- ຕູ້ແຊ່ເຂົ້າໃຫມ່ - ເພີ່ມກໍລະນີ "ຕູ້ເຂົ້າມາໃໝ່ ແຕ່ບໍ່ໄດ້ເຂົ້າສາງ ຖືກສົ່ງອອກໄປຕ່າງແຂວງເລີຍ"
--   status ໃໝ່: shipped_out = ສົ່ງອອກຕ່າງແຂວງແລ້ວ (ບໍ່ຜ່ານສາງ, ບໍ່ສ້າງແຖວໃນ warehouse_stock)
-- ຕ້ອງຮັນ migration_add_new_coolers.sql ແລະ migration_add_new_coolers_confirm.sql ໄປກ່ອນແລ້ວ. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_coolers_shipout.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE new_coolers ADD COLUMN ship_province TEXT;
ALTER TABLE new_coolers ADD COLUMN ship_note TEXT;
ALTER TABLE new_coolers ADD COLUMN shipped_by TEXT;
ALTER TABLE new_coolers ADD COLUMN shipped_at DATETIME;
