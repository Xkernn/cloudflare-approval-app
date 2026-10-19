-- ກັນການສ້າງໃບສັນຍາຊ້ຳ (ກົດບັນທຶກ/ອອກ PDF ຫຼາຍຄັ້ງ, ເນັດຊ້າ, ກົດ 2 ຄັ້ງຕິດກັນ)
-- ໜ້າເວັບສ້າງ request_key ຕໍ່ 1 ຟອມ; ຖ້າ key ນີ້ຖືກບັນທຶກແລ້ວ server ຈະສົ່ງໃບເດີມຄືນ ບໍ່ສ້າງໃບໃໝ່
-- ຮັນ (ກ່ອນ deploy ໂຄດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_contract_request_key.sql

ALTER TABLE loan_contracts   ADD COLUMN request_key TEXT;
ALTER TABLE cancel_contracts ADD COLUMN request_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_contracts_request_key   ON loan_contracts(request_key)   WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancel_contracts_request_key ON cancel_contracts(request_key) WHERE request_key IS NOT NULL;
