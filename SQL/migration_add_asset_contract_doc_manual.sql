-- ໜ້າ Asset Tracking: Admin ໝາຍ "ສັນຍາ: ມີເອກະສານ" ດ້ວຍມືໄດ້ ໃນກໍລະນີມີເອກະສານຕົວຈິງ ແຕ່ບໍ່ມີໃບສັນຍາຢືມເຊັນແລ້ວໃນລະບົບ
-- (ບໍ່ແຕະ loan_contracts - ຄ່ານີ້ເປັນພຽງການໝາຍຂອງ Admin ເທົ່ານັ້ນ)
--
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_asset_contract_doc_manual.sql
-- (ທົດສອບໃນເຄື່ອງ: ປ່ຽນ --remote ເປັນ --local)
ALTER TABLE assets ADD COLUMN contract_doc_manual INTEGER DEFAULT 0; -- 1 = Admin ໝາຍວ່າ "ມີເອກະສານສັນຍາ" (ຕົວຈິງ)
ALTER TABLE assets ADD COLUMN contract_doc_manual_at DATETIME;        -- ວັນເວລາທີ່ Admin ໝາຍ
ALTER TABLE assets ADD COLUMN contract_doc_manual_by TEXT;            -- Admin ຄົນທີ່ໝາຍ (email)
