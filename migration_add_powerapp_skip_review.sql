-- ແທັບ "ລໍຖ້າຢືນຢັນ PowerApp" ໃນປະຫວັດການຈັດສົ່ງ (ລາຍງານຈັດສົ່ງທີ່ຂ້າມຂັ້ນຕອນ ຊັບມິດ PowerApp)
-- ຮັນຄັ້ງດຽວ: wrangler d1 execute <DB_NAME> --remote --file=migration_add_powerapp_skip_review.sql
ALTER TABLE assets ADD COLUMN powerapp_skipped INTEGER DEFAULT 0;
ALTER TABLE assets ADD COLUMN powerapp_skipped_from TEXT;
ALTER TABLE assets ADD COLUMN powerapp_confirmed INTEGER DEFAULT 0;
ALTER TABLE assets ADD COLUMN powerapp_confirmed_at DATETIME;
ALTER TABLE assets ADD COLUMN powerapp_confirmed_by TEXT;

-- (ບໍ່ບັງຄັບ) ເກັບກຳຂໍ້ມູນເກົ່າ: ລາຍການ "ສຳເລັດ" ທີ່ເຄີຍສະແກນຂຶ້ນລົດຕອນຍັງຢູ່ຂັ້ນກ່ອນ PowerApp ແລະ Admin ຍັງບໍ່ໄດ້ຢືນຢັນຄວາມຖືກຕ້ອງ
-- ຖ້າບໍ່ຢາກໃຫ້ຂໍ້ມູນເກົ່າເຂົ້າແທັບໃໝ່ ໃຫ້ລຶບ statement ລຸ່ມນີ້ອອກກ່ອນຮັນ
UPDATE assets SET powerapp_skipped = 1, powerapp_skipped_from = dispatch_prev_status
WHERE status = 'ສຳເລັດ' AND IFNULL(admin_verified, 0) = 0
  AND dispatch_prev_status IN ('ຍັງບໍ່ທັນເຊັນເອກະສານ', 'ຍັງບໍ່ຊັບມິດ PowerApp');

-- (ບໍ່ບັງຄັບ) ລາຍການ "MDE ຍ້າຍເອງ" ເກົ່າທີ່ Admin ຍັງບໍ່ໄດ້ຢືນຢັນຄວາມຖືກຕ້ອງ
UPDATE assets SET powerapp_skipped = 1, powerapp_skipped_from = 'MDE ຍ້າຍເອງ'
WHERE status = 'ສຳເລັດ' AND IFNULL(self_moved, 0) = 1 AND IFNULL(admin_verified, 0) = 0 AND IFNULL(powerapp_skipped, 0) = 0;
