-- ເພີ່ມຍອດຂາຍລວມ (Total) ແຕ່ລະປະເພດ ໃນໃບສັນຍາຢືມ — ກອກໃນ wizard ກ່ອນ MDE ເຊັນ ແລະ ພິມລົງແຖວ Total ຂອງຕາຕະລາງໃນ loan.pdf
-- ປະເພດ: Beer · Premium · CSD/Energy · Drinking Water/Soda
-- ຮັນດ້ວຍຄຳສັ່ງ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_loan_sales_totals.sql

ALTER TABLE loan_contracts ADD COLUMN sales_beer REAL;
ALTER TABLE loan_contracts ADD COLUMN sales_premium REAL;
ALTER TABLE loan_contracts ADD COLUMN sales_csd_energy REAL;
ALTER TABLE loan_contracts ADD COLUMN sales_water_soda REAL;
