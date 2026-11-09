/* Virtual Company 3D — Phase 5 Mock Data (Asset Tracking · ລົດສົ່ງ Asset ຄັນດຽວ)
   ແຍກຈາກ UI/3D ທັງໝົດ — ຕໍ່ API ໃນອະນາຄົດ: ແທນ VO_ASSETS.list ດ້ວຍລາຍການ Asset Tracking ຈິງ (ຮັກສາ field: id, shop, asset, serial, qty, status)
   shop = id ຂອງຮ້ານໃນ shops-data.js (ສະເພາະ kind 'retail') · status: pending | delivering | delivered
   ລົດອ່ານ list ຕອນອອກຈາກສາງແຕ່ລະຮອບ ແລະ ຈະແວ່ສະເພາະຮ້ານທີ່ຍັງມີ Asset ຄ້າງສົ່ງ (pending) ເທົ່ານັ້ນ */
(function () {
  'use strict';
  var STATUS = {
    pending:    { label: 'Pending',    lao: 'ລໍຖ້າສົ່ງ',     color: '#f59e0b' },
    delivering: { label: 'Delivering', lao: 'ກຳລັງສົ່ງ',     color: '#2563eb' },
    delivered:  { label: 'Delivered',  lao: 'ສົ່ງແລ້ວ',      color: '#16a34a' }
  };
  var config = {
    depot: 'wh1', dock: 0,            // ສາງຕົ້ນທາງ (Central DC) + ຊ່ອງຈອດ 0-3
    speed: 10,                        // ຄວາມໄວສູງສຸດ (ຫົວໜ່ວຍສາກ/ວິນາທີ)
    depotWaitSec: 6,                  // ຈອດໂຫຼດທີ່ສາງ ກ່ອນອອກແຕ່ລະຮອບ
    crateSec: 1.1,                    // ເວລາຍົກ Asset 1 ໜ່ວຍລົງຈາກລົດ
    ambientTraffic: false,            // false = ມີແຕ່ລົດສົ່ງ Asset ຄັນດຽວໃນເມືອງ (ປິດລົດສຸ່ມຂອງ Phase 4) · true = ເປີດລົດສຸ່ມຄືເກົ່າ
    demoLoop: true                    // ສົ່ງຄົບແລ້ວ ຣີເຊັດລາຍການເປັນ pending ເພື່ອວົນຮອບໃໝ່ (ປິດຕອນຕໍ່ API ຈິງ)
  };
  var truck = { id: 'DLV-01', plate: 'VTE 5501', type: 'van', driver: 'Somsak P.' };
  var list = [
    { id: 'AT-1001', shop: 'sh-mart',   asset: 'Cooler 300L',    serial: 'CL-300-0141', qty: 2, status: 'pending' },
    { id: 'AT-1002', shop: 'sh-cafe',   asset: 'Display Cooler', serial: 'DC-120-0877', qty: 1, status: 'pending' },
    { id: 'AT-1003', shop: 'sh-bakery', asset: 'Cooler 150L',    serial: 'CL-150-0562', qty: 1, status: 'pending' },
    { id: 'AT-1004', shop: 'sh-resto',  asset: 'Cooler 300L',    serial: 'CL-300-0219', qty: 2, status: 'pending' },
    { id: 'AT-1005', shop: 'sh-noodle', asset: 'Cooler 150L',    serial: 'CL-150-0604', qty: 1, status: 'pending' },
    { id: 'AT-1006', shop: 'sh-books',  asset: 'Display Cooler', serial: 'DC-120-0931', qty: 1, status: 'pending' }
  ];
  window.VO_ASSETS = { config: config, truck: truck, list: list, STATUS: STATUS };
})();
