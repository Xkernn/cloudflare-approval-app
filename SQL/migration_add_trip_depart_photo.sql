-- ຮູບຖ່າຍຕອນຢືນຢັນລົດອອກ ຂອງຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ (ຕ້ອງຖ່າຍຮູບກ່ອນຢືນຢັນລົດອອກ ແລ້ວຄ່ອຍພິມໃບສົ່ງ)
--   ship_trips.depart_photo : key ຂອງຮູບໃນ R2 bucket PHOTOS (trip/<trip_id>/depart-<time>.jpg)
-- ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_trip_depart_photo.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE ship_trips ADD COLUMN depart_photo TEXT;
