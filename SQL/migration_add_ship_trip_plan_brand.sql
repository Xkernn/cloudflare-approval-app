-- ແຜນຂອງຖ້ຽວລົດ: ກຳນົດ Brand ຕູ້ໃນແຕ່ລະລາຍການຂອງແຜນ
--   brand = '' ໝາຍເຖິງ ບໍ່ກຳນົດ Brand (ຮັບໄດ້ທຸກ Brand) — ແຖວເກົ່າທີ່ມີຢູ່ແລ້ວຈະເປັນ '' ອັດຕະໂນມັດ
--   ຕອນສະແກນ ຫຼື ເລືອກຕູ້ຂຶ້ນລົດ ລະບົບຈະຮັບສະເພາະຕູ້ທີ່ Brand ກົງກັບແຜນ (ບໍ່ສົນຕົວພິມໃຫຍ່/ນ້ອຍ)
-- ຮັນຄັ້ງດຽວ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_ship_trip_plan_brand.sql

ALTER TABLE ship_trip_plan_items ADD COLUMN brand TEXT NOT NULL DEFAULT '';
