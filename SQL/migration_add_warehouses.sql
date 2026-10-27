-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມຕາຕະລາງ "ສາງ" (wh_warehouses) — ຈຸດເລີ່ມຕົ້ນຂອງໂມດູນຕູ້ແຊ່
-- (ອອກໃບຢືມ/ຍົກເລີກ/ສູນຫາຍ + ກວດນັບສາງ) — ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ (ບໍ່ DROP ຂໍ້ມູນເກົ່າ)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_warehouses.sql

CREATE TABLE IF NOT EXISTS wh_warehouses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    province   TEXT,
    is_main    INTEGER DEFAULT 0,
    active     INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO wh_warehouses (code, name, is_main, active) VALUES
    ('WMAIN', 'ສາງໃຫຍ່', 1, 1);
