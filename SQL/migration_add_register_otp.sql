-- OTP ຢືນຢັນອີເມວຕອນລົງທະບຽນ: ຕ້ອງໄດ້ຮັບ OTP 6 ໂຕທາງອີເມວ ແລ້ວປ້ອນຄືນ ຈຶ່ງສ້າງບັນຊີໄດ້ (ກັນໃຊ້ອີເມວປອມ/ບໍ່ແມ່ນຂອງຕົນເອງ)
-- ຮັນຄັ້ງດຽວກັບ DB ທີ່ deploy ແລ້ວ (ຮັນກ່ອນ deploy ໂຄດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_register_otp.sql

CREATE TABLE IF NOT EXISTS register_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,                      -- ອີເມວ (ຕົວພິມນ້ອຍ) ທີ່ OTP ຖືກສົ່ງໄປ
    ip TEXT,                                  -- IP ຜູ້ຂໍ (ໃຊ້ຈຳກັດຈຳນວນຄັ້ງ)
    code_hash TEXT,                           -- hash (PBKDF2) ຂອງ OTP - ບໍ່ເກັບ OTP ຕົວຈິງ
    status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'used' | 'cancelled'
    attempts INTEGER NOT NULL DEFAULT 0,      -- ປ້ອນຜິດ 5 ຄັ້ງ = OTP ຖືກຍົກເລີກ
    expires_at DATETIME NOT NULL,             -- ໝົດອາຍຸ (UTC) 10 ນາທີ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_register_otps_email ON register_otps(email, created_at);
CREATE INDEX IF NOT EXISTS idx_register_otps_ip ON register_otps(ip, created_at);
