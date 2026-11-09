/* Virtual Company 3D — Phase 2 Mock Data (Warehouse & Logistics)
   ແຍກຈາກ UI/3D ທັງໝົດ — ຕໍ່ API ໃນອະນາຄົດ: ແທນ VO_LOGISTICS ດ້ວຍຜົນຈາກ /api/warehouse-stock, /api/ship-trips ໂດຍຮັກສາຮູບແບບ field ເທົ່ານີ້.
   ພິກັດ x,z ແມ່ນຫົວໜ່ວຍສາກ 3D (≈ 1 ແມັດ) · ຫ້ອງການຢູ່ (0,0) */
(function () {
  'use strict';
  var WH_STATUS = {
    operating: { label: 'Operating', lao: 'ເປີດດຳເນີນງານ', color: '#16a34a', active: true },
    busy:      { label: 'Busy',      lao: 'ວຽກຫຼາຍ',       color: '#f59e0b', active: true },
    idle:      { label: 'Idle',      lao: 'ວ່າງ/ພັກ',       color: '#94a3b8', active: false }
  };
  var TRUCK_STATUS = {
    loading:   { label: 'Loading',   lao: 'ກຳລັງໂຫຼດ',   color: '#2563eb' },
    onroute:   { label: 'On Route',  lao: 'ກຳລັງເດີນທາງ', color: '#16a34a' },
    unloading: { label: 'Unloading', lao: 'ກຳລັງຖອກ',     color: '#f59e0b' }
  };
  var warehouses = [
    { id: 'wh1', name: 'Vientiane Central DC',     short: 'Central DC', location: 'Vientiane Capital', x: 70, z: -6,  accent: '#2563eb', status: 'operating', totalItems: 12480, inbound: 36, outbound: 52, updated: '2026-11-03 09:42' },
    { id: 'wh2', name: 'Luang Prabang North Hub',  short: 'North Hub',  location: 'Luang Prabang',     x: 60, z: -55, accent: '#7c3aed', status: 'busy',      totalItems: 4820,  inbound: 18, outbound: 27, updated: '2026-11-03 09:38' },
    { id: 'wh3', name: 'Savannakhet South Hub',    short: 'South Hub',  location: 'Savannakhet',       x: 70, z: 50,  accent: '#0d9488', status: 'idle',      totalItems: 6215,  inbound: 9,  outbound: 14, updated: '2026-11-03 08:55' }
  ];
  // roads: polyline ຖະໜົນ (ໃຊ້ວາດພື້ນຖະໜົນ) · ຖະໜົນໜ້າສາງ = z ຂອງສາງ + 18
  var roads = [
    [[30, -37], [30, 68]],        // ທາງຫຼວງສາຍຫຼັກ (ເໜືອ-ໃຕ້)
    [[30, 12], [100, 12]],        // ໜ້າ Central DC
    [[30, -37], [90, -37]],       // ໜ້າ North Hub
    [[30, 68], [100, 68]],        // ໜ້າ South Hub
    [[-12, 20], [30, 20]]         // ທາງເຂົ້າຫ້ອງການ
  ];
  // routes: via = ຈຸດລ້ຽວຂອງຖະໜົນລະຫວ່າງ ປະຕູສາງຕົ້ນທາງ → ປາຍທາງ (ບໍ່ລວມ dock/ເສັ້ນເຂົ້າຈອດ — ຄຳນວນໃນ route3d.js)
  var routes = [
    { id: 'r1', name: 'Central DC → North Hub', from: 'wh1', to: 'wh2', via: [[30, 12], [30, -37]], km: 392, color: '#2563eb' },
    { id: 'r2', name: 'Central DC → South Hub', from: 'wh1', to: 'wh3', via: [[30, 12], [30, 68]], km: 468, color: '#16a34a' },
    { id: 'r3', name: 'North Hub → South Hub',  from: 'wh2', to: 'wh3', via: [[30, -37], [30, 68]], km: 860, color: '#f59e0b' }
  ];
  // dockA/dockB = ຊ່ອງຈອດ (0-3) ຢູ່ສາງຕົ້ນ/ປາຍທາງ · t0 = ວິນາທີເລີ່ມຕົ້ນໃນວົງຈອນ (ເພື່ອໃຫ້ລົດຢູ່ຄົນລະສະຖານະ)
  var trucks = [
    { id: 'TRK-101', plate: 'VTE 1101', type: 'trailer',  route: 'r1', dockA: 0, dockB: 0, driver: 'Somsak P.',  cargo: 'Beverage crates', load: 86, speed: 15, dwell: 9, t0: 2  },
    { id: 'TRK-102', plate: 'VTE 1102', type: 'flatbed',  route: 'r1', dockA: 1, dockB: 1, driver: 'Khamla S.',  cargo: 'Cooler units',    load: 64, speed: 13, dwell: 9, t0: 17 },
    { id: 'TRK-201', plate: 'VTE 2201', type: 'trailer',  route: 'r2', dockA: 2, dockB: 0, driver: 'Bounthong L.', cargo: 'Bottled water',   load: 92, speed: 14, dwell: 9, t0: 8  },
    { id: 'TRK-202', plate: 'VTE 2202', type: 'flatbed',  route: 'r2', dockA: 3, dockB: 1, driver: 'Vilay M.',   cargo: 'Cooler units',    load: 58, speed: 12, dwell: 9, t0: 30 },
    { id: 'TRK-301', plate: 'LPB 3301', type: 'trailer',  route: 'r3', dockA: 2, dockB: 2, driver: 'Nouan K.',   cargo: 'Beverage crates', load: 77, speed: 16, dwell: 9, t0: 22 },
    { id: 'VAN-401', plate: 'LPB 4401', type: 'van',      route: 'r3', dockA: 3, dockB: 3, driver: 'Ketsana D.', cargo: 'Spare parts',     load: 41, speed: 18, dwell: 7, t0: 5  }
  ];
  window.VO_LOGISTICS = { warehouses: warehouses, roads: roads, routes: routes, trucks: trucks, WH_STATUS: WH_STATUS, TRUCK_STATUS: TRUCK_STATUS };
})();
