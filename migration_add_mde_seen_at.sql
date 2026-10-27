-- ສຽງເຕືອນ "DSM ເຊັນເອກະສານແລ້ວ": ບັນທຶກວ່າ MDE ເຄີຍເປີດເບິ່ງໃບທີ່ເຊັນຄົບແລ້ວ ຫຼືຍັງ
ALTER TABLE loan_contracts ADD COLUMN mde_seen_at DATETIME;
ALTER TABLE cancel_contracts ADD COLUMN mde_seen_at DATETIME;
-- ໃບທີ່ເຊັນຄົບກ່ອນໜ້ານີ້ ຖືວ່າເຄີຍເບິ່ງແລ້ວ (ບໍ່ໃຫ້ສຽງດັງທັນທີຫຼັງ deploy)
UPDATE loan_contracts SET mde_seen_at = CURRENT_TIMESTAMP WHERE status = 'completed';
UPDATE cancel_contracts SET mde_seen_at = CURRENT_TIMESTAMP WHERE status = 'completed';
