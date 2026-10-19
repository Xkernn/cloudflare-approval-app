-- ລິ້ງເຊັນຮັບຕູ້ປາຍທາງ (ໃຊ້ໄດ້ຄັ້ງດຽວ) ຂອງຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ — 1 ລິ້ງ ຕໍ່ 1 ແຂວງ ຕໍ່ 1 ຖ້ຽວ
--   token ຈິງບໍ່ຖືກເກັບ (ເກັບສະເພາະ SHA-256 hash) — ລິ້ງສະແດງຕອນສ້າງເທົ່ານັ້ນ, ເສຍລິ້ງ = ສ້າງໃໝ່ (ລິ້ງເກົ່າໃຊ້ບໍ່ໄດ້)
--   status: 'pending' = ລໍຖ້າເຊັນ, 'signed' = ເຊັນແລ້ວ (ລິ້ງໃຊ້ບໍ່ໄດ້ອີກ)
--   sig_receiver: key ລາຍເຊັນ (PNG) ໃນ R2 bucket PHOTOS (trip/<trip_id>/recv-*.png)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_ship_trip_receipts.sql

CREATE TABLE IF NOT EXISTS ship_trip_receipts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id        INTEGER NOT NULL,
    province       TEXT NOT NULL,
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
    UNIQUE (trip_id, province)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ship_trip_receipts_token ON ship_trip_receipts(token_hash);
