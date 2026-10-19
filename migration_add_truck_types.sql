-- ແຜນສົ່ງຕູ້ແຊ່ຕ່າງແຂວງ
--  1) truck_types        = ກະບະລົດບັນທຸກ (ກວ້າງ x ຍາວ cm) + ໝຸນຕູ້ໄດ້ບໍ
--  2) truck_cooler_sizes = "ຊະນິດຕູ້" ແຕ່ລະແບບ: ຈຳນວນປະຕູ, Model ທີ່ຢູ່ໃນຊະນິດນີ້, ຂະໜາດ (cm), ຈຳກັດຈຳນວນຕໍ່ລົດ 1 ຄັນ
--     ຕູ້ 1 ປະຕູມີຫຼາຍຂະໜາດຕາມ Model ຈຶ່ງແຍກເປັນຫຼາຍຊະນິດໄດ້ (ເຊັ່ນ 1D_AMD ກັບ 1D_T / 1D_SD)
--     models = ຊື່ Model ແຍກດ້ວຍຈຸດ , (ບໍ່ສົນໃຈຕົວພິມໃຫຍ່/ນ້ອຍ, ຍະຫວ່າງ, _ ແລະ -)
--     is_default = 1 ຄືຊະນິດທີ່ໃຊ້ເມື່ອຕູ້ບໍ່ກົງກັບ Model ໃດ ແຕ່ຮູ້ຈຳນວນປະຕູ (ຕໍ່ 1 ກຸ່ມຈຳນວນປະຕູ)
--  ຕູ້ປົນກັນໃນລົດ: ຄິດສັດສ່ວນ Σ(ຈຳນວນ ÷ ຈຳກັດ) ≤ 1 ແລະ ຕ້ອງວາງລົງໃນກະບະໄດ້ຕາມຂະໜາດຈິງ
-- ໝາຍເຫດ: ໄຟລ໌ນີ້ DROP ຕາຕະລາງເກົ່າແລ້ວສ້າງໃໝ່ — ຮັນຄັ້ງດຽວເທົ່ານັ້ນ ຖ້າຮັນຊ້ຳຈະກັບໄປເປັນຄ່າເລີ່ມຕົ້ນ
-- ຮັນ: npx wrangler d1 execute user-approval-db --remote --file=./migration_add_truck_types.sql

DROP TABLE IF EXISTS truck_cooler_sizes;
DROP TABLE IF EXISTS truck_types;

CREATE TABLE truck_types (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    bed_w        INTEGER NOT NULL DEFAULT 230,
    bed_l        INTEGER NOT NULL DEFAULT 530,
    allow_rotate INTEGER NOT NULL DEFAULT 1,
    note         TEXT,
    updated_by   TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO truck_types (name) VALUES ('ລົດບັນທຸກ');

CREATE TABLE truck_cooler_sizes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    label         TEXT NOT NULL,
    doors         INTEGER NOT NULL,
    models        TEXT,
    w             INTEGER NOT NULL,
    l             INTEGER NOT NULL,
    max_per_truck INTEGER NOT NULL,
    is_default    INTEGER NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO truck_cooler_sizes (label, doors, models, w, l, max_per_truck, is_default, sort_order) VALUES
  ('1 ປະຕູ (1D_AMD)',        1, '1D_AMD',        75, 71, 17, 1, 1),
  ('1 ປະຕູ (1D_T / 1D_SD)',  1, '1D_T, 1D_SD',   54, 65, 26, 0, 2),
  ('2 ປະຕູ',                 2, '',             110, 65, 13, 1, 3),
  ('3 ປະຕູ',                 3, '',             155, 65,  7, 1, 4);
