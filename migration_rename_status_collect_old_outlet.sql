-- ປ່ຽນຊື່ສະຖານະ "ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ" -> "ລໍຖ້າທີມງານເກັບຕູ້ຮ້ານເກົ່າ"
-- ສະເພາະ Asset ທີ່ Doc Type = ຕູ້ເຄື່ອນຍ້າຍ / ເກັບຄືນສາງ (Doc Type ອື່ນຍັງໃຊ້ຊື່ເດີມ)
-- ຮັນຄັ້ງດຽວຫຼັງ deploy: wrangler d1 execute <DB_NAME> --remote --file=migration_rename_status_collect_old_outlet.sql
UPDATE assets
   SET status = 'ລໍຖ້າທີມງານເກັບຕູ້ຮ້ານເກົ່າ'
 WHERE status = 'ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ'
   AND doc_type IN ('ຕູ້ເຄື່ອນຍ້າຍ', 'ເກັບຄືນສາງ');

-- ຕູ້ທີ່ຢູ່ເທິງລົດແລ້ວ ແລະ ຈື່ສະຖານະກ່ອນໜ້າໄວ້ (ໃຊ້ຕອນຍົກເລີກການຂຶ້ນລົດ)
UPDATE assets
   SET dispatch_prev_status = 'ລໍຖ້າທີມງານເກັບຕູ້ຮ້ານເກົ່າ'
 WHERE dispatch_prev_status = 'ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ'
   AND doc_type IN ('ຕູ້ເຄື່ອນຍ້າຍ', 'ເກັບຄືນສາງ');
