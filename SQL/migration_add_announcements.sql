-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມຟັງຊັນໃໝ່ "ປະກາດພາຍໃນບໍລິສັດ" (Announcements) ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ
-- ຈຸດປະສົງ: ໃຫ້ Admin ປະກາດຂ່າວ/ແຈ້ງການເຖິງພະນັກງານທຸກຄົນ (ບໍ່ຜູກກັບ MDE ໃດ MDE ໜຶ່ງ ຄືກັບ notifications)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_announcements.sql

CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

-- ບັນທຶກວ່າ user ຄົນໃດອ່ານປະກາດອັນໃດແລ້ວ (ໃຊ້ນັບ unread badge ຄືກັນກັບ notifications)
CREATE TABLE IF NOT EXISTS announcement_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, is_pinned, created_at);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(user_id);
