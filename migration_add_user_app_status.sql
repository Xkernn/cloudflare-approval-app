-- เพิ่มคอลัมน์สำหรับหน้า Admin "สถานะการใช้งาน User" (ແທັບ ປະຫວັດການເຂົ້າສູ່ລະບົບ)
-- ໃຊ້ບອກວ່າ user ໃດ ຍັງບໍ່ເປີດແຈ້ງເຕືອນ / ຍັງບໍ່ຕິດຕັ້ງແອັບ / ໃຊ້ງານລ້າສຸດຕອນໃດ
-- ຮັນຄັ້ງດຽວກັບ DB ທີ່ deploy ແລ້ວ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_user_app_status.sql
-- (ຖ້າຮັນຊ້ຳຈະຂຶ້ນ error "duplicate column name" ໃຫ້ຂ້າມໄດ້)

ALTER TABLE users ADD COLUMN last_active_at DATETIME;      -- ເວລາທີ່ແອັບສົ່ງ ping ຫຼ້າສຸດ (UTC)
ALTER TABLE users ADD COLUMN last_mode TEXT;               -- 'app' = ເປີດຜ່ານແອັບທີ່ຕິດຕັ້ງ, 'browser' = ເປີດຜ່ານເບຣົາເຊີ
ALTER TABLE users ADD COLUMN last_platform TEXT;           -- 'android' / 'ios' / 'desktop'
ALTER TABLE users ADD COLUMN app_installed INTEGER DEFAULT 0;  -- 1 = ເຄີຍເປີດຜ່ານແອັບທີ່ຕິດຕັ້ງ ຫຼື ໄດ້ຮັບ event appinstalled
ALTER TABLE users ADD COLUMN app_installed_at DATETIME;
ALTER TABLE users ADD COLUMN notif_permission TEXT;        -- 'granted' / 'denied' / 'default' / 'unsupported'
