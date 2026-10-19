-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມ "Cooler Master Data" (ຂໍ້ມູນຕູ້ແຊ່ທົ່ວປະເທດ) ໃຫ້ DB ທີ່ deploy ໄປແລ້ວ (ບໍ່ DROP ຂໍ້ມູນເກົ່າ)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_master.sql
--
-- ຕາຕະລາງນີ້ແຍກຂາດຈາກ warehouse_stock / assets: ເກັບຂໍ້ມູນອ້າງອີງຂອງຕູ້ທົ່ວປະເທດ (Admin Import ຈາກ Excel)
-- ເພື່ອໃຊ້ຄົ້ນຫາ/ສະແກນວ່າ "ຕູ້ນີ້ຢູ່ໃສ" ໂດຍບໍ່ກະທົບຂໍ້ມູນສະຕັອກ ຫຼື Asset Tracking

CREATE TABLE IF NOT EXISTS cooler_master (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    qr_code        TEXT,
    serial_number  TEXT,
    capex          TEXT,
    qr_norm        TEXT,   -- ຄ່າ trim + UPPER ໄວ້ຄົ້ນຫາໄວ (ມີ index)
    serial_norm    TEXT,
    capex_norm     TEXT,
    cooler_brand   TEXT,
    cooler_type    TEXT,
    cooler_model   TEXT,
    outlet_code    TEXT,
    outlet_name    TEXT,
    province       TEXT,
    district       TEXT,
    address        TEXT,
    status         TEXT,   -- ສະຖານະຕາມຂໍ້ມູນຕົ້ນທາງ (free text)
    notes          TEXT,
    extra_json     TEXT,   -- ຖັນອື່ນໆໃນ Excel ທີ່ບໍ່ຢູ່ໃນລາຍການຂ້າງເທິງ (ເກັບເປັນ JSON {"ຊື່ຖັນ":"ຄ່າ"})
    imported_by    TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cooler_master_qr       ON cooler_master(qr_norm);
CREATE INDEX IF NOT EXISTS idx_cooler_master_serial   ON cooler_master(serial_norm);
CREATE INDEX IF NOT EXISTS idx_cooler_master_capex    ON cooler_master(capex_norm);
CREATE INDEX IF NOT EXISTS idx_cooler_master_province ON cooler_master(province);
CREATE INDEX IF NOT EXISTS idx_cooler_master_outlet   ON cooler_master(outlet_code);
