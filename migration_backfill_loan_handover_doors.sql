-- (ທາງເລືອກ) ແກ້ໃບສັນຍາຢືມ (ຮ່າງ) ທີ່ອອກອັດຕະໂນມັດໄປແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ກາ ການມອບຕູ້ / ຂະໜາດຕູ້
-- ຮັນຫຼັງ migration_add_loan_door_variant.sql:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_backfill_loan_handover_doors.sql

-- ການມອບຕູ້: ມອບຕູ້ໃໝ່ຄັ້ງແລກ (ຮອງຮັບທັງ ໃຫມ່ ແລະ ໃໝ່)
UPDATE loan_contracts SET handover_type = 'new'
WHERE handover_type IS NULL AND status != 'completed'
  AND asset_id IN (SELECT id FROM assets WHERE REPLACE(doc_type, 'ໝ', 'ຫມ') = 'ມອບຕູ້ໃຫມ່ຄັ້ງແລກ');

-- ຂະໜາດຕູ້: ເດົາຈາກຊື່ Type ຂອງຕູ້ (ສະເພາະຊື່ທີ່ບອກຊັດເຈນ ເຊັ່ນ "2 door")
UPDATE loan_contracts SET doors = 1, door_variant = 'table_cooler'
WHERE doors IS NULL AND status != 'completed' AND asset_id IN (
  SELECT id FROM assets WHERE LOWER(COALESCE(cooler_type,'')) LIKE '%table cooler%');

UPDATE loan_contracts SET doors = (
  SELECT CASE
    WHEN LOWER(COALESCE(a.cooler_type,'')) LIKE '%3 door%' OR LOWER(COALESCE(a.cooler_type,'')) LIKE '%3door%' THEN 3
    WHEN LOWER(COALESCE(a.cooler_type,'')) LIKE '%2 door%' OR LOWER(COALESCE(a.cooler_type,'')) LIKE '%2door%' THEN 2
    WHEN LOWER(COALESCE(a.cooler_type,'')) LIKE '%1 door%' OR LOWER(COALESCE(a.cooler_type,'')) LIKE '%1door%' THEN 1
    ELSE NULL END
  FROM assets a WHERE a.id = loan_contracts.asset_id)
WHERE doors IS NULL AND status != 'completed' AND asset_id IS NOT NULL;
