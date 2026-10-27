-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມຟັງຊັນໃໝ່ "ໜ້າແຈ້ງເຕືອນ" (Notification Inbox ໃນແອັບ) ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ
-- ຈຸດປະສົງ: ບັນທຶກແຈ້ງເຕືອນທຸກອັນລົງ DB ໄວ້ດ້ວຍ (ບໍ່ວ່າ Push Notification ຈະສົ່ງອອກໄປສຳເລັດ
-- ຫຼືບໍ່ - ເຊັ່ນ ອຸປະກອນ Android ບໍ່ໄດ້ເປີດ/ອະນຸຍາດ Push) ເພື່ອໃຫ້ user ເຂົ້າມາເບິ່ງຄືນໄດ້ພາຍໃນແອັບ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_notifications.sql

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT,
    body TEXT,
    url TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
