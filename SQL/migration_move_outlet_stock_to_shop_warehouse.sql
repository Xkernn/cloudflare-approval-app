-- ຍ້າຍສະຕັອກທີ່ເປັນ 'outlet' (ຈັດສົ່ງໄປຮ້ານແລ້ວ) ໄປຢູ່ສາງ "ຮ້ານຄ້າ" (ຮັນ "ຄັ້ງດຽວ" ຫຼັງຈາກສ້າງສາງຊື່ "ຮ້ານຄ້າ" ໃນໜ້າຈັດການສາງແລ້ວ)
-- ຖ້າຍັງບໍ່ສ້າງສາງນີ້ ໄຟລ໌ນີ້ຈະບໍ່ເຮັດຫຍັງ. ສາງເດີມຖືກບັນທຶກໄວ້ໃນ old_warehouse_id ເພື່ອໃຫ້ຕອນເກັບຄືນສາງ ກັບໄປສາງເດີມໄດ້
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_move_outlet_stock_to_shop_warehouse.sql

-- 1) ບັນທຶກປະຫວັດກ່ອນ UPDATE
INSERT INTO warehouse_stock_history
  (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
SELECT ws.id, shop.id, ws.warehouse_id, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
       'outlet', 'outlet', 'system', 'ປັບຂໍ້ມູນເກົ່າ: ຍ້າຍໄປສາງ ຮ້ານຄ້າ'
FROM warehouse_stock ws
JOIN wh_warehouses shop ON shop.name = 'ຮ້ານຄ້າ' AND shop.active = 1
WHERE ws.status = 'outlet' AND ws.warehouse_id != shop.id;

-- 2) ຍ້າຍສາງ
UPDATE warehouse_stock
SET warehouse_id = (SELECT id FROM wh_warehouses WHERE name = 'ຮ້ານຄ້າ' AND active = 1 ORDER BY id LIMIT 1),
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'outlet'
  AND EXISTS (SELECT 1 FROM wh_warehouses WHERE name = 'ຮ້ານຄ້າ' AND active = 1)
  AND warehouse_id != (SELECT id FROM wh_warehouses WHERE name = 'ຮ້ານຄ້າ' AND active = 1 ORDER BY id LIMIT 1);
