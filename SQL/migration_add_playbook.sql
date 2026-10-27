-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມເມນູ "Playbook" (ຂະໜາດຕູ້ແຊ່ + ຮູບຕູ້ແຊ່ ແຕ່ລະປະເພດ) ໃຫ້ DB ທີ່ deploy ໄປແລ້ວ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_playbook.sql

CREATE TABLE IF NOT EXISTS playbook_coolers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,            -- ຊື່ປະເພດຕູ້ (ເຊັ່ນ Deep Freezer 1 ປະຕູ)
    category TEXT,                 -- ໝວດ/ກຸ່ມ (ບໍ່ບັງຄັບ)
    width_mm INTEGER,              -- ກວ້າງ (ມມ)
    depth_mm INTEGER,              -- ເລິກ (ມມ)
    height_mm INTEGER,             -- ສູງ (ມມ)
    capacity_l INTEGER,            -- ຄວາມຈຸ (ລິດ)
    doors INTEGER,                 -- ຈຳນວນປະຕູ
    description TEXT,              -- ໝາຍເຫດ/ລາຍລະອຽດ
    image_key TEXT,                -- R2 key (playbook/...)
    sort_order INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_playbook_coolers_sort ON playbook_coolers(sort_order, id);
