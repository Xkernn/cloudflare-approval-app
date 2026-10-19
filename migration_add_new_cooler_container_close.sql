-- ປິດຮອບສະແກນຄອນເທນເນີຕູ້ແຊ່ເຂົ້າໃຫມ່ (ສະຫຼຸບຜົນ ຂາດ/ເກີນ ແລ້ວກົດ "ປິດຮອບ")
-- ຄອນເທນເນີທີ່ປິດຮອບແລ້ວ ຈະຜູກຕູ້ເພີ່ມບໍ່ໄດ້ (ຄືກັບສະແກນຄົບຈຳນວນ) ຈົນກວ່າ admin ຈະ "ເປີດຮອບຄືນ"
-- ຕ້ອງຮັນ migration_add_new_cooler_containers.sql ໄປກ່ອນ. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_cooler_container_close.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE new_cooler_containers ADD COLUMN closed_at DATETIME;
ALTER TABLE new_cooler_containers ADD COLUMN closed_by TEXT;
ALTER TABLE new_cooler_containers ADD COLUMN close_note TEXT;
ALTER TABLE new_cooler_containers ADD COLUMN closed_expected INTEGER;  -- ຈຳນວນທີ່ຄາດໄວ້ ຕອນປິດຮອບ
ALTER TABLE new_cooler_containers ADD COLUMN closed_scanned INTEGER;   -- ຈຳນວນທີ່ສະແກນໄດ້ ຕອນປິດຮອບ
