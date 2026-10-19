-- ໃຊ້ຕອນທ່ານເຄີຍຮັນ migration_add_cooler_events.sql ໄປແລ້ວ (ຕາຕະລາງ cooler_events ມີຢູ່ແລ້ວ)
-- ຕອນນີ້ຟັງຊັນ "ລາຍງານຕູ້ແຊ່ Event" ເພີ່ມ QR Code ແລະ CapEx ໄດ້ດ້ວຍ (ນອກຈາກ Serial Number)
-- ຈຶ່ງຕ້ອງເພີ່ມຄໍລຳໃໝ່ນີ້ໃສ່ຕາຕະລາງເກົ່າ (ຮັນຄັ້ງດຽວ):
-- npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cooler_event_extra_fields.sql

ALTER TABLE cooler_events ADD COLUMN qr_code TEXT;
ALTER TABLE cooler_events ADD COLUMN capex TEXT;
