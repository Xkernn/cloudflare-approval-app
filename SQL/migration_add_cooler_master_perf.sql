-- ຫຼຸດ Rows Read ຂອງ "ຄົ້ນຫາຕູ້ (Cooler Master)"
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_master_perf.sql
-- (ຮັນກ່ອນ/ພ້ອມ deploy ໂຄດໃໝ່)

-- 1) NOCASE index ໃຫ້ຕາຕະລາງທີ່ໃຊ້ຫາ "ຕຳແໜ່ງໃນລະບົບ" (ເມື່ອກ່ອນ scan ທັງຕາຕະລາງ)
CREATE INDEX IF NOT EXISTS idx_assets_qr_nc      ON assets(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_assets_serial_nc  ON assets(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_assets_capex_nc   ON assets(capex COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_cooler_events_qr_nc     ON cooler_events(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_events_serial_nc ON cooler_events(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_events_capex_nc  ON cooler_events(capex COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_qr_nc     ON cooler_writeoffs(qr_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_serial_nc ON cooler_writeoffs(serial_number COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_capex_nc  ON cooler_writeoffs(capex COLLATE NOCASE);

-- 2) Cache ສະຖິຕິ (ຈຳນວນ + ແຂວງ) 1 ແຖວ — ອັບເດດຕອນ Import ຈົບ/ລຶບ ແທນການນັບໃໝ່ທຸກເທື່ອທີ່ເປີດໜ້າ
CREATE TABLE IF NOT EXISTS cooler_master_stats (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    total          INTEGER NOT NULL DEFAULT 0,
    last_updated   TEXT,
    provinces_json TEXT,
    refreshed_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

ANALYZE;
