-- ເພີ່ມອີເມວ DSM ໃນຕາຕະລາງ dsm_list (ໃຊ້ສົ່ງແຈ້ງເຕືອນ "DSM ຄ້າງເຊັນ" ພ້ອມລິ້ງເຊັນ)
-- ຮັນຄັ້ງດຽວ (ຫ້າມຮັນຊ້ຳ) ກ່ອນ deploy ໂຄດໃໝ່:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_dsm_email.sql

ALTER TABLE dsm_list ADD COLUMN email TEXT;
