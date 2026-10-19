-- ຕູ້ແຊ່ເຂົ້າໃຫມ່ (New Coolers) — ລາຍການຕູ້ໃໝ່ທີ່ Admin Import ເຂົ້າມາ ແລ້ວສະແກນ/ພິມ QR, Serial ຫຼື CapEx ເພື່ອຢືນຢັນວ່າມີຕູ້ ແລະ ຮັບເຂົ້າສາງ
-- ເມື່ອຮັບເຂົ້າສາງ ລະບົບຈະສ້າງແຖວໃໝ່ໃນ warehouse_stock (status = 'in_warehouse', cooler_status = 'new') ໃຫ້ອັດຕະໂນມັດ
-- ໃຊ້ໄຟລ໌ນີ້ກັບ DB ທີ່ deploy ໄປແລ້ວ (ຕ້ອງມີ migration_add_warehouse_stock_v2.sql ຮັນໄປກ່ອນແລ້ວ)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_coolers.sql

CREATE TABLE IF NOT EXISTS new_coolers (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    cooler_brand           TEXT NOT NULL,
    cooler_type            TEXT NOT NULL,
    cooler_model           TEXT,
    qr_code                TEXT,
    serial_number          TEXT,
    capex                  TEXT,
    notes                  TEXT,
    status                 TEXT NOT NULL DEFAULT 'pending',  -- 'pending' = ຍັງບໍ່ໄດ້ຮັບເຂົ້າສາງ, 'received' = ຮັບເຂົ້າສາງແລ້ວ
    received_warehouse_id  INTEGER REFERENCES wh_warehouses(id),
    received_stock_id      INTEGER,                          -- id ຂອງແຖວທີ່ສ້າງໃນ warehouse_stock ຕອນຮັບເຂົ້າ
    received_by            TEXT,
    received_at            DATETIME,
    created_by             TEXT,
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_new_coolers_status ON new_coolers(status);
CREATE INDEX IF NOT EXISTS idx_new_coolers_qr ON new_coolers(qr_code);
CREATE INDEX IF NOT EXISTS idx_new_coolers_serial ON new_coolers(serial_number);
CREATE INDEX IF NOT EXISTS idx_new_coolers_capex ON new_coolers(capex);
