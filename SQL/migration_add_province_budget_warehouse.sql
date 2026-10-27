-- ງົບຕູ້ແຊ່ຕ່າງແຂວງ: ແຍກຕາມ "ສາງສະເພາະແຂວງ" (ship_province_warehouses) ແທນທີ່ຈະຄິດຕໍ່ແຂວງ
--   ງົບ = ແຂວງ + ສາງສະເພາະແຂວງ + Brand + Type   (warehouse = '' ໝາຍເຖິງງົບແບບເກົ່າ "ທັງແຂວງ" ບໍ່ແຍກສາງ)
--   ຕູ້ທີ່ສົ່ງອອກ (new_coolers / ship_trip_stock) ເກັບ ship_warehouse ເພີ່ມຄຽງຄູ່ ship_province
--   ງົບເກົ່າທັງໝົດຖືກເກັບໄວ້ເປັນ warehouse = '' (ບໍ່ສູນເສຍ) — Admin ຄ່ອຍແຍກເປັນງົບຕໍ່ສາງໃນພາຍຫຼັງ
-- ຕ້ອງຮັນ migration_add_province_budgets.sql ແລະ migration_add_ship_provinces.sql ໄປກ່ອນ.
-- ⚠️ ຮັນຄັ້ງດຽວເທົ່ານັ້ນ (ALTER TABLE ... ADD COLUMN ຮັນຊ້ຳບໍ່ໄດ້). ຮັນດ້ວຍຄຳສັ່ງ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_province_budget_warehouse.sql

ALTER TABLE new_coolers ADD COLUMN ship_warehouse TEXT;
ALTER TABLE ship_trip_stock ADD COLUMN ship_warehouse TEXT;

-- UNIQUE ປ່ຽນເປັນ (province, warehouse, brand, type) — SQLite ແກ້ constraint ບໍ່ໄດ້ ຕ້ອງສ້າງຕາຕະລາງໃໝ່ແລ້ວຄັດລອກ
CREATE TABLE province_budgets_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    province      TEXT NOT NULL,
    warehouse     TEXT NOT NULL DEFAULT '',
    cooler_brand  TEXT NOT NULL,
    cooler_type   TEXT NOT NULL,
    quota         INTEGER NOT NULL DEFAULT 0,
    note          TEXT,
    updated_by    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (province, warehouse, cooler_brand, cooler_type)
);
INSERT INTO province_budgets_new (id, province, warehouse, cooler_brand, cooler_type, quota, note, updated_by, created_at, updated_at)
    SELECT id, province, '', cooler_brand, cooler_type, quota, note, updated_by, created_at, updated_at FROM province_budgets;
DROP TABLE province_budgets;
ALTER TABLE province_budgets_new RENAME TO province_budgets;
