-- ຖ້ຽວລົດສົ່ງອອກຕ່າງແຂວງ (ship_trips) — ລົດ 1 ຄັນ ເອົາຕູ້ຫຼາຍແຂວງໃສ່ຖ້ຽວດຽວກັນໄດ້ ແລ້ວພິມໃບສົ່ງ
--   status = 'open'     : ກຳລັງຈັດຕູ້ຂຶ້ນລົດ (ເພີ່ມ/ເອົາຕູ້ອອກ/ແກ້ໄຂໄດ້)
--   status = 'departed' : ລົດອອກແລ້ວ (ຕູ້ໃນຖ້ຽວທັງໝົດເປັນ shipped_out)
-- ເພີ່ມຄໍລຳ new_coolers.trip_id ເພື່ອບອກວ່າຕູ້ຢູ່ໃນຖ້ຽວໃດ
-- ຕ້ອງຮັນ migration_add_new_coolers*.sql ໄປກ່ອນແລ້ວ ແລະ ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_ship_trips.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

CREATE TABLE IF NOT EXISTS ship_trips (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_no       TEXT NOT NULL UNIQUE,              -- TRP-YYYYMMDD-NN
    truck_plate   TEXT NOT NULL,                     -- ທະບຽນລົດ
    driver_name   TEXT,
    driver_phone  TEXT,
    trip_date     TEXT,                              -- ວັນທີອອກລົດ (YYYY-MM-DD)
    note          TEXT,
    status        TEXT NOT NULL DEFAULT 'open',      -- 'open' | 'departed'
    created_by    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    departed_by   TEXT,
    departed_at   DATETIME
);

ALTER TABLE new_coolers ADD COLUMN trip_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_new_coolers_trip ON new_coolers(trip_id);

-- ຕູ້ຈາກ "ສາງ" (warehouse_stock) ທີ່ເອົາໄປກັບຖ້ຽວລົດ: ເພີ່ມເຂົ້າຖ້ຽວ -> ສະຕັອກເປັນ 'reserved' (ຈອງແລ້ວ), ລົດອອກ -> 'shipped_out' (ສົ່ງຕ່າງແຂວງແລ້ວ)
-- ເອົາອອກຈາກຖ້ຽວ / ລຶບຖ້ຽວ -> ກັບເປັນ 'in_warehouse'. ແຂວງປາຍທາງເກັບຢູ່ຕາຕະລາງນີ້ (ເພາະ warehouse_stock ບໍ່ມີຄໍລຳແຂວງ)
CREATE TABLE IF NOT EXISTS ship_trip_stock (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id       INTEGER NOT NULL REFERENCES ship_trips(id),
    stock_id      INTEGER NOT NULL UNIQUE REFERENCES warehouse_stock(id),  -- ຕູ້ 1 ໜ່ວຍ ຢູ່ໄດ້ 1 ຖ້ຽວ
    ship_province TEXT,
    ship_note     TEXT,
    added_by      TEXT,
    added_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ship_trip_stock_trip ON ship_trip_stock(trip_id);
