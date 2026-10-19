-- ງົບຕູ້ແຊ່ຕ່າງແຂວງ: ເອົາ Model ອອກ — ງົບຄິດຕາມ ແຂວງ / ສາງ / Brand / Type ເທົ່ານັ້ນ
--   ໃຊ້ສະເພາະກໍລະນີທີ່ເຄີຍຮັນ migration_add_province_budget_model.sql ໄປແລ້ວ (ຕາຕະລາງ province_budgets ມີຄໍລຳ cooler_model)
--   ຖ້າບໍ່ເຄີຍຮັນ migration ນັ້ນ ບໍ່ຕ້ອງຮັນໄຟລ໌ນີ້ (ຈະ error ເພາະບໍ່ມີຄໍລຳ cooler_model)
--   ແຖວງົບຫຼາຍ Model ຂອງ Brand/Type ດຽວກັນ ຈະຖືກລວມເປັນແຖວດຽວ ໂດຍ "ບວກໂຄຕ້າ" ເຂົ້າກັນ (ໝາຍເຫດຂອງແຖວທີ່ເຫຼືອ = ໝາຍເຫດແຖວທຳອິດ)
--   SQLite ລຶບຄໍລຳ/ແກ້ UNIQUE ບໍ່ໄດ້ ຈຶ່ງສ້າງຕາຕະລາງໃໝ່ແລ້ວຄັດລອກ — ຮັນຄັ້ງດຽວເທົ່ານັ້ນ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_remove_province_budget_model.sql

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
INSERT INTO province_budgets_new (province, warehouse, cooler_brand, cooler_type, quota, note, updated_by, created_at, updated_at)
    SELECT province, COALESCE(warehouse, ''), cooler_brand, cooler_type,
           SUM(quota),
           (SELECT p2.note FROM province_budgets p2
              WHERE p2.province = p.province AND COALESCE(p2.warehouse, '') = COALESCE(p.warehouse, '')
                AND p2.cooler_brand = p.cooler_brand AND p2.cooler_type = p.cooler_type AND p2.note IS NOT NULL AND p2.note != ''
              ORDER BY p2.id LIMIT 1),
           MAX(updated_by), MIN(created_at), MAX(updated_at)
      FROM province_budgets p
     GROUP BY province, COALESCE(warehouse, ''), cooler_brand, cooler_type;
DROP TABLE province_budgets;
ALTER TABLE province_budgets_new RENAME TO province_budgets;
