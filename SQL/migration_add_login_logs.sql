-- เพิ่มตารางสำหรับฟีเจอร์ "Log ການເຂົ້າສູ່ລະບົບ" (Admin ดู log ว่า user ไหน login วันที่/เวลาไหน)
-- รันครั้งเดียวกับ DB ที่มีข้อมูลอยู่แล้ว: npx wrangler d1 execute <database_name> --file=./migration_add_login_logs.sql

CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT,
    mde_code TEXT,
    team TEXT,
    role TEXT,
    logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_logged_in_at ON login_logs(logged_in_at);
