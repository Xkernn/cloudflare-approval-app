-- ໂຕນັບຮອບສະແກນຕູ້ເຂົ້າໃໝ່ (ໜ້າ "ສະແກນຕູ້ເຂົ້າໃໝ່") — ເກັບໃນ database ເພື່ອໃຫ້ທຸກເຄື່ອງເຫັນຕົວເລກດຽວກັນ
-- 1 ຮອບທີ່ເປີດຢູ່ (closed_at IS NULL) ໃຊ້ຮ່ວມກັນທຸກຄົນ; ກົດ "ປິດຮອບ" = ບັນທຶກຈຳນວນ ແລ້ວຮອບຖັດໄປເລີ່ມນັບຈາກ 0
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_new_cooler_fill_rounds.sql

CREATE TABLE IF NOT EXISTS new_cooler_fill_rounds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at    DATETIME,
    closed_by    TEXT,
    closed_count INTEGER
);

CREATE TABLE IF NOT EXISTS new_cooler_fill_scans (
    round_id      INTEGER NOT NULL,
    new_cooler_id INTEGER NOT NULL,
    scanned_by    TEXT,
    scanned_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (round_id, new_cooler_id)
);

CREATE INDEX IF NOT EXISTS idx_nc_fill_rounds_open ON new_cooler_fill_rounds(closed_at);
