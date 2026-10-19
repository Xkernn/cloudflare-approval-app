-- ຄອນເທນເນີຕູ້ແຊ່ເຂົ້າໃຫມ່ — ຕູ້ເຂົ້າມາຫຼາຍຄອນເທນເນີ ຮູ້ແຕ່ຈຳນວນຕໍ່ຄອນເທນເນີ ບໍ່ຮູ້ວ່າລະຫັດ/ແບບໃດຢູ່ຄອນເທນເນີໃດ
-- ຕອນສະແກນຢືນຢັນຕູ້ ເລືອກຄອນເທນເນີທີ່ກຳລັງຖ່າຍ ແລ້ວລະບົບຜູກຕູ້ເຂົ້າຄອນເທນເນີ + ນັບສະແກນແລ້ວ/ຈຳນວນທັງໝົດ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_cooler_containers.sql

CREATE TABLE IF NOT EXISTS new_cooler_containers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    container_no  TEXT NOT NULL UNIQUE,        -- ເລກຄອນເທນເນີ
    expected_qty  INTEGER NOT NULL DEFAULT 0,  -- ຈຳນວນຕູ້ໃນຄອນເທນເນີ (ຈາກເອກະສານ)
    notes         TEXT,
    created_by    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE new_coolers ADD COLUMN container_id INTEGER REFERENCES new_cooler_containers(id);
CREATE INDEX IF NOT EXISTS idx_new_coolers_container ON new_coolers(container_id);
