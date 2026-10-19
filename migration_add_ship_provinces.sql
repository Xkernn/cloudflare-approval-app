-- ລາຍການແຂວງ (ship_provinces) — Admin ເພີ່ມ/ແກ້ໄຂ/ລຶບ ເອງໄດ້ ໃນໜ້າ "ງົບຕູ້ແຊ່ຕ່າງແຂວງ" > "ຈັດການແຂວງ"
--   ແຂວງ 1 ແຂວງ ມີຫຼາຍສາງໄດ້ — ເປັນ "ສາງສະເພາະແຂວງ" ເກັບໃນ ship_province_warehouses (ບໍ່ກ່ຽວກັບສາງຫຼັກ/ສາງປັດຈຸບັນ wh_warehouses)
--   ແກ້ຊື່ແຂວງ -> ລະບົບປ່ຽນຊື່ໃນ ງົບ / ຕູ້ / ຖ້ຽວລົດ ໃຫ້ອັດຕະໂນມັດ
--   ໄຟລ໌ນີ້ຮັນຊ້ຳໄດ້ (ບໍ່ເຮັດໃຫ້ຂໍ້ມູນຊ້ຳ)
-- ຕ້ອງຮັນ migration_add_province_budgets.sql ໄປກ່ອນແລ້ວ. ຮັນດ້ວຍຄຳສັ່ງ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_ship_provinces.sql

CREATE TABLE IF NOT EXISTS ship_provinces (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    note        TEXT,
    created_by  TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO ship_provinces (name) VALUES
    ('ນະຄອນຫຼວງວຽງຈັນ'), ('ຜົ້ງສາລີ'), ('ຫຼວງນ້ຳທາ'), ('ບໍ່ແກ້ວ'), ('ອຸດົມໄຊ'), ('ຫຼວງພະບາງ'),
    ('ຫົວພັນ'), ('ໄຊຍະບູລີ'), ('ຊຽງຂວາງ'), ('ວຽງຈັນ'), ('ບໍລິຄຳໄຊ'), ('ຄຳມ່ວນ'),
    ('ສະຫວັນນະເຂດ'), ('ສາລະວັນ'), ('ເຊກອງ'), ('ຈຳປາສັກ'), ('ອັດຕະປື'), ('ໄຊສົມບູນ');

-- ແຂວງທີ່ມີຢູ່ໃນງົບ (ພິມເອງມາກ່ອນ) ໃຫ້ເຂົ້າລາຍການນຳ
INSERT OR IGNORE INTO ship_provinces (name)
    SELECT DISTINCT TRIM(province) FROM province_budgets WHERE province IS NOT NULL AND TRIM(province) != '';

-- ສາງສະເພາະແຂວງ (ຫຼາຍສາງຕໍ່ແຂວງ) — ແຍກຈາກຕາຕະລາງສາງຫຼັກ wh_warehouses ໂດຍສິ້ນເຊີງ
CREATE TABLE IF NOT EXISTS ship_province_warehouses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    province_id  INTEGER NOT NULL REFERENCES ship_provinces(id),
    name         TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (province_id, name)
);
CREATE INDEX IF NOT EXISTS idx_ship_prov_wh_prov ON ship_province_warehouses(province_id);
