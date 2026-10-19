-- ເພີ່ມຕົວເລືອກເສີມເມື່ອເລືອກຂະໜາດຕູ້ = 1 ປະຕູ: '1 door modern small' ຫຼື 'table cooler'
-- ຄ່າທີ່ເລືອກຈະຖືກຕໍ່ທ້າຍຊື່ຍີ່ຫໍ້ຕູ້ແຊ່ ໃນໃບສັນຍາ PDF
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_loan_door_variant.sql

ALTER TABLE loan_contracts ADD COLUMN door_variant TEXT;  -- modern_small | table_cooler (ສະເພາະ doors = 1)
