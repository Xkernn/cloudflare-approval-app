-- ໃບ T- (ຮັບຕູ້ເຂົ້າສາງ): ເພີ່ມຕົວເລືອກເສີມຂອງຕູ້ 1 ປະຕູ ('1 door modern small' / 'table cooler') ຄືກັນກັບໃບສັນຍາຢືມ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cancel_door_variant.sql

ALTER TABLE cancel_contracts ADD COLUMN door_variant TEXT;  -- modern_small | table_cooler (ສະເພາະ doors = 1)
