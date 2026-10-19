-- ໃຊ້ໄຟລ໌ນີ້ເພື່ອເພີ່ມຄໍລຳ "ລະດັບຮ້ານ" (outlet_level) ໃສ່ຕາຕະລາງ outlets — ໃຫ້ກັບ DB ທີ່ deploy ໄປແລ້ວ
-- (ຕ້ອງຮັນ migration_add_outlets.sql ກ່ອນ ຖ້າຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງ outlets)
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_outlet_level.sql

ALTER TABLE outlets ADD COLUMN outlet_level TEXT;
