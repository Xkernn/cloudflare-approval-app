-- ປະຫວັດການເຄື່ອນໄຫວສະຕັອກສາງ (Warehouse Stock History) — ບັນທຶກທຸກການ ເພີ່ມ/ແກ້ໄຂ/ລຶບ ລາຍການໃນ warehouse_stock
-- ໃຊ້ໄຟລ໌ນີ້ກັບ DB ທີ່ deploy ໄປແລ້ວ (ຕ້ອງມີ migration_add_warehouse_stock_v2.sql ຮັນໄປກ່ອນແລ້ວ)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_warehouse_stock_history.sql

CREATE TABLE IF NOT EXISTS warehouse_stock_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id       INTEGER,           -- null ຖ້າລາຍການສະຕັອກຖືກລຶບໄປແລ້ວ
    warehouse_id   INTEGER NOT NULL,
    action         TEXT NOT NULL,     -- 'create' | 'update' | 'delete'
    cooler_brand   TEXT,
    cooler_type    TEXT,
    cooler_model   TEXT,
    qr_code        TEXT,
    serial_number  TEXT,
    capex          TEXT,
    old_status     TEXT,
    new_status     TEXT,
    changed_by     TEXT,              -- email ຂອງຜູ້ແກ້ໄຂ
    changed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_wsh_stock ON warehouse_stock_history(stock_id);
CREATE INDEX IF NOT EXISTS idx_wsh_warehouse ON warehouse_stock_history(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wsh_changed_at ON warehouse_stock_history(changed_at);
