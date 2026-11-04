-- ເມນູ "Cooler Not Scan" (admin + ຜູ້ຊ່ວຍ admin): ລາຍການຕູ້ທີ່ຍັງບໍ່ໄດ້ສະແກນ — Import ຈາກ Excel (Outlet Code + QR Code + Latest Scan)
-- ຈັບຄູ່ Outlet Master Data (outlets.code) ແລະ Cooler Master (cooler_master.qr_norm) ຕອນ Import / ກົດ "ຈັບຄູ່ໃໝ່"
CREATE TABLE IF NOT EXISTS cooler_not_scan (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    outlet_code      TEXT,                 -- ຄ່າຕາມ Excel
    outlet_code_norm TEXT,                 -- trim + UPPER
    qr_code          TEXT,                 -- ຄ່າຕາມ Excel
    qr_norm          TEXT NOT NULL,        -- trim + UPPER (ຊ້ຳບໍ່ໄດ້: 1 QR = 1 ແຖວ)
    latest_scan      TEXT,                 -- ວັນທີສະແກນຫຼ້າສຸດ (YYYY-MM-DD ຫຼື YYYY-MM-DD HH:MM) ຖ້າອ່ານໄດ້
    latest_scan_raw  TEXT,                 -- ຂໍ້ຄວາມຕົ້ນສະບັບໃນ Excel
    outlet_id        INTEGER,              -- -> outlets.id (NULL = ບໍ່ພົບໃນ Outlet Master)
    master_id        INTEGER,              -- -> cooler_master.id (NULL = ບໍ່ພົບໃນ Cooler Master)
    imported_by      TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cns_qr_norm   ON cooler_not_scan(qr_norm);
CREATE INDEX IF NOT EXISTS idx_cns_outlet_norm      ON cooler_not_scan(outlet_code_norm);
CREATE INDEX IF NOT EXISTS idx_cns_latest_scan      ON cooler_not_scan(latest_scan);
