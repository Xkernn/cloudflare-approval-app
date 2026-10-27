-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມຟັງຊັນໃໝ່ "ລາຍງານຕູ້ແຊ່ Event" (ເອົາຕູ້ແຊ່ອອກໄປໃຊ້ງານຊົ່ວຄາວ ເຊັ່ນ event/ໂປໂມຊັນ
-- ບໍ່ຜູກກັບ Asset ທີ່ມີໃນລະບົບ - ປ້ອນຂໍ້ມູນຕູ້ເອງ) ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_events.sql

CREATE TABLE IF NOT EXISTS cooler_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cooler_brand TEXT,
    cooler_type TEXT,
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    event_name TEXT,             -- ຊື່ event / ໂປໂມຊັນ
    event_location TEXT,         -- ເອົາໄປໃສ (ສະຖານທີ່/ຮ້ານ)
    taken_date TEXT,             -- ວັນທີ່ເອົາອອກໄປ (YYYY-MM-DD)
    taken_by TEXT,               -- ຜູ້ບັນທຶກຕອນເອົາໄປ (email)
    taken_photo TEXT,            -- ຮູບຢືນຢັນຕອນເອົາໄປ (R2 object key, ບໍ່ບັງຄັບ)
    expected_return_date TEXT,   -- ວັນທີ່ຄາດວ່າຈະເອົາກັບ (ບໍ່ບັງຄັບ)
    returned INTEGER DEFAULT 0,  -- 0 = ຍັງບໍ່ທັນເອົາກັບ, 1 = ເອົາກັບແລ້ວ
    returned_date TEXT,          -- ວັນທີ່ເອົາກັບຄືນ (YYYY-MM-DD)
    returned_by TEXT,            -- ຜູ້ບັນທຶກຕອນເອົາກັບ (email)
    returned_photo TEXT,         -- ຮູບຢືນຢັນຕອນເອົາກັບ (R2 object key, ບໍ່ບັງຄັບ)
    notes TEXT,                  -- ໝາຍເຫດເພີ່ມເຕີມ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cooler_events_returned ON cooler_events(returned);
CREATE INDEX IF NOT EXISTS idx_cooler_events_taken_date ON cooler_events(taken_date);
