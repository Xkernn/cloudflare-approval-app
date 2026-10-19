-- ຫຼຸດ Rows Read ຂອງ D1 ໃນຟັງຊັນ "ຕູ້ແຊ່ເຂົ້າໃຫມ່"
-- ເມື່ອກ່ອນ query ໃຊ້ UPPER(qr_code) = ... ເຮັດໃຫ້ SQLite ບໍ່ສາມາດໃຊ້ index ແລະ scan ທັງຕາຕະລາງທຸກຄັ້ງທີ່ສະແກນ.
-- ດຽວນີ້ໂຄດໃຊ້ "col COLLATE NOCASE = ?" ຊຶ່ງຕ້ອງມີ index ແບບ NOCASE ຕໍ່ໄປນີ້ (ບໍ່ປ່ຽນຂໍ້ມູນເດີມ).
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_cooler_search_indexes.sql
-- (ຕ້ອງຮັນກ່ອນ/ພ້ອມ deploy ໂຄດໃໝ່ — ຖ້າບໍ່ຮັນ ລະບົບຍັງເຮັດວຽກໄດ້ ແຕ່ຈະຍັງ scan ທັງຕາຕະລາງຢູ່)

CREATE INDEX IF NOT EXISTS idx_new_coolers_qr_nc      ON new_coolers(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_new_coolers_serial_nc  ON new_coolers(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_new_coolers_capex_nc   ON new_coolers(capex COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_qr_nc     ON warehouse_stock(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_serial_nc ON warehouse_stock(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_capex_nc  ON warehouse_stock(capex COLLATE NOCASE);

-- ແຜນສົ່ງຕູ້: WHERE status='confirmed' AND ship_requested=1 AND trip_id IS NULL
CREATE INDEX IF NOT EXISTS idx_new_coolers_ship_plan ON new_coolers(status, ship_requested, trip_id);

-- ສາມາດລຶບ index ເກົ່າທີ່ບໍ່ໄດ້ໃຊ້ແລ້ວ (ບໍ່ຈຳເປັນ ແຕ່ຊ່ວຍປະຢັດພື້ນທີ່/ຄ່າຂຽນ):
--   DROP INDEX IF EXISTS idx_new_coolers_qr;  DROP INDEX IF EXISTS idx_new_coolers_serial;  DROP INDEX IF EXISTS idx_new_coolers_capex;

ANALYZE;
