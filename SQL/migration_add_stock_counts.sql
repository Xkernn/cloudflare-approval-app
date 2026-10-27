-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມລະບົບ "ກວດນັບສາງປະຈຳເດືອນ" ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ (ບໍ່ DROP ຂໍ້ມູນເກົ່າ)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_stock_counts.sql

-- ຮອບກວດນັບ: 1 ສາງ + 1 ເດືອນ (period = 'YYYY-MM') = 1 ຮອບ
CREATE TABLE IF NOT EXISTS stock_counts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id INTEGER NOT NULL REFERENCES wh_warehouses(id),
    period       TEXT NOT NULL,                 -- 'YYYY-MM'
    status       TEXT NOT NULL DEFAULT 'open',  -- 'open' = ກຳລັງກວດນັບ, 'completed' = ປິດຮອບແລ້ວ
    notes        TEXT,
    started_by   TEXT,
    started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_by TEXT,
    completed_at DATETIME,
    UNIQUE (warehouse_id, period)
);

-- ລາຍການໃນແຕ່ລະຮອບ: ຖ່າຍ snapshot ສະຕັອກທີ່ "ຢູ່ໃນສາງ" ຕອນເລີ່ມຮອບ (expected = 1)
-- ແລະ ເກັບລາຍການທີ່ສະແກນເຈິແຕ່ບໍ່ຢູ່ໃນ snapshot (expected = 0, result = 'extra')
CREATE TABLE IF NOT EXISTS stock_count_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id      INTEGER NOT NULL REFERENCES stock_counts(id),
    stock_id      INTEGER,
    qr_code       TEXT,
    serial_number TEXT,
    capex         TEXT,
    cooler_brand  TEXT,
    cooler_type   TEXT,
    cooler_model  TEXT,
    expected      INTEGER NOT NULL DEFAULT 1,
    result        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'found' | 'missing' | 'extra'
    counted_by    TEXT,
    counted_at    DATETIME,
    notes         TEXT,
    UNIQUE (count_id, stock_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_counts_wh ON stock_counts(warehouse_id, period);
CREATE INDEX IF NOT EXISTS idx_sci_count ON stock_count_items(count_id, result);
