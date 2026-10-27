-- ເພີ່ມຄຸນສົມບັດ "ຕິດທຸງ" (flag/star) ໃຫ້ Asset Tracking (ຄືກັນກັບ flag ໃນອີເມວ) - Admin ເທົ່ານັ້ນທີ່ຕິດ/ຖອດໄດ້
ALTER TABLE assets ADD COLUMN flagged INTEGER DEFAULT 0;
ALTER TABLE assets ADD COLUMN flagged_at DATETIME;
ALTER TABLE assets ADD COLUMN flagged_by TEXT;
