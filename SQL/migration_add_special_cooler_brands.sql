-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມ Master List "Brand ພິເສດ" (ໃຊ້ສະເພາະໜ້າ "ລາຍງານຕູ້ແຊ່ Event" -
-- ນອກເໜືອຈາກ Cooler Brand ປົກກະຕິ) ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ (ບໍ່ຕ້ອງການ DROP TABLE)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_special_cooler_brands.sql

CREATE TABLE IF NOT EXISTS special_cooler_brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
