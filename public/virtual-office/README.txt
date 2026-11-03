Virtual Company 3D  (/virtual-office/)
- ເມນູ: "Virtual Company 3D" ໃນ sidebar (admin ເທົ່ານັ້ນ) + ໜ້າເມນູມືຖື → ເປີດ /virtual-office/
- ໄຟລ໌: index.html (ໂຄງໜ້າ) · style.css · data.js (Mock Data) · office3d.js (ສາກ 3D) · ui.js (Dashboard)
- ໃຊ້ Three.js r128 + OrbitControls ຈາກ CDN (jsdelivr → unpkg → cdnjs) ຕາມ CSP ໃນ public/_headers
- ບໍ່ມີ Backend/API/Database — ແກ້ພະນັກງານ/ແຜນກທີ່ data.js
- ປຸ່ມລັດ: ← → Pan · Q/E ໝຸນ · + / - Zoom · R ຣີເຊັດ · Esc ປິດແຜງຂໍ້ມູນ

Phase 2 — Warehouse & Logistics (ເພີ່ມເຂົ້າໃນໂລກ 3D ດຽວກັນ)
- ເມນູໃໝ່: Virtual Office · Warehouses · Logistics · Company Overview (ກ້ອງເຄື່ອນໄປພື້ນທີ່ນັ້ນແບບ Smooth, ບໍ່ໂຫຼດໜ້າໃໝ່)
- ໄຟລ໌ໃໝ່: logistics-data.js (Mock Data ແຍກຈາກ UI) · warehouse3d.js (Warehouse) · truck3d.js (Truck) · route3d.js (LogisticsRoute + ຖະໜົນ + ການແລ່ນຂອງລົດ)
- InformationPanel = ui.js (renderWarehousePanel / renderTruckPanel) · office3d.js ເພີ່ມພຽງ extension API (api.ext) ແລະ pick hook — ຟັງຊັນ Phase 1 ບໍ່ປ່ຽນ
- ຕໍ່ API ໃນອະນາຄົດ: ແທນ window.VO_LOGISTICS ດ້ວຍຂໍ້ມູນຈາກ /api/warehouse-stock, /api/ship-trips (ຮັກສາ field ເດີມ) — ບໍ່ມີ Workflow/ລະບົບຈັດການຄັງໃໝ່

Phase 3 — Company Overview & Live Dashboard (Visualization Layer ເທົ່ານັ້ນ — ບໍ່ມີ Database/Workflow ໃໝ່)
- ເປີດ: ແຖບ "Company Overview" → KPI 9 ໃບ (ຄລິກເພື່ອ drill-down) · Department Overview (sidebar, ຄລິກ → ກ້ອງ 3D ໄປພື້ນທີ່) · Live Activity Feed · Analytics 4 ກຣາຟ (ປຸ່ມ Live feed / Analytics)
- ໄຟລ໌ໃໝ່: dashboard-data.js (Mock Source ຕົວແທນລະບົບເດີມ) · data-adapter.js (VO_API → VO_ADAPTER → VO_STORE) · dashboard.js (UI) · charts.js (SVG, lazy-load ເມື່ອເປີດ Analytics)
- ui.js / index.html / style.css / office3d.js: ແກ້ເລັກນ້ອຍ (hook, container, CSS, ຈຳກັດ DPR 1.5 ເທິງ tablet). ຖ້າ dashboard ໂຫຼດບໍ່ໄດ້ → ກັບໄປໃຊ້ Company Overview ແບບ Phase 2
- ຍອດ: Total Employees = ພະນັກງານຫ້ອງການ 29 + ຄົນຂັບລົດ 6 (Logistics) · Departments = 7 ແຜນກ (+ CEO Office, Reception ເປັນ "Other areas")
- Operational Status 7 ຄ່າ (Working/Available/Meeting/Pending/Reviewing/Completed/Delayed): ມາຈາກລະບົບຕົ້ນທາງ, UI ບໍ່ຄຳນວນເອງ
- Delivery started/completed ໃນ Feed ມາຈາກການປ່ຽນສະຖານະລົດໃນສາກ 3D ຈິງ (source "TMS")

ຕໍ່ລະບົບຈິງ (ແກ້ທີ່ window.VO_CONFIG ກ່ອນໂຫຼດ data-adapter.js):
  VO_CONFIG = { mode:'http', baseUrl:'/api', endpoints:{departments,activities,assets,metrics,events},
                headers:function(){return {Authorization:'Bearer …'}}, realtime:{type:'sse'|'ws', url:'…'}, refreshMs:30000 }
  GET departments → [{id, status, budget:{total,spent}}]      (id: sales|marketing|finance|hr|it|operations|logistics)
  GET activities  → [{id, dept, title, status, owner}]        (status: pending|working|meeting|reviewing|completed|delayed)
  GET assets      → [{id,label,icon,count,value}]   GET metrics → {onTimePct:[7], deliveries:[7]}
  GET events      → [{id, ts(ms), type, text, source, ref:{type:'dept|warehouse|truck|employee', id}}]
  Realtime message → {kind:'event', event:{…}, patch:{activity:{id,status}|department:{id,status}}} ຫຼື {kind:'refresh'}
  ພະນັກງານ/ຄັງ/ລົດ ຍັງມາຈາກ data.js / logistics-data.js (Phase 1–2) — ແທນດ້ວຍຂໍ້ມູນຈິງຕາມເດີມ
