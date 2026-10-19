-- ໃບສັນຍາຢືມ: ແຜນຜັງຈຸດວາງຕູ້ແຊ່ (MDE ແຕ້ມໃນຟອມ → ວາງລົງຊ່ອງ "ເຈົ້າຂອງຮ້ານ ຕົກລົງໃຫ້ບໍລິສັດຕັ້ງຕູ້ແຊ່ໄວ້ໃນພື້ນທີ່ ຕາມການກຳນົດຂອງບໍລິສັດເບຍລາວ ດັ່ງໃນແຜນຜັງລຸ່ມນີ້")
-- ເກັບເປັນ R2 key (bucket PHOTOS) ຂອງຮູບ PNG ຄືກັນກັບ sig_*
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_loan_layout_plan.sql
ALTER TABLE loan_contracts ADD COLUMN layout_plan TEXT;
