-- ໃຊ້ໄຟລ໌ນີ້ເມື່ອ DB deploy ໄປແລ້ວ ແລະ ມີຂໍ້ມູນຢູ່ (ບໍ່ຕ້ອງການ DROP TABLE)
-- ຄຳສັ່ງລັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_models.sql

-- ຟີເຈີ: ເພີ່ມ Master List ສຳລັບ "Model" ຂອງຕູ້ແຊ່ (ໜ້າ Admin > ຈັດການ Brand/Type/Doc Type)
-- ເພື່ອໃຫ້ຊ່ອງ Model ໃນຟອມ "ເພີ່ມ/ແກ້ໄຂລາຍການສະຕັອກ" ເປັນ dropdown ແທນການພິມຂໍ້ຄວາມອິສະຫຼະ
CREATE TABLE IF NOT EXISTS cooler_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ດຶງຊື່ Model ທີ່ມີຢູ່ແລ້ວໃນ warehouse_stock ມາໃສ່ເປັນຄ່າເລີ່ມຕົ້ນ
-- ເພື່ອບໍ່ໃຫ້ຂໍ້ມູນ Model ເກົ່າທີ່ເຄີຍພິມໄວ້ຫາຍໄປຈາກ dropdown ຫຼັງອັບເດດ
INSERT OR IGNORE INTO cooler_models (name)
  SELECT DISTINCT TRIM(cooler_model) FROM warehouse_stock
  WHERE cooler_model IS NOT NULL AND TRIM(cooler_model) != '';
