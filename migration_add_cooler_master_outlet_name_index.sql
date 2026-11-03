-- ຄົ້ນຫາຕູ້ (Cooler Master) ດ້ວຍຊື່ຮ້ານ: expression index ໃຫ້ຄົ້ນແບບ "ຂຶ້ນຕົ້ນດ້ວຍ" ໂດຍບໍ່ scan ທັງຕາຕະລາງ (ຊ່ວຍຫຼຸດ D1 rows read)
CREATE INDEX IF NOT EXISTS idx_cooler_master_outlet_name_up ON cooler_master(UPPER(outlet_name));
CREATE INDEX IF NOT EXISTS idx_cooler_master_outlet ON cooler_master(outlet_code);
