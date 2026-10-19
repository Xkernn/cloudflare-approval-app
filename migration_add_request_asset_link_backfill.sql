-- ພາກສ່ວນ backfill + index ຂອງ migration_add_request_asset_link.sql (ບໍ່ມີ ALTER TABLE)
-- ໃຊ້ເມື່ອຄໍລຳ asset_requests.asset_id ມີຢູ່ແລ້ວ (ຮັນ ALTER ແລ້ວເກີດ error "duplicate column name: asset_id")
-- ຮັນຊ້ຳໄດ້ປອດໄພ: UPDATE ແຕະສະເພາະແຖວທີ່ asset_id ຍັງເປັນ NULL, INDEX ໃຊ້ IF NOT EXISTS
--
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_request_asset_link_backfill.sql

-- 1) Backfill: ຄຳຂໍທີ່ອະນຸມັດແລ້ວ -> ຫາ Asset ທີ່ມີ MDE + Outlet + QR + Serial ກົງກັນ (ເອົາອັນລ່າສຸດ)
UPDATE asset_requests
SET asset_id = (
  SELECT MAX(a.id) FROM assets a
  WHERE a.mde_code = asset_requests.mde_code
    AND a.outlet_code IS asset_requests.outlet_code
    AND a.qr_code IS asset_requests.qr_code
    AND a.serial_number IS asset_requests.serial_number
)
WHERE status = 'approved' AND asset_id IS NULL;

-- 2) Backfill: ໃບສັນຍາທີ່ອອກແບບ manual (asset_id = NULL) ແຕ່ມີ QR/Serial + ຮ້ານ + MDE ກົງກັບ Asset -> ເຊື່ອມໃຫ້
UPDATE loan_contracts
SET asset_id = (
  SELECT MAX(a.id) FROM assets a
  WHERE UPPER(a.mde_code) = UPPER(loan_contracts.mde_code)
    AND a.outlet_code = loan_contracts.outlet_code
    AND (
      (IFNULL(loan_contracts.qr_cd, '') != '' AND a.qr_code = loan_contracts.qr_cd)
      OR (IFNULL(loan_contracts.serial_no, '') != '' AND a.serial_number = loan_contracts.serial_no)
    )
),
tracking_no = COALESCE(tracking_no, (
  SELECT MAX(a.tracking_no) FROM assets a
  WHERE UPPER(a.mde_code) = UPPER(loan_contracts.mde_code)
    AND a.outlet_code = loan_contracts.outlet_code
    AND (
      (IFNULL(loan_contracts.qr_cd, '') != '' AND a.qr_code = loan_contracts.qr_cd)
      OR (IFNULL(loan_contracts.serial_no, '') != '' AND a.serial_number = loan_contracts.serial_no)
    )
))
WHERE asset_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_requests_asset_id ON asset_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_requests_status_mde ON asset_requests(status, mde_code);
