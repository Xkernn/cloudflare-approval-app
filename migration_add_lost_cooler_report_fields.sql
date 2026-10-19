-- Manage Lost Cooler Master Data: ເພີ່ມຖັນສຳລັບ Import Excel ທີ່ທີມງານສົ່ງມາ
--   (Channel, Grade, Village, Lat/Long, DSM, MDE, Team, date submit)
-- ຮັນຄັ້ງດຽວ (ຫ້າມຮັນຊ້ຳ — SQLite ບໍ່ຮອງຮັບ ADD COLUMN IF NOT EXISTS) ຫຼັງຈາກ migration_add_lost_coolers.sql:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_lost_cooler_report_fields.sql

ALTER TABLE lost_coolers ADD COLUMN channel TEXT;
ALTER TABLE lost_coolers ADD COLUMN grade TEXT;
ALTER TABLE lost_coolers ADD COLUMN village TEXT;
ALTER TABLE lost_coolers ADD COLUMN lat_position TEXT;
ALTER TABLE lost_coolers ADD COLUMN long_position TEXT;
ALTER TABLE lost_coolers ADD COLUMN dsm TEXT;
ALTER TABLE lost_coolers ADD COLUMN mde TEXT;
ALTER TABLE lost_coolers ADD COLUMN team TEXT;
ALTER TABLE lost_coolers ADD COLUMN submit_date TEXT;   -- "date submit" ຕາມໄຟລ໌ Excel (ຮູບແບບ YYYY-MM-DD)
