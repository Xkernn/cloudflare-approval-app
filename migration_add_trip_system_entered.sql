-- admin ຢືນຢັນວ່າຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ "ເອົາເຂົ້າລະບົບແລ້ວ"
ALTER TABLE ship_trips ADD COLUMN system_entered_at DATETIME;
ALTER TABLE ship_trips ADD COLUMN system_entered_by TEXT;
