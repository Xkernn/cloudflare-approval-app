-- ລຶບ/ຍົກເລີກຂໍ້ມູນຂອງລະບົບ "ລືມລະຫັດຜ່ານ" ແບບເກົ່າ (admin ອະນຸມັດ / admin ອອກລະຫັດ) — ໃຊ້ OTP ທາງອີເມວຢ່າງດຽວ
-- ຮັນຄັ້ງດຽວກັບ DB ທີ່ deploy ແລ້ວ:
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_cleanup_old_password_reset.sql
-- ລຶບ hash ລະຫັດຜ່ານໃໝ່ທີ່ຄ້າງລໍ admin ອະນຸມັດ, ticket ແລະລະຫັດ Reset ເກົ່າທັງໝົດ (ບໍ່ມີທາງໃຊ້ແລ້ວ)
UPDATE password_reset_requests
   SET status = 'cancelled', code_hash = NULL, new_password_hash = NULL, ticket_hash = NULL
 WHERE status IN ('pending', 'verifying', 'awaiting_admin', 'issued');
