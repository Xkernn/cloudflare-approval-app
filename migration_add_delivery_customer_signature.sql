-- ລາຍເຊັນລູກຄ້າຕອນຈັດສົ່ງ (ຂັ້ນຕອນທີ 5 ຂອງ "ລາຍງານການຈັດສົ່ງ")
--   ມີໃບສັນຍາຢືມ  -> ລາຍເຊັນຖືກເກັບໃນ loan_contracts.sig_outlet (ອອກໃນ PDF) — ບໍ່ຕ້ອງເພີ່ມຄໍລຳ
--   ບໍ່ມີໃບສັນຍາ -> ເກັບໃນ assets ດ້ວຍ 3 ຄໍລຳນີ້ (ຮູບຢູ່ R2 bucket PHOTOS, ເກັບແຕ່ key)
-- ຮັນຄັ້ງດຽວ ກ່ອນ deploy ໂຄດໃໝ່ (ວາງໃນ D1 Console ຂອງ Cloudflare Dashboard ໄດ້):
-- npx wrangler d1 execute user-approval-db --remote --file=./migration_add_delivery_customer_signature.sql

ALTER TABLE assets ADD COLUMN delivery_sig_outlet TEXT;      -- R2 key ລາຍເຊັນລູກຄ້າ (ສະເພາະກໍລະນີບໍ່ມີໃບສັນຍາຢືມ)
ALTER TABLE assets ADD COLUMN delivery_sig_name TEXT;        -- ຊື່ລູກຄ້າທີ່ເຊັນຮັບ
ALTER TABLE assets ADD COLUMN delivery_sig_at DATETIME;      -- ວັນເວລາທີ່ເຊັນ
