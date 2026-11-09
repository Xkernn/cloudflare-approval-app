/* Virtual Company 3D — Phase 3 · Company Overview & Live Dashboard (UI)
   ຮັບຂໍ້ມູນຈາກ VO_STORE ເທົ່ານັ້ນ (ບໍ່ເອີ້ນ API ເອງ). ຮ່ວມກັບສາກ 3D ຜ່ານ hooks ທີ່ ui.js ສົ່ງໃຫ້.
   ແຕ່ລະສ່ວນ (KPI / Sidebar / Feed / Charts / Sync) ວາດໃໝ່ສະເພາະເມື່ອ hash ຂອງຂໍ້ມູນສ່ວນນັ້ນປ່ຽນ — ບໍ່ວາດຊ້ຳໂດຍບໍ່ຈຳເປັນ. */
(function () {
  'use strict';
  var H = null, ST = null, AD = null, OPS = null, LD = null, D = null;
  var ui = { feedOpen: false, dockOpen: false, filter: null, chartsState: 'idle', panel: null };
  var last = { kpi: '', side: '', sync: '', feed: '', charts: '', panel: '' }, fedIds = {}, STATUS_ORDER = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function money(n) { var a = Math.abs(n); return '₭' + (a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? Math.round(n / 1e6) + 'M' : num(n)); }
  function isOv() { return H && H.view().tab === 'overview'; }
  function model() { return ST.state.model; }
  function deptOf(id) { var m = model(); if (!m) return null; for (var i = 0; i < m.departments.length; i++) if (m.departments[i].id === id) return m.departments[i]; return null; }
  function badge(k, small) { var s = OPS[k] || OPS.pending; return '<span class="sbadge' + (small ? ' sm' : '') + '" style="--c:' + s.color + '"><i class="fa-solid ' + s.icon + '"></i>' + s.label + '</span>'; }
  function ago(ts) { var s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 10 ? 'just now' : s < 60 ? s + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : Math.floor(s / 3600) + 'h ago'; }
  function streamLabel(s) { return { live: 'Live', 'live-mock': 'Live · mock stream', polling: 'Polling ' + Math.round(ST.config.refreshMs / 1000) + 's', off: 'Offline' }[s] || s; }

  // =====================================================================
  // 1) Executive KPI cards
  // =====================================================================
  var KPIS = [
    { id: 'employees',   ic: 'fa-users',          lb: 'Total Employees', s: 'Employees',   c: '#3b82f6', v: function (k) { return k.totalEmployees; },                 sub: function (k) { return k.officeEmployees + ' office · ' + k.fieldDrivers + ' field'; } },
    { id: 'active',      ic: 'fa-user-check',     lb: 'Active Employees', s: 'Active Now',  c: '#16a34a', v: function (k) { return k.activeEmployees; },                 sub: function (k) { return Math.round(k.activeEmployees / k.totalEmployees * 100) + '% of staff'; } },
    { id: 'departments', ic: 'fa-sitemap',        lb: 'Total Departments', s: 'Departments', c: '#6366f1', v: function (k) { return k.departments; },                    sub: function (k) { return '+' + k.sharedAreas + ' shared areas'; } },
    { id: 'warehouses',  ic: 'fa-warehouse',      lb: 'Total Warehouses', s: 'Warehouses',  c: '#7c3aed', v: function (k) { return k.warehouses; },                     sub: function (k) { return k.activeWarehouses + ' active'; } },
    { id: 'deliveries',  ic: 'fa-truck-fast',     lb: 'Active Deliveries', s: 'Deliveries', c: '#0ea5e9', v: function (k) { return k.activeDeliveries; },               sub: function (k) { return 'of ' + k.trucks + ' vehicles'; } },
    { id: 'assets',      ic: 'fa-boxes-stacked',  lb: 'Company Assets', s: 'Assets',    c: '#0d9488', v: function (k) { return num(k.assetCount); },                sub: function (k) { return money(k.assetValue) + ' value'; } },
    { id: 'budget',      ic: 'fa-wallet',         lb: 'Budget Used', s: 'Budget Used',       c: '#d97706', v: function (k) { return k.budgetPct + '%'; },                sub: function (k) { return money(k.budgetSpent) + ' / ' + money(k.budgetTotal); } },
    { id: 'pending',     ic: 'fa-hourglass-half', lb: 'Pending Activities', s: 'Pending',c: '#f59e0b', v: function (k) { return k.pending; },                        sub: function (k) { return k.delayed + ' delayed'; } },
    { id: 'completed',   ic: 'fa-circle-check',   lb: 'Completed', s: 'Completed',         c: '#0891b2', v: function (k) { return k.completed; },                      sub: function (k) { return 'of ' + k.totalActivities + ' activities'; } }
  ];
  function renderKpis(el) {
    el = el || $('stats'); var s = ST.state, h;
    el.className = 'stats kpi-strip';
    if (!s.model) {
      h = s.status === 'error'
        ? '<div class="kpi-msg err"><i class="fa-solid fa-triangle-exclamation"></i><span>Could not load company data — ' + esc(s.error) + '</span><button class="tbtn" data-refresh>Retry</button></div>'
        : KPIS.map(function (k) { return '<div class="kpi skel" aria-busy="true"><span class="lb"><i class="fa-solid ' + k.ic + '"></i>' + k.s + '</span><span class="vl">&nbsp;</span><span class="sb">&nbsp;</span></div>'; }).join('');
    } else {
      var k = s.model.kpis;
      h = KPIS.map(function (c) {
        return '<button class="kpi' + (ui.panel === 'kpi:' + c.id ? ' on' : '') + '" data-kpi="' + c.id + '" style="--c:' + c.c + '" title="' + c.lb + ' — click for details"><span class="lb"><i class="fa-solid ' + c.ic + '"></i>' + c.s + '</span><span class="vl">' + c.v(k) + '</span><span class="sb">' + esc(c.sub(k)) + '</span></button>';
      }).join('');
    }
    if (el.__kh !== h) { el.innerHTML = h; el.__kh = h; last.kpi = h; }
  }

  // =====================================================================
  // 2) Sidebar: Operational status legend + Department Overview + Warehouses + Logistics
  // =====================================================================
  function renderSide() {
    var s = ST.state, m = s.model, h = '';
    if (!m) return (s.status === 'error')
      ? '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><br>Company data unavailable<br><button class="tbtn dark" data-refresh>Retry</button></div>'
      : '<div class="sk-list">' + new Array(6).join('<div class="skel-row"></div>') + '</div>';
    var counts = {}; m.departments.forEach(function (d) { counts[d.status] = (counts[d.status] || 0) + 1; });
    h += '<div class="sec-title">Operational status · departments' + (ui.filter ? ' <a class="clr" data-dstatus="' + ui.filter + '">clear filter</a>' : '') + '</div><div class="legend">' +
      STATUS_ORDER.map(function (k) { var o = OPS[k]; return '<button class="lg' + (ui.filter === k ? ' on' : '') + (counts[k] ? '' : ' z') + '" data-dstatus="' + k + '" style="--c:' + o.color + '" title="' + o.lao + '"><i class="fa-solid ' + o.icon + '"></i>' + o.label + '<b>' + (counts[k] || 0) + '</b></button>'; }).join('') + '</div>';
    h += '<div class="sec-title">Department Overview · click to view area</div>';
    m.departments.forEach(function (d) {
      var pct = d.staff ? Math.round(d.working / d.staff * 100) : 0, dim = ui.filter && d.status !== ui.filter;
      h += '<button class="dcard' + (dim ? ' dim' : '') + (H.view().dept === d.id || ui.panel === 'dept:' + d.id ? ' on' : '') + '" data-ddept="' + d.id + '"><span class="ic" style="background:' + d.accent + '"><i class="fa-solid ' + d.icon + '"></i></span><span class="bd">' +
        '<span class="t"><b>' + esc(d.short) + '</b>' + badge(d.status, true) + '</span>' +
        '<span class="m"><span><b>' + d.staff + '</b> staff</span><span><b>' + d.working + '</b> working</span><span><b>' + d.inProgress + '</b> in progress</span></span>' +
        '<span class="bar" title="' + pct + '% of staff working"><i style="width:' + pct + '%;background:' + d.accent + '"></i></span></span></button>';
    });
    h += '<div class="sec-title">Other areas</div>';
    m.extraAreas.forEach(function (a) {
      h += '<button class="list-item" data-dept="' + a.id + '"><span class="ic" style="background:' + a.accent + '"><i class="fa-solid ' + a.icon + '"></i></span><span class="tx"><b>' + esc(a.name) + '</b><span>' + a.staff + ' staff · ' + a.working + ' working</span></span></button>';
    });
    h += '<div class="sec-title">Warehouses · click for status</div>';
    m.warehouses.forEach(function (w) {
      var ws = LD.WH_STATUS[w.status];
      h += '<button class="list-item" data-wh="' + w.id + '"><span class="ic" style="background:' + w.accent + '"><i class="fa-solid fa-warehouse"></i></span><span class="tx"><b>' + esc(w.short) + ' · ' + esc(w.location) + '</b><span>' + num(w.totalItems) + ' items · in ' + w.inbound + ' / out ' + w.outbound + '</span></span><span class="dot" title="' + ws.label + '" style="background:' + ws.color + '"></span></button>';
    });
    h += '<div class="sec-title">Logistics · click to see route</div>';
    LD.routes.forEach(function (r) {
      var n = LD.trucks.filter(function (t) { return t.route === r.id; }).length;
      h += '<button class="list-item" data-route="' + r.id + '"><span class="ic" style="background:' + r.color + '"><i class="fa-solid fa-route"></i></span><span class="tx"><b>' + esc(r.name) + '</b><span>' + r.km + ' km · ' + n + ' vehicles</span></span></button>';
    });
    last.side = h; return h;
  }
  function refreshSide() { if (!isOv()) return; var prev = last.side, h = renderSide(); if (h !== prev || !$('sideBody').getAttribute('data-ov')) { H.renderSide(); } }

  // =====================================================================
  // 3) Information panels (KPI drill-down · Department extra · Logistics · Route)
  // =====================================================================
  function head(title, sub, ic, color) {
    return '<div class="hd" style="background:linear-gradient(135deg,' + color + ',' + color + 'cc)"><button class="x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button><div class="who"><span class="avatar" style="width:58px;height:58px;font-size:24px;background:rgba(255,255,255,.28)"><i class="fa-solid ' + ic + '"></i></span><div><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p></div></div></div>';
  }
  function actRow(a) {
    var d = deptOf(a.dept), o = OPS[a.status], who = a.owner && H.D.employees.filter(function (e) { return e.id === a.owner; })[0];
    return '<button class="mini" data-ddept="' + a.dept + '"><span class="avatar" style="width:32px;height:32px;background:' + o.color + '"><i class="fa-solid ' + o.icon + '" style="font-size:13px"></i></span><span class="tx"><b>' + esc(a.title) + '</b><span>' + esc(d ? d.short : a.dept) + (who ? ' · ' + esc(who.name) : '') + '</span></span>' + badge(a.status, true) + '</button>';
  }
  function bar(label, pct, color, right) { return '<div class="meter"><div class="l"><span>' + label + '</span><span>' + right + '</span></div><div class="t"><i style="width:' + Math.min(100, pct) + '%;background:' + color + '"></i></div></div>'; }
  function secT(t) { return '<div class="sec-title" style="color:#64748b;margin:10px 0 8px">' + t + '</div>'; }
  function closeBtn() { return '<div class="btns" style="margin-top:6px"><button class="btn sec" data-close>Close</button></div>'; }

  function kpiPanel(id) {
    var m = model(), k = m.kpis, c = KPIS.filter(function (x) { return x.id === id; })[0], b = '';
    if (id === 'employees') {
      b += '<div class="fields"><div><span>Office staff</span><b>' + k.officeEmployees + '</b></div><div><span>Field drivers</span><b>' + k.fieldDrivers + '</b></div></div>' + secT('By department');
      m.departments.forEach(function (d) { b += '<button class="mini" data-ddept="' + d.id + '"><span class="avatar" style="width:32px;height:32px;background:' + d.accent + '"><i class="fa-solid ' + d.icon + '" style="font-size:13px"></i></span><span class="tx"><b>' + esc(d.name) + '</b><span>' + d.working + ' working now</span></span><span class="chip" style="background:#0f172a">' + d.staff + '</span></button>'; });
      m.extraAreas.forEach(function (a) { b += '<button class="mini" data-dept="' + a.id + '"><span class="avatar" style="width:32px;height:32px;background:' + a.accent + '"><i class="fa-solid ' + a.icon + '" style="font-size:13px"></i></span><span class="tx"><b>' + esc(a.name) + '</b><span>' + a.working + ' working now</span></span><span class="chip" style="background:#0f172a">' + a.staff + '</span></button>'; });
    } else if (id === 'active') {
      b += '<div class="fields"><div><span>Active now</span><b>' + k.activeEmployees + ' / ' + k.totalEmployees + '</b></div><div><span>Field drivers on duty</span><b>' + (k.fieldDrivers) + '</b></div></div>' + secT('Office staff working, in meeting or moving');
      H.D.employees.filter(function (e) { return H.D.STATUS[e.activity].active; }).forEach(function (e) { b += '<button class="mini" data-emp="' + e.id + '">' + H.avatar(e, 32) + '<span class="tx"><b>' + esc(e.name) + '</b><span>' + esc(e.task) + '</span></span><span class="dot" style="background:' + H.D.STATUS[e.activity].color + '"></span></button>'; });
    } else if (id === 'departments') {
      m.departments.forEach(function (d) { b += '<button class="mini" data-ddept="' + d.id + '"><span class="avatar" style="width:32px;height:32px;background:' + d.accent + '"><i class="fa-solid ' + d.icon + '" style="font-size:13px"></i></span><span class="tx"><b>' + esc(d.name) + '</b><span>' + d.staff + ' staff · ' + d.inProgress + ' in progress</span></span>' + badge(d.status, true) + '</button>'; });
      b += secT('Shared areas'); m.extraAreas.forEach(function (a) { b += '<button class="mini" data-dept="' + a.id + '"><span class="avatar" style="width:32px;height:32px;background:' + a.accent + '"><i class="fa-solid ' + a.icon + '" style="font-size:13px"></i></span><span class="tx"><b>' + esc(a.name) + '</b><span>' + a.staff + ' staff</span></span></button>'; });
    } else if (id === 'warehouses') {
      m.warehouses.forEach(function (w) { var s = LD.WH_STATUS[w.status]; b += '<button class="mini" data-wh="' + w.id + '"><span class="avatar" style="width:32px;height:32px;background:' + w.accent + '"><i class="fa-solid fa-warehouse" style="font-size:13px"></i></span><span class="tx"><b>' + esc(w.name) + '</b><span>' + num(w.totalItems) + ' items · in ' + w.inbound + ' / out ' + w.outbound + '</span></span><span class="chip" style="background:' + s.color + ';padding:2px 8px;font-size:11px">' + s.label + '</span></button>'; });
    } else if (id === 'deliveries') {
      var lg = H.getLogi();
      b += '<div class="fields"><div><span>On route</span><b>' + (lg ? lg.stats().onRoute : '–') + '</b></div><div><span>Loading / unloading</span><b>' + (lg ? lg.stats().loading + ' / ' + lg.stats().unloading : '–') + '</b></div></div>' + secT('Vehicles · live from 3D scene');
      LD.trucks.forEach(function (t) { var r = LD.routes.filter(function (x) { return x.id === t.route; })[0], s = lg ? LD.TRUCK_STATUS[lg.truckState(t.id).status] : null; b += '<button class="mini" data-truck="' + t.id + '"><span class="avatar" style="width:32px;height:32px;background:' + r.color + '"><i class="fa-solid fa-truck" style="font-size:13px"></i></span><span class="tx"><b>' + esc(t.id) + ' · ' + esc(t.driver) + '</b><span>' + esc(r.name) + '</span></span>' + (s ? '<span class="chip" style="background:' + s.color + ';padding:2px 8px;font-size:11px">' + s.label + '</span>' : '') + '</button>'; });
    } else if (id === 'assets') {
      var mx = Math.max.apply(null, m.assets.map(function (a) { return a.value; }));
      b += '<div class="fields"><div><span>Total assets</span><b>' + num(k.assetCount) + '</b></div><div><span>Total value</span><b>' + money(k.assetValue) + '</b></div></div>' + secT('By category');
      m.assets.forEach(function (a) { b += bar('<i class="fa-solid ' + a.icon + '" style="width:16px;color:#0d9488"></i> ' + esc(a.label) + ' · ' + num(a.count), a.value / mx * 100, '#0d9488', money(a.value)); });
    } else if (id === 'budget') {
      b += '<div class="fields"><div><span>Spent</span><b>' + money(k.budgetSpent) + '</b></div><div><span>Total budget</span><b>' + money(k.budgetTotal) + '</b></div></div>' + secT('By department · click to view');
      m.departments.forEach(function (d) { var p = d.budget.total ? Math.round(d.budget.spent / d.budget.total * 100) : 0; b += '<button class="mini colm" data-ddept="' + d.id + '">' + bar(esc(d.short) + ' · ' + money(d.budget.spent) + ' / ' + money(d.budget.total), p, p > 85 ? '#ef4444' : p > 70 ? '#f59e0b' : '#22c55e', p + '%') + '</button>'; });
    } else if (id === 'pending') {
      var pl = m.activities.filter(function (a) { return a.status === 'pending'; }), dl = m.activities.filter(function (a) { return a.status === 'delayed'; });
      b += '<div class="fields"><div><span>Pending</span><b>' + pl.length + '</b></div><div><span>Delayed</span><b style="color:#dc2626">' + dl.length + '</b></div></div>' + secT('Delayed') + (dl.map(actRow).join('') || '<div class="empty">None</div>') + secT('Pending') + (pl.map(actRow).join('') || '<div class="empty">None</div>');
    } else if (id === 'completed') {
      var cl = m.activities.filter(function (a) { return a.status === 'completed'; });
      b += '<div class="fields"><div><span>Completed</span><b>' + cl.length + '</b></div><div><span>Completion rate</span><b>' + Math.round(cl.length / m.activities.length * 100) + '%</b></div></div>' + secT('Completed activities') + (cl.map(actRow).join('') || '<div class="empty">None</div>');
    }
    return head(c.lb, c.sub(k), c.ic, c.c) + '<div class="bd" data-kpi-panel="' + id + '"><div class="kpi-big"><b>' + c.v(k) + '</b></div>' + b + closeBtn() + '</div>';
  }
  function openKpi(id) {
    if (!model()) return;
    H.resetSelection(); ui.panel = 'kpi:' + id; var h = kpiPanel(id); last.panel = h; H.openInfo(h); renderKpis(); refreshSide();
  }
  function refreshOpenPanel() {   // ເກັບກວາດ state ຂອງ panel + ອັບເດດ KPI panel ສົດ ເມື່ອເນື້ອຫາປ່ຽນຈິງເທົ່ານັ້ນ
    if (!ui.panel) return;
    var info = $('info'), open = info.classList.contains('open'), m = /^kpi:(.+)$/.exec(ui.panel);
    if (m) {
      if (!open || !info.querySelector('[data-kpi-panel="' + m[1] + '"]')) { ui.panel = null; renderKpis(); return; }
      if (!model()) return;
      var h = kpiPanel(m[1]); if (h === last.panel) return; last.panel = h;
      var sc = info.scrollTop; info.innerHTML = h; info.scrollTop = sc;
    } else if (!open || !info.querySelector('[data-dept-panel="logistics"]')) { ui.panel = null; refreshSide(); }
  }

  // ເນື້ອຫາເພີ່ມໃນ Department Panel (ui.js ເອີ້ນ) — ສະຖານະ + ງົບ + ກິດຈະກຳ
  // ສະຖິຕິຈິງຈາກ /api/admin/office-overview (ມີສະເພາະເມື່ອ VO_CONFIG.mode = 'office') — ສະແດງໃນ panel ຂອງຫ້ອງ
  function liveBlock(l) {
    if (!l) return '';
    if (l.error) return secT('Live data') + '<div class="empty">Live data unavailable</div>';
    return secT('Live data · ' + num(l.attention) + ' waiting · ' + num(l.new24) + ' new in 24h') +
      '<div class="fields">' + (l.stats || []).map(function (x) { return '<div><span>' + esc(x.label) + '</span><b>' + num(x.value) + '</b></div>'; }).join('') + '</div>';
  }
  function extraOf(id) { var m = model(); if (!m) return null; for (var i = 0; i < m.extraAreas.length; i++) if (m.extraAreas[i].id === id) return m.extraAreas[i]; return null; }
  function deptExtra(id) {
    var d = deptOf(id);
    if (!d) { var x = extraOf(id); return x && x.live ? '<div class="row2">' + badge(x.live.status) + '</div>' + liveBlock(x.live) : ''; }
    var p = d.budget.total ? Math.round(d.budget.spent / d.budget.total * 100) : 0, o = OPS[d.status];
    return '<div class="row2">' + badge(d.status) + '<span class="chip" style="background:#475569">' + d.inProgress + ' in progress</span></div>' +
      bar('Budget used' + (d.live ? ' (sample ₭)' : '') + ' · ' + money(d.budget.spent) + ' / ' + money(d.budget.total), p, p > 85 ? '#ef4444' : p > 70 ? '#f59e0b' : '#22c55e', p + '%') +
      liveBlock(d.live) +
      secT('Activities · ' + d.activities.length) + d.activities.slice(0, 8).map(function (a) {
        var s = OPS[a.status]; return '<div class="mini ro"><span class="avatar" style="width:26px;height:26px;background:' + s.color + '"><i class="fa-solid ' + s.icon + '" style="font-size:11px"></i></span><span class="tx"><b>' + esc(a.title) + '</b></span></div>';
      }).join('');
  }
  function logisticsPanel() {
    var d = deptOf('logistics'), m = model(), lg = H.getLogi(), s = lg ? lg.stats() : null, p = d.budget.total ? Math.round(d.budget.spent / d.budget.total * 100) : 0, perf = m.charts.perf;
    return head('Logistics Department', 'Fleet & distribution', 'fa-truck-fast', d.accent) + '<div class="bd" data-dept-panel="logistics"><div class="row2">' + badge(d.status) + '</div>' +
      '<div class="fields" style="margin-top:12px"><div><span>Drivers</span><b>' + d.staff + '</b></div><div><span>Vehicles</span><b>' + m.kpis.trucks + '</b></div>' +
      '<div><span>On route now</span><b>' + (s ? s.onRoute : '–') + '</b></div><div><span>Active deliveries</span><b>' + m.kpis.activeDeliveries + '</b></div>' +
      '<div><span>On-time today</span><b>' + perf.onTime[perf.onTime.length - 1] + '%</b></div><div><span>Deliveries today</span><b>' + perf.deliveries[perf.deliveries.length - 1] + '</b></div></div>' +
      bar('Budget used · ' + money(d.budget.spent) + ' / ' + money(d.budget.total), p, p > 85 ? '#ef4444' : p > 70 ? '#f59e0b' : '#22c55e', p + '%') +
      secT('Routes') + LD.routes.map(function (r) { return '<button class="mini" data-route="' + r.id + '"><span class="avatar" style="width:32px;height:32px;background:' + r.color + '"><i class="fa-solid fa-route" style="font-size:13px"></i></span><span class="tx"><b>' + esc(r.name) + '</b><span>' + r.km + ' km</span></span></button>'; }).join('') +
      secT('Activities · ' + d.activities.length) + d.activities.slice(0, 7).map(function (a) { var o = OPS[a.status]; return '<div class="mini ro"><span class="avatar" style="width:26px;height:26px;background:' + o.color + '"><i class="fa-solid ' + o.icon + '" style="font-size:11px"></i></span><span class="tx"><b>' + esc(a.title) + '</b></span></div>'; }).join('') +
      '<div class="btns" style="margin-top:8px"><button class="btn" data-focusview="logistics"><i class="fa-solid fa-crosshairs"></i> Focus</button><button class="btn sec" data-close>Close</button></div></div>';
  }
  function routePanel(id) {
    var r = LD.routes.filter(function (x) { return x.id === id; })[0], A = LD.warehouses.filter(function (w) { return w.id === r.from; })[0], B = LD.warehouses.filter(function (w) { return w.id === r.to; })[0], lg = H.getLogi();
    var ts = LD.trucks.filter(function (t) { return t.route === id; });
    return head(r.name, r.km + ' km', 'fa-route', r.color) + '<div class="bd"><div class="fields"><div><span>From</span><b>' + esc(A.name) + '</b></div><div><span>To</span><b>' + esc(B.name) + '</b></div><div><span>Distance</span><b>' + r.km + ' km</b></div><div><span>Vehicles</span><b>' + ts.length + '</b></div></div>' + secT('Vehicles on this route') +
      ts.map(function (t) { var s = lg ? LD.TRUCK_STATUS[lg.truckState(t.id).status] : null; return '<button class="mini" data-truck="' + t.id + '"><span class="avatar" style="width:32px;height:32px;background:' + r.color + '"><i class="fa-solid fa-truck" style="font-size:13px"></i></span><span class="tx"><b>' + esc(t.id) + ' · ' + esc(t.driver) + '</b><span>' + esc(t.cargo) + '</span></span>' + (s ? '<span class="chip" style="background:' + s.color + ';padding:2px 8px;font-size:11px">' + s.label + '</span>' : '') + '</button>'; }).join('') +
      '<div class="btns" style="margin-top:8px"><button class="btn" data-focusview="logistics"><i class="fa-solid fa-crosshairs"></i> All routes</button><button class="btn sec" data-close>Close</button></div></div>';
  }
  function focusDept(id) {
    if (id === 'logistics') { if (!model()) return; H.resetSelection(); ui.panel = 'dept:logistics'; H.focusView('logistics'); H.openInfo(logisticsPanel()); refreshSide(); return; }
    ui.panel = null; H.chooseDept(id);
  }

  // =====================================================================
  // 4) Live Activity Feed
  // =====================================================================
  var EV = {
    activity_completed: { ic: 'fa-circle-check', c: '#0ea5e9', t: 'Activity' },
    goods_received:     { ic: 'fa-boxes-packing', c: '#7c3aed', t: 'Goods in' },
    goods_dispatched:   { ic: 'fa-dolly', c: '#6d28d9', t: 'Goods out' },
    delivery_started:   { ic: 'fa-truck-fast', c: '#16a34a', t: 'Delivery' },
    delivery_completed: { ic: 'fa-flag-checkered', c: '#059669', t: 'Delivery' },
    dept_status:        { ic: 'fa-arrows-rotate', c: '#f59e0b', t: 'Status' }
  };
  function evHtml(e, isNew) {
    var t = EV[e.type] || { ic: 'fa-bell', c: '#64748b', t: 'Event' };
    return '<button class="ev' + (isNew ? ' new' : '') + '" data-ev="' + esc(e.id) + '" style="--c:' + t.c + '"><span class="ic"><i class="fa-solid ' + t.ic + '"></i></span><span class="tx"><span class="m">' + esc(e.text) + '</span><span class="s"><span class="tm" data-ts="' + e.ts + '">' + ST.fmtTime(e.ts) + ' · ' + ago(e.ts) + '</span><span class="src">' + esc(e.source) + '</span></span></span></button>';
  }
  function renderFeed() {
    var body = $('feedBody'), s = ST.state; if (!body) return;
    if (!s.events.length) { body.innerHTML = s.status === 'error' ? '<div class="empty">Feed unavailable</div>' : '<div class="empty"><div class="spinner sm"></div>Loading events…</div>'; fedIds = {}; return; }
    var ids = s.events.map(function (e) { return e.id; }), key = ids.join('|');
    if (key === last.feed) return; last.feed = key;
    var first = !Object.keys(fedIds).length, fresh = s.events.filter(function (e) { return !fedIds[e.id]; });
    if (first || fresh.length > 8) { body.innerHTML = s.events.map(function (e) { return evHtml(e, false); }).join(''); }
    else {   // ເພີ່ມສະເພາະ event ໃໝ່ທາງເທິງ + ຕັດອັນເກົ່າ — ບໍ່ວາດທັງລາຍການໃໝ່
      fresh.slice().reverse().forEach(function (e) { body.insertAdjacentHTML('afterbegin', evHtml(e, true)); });
      var keep = {}; ids.forEach(function (i) { keep[i] = 1; });
      Array.prototype.slice.call(body.querySelectorAll('.ev')).forEach(function (n) { if (!keep[n.getAttribute('data-ev')]) n.remove(); });
    }
    fedIds = {}; ids.forEach(function (i) { fedIds[i] = 1; });
    $('feedCount').textContent = s.events.length;
  }
  function tickTimes() {
    Array.prototype.forEach.call(document.querySelectorAll('#feedBody .tm'), function (n) { var ts = +n.getAttribute('data-ts'), t = ST.fmtTime(ts) + ' · ' + ago(ts); if (n.textContent !== t) n.textContent = t; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-since]'), function (n) { var t = ago(ST.state.lastSync || Date.now()); if (n.textContent !== t) n.textContent = t; });
  }
  function onEventClick(id) {
    var e = ST.state.events.filter(function (x) { return x.id === id; })[0]; if (!e || !e.ref) return;
    var r = e.ref;
    if (r.type === 'dept') focusDept(r.id); else if (r.type === 'warehouse' || r.type === 'truck') H.chooseWorld(r.type, r.id, true); else if (r.type === 'employee') H.chooseEmp(r.id);
  }

  // =====================================================================
  // 5) Sync status · tools bar · layout
  // =====================================================================
  function syncHtml(compact) {
    var s = ST.state, cls = s.status === 'error' ? 'err' : (s.error ? 'warn' : (s.status === 'loading' ? 'load' : 'ok')), msg;
    if (s.status === 'loading') msg = 'Loading company data…';
    else if (s.status === 'error') msg = 'Sync failed';
    else msg = 'Last sync <b>' + ST.fmtTime(s.lastSync) + '</b> <span class="since">(<span data-since>' + ago(s.lastSync) + '</span>)</span>';
    var det = s.error ? (s.status === 'error' ? esc(s.error) : 'Update failed — showing last data') : streamLabel(s.stream);
    return '<span class="syncchip ' + cls + '"><i class="sd"></i><span class="sm">' + msg + '<em>' + det + '</em></span></span>' +
      '<button class="tbtn icon" data-refresh title="Refresh data" aria-label="Refresh data"' + (s.refreshing ? ' disabled' : '') + '><i class="fa-solid fa-rotate' + (s.refreshing ? ' fa-spin' : '') + '"></i></button>';
  }
  function renderSync() {
    var h = syncHtml(), a = $('ovSync'), b = $('syncSide'); if (h === last.sync) return; last.sync = h;
    if (a) a.innerHTML = h; if (b) b.innerHTML = h;
  }
  function renderToggles() {
    var f = $('btnFeed'), c = $('btnDock'); if (f) f.setAttribute('aria-pressed', ui.feedOpen); if (c) c.setAttribute('aria-pressed', ui.dockOpen);
  }
  function applyLayout() {
    var st = H.stage, ov = isOv();
    st.classList.toggle('ov', ov); st.classList.toggle('feed-open', ov && ui.feedOpen); st.classList.toggle('dock-open', ov && ui.dockOpen);
    renderToggles();
  }
  function toggleFeed() { ui.feedOpen = !ui.feedOpen; applyLayout(); if (ui.feedOpen) { last.feed = ''; renderFeed(); } }
  function toggleDock() { ui.dockOpen = !ui.dockOpen; applyLayout(); if (ui.dockOpen) ensureCharts(); }

  // =====================================================================
  // 6) Charts (lazy)
  // =====================================================================
  function ensureCharts() {
    if (window.VOCharts) { ui.chartsState = 'ready'; renderCharts(); return; }
    if (ui.chartsState === 'loading') return;
    ui.chartsState = 'loading'; setChartsMsg('<div class="spinner sm"></div>Loading charts…');
    H.loadScript(['./charts.js?v=1'], function () { return !!window.VOCharts; }).then(function () { ui.chartsState = 'ready'; last.charts = ''; renderCharts(); })
      .catch(function () { ui.chartsState = 'error'; setChartsMsg('<i class="fa-solid fa-triangle-exclamation"></i> Charts failed to load <button class="tbtn dark" data-charts-retry>Retry</button>'); });
  }
  function setChartsMsg(h) { ['ch-activity', 'ch-flow', 'ch-perf', 'ch-dist'].forEach(function (id) { var n = $(id); if (n) n.innerHTML = '<div class="chmsg">' + h + '</div>'; }); }
  function renderCharts() {
    if (!ui.dockOpen || !isOv() || !window.VOCharts) return;
    var m = model(); if (!m) { setChartsMsg(ST.state.status === 'error' ? 'No data' : '<div class="spinner sm"></div>Loading…'); last.charts = ''; return; }
    var key = JSON.stringify(m.charts) + '|' + ui.filter; if (key === last.charts) return; last.charts = key;
    var C = m.charts, S = H.D.STATUS, keys = ['work', 'meeting', 'walk', 'break', 'leave'], colors = {}, names = {};
    keys.forEach(function (k) { colors[k] = S[k].color; names[k] = S[k].label; });
    $('ch-activity').innerHTML = VOCharts.stacked(C.activity, keys, colors, names);
    $('ch-flow').innerHTML = VOCharts.grouped(C.flow);
    $('ch-perf').innerHTML = VOCharts.line(C.perf);
    $('ch-dist').innerHTML = VOCharts.donut(C.dist, OPS, ui.filter);
    $('lg-activity').innerHTML = keys.map(function (k) { return '<span><i style="background:' + colors[k] + '"></i>' + names[k] + '</span>'; }).join('');
  }
  function goChart(spec) {
    var p = spec.split(':'), t = p[0], id = p[1];
    if (t === 'dept') focusDept(id); else if (t === 'warehouse') H.chooseWorld('warehouse', id, true); else if (t === 'status') toggleFilter(id); else if (t === 'view') H.focusView(id);
  }
  function toggleFilter(k) { ui.filter = ui.filter === k ? null : k; last.charts = ''; refreshSide(); renderCharts(); }
  function tip(ev, on) {
    var el = $('tip'); if (!on) { el.classList.remove('show'); return; }
    var p = ev.getAttribute('data-tip').split('|'); el.innerHTML = '<b>' + esc(p[0]) + '</b><small>' + esc(p[1] || '') + '</small>';
    el.style.left = ev._x + 'px'; el.style.top = ev._y + 'px'; el.classList.add('show');
  }

  // =====================================================================
  // events + state wiring
  // =====================================================================
  function onClick(ev) {
    var el = ev.target.closest && ev.target.closest('[data-kpi],[data-ddept],[data-dstatus],[data-ev],[data-refresh],[data-focusview],[data-go],[data-charts-retry]');
    var tg = ev.target.closest && ev.target.closest('#btnFeed,#btnDock,#feedClose,#dockClose');
    if (tg) { if (tg.id === 'btnFeed' || tg.id === 'feedClose') toggleFeed(); else toggleDock(); return; }
    if (!el) return;
    if (el.hasAttribute('data-kpi')) { var id = el.getAttribute('data-kpi'); if (ui.panel === 'kpi:' + id && $('info').classList.contains('open')) H.closeInfo(); else openKpi(id); }
    else if (el.hasAttribute('data-ddept')) focusDept(el.getAttribute('data-ddept'));
    else if (el.hasAttribute('data-dstatus')) toggleFilter(el.getAttribute('data-dstatus'));
    else if (el.hasAttribute('data-ev')) onEventClick(el.getAttribute('data-ev'));
    else if (el.hasAttribute('data-refresh')) ST.refresh();
    else if (el.hasAttribute('data-focusview')) H.focusView(el.getAttribute('data-focusview'));
    else if (el.hasAttribute('data-go')) goChart(el.getAttribute('data-go'));
    else if (el.hasAttribute('data-charts-retry')) { ui.chartsState = 'idle'; ensureCharts(); }
  }
  function onMove(ev) {
    var t = ev.target.closest && ev.target.closest('#dock [data-tip]');
    if (!t) { tip(null, false); return; } t._x = ev.clientX; t._y = ev.clientY; tip(t, true);
  }

  function onState(s, why) {
    renderSync();
    if (why === 'loaded' || why === 'loading' || why === 'event' || why === 'scene') {
      if (isOv()) { refreshOpenPanel(); renderKpis(); refreshSide(); renderFeed(); renderCharts(); }
    }
  }
  function sceneTick() {   // ui.js ເອີ້ນທຸກ 1 ວິນາທີ
    if (!ST) return;
    ST.scenePoll();
    if (isOv()) { refreshOpenPanel(); renderKpis(); }
    tickTimes();
  }
  function onTab(tab) {
    ui.filter = tab === 'overview' ? ui.filter : null; if (tab !== 'overview') { ui.panel = null; last.charts = ''; }
    applyLayout();
    if (tab === 'overview') { $('stats').__kh = null; renderKpis(); renderFeed(); if (ui.dockOpen) ensureCharts(); }
  }

  function init(hooks) {
    H = hooks; ST = window.VO_STORE; AD = ST.adapter; OPS = AD.OP_STATUS; STATUS_ORDER = AD.STATUS_ORDER; LD = window.VO_LOGISTICS || { warehouses: [], routes: [], trucks: [], WH_STATUS: {}, TRUCK_STATUS: {} }; D = H.D;
    var w = window.innerWidth, h = window.innerHeight;
    ui.feedOpen = w >= 1280; ui.dockOpen = w >= 1100 && h >= 700;
    document.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMove);
    ST.subscribe(onState);
    ST.setScene({
      trucks: function () { var lg = H.getLogi(); return lg ? LD.trucks.map(function (t) { var s = lg.truckState(t.id); return { id: t.id, status: s.status, pct: s.pct }; }) : []; },
      stats: function () { var lg = H.getLogi(); return lg ? lg.stats() : { activeDeliveries: LD.trucks.length }; }
    });
    ST.start();
    renderSync(); applyLayout(); H.refreshUI();
    setInterval(function () { if (!document.hidden) tickTimes(); }, 15000);
  }

  window.VODash = { init: init, renderKpis: renderKpis, renderSide: renderSide, deptExtra: deptExtra, routePanel: routePanel, onTab: onTab, sceneTick: sceneTick, hasModel: function () { return !!(ST && ST.state.model); } };
})();
