-- ແຜນຂອງຖ້ຽວລົດ (ສ້າງຖ້ຽວຈາກ "ແຜນສົ່ງຕູ້ແຊ່ຕ່າງແຂວງ")
--   ຖ້ຽວທີ່ສ້າງຈາກແຜນ = ລໍຖ້າຈັດຕູ້ຂຶ້ນລົດ (ຍັງບໍ່ມີຕູ້ໃນຖ້ຽວ). ແຜນເກັບເປັນລາຍການ: ແຂວງ / ສາງ / ຊະນິດຕູ້ (truck_cooler_sizes) / ຈຳນວນ
--   ຕອນສະແກນ ຫຼື ເລືອກຕູ້ຂຶ້ນລົດ ລະບົບຈະຮັບສະເພາະຕູ້ທີ່ຕົງກັບແຜນ (ແຂວງ/ສາງ + ຊະນິດຕູ້ ຕາມ Type/Model) ແລະ ຍັງບໍ່ເກີນຈຳນວນໃນແຜນ
--   warehouse = '' ໝາຍເຖິງ ບໍ່ກຳນົດສາງ (ຮັບໄດ້ທຸກສາງໃນແຂວງນັ້ນ)
--   ຖ້ຽວທີ່ບໍ່ມີແຖວໃນຕາຕະລາງນີ້ = ຖ້ຽວແບບເກົ່າ (ເພີ່ມຕູ້ໄດ້ອິດສະຫຼະ)
-- ຮັນດ້ວຍຄຳສັ່ງ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_ship_trip_plan_items.sql

CREATE TABLE IF NOT EXISTS ship_trip_plan_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id    INTEGER NOT NULL,
    province   TEXT NOT NULL,
    warehouse  TEXT NOT NULL DEFAULT '',
    size_id    INTEGER NOT NULL,          -- truck_cooler_sizes.id
    size_label TEXT,                      -- ຊື່ຊະນິດຕູ້ ຕອນສ້າງແຜນ (ໄວ້ສະແດງ)
    qty        INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ship_trip_plan_items_trip ON ship_trip_plan_items(trip_id);
