-- ຮູບຮ້ານຄ້າ ທີ່ແນບມາກັບຄຳຂໍ Asset (ບໍ່ບັງຄັບ, 1 ຮູບ)
--   asset_requests.shop_photo : key ຮູບໃນ R2 bucket PHOTOS (request/<user_id>/shop-<time>.jpg)
-- ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່ (ຫຼືວາງຄຳສັ່ງຂ້າງລຸ່ມໃນ D1 Console ຂອງ Cloudflare Dashboard)
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_request_shop_photo.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE asset_requests ADD COLUMN shop_photo TEXT;
