-- Spare Cooler ຂອງ admin: ເກັບເປັນແຖວໃນ budgets ທີ່ team = 'ADMIN_SPARE' (ເພີ່ມຜ່ານໜ້າງົບປະມານ -> ເລືອກ Team "Spare Cooler (Admin)")
-- ເມື່ອງົບທີມໃດໝົດ admin ກົດ "ໂອນໃຫ້ທີມ" -> ຫັກໂຄຕ້າຈາກ Spare ແລ້ວເພີ່ມໃຫ້ທີມນັ້ນ (Brand/Type ດຽວກັນ) — ໂຄຕ້າລວມບໍ່ປ່ຽນ ຈຶ່ງບໍ່ກະທົບການເຕືອນສະຕ໋ອກ
-- budget_transfers = ປະຫວັດການໂອນ Spare -> ທີມ
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_spare_cooler.sql
CREATE TABLE IF NOT EXISTS budget_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_team TEXT NOT NULL,
    to_team TEXT NOT NULL,
    cooler_brand TEXT,
    cooler_type TEXT,
    quantity INTEGER NOT NULL,
    note TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_budget_transfers_to_team ON budget_transfers(to_team, created_at);
