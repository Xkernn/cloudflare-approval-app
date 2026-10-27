-- ຮັນຫຼັງ migration_rename_status_collect_old_outlet.sql
-- 1) "ຢູ່ລະຫວ່າງຈັດສົ່ງ" -> "ຢູ່ເທິງລົດ / ກຳລັງສົ່ງ"
UPDATE assets SET status = 'ຢູ່ເທິງລົດ / ກຳລັງສົ່ງ' WHERE status = 'ຢູ່ລະຫວ່າງຈັດສົ່ງ';
UPDATE assets SET dispatch_prev_status = 'ຢູ່ເທິງລົດ / ກຳລັງສົ່ງ' WHERE dispatch_prev_status = 'ຢູ່ລະຫວ່າງຈັດສົ່ງ';

-- 2) ເຊົາໃຊ້ "ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ": ຍັງບໍ່ເຄີຍສະແກນຂຶ້ນລົດ -> ສະຖານະລໍຖ້າ ຕາມ Doc Type; ສະແກນແລ້ວ -> ຢູ່ເທິງລົດ
UPDATE assets SET status = 'ຢູ່ເທິງລົດ / ກຳລັງສົ່ງ'
 WHERE status = 'ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ' AND dispatched_at IS NOT NULL;
UPDATE assets SET status = 'ລໍຖ້າທີມງານເກັບຕູ້ຮ້ານເກົ່າ'
 WHERE status = 'ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ' AND doc_type IN ('ຕູ້ເຄື່ອນຍ້າຍ', 'ເກັບຄືນສາງ');
UPDATE assets SET status = 'ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ'
 WHERE status = 'ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ';
UPDATE assets SET dispatch_prev_status = 'ລໍຖ້າທີມງານເກັບຕູ້ຮ້ານເກົ່າ'
 WHERE dispatch_prev_status = 'ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ' AND doc_type IN ('ຕູ້ເຄື່ອນຍ້າຍ', 'ເກັບຄືນສາງ');
UPDATE assets SET dispatch_prev_status = 'ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ' WHERE dispatch_prev_status = 'ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ';
