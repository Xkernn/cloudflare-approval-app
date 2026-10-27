-- ເພີ່ມສະຖານະ "ກຳລັງໃຊ້ງານ Event" (status = 'event') ໃຫ້ສະຕ໋ອກສາງ
-- ບໍ່ຕ້ອງປ່ຽນໂຄງສ້າງຕາຕະລາງ (status ເປັນ TEXT) - ໄຟລ໌ນີ້ຮັນ "ຄັ້ງດຽວ" ເພື່ອປັບຂໍ້ມູນຕູ້ທີ່ຢູ່ Event ຢູ່ແລ້ວ (ຍັງບໍ່ໄດ້ເອົາກັບຄືນ)
-- ຄວນຮັນກ່ອນເລີ່ມຮອບກວດນັບຈິງ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_stock_event_status.sql
-- ຈັບຄູ່ຕູ້ດ້ວຍ QR ຫຼື Serial ຄືກັບລະບົບອື່ນ; ປັບສະເພາະສະຕັອກທີ່ຍັງ "ຢູ່ໃນສາງ" ເທົ່ານັ້ນ

-- 1) ບັນທຶກປະຫວັດກ່ອນ (ຕ້ອງເຮັດກ່ອນ UPDATE ເພື່ອໃຫ້ old_status ຖືກຕ້ອງ)
INSERT INTO warehouse_stock_history
  (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
SELECT ws.id, ws.warehouse_id, NULL, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
       'in_warehouse', 'event', 'system', 'ປັບຂໍ້ມູນເກົ່າ: ຕູ້ນີ້ຢູ່ Event ຢູ່ (ຍັງບໍ່ໄດ້ເອົາກັບຄືນ)'
FROM warehouse_stock ws
WHERE ws.status = 'in_warehouse'
  AND EXISTS (
    SELECT 1 FROM cooler_events ce
    WHERE ce.returned = 0
      AND ((ce.qr_code IS NOT NULL AND ce.qr_code != '' AND ce.qr_code = ws.qr_code)
        OR (ce.serial_number IS NOT NULL AND ce.serial_number != '' AND ce.serial_number = ws.serial_number))
  );

-- 2) ປ່ຽນສະຖານະ
UPDATE warehouse_stock
SET status = 'event', updated_at = CURRENT_TIMESTAMP
WHERE status = 'in_warehouse'
  AND EXISTS (
    SELECT 1 FROM cooler_events ce
    WHERE ce.returned = 0
      AND ((ce.qr_code IS NOT NULL AND ce.qr_code != '' AND ce.qr_code = warehouse_stock.qr_code)
        OR (ce.serial_number IS NOT NULL AND ce.serial_number != '' AND ce.serial_number = warehouse_stock.serial_number))
  );
