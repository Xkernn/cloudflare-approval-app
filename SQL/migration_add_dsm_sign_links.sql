-- ລິ້ງເຊັນ DSM (ໃຊ້ໄດ້ຄັ້ງດຽວ) ສຳລັບ ໃບສັນຍາຢືມ (DOC-) ແລະ ໃບເກັບຕູ້ເຂົ້າສາງ (T-)
--   token ສຸ່ມ 256-bit, ເກັບສະເພາະ SHA-256 hash, ໝົດອາຍຸ 7 ວັນ, DSM ບໍ່ຕ້ອງມີບັນຊີ
--   kind = 'loan' (loan_contracts) | 'cancel' (cancel_contracts), doc_id = id ຂອງໃບນັ້ນ
--   ສ້າງລິ້ງໃໝ່ = ລິ້ງເກົ່າຂອງໃບນັ້ນໃຊ້ບໍ່ໄດ້ (1 ໃບ = 1 ລິ້ງ ທີ່ໃຊ້ງານໄດ້)
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_dsm_sign_links.sql
-- ຕ້ອງຮັນກ່ອນ deploy ໂຄ້ດໃໝ່

CREATE TABLE IF NOT EXISTS dsm_sign_links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,                    -- 'loan' | 'cancel'
    doc_id     INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',  -- 'pending' = ລໍຖ້າເຊັນ, 'signed' = ເຊັນແລ້ວ
    expires_at DATETIME NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    signer_name TEXT,
    signed_at  DATETIME,
    UNIQUE (kind, doc_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dsm_sign_links_token ON dsm_sign_links(token_hash);
