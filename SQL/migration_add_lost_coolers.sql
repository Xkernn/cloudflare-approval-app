-- ເມນູ Admin "Manage Lost Cooler Master Data": ຕູ້ທີ່ມີໃນ Cooler Master (ຢູ່ຮ້ານ/outlet) ແຕ່ຫາໂຕຈິງບໍ່ເຫັນ
-- ຂັ້ນຕອນ: ເພີ່ມເຂົ້າລາຍການ (suspected) -> ກຳລັງກວດສອບ (verifying) -> ຢືນຢັນສູນຫາຍ (confirmed_lost) -> ຄັດອອກຈາກ Master (excluded)
--          ຫຼື ພົບຕູ້ແລ້ວ (found). ຕອນຄັດອອກ ລະບົບເກັບ snapshot ແຖວ Master ໄວ້ ເພື່ອກູ້ຄືນໄດ້.
-- ຕາຕະລາງນີ້ແຍກຕ່າງຫາກ — ບໍ່ແກ້ໄຂຕາຕະລາງ cooler_master ເດີມ
-- ຮັນຄັ້ງດຽວກັບ DB ທີ່ deploy ແລ້ວ (ຮັນກ່ອນ deploy ໂຄດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_lost_coolers.sql

CREATE TABLE IF NOT EXISTS lost_coolers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    master_id INTEGER,                  -- cooler_master.id (ຫຼັງຄັດອອກ ແຖວນັ້ນຖືກລຶບຈາກ Master ແລ້ວ)
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    qr_norm TEXT,
    serial_norm TEXT,
    capex_norm TEXT,
    cooler_brand TEXT,
    cooler_type TEXT,
    cooler_model TEXT,
    outlet_code TEXT,                   -- ຮ້ານ ຕາມ Master ຕອນເພີ່ມເຂົ້າລາຍການ (snapshot)
    outlet_name TEXT,
    province TEXT,
    district TEXT,
    address TEXT,
    master_status TEXT,                 -- status ໃນ Master ຕອນເພີ່ມເຂົ້າລາຍການ
    status TEXT NOT NULL DEFAULT 'suspected',  -- 'suspected' | 'verifying' | 'confirmed_lost' | 'found' | 'excluded'
    reason TEXT,                        -- ໝາຍເຫດຫຼ້າສຸດ
    found_location TEXT,                -- ຖ້າພົບຕູ້: ພົບຢູ່ໃສ
    reported_by TEXT,
    verified_by TEXT,                   -- ຜູ້ຢືນຢັນຜົນ (confirmed_lost / found)
    verified_at DATETIME,
    excluded_by TEXT,
    excluded_at DATETIME,
    master_snapshot_json TEXT,          -- ແຖວ Master ທັງໝົດ (JSON) ຕອນຄັດອອກ — ໃຊ້ກູ້ຄືນ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lost_coolers_status ON lost_coolers(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_lost_coolers_master ON lost_coolers(master_id);
CREATE INDEX IF NOT EXISTS idx_lost_coolers_qr     ON lost_coolers(qr_norm);
CREATE INDEX IF NOT EXISTS idx_lost_coolers_serial ON lost_coolers(serial_norm);
CREATE INDEX IF NOT EXISTS idx_lost_coolers_capex  ON lost_coolers(capex_norm);

-- ປະຫວັດການປ່ຽນແປງຂອງແຕ່ລະລາຍການ (ໃຜເຮັດຫຍັງ ເມື່ອໃດ)
CREATE TABLE IF NOT EXISTS lost_cooler_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lost_id INTEGER NOT NULL,
    action TEXT NOT NULL,               -- 'add' | 'status' | 'edit' | 'exclude' | 'restore'
    from_status TEXT,
    to_status TEXT,
    note TEXT,
    actor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lost_cooler_logs_lost ON lost_cooler_logs(lost_id, id);
