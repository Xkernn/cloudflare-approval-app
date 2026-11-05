-- admin ໝາຍວ່າ "ປິ້ນເອກະສານອອກແລ້ວ" ໃຫ້ໃບສັນຍາຢືມ (DOC-) ແລະ ໃບເກັບຕູ້ເຂົ້າສາງ (T-) ທີ່ເຊັນຄົບແລ້ວ
-- ຮັນກ່ອນ deploy:  npx wrangler d1 execute <DB_NAME> --remote --file=migration_add_contract_printed.sql
ALTER TABLE loan_contracts   ADD COLUMN printed_at DATETIME;
ALTER TABLE loan_contracts   ADD COLUMN printed_by TEXT;
ALTER TABLE cancel_contracts ADD COLUMN printed_at DATETIME;
ALTER TABLE cancel_contracts ADD COLUMN printed_by TEXT;
