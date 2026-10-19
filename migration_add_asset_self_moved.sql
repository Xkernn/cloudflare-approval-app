-- ໃບ "ຕູ້ເຄື່ອນຍ້າຍ" / T- (ເກັບຄືນສາງ) ທີ່ຕິກ "ຍ້າຍເອງແລ້ວ": ບັນທຶກເຂົ້າ "ປະຫວັດການຈັດສົ່ງ" (status = ສຳເລັດ) ພ້ອມໄຮໄລ້ວ່າ MDE ຍ້າຍເອງ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_asset_self_moved.sql

ALTER TABLE assets ADD COLUMN self_moved INTEGER DEFAULT 0;  -- 1 = MDE ຍ້າຍເອງແລ້ວ (ບໍ່ຜ່ານການຈັດສົ່ງ)
