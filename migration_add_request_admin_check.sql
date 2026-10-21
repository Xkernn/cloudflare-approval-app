-- ຂັ້ນຕອນອະນຸມັດ Asset Request 2 ຂັ້ນ: (1) Admin ກວດຂໍ້ມູນ + ຮູບຮ້ານຄ້າ ແລ້ວກົດ "ກວດສອບແລ້ວ" -> (2) Warehouse ອະນຸມັດ ແລະ ໃສ່ QR/Serial/CapEx
-- status ຂອງຄຳຂໍຍັງເປັນ 'pending' ຈົນກວ່າສາງອະນຸມັດ (ໂຄຕ້າ/badge/ປະຫວັດເດີມເຮັດວຽກຕາມເດີມ) ຄໍລຳໃໝ່ຈຶ່ງບອກວ່າ Admin ກວດແລ້ວຫຼືຍັງ
-- ຕ້ອງຮັນໄຟລ໌ນີ້ ກ່ອນ deploy ໂຄ້ດໃໝ່:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_request_admin_check.sql
-- (ຖ້າຮັນຊ້ຳແລ້ວຂຶ້ນ "duplicate column name" ແປວ່າເພີ່ມຄໍລຳແລ້ວ ບໍ່ຕ້ອງຮັນອີກ)
-- ໝາຍເຫດ: ຄຳຂໍທີ່ pending ຢູ່ກ່ອນ deploy ຈະຖືກນັບວ່າ "ຍັງບໍ່ທັນກວດ" -> Admin ຕ້ອງກົດກວດສອບກ່ອນ ສາງຈຶ່ງອະນຸມັດໄດ້

ALTER TABLE asset_requests ADD COLUMN admin_checked_by TEXT;
ALTER TABLE asset_requests ADD COLUMN admin_checked_at DATETIME;
