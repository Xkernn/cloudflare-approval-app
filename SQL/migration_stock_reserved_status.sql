-- ເພີ່ມສະຖານະສະຕັອກ 'reserved' (ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ) - ບໍ່ຕ້ອງປ່ຽນໂຄງສ້າງຕາຕະລາງ (status ເປັນ TEXT)
-- ໄຟລ໌ນີ້ຮັນ "ຄັ້ງດຽວ" ເພື່ອປັບຂໍ້ມູນເກົ່າ: ສະຕັອກທີ່ເປັນ 'outlet' ຫຼື 'in_warehouse' ແຕ່ Asset ທີ່ຈັບຄູ່ (QR/Serial) ຍັງບໍ່ທັນຈັດສົ່ງສຳເລັດ -> 'reserved'
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_stock_reserved_status.sql

-- 1) ບັນທຶກປະຫວັດກ່ອນ UPDATE (ເພື່ອໃຫ້ old_status ຖືກຕ້ອງ)
INSERT INTO warehouse_stock_history
  (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
SELECT ws.id, ws.warehouse_id, NULL, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
       ws.status, 'reserved', 'system', 'ປັບຂໍ້ມູນເກົ່າ: ອະນຸມັດແລ້ວ ແຕ່ຍັງບໍ່ທັນຈັດສົ່ງສຳເລັດ'
FROM warehouse_stock ws
WHERE ws.status IN ('outlet', 'in_warehouse')
  AND EXISTS (
    SELECT 1 FROM assets a
    WHERE IFNULL(a.status, '') != 'ສຳເລັດ'
      AND IFNULL(a.doc_type, '') != 'ເກັບຄືນສາງ'
      AND ((a.qr_code IS NOT NULL AND a.qr_code != '' AND a.qr_code = ws.qr_code)
        OR (a.serial_number IS NOT NULL AND a.serial_number != '' AND a.serial_number = ws.serial_number))
  );

-- 2) ປ່ຽນສະຖານະ
UPDATE warehouse_stock
SET status = 'reserved', updated_at = CURRENT_TIMESTAMP
WHERE status IN ('outlet', 'in_warehouse')
  AND EXISTS (
    SELECT 1 FROM assets a
    WHERE IFNULL(a.status, '') != 'ສຳເລັດ'
      AND IFNULL(a.doc_type, '') != 'ເກັບຄືນສາງ'
      AND ((a.qr_code IS NOT NULL AND a.qr_code != '' AND a.qr_code = warehouse_stock.qr_code)
        OR (a.serial_number IS NOT NULL AND a.serial_number != '' AND a.serial_number = warehouse_stock.serial_number))
  );
