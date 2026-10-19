-- ຖ້ຽວລົດທີ່ admin ອະນຸມັດ "ເອົາໄປນອກງົບ" ຕອນສ້າງແຜນ (ງົບຕູ້ແຊ່ຕ່າງແຂວງບໍ່ພໍ)
--   budget_override = 1 -> ຕອນກົດ "ຢືນຢັນລົດອອກ" ລະບົບຈະບໍ່ກວດງົບຂອງຖ້ຽວນີ້ (ຖ້າບໍ່ດັ່ງນັ້ນຈະຖືກບລັອກ ເພາະເກີນໂຄຕ້າ)
--   budget_override_by = ອີເມວ admin ທີ່ອະນຸມັດ
-- ຮັນຄັ້ງດຽວ (ກ່ອນ deploy ໂຄ້ດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_ship_trip_budget_override.sql

ALTER TABLE ship_trips ADD COLUMN budget_override INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ship_trips ADD COLUMN budget_override_by TEXT;
