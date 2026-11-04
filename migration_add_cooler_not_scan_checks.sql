-- "ລົງກວດແລ້ວ" ຂອງ Cooler Not Scan: ຜົນການລົງກວດຕູ້ (ພົບຢູ່ຮ້ານ / ບໍ່ເຫັນແລ້ວ) + ຮູບຢືນຢັນ (R2 key ໃຕ້ cnscheck/)
-- ຮັນຫຼັງ migration_add_cooler_not_scan.sql
ALTER TABLE cooler_not_scan ADD COLUMN last_check_result TEXT;      -- found | missing
ALTER TABLE cooler_not_scan ADD COLUMN last_check_at DATETIME;
CREATE TABLE IF NOT EXISTS cooler_not_scan_checks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id       INTEGER,               -- cooler_not_scan.id
    qr_code       TEXT,
    outlet_code   TEXT,
    outlet_name   TEXT,
    province      TEXT,
    cooler_brand  TEXT,
    cooler_type   TEXT,
    serial_number TEXT,
    result        TEXT NOT NULL,         -- found = ຕູ້ຍັງພົບຢູ່ຮ້ານ | missing = ຕູ້ບໍ່ເຫັນແລ້ວ
    photo         TEXT,                  -- R2 key (cnscheck/...)
    note          TEXT,
    checked_by    TEXT,
    checked_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cns_checks_scan ON cooler_not_scan_checks(scan_id);
CREATE INDEX IF NOT EXISTS idx_cns_checks_at   ON cooler_not_scan_checks(checked_at);
