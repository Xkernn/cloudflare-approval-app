-- ເພີ່ມພິກັດສາງ ເພື່ອສະແດງ mini map ໃນ popup Asset Tracking (ລົດອອກຈາກສາງ -> ຮ້ານ)
-- ຮັນຄັ້ງດຽວ: wrangler d1 execute <DB_NAME> --remote --file=migration_add_warehouse_latlng.sql
ALTER TABLE wh_warehouses ADD COLUMN latitude REAL;
ALTER TABLE wh_warehouses ADD COLUMN longitude REAL;
