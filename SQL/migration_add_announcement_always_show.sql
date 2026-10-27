-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມ column "always_show" ໃຫ້ຕາຕະລາງ announcements ທີ່ deploy ໄປແລ້ວ
-- ຈຸດປະສົງ: Admin ສາມາດຕັ້ງໃຫ້ປະກາດອັນໃດອັນໜຶ່ງ "ຂຶ້ນ Popup ທຸກຄັ້ງທີ່ເຂົ້າແອັບ" ໂດຍບໍ່ສົນວ່າອ່ານແລ້ວຫຼືຍັງ
-- (ຕ່າງຈາກປົກກະຕິທີ່ popup ຈະຂຶ້ນສະເພາະຄັ້ງທຳອິດ ຈົນກວ່າຜູ້ໃຊ້ຈະກົດ "ຮັບຊາບແລ້ວ")
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_announcement_always_show.sql

ALTER TABLE announcements ADD COLUMN always_show INTEGER DEFAULT 0;
