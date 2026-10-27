-- ຫຼຸດ Rows Read ຂອງ GET /api/admin/ship-trips (ນັບຕູ້/ນັບສະແກນ/ແຂວງ ຕໍ່ຖ້ຽວ)
-- Covering index: query ອ່ານຈາກ index ຢ່າງດຽວ ບໍ່ຕ້ອງໄປອ່ານແຖວໃນຕາຕະລາງຕື່ມ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_trip_count_indexes.sql
-- (idx_new_coolers_trip / idx_ship_trip_stock_trip ເກົ່າຖືກແທນທີ່ໂດຍ index ໃໝ່ນີ້ແລ້ວ — ລຶບໄດ້ ແຕ່ບໍ່ຈຳເປັນ)

CREATE INDEX IF NOT EXISTS idx_new_coolers_trip_cover ON new_coolers(trip_id, trip_scanned_at, ship_province);
CREATE INDEX IF NOT EXISTS idx_ship_trip_stock_trip_cover ON ship_trip_stock(trip_id, scanned_at, ship_province);
ANALYZE;
