/* Virtual Company 3D — Phase 3 · Data Integration Layer
   ສາມຊັ້ນ ແຍກຈາກ UI ຢ່າງຊັດເຈນ (UI ບໍ່ເອີ້ນ fetch/EventSource ເອງ):
     1) VO_API     — Service: ດຶງ snapshot + ເປີດ stream (mock | http · SSE | WebSocket)
     2) VO_ADAPTER — Centralized Data Adapter: raw ຈາກລະບົບເດີມ → ໂມເດລກາງ (VO_ADAPTER.build)
     3) VO_STORE   — State: loading/ready/error, lastSync, refresh(), subscribe(), events, ຕິດຕາມສະຖານະລົດຈາກສາກ 3D
   ບໍ່ມີ Database / Workflow ໃໝ່ — ເປັນ Visualization Layer ເທົ່ານັ້ນ. ເບິ່ງຮູບແບບຂໍ້ມູນໃນ README.txt
   Phase 7: mode 'office' (ຄ່າເລີ່ມຕົ້ນ) ດຶງສະຖິຕິຈິງຈາກ GET /api/admin/office-overview · ?dash=mock ກັບໄປໃຊ້ mock ທັງໝົດ */
(function () {
  'use strict';

  // ================= Config =================
  var URLQ = (function () { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; } })();
  var CFG = window.VO_CONFIG = (function (base, user) { for (var k in user) base[k] = user[k]; return base; })({
    mode: URLQ.get('dash') === 'mock' ? 'mock' : 'office',   // 'office' = ດຶງສະຖິຕິຈິງຈາກ officeUrl · 'http' = 5 endpoints ຕາມ README · 'mock' = ?dash=mock
    officeUrl: '/api/admin/office-overview',   // GET (admin, Bearer token ຈາກ localStorage app_session_v1) — ເບິ່ງ src/lib/office.js
    baseUrl: '',                        // ຕົວຢ່າງ '/api'
    endpoints: { departments: '/company/departments', activities: '/company/activities', assets: '/company/assets', metrics: '/company/metrics', events: '/company/events' },
    headers: null,                      // function(){ return {Authorization:'Bearer …'} }
    realtime: { type: null, url: null },// type: 'sse' | 'ws'  (ເປີດໃຊ້ເມື່ອລະບົບເດີມຮອງຮັບ)
    refreshMs: 60000,                   // polling refresh (ສຳຮອງເມື່ອບໍ່ມີ realtime) · 60 ວິ = ຕົງກັບ cache ຂອງ endpoint, ບໍ່ເພີ່ມ D1 rows read
    latencyMs: 350,                     // ຈຳລອງ latency (mock)
    streamMs: 7000,                     // ຄວາມຖີ່ event ຈຳລອງ (mock)
    maxEvents: 60,
    timeoutMs: 10000
  }, window.VO_CONFIG || {});
  var SIM = { fail: URLQ.get('dash') === 'fail', slow: URLQ.get('dash') === 'slow' };   // ?dash=fail | ?dash=slow ສຳລັບທົດສອບ error/loading

  // ================= 1) API Service =================
  function timeout(p, ms) {
    return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error('Request timed out')); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); });
  }
  function sessionToken() { try { var s = JSON.parse(localStorage.getItem('app_session_v1') || 'null'); return (s && s.token) || ''; } catch (e) { return ''; } }
  function sessionHeaders() { var t = sessionToken(); return t ? { Authorization: 'Bearer ' + t } : {}; }
  function getJson(path) {
    var hf = typeof CFG.headers === 'function' ? CFG.headers : (CFG.mode === 'office' ? sessionHeaders : null);
    var h = { Accept: 'application/json' }; if (hf) { var x = hf() || {}; for (var k in x) h[k] = x[k]; }
    return timeout(fetch(CFG.baseUrl + path, { headers: h, credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path); return r.json(); }), CFG.timeoutMs);
  }
  var API = {
    simulate: SIM,
    fetchSnapshot: function () {
      if (CFG.mode === 'office') {
        if (SIM.fail) return new Promise(function (res, rej) { setTimeout(function () { rej(new Error('Source system unavailable (simulated)')); }, CFG.latencyMs); });
        return getJson(CFG.officeUrl).then(function (ov) { return SIM.slow ? new Promise(function (res) { setTimeout(function () { res(ov); }, 2500); }) : ov; }).then(fromOffice);
      }
      if (CFG.mode === 'http') {
        var E = CFG.endpoints;
        return Promise.all([getJson(E.departments), getJson(E.activities), getJson(E.assets), getJson(E.metrics), getJson(E.events)]).then(function (r) {
          return { departments: r[0], activities: r[1], assets: r[2], metrics: r[3], events: r[4] };
        });
      }
      return new Promise(function (res, rej) {
        setTimeout(function () {
          if (SIM.fail) return rej(new Error('Source system unavailable (simulated)'));
          if (!window.VO_MOCK) return rej(new Error('Mock source not loaded'));
          res(window.VO_MOCK.snapshot());
        }, SIM.slow ? 2500 : CFG.latencyMs);
      });
    },
    // onMsg({kind:'event'|'refresh', event?, patch?}) · onState('live'|'live-mock'|'polling'|'off')
    openStream: function (onMsg, onState) {
      var rt = CFG.realtime || {}, closed = false, handle = null, retry = 0;
      function parse(txt) { try { onMsg(JSON.parse(txt)); } catch (e) { console.warn('Bad realtime message', e); } }
      if (CFG.mode === 'http' && rt.type === 'sse' && rt.url && window.EventSource) {
        var es = new EventSource(rt.url, { withCredentials: true });
        es.onopen = function () { onState('live'); }; es.onmessage = function (e) { parse(e.data); }; es.onerror = function () { onState('polling'); };   // EventSource reconnect ເອງ
        return function () { closed = true; es.close(); };
      }
      if (CFG.mode === 'http' && rt.type === 'ws' && rt.url && window.WebSocket) {
        (function open() {
          if (closed) return;
          var ws = new WebSocket(rt.url); handle = ws;
          ws.onopen = function () { retry = 0; onState('live'); }; ws.onmessage = function (e) { parse(e.data); };
          ws.onclose = function () { if (closed) return; onState('polling'); setTimeout(open, Math.min(30000, 1000 * Math.pow(2, retry++))); };
          ws.onerror = function () { try { ws.close(); } catch (e) {} };
        })();
        return function () { closed = true; if (handle) handle.close(); };
      }
      if (CFG.mode === 'mock' && window.VO_MOCK) {
        onState('live-mock');
        var iv = setInterval(function () { if (!document.hidden && !SIM.fail) onMsg(window.VO_MOCK.step()); }, CFG.streamMs);
        return function () { clearInterval(iv); };
      }
      onState('polling'); return function () {};
    }
  };

  // ---- Live source: GET /api/admin/office-overview → raw snapshot ຮູບແບບເດີມຂອງ adapter ----
  // ຈິງ (ຈາກ D1): ສະຖານະ + ກິດຈະກຳຫ້ອງ asset_request · contract · delivery · asset_tracking · budget · announce, ສະຖິຕິຫ້ອງ admin, Live feed
  // ຍັງ mock: ພະນັກງານ (data.js) · ຄັງ/ລົດ (logistics-data.js) · ງົບ ₭ · assets · metrics · ແຜນກ logistics (dashboard-data.js)
  function utcMs(s) { var t = Date.parse(String(s || '').replace(' ', 'T') + (/[zZ+]/.test(String(s || '')) ? '' : 'Z')); return isNaN(t) ? Date.now() : t; }
  function fromOffice(ov) {
    var base = window.VO_MOCK ? window.VO_MOCK.snapshot() : { departments: [], activities: [], assets: [], metrics: { onTimePct: [], deliveries: [] }, events: [] };
    var live = {}, acts = [], evs = [];
    ((ov && ov.rooms3d) || []).forEach(function (r) {
      live[r.id] = { title: r.title, status: opStatus(r.status), attention: r.attention || 0, new24: r.new24 || 0, stats: r.stats || [], error: !!r.error };
      if (r.error) return;
      (r.items || []).forEach(function (it, i) {
        if (r.id !== 'admin') acts.push({ id: 'lv-' + r.id + '-' + i, dept: r.id, title: it.text + ' · ' + it.sub, status: opStatus(it.state), owner: null });   // admin ບໍ່ແມ່ນ 1 ໃນ 7 ແຜນກຂອງ adapter
        evs.push({ id: 'of-' + r.id + ':' + it.at + ':' + it.text, ts: utcMs(it.at), type: it.state === 'completed' ? 'activity_completed' : 'dept_status', text: r.title + ': ' + it.text + ' · ' + it.sub, source: 'Office API', ref: { type: 'dept', id: r.id } });
      });
    });
    base.departments.forEach(function (d) { var l = live[d.id]; if (l && !l.error) d.status = l.status; });   // budget ₭ ຍັງເປັນ mock — DB ບໍ່ມີງົບເປັນເງິນ
    base.activities = base.activities.filter(function (a) { return !live[a.dept]; }).concat(acts);
    base.events = evs; base.live = live;
    return base;
  }

  // ================= 2) Centralized Data Adapter =================
  var OP_STATUS = {   // ສະຖານະເພື່ອສະແດງຜົນ — ສີ + ສັນຍາລັກ (icon) ແຕກຕ່າງກັນທຸກຄ່າ
    working:   { label: 'Working',   lao: 'ກຳລັງເຮັດວຽກ', color: '#16a34a', icon: 'fa-gears' },
    available: { label: 'Available', lao: 'ພ້ອມ/ວ່າງ',     color: '#14b8a6', icon: 'fa-circle-dot' },
    meeting:   { label: 'Meeting',   lao: 'ປະຊຸມ',         color: '#2563eb', icon: 'fa-people-group' },
    pending:   { label: 'Pending',   lao: 'ລໍຖ້າ',         color: '#f59e0b', icon: 'fa-hourglass-half' },
    reviewing: { label: 'Reviewing', lao: 'ກຳລັງກວດ',      color: '#8b5cf6', icon: 'fa-magnifying-glass' },
    completed: { label: 'Completed', lao: 'ສຳເລັດ',        color: '#0ea5e9', icon: 'fa-circle-check' },
    delayed:   { label: 'Delayed',   lao: 'ຊັກຊ້າ',        color: '#ef4444', icon: 'fa-triangle-exclamation' }
  };
  var STATUS_ORDER = ['working', 'available', 'meeting', 'pending', 'reviewing', 'completed', 'delayed'];
  var IN_PROGRESS = { working: 1, reviewing: 1, meeting: 1 };
  var DEPT_ORDER = ['asset_tracking', 'asset_request', 'delivery', 'contract', 'budget', 'announce', 'logistics'];
  var EXTRA_AREAS = ['admin', 'reception'];   // ພື້ນທີ່ໃນຫ້ອງການທີ່ບໍ່ຢູ່ໃນ 7 ແຜນກ (ເພື່ອໃຫ້ຍອດພະນັກງານຕົງກັບ Phase 1)
  var LOGISTICS_META = { id: 'logistics', name: 'Logistics Department', short: 'Logistics', icon: 'fa-truck-fast', accent: '#0ea5e9', head: null };

  function opStatus(k) { return OP_STATUS[k] ? k : 'pending'; }
  function sum(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); }

  // scene = { trucks:[{id,status,pct}], stats:{activeDeliveries,...} } | null
  function build(raw, scene) {
    var D = window.VO_DATA, LD = window.VO_LOGISTICS, STATUS = D.STATUS;
    var empByDept = {}; D.employees.forEach(function (e) { (empByDept[e.dept] = empByDept[e.dept] || []).push(e); });
    var officeActive = D.employees.filter(function (e) { return STATUS[e.activity].active; });
    var drivers = LD ? LD.trucks.map(function (t) { return { truck: t.id, name: t.driver }; }) : [];
    var sceneTrucks = scene && scene.trucks ? scene.trucks : null;
    var driversOn = sceneTrucks ? sceneTrucks.length : drivers.length;                  // ຄົນຂັບທີ່ປະຈຳການ = ລົດທີ່ແລ່ນໃນວົງຈອນ

    var actByDept = {}; raw.activities.forEach(function (a) { (actByDept[a.dept] = actByDept[a.dept] || []).push(a); });
    var rawDept = {}; raw.departments.forEach(function (d) { rawDept[d.id] = d; });

    function mk(meta) {
      var id = meta.id, rd = rawDept[id] || { status: 'pending', budget: { total: 0, spent: 0 } }, acts = actByDept[id] || [], st = opStatus(rd.status);
      var isLog = id === 'logistics', staff = isLog ? drivers.length : (empByDept[id] || []).length;
      var working = isLog ? driversOn : (empByDept[id] || []).filter(function (e) { return STATUS[e.activity].active; }).length;
      return { id: id, name: meta.name, short: meta.short, icon: meta.icon, accent: meta.accent, head: meta.head, kind: isLog ? 'world' : 'office',
        status: st, staff: staff, working: working,
        inProgress: acts.filter(function (a) { return IN_PROGRESS[a.status]; }).length, activities: acts,
        counts: STATUS_ORDER.reduce(function (o, k) { o[k] = acts.filter(function (a) { return a.status === k; }).length; return o; }, {}),
        budget: { total: rd.budget.total, spent: rd.budget.spent }, live: (raw.live || {})[id] || null };
    }
    var metaById = {}; D.departments.forEach(function (d) { metaById[d.id] = d; });
    var departments = DEPT_ORDER.map(function (id) { return mk(id === 'logistics' ? LOGISTICS_META : metaById[id]); });
    var extras = EXTRA_AREAS.map(function (id) { var m = metaById[id], l = empByDept[id] || []; return { id: id, name: m.name, short: m.short, icon: m.icon, accent: m.accent, staff: l.length, working: l.filter(function (e) { return STATUS[e.activity].active; }).length, live: (raw.live || {})[id] || null }; });

    var wh = LD ? LD.warehouses.map(function (w) { return { id: w.id, name: w.name, short: w.short, location: w.location, accent: w.accent, status: w.status, totalItems: w.totalItems, inbound: w.inbound, outbound: w.outbound, updated: w.updated }; }) : [];
    var whActive = wh.filter(function (w) { return LD.WH_STATUS[w.status] && LD.WH_STATUS[w.status].active; }).length;
    var deliveries = scene && scene.stats ? scene.stats.activeDeliveries : (LD ? LD.trucks.length : 0);

    var assets = raw.assets.map(function (a) { return a.id === 'vehicles' && LD ? { id: a.id, label: a.label, icon: a.icon, count: LD.trucks.length, value: a.value } : a; });
    var budgetTotal = sum(departments, function (d) { return d.budget.total; }), budgetSpent = sum(departments, function (d) { return d.budget.spent; });
    var acts = raw.activities, cnt = function (k) { return acts.filter(function (a) { return a.status === k; }).length; };

    var statusDist = STATUS_ORDER.map(function (k) { var ds = departments.filter(function (d) { return d.status === k; }); return { key: k, value: ds.length, depts: ds.map(function (d) { return d.short; }) }; });
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], today = new Date().getDay(), m = raw.metrics, n = m.onTimePct.length;
    var labels = m.onTimePct.map(function (_, i) { return i === n - 1 ? 'Today' : days[(today - (n - 1 - i) + 14) % 7]; });

    return {
      company: D.company, departments: departments, extraAreas: extras, warehouses: wh, assets: assets, activities: acts, scene: !!scene,
      kpis: {
        totalEmployees: D.employees.length + drivers.length, officeEmployees: D.employees.length, fieldDrivers: drivers.length,
        activeEmployees: officeActive.length + driversOn, departments: departments.length, sharedAreas: extras.length,
        warehouses: wh.length, activeWarehouses: whActive, activeDeliveries: deliveries, trucks: LD ? LD.trucks.length : 0,
        assetCount: sum(assets, function (a) { return a.count; }), assetValue: sum(assets, function (a) { return a.value; }),
        budgetTotal: budgetTotal, budgetSpent: budgetSpent, budgetPct: budgetTotal ? Math.round(budgetSpent / budgetTotal * 100) : 0,
        pending: cnt('pending'), delayed: cnt('delayed'), completed: cnt('completed'), totalActivities: acts.length
      },
      charts: {
        activity: departments.map(function (d) {
          var c = { work: 0, meeting: 0, walk: 0, break: 0, leave: 0 };
          if (d.id === 'logistics') c.work = d.working; else (empByDept[d.id] || []).forEach(function (e) { c[e.activity]++; });
          return { id: d.id, label: d.short, vals: c, total: d.staff };
        }),
        flow: wh.map(function (w) { return { id: w.id, label: w.short, inbound: w.inbound, outbound: w.outbound }; }),
        perf: { labels: labels, onTime: m.onTimePct.slice(), deliveries: m.deliveries.slice() },
        dist: statusDist
      }
    };
  }
  var ADAPTER = { build: build, OP_STATUS: OP_STATUS, STATUS_ORDER: STATUS_ORDER, IN_PROGRESS: IN_PROGRESS, DEPT_ORDER: DEPT_ORDER };

  // ================= 3) Store =================
  var st = { status: 'idle', error: null, refreshing: false, lastSync: null, stream: 'off', raw: null, model: null, events: [], rev: 0 };
  var subs = [], scene = null, lastTrucks = null, started = false, closeStream = null, pollTimer = null;
  function emit(why) { st.rev++; subs.slice().forEach(function (fn) { try { fn(st, why); } catch (e) { console.error(e); } }); }
  function rebuild() { if (st.raw) st.model = build(st.raw, sceneSnapshot()); }
  function sceneSnapshot() { return scene ? { trucks: scene.trucks(), stats: scene.stats() } : null; }
  function srcName(s) { return CFG.mode === 'mock' ? s + ' · mock' : s; }
  function addEvents(list) {
    var ids = {}, fresh = []; st.events.forEach(function (e) { ids[e.id] = 1; });
    list.forEach(function (e) { if (!ids[e.id]) { ids[e.id] = 1; fresh.push({ id: e.id, ts: e.ts, type: e.type, text: e.text, source: srcName(e.source), ref: e.ref || null }); } });
    if (!fresh.length) return 0;
    st.events = st.events.concat(fresh).sort(function (a, b) { return b.ts - a.ts; }).slice(0, CFG.maxEvents);
    return fresh.length;
  }
  function applyPatch(p) {
    if (!p || !st.raw) return;
    if (p.activity) st.raw.activities.forEach(function (a) { if (a.id === p.activity.id) a.status = p.activity.status; });
    if (p.department) st.raw.departments.forEach(function (d) { if (d.id === p.department.id) d.status = p.department.status; });
    if (p.warehouse && window.VO_LOGISTICS) { /* ຂໍ້ມູນຄັງຢູ່ logistics-data (Phase 2): ໃນໂໝດ mock ຖືກແກ້ທີ່ຕົ້ນທາງແລ້ວ — ໂໝດ http ໃຫ້ refresh() ດຶງຄ່າໃໝ່ */ }
  }
  function onMessage(msg) {
    if (!msg) return;
    if (msg.kind === 'refresh') { STORE.refresh(); return; }
    if (msg.kind === 'event') { applyPatch(msg.patch); if (msg.event) addEvents([msg.event]); st.lastSync = Date.now(); rebuild(); emit('event'); }
  }
  var STORE = {
    state: st, config: CFG, api: API, adapter: ADAPTER,
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    load: function (manual) {
      if (st.refreshing) return Promise.resolve();
      st.refreshing = true; if (!st.raw) st.status = 'loading'; emit('loading');
      return API.fetchSnapshot().then(function (raw) {
        st.raw = raw; st.error = null; st.status = 'ready'; st.lastSync = Date.now();
        addEvents(raw.events || []); rebuild();
      }).catch(function (err) {
        st.error = (err && err.message) || 'Unknown error'; st.status = st.raw ? 'ready' : 'error';   // ມີຂໍ້ມູນເກົ່າ → ສະແດງຕໍ່ + ແຈ້ງວ່າ stale
      }).then(function () { st.refreshing = false; emit('loaded'); });
    },
    refresh: function () { return STORE.load(true); },
    start: function () {
      if (started) return; started = true;
      STORE.load();
      closeStream = API.openStream(onMessage, function (s) { st.stream = s; emit('stream'); });
      pollTimer = setInterval(function () { if (!document.hidden) STORE.load(); }, CFG.refreshMs);
    },
    stop: function () { started = false; if (closeStream) closeStream(); clearInterval(pollTimer); },
    // ສາກ 3D (Phase 2) ເປັນແຫຼ່ງສະຖານະລົດ: provider = { trucks():[{id,status,pct,route,dir}], stats():{activeDeliveries,…} }
    setScene: function (p) { scene = p; lastTrucks = null; rebuild(); emit('scene'); },
    // ເອີ້ນທຸກວິນາທີ: ກວດການປ່ຽນສະຖານະລົດ → ສ້າງ event "Delivery started/completed" ແລະ ອັບເດດ KPI
    scenePoll: function () {
      if (!scene) return false;
      var trucks = scene.trucks(), prev = lastTrucks, LD = window.VO_LOGISTICS, fresh = [], t = Date.now();
      if (prev && LD) {
        trucks.forEach(function (tr) {
          var p = prev[tr.id]; if (!p || p === tr.status) return;
          var def = LD.trucks.filter(function (x) { return x.id === tr.id; })[0], rd = LD.routes.filter(function (r) { return r.id === def.route; })[0];
          var A = LD.warehouses.filter(function (w) { return w.id === rd.from; })[0], B = LD.warehouses.filter(function (w) { return w.id === rd.to; })[0], ev = null;
          if (p === 'loading' && tr.status === 'onroute') ev = { type: 'delivery_started', text: tr.id + ' departed ' + A.short + ' → ' + B.short, wh: A };
          else if (p === 'unloading' && tr.status === 'onroute') ev = { type: 'delivery_started', text: tr.id + ' departed ' + B.short + ' → ' + A.short, wh: B };
          else if (p === 'onroute' && tr.status === 'unloading') ev = { type: 'delivery_completed', text: tr.id + ' arrived at ' + B.short + ' (' + def.cargo + ')', wh: B };
          else if (p === 'onroute' && tr.status === 'loading') ev = { type: 'delivery_completed', text: tr.id + ' arrived at ' + A.short + ' (' + def.cargo + ')', wh: A };
          if (ev) fresh.push({ id: 'ev-' + tr.id + '-' + t, ts: t, type: ev.type, text: ev.text, source: 'TMS', ref: { type: 'truck', id: tr.id } });
        });
      }
      lastTrucks = {}; trucks.forEach(function (tr) { lastTrucks[tr.id] = tr.status; });
      if (fresh.length) addEvents(fresh);
      rebuild(); if (fresh.length) emit('event'); return fresh.length > 0;
    },
    fmtTime: function (ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  };
  window.VO_API = API; window.VO_ADAPTER = ADAPTER; window.VO_STORE = STORE;
})();
