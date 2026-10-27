-- ງົບຕູ້ແຊ່ຕ່າງແຂວງ (province_budgets) — ໂຄຕ້າຈຳນວນຕູ້ ຕໍ່ ແຂວງ / Brand / Type
--   ຕັດງົບອັດຕະໂນມັດເມື່ອກົດ "ຢືນຢັນລົດອອກ" ຂອງຖ້ຽວລົດ (ຕູ້ເປັນ shipped_out) — ບໍ່ມີຕາຕະລາງເກັບຍອດທີ່ໃຊ້ແລ້ວ ຄິດຈາກຕູ້ທີ່ສົ່ງອອກຈິງ
--   ເປີດຖ້ຽວຄືນ (reopen) -> ຕູ້ກັບເປັນລໍຖ້າສົ່ງ -> ຍອດໃຊ້ແລ້ວຄືນມາເອງ
--   ຖ້າແຂວງ/Brand/Type ໃດບໍ່ມີແຖວງົບ = ບໍ່ຈຳກັດ (ສົ່ງໄດ້ປົກກະຕິ ແຕ່ຈະສະແດງໃນ Dashboard ວ່າ "ຍັງບໍ່ໄດ້ກຳນົດງົບ")
-- ບໍ່ແຕະຕາຕະລາງເກົ່າ. ຮັນດ້ວຍຄຳສັ່ງ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_province_budgets.sql

CREATE TABLE IF NOT EXISTS province_budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    province      TEXT NOT NULL,
    cooler_brand  TEXT NOT NULL,
    cooler_type   TEXT NOT NULL,
    quota         INTEGER NOT NULL DEFAULT 0,
    note          TEXT,
    updated_by    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (province, cooler_brand, cooler_type)
);
