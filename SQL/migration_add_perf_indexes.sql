-- ເພີ່ມ index ໃສ່ assets ແລະ asset_requests
-- ສາເຫດຫຼັກທີ່ Rows Read ຂອງ Cloudflare D1 ສູງຜິດປົກກະຕິ: ຕາຕະລາງ assets ແລະ asset_requests
-- ບໍ່ມີ index ໃສ່ mde_code / user_id ເລີຍ, ເຮັດໃຫ້ທຸກຄັ້ງທີ່ user ທຳມະດາ (non-admin) ເອີ້ນ
-- /api/assets ຫຼື /api/asset-requests (ລວມທັງ badge polling ທຸກໆ 60 ວິນາທີ) SQLite ຕ້ອງ scan
-- ຄົບທຸກແຖວໃນຕາຕະລາງ ເພື່ອຫາແຖວທີ່ mde_code / user_id ກົງກັນ ທັ້ງໆທີ່ຄົນນັ້ນຕ້ອງການແຄ່ 2-3 ແຖວ.
--
-- ໝາຍເຫດ: ສຳລັບ admin/warehouse/delivery (canViewAll) ທີ່ຂໍ "ທັງໝົດ" ຢູ່ແລ້ວ index ນີ້ຊ່ວຍໄດ້ໜ້ອຍ
-- (ຍັງຕ້ອງອ່ານເກືອບທຸກແຖວຢູ່ດີ) — ສ່ວນນັ້ນແກ້ດ້ວຍ endpoint /api/badge-counts ໃໝ່ ທີ່ໃຊ້ COUNT(*)
-- ແທນ SELECT * ສຳລັບການ poll badge ທຸກ 60 ວິນາທີ (ບໍ່ຕ້ອງດຶງທຸກ column/ຮູບ base64 ມາທຸກຄັ້ງ).

CREATE INDEX IF NOT EXISTS idx_assets_mde_code_status ON assets(mde_code, status);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_asset_requests_user_id ON asset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_requests_status ON asset_requests(status);

-- ອັບເດດສະຖິຕິຕາຕະລາງໃຫ້ query planner ຮູ້ວ່າ index ໃໝ່ມີຢູ່ ແລະ ຄວນໃຊ້ (ຄວນລັນຫຼັງ migrate ໃນ production ຄັ້ງດຽວ)
ANALYZE;
