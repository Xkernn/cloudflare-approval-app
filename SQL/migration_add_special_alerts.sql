-- ແຈ້ງເຕືອນພິເສດ (Special Alert): admin ກຳນົດໃຫ້ຂຶ້ນເປັນໜ້າປະກາດເຕັມຈໍ ແລະ ບັງຄັບ MDE (role user) ໃຫ້ດຳເນີນການກ່ອນ ຈຶ່ງໃຊ້ເມນູອື່ນໄດ້
--   rule        : 'unsigned_loan' = MDE ຍັງມີໃບສັນຍາຢືມຄ້າງເຊັນ (ປິດເອງເມື່ອເຊັນຄົບ) | 'manual' = ຕ້ອງກົດ "ຮັບຊາບ" (ບັນທຶກໃນ special_alert_acks)
--   target_type : 'all' = MDE ທັງໝົດ | 'team' = ສະເພາະທີມ (target_value = ຊື່ທີມ) | 'mde' = ສະເພາະ MDE Code (target_value = ລາຍການ code ຄັ່ນດ້ວຍ , ຫຼື ຂັ້ນບັນທັດ)
--   action_view : view ທີ່ປຸ່ມ "ໄປດຳເນີນການ" ເປີດ (ເຊັ່ນ loanContract:queue = ແຖບເອກະສານຍັງບໍ່ເຊັນ), ຫວ່າງ = ບໍ່ມີປຸ່ມໄປ
-- ຮັນໃນ D1 Console ຂອງ Cloudflare Dashboard (ຫຼື: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_special_alerts.sql)

CREATE TABLE IF NOT EXISTS special_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    rule TEXT NOT NULL DEFAULT 'unsigned_loan',
    target_type TEXT NOT NULL DEFAULT 'all',
    target_value TEXT,
    action_view TEXT,
    is_active INTEGER DEFAULT 1,
    expires_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS special_alert_acks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    acked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(alert_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_special_alerts_active ON special_alerts(is_active);
