-- ປ່ຽນຊື່ສະຖານະ Asset "ຍັງບໍ່ທັນສົ່ງເອກະສານ" -> "ຍັງບໍ່ທັນເຊັນເອກະສານ" ໃຫ້ຂໍ້ມູນເກົ່າ (ຮັນຄັ້ງດຽວ ກ່ອນ/ພ້ອມ deploy)
-- npx wrangler d1 execute user-approval-db --remote --file=./migration_rename_status_unsigned_docs.sql
UPDATE assets SET status = 'ຍັງບໍ່ທັນເຊັນເອກະສານ' WHERE status = 'ຍັງບໍ່ທັນສົ່ງເອກະສານ';

-- (ທາງເລືອກ) ໃບສັນຍາຢືມທີ່ເຊັນຄົບແລ້ວກ່ອນມີລະບົບອັດຕະໂນມັດ -> ເລື່ອນເປັນ "ຍັງບໍ່ຊັບມິດ PowerApp"
UPDATE assets SET status = 'ຍັງບໍ່ຊັບມິດ PowerApp', last_update = CURRENT_TIMESTAMP
WHERE status = 'ຍັງບໍ່ທັນເຊັນເອກະສານ' AND IFNULL(doc_type,'') != 'ເກັບຄືນສາງ'
  AND EXISTS (SELECT 1 FROM loan_contracts lc WHERE lc.status = 'completed'
              AND (lc.asset_id = assets.id OR (IFNULL(lc.tracking_no,'') != '' AND lc.tracking_no = assets.tracking_no)));
