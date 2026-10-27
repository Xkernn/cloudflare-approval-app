-- ລ໋ອດ + ຄອນເທນເນີ ຂອງຕູ້ທີ່ຮັບເຂົ້າສາງ (ໜ້າ "ຕູ້ແຊ່ເຂົ້າໃຫມ່" > ຮັບເຂົ້າສາງ)
-- 1 ການຮັບເຂົ້າ = 1 ແຖວ: ເລກລ໋ອດ, ຈຳນວນຄອນເທນເນີ, ຈຳນວນໜ່ວຍຂອງແຕ່ລະຄອນ (JSON ເຊັ່ນ [40,40,38]) — ບໍ່ຜູກກັບຕູ້ແຕ່ລະໜ່ວຍ
-- ຕູ້ທີ່ຮັບເຂົ້າສຳເລັດຈະມີ receipt_id + lot_no ໃນ new_coolers
-- ຕ້ອງຮັນກ່ອນ deploy: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_cooler_receipts.sql
-- (ALTER TABLE ... ADD COLUMN ຮັນຊ້ຳບໍ່ໄດ້ — ຮັນຄັ້ງດຽວເທົ່ານັ້ນ)

CREATE TABLE IF NOT EXISTS new_cooler_receipts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_no           TEXT NOT NULL,
    container_count  INTEGER NOT NULL DEFAULT 0,
    container_units  TEXT,                             -- JSON array ຈຳນວນໜ່ວຍຂອງແຕ່ລະຄອນເທນເນີ
    total_units      INTEGER NOT NULL DEFAULT 0,       -- ຜົນບວກຂອງ container_units (ທີ່ແຈ້ງ)
    received_count   INTEGER NOT NULL DEFAULT 0,       -- ຈຳນວນຕູ້ທີ່ຮັບເຂົ້າສາງສຳເລັດຈິງ
    warehouse_id     INTEGER REFERENCES wh_warehouses(id),
    note             TEXT,
    received_by      TEXT,
    received_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_new_cooler_receipts_lot ON new_cooler_receipts(lot_no);

ALTER TABLE new_coolers ADD COLUMN receipt_id INTEGER REFERENCES new_cooler_receipts(id);
ALTER TABLE new_coolers ADD COLUMN lot_no TEXT;
CREATE INDEX IF NOT EXISTS idx_new_coolers_lot ON new_coolers(lot_no);
