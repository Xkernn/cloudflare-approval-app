-- ລະບົບ "ລືມລະຫັດຜ່ານ": user ກົດຂໍ reset -> admin ໄດ້ຮັບແຈ້ງເຕືອນ -> admin ສ້າງລະຫັດ Reset (ໃຊ້ໄດ້ຄັ້ງດຽວ, 24 ຊມ)
-- ແລ້ວແຈ້ງໃຫ້ user -> user ເອົາລະຫັດມາຕັ້ງລະຫັດຜ່ານໃໝ່ເອງ (ໜ້າ Login > ລືມລະຫັດຜ່ານ? > ມີລະຫັດ Reset ແລ້ວ)
-- ຮັນຄັ້ງດຽວກັບ DB ທີ່ deploy ແລ້ວ (ຮັນກ່ອນ deploy ໂຄດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_password_reset.sql

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' (ລໍຖ້າ admin) | 'issued' (admin ອອກລະຫັດແລ້ວ) | 'used' (ໃຊ້ແລ້ວ) | 'cancelled'
    note TEXT,                               -- ຂໍ້ຄວາມຈາກ user (ເຊັ່ນ ເບີໂທຕິດຕໍ່ກັບ)
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    code_hash TEXT,                          -- hash (PBKDF2) ຂອງລະຫັດ Reset - ບໍ່ເກັບລະຫັດຕົວຈິງ
    code_expires_at DATETIME,                -- ໝົດອາຍຸ (UTC)
    attempts INTEGER NOT NULL DEFAULT 0,     -- ຈຳນວນຄັ້ງທີ່ປ້ອນລະຫັດຜິດ (ຜິດ 5 ຄັ້ງ = ລະຫັດຖືກຍົກເລີກ)
    issued_by INTEGER,
    issued_at DATETIME,
    used_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_pwreset_user_status ON password_reset_requests(user_id, status);
