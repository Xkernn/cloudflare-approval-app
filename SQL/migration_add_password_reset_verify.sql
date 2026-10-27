-- ລືມລະຫັດຜ່ານແບບໃໝ່ (ບໍ່ສົ່ງເມວ): user ປ້ອນ ອີເມວ + ເບີໂທ -> ລະບົບຄົ້ນຫາ -> ຢືນຢັນວ່າແມ່ນຕົນເອງ
-- -> ຕັ້ງລະຫັດຜ່ານໃໝ່ -> ລໍ admin ອະນຸມັດ (ລະຫັດໃໝ່ຍັງບໍ່ມີຜົນຈົນກວ່າ admin ອະນຸມັດ)
-- ຮັນຄັ້ງດຽວ ກ່ອນ deploy ໂຄດໃໝ່ (ຕ້ອງຮັນ migration_add_password_reset.sql ມາກ່ອນແລ້ວ):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_password_reset_verify.sql
-- status ໃໝ່ຂອງ password_reset_requests: 'verifying' | 'awaiting_admin' | 'approved' | 'rejected'

ALTER TABLE password_reset_requests ADD COLUMN ticket_hash TEXT;            -- SHA-256 ຂອງ ticket ຫຼັງຢືນຢັນຕົວຕົນ (ບໍ່ເກັບ ticket ຕົວຈິງ)
ALTER TABLE password_reset_requests ADD COLUMN ticket_expires_at DATETIME;  -- ticket ໝົດອາຍຸ 10 ນາທີ
ALTER TABLE password_reset_requests ADD COLUMN new_password_hash TEXT;      -- ລະຫັດໃໝ່ (hash) ທີ່ລໍ admin ອະນຸມັດ
ALTER TABLE password_reset_requests ADD COLUMN decided_by INTEGER;
ALTER TABLE password_reset_requests ADD COLUMN decided_at DATETIME;

CREATE TABLE IF NOT EXISTS forgot_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_forgot_attempts_ip ON forgot_attempts(ip, created_at);
