-- ສາງຈຳລອງ "ຕ່າງແຂວງ" — ເມື່ອຢືນຢັນ "ລົດອອກ" ໃນຖ້ຽວລົດສົ່ງຕ່າງແຂວງ ຕູ້ຈາກສາງຈະຖືກຍ້າຍມາຢູ່ສາງນີ້ (ສະຖານະ shipped_out)
-- ຊື່ຕ້ອງເປັນ "ຕ່າງແຂວງ" ຕົງໆ (ຫຼືສ້າງເອງໃນໜ້າຈັດການສາງກໍໄດ້ ດ້ວຍຊື່ດຽວກັນ) — ຖ້າບໍ່ມີສາງນີ້ ລະບົບຈະບໍ່ຍ້າຍ
-- ຮັນຄັ້ງດຽວ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_province_warehouse.sql
INSERT OR IGNORE INTO wh_warehouses (code, name, is_main, active) VALUES ('WPROV', 'ຕ່າງແຂວງ', 0, 1);
