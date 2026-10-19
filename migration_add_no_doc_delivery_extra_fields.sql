-- ໃຊ້ຕອນທ່ານເຄີຍຮັນ migration_add_no_doc_deliveries.sql ໄປແລ້ວ (ຕາຕະລາງ no_doc_deliveries ມີຢູ່ແລ້ວ)
-- ຕອນນີ້ຟັງຊັນ "ລາຍງານການຈັດສົ່ງບໍ່ມີເອກະສານ" ເພີ່ມ QR Code, Serial Number, CapEx ແລະ ຮູບຢືນຢັນໄດ້ດ້ວຍ
-- ຈຶ່ງຕ້ອງເພີ່ມຄໍລຳໃໝ່ນີ້ໃສ່ຕາຕະລາງເກົ່າ (ຮັນຄັ້ງດຽວ):
-- npx wrangler d1 execute <database_name> --remote --file=./migration_add_no_doc_delivery_extra_fields.sql

ALTER TABLE no_doc_deliveries ADD COLUMN qr_code TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN serial_number TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN capex TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN photo_qr TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN photo_serial TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN photo_capex TEXT;
ALTER TABLE no_doc_deliveries ADD COLUMN photo_asset TEXT;
