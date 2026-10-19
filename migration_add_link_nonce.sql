-- ລິ້ງເຊັນຄັ້ງດຽວ (ລິ້ງເຊັນ DSM + ລິ້ງເຊັນຮັບຕູ້ປາຍທາງ): ເກັບ nonce ເພື່ອໃຫ້ "ສະແດງ/ສົ່ງລິ້ງເກົ່າ" ໄດ້ ແທນການສ້າງລິ້ງໃໝ່ທຸກຄັ້ງ
-- token ຄິດຄືນຈາກ HMAC(SESSION_SECRET, scope + nonce) — ບໍ່ໄດ້ເກັບ token ຕົວຈິງໃນຖານຂໍ້ມູນ (ຍັງເກັບສະເພາະ hash ຄືເດີມ)
-- ຮັນຄັ້ງດຽວ (ຫ້າມຮັນຊ້ຳ) ກ່ອນ deploy ໂຄດໃໝ່:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_link_nonce.sql
-- ໝາຍເຫດ: ລິ້ງທີ່ສ້າງກ່ອນ migration ນີ້ ບໍ່ມີ nonce -> ຄັ້ງທຳອິດທີ່ກົດສ້າງລິ້ງຂອງໃບນັ້ນ ຈະອອກລິ້ງໃໝ່ 1 ຄັ້ງ (ລິ້ງເກົ່າທີ່ແຊຣ໌ໄປແລ້ວຈະໃຊ້ບໍ່ໄດ້) ຫຼັງຈາກນັ້ນຈະໃຊ້ລິ້ງເດີມຊ້ຳໄດ້

ALTER TABLE dsm_sign_links ADD COLUMN nonce TEXT;
ALTER TABLE ship_trip_receipts ADD COLUMN nonce TEXT;
