-- ເພີ່ມຕາຕະລາງ DSM List: ຊື່ DSM (ຫົວໜ້າທີມ) ຜູກກັບ Team ຂອງ MDE
-- ໃຊ້ດຶງຊື່ DSM ອັດຕະໂນມັດໃສ່ໃບສັນຍາຢືມ ຕາມ Team ຂອງ MDE ທີ່ອອກໃບ
CREATE TABLE IF NOT EXISTS dsm_list (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    team      TEXT NOT NULL UNIQUE,
    dsm_name  TEXT NOT NULL,
    phone     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dsm_list_team ON dsm_list(team);
