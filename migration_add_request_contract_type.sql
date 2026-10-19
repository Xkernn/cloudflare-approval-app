-- ເພີ່ມ "ປະເພດສັນຍາ" ໃນຂັ້ນຕອນຂໍ Asset — ຄ່ານີ້ຈະຖືກໃຊ້ຕອນອອກໃບສັນຍາຢືມ (ຮ່າງ) ອັດຕະໂນມັດຫຼັງອະນຸມັດ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_request_contract_type.sql

ALTER TABLE asset_requests ADD COLUMN contract_type TEXT;  -- partner_club | competitive | none
