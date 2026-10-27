-- ສະຕັອກເຄື່ອງໃນສາງ (Warehouse Stock) v2 — ຕິດຕາມແຕ່ລະໜ່ວຍດ້ວຍ QR Code / Serial Number / CapEx ຕໍ່ສາງ
-- ຕ່າງຈາກ migration_add_warehouse_stock.sql ເກົ່າ (ໃຊ້ warehouse_name ແບບ free-text):
--   ອັນນີ້ຜູກກັບຕາຕະລາງ wh_warehouses ຜ່ານ warehouse_id ແທນ (ກົງກັບ Warehouse Master ທີ່ມີຢູ່ແລ້ວ)
-- ໃຊ້ໄຟລ໌ນີ້ກັບ DB ທີ່ deploy ໄປແລ້ວ ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_warehouse_stock_v2.sql
-- ໝາຍເຫດ: ຖ້າເຄີຍມີຕາຕະລາງ warehouse_stock ແບບເກົ່າ (warehouse_name) ຢູ່ ຈະຖືກລຶບ ແລ້ວສ້າງໃໝ່ຕາມໂຄງສ້າງນີ້
-- (ຖ້າມີຂໍ້ມູນສຳຄັນໃນຕາຕະລາງເກົ່າ ໃຫ້ export/backup ກ່ອນຮັນ)

DROP TABLE IF EXISTS warehouse_stock;

CREATE TABLE warehouse_stock (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    warehouse_id   INTEGER NOT NULL REFERENCES wh_warehouses(id),
    cooler_brand   TEXT NOT NULL,
    cooler_type    TEXT NOT NULL,
    cooler_model   TEXT,
    cooler_status  TEXT DEFAULT 'new',         -- 'new' = ໃໝ່, 'second_hand' = ມືສອງ, 'broken' = ຊຳລຸດ
    qr_code        TEXT,
    serial_number  TEXT,
    capex          TEXT,
    status         TEXT DEFAULT 'in_warehouse', -- 'in_warehouse' = ຢູ່ໃນສາງ, 'outlet' = ອອກໄປຮ້ານແລ້ວ, 'write_off' = ຕັດຈຳໜ່າຍ
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_warehouse_stock_warehouse ON warehouse_stock(warehouse_id);
CREATE INDEX idx_warehouse_stock_status ON warehouse_stock(status);
CREATE INDEX idx_warehouse_stock_qr ON warehouse_stock(qr_code);
CREATE INDEX idx_warehouse_stock_serial ON warehouse_stock(serial_number);
