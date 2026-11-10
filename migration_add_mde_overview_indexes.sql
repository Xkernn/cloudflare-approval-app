-- ໜ້າ Overview ຂອງ role MDE: ນັບຕູ້ / ຕູ້ສູນຫາຍ ຕາມ MDE code (ກັນ D1 scan ທັງຕາຕະລາງ)
CREATE INDEX IF NOT EXISTS idx_cooler_master_mde_norm ON cooler_master(UPPER(TRIM(mde)));
CREATE INDEX IF NOT EXISTS idx_lost_coolers_mde_norm  ON lost_coolers(UPPER(TRIM(mde)), status);
