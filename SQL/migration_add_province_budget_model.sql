-- ງົບຕູ້ແຊ່ຕ່າງແຂວງ: ແຍກງົບຕາມ Model (ນອກຈາກ ແຂວງ / ສາງ / Brand / Type)
--   cooler_model = '' ໝາຍເຖິງງົບ "ທຸກ Model" ຂອງ Brand/Type ນັ້ນ — ແຖວງົບເກົ່າທັງໝົດເປັນ '' ອັດຕະໂນມັດ (ບໍ່ສູນເສຍ)
--   ຕູ້ 1 ໜ່ວຍຕັດງົບແຖວທີ່ Model ກົງກັນກ່ອນ; ຖ້າບໍ່ມີແຖວສະເພາະ Model ນັ້ນ ຈະຕັດແຖວ "ທຸກ Model"; ຖ້າບໍ່ມີທັງສອງ = ບໍ່ຈຳກັດ
--   ຕ້ອງຮັນ migration_add_province_budget_warehouse.sql ໄປກ່ອນແລ້ວ
-- ⚠️ SQLite ແກ້ UNIQUE ບໍ່ໄດ້ ຈຶ່ງສ້າງຕາຕະລາງໃໝ່ແລ້ວຄັດລອກ — ຮັນຄັ້ງດຽວເທົ່ານັ້ນ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_province_budget_model.sql

CREATE TABLE province_budgets_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    province      TEXT NOT NULL,
    warehouse     TEXT NOT NULL DEFAULT '',
    cooler_brand  TEXT NOT NULL,
    cooler_type   TEXT NOT NULL,
    cooler_model  TEXT NOT NULL DEFAULT '',
    quota         INTEGER NOT NULL DEFAULT 0,
    note          TEXT,
    updated_by    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (province, warehouse, cooler_brand, cooler_type, cooler_model)
);
INSERT INTO province_budgets_new (id, province, warehouse, cooler_brand, cooler_type, cooler_model, quota, note, updated_by, created_at, updated_at)
    SELECT id, province, COALESCE(warehouse, ''), cooler_brand, cooler_type, '', quota, note, updated_by, created_at, updated_at FROM province_budgets;
DROP TABLE province_budgets;
ALTER TABLE province_budgets_new RENAME TO province_budgets;
