-- ເພີ່ມຄໍລຳ cooler_type ໃນໃບສັນຍາຢືມ (ເກັບ Cooler Type ທີ່ເລືອກໃນຟອມ ເພື່ອສ້າງ Asset Tracking ອັດຕະໂນມັດ ຕອນເລືອກ "ຕູ້ເຄື່ອນຍ້າຍ")
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_loan_cooler_type.sql

ALTER TABLE loan_contracts ADD COLUMN cooler_type TEXT;
