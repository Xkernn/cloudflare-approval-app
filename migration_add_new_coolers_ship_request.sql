-- ຕູ້ແຊ່ເຂົ້າໃຫມ່ - ຂັ້ນ 1 (ສະແກນຢືນຢັນ) ໝາຍຕິກ "ສົ່ງອອກຕ່າງແຂວງ" ໄດ້ເລີຍ
--   ship_requested = 1 -> ຢືນຢັນວ່າມີຕູ້ແລ້ວ ແລະ ຖືກບັນທຶກໄປໜ້າ "ສົ່ງອອກຕ່າງແຂວງ" ສະຖານະ "ລໍຖ້າຢືນຢັນ" (ຍັງບໍ່ເຂົ້າສາງ)
--   ເມື່ອກົດ "ຢືນຢັນສົ່ງອອກ" ໃນໜ້າສົ່ງອອກຕ່າງແຂວງ -> status = 'shipped_out'
-- ຕ້ອງຮັນ migration_add_new_coolers.sql, ..._confirm.sql ແລະ ..._shipout.sql ໄປກ່ອນແລ້ວ. ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_coolers_ship_request.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE new_coolers ADD COLUMN ship_requested INTEGER NOT NULL DEFAULT 0;
