-- ລິ້ງເຊັນຄັ້ງດຽວ (ຜູ້ຮັບຕູ້ປາຍທາງ + DSM): ບໍ່ມີວັນໝົດອາຍຸຖ້າຍັງບໍ່ເຊັນ
-- ປັບລິ້ງທີ່ຍັງ pending (ລວມທີ່ເຄີຍໝົດອາຍຸແລ້ວ) ໃຫ້ໃຊ້ໄດ້ອີກ. ລິ້ງທີ່ເຊັນແລ້ວບໍ່ປ່ຽນ.
UPDATE ship_trip_receipts SET expires_at = '9999-12-31 23:59:59' WHERE status = 'pending';
UPDATE dsm_sign_links     SET expires_at = '9999-12-31 23:59:59' WHERE status = 'pending';
