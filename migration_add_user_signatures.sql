-- ລາຍເຊັນທີ່ບັນທຶກໄວ້ຂອງຜູ້ໃຊ້ (role user = MDE / role dsm) — ຮູບເກັບໃນ R2, ຕາຕະລາງນີ້ເກັບ key ເທົ່ານັ້ນ
-- (ໂຄດ /api/my-signature ກໍສ້າງຕາຕະລາງນີ້ອັດຕະໂນມັດຖ້າຍັງບໍ່ມີ ແຕ່ແນະນຳໃຫ້ຮັນໄຟລ໌ນີ້ກ່ອນ deploy)
CREATE TABLE IF NOT EXISTS user_signatures (
  user_id INTEGER PRIMARY KEY,
  r2_key TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
