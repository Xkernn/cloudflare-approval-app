-- ສະແກນຢືນຢັນວ່າມີຕູ້ຂຶ້ນລົດ ໃນຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ (ໜ້າ "ຖ້ຽວລົດສົ່ງຕູ້")
--   new_coolers.trip_scanned_at/by  : ຕູ້ໃໝ່ທີ່ຢູ່ໃນຖ້ຽວ ຖືກສະແກນຢືນຢັນແລ້ວ (NULL = ຍັງບໍ່ໄດ້ສະແກນ)
--   ship_trip_stock.scanned_at/by   : ຕູ້ຈາກສາງທີ່ຢູ່ໃນຖ້ຽວ ຖືກສະແກນຢືນຢັນແລ້ວ
-- ຕ້ອງຮັນ migration_add_ship_trips.sql ໄປກ່ອນແລ້ວ ແລະ ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່. ຮັນດ້ວຍຄຳສັ່ງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_trip_scan.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)

ALTER TABLE new_coolers ADD COLUMN trip_scanned_at DATETIME;
ALTER TABLE new_coolers ADD COLUMN trip_scanned_by TEXT;
ALTER TABLE ship_trip_stock ADD COLUMN scanned_at DATETIME;
ALTER TABLE ship_trip_stock ADD COLUMN scanned_by TEXT;
