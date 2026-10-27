-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມຕາຕະລາງ "Outlet" (ຮ້ານຄ້າ) Master Data — ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ (ບໍ່ DROP ຂໍ້ມູນເກົ່າ)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_outlets.sql

CREATE TABLE IF NOT EXISTS outlets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    owner_name   TEXT,
    outlet_type  TEXT,
    province     TEXT,
    address      TEXT,
    phone        TEXT,
    latitude     REAL,
    longitude    REAL,
    active       INTEGER DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
