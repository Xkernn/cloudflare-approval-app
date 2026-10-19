-- ຟັງຊັນ "ຮັບຕູ້ເຂົ້າສາງ (T-)" — ໃບສະເໜີຍົກເລີກສັນຍາຢືມ ແລະ ນຳໃຊ້ຕູ້ແຊ່ (public/forms/cancel.pdf)
-- ຕາຕະລາງໃໝ່ຕ່າງຫາກ, ບໍ່ແຕະ loan_contracts ເດີມ (ອ້າງອີງໃບ DOC- ເດີມດ້ວຍ loan_contract_id / old_doc_no)
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cancel_contracts.sql

CREATE TABLE IF NOT EXISTS cancel_contracts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no           TEXT UNIQUE,              -- T0001 (ຕັ້ງຫຼັງ insert)
    loan_contract_id INTEGER REFERENCES loan_contracts(id),
    loan_doc_no      TEXT,                     -- ເລກທີສັນຍາທີ່ຕ້ອງການຍົກເລີກ (DOC-)

    -- ຮ້ານຄ້າ (ຄັດລອກຕອນອອກໃບ)
    outlet_code      TEXT,
    outlet_name      TEXT,
    outlet_owner     TEXT,
    outlet_type      TEXT,
    outlet_grade     TEXT,
    outlet_phone     TEXT,
    village          TEXT,
    district         TEXT,
    province         TEXT,

    -- ເຫດຜົນ (ຕິກໄດ້ຫຼາຍຂໍ້): ຄ່າຄັ່ນດ້ວຍຈ້ຳ ເຊັ່ນ "damaged,closed"
    --   damaged = ຍ້ອນຕູ້ແຊ່ເປ່ເພ ເກັບຄືນເຂົ້າສາງ | closed = ຮ້ານຄ້າປິດ-ຢຸດດຳເນີນກິດຈະການ
    --   small_business = ຂະໜາດທຸລະກິດນ້ອຍລົງ | replace = ມອບຕູ້ໃໝ່ປ່ຽນແທນ
    reasons          TEXT,

    -- ຕູ້ແຊ່
    cooler_brand     TEXT,
    doors            INTEGER,
    qr_cd            TEXT,
    serial_no        TEXT,
    capx             TEXT,

    -- ຜູ້ແຈ້ງ (MDE)
    mde_code         TEXT,
    mde_phone        TEXT,
    informer_name    TEXT,

    sig_mde          TEXT,      -- R2 key
    sig_mde_name     TEXT,
    sig_mde_at       DATETIME,
    sig_dsm          TEXT,
    sig_dsm_name     TEXT,
    sig_dsm_at       DATETIME,
    sig_admin        TEXT,      -- Warehouse Admin
    sig_admin_name   TEXT,
    sig_admin_at     DATETIME,
    sig_outlet       TEXT,
    sig_outlet_name  TEXT,
    sig_outlet_at    DATETIME,

    status           TEXT DEFAULT 'draft',   -- draft = ຍັງບໍ່ທັນເຊັນຮັບ, completed = MDE ເຊັນແລ້ວ
    created_by       TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cancel_contracts_loan   ON cancel_contracts(loan_contract_id);
CREATE INDEX IF NOT EXISTS idx_cancel_contracts_outlet ON cancel_contracts(outlet_code);
CREATE INDEX IF NOT EXISTS idx_cancel_contracts_mde    ON cancel_contracts(mde_code);
