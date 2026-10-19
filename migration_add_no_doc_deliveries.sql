-- เพิ่มตารางสำหรับฟีเจอร์ "ລາຍງານການຈັດສົ່ງບໍ່ມີເອກະສານ" (บันทึกด้วยมือ แยกจาก assets/asset_requests)
-- รันครั้งเดียวกับ DB ที่มีข้อมูลอยู่แล้ว: npx wrangler d1 execute <database_name> --file=./migration_add_no_doc_deliveries.sql
-- ໝາຍເຫດ: ຖ້າທ່ານເຄີຍຮັນ migration ນີ້ໄປແລ້ວ (ກ່ອນມີ QR/Serial/CapEx/ຮູບ) ໃຫ້ຮັນ
-- migration_add_no_doc_delivery_extra_fields.sql ຕື່ມແທນ (ບໍ່ຕ້ອງຮັນໄຟລ໌ນີ້ຊ້ຳ)

CREATE TABLE IF NOT EXISTS no_doc_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outlet_code TEXT,
    outlet_name TEXT,
    cooler_brand TEXT,
    cooler_type TEXT,
    mde_code TEXT,
    doc_type TEXT,
    qr_code TEXT,
    serial_number TEXT,
    capex TEXT,
    photo_qr TEXT,
    photo_serial TEXT,
    photo_capex TEXT,
    photo_asset TEXT,
    delivered_date TEXT,
    reason TEXT,
    reported_by TEXT,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_no_doc_deliveries_mde_code ON no_doc_deliveries(mde_code);
