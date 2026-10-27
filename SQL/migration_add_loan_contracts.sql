-- ຟັງຊັນ "ອອກໃບສັນຍາຢືມ" — ຕື່ມຂໍ້ມູນລົງແບບຟອມ PDF ຕົ້ນສະບັບ (public/forms/loan.pdf)
-- ແຍກຕາຕະລາງໃໝ່ຕ່າງຫາກ, ບໍ່ແຕະ assets/outlets ເດີມ (ອີງອີງເອົາຂໍ້ມູນຈາກຕາຕະລາງນັ້ນຕອນອອກໃບ)
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_loan_contracts.sql

CREATE TABLE IF NOT EXISTS loan_contracts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no           TEXT UNIQUE,              -- ຕັ້ງຫຼັງ insert ຄື DOC0001 (ຄືຮູບແບບ tracking_no)
    asset_id         INTEGER REFERENCES assets(id),
    tracking_no      TEXT,                     -- ອ້າງອີງ assets.tracking_no ຕອນອອກໃບ (ຖ້າມີ)

    -- ຮ້ານຄ້າ (ຄັດລອກມາຈາກ outlets/assets ຕອນອອກໃບ ເພື່ອໃຫ້ໃບເກົ່າຄົງທີ່ຖ້າຮ້ານມີການແກ້ໄຂພາຍຫຼັງ)
    outlet_code      TEXT,
    outlet_name      TEXT,
    outlet_owner     TEXT,
    outlet_type      TEXT,
    outlet_grade     TEXT,
    outlet_phone     TEXT,
    village          TEXT,
    district         TEXT,
    province         TEXT,

    -- ປະເພດສັນຍາ/ການມອບຕູ້/ຂະໜາດ — ເດົາຈາກ assets.doc_type ອັດຕະໂນມັດ, ແກ້ໄຂໄດ້ກ່ອນອອກໃບ
    contract_type    TEXT,                     -- partner_club | competitive | none
    handover_type    TEXT,                     -- new | move | extra | replace | survey
    doors            INTEGER,                  -- 1 | 2 | 3 (ຜູ້ອອກໃບເລືອກເອງ - ບໍ່ມີໃນ master data)

    -- ຕູ້ແຊ່
    cooler_brand     TEXT,
    qr_cd            TEXT,
    serial_no        TEXT,
    capx             TEXT,

    -- ສະເພາະ handover_type = 'move' (ຕູ້ເຄື່ອນຍ້າຍ)
    old_doc_no       TEXT,
    old_outlet_code  TEXT,
    old_outlet_name  TEXT,
    old_outlet_phone TEXT,
    move_reason      TEXT,
    sig_old_outlet      TEXT,   -- R2 key (bucket PHOTOS)
    sig_old_outlet_name TEXT,
    sig_old_outlet_at   DATETIME,

    -- MDE (ຜູ້ຂໍ)
    mde_code         TEXT,
    mde_phone        TEXT,
    sig_mde          TEXT,      -- R2 key
    sig_mde_name     TEXT,
    sig_mde_at       DATETIME,

    -- DSM — ບໍ່ມີບົດບາດນີ້ໃນລະບົບປັດຈຸບັນ, ຄໍລຳໄວ້ຮອງຮັບອະນາຄົດ (ປະຫວ່າງ = ຂຽນມືໃນເຈ້ຍ)
    sig_dsm          TEXT,
    sig_dsm_name     TEXT,
    sig_dsm_at       DATETIME,

    -- Admin (ຝ່າຍບໍລິສັດ)
    sig_admin        TEXT,      -- R2 key
    sig_admin_name   TEXT,
    sig_admin_at     DATETIME,

    -- ເຈົ້າຂອງຮ້ານ
    sig_outlet       TEXT,      -- R2 key
    sig_outlet_name  TEXT,
    sig_outlet_at    DATETIME,

    status           TEXT DEFAULT 'draft',   -- draft = MDE ຍັງບໍ່ເຊັນ, awaiting_dsm = MDE ເຊັນແລ້ວ ລໍຖ້າ DSM ເຊັນ, completed = ເຊັນຄົບ/ເປີດ PDF ໄດ້
    created_by       TEXT,                   -- email ຜູ້ອອກໃບ
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loan_contracts_asset    ON loan_contracts(asset_id);
CREATE INDEX IF NOT EXISTS idx_loan_contracts_tracking ON loan_contracts(tracking_no);
CREATE INDEX IF NOT EXISTS idx_loan_contracts_outlet   ON loan_contracts(outlet_code);
