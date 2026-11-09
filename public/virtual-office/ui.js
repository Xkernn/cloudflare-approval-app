/* Virtual Company 3D — Dashboard UI + ໂຫຼດ Three.js + ເຊື່ອມກັບສາກ 3D (office3d.js)
   ໃຊ້ Mock Data ຈາກ data.js ເທົ່ານັ້ນ — ບໍ່ເອີ້ນ API / Database */
(function () {
  'use strict';

  // ---------- ກວດສິດ (ເມນູນີ້ສຳລັບ admin) — ໜ້ານີ້ໃຊ້ Mock Data ເທົ່ານັ້ນ ຈຶ່ງບໍ່ມີຂໍ້ມູນລັບ ----------
  try {
    var ses = JSON.parse(localStorage.getItem('app_session_v1') || 'null');
    if (!ses || !ses.user || ses.user.role !== 'admin') { location.replace('/'); return; }
  } catch (e) { location.replace('/'); return; }

  var D = window.VO_DATA, STATUS = D.STATUS;
  var deptById = {}, empById = {};
  D.departments.forEach(function (d) { deptById[d.id] = d; });
  D.employees.forEach(function (e) { empById[e.id] = e; });

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function initials(name) { var p = name.split(' '); return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
  function avatar(e, size) {
    var a = deptById[e.dept].accent;
    return '<span class="avatar" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.38) + 'px;background:' + a + '">' + esc(initials(e.name)) + '</span>';
  }

  var view = { tab: 'office', emp: null, dept: null, wh: null, truck: null, route: null, shop: null, filter: '', status: 'all' };
  var api = null, logi = null, town = null, at = null, ADT = window.VO_ASSETS || null, LD = window.VO_LOGISTICS || null, SD = window.VO_SHOPS || null, WORLD_TABS = { warehouses: 1, logistics: 1, overview: 1, shops: 1 };
  var DASH = null;   // Phase 3: window.VODash (ໂຫຼດແບບ lazy — ຖ້າໂຫຼດບໍ່ໄດ້ ແຖບ Company Overview ຈະກັບໄປໃຊ້ແບບ Phase 2)
  // ຂຽນ #stats ສະເພາະເມື່ອເນື້ອຫາປ່ຽນ (ບໍ່ວາດຊ້ຳທຸກວິນາທີ)
  function setStats(cls, html) { var el = $('stats'); el.__kh = null; if (el.className !== cls) el.className = cls; if (el.__h !== html) { el.innerHTML = html; el.__h = html; } }

  // ---------- ສະຖິຕິ ----------
  function counts() {
    var c = { work: 0, meeting: 0, walk: 0, break: 0, leave: 0 };
    D.employees.forEach(function (e) { c[e.activity]++; });
    return c;
  }
  function deptCount(id) { return D.employees.filter(function (e) { return e.dept === id; }).length; }

  function renderStats() {
    if (view.tab === 'overview' && DASH) { $('stats').__h = null; DASH.renderKpis($('stats')); return; }
    if (WORLD_TABS[view.tab] && logi) { renderWorldStats(); return; }
    var c = counts(), total = D.employees.length;
    var active = c.work + c.meeting + c.walk;
    var pills = ['work', 'meeting', 'walk', 'break'].map(function (k) {
      return '<span class="pill" style="background:' + STATUS[k].color + '">' + c[k] + ' ' + STATUS[k].label + '</span>';
    }).join('');
    setStats('stats',
      '<div class="stat"><div class="lb"><i class="fa-solid fa-users"></i>Total Employees</div><div class="vl">' + total + '</div></div>' +
      '<div class="stat"><div class="lb"><i class="fa-solid fa-user-check"></i>Active Employees</div><div class="vl">' + active + '<small>/ ' + total + '</small></div></div>' +
      '<div class="stat"><div class="lb"><i class="fa-solid fa-sitemap"></i>Total Departments</div><div class="vl">' + D.departments.length + '</div></div>' +
      '<div class="stat"><div class="lb"><i class="fa-solid fa-bolt"></i>Current Activities</div><div class="pills">' + pills + '</div></div>');
  }

  // ---------- Sidebar content ----------
  function renderSide() {
    var el = $('sideBody'), h = '';
    if (view.tab === 'overview' && DASH) { var sc0 = el.scrollTop; el.innerHTML = DASH.renderSide(); el.setAttribute('data-ov', '1'); el.scrollTop = sc0; return; }
    el.removeAttribute('data-ov');
    var c = counts(), total = D.employees.length, max = Math.max.apply(null, D.departments.map(function (d) { return deptCount(d.id); }));
    if (WORLD_TABS[view.tab]) { el.innerHTML = renderWorldSide(); if (view.tab === 'warehouses') renderCoolerSearch(''); return; }
    if (view.tab === 'office') {
      h += '<div class="co-card"><h3>' + esc(D.company) + '</h3><p>Virtual Headquarters · Mock Data</p>' +
        '<div class="kv"><div><b>' + total + '</b><span>Employees</span></div><div><b>' + (c.work + c.meeting + c.walk) + '</b><span>Active now</span></div>' +
        '<div><b>' + D.departments.length + '</b><span>Departments</span></div><div><b>' + c.leave + '</b><span>Away</span></div></div></div>';
      h += '<div class="sec-title">Headcount by department</div>';
      D.departments.forEach(function (d) {
        var n = deptCount(d.id);
        h += '<div class="bar-row" data-dept="' + d.id + '"><span class="nm">' + esc(d.short) + '</span><span class="tr"><i style="width:' + Math.round((n / (max || 1)) * 100) + '%;background:' + d.accent + '"></i></span><span class="n">' + n + '</span></div>';
      });
    } else if (view.tab === 'departments') {
      h += '<div class="sec-title">9 areas · ຄລິກເພື່ອຊູມ</div>';
      D.departments.forEach(function (d) {
        var head = d.head ? empById[d.head] : null;
        h += '<button class="list-item' + (view.dept === d.id ? ' on' : '') + '" data-dept="' + d.id + '"><span class="ic" style="background:' + d.accent + '"><i class="fa-solid ' + d.icon + '"></i></span>' +
          '<span class="tx"><b>' + esc(d.name) + '</b><span>' + (head ? esc(head.name) : 'Shared area') + '</span></span><span class="cnt">' + deptCount(d.id) + '</span></button>';
      });
    } else if (view.tab === 'employees') {
      var opts = '<option value="all">All status</option>' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (view.status === k ? ' selected' : '') + '>' + STATUS[k].label + '</option>'; }).join('');
      h += '<div class="search"><input id="q" type="search" placeholder="Search name / role" value="' + esc(view.filter) + '"><select id="st">' + opts + '</select></div><div id="empList"></div>';
    } else {
      ['work', 'meeting', 'walk', 'break', 'leave'].forEach(function (k) {
        var list = D.employees.filter(function (e) { return e.activity === k; });
        h += '<div class="act-group"><h4><span class="dot" style="background:' + STATUS[k].color + '"></span>' + STATUS[k].label + '<small>' + list.length + '</small></h4>';
        list.forEach(function (e) {
          h += '<button class="list-item' + (view.emp === e.id ? ' on' : '') + '" data-emp="' + e.id + '">' + avatar(e, 34) +
            '<span class="tx"><b>' + esc(e.name) + '</b><span>' + esc(e.task) + '</span></span></button>';
        });
        h += '</div>';
      });
    }
    el.innerHTML = h;
    if (view.tab === 'employees') renderEmpList();
  }
  function renderEmpList() {
    var q = view.filter.trim().toLowerCase();
    var list = D.employees.filter(function (e) {
      if (view.status !== 'all' && e.activity !== view.status) return false;
      return !q || (e.name + ' ' + e.role + ' ' + deptById[e.dept].name).toLowerCase().indexOf(q) >= 0;
    });
    var h = list.map(function (e) {
      return '<button class="list-item' + (view.emp === e.id ? ' on' : '') + '" data-emp="' + e.id + '">' + avatar(e, 34) +
        '<span class="tx"><b>' + esc(e.name) + '</b><span>' + esc(e.role) + '</span></span><span class="dot" style="background:' + STATUS[e.activity].color + '"></span></button>';
    }).join('');
    $('empList').innerHTML = h || '<div class="empty">ບໍ່ພົບພະນັກງານ</div>';
  }

  // ---------- Information Panel ----------
  function mockEmail(e) { return e.name.toLowerCase().split(' ').join('.') + '@company.example'; }
  function mockPhone(e) { var n = e.id.replace(/\D/g, ''); return '+856 20 5' + ('00' + n).slice(-2) + ' ' + (1000 + parseInt(n, 10) * 37).toString().slice(0, 4); }
  function meter(label, pct, color) {
    return '<div class="meter"><div class="l"><span>' + label + '</span><span>' + pct + '%</span></div><div class="t"><i style="width:' + pct + '%;background:' + color + '"></i></div></div>';
  }
  function renderEmployeePanel(e) {
    var d = deptById[e.dept], s = STATUS[e.activity];
    var where = e.activity === 'meeting' ? 'Meeting Room' : (e.activity === 'break' ? 'Reception lounge' : (e.activity === 'walk' ? 'Office hallway' : (e.activity === 'leave' ? 'Not in office' : d.name)));
    $('info').innerHTML =
      '<div class="hd" style="background:linear-gradient(135deg,' + d.accent + ',' + d.accent + 'cc)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:22px;background:rgba(255,255,255,.28)">' + esc(initials(e.name)) + '</span>' +
      '<div><h2>' + esc(e.name) + '</h2><p>' + esc(e.role) + '</p></div></div></div>' +
      '<div class="bd"><div class="row2"><span class="chip link" data-dept="' + d.id + '" style="background:' + d.accent + '"><i class="fa-solid ' + d.icon + '"></i>' + esc(d.short) + '</span>' +
      '<span class="chip" style="background:' + s.color + '">' + s.label + ' · ' + s.lao + '</span></div>' +
      '<div class="task"><span>Current activity</span>' + esc(e.task) + '</div>' +
      '<div class="fields"><div><span>Employee ID</span><b>' + esc(e.id.toUpperCase()) + '</b></div><div><span>Department</span><b>' + esc(d.name.replace(' Department', '')) + '</b></div>' +
      '<div><span>Location now</span><b>' + esc(where) + '</b></div><div><span>Phone</span><b>' + esc(mockPhone(e)) + '</b></div>' +
      '<div style="grid-column:1/-1"><span>Email</span><b>' + esc(mockEmail(e)) + '</b></div></div>' +
      (e.activity === 'leave' ? '' : meter('Workload', e.load, e.load > 85 ? '#ef4444' : (e.load > 70 ? '#f59e0b' : '#22c55e'))) +
      '<div class="btns">' + (api && api.hasChar(e.id) ? '<button class="btn" data-focus-emp="' + e.id + '"><i class="fa-solid fa-crosshairs"></i> Focus</button>' : '') +
      '<button class="btn sec" data-close>Close</button></div></div>';
    $('info').classList.add('open');
  }
  function renderDeptPanel(d) {
    var list = D.employees.filter(function (e) { return e.dept === d.id; });
    var head = d.head ? empById[d.head] : null;
    var act = list.filter(function (e) { return STATUS[e.activity].active; }).length;
    $('info').innerHTML =
      '<div class="hd" style="background:linear-gradient(135deg,' + d.accent + ',' + d.accent + 'cc)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.28)"><i class="fa-solid ' + d.icon + '"></i></span>' +
      '<div><h2>' + esc(d.name) + '</h2><p>' + (head ? 'Head: ' + esc(head.name) : 'Shared area') + '</p></div></div></div>' +
      '<div class="bd"><div class="fields"><div><span>Employees</span><b>' + list.length + '</b></div><div><span>Active now</span><b>' + act + '</b></div></div>' +
      (DASH ? DASH.deptExtra(d.id) : '') +
      (list.length ? '<div class="sec-title" style="color:#64748b;margin:4px 0 8px">Team</div>' : '<div class="task">ຍັງບໍ່ມີພະນັກງານປະຈຳພື້ນທີ່ນີ້ (ໃຊ້ເປັນພື້ນທີ່ສ່ວນກາງ)</div>') +
      list.map(function (e) {
        return '<button class="mini" data-emp="' + e.id + '">' + avatar(e, 32) + '<span class="tx"><b>' + esc(e.name) + '</b><span>' + esc(e.role) + '</span></span><span class="dot" style="background:' + STATUS[e.activity].color + '"></span></button>';
      }).join('') + '</div>';
    $('info').classList.add('open');
  }
  function closeInfo() { $('info').classList.remove('open'); view.emp = null; view.dept = null; view.wh = null; view.truck = null; view.route = null; view.shop = null; view.at = false; if (at) at.select(false); if (api) api.clearSelection(); if (logi) logi.clearSelection(); if (town) town.clearSelection(); renderSide(); }

  // ---------- ເລືອກ ----------
  function chooseEmp(id, focus) {
    var e = empById[id]; if (!e) return;
    view.emp = id; view.dept = null;
    if (api && api.hasChar(id)) api.selectEmployee(id, focus !== false);
    else if (api) api.clearSelection();
    renderEmployeePanel(e); renderSide();
    closeSide();
  }
  function chooseDept(id, focus) {
    var d = deptById[id]; if (!d) return;
    view.dept = id; view.emp = null;
    if (api) api.selectDepartment(id, focus !== false);
    renderDeptPanel(d); renderSide();
    closeSide();
  }


  // =====================================================================
  // Phase 2 — Warehouse & Logistics (InformationPanel + Navigation + Dashboard)
  // ໃຊ້ Mock Data ຈາກ logistics-data.js · ສາກ 3D ຈາກ warehouse3d.js / truck3d.js / route3d.js
  // =====================================================================
  var VIEWS = { warehouses: [66, -4, 150], logistics: [52, -2, 168], overview: [40, 2, 205], shops: [-14, 54, 100] }; // [x, z, ໄລຍະກ້ອງ]
  function whDef(id) { return LD && LD.warehouses.filter(function (w) { return w.id === id; })[0]; }
  function truckDef(id) { return LD && LD.trucks.filter(function (t) { return t.id === id; })[0]; }
  function routeDef(id) { return LD && LD.routes.filter(function (r) { return r.id === id; })[0]; }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  // Phase 4 · Smart Warehouse prototype state (session-only; no backend writes)
  var WH_DEMO_STOCK = Object.create(null);
  function coolerRecord(id, warehouseId) {
    if (!WH_DEMO_STOCK[id]) {
      var n = Number(String(id).slice(-4)) || 1;
      WH_DEMO_STOCK[id] = { id: id, warehouseId: warehouseId, status: 'Available',
        rack: 'R-' + String((n % 4) + 1).padStart(2, '0'), row: 'ROW-' + String((n % 3) + 1),
        shelf: 'S' + String((n % 3) + 1), bin: 'B-' + String(n).padStart(3, '0'),
        model: 'Glass Door · 1 Door', serial: 'DEMO-' + id.replace(/[^A-Z0-9]/g, ''),
        updated: new Date().toLocaleString(), movement: 'Opening stock' };
    }
    return WH_DEMO_STOCK[id];
  }
  function stockAction(id, warehouseId, action) {
    var r = coolerRecord(id, warehouseId);
    if (action === 'receive') { r.status = 'Available'; r.movement = 'Received into warehouse'; }
    else if (action === 'dispatch') { r.status = 'Dispatched'; r.movement = 'Issued from warehouse'; }
    else if (action === 'inspect') { r.status = 'Inspection'; r.movement = 'Sent to inspection'; }
    r.updated = new Date().toLocaleString(); return r;
  }

  function goTab(tab, prev) {
    if (!api) return;
    var ex = api.ext;
    if (tab === 'office' || (WORLD_TABS[prev] && !WORLD_TABS[tab])) { api.resetCamera(); return; }
    if (WORLD_TABS[tab] && logi && ex) { var v = VIEWS[tab]; ex.focusOn(new ex.THREE.Vector3(v[0], 0, v[1]), v[2], ex.HOME_DIR); }
  }
  function dockedAt(whId) {   // ລົດທີ່ຈອດໂຫຼດ/ຖອກຢູ່ສາງນີ້ໃນຕອນນີ້
    return LD.trucks.filter(function (t) {
      var s = logi.truckState(t.id).status, r = routeDef(t.route);
      return (s === 'loading' && r.from === whId) || (s === 'unloading' && r.to === whId);
    });
  }
  function tsLabel(s) { var t = LD.TRUCK_STATUS[s]; return t.label + ' · ' + t.lao; }

  function renderWorldStats() {
    function card(ic, lb, v, sm) { return '<div class="stat"><div class="lb"><i class="fa-solid ' + ic + '"></i>' + lb + '</div><div class="vl">' + v + (sm ? '<small>' + sm + '</small>' : '') + '</div></div>'; }
    if (view.tab === 'shops' && town) {   // Phase 4: Shop Town
      var q = town.stats();
      if (at) { var a5 = at.stats(); setStats('stats wide', card('fa-store', 'Total Shops', q.shops) + card('fa-door-open', 'Open Now', q.open, '/ ' + q.shops) + card('fa-box-open', 'Assets Delivered', a5.delivered, '/ ' + a5.total) + card('fa-location-dot', 'Delivery Stop', a5.stopNo, '/ ' + a5.stops) + card('fa-truck-ramp-box', 'Trip', a5.trip)); return; }
      setStats('stats wide', card('fa-store', 'Total Shops', q.shops) + card('fa-door-open', 'Open Now', q.open, '/ ' + q.shops) +
        card('fa-car-side', 'Cars in Town', q.carsInTown, '+' + q.carsOnRoad + ' on road') + card('fa-flag-checkered', 'Cars Arrived', q.arrived, 'session') + card('fa-people-group', 'Visitors Today', num(q.visitors)));
      return;
    }
    var s = logi.stats();
    setStats('stats wide', card('fa-warehouse', 'Total Warehouses', s.warehouses) + card('fa-circle-check', 'Active Warehouses', s.activeWarehouses, '/ ' + s.warehouses) +
      card('fa-truck-fast', 'Active Deliveries', s.activeDeliveries) + card('fa-road', 'Trucks on Route', s.onRoute, '/ ' + s.trucks) +
      card('fa-right-left', 'Inbound / Outbound', s.inbound + ' / ' + s.outbound, 'today'));
  }
  function renderWorldSide() {
    if (!logi) return '<div class="empty">ກຳລັງໂຫຼດຂໍ້ມູນຄັງສິນຄ້າ...</div>';
    var h = '', s = logi.stats(), c = counts();
    if (view.tab === 'warehouses') {
      h += '<div class="co-card warehouse-search-card"><h3>Cooler Finder</h3><p>Demo inventory · search a sample Cooler ID</p><div class="search wh-search"><input id="coolerSearch" type="search" placeholder="e.g. BL-WH1-0001" autocomplete="off"></div><div id="coolerSearchResults"></div></div>';
      h += '<div class="sec-title">' + LD.warehouses.length + ' Warehouses · ຄລິກເພື່ອຊູມ</div>';
      LD.warehouses.forEach(function (w) {
        var st = LD.WH_STATUS[logi.warehouses[w.id].status()];
        h += '<button class="list-item' + (view.wh === w.id ? ' on' : '') + '" data-wh="' + w.id + '"><span class="ic" style="background:' + w.accent + '"><i class="fa-solid fa-warehouse"></i></span>' +
          '<span class="tx"><b>' + esc(w.name) + '</b><span>' + esc(w.location) + ' · ' + num(w.totalItems) + ' items</span></span><span class="dot" style="background:' + st.color + '"></span></button>';
      });
    } else if (view.tab === 'logistics') {
      h += '<div class="sec-title">Routes</div>';
      LD.routes.forEach(function (r) {
        h += '<button class="list-item' + (view.route === r.id ? ' on' : '') + '" data-route="' + r.id + '"><span class="ic" style="background:' + r.color + '"><i class="fa-solid fa-route"></i></span>' +
          '<span class="tx"><b>' + esc(r.name) + '</b><span>' + r.km + ' km</span></span></button>';
      });
      h += '<div class="sec-title">Trucks · live</div>';
      LD.trucks.forEach(function (t) {
        var st = LD.TRUCK_STATUS[logi.truckState(t.id).status];
        h += '<button class="list-item' + (view.truck === t.id ? ' on' : '') + '" data-truck="' + t.id + '"><span class="ic" style="background:' + routeDef(t.route).color + '"><i class="fa-solid fa-truck"></i></span>' +
          '<span class="tx"><b>' + esc(t.id) + '</b><span>' + esc(routeDef(t.route).name) + '</span></span><span class="cnt" data-live-truck="' + t.id + '" style="color:' + st.color + '">' + st.label + '</span></button>';
      });
    } else if (view.tab === 'shops') {   // Phase 4: Shop Town
      if (!town) return '<div class="empty">ກຳລັງໂຫຼດເມືອງຮ້ານຄ້າ...</div>';
      var q = town.stats();
      h += '<div class="co-card"><h3>' + esc(SD.town.name) + ' · ' + esc(SD.town.lao) + '</h3><p>ລົດວິ່ງເຂົ້າເມືອງ → ຂັບເຂົ້າຕຶກ → ຫາຍຕົວ</p><div class="kv">' +
        '<div><b data-live-town="inTown">' + q.carsInTown + '</b><span>Cars in town</span></div><div><b data-live-town="arrived">' + q.arrived + '</b><span>Arrived</span></div>' +
        '<div><b>' + q.open + '</b><span>Open shops</span></div><div><b data-live-town="visitors">' + num(q.visitors) + '</b><span>Visitors</span></div></div></div>';
      if (at) h += '<div id="atCard">' + atCardHtml() + '</div>';
      [['retail', 'Shops · ຄລິກເພື່ອຊູມ'], ['dest', 'Destinations · ຈຸດທີ່ລົດເຂົ້າ']].forEach(function (g) {
        h += '<div class="sec-title">' + g[1] + '</div>';
        SD.shops.filter(function (x) { return x.kind === g[0]; }).forEach(function (x) {
          var st = SD.SHOP_STATUS[x.status];
          h += '<button class="list-item' + (view.shop === x.id ? ' on' : '') + '" data-shop="' + x.id + '"><span class="ic" style="background:' + (x.kind === 'dest' ? '#0ea5e9' : '#ea580c') + '"><i class="fa-solid ' + x.icon + '"></i></span>' +
            '<span class="tx"><b>' + esc(x.name) + '</b><span>' + esc(x.lao) + ' · ' + esc(x.hours) + '</span></span><span class="dot" style="background:' + st.color + '"></span></button>';
        });
      });
    } else {  // overview
      var max = Math.max.apply(null, LD.warehouses.map(function (w) { return w.inbound + w.outbound; }));
      h += '<div class="co-card"><h3>' + esc(D.company) + '</h3><p>Office + Warehouses + Logistics · Mock Data</p><div class="kv">' +
        '<div><b>' + s.warehouses + '</b><span>Warehouses</span></div><div><b>' + s.activeWarehouses + '</b><span>Active warehouses</span></div>' +
        '<div><b>' + s.activeDeliveries + '</b><span>Active deliveries</span></div><div><b>' + s.onRoute + '</b><span>Trucks on route</span></div>' +
        '<div><b>' + (c.work + c.meeting + c.walk) + '</b><span>Staff active</span></div><div><b>' + num(s.totalItems) + '</b><span>Total items</span></div></div></div>';
      h += '<div class="sec-title">Inbound / Outbound today</div>';
      LD.warehouses.forEach(function (w) {
        h += '<div class="bar-row" data-wh="' + w.id + '"><span class="nm">' + esc(w.short) + '</span><span class="tr"><i style="width:' + Math.round((w.inbound + w.outbound) / max * 100) + '%;background:' + w.accent + '"></i></span><span class="n" style="width:auto">' + w.inbound + '/' + w.outbound + '</span></div>';
      });
      h += '<div class="sec-title">Total: ' + s.inbound + ' in · ' + s.outbound + ' out</div>';
    }
    return h;
  }
  function openInfo(html) { $('info').innerHTML = html; $('info').classList.add('open'); }
  function renderWarehousePanel(d) {
    var live = logi.warehouses[d.id], st = LD.WH_STATUS[live.status()], dk = dockedAt(d.id);
    openInfo('<div class="hd" style="background:linear-gradient(135deg,' + d.accent + ',' + d.accent + 'cc)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.28)"><i class="fa-solid fa-warehouse"></i></span><div><h2>' + esc(d.name) + '</h2><p>' + esc(d.location) + '</p></div></div></div>' +
      '<div class="bd"><div class="row2"><span class="chip" style="background:' + st.color + '">' + st.label + ' · ' + st.lao + '</span></div>' +
      '<div class="fields" style="margin-top:12px"><div><span>Warehouse Name</span><b>' + esc(d.name) + '</b></div><div><span>Location</span><b>' + esc(d.location) + '</b></div>' +
      '<div><span>Total Items</span><b>' + num(d.totalItems) + '</b></div><div><span>Current Status</span><b>' + st.label + '</b></div>' +
      '<div><span>Inbound Today</span><b>' + d.inbound + '</b></div><div><span>Outbound Today</span><b>' + d.outbound + '</b></div>' +
      '<div><span>Docks in use</span><b data-live="docks">' + dk.length + ' / 4</b></div><div><span>Last Updated</span><b>' + esc(d.updated) + '</b></div></div>' +
      '<div class="sec-title" style="color:#64748b;margin:4px 0 8px">Trucks of this hub</div>' +
      LD.trucks.filter(function (t) { var r = routeDef(t.route); return r.from === d.id || r.to === d.id; }).map(function (t) {
        return '<button class="mini" data-truck="' + t.id + '"><span class="avatar" style="width:32px;height:32px;background:' + routeDef(t.route).color + '"><i class="fa-solid fa-truck" style="font-size:13px"></i></span><span class="tx"><b>' + esc(t.id) + '</b><span>' + esc(routeDef(t.route).name) + '</span></span></button>';
      }).join('') +
      '<div class="btns"><button class="btn" data-focus-wh="' + d.id + '"><i class="fa-solid fa-crosshairs"></i> Focus</button><button class="btn sec" data-close>Close</button></div></div>');
  }
  function renderTruckPanel(id) {
    var d = truckDef(id), r = routeDef(d.route), s = logi.truckState(id), st = LD.TRUCK_STATUS[s.status], col = r.color;
    openInfo('<div class="hd" style="background:linear-gradient(135deg,' + col + ',' + col + 'cc)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.28)"><i class="fa-solid fa-truck"></i></span><div><h2>' + esc(d.id) + '</h2><p>' + esc(r.name) + '</p></div></div></div>' +
      '<div class="bd"><div class="row2"><span class="chip" data-live="st" style="background:' + st.color + '">' + tsLabel(s.status) + '</span></div>' +
      '<div class="fields" style="margin-top:12px"><div><span>Plate</span><b>' + esc(d.plate) + '</b></div><div><span>Type</span><b>' + esc(d.type) + '</b></div>' +
      '<div><span>Driver</span><b>' + esc(d.driver) + '</b></div><div><span>Cargo</span><b>' + esc(d.cargo) + '</b></div>' +
      '<div><span>Route</span><b>' + r.km + ' km</b></div><div><span>Progress</span><b data-live="pct">' + s.pct + '%</b></div></div>' +
      meter('Load', d.load, d.load > 85 ? '#f59e0b' : '#22c55e') +
      '<div class="btns"><button class="btn" data-focus-truck="' + d.id + '"><i class="fa-solid fa-crosshairs"></i> Follow</button><button class="btn sec" data-close>Close</button></div></div>');
  }
  // =====================================================================
  // Phase 5 — Asset Tracking: ລົດສົ່ງ Asset ຄັນດຽວ (asset-data.js → asset-delivery.js)
  // =====================================================================
  var AT_STATE = { depot: ['At Depot · ຈອດສາງ', '#2563eb'], onroute: ['On Route · ກຳລັງສົ່ງ', '#16a34a'], unloading: ['Unloading · ກຳລັງຖອກ', '#f59e0b'], returning: ['Returning · ກັບສາງ', '#7c3aed'] };
  function shopName(id) { var x = SD && SD.shops.filter(function (z) { return z.id === id; })[0]; return x ? x.name : id; }
  function stopStatus(st) { return ADT.STATUS[st === 'done' ? 'delivered' : st]; }
  function itemsTx(items) { return items.map(function (i) { return esc(i.asset) + ' ×' + (i.qty || 1); }).join(', '); }
  function atCardHtml() {
    var q = at.stats(), stt = AT_STATE[q.state], h = '<div class="co-card"><h3>Asset Delivery · ລົດສົ່ງ Asset</h3><p>' + esc(ADT.truck.id) + ' · ' + stt[0] + '</p><div class="kv">' +
      '<div><b>' + q.delivered + ' / ' + q.total + '</b><span>Delivered</span></div><div><b>' + q.pending + '</b><span>Pending</span></div>' +
      '<div><b>' + q.stopNo + ' / ' + q.stops + '</b><span>Stop</span></div><div><b>' + q.trip + '</b><span>Trip</span></div></div>' +
      '<div class="btns" style="margin-top:10px"><button class="btn" data-focus-at><i class="fa-solid fa-crosshairs"></i> Follow ' + esc(ADT.truck.id) + '</button></div></div>';
    h += '<div class="sec-title">Delivery list · ລຳດັບແວ່ (Asset Tracking)</div>';
    at.stops().forEach(function (x, i) {
      var st = stopStatus(x.state);
      h += '<button class="list-item" data-shop="' + x.shop + '"><span class="ic" style="background:' + st.color + '">' + (i + 1) + '</span><span class="tx"><b>' + esc(shopName(x.shop)) + '</b><span>' + itemsTx(x.items) + ' · ' + st.lao + '</span></span><span class="dot" style="background:' + st.color + '"></span></button>';
    });
    return h;
  }
  function renderAssetPanel() {
    var q = at.stats(), stt = AT_STATE[q.state], T = ADT.truck;
    var rows = at.stops().map(function (x, i) {
      var st = stopStatus(x.state);
      return '<div style="grid-column:1/-1"><span>' + (i + 1) + ' · ' + esc(shopName(x.shop)) + ' — ' + st.label + '</span><b>' + x.items.map(function (z) { return esc(z.asset) + ' ×' + (z.qty || 1) + ' (' + esc(z.serial) + ')'; }).join('<br>') + '</b></div>';
    }).join('');
    openInfo('<div class="hd" style="background:linear-gradient(135deg,#2563eb,#2563ebcc)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.28)"><i class="fa-solid fa-truck-ramp-box"></i></span><div><h2>' + esc(T.id) + '</h2><p>' + esc(T.plate) + ' · ' + esc(T.driver) + '</p></div></div></div>' +
      '<div class="bd"><div class="row2"><span class="chip" style="background:' + stt[1] + '">' + stt[0] + '</span></div>' +
      '<div class="fields" style="margin-top:12px"><div><span>Delivered</span><b>' + q.delivered + ' / ' + q.total + '</b></div><div><span>Pending</span><b>' + q.pending + '</b></div>' +
      '<div><span>Current stop</span><b>' + (q.current ? esc(shopName(q.current)) : '—') + '</b></div><div><span>Trip</span><b>' + q.trip + '</b></div>' + rows + '</div>' +
      '<div class="btns"><button class="btn" data-focus-at><i class="fa-solid fa-crosshairs"></i> Follow</button><button class="btn sec" data-close>Close</button></div></div>');
  }
  var atSig = '';
  function atTick() {
    if (!at) return;
    if (view.tab === 'shops') { var el = $('atCard'), html = atCardHtml(); if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; } }
    if (view.at) { var sg = JSON.stringify(at.stats()); if (sg !== atSig) { atSig = sg; renderAssetPanel(); } }
  }
  function renderShopPanel(id) {   // Phase 4: Shop Town
    var tw = id === 'town', d = tw ? null : SD.shops.filter(function (x) { return x.id === id; })[0];
    if (!tw && !d) return;
    var st = tw ? SD.SHOP_STATUS.open : SD.SHOP_STATUS[d.status], col = tw ? '#2563eb' : (d.kind === 'dest' ? '#0ea5e9' : '#ea580c'), q = town.stats();
    var title = tw ? SD.town.name : d.name, sub = tw ? SD.town.lao + ' · ' + SD.town.location : d.lao, ic = tw ? 'fa-city' : d.icon;
    var fields = tw ?
      '<div><span>Shops</span><b>' + q.shops + '</b></div><div><span>Open now</span><b>' + q.open + '</b></div><div><span>Cars in town</span><b data-live="shopcars">' + q.carsInTown + '</b></div>' +
      '<div><span>Cars arrived</span><b data-live="shoparr">' + q.arrived + '</b></div><div style="grid-column:1/-1"><span>Visitors today</span><b data-live="shopvis">' + num(q.visitors) + '</b></div>' :
      '<div><span>Type</span><b>' + (d.kind === 'dest' ? 'Destination · ຈຸດຈອດ/ຕະຫຼາດ' : 'Retail · ຮ້ານຄ້າ') + '</b></div><div><span>Opening hours</span><b>' + esc(d.hours) + '</b></div>' +
      '<div><span>Visitors today</span><b data-live="shopvis">' + num(d.visitors + town.visitsOf(d.id)) + '</b></div><div><span>Revenue (₭)</span><b>' + esc(d.revenue) + '</b></div>' +
      (d.kind === 'dest' ? '<div style="grid-column:1/-1"><span>Cars received (this session)</span><b data-live="shopcarsin">' + town.visitsOf(d.id) + '</b></div>' : '');
    openInfo('<div class="hd" style="background:linear-gradient(135deg,' + col + ',' + col + 'cc)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.28)"><i class="fa-solid ' + ic + '"></i></span><div><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p></div></div></div>' +
      '<div class="bd"><div class="row2"><span class="chip" style="background:' + st.color + '">' + st.label + ' · ' + st.lao + '</span></div>' +
      '<div class="fields" style="margin-top:12px">' + fields + '</div>' +
      '<div class="btns"><button class="btn" data-focus-shop="' + id + '"><i class="fa-solid fa-crosshairs"></i> Focus</button><button class="btn sec" data-close>Close</button></div></div>');
  }
  function renderCoolerSearch(q) {
    var host = $('coolerSearchResults'); if (!host || !LD) return;
    q = String(q || '').trim().toUpperCase(); var rows = [];
    LD.warehouses.forEach(function (w) { for (var i = 1; i <= 3; i++) {
      var id = 'BL-' + w.id.toUpperCase() + '-' + String(i).padStart(4, '0');
      if (!q || id.indexOf(q) >= 0 || w.name.toUpperCase().indexOf(q) >= 0) rows.push({ id: id, wh: w.id, name: w.name });
    }});
    host.innerHTML = rows.length ? rows.slice(0, 5).map(function (r) {
      var rec = coolerRecord(r.id, r.wh);
      return '<button class="mini cooler-result" data-cooler-id="' + r.id + '" data-cooler-wh="' + r.wh + '"><span class="avatar" style="width:30px;height:30px;background:#9b252d"><i class="fa-solid fa-temperature-low"></i></span><span class="tx"><b>' + r.id + '</b><span>' + esc(r.name) + ' · ' + esc(rec.rack + ' / ' + rec.row + ' / ' + rec.shelf + ' / ' + rec.bin) + '</span></span><i class="fa-solid fa-crosshairs"></i></button>';
    }).join('') : '<div class="empty">No matching demo cooler ID</div>';
  }
  function renderCoolerPanel(meta) {
    var w = whDef(meta.warehouseId); if (!w) return;
    var rec = coolerRecord(meta.id, meta.warehouseId);
    var statusColor = rec.status === 'Available' ? '#16845b' : (rec.status === 'Inspection' ? '#b58b42' : '#64748b');
    openInfo('<div class="hd" style="background:linear-gradient(135deg,#9b252d,#561a22)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.22)"><i class="fa-solid fa-temperature-low"></i></span><div><h2>' + esc(meta.id) + '</h2><p>Beerlao Cooler · ' + esc(w.short) + '</p></div></div></div>' +
      '<div class="bd"><div class="row2"><span class="chip" style="background:#b58b42">DEMO INVENTORY</span><span class="chip" style="background:' + statusColor + '">' + esc(rec.status) + '</span></div>' +
      '<div class="sec-title">ASSET & STORAGE LOCATION</div><div class="fields"><div><span>Cooler ID</span><b>' + esc(rec.id) + '</b></div><div><span>Serial Number</span><b>' + esc(rec.serial) + '</b></div><div><span>Warehouse</span><b>' + esc(w.short) + '</b></div><div><span>Model</span><b>' + esc(rec.model) + '</b></div><div><span>Rack</span><b>' + esc(rec.rack) + '</b></div><div><span>Row / Shelf</span><b>' + esc(rec.row + ' / ' + rec.shelf) + '</b></div><div><span>Bin</span><b>' + esc(rec.bin) + '</b></div><div><span>Last movement</span><b>' + esc(rec.movement) + '</b></div></div>' +
      '<div class="task wh-demo-note"><span>Smart Warehouse · Prototype mode</span>Actions below update this browser session only. They do not write to the company database or create official stock documents.</div>' +
      '<div class="sec-title">QUICK STOCK ACTIONS</div><div class="btns wh-stock-actions"><button class="btn" data-wh-stock-action="receive" data-cooler-id="' + esc(meta.id) + '" data-cooler-wh="' + esc(meta.warehouseId) + '"><i class="fa-solid fa-arrow-down"></i> Receive</button><button class="btn" data-wh-stock-action="dispatch" data-cooler-id="' + esc(meta.id) + '" data-cooler-wh="' + esc(meta.warehouseId) + '"><i class="fa-solid fa-arrow-up"></i> Dispatch</button><button class="btn sec" data-wh-stock-action="inspect" data-cooler-id="' + esc(meta.id) + '" data-cooler-wh="' + esc(meta.warehouseId) + '"><i class="fa-solid fa-clipboard-check"></i> Inspect</button></div>' +
      '<div class="fields wh-updated"><div><span>Updated</span><b>' + esc(rec.updated) + '</b></div><div><span>Data source</span><b>Session demo data</b></div></div>' +
      '<div class="btns"><button class="btn sec" data-focus-cooler="' + esc(meta.id) + '" data-cooler-wh="' + esc(meta.warehouseId) + '"><i class="fa-solid fa-crosshairs"></i> Focus</button><button class="btn sec" data-close>Close</button></div></div>');
  }
  function renderWarehouseZonePanel(meta) {
    var titles = { storage: 'Storage racks · Zone A-C', inventory: 'Cooler inventory area', receiving: 'Receiving & loading area' };
    var descriptions = { storage: 'Rack bays for stored assets and cooler units.', inventory: 'Display and staging area for cooler inventory.', receiving: 'Inbound inspection, loading and dispatch circulation.' };
    openInfo('<div class="hd" style="background:linear-gradient(135deg,#243746,#101d29)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.2)"><i class="fa-solid fa-boxes-stacked"></i></span><div><h2>' + esc(titles[meta.zone] || meta.title) + '</h2><p>Warehouse zone · ' + esc(meta.warehouseId) + '</p></div></div></div>' +
      '<div class="bd"><div class="task"><span>3D zone selection</span>' + esc(descriptions[meta.zone] || 'Warehouse operational area.') + '</div><div class="fields"><div><span>Zone</span><b>' + esc(meta.zone.toUpperCase()) + '</b></div><div><span>Warehouse</span><b>' + esc(meta.warehouseId) + '</b></div><div><span>Inventory data</span><b>Not connected</b></div><div><span>Mode</span><b>Interactive prototype</b></div></div><div class="task">Next integration: map real rack / bin codes to this 3D zone and load live stock quantities from the warehouse API.</div></div>');
  }
  function chooseWorld(type, id, focus, meta) {
    if (!logi) return;
    if (type === 'cooler' && meta) {
      if (api) api.clearSelection(); logi.clearSelection(); view.emp = null; view.dept = null; view.wh = meta.warehouseId; view.truck = null; view.route = null; view.shop = null;
      var cw = whDef(meta.warehouseId); if (focus !== false && api && cw) api.ext.focusOn(new api.ext.THREE.Vector3(cw.x + meta.x, 1.1, cw.z + meta.z), 17, api.ext.HOME_DIR);
      renderCoolerPanel(meta); renderSide(); closeSide(); return;
    }
    if (type === 'warehouseZone' && meta) {
      if (api) api.clearSelection(); logi.clearSelection(); view.emp = null; view.dept = null; view.wh = meta.warehouseId; view.truck = null; view.route = null; view.shop = null;
      var zw = whDef(meta.warehouseId); if (focus !== false && api && zw) api.ext.focusOn(new api.ext.THREE.Vector3(zw.x + meta.x, 0, zw.z + meta.z), 27, api.ext.HOME_DIR);
      renderWarehouseZonePanel(meta); renderSide(); closeSide(); return;
    }
    if (at && type === 'truck' && id === ADT.truck.id) {   // Phase 5: ລົດສົ່ງ Asset
      if (api) api.clearSelection(); view.emp = null; view.dept = null; view.wh = null; view.truck = null; view.route = null; view.shop = null;
      logi.clearSelection(); if (town) town.clearSelection(); view.at = true; at.select(true); atSig = JSON.stringify(at.stats());
      if (focus !== false) { var e5 = api.ext; e5.focusOn(at.truckPos(), 34, e5.HOME_DIR); }
      renderAssetPanel(); renderSide(); closeSide(); return;
    }
    if (api) api.clearSelection();
    view.emp = null; view.dept = null; view.wh = null; view.truck = null; view.route = null; view.shop = null; view.at = false; if (at) at.select(false);
    logi.select(type, id);
    if (town) town.select(type === 'shop' ? id : null);
    var ex = api.ext, V = ex.THREE.Vector3;
    if (type === 'shop') {
      if (!town) return;
      view.shop = id; if (focus !== false) { if (id === 'town') focusView('shops'); else ex.focusOn(town.focusPos(id), 44, ex.HOME_DIR); }
      renderShopPanel(id); renderSide(); closeSide(); return;
    }
    if (type === 'warehouse') { var w = whDef(id); view.wh = id; if (focus !== false) ex.focusOn(new V(w.x, 0, w.z - 2), 46, ex.HOME_DIR); renderWarehousePanel(w); }
    else if (type === 'truck') { view.truck = id; if (focus !== false) ex.focusOn(logi.truckPos(id), 34, ex.HOME_DIR); renderTruckPanel(id); }
    else if (type === 'route') {
      view.route = id;
      if (view.tab === 'overview' && DASH) { openInfo(DASH.routePanel(id)); if (focus !== false) focusView('logistics'); }   // Phase 3: ຄລິກເສັ້ນທາງໃນ Overview → ກ້ອງໄປ Logistics + ສະແດງຂໍ້ມູນ
      else $('info').classList.remove('open');
    }
    renderSide(); closeSide();
  }
  // ---------- Phase 3 hooks (ໃຫ້ dashboard.js ໃຊ້ຄວບຄຸມ 3D + panel) ----------
  function focusView(name) {
    var v = VIEWS[name]; if (!api || !api.ext || !v) return;
    var ex = api.ext; ex.focusOn(new ex.THREE.Vector3(v[0], 0, v[1]), v[2], ex.HOME_DIR);
  }
  function resetSelection() { view.emp = null; view.dept = null; view.wh = null; view.truck = null; view.route = null; view.shop = null; view.at = false; if (at) at.select(false); if (api) api.clearSelection(); if (logi) logi.clearSelection(); if (town) town.clearSelection(); }
  function dashHooks() {
    return { D: D, stage: $('stage'), view: function () { return view; }, getLogi: function () { return logi; }, avatar: avatar,
      chooseEmp: chooseEmp, chooseDept: chooseDept, chooseWorld: chooseWorld, focusView: focusView, resetSelection: resetSelection,
      openInfo: openInfo, closeInfo: closeInfo, renderSide: renderSide, refreshUI: function () { renderStats(); renderSide(); }, loadScript: loadScript };
  }
  function loadDash() {   // ໂຫຼດຕອນວ່າງ (idle) ຫຼັງສາກ 3D ພ້ອມ — ບໍ່ຂັດຈັງຫວະການເປີດໜ້າ
    function go() {
      loadScript(['./dashboard-data.js?v=1'], function () { return !!window.VO_MOCK; })
        .then(function () { return loadScript(['./data-adapter.js?v=1'], function () { return !!window.VO_STORE; }); })
        .then(function () { return loadScript(['./dashboard.js?v=1'], function () { return !!window.VODash; }); })
        .then(function () { DASH = window.VODash; DASH.init(dashHooks()); })
        .catch(function (e) { console.warn('Phase 3 dashboard not loaded — using Phase 2 overview', e); DASH = null; });
    }
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
  }

  // ອັບເດດຄ່າສົດ (ສະຖານະລົດ / ຊ່ອງຈອດ) ທຸກ 1 ວິນາທີ ໂດຍບໍ່ວາດ panel ໃໝ່
  setInterval(function () {
    if (!logi) return;
    if (DASH) DASH.sceneTick();
    if (!(view.tab === 'overview' && DASH) && WORLD_TABS[view.tab]) renderStats();
    document.querySelectorAll('[data-live-truck]').forEach(function (el) { var st = LD.TRUCK_STATUS[logi.truckState(el.getAttribute('data-live-truck')).status]; el.textContent = st.label; el.style.color = st.color; });
    if (view.truck) {
      var s = logi.truckState(view.truck), a = document.querySelector('[data-live="st"]'), b = document.querySelector('[data-live="pct"]');
      if (a) { a.textContent = tsLabel(s.status); a.style.background = LD.TRUCK_STATUS[s.status].color; } if (b) b.textContent = s.pct + '%';
    } else if (view.wh) { var c = document.querySelector('[data-live="docks"]'); if (c) c.textContent = dockedAt(view.wh).length + ' / 4'; }
    atTick();
    if (town && view.tab === 'shops') {   // Phase 4: ຄ່າສົດຂອງເມືອງ (ລົດ/ຜູ້ເຂົ້າ) ໂດຍບໍ່ວາດ panel ໃໝ່
      var q = town.stats(), set = function (sel, v) { var e = document.querySelector(sel); if (e) e.textContent = v; };
      set('[data-live-town="inTown"]', q.carsInTown); set('[data-live-town="arrived"]', q.arrived); set('[data-live-town="visitors"]', num(q.visitors));
      if (view.shop === 'town') { set('[data-live="shopcars"]', q.carsInTown); set('[data-live="shoparr"]', q.arrived); set('[data-live="shopvis"]', num(q.visitors)); }
      else if (view.shop && SD.shops.filter(function (x) { return x.id === view.shop; })[0]) { var sd = SD.shops.filter(function (x) { return x.id === view.shop; })[0]; set('[data-live="shopvis"]', num(sd.visitors + town.visitsOf(sd.id))); set('[data-live="shopcarsin"]', town.visitsOf(sd.id)); }
    }
  }, 1000);

  // ---------- events ----------
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var el = t.closest && t.closest('[data-emp],[data-dept],[data-close],[data-focus-emp],[data-tab],[data-wh],[data-truck],[data-route],[data-focus-wh],[data-focus-truck],[data-shop],[data-focus-shop],[data-focus-at],[data-cooler-id],[data-focus-cooler],[data-wh-stock-action]');
    if (!el) return;
    if (el.hasAttribute('data-close')) { closeInfo(); return; }
    if (el.hasAttribute('data-wh-stock-action')) {
      var stockId = el.getAttribute('data-cooler-id'), stockWh = el.getAttribute('data-cooler-wh');
      var stockType = el.getAttribute('data-wh-stock-action');
      stockAction(stockId, stockWh, stockType);
      var stockNum = Number(String(stockId).slice(-4)) || 1;
      renderCoolerPanel({ id: stockId, warehouseId: stockWh, x: 16.5 + (stockNum - 1) * 1.5, z: 1.2 });
      return;
    }
    if (el.hasAttribute('data-focus-emp')) { if (api) api.selectEmployee(el.getAttribute('data-focus-emp'), true); return; }
    if (el.hasAttribute('data-focus-wh')) { chooseWorld('warehouse', el.getAttribute('data-focus-wh'), true); return; }
    if (el.hasAttribute('data-focus-truck')) { chooseWorld('truck', el.getAttribute('data-focus-truck'), true); return; }
    if (el.hasAttribute('data-focus-at')) { chooseWorld('truck', ADT.truck.id, true); return; }
    if (el.hasAttribute('data-focus-shop')) { chooseWorld('shop', el.getAttribute('data-focus-shop'), true); return; }
    if (el.hasAttribute('data-cooler-id') || el.hasAttribute('data-focus-cooler')) {
      var cid = el.getAttribute('data-cooler-id') || el.getAttribute('data-focus-cooler'), cwh = el.getAttribute('data-cooler-wh');
      var cnum = Number(cid.slice(-4)) || 1, cdef = whDef(cwh), cmeta = { id: cid, warehouseId: cwh, x: 16.5 + (cnum - 1) * 1.5, z: 1.2 };
      if (cdef) chooseWorld('cooler', cid, true, cmeta); return;
    }
    if (el.hasAttribute('data-shop')) { chooseWorld('shop', el.getAttribute('data-shop'), true); return; }
    if (el.hasAttribute('data-tab')) {
      var prevTab = view.tab; view.tab = el.getAttribute('data-tab');
      if (WORLD_TABS[view.tab] || WORLD_TABS[prevTab]) closeInfo();
      document.querySelectorAll('#nav .nav-item').forEach(function (b) { b.classList.toggle('active', b === el); });
      goTab(view.tab, prevTab);
      if (DASH) DASH.onTab(view.tab); else $('stage').classList.remove('ov');
      renderStats(); renderSide(); return;
    }
    if (el.hasAttribute('data-wh')) { chooseWorld('warehouse', el.getAttribute('data-wh'), true); return; }
    if (el.hasAttribute('data-truck')) { chooseWorld('truck', el.getAttribute('data-truck'), true); return; }
    if (el.hasAttribute('data-route')) { chooseWorld('route', el.getAttribute('data-route'), true); return; }
    if (el.hasAttribute('data-emp')) { chooseEmp(el.getAttribute('data-emp')); return; }
    if (el.hasAttribute('data-dept')) { chooseDept(el.getAttribute('data-dept')); return; }
  });
  document.addEventListener('input', function (ev) { if (ev.target.id === 'q') { view.filter = ev.target.value; renderEmpList(); } if (ev.target.id === 'coolerSearch') renderCoolerSearch(ev.target.value); });
  document.addEventListener('change', function (ev) { if (ev.target.id === 'st') { view.status = ev.target.value; renderEmpList(); } });

  function openSide() { $('sidebar').classList.add('open'); $('sideBackdrop').classList.add('open'); }
  function closeSide() { $('sidebar').classList.remove('open'); $('sideBackdrop').classList.remove('open'); }
  $('btnOpenSide').addEventListener('click', openSide);
  $('btnCloseSide').addEventListener('click', closeSide);
  $('sideBackdrop').addEventListener('click', closeSide);

  // ປຸ່ມກ້ອງ: ກົດຄ້າງ = ເຄື່ອນຕໍ່ເນື່ອງ
  document.querySelectorAll('#camctl [data-act]').forEach(function (b) {
    var act = b.getAttribute('data-act');
    function on(ev) { ev.preventDefault(); b.classList.add('on'); if (api) api.setAction(act, true); hideHint(); }
    function off() { b.classList.remove('on'); if (api) api.setAction(act, false); }
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(function (n) { b.addEventListener(n, off); });
  });
  $('btnReset').addEventListener('click', function () { if (api) api.resetCamera(); });

  var KEYS = { ArrowLeft: 'panL', ArrowRight: 'panR', q: 'rotL', e: 'rotR', '+': 'zIn', '=': 'zIn', '-': 'zOut', '_': 'zOut' };
  window.addEventListener('keydown', function (ev) {
    if (/INPUT|SELECT|TEXTAREA/.test((ev.target && ev.target.tagName) || '')) return;
    var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (KEYS[k] && api) { api.setAction(KEYS[k], true); ev.preventDefault(); hideHint(); }
    else if (k === 'r' && api) api.resetCamera();
    else if (k === 'Escape') closeInfo();
  });
  window.addEventListener('keyup', function (ev) {
    var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (KEYS[k] && api) api.setAction(KEYS[k], false);
  });
  var hintTimer = setTimeout(hideHint, 14000);
  function hideHint() { clearTimeout(hintTimer); $('hint').classList.add('hide'); }

  // tooltip ເວລາ hover ຕົວລະຄອນ
  function onHover(id, x, y) {
    var tip = $('tip');
    if (!id) { tip.classList.remove('show'); return; }
    var e = empById[id];
    tip.innerHTML = esc(e.name) + '<small>' + esc(e.role) + ' · ' + esc(STATUS[e.activity].label) + '</small>';
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    tip.classList.add('show');
  }

  // ---------- ໂຫຼດ library ----------
  function loadScript(urls, check) {
    return new Promise(function (resolve, reject) {
      var i = 0;
      (function next() {
        if (check && check()) return resolve();
        if (i >= urls.length) return reject(new Error('Cannot load ' + urls[urls.length - 1]));
        var s = document.createElement('script');
        s.src = urls[i++]; s.async = false;
        s.onload = function () { (check && !check()) ? next() : resolve(); };
        s.onerror = function () { s.remove(); next(); };
        document.head.appendChild(s);
      })();
    });
  }
  function webglOk() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; }
  }
  function fail(msg) {
    var l = $('loading'); l.classList.remove('hide'); l.classList.add('err');
    l.innerHTML = '<div class="spinner"></div><p><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(msg) + '</p><button class="retry" onclick="location.reload()">ລອງໃໝ່</button>';
  }

  function boot() {
    renderStats(); renderSide();
    if (!webglOk()) { fail('ອຸປະກອນ/ບຣາວເຊີນີ້ບໍ່ຮອງຮັບ WebGL ຈຶ່ງສະແດງສາກ 3D ບໍ່ໄດ້'); return; }
    var V = '0.128.0';
    loadScript([
      'https://cdn.jsdelivr.net/npm/three@' + V + '/build/three.min.js',
      'https://unpkg.com/three@' + V + '/build/three.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    ], function () { return !!window.THREE; })
      .then(function () {
        return loadScript([
          'https://cdn.jsdelivr.net/npm/three@' + V + '/examples/js/controls/OrbitControls.js',
          'https://unpkg.com/three@' + V + '/examples/js/controls/OrbitControls.js'
        ], function () { return !!(window.THREE && THREE.OrbitControls); });
      })
      .then(function () { return loadScript(['./office3d.js?v=premium1'], function () { return !!window.VO3D; }); })
      .then(function () {   // Phase 2 modules — ຖ້າໂຫຼດບໍ່ໄດ້ ຫ້ອງການ (Phase 1) ຍັງໃຊ້ງານໄດ້
        return loadScript(['./warehouse3d.js?v=premium2'], function () { return !!(window.VOX && VOX.Warehouse); })
          .then(function () { return loadScript(['./truck3d.js?v=1'], function () { return !!(window.VOX && VOX.Truck); }); })
          .then(function () { return loadScript(['./route3d.js?v=1'], function () { return !!(window.VOX && VOX.Logistics); }); })
          .then(function () { return loadScript(['./town3d.js?v=1'], function () { return !!(window.VOX && VOX.Town); }); })   // Phase 4: Shop Town
          .then(function () { return loadScript(['./asset-delivery.js?v=1'], function () { return !!(window.VOX && VOX.AssetDelivery); }); })   // Phase 5: Asset Delivery
          .catch(function (e) { console.warn('Phase 2 modules not loaded', e); });
      })
      .then(function () {
        api = window.VO3D.create($('scene'), D, {
          onSelectEmployee: function (id) { if (id) chooseEmp(id, false); else closeInfo(); },
          onSelectDepartment: function (id) { chooseDept(id, false); },
          onSelectWorld: function (p) { chooseWorld(p.type, p.id, true, p); },
          onHover: onHover,
          onReady: function () { $('loading').classList.add('hide'); }
        });
        if (LD && window.VOX && VOX.Logistics) {
          try {
            api.ext.setWorld({ bounds: { x0: -60, x1: 125, z0: -85, z1: 100 }, maxDistance: 260 });
            logi = VOX.Logistics.create(api.ext, LD);
            if (SD && window.VOX && VOX.Town) { try { town = VOX.Town.create(api.ext, SD); } catch (e) { console.error('Shop Town init failed', e); town = null; } }
            if (ADT && town && window.VOX && VOX.AssetDelivery) { try { at = VOX.AssetDelivery.create(api.ext, ADT, logi, town); } catch (e) { console.error('Asset Delivery init failed', e); at = null; } }   // Phase 5
            renderStats(); renderSide();
          } catch (e) { console.error('Phase 2 init failed', e); logi = null; }
        }
        loadDash();
      })
      .catch(function (err) {
        console.error(err);
        fail('ໂຫຼດ Three.js ບໍ່ສຳເລັດ (ກວດອິນເຕີເນັດ) — ' + (err && err.message ? err.message : ''));
      });
  }
  boot();
})();
