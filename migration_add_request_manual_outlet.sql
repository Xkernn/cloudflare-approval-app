-- ຂໍ້ມູນຮ້ານທີ່ບໍ່ມີ Outlet Code (ຕິກ "ຮ້ານນີ້ບໍ່ມີ Outlet Code" ຕອນສົ່ງຄຳຂໍ Asset) - ເກັບໃນຄຳຂໍເທົ່ານັ້ນ ບໍ່ເຂົ້າ Outlet Master Data
-- ໃຊ້ຕື່ມຂໍ້ມູນຮ້ານໃນໃບສັນຍາຢືມອັດຕະໂນມັດຫຼັງອະນຸມັດ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_request_manual_outlet.sql

ALTER TABLE asset_requests ADD COLUMN outlet_owner TEXT;
ALTER TABLE asset_requests ADD COLUMN outlet_type TEXT;
ALTER TABLE asset_requests ADD COLUMN outlet_level TEXT;
ALTER TABLE asset_requests ADD COLUMN outlet_province TEXT;
ALTER TABLE asset_requests ADD COLUMN outlet_village TEXT;
ALTER TABLE asset_requests ADD COLUMN outlet_district TEXT;
ALTER TABLE asset_requests ADD COLUMN outlet_phone TEXT;
