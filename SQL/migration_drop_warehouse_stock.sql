-- ลบตาราง Warehouse Stock (เลิกใช้เมนู "Warehouse Management" แล้ว)
-- รันครั้งเดียวกับ DB ที่มีข้อมูลอยู่แล้ว: npx wrangler d1 execute <database_name> --file=./migration_drop_warehouse_stock.sql
-- คำเตือน: ข้อมูลสต็อกคลังทั้งหมดในตารางนี้จะถูกลบถาวร ถ้าต้องการเก็บข้อมูลไว้ก่อน ให้ export ออกมาก่อนรันไฟล์นี้

DROP TABLE IF EXISTS warehouse_stock;
