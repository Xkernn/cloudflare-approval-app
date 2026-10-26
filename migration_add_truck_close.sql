-- ປິດລົດ + ຍົກເລີກການຂຶ້ນລົດ (ສະແກນຕູ້ອອກສາງ)
-- ຮັນຄັ້ງດຽວ ກ່ອນ deploy ໂຄດໃໝ່ (ວາງໃນ D1 Console ຂອງ Cloudflare Dashboard ໄດ້):
-- npx wrangler d1 execute user-approval-db --remote --file=./migration_add_truck_close.sql
ALTER TABLE assets ADD COLUMN truck_closed_at DATETIME;       -- ເວລາກົດ "ປິດລົດ" (ຫຼັງປິດ ຍົກເລີກບໍ່ໄດ້ ຍົກເວັ້ນ Admin)
ALTER TABLE assets ADD COLUMN dispatch_prev_status TEXT;      -- ສະຖານະກ່ອນຂຶ້ນລົດ (ໃຊ້ຕອນຍົກເລີກ ເພື່ອກັບຄືນຖືກຂັ້ນ)
ALTER TABLE warehouse_stock ADD COLUMN truck_closed_at DATETIME; -- ຕູ້ດ່ວນບໍ່ມີເອກະສານ: ເວລາປິດລົດ
