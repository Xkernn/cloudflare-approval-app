-- ສະແກນຕູ້ອອກສາງຂຶ້ນລົດ (ຢູ່ເທິງລົດ ກຳລັງເດີນທາງໄປຮ້ານ) — ກ່ອນຂັ້ນຕອນ "ລາຍງານການຈັດສົ່ງ" ຢູ່ຮ້ານ
--   Asset: ໃຊ້ status "ຢູ່ລະຫວ່າງຈັດສົ່ງ" ທີ່ມີຢູ່ແລ້ວ + ບັນທຶກເວລາ/ຜູ້ສະແກນອອກສາງ ດ້ວຍ 2 ຄໍລຳນີ້
--   ສະຕັອກສາງ: status ໃໝ່ 'on_truck' (ບໍ່ມີ CHECK constraint ຈຶ່ງບໍ່ຕ້ອງແກ້ຕາຕະລາງ warehouse_stock)
-- ຮັນຄັ້ງດຽວ ກ່ອນ deploy ໂຄດໃໝ່ (ວາງໃນ D1 Console ຂອງ Cloudflare Dashboard ໄດ້):
-- npx wrangler d1 execute user-approval-db --remote --file=./migration_add_dispatch_on_truck.sql

ALTER TABLE assets ADD COLUMN dispatched_at DATETIME;   -- ວັນເວລາສະແກນອອກຈາກສາງຂຶ້ນລົດ
ALTER TABLE assets ADD COLUMN dispatched_by TEXT;       -- ຜູ້ສະແກນ (email)
