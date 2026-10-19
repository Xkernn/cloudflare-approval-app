-- ເພີ່ມ column old_warehouse_id ໃນ warehouse_stock_history
-- ໃຊ້ບັນທຶກ "ສາງເກົ່າ" ກ່ອນຍ້າຍ ເພື່ອໃຫ້ຟັງຊັນ "ປະຫວັດ" ໃນເມນູສະຕັອກສາງ ສະແດງເປັນ
-- ປະຫວັດການເຄື່ອນຍ້າຍຂອງ asset (ເຄີຍຢູ່ສາງໃດມາກ່ອນ -> ຍ້າຍໄປສາງໃດ) ແທນທີ່ຈະເປັນແຄ່ log ການແກ້ໄຂທົ່ວໄປ
-- ໃຊ້ໄຟລ໌ນີ້ກັບ DB ທີ່ deploy ໄປແລ້ວ (ຕ້ອງມີ migration_add_warehouse_stock_history.sql ຮັນໄປກ່ອນແລ້ວ)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_warehouse_stock_history_old_location.sql

ALTER TABLE warehouse_stock_history ADD COLUMN old_warehouse_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_wsh_old_warehouse ON warehouse_stock_history(old_warehouse_id);
