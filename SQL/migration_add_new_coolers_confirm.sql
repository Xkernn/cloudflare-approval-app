-- ຕູ້ແຊ່ເຂົ້າໃຫມ່ - ເພີ່ມຂັ້ນ "ຢືນຢັນວ່າມີຕູ້" ກ່ອນ "ຮັບເຂົ້າສາງ" (2 ຂັ້ນຕອນ)
--   pending   = ຍັງບໍ່ໄດ້ສະແກນ
--   confirmed = ສະແກນ/ພິມຢືນຢັນແລ້ວວ່າມີຕູ້ (ລໍຖ້າຮັບເຂົ້າສາງ)
--   received  = ຮັບເຂົ້າສາງແລ້ວ
-- ຕ້ອງຮັນ migration_add_new_coolers.sql ໄປກ່ອນແລ້ວ. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_coolers_confirm.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE new_coolers ADD COLUMN confirmed_by TEXT;
ALTER TABLE new_coolers ADD COLUMN confirmed_at DATETIME;
