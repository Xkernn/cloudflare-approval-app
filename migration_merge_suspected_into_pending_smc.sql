-- ລວມສະຖານະ "ສົງໄສ – ລໍກວດສອບ" (suspected) ເຂົ້າກັບ "Pending SMC MDE" (pending_smc) ເພາະເປັນອັນດຽວກັນ
-- ຕ້ອງຮັນກ່ອນ/ພ້ອມ deploy: wrangler d1 execute <DB_NAME> --remote --file=migration_merge_suspected_into_pending_smc.sql
UPDATE lost_coolers SET status = 'pending_smc', updated_at = CURRENT_TIMESTAMP WHERE status = 'suspected';
