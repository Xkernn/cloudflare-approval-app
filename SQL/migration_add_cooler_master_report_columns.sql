-- Cooler Master: ເພີ່ມຖັນ Channel, Grade, Lat/Long, Team, MDE, DSM, FSM (ຖັນ Village ໃຊ້ຖັນ address ທີ່ມີຢູ່ແລ້ວ)
-- Manage Lost Cooler ດຶງຄ່າເຫຼົ່ານີ້ຈາກ Master ມາຕື່ມໃຫ້ອັດຕະໂນມັດ. ຕາຕະລາງ lost_coolers ເພີ່ມຖັນ fsm.
-- ຮັນຄັ້ງດຽວ (ຫ້າມຮັນຊ້ຳ) ກ່ອນ deploy ໂຄດໃໝ່:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_master_report_columns.sql

ALTER TABLE cooler_master ADD COLUMN channel TEXT;
ALTER TABLE cooler_master ADD COLUMN grade TEXT;
ALTER TABLE cooler_master ADD COLUMN lat_position TEXT;
ALTER TABLE cooler_master ADD COLUMN long_position TEXT;
ALTER TABLE cooler_master ADD COLUMN team TEXT;
ALTER TABLE cooler_master ADD COLUMN mde TEXT;
ALTER TABLE cooler_master ADD COLUMN dsm TEXT;
ALTER TABLE cooler_master ADD COLUMN fsm TEXT;

ALTER TABLE lost_coolers ADD COLUMN fsm TEXT;
