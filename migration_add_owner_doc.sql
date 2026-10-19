-- ເອກະສານເຈົ້າຂອງຮ້ານ (ບັດປະຈຳໂຕ / Passport / ໃບທະບຽນວິສາຫະກິດ) — ຕ້ອງແນບກ່ອນ MDE ເຊັນ ທັງໃບສັນຍາຢືມ (DOC-) ແລະ ໃບຮັບຕູ້ເຂົ້າສາງ (T-)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_owner_doc.sql
-- ໝາຍເຫດ: ໃບເກົ່າທີ່ເຊັນແລ້ວ ບໍ່ຖືກກະທົບ (ຄ່າເປັນ NULL) — ບັງຄັບແນບສະເພາະຕອນ MDE ເຊັນຄັ້ງໃໝ່

ALTER TABLE loan_contracts ADD COLUMN owner_doc_type  TEXT;      -- id_card | passport | business_reg
ALTER TABLE loan_contracts ADD COLUMN owner_doc_photo TEXT;      -- R2 key: loan-contract/<id>/owner-doc-<ts>.jpg
ALTER TABLE loan_contracts ADD COLUMN owner_doc_at    DATETIME;

ALTER TABLE cancel_contracts ADD COLUMN owner_doc_type  TEXT;    -- id_card | passport | business_reg
ALTER TABLE cancel_contracts ADD COLUMN owner_doc_photo TEXT;    -- R2 key: cancel-contract/<id>/owner-doc-<ts>.jpg
ALTER TABLE cancel_contracts ADD COLUMN owner_doc_at    DATETIME;
