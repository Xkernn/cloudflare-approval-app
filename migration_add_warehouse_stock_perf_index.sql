-- ເລັ່ງໜ້າ "ສະຕັອກສາງ": GET /api/warehouse-stock ORDER BY updated_at DESC (ເມື່ອກ່ອນຕ້ອງ sort ທັງຕາຕະລາງ)
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_updated ON warehouse_stock(updated_at DESC);
-- ເລັ່ງ computeStockBudgetAlerts (subquery ນັບ asset_requests ຕໍ່ງົບ)
CREATE INDEX IF NOT EXISTS idx_asset_requests_status_team_brand_type ON asset_requests(status, team, cooler_brand, cooler_type);
