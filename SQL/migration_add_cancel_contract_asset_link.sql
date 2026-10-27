-- ໃບ T- (ຮັບຕູ້ເຂົ້າສາງ) ສ້າງ Asset Tracking ອັດຕະໂນມັດ (doc_type "ເກັບຄືນສາງ") ແລ້ວຜູກໃບເຂົ້າກັບ Asset ນັ້ນ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_cancel_contract_asset_link.sql

ALTER TABLE cancel_contracts ADD COLUMN asset_id INTEGER REFERENCES assets(id);
ALTER TABLE cancel_contracts ADD COLUMN tracking_no TEXT;
ALTER TABLE cancel_contracts ADD COLUMN cooler_type TEXT;
