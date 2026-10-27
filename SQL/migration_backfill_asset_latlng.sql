-- ເຕີມພິກັດ Asset Tracking ທີ່ຍັງວ່າງ ຈາກ Outlet Master ຕາມ Outlet Code (ຮັນຄັ້ງດຽວ, ບໍ່ທັບພິກັດທີ່ມີຢູ່ແລ້ວ)
-- wrangler d1 execute <DB_NAME> --remote --file=migration_backfill_asset_latlng.sql
UPDATE assets
SET latitude  = (SELECT o.latitude  FROM outlets o WHERE o.code = assets.outlet_code AND o.latitude  IS NOT NULL AND o.longitude IS NOT NULL ORDER BY o.active DESC LIMIT 1),
    longitude = (SELECT o.longitude FROM outlets o WHERE o.code = assets.outlet_code AND o.latitude  IS NOT NULL AND o.longitude IS NOT NULL ORDER BY o.active DESC LIMIT 1)
WHERE (latitude IS NULL OR longitude IS NULL)
  AND outlet_code IS NOT NULL AND outlet_code <> ''
  AND EXISTS (SELECT 1 FROM outlets o WHERE o.code = assets.outlet_code AND o.latitude IS NOT NULL AND o.longitude IS NOT NULL);
