/* Virtual Company 3D — Phase 3 · Mock Source (ຕົວແທນ "ລະບົບເດີມ" ຂອງບໍລິສັດ)
   ໄຟລ໌ນີ້ເປັນພຽງ Mock Data ສຳລັບສະແດງຜົນ — ບໍ່ແມ່ນລະບົບທຸລະກິດ/Workflow/Database ໃໝ່.
   ເມື່ອຕໍ່ລະບົບຈິງ: ຕັ້ງ VO_CONFIG.mode = 'http' (ເບິ່ງ data-adapter.js) ແລ້ວ dashboard-data.js ຈະບໍ່ຖືກໃຊ້.
   ພະນັກງານ → data.js · ຄັງ/ລົດ/ເສັ້ນທາງ → logistics-data.js (Phase 1–2, ບໍ່ປ່ຽນ). ໄຟລ໌ນີ້ມີສະເພາະ: ສະຖານະແຜນກ, ກິດຈະກຳ, ງົບ, ຊັບສິນ, metrics, ເຫດການ. */
(function () {
  'use strict';
  var now = Date.now(), MIN = 60000;

  // ---------- state ຂອງ "ລະບົບຕົ້ນທາງ" (ຖືກແກ້ໄຂໄດ້ໂດຍ stream ຈຳລອງ) ----------
  var S = {
    departments: [   // status ມາຈາກລະບົບເດີມ — UI ບໍ່ຄຳນວນເອງ  · budget ຫົວໜ່ວຍ ₭ (LAK)
      { id: 'sales',      status: 'working',   budget: { total: 2400e6, spent: 1610e6 } },
      { id: 'marketing',  status: 'meeting',   budget: { total: 1800e6, spent: 1290e6 } },
      { id: 'finance',    status: 'reviewing', budget: { total: 900e6,  spent: 520e6 } },
      { id: 'hr',         status: 'delayed',   budget: { total: 1100e6, spent: 740e6 } },
      { id: 'it',         status: 'working',   budget: { total: 2800e6, spent: 2130e6 } },
      { id: 'operations', status: 'pending',   budget: { total: 3200e6, spent: 2210e6 } },
      { id: 'logistics',  status: 'working',   budget: { total: 4600e6, spent: 3380e6 } }
    ],
    activities: [    // status: pending | working | meeting | reviewing | completed | delayed
      { id: 'a01', dept: 'sales',      title: 'Monthly sales pipeline review',      status: 'working',   owner: 'e03' },
      { id: 'a02', dept: 'sales',      title: 'Customer proposal – Mekong Retail',  status: 'working',   owner: 'e04' },
      { id: 'a03', dept: 'sales',      title: 'Weekly sales sync',                  status: 'meeting',   owner: 'e05' },
      { id: 'a04', dept: 'sales',      title: 'CRM data cleanup',                   status: 'pending',   owner: 'e06' },
      { id: 'a05', dept: 'sales',      title: 'Q4 distributor contract',            status: 'delayed',   owner: 'e24' },
      { id: 'a06', dept: 'sales',      title: 'Price list update',                  status: 'completed', owner: 'e03' },
      { id: 'a45', dept: 'sales',      title: 'Lead follow-up round',               status: 'completed', owner: 'e04' },
      { id: 'a07', dept: 'marketing',  title: 'Campaign kickoff',                   status: 'meeting',   owner: 'e07' },
      { id: 'a08', dept: 'marketing',  title: 'Social media banners',               status: 'working',   owner: 'e08' },
      { id: 'a09', dept: 'marketing',  title: 'Product article draft',              status: 'reviewing', owner: 'e09' },
      { id: 'a10', dept: 'marketing',  title: 'Photo shoot coordination',           status: 'working',   owner: 'e25' },
      { id: 'a11', dept: 'marketing',  title: 'Brand guideline refresh',            status: 'pending',   owner: 'e07' },
      { id: 'a43', dept: 'marketing',  title: 'Press release – new cooler line',    status: 'completed', owner: 'e09' },
      { id: 'a12', dept: 'finance',    title: 'Payment approvals batch',            status: 'working',   owner: 'e10' },
      { id: 'a13', dept: 'finance',    title: 'Monthly account reconciliation',     status: 'reviewing', owner: 'e11' },
      { id: 'a14', dept: 'finance',    title: 'Budget review with management',      status: 'meeting',   owner: 'e12' },
      { id: 'a15', dept: 'finance',    title: 'Supplier invoice run',               status: 'completed', owner: 'e11' },
      { id: 'a16', dept: 'finance',    title: 'Tax filing preparation',             status: 'pending',   owner: 'e10' },
      { id: 'a42', dept: 'finance',    title: 'Vendor payment run',                 status: 'completed', owner: 'e12' },
      { id: 'a17', dept: 'hr',         title: 'Recruitment shortlist review',       status: 'working',   owner: 'e13' },
      { id: 'a18', dept: 'hr',         title: 'Document delivery round',            status: 'working',   owner: 'e14' },
      { id: 'a19', dept: 'hr',         title: 'Payroll cycle',                      status: 'delayed',   owner: 'e26' },
      { id: 'a20', dept: 'hr',         title: 'New-hire onboarding pack',           status: 'completed', owner: 'e13' },
      { id: 'a21', dept: 'hr',         title: 'Training schedule Q4',               status: 'pending',   owner: 'e13' },
      { id: 'a22', dept: 'it',         title: 'Server health monitoring',           status: 'working',   owner: 'e16' },
      { id: 'a23', dept: 'it',         title: 'Security patch rollout',             status: 'reviewing', owner: 'e17' },
      { id: 'a24', dept: 'it',         title: 'Internal dashboard build',           status: 'working',   owner: 'e18' },
      { id: 'a25', dept: 'it',         title: 'Workstation support ticket',         status: 'working',   owner: 'e19' },
      { id: 'a26', dept: 'it',         title: 'Sprint planning',                    status: 'meeting',   owner: 'e28' },
      { id: 'a27', dept: 'it',         title: 'Backup restore test',                status: 'pending',   owner: 'e17' },
      { id: 'a28', dept: 'it',         title: 'Office Wi-Fi upgrade',               status: 'delayed',   owner: 'e16' },
      { id: 'a44', dept: 'it',         title: 'Quarterly access review',            status: 'completed', owner: 'e17' },
      { id: 'a29', dept: 'operations', title: 'Delivery performance analysis',      status: 'working',   owner: 'e20' },
      { id: 'a30', dept: 'operations', title: 'Cross-department planning',          status: 'meeting',   owner: 'e21' },
      { id: 'a31', dept: 'operations', title: 'Warehouse schedule check',           status: 'working',   owner: 'e22' },
      { id: 'a32', dept: 'operations', title: 'Supplier procurement round',         status: 'pending',   owner: 'e23' },
      { id: 'a33', dept: 'operations', title: 'Monthly operations report',          status: 'completed', owner: 'e20' },
      { id: 'a34', dept: 'logistics',  title: 'Central DC → North Hub shipments',   status: 'working',   owner: null },
      { id: 'a35', dept: 'logistics',  title: 'Central DC → South Hub shipments',   status: 'working',   owner: null },
      { id: 'a36', dept: 'logistics',  title: 'Route optimisation study',           status: 'reviewing', owner: null },
      { id: 'a37', dept: 'logistics',  title: 'Fleet maintenance check',            status: 'pending',   owner: null },
      { id: 'a38', dept: 'logistics',  title: 'Cold-chain audit',                   status: 'completed', owner: null },
      { id: 'a39', dept: 'logistics',  title: 'North Hub dispatch backlog',         status: 'delayed',   owner: null },
      { id: 'a40', dept: 'logistics',  title: 'Driver roster – November',           status: 'completed', owner: null },
      { id: 'a41', dept: 'logistics',  title: 'Inventory count – South Hub',        status: 'completed', owner: null }
    ],
    assets: [        // count = ຈຳນວນ · value = ມູນຄ່າ ₭  ("Vehicles" ຖືກແທນດ້ວຍຈຳນວນລົດຈິງຈາກ logistics-data ໂດຍ adapter)
      { id: 'it',        label: 'IT equipment',          icon: 'fa-laptop',        count: 412, value: 1850e6 },
      { id: 'furniture', label: 'Office furniture',      icon: 'fa-chair',         count: 318, value: 640e6 },
      { id: 'vehicles',  label: 'Vehicles',              icon: 'fa-truck',         count: 6,   value: 5200e6 },
      { id: 'wh-equip',  label: 'Warehouse equipment',   icon: 'fa-dolly',         count: 127, value: 2150e6 },
      { id: 'cooling',   label: 'Cooling units',         icon: 'fa-snowflake',     count: 240, value: 1380e6 }
    ],
    metrics: {       // 7 ວັນຫຼ້າສຸດ (ເກົ່າ → ໃໝ່)
      onTimePct:  [92, 94, 91, 95, 93, 96, 94],
      deliveries: [14, 16, 12, 18, 15, 17, 13]
    },
    events: [        // ປະຫວັດເບື້ອງຕົ້ນ (ໃໝ່ສຸດຢູ່ທ້າຍ)
      { id: 'ev-s1', ago: 41, type: 'goods_received',     text: 'Central DC received 84 cases of bottled water (PO-2291)', source: 'WMS',          ref: { type: 'warehouse', id: 'wh1' } },
      { id: 'ev-s2', ago: 33, type: 'activity_completed', text: 'Phonsavanh Rattana completed “Supplier invoice run”',     source: 'Workflow',     ref: { type: 'dept', id: 'finance' } },
      { id: 'ev-s3', ago: 26, type: 'dept_status',        text: 'HR status updated: Working → Delayed',                    source: 'Dept Status',  ref: { type: 'dept', id: 'hr' } },
      { id: 'ev-s4', ago: 19, type: 'goods_received',     text: 'South Hub received 40 cooler units (PO-2297)',            source: 'WMS',          ref: { type: 'warehouse', id: 'wh3' } },
      { id: 'ev-s5', ago: 11, type: 'activity_completed', text: 'Sengphet Vongsa completed “Press release – new cooler line”', source: 'Workflow', ref: { type: 'dept', id: 'marketing' } },
      { id: 'ev-s6', ago: 5,  type: 'dept_status',        text: 'Finance status updated: Working → Reviewing',             source: 'Dept Status',  ref: { type: 'dept', id: 'finance' } }
    ]
  };

  var STEP_N = 0;
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function deptLabel(id) { var d = (window.VO_DATA.departments || []).filter(function (x) { return x.id === id; })[0]; return d ? d.short : id.charAt(0).toUpperCase() + id.slice(1); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var EMP = {}; (window.VO_DATA && VO_DATA.employees || []).forEach(function (e) { EMP[e.id] = e; });

  // ---------- ຈຳລອງເຫດການຈາກລະບົບຕົ້ນທາງ (ໃຊ້ຄູ່ກັບ stream) ----------
  // ຄືນຄ່າ message ຮູບແບບດຽວກັບທີ່ stream ຈິງ (SSE/WebSocket) ຄວນສົ່ງ:  { kind:'event', event:{...}, patch:{...} }
  function step() {
    STEP_N++;
    var ts = Date.now(), LD = window.VO_LOGISTICS, kind = ['activity', 'goods', 'dept', 'activity', 'goods'][STEP_N % 5];
    if (kind === 'activity') {
      var open = S.activities.filter(function (a) { return a.status === 'working' || a.status === 'reviewing' || a.status === 'pending'; });
      if (open.length) {
        var a = rnd(open); a.status = 'completed';
        var who = a.owner && EMP[a.owner] ? EMP[a.owner].name : deptLabel(a.dept) + ' team';
        return { kind: 'event', patch: { activity: { id: a.id, status: 'completed' } },
          event: { id: 'ev-' + ts, ts: ts, type: 'activity_completed', text: who + ' completed “' + a.title + '”', source: 'Workflow', ref: { type: 'dept', id: a.dept } } };
      }
    }
    if (kind === 'goods' && LD) {
      var w = rnd(LD.warehouses), n = 20 + Math.floor(Math.random() * 90), isIn = Math.random() < 0.55;
      if (isIn) { w.inbound += 1; w.totalItems += n; } else { w.outbound += 1; w.totalItems = Math.max(0, w.totalItems - n); }
      var d = new Date(ts); w.updated = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      return { kind: 'event', patch: { warehouse: { id: w.id, inbound: w.inbound, outbound: w.outbound, totalItems: w.totalItems, updated: w.updated } },
        event: { id: 'ev-' + ts, ts: ts, type: isIn ? 'goods_received' : 'goods_dispatched', text: w.short + (isIn ? ' received ' : ' dispatched ') + n + ' cases (' + (isIn ? 'PO-' : 'SO-') + (2300 + STEP_N) + ')', source: 'WMS', ref: { type: 'warehouse', id: w.id } } };
    }
    // dept status
    var dp = rnd(S.departments), opts = ['working', 'available', 'meeting', 'reviewing', 'pending', 'delayed', 'completed'].filter(function (s) { return s !== dp.status; }), prev = dp.status;
    dp.status = rnd(opts);
    return { kind: 'event', patch: { department: { id: dp.id, status: dp.status } },
      event: { id: 'ev-' + ts, ts: ts, type: 'dept_status', text: deptLabel(dp.id) + ' status updated: ' + cap(prev) + ' → ' + cap(dp.status), source: 'Dept Status', ref: { type: 'dept', id: dp.id } } };
  }

  function snapshot() {   // deep copy ເພື່ອບໍ່ໃຫ້ UI ແກ້ state ຂອງ "ລະບົບຕົ້ນທາງ"
    var copy = JSON.parse(JSON.stringify({ departments: S.departments, activities: S.activities, assets: S.assets, metrics: S.metrics }));
    copy.events = S.events.map(function (e) { return { id: e.id, ts: now - e.ago * MIN, type: e.type, text: e.text, source: e.source, ref: e.ref }; });
    return copy;
  }

  window.VO_MOCK = { snapshot: snapshot, step: step };
})();
