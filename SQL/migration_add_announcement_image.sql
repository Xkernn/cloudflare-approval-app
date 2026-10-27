-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມ column "image_key" ໃຫ້ຕາຕະລາງ announcements ທີ່ deploy ໄປແລ້ວ
-- ຈຸດປະສົງ: Admin ແນບຮູບປະກອບໃນປະກາດໄດ້ 1 ຮູບ (ຮູບຈິງເກັບໃນ R2 bucket "PHOTOS" ເກັບແຕ່ key ໄວ້ທີ່ນີ້)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_announcement_image.sql
-- (ທົດສອບໃນເຄື່ອງ: ປ່ຽນ --remote ເປັນ --local)
-- ຕ້ອງຮັນກ່ອນ deploy ໂຄ້ດໃໝ່ ບໍ່ດັ່ງນັ້ນການເບິ່ງ/ບັນທຶກປະກາດຈະ error

ALTER TABLE announcements ADD COLUMN image_key TEXT;
