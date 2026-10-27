-- ນຳໃຊ້ຄັ້ງດຽວ ກ່ອນ deploy ໂຄ້ດທີ່ປ່ຽນ dup-check query ໃຫ້ປຽບທຽບ code = ? ກົງໆ (ແທນ UPPER(TRIM(code)))
-- ເພື່ອໃຫ້ຂໍ້ມູນເກົ່າທີ່ອາດຍັງບໍ່ໄດ້ trim/uppercase (ບັນທຶກກ່ອນມີ logic normalize ຢູ່ save-outlet) ຖືກປັບໃຫ້ຄືກັນໝົດ
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_normalize_outlet_codes.sql

UPDATE outlets
SET code = UPPER(TRIM(REPLACE(REPLACE(REPLACE(code, ' ', ''), CHAR(9), ''), CHAR(10), '')))
WHERE code != UPPER(TRIM(REPLACE(REPLACE(REPLACE(code, ' ', ''), CHAR(9), ''), CHAR(10), '')));

ANALYZE;