- ທົດສອບ: ເພີ່ມ ?dash=fail (ຈຳລອງ error) ຫຼື ?dash=slow (ຈຳລອງ loading) ທ້າຍ URL

Phase 4 — Shop Town (ເມືອງຮ້ານຄ້າ 1 ຈຸດ + ລົດວິ່ງເຂົ້າເມືອງແລ້ວຫາຍຕົວ)
- ເມນູໃໝ່: "Shop Town" (ກ້ອງເຄື່ອນໄປເມືອງແບບ Smooth) · ເມືອງຢູ່ທິດໃຕ້-ຕາເວັນຕົກຂອງຫ້ອງການ, ຕໍ່ຖະໜົນແຍກຈາກທາງຫຼວງສາຍຫຼັກ (x=30)
- ໄຟລ໌ໃໝ່: shops-data.js (Mock Data ຮ້ານຄ້າ, ແຍກຈາກ 3D) · town3d.js (ເມືອງ + ຮ້ານ + ລົດ + ລະບົບຈະລາຈອນ)
- ໄຟລ໌ທີ່ແກ້: index.html (ປຸ່ມເມນູ + script) · ui.js (ແຖບ Shop Town, ລາຍການຮ້ານ, panel ຮ້ານ, ຄລິກຕຶກໃນສາກ 3D)
- ເມືອງມີ 14 ຕຶກ: ຮ້ານຄ້າ 11 ຮ້ານ + ຈຸດໝາຍປາຍທາງຂອງລົດ 3 ຈຸດ (Fresh Market, Auto Service, Parking Hall) · ປະຕູເມືອງ + ປ້າຍລອຍສະແດງຈຳນວນລົດສົດ
- ລົດ 10 ຄັນ (sedan/hatch/suv/pickup/van/ຕຸກຕຸກ) ໃຊ້ຊ້ຳ: ເກີດທີ່ປາຍທາງຫຼວງ 3 ຈຸດ (ເໜືອ / Central DC / South Hub) → ເລນຂວາ → ເຂົ້າເມືອງ → ຂັບເຂົ້າປະຕູຕຶກ → ຫາຍຕົວ → ເກີດໃໝ່ (ຫຼັງ 1.5–4 ວິນາທີ)
  · ເວລາເກີດຈະຂະຫຍາຍຂະໜາດຈາກນ້ອຍ → ປົກກະຕິ · ຂັບຕາມຫຼັງຄັນໜ້າ ຫ່າງ ≥ ~5 ຫົວໜ່ວຍ · ຢັບຢັ້ງກັນທີ່ແຍກ x=30 ແລະ z=12 (ບໍ່ຊົນກັນ, ບໍ່ຕິດ)
- ປັບແຕ່ງ (ໃນ town3d.js / shops-data.js):
  · ຈຳນວນລົດສູງສຸດທີ່ແລ່ນພ້ອມກັນ → shops-data.js: town.maxCars (ຕອນນີ້ 8) · ຈຳນວນລົດໃນ pool → KINDS ໃນ town3d.js (10)
  · ຄວາມໄວ: c.maxV = 11 + random*5 (spawn) · ຊ້າລົງໃນເມືອງ ×0.62 · ຄວາມຖີ່ເກີດ: spawnT = 1.8 + random*2.6 ວິນາທີ
  · ໂອກາດໄປແຕ່ລະປາຍທາງ → TAIL[..].w · ໂອກາດມາຈາກແຕ່ລະທາງ → ENTRY[..].w
  · ຕຳແໜ່ງ/ສີ/ຊື່ປ້າຍຂອງຕຶກ → LAYOUT (ອ້າງ id ດຽວກັບ shops-data.js) · ຍ້າຍເມືອງທັງໝົດ → TX, TZ ເທິງສຸດຂອງ town3d.js (ຕ້ອງແກ້ ENTRY/TAIL ໃຫ້ສອດຄ່ອງ)
- ຄລິກຕຶກ/ປ້າຍປະຕູ → Information Panel (ສະຖານະ, ເວລາເປີດ, ຜູ້ເຂົ້າ, ລາຍຮັບ, ຈຳນວນລົດທີ່ເຂົ້າຈຸດນັ້ນ) · ຖ້າ town3d.js ໂຫຼດບໍ່ໄດ້ ສ່ວນອື່ນຍັງໃຊ້ງານໄດ້ປົກກະຕິ
