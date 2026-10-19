-- ລາຍເຊັນກ່ອນລົດອອກ ຂອງຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ (ເຊັນໃນໜ້າ "ຢືນຢັນລົດອອກ" ແລ້ວໄປຂຶ້ນໃນໃບສົ່ງ)
--   ship_trips.sig_sender / sig_driver / sig_approver : key ຂອງຮູບລາຍເຊັນ (PNG) ໃນ R2 bucket PHOTOS (trip/<trip_id>/sig-*.png)
-- ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່. ຮັນດ້ວຍຄຳສັ່ງ (ຮັນເທື່ອລະບັນທັດ ຖ້າຂຶ້ນ duplicate column ແປວ່າມີແລ້ວ):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_trip_signatures.sql

ALTER TABLE ship_trips ADD COLUMN sig_sender TEXT;
ALTER TABLE ship_trips ADD COLUMN sig_driver TEXT;
ALTER TABLE ship_trips ADD COLUMN sig_approver TEXT;
