/* Virtual Company 3D — Phase 4 Mock Data (Shop Town · ເມືອງຮ້ານຄ້າ)
   ແຍກຈາກ UI/3D ທັງໝົດ — ຕໍ່ API ໃນອະນາຄົດ: ແທນ VO_SHOPS.shops ດ້ວຍຂໍ້ມູນຈິງ (ຮັກສາ field id ເດີມ)
   ຕຳແໜ່ງ/ສີຂອງຕຶກຢູ່ໃນ town3d.js (LAYOUT) ອ້າງອີງດ້ວຍ id ນີ້ */
(function () {
  'use strict';
  var SHOP_STATUS = {
    open:   { label: 'Open',   lao: 'ເປີດ',      color: '#16a34a' },
    busy:   { label: 'Busy',   lao: 'ຄົນຫຼາຍ',    color: '#f59e0b' },
    closed: { label: 'Closed', lao: 'ປິດ',       color: '#94a3b8' }
  };
  var town = { id: 'town', name: 'Shop Town', lao: 'ເມືອງຮ້ານຄ້າ', location: 'Vientiane Capital', maxCars: 8 };
  // kind: retail = ຮ້ານຄ້າ · dest = ຈຸດຫມາຍປາຍທາງຂອງລົດ (ລົດເຂົ້າໄປແລ້ວຫາຍຕົວ)
  var shops = [
    { id: 'sh-mart',    name: 'Mini Mart',      lao: 'ຮ້ານສະດວກຊື້',        kind: 'retail', icon: 'fa-basket-shopping', status: 'busy',   hours: '07:00–22:00', visitors: 312, revenue: '18,450,000' },
    { id: 'sh-cafe',    name: 'Cafe',           lao: 'ຮ້ານກາເຟ',           kind: 'retail', icon: 'fa-mug-hot',         status: 'busy',   hours: '06:30–20:00', visitors: 188, revenue: '7,920,000'  },
    { id: 'sh-bakery',  name: 'Bakery',         lao: 'ຮ້ານເຂົ້າຈີ່',         kind: 'retail', icon: 'fa-bread-slice',     status: 'open',   hours: '06:00–18:00', visitors: 96,  revenue: '4,310,000'  },
    { id: 'sh-pharma',  name: 'Pharmacy',       lao: 'ຮ້ານຂາຍຢາ',          kind: 'retail', icon: 'fa-pills',           status: 'open',   hours: '08:00–21:00', visitors: 74,  revenue: '9,860,000'  },
    { id: 'sh-fashion', name: 'Fashion',        lao: 'ຮ້ານເສື້ອຜ້າ',         kind: 'retail', icon: 'fa-shirt',           status: 'open',   hours: '09:00–20:00', visitors: 58,  revenue: '12,700,000' },
    { id: 'sh-elec',    name: 'Electronics',    lao: 'ຮ້ານເຄື່ອງໄຟຟ້າ',       kind: 'retail', icon: 'fa-plug',            status: 'open',   hours: '08:30–19:00', visitors: 41,  revenue: '25,300,000' },
    { id: 'sh-flower',  name: 'Flowers',        lao: 'ຮ້ານດອກໄມ້',          kind: 'retail', icon: 'fa-seedling',        status: 'closed', hours: '07:00–17:00', visitors: 22,  revenue: '1,540,000'  },
    { id: 'sh-phone',   name: 'Phone Shop',     lao: 'ຮ້ານໂທລະສັບ',         kind: 'retail', icon: 'fa-mobile-screen',   status: 'open',   hours: '09:00–20:00', visitors: 63,  revenue: '31,200,000' },
    { id: 'sh-resto',   name: 'Restaurant',     lao: 'ຮ້ານອາຫານ',           kind: 'retail', icon: 'fa-utensils',        status: 'busy',   hours: '10:00–22:00', visitors: 154, revenue: '14,880,000' },
    { id: 'sh-noodle',  name: 'Noodle Shop',    lao: 'ຮ້ານເຝີ',             kind: 'retail', icon: 'fa-bowl-food',       status: 'open',   hours: '06:00–15:00', visitors: 121, revenue: '5,640,000'  },
    { id: 'sh-books',   name: 'Books & Gifts',  lao: 'ຮ້ານປຶ້ມ ແລະ ຂອງຂວັນ',   kind: 'retail', icon: 'fa-book',            status: 'open',   hours: '09:00–19:00', visitors: 37,  revenue: '3,260,000'  },
    { id: 'sh-market',  name: 'Fresh Market',   lao: 'ຕະຫຼາດສົດ',           kind: 'dest',   icon: 'fa-store',           status: 'busy',   hours: '05:00–17:00', visitors: 420, revenue: '38,900,000' },
    { id: 'sh-auto',    name: 'Auto Service',   lao: 'ສູນບໍລິການລົດ',        kind: 'dest',   icon: 'fa-car-wrench',      status: 'open',   hours: '08:00–18:00', visitors: 47,  revenue: '16,400,000' },
    { id: 'sh-parking', name: 'Parking Hall',   lao: 'ຕຶກຈອດລົດ',           kind: 'dest',   icon: 'fa-square-parking',  status: 'open',   hours: '24 h',        visitors: 265, revenue: '2,650,000'  }
  ];
  window.VO_SHOPS = { town: town, shops: shops, SHOP_STATUS: SHOP_STATUS };
})();
