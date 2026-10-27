-- เพิ่มตารางสำหรับฟีเจอร์ "Push Notification" (แจ้งเตือนไปยังมือถือ/เบราว์เซอร์ของผู้ใช้)
-- รันครั้งเดียวกับ DB ที่มีข้อมูลอยู่แล้ว: npx wrangler d1 execute <database_name> --file=./migration_add_push_subscriptions.sql

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,   -- URL ของ Push Service (Google/Mozilla/ฯลฯ) เฉพาะของอุปกรณ์นั้น
    p256dh TEXT NOT NULL,            -- Public key ของอุปกรณ์ (สำหรับเข้ารหัสข้อความ)
    auth TEXT NOT NULL,              -- Auth secret ของอุปกรณ์ (สำหรับเข้ารหัสข้อความ)
    user_agent TEXT,                 -- เก็บไว้ดูว่าสมัครจากอุปกรณ์/เบราว์เซอร์ไหน
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
