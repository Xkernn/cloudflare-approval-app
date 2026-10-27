-- ໃບເຊັນຮັບຕູ້ປາຍທາງ (ship_trip_receipts): ແຍກຕາມ "ສາງສະເພາະແຂວງ" — 1 ລິ້ງ ຕໍ່ 1 ແຂວງ + ສາງ ຕໍ່ 1 ຖ້ຽວ (ຜູ້ຮັບແຕ່ລະສາງເປັນຄົນລະຄົນ)
--   warehouse = '' ໝາຍເຖິງແຂວງທີ່ບໍ່ມີສາງສະເພາະແຂວງ (ຫຼື ໃບເກົ່າທີ່ເຮັດໄວ້ກ່ອນ) — ຄືກັບແບບເກົ່າທຸກຢ່າງ
--   UNIQUE ປ່ຽນເປັນ (trip_id, province, warehouse) — SQLite ແກ້ constraint ບໍ່ໄດ້ ຈຶ່ງສ້າງຕາຕະລາງໃໝ່ແລ້ວຄັດລອກ (ລິ້ງ/ລາຍເຊັນເກົ່າຍັງຢູ່ຄົບ)
-- ຮັນດ້ວຍຄຳສັ່ງ (ກ່ອນ deploy ໂຄ້ດໃໝ່, ຮັນຄັ້ງດຽວ):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_receipt_warehouse.sql

CREATE TABLE ship_trip_receipts_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id        INTEGER NOT NULL,
    province       TEXT NOT NULL,
    warehouse      TEXT NOT NULL DEFAULT '',
    token_hash     TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    expected_count INTEGER NOT NULL DEFAULT 0,
    expires_at     DATETIME NOT NULL,
    created_by     TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    receiver_name  TEXT,
    receiver_phone TEXT,
    received_count INTEGER,
    note           TEXT,
    sig_receiver   TEXT,
    signed_at      DATETIME,
    UNIQUE (trip_id, province, warehouse)
);
INSERT INTO ship_trip_receipts_new (id, trip_id, province, warehouse, token_hash, status, expected_count, expires_at, created_by, created_at, receiver_name, receiver_phone, received_count, note, sig_receiver, signed_at)
    SELECT id, trip_id, province, '', token_hash, status, expected_count, expires_at, created_by, created_at, receiver_name, receiver_phone, received_count, note, sig_receiver, signed_at FROM ship_trip_receipts;
DROP TABLE ship_trip_receipts;
ALTER TABLE ship_trip_receipts_new RENAME TO ship_trip_receipts;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ship_trip_receipts_token ON ship_trip_receipts(token_hash);
