-- GPS ສົດຂອງທີມຈັດສົ່ງ (role delivery): ເກັບສະເພາະ "ຕຳແໜ່ງລ່າສຸດ" ຂອງແຕ່ລະຄົນ (ບໍ່ເກັບປະຫວັດ) ເພື່ອໃຫ້ admin ເບິ່ງໃນໜ້າ ແຜນ Delivery
-- ຮັນ: wrangler d1 execute <DB_NAME> --remote --file=migration_add_delivery_gps.sql
CREATE TABLE IF NOT EXISTS delivery_gps (
    user_id    INTEGER PRIMARY KEY,   -- users.id (role delivery)
    lat        REAL NOT NULL,
    lng        REAL NOT NULL,
    accuracy   REAL,                  -- ແມັດ
    updated_at INTEGER NOT NULL       -- unix ms (ເວລາ server)
);
