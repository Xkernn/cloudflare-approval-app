-- ກວດຫາ Outlet Code ທີ່ຊໍ້າກັນແບບບໍ່ສົນຕົວພິມນ້ອຍ/ໃຫຍ່ ແລະ ຍະຫວ່າງ (ຂໍ້ມູນເກົ່າກ່ອນແກ້ໄຂ)
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./check_duplicate_outlets.sql
-- ຖ້າມີຜົນ = ມີລະຫັດຊໍ້າ ຕ້ອງລວມ/ລຶບດ້ວຍມື (ຢ່າລຶບຖ້າ Asset ຍັງອ້າງອີງ code ນັ້ນຢູ່)
SELECT UPPER(TRIM(code)) AS normalized_code, COUNT(*) AS cnt,
       GROUP_CONCAT(id || ':' || code || ' (' || name || ')', ' | ') AS rows_found
FROM outlets
GROUP BY UPPER(TRIM(code))
HAVING COUNT(*) > 1;

-- ກວດຮ້ານຄົນລະ code ແຕ່ຊື່ດຽວກັນ (ອາດເປັນຮ້ານດຽວກັນທີ່ຖືກສ້າງຊ້ຳ)
SELECT LOWER(TRIM(name)) AS normalized_name, COUNT(*) AS cnt,
       GROUP_CONCAT(id || ':' || code, ' | ') AS codes
FROM outlets
GROUP BY LOWER(TRIM(name))
HAVING COUNT(*) > 1;
