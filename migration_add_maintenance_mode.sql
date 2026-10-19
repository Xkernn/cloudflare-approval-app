-- ໂໝດປິດລະບົບ (Maintenance): Admin ເປີດ/ປິດໄດ້ຈາກ Admin Dashboard. ເມື່ອເປີດ ມີແຕ່ role admin ແລະ team ADMIN TEAM ເຂົ້າໄດ້
-- ຮັນຄັ້ງດຽວກັບ DB ທີ່ deploy ແລ້ວ (ກ່ອນ deploy ໂຄດໃໝ່):
--   npx wrangler d1 execute user-approval-db --remote --file=./migration_add_maintenance_mode.sql
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('maintenance_enabled', '0');
