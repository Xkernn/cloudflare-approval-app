-- Route Plan ປະຈຳວັນ ຂອງທີມຈັດສົ່ງ (role delivery): ມື້ນີ້ຈະໄປສົ່ງ/ເກັບຕູ້ຮ້ານໃດ
-- ຮັນ: wrangler d1 execute <DB_NAME> --remote --file=migration_add_delivery_route_plan.sql
CREATE TABLE IF NOT EXISTS delivery_route_plan_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    plan_date  TEXT NOT NULL,              -- YYYY-MM-DD (ວັນທີຕາມເຄື່ອງຂອງຜູ້ໃຊ້)
    asset_id   INTEGER NOT NULL,           -- assets.id
    action     TEXT NOT NULL,              -- 'deliver' = ສົ່ງຕູ້ໄປຮ້ານ · 'collect' = ເກັບຕູ້ຈາກຮ້ານ
    seq        INTEGER NOT NULL DEFAULT 0, -- ລຳດັບໃນແຜນ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, plan_date, asset_id, action)
);
CREATE INDEX IF NOT EXISTS idx_route_plan_user_date ON delivery_route_plan_items(user_id, plan_date);
