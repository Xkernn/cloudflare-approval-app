-- ເພີ່ມຟັງຊັນ "ລາຍງານຕູ້ແຊ່ສະສາງ" (ຢູ່ໃນເມນູ ລາຍງານການຈັດສົ່ງ) - ບັນທຶກຕູ້ແຊ່ທີ່ສະສາງ (ຊຳລຸດ/ໝົດອາຍຸ/ສູນຫາຍ)
-- ຖ້າ QR/Serial ກົງກັບສະຕັອກສາງທີ່ "ຢູ່ໃນສາງ" ລະບົບຈະປ່ຽນສະຖານະສະຕັອກເປັນ "ສະສາງ" (write_off) ໃຫ້ອັດຕະໂນມັດ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_writeoffs.sql
-- (ທົດສອບໃນເຄື່ອງ: ປ່ຽນ --remote ເປັນ --local)

CREATE TABLE IF NOT EXISTS cooler_writeoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER,            -- warehouse_stock.id ທີ່ຖືກປ່ຽນເປັນສະສາງ (NULL = ບໍ່ພົບໃນສະຕັອກ/ບໍ່ໄດ້ປ່ຽນສະຖານະ)
    prev_status TEXT,            -- ສະຖານະສະຕັອກກ່ອນສະສາງ (ໃຊ້ຕອນ Admin ລຶບລາຍງານ ເພື່ອຄືນສະຖານະ)
    warehouse_name TEXT,         -- ຊື່ສາງທີ່ຕູ້ຢູ່ຕອນສະສາງ
    cooler_brand TEXT,
    cooler_type TEXT,
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    reason TEXT,                 -- broken = ຊຳລຸດເສຍຫາຍ | old = ໝົດອາຍຸການໃຊ້ງານ | lost = ສູນຫາຍ | other = ອື່ນໆ
    writeoff_date TEXT,          -- ວັນທີ່ສະສາງ (YYYY-MM-DD)
    written_off_by TEXT,         -- ຜູ້ບັນທຶກ (email)
    photo TEXT,                  -- ຮູບຢືນຢັນ (R2 object key, ບໍ່ບັງຄັບ)
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_date ON cooler_writeoffs(writeoff_date);
CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_qr ON cooler_writeoffs(qr_code);
CREATE INDEX IF NOT EXISTS idx_cooler_writeoffs_serial ON cooler_writeoffs(serial_number);
