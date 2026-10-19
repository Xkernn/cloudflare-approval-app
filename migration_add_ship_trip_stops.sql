-- ລຳດັບແຂວງຂອງຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ (ship_trip_stops)
--   1 ແຖວ ຕໍ່ 1 ແຂວງ ຕໍ່ 1 ຖ້ຽວ: seq = ລຳດັບທີ່ລົດຈະໄປ
--   ສະຖານະສະແດງຜົນ (ຄິດໃນໜ້າເວັບ ຈາກ seq + ລິ້ງເຊັນຮັບ ship_trip_receipts):
--     ຜູ້ຮັບເຊັນຮັບແລ້ວ (status = 'signed')       -> "ລົດຮອດແຂວງນີ້ແລ້ວ"
--     ແຂວງທຳອິດ (ຕາມ seq) ທີ່ຍັງບໍ່ໄດ້ເຊັນຮັບ     -> "ກຳລັງໄປແຂວງນີ້"
--     ແຂວງທີ່ເຫຼືອ                               -> "ລົດຍັງບໍ່ຮອດ"
-- ບໍ່ແຕະຕາຕະລາງເກົ່າ. ຮັນດ້ວຍຄຳສັ່ງ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_ship_trip_stops.sql

CREATE TABLE IF NOT EXISTS ship_trip_stops (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id     INTEGER NOT NULL,
    province    TEXT NOT NULL,
    seq         INTEGER NOT NULL DEFAULT 0,
    UNIQUE (trip_id, province)
);
CREATE INDEX IF NOT EXISTS idx_ship_trip_stops_trip ON ship_trip_stops(trip_id);
