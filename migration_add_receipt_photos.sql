-- ຮູບຖ່າຍຕອນຮັບຕູ້ ໃນລິ້ງເຊັນຮັບຕູ້ແຊ່ຕ່າງແຂວງ (ຕ້ອງມີຢ່າງໜ້ອຍ 1 ຮູບ, ສູງສຸດ 5 ຮູບ)
--   ship_trip_receipts.recv_photos : JSON array ຂອງ key ຮູບໃນ R2 bucket PHOTOS (trip/<trip_id>/recvphoto-<id>-<time>-<n>.jpg)
-- ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_receipt_photos.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE ship_trip_receipts ADD COLUMN recv_photos TEXT;
