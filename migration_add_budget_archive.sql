-- Archive ງົບທີ່ໃຊ້ໝົດ/ໝົດປີ ເພື່ອເພີ່ມງົບປີໃໝ່ (Team + Brand + Type ດຽວກັນ) ໂດຍບໍ່ໃຫ້ຊ້ອນກັບຍອດຂອງປີເກົ່າ
--   archived_at   : ເວລາທີ່ archive (NULL = ງົບທີ່ໃຊ້ງານຢູ່) — ງົບ archive ບໍ່ຖືກນັບໃນການກວດໂຄຕ້າ/ເຕືອນສະຕ໋ອກ ແລະ ບໍ່ສະແດງໃນໜ້າງົບ
--   archived_used : ຍອດ "ໃຊ້ໄປແລ້ວ" ຕອນ archive (ເກັບໄວ້ເບິ່ງຍ້ອນຫຼັງ)
--   period_label  : ຊື່ຮອບງົບ ເຊັ່ນ 2026
--   period_start  : ນັບສະເພາະຄຳຂໍທີ່ຍື່ນຫຼັງເວລານີ້ (ງົບໃໝ່ = ເວລາ archive ຂອງງົບເກົ່າ ຈຶ່ງເລີ່ມນັບຈາກ 0)
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_budget_archive.sql
ALTER TABLE budgets ADD COLUMN archived_at DATETIME;
ALTER TABLE budgets ADD COLUMN archived_used INTEGER;
ALTER TABLE budgets ADD COLUMN period_label TEXT;
ALTER TABLE budgets ADD COLUMN period_start DATETIME;
