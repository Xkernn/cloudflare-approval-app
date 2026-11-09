/* Virtual Company 3D — Phase 5 · Component: AssetDelivery (ລົດສົ່ງ Asset ຄັນດຽວ ຕາມລາຍການ Asset Tracking)
   VOX.AssetDelivery.create(ext, AD, logi, town) → { truck, stats(), stops(), select(on), truckPos(), update }
   ວົງຈອນ: ຈອດທີ່ Central DC → ອອກທາງຫຼວງ → ເຂົ້າເມືອງເລນເໜືອ (ຮ້ານແຖວເໜືອ) → ກັບລົດທີ່ປາຍຖະໜົນ → ເລນໃຕ້ (ຮ້ານແຖວໃຕ້) → ກັບສາງ
   ແວ່ສະເພາະຮ້ານທີ່ມີ Asset ຄ້າງສົ່ງ ໂດຍຮຽງຕາມລຳດັບການຂັບວົນ (ບໍ່ຕ້ອງກັບລົດຊ້ຳ) · Mock Data ຢູ່ asset-data.js */
(function () {
  'use strict';
  var VOX = window.VOX = window.VOX || {};
  var ST = { depot: { label: 'At Depot', color: '#2563eb' }, onroute: { label: 'On Route', color: '#16a34a' },
             unloading: { label: 'Unloading', color: '#f59e0b' }, returning: { label: 'Returning', color: '#7c3aed' } };
  function lerpA(a, b, k) { var d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }

  function create(ext, AD, logi, town) {
    var T = ext.THREE, box = ext.box, G = town.geom, TX = G.TX, TZ = G.TZ, CFG = AD.config, SS = AD.STATUS;
    var LN = TZ - 1.5, LS = TZ + 1.5, UX = TX - 18.8;                       // ເລນເໜືອ (ໄປຕາເວັນຕົກ) · ເລນໃຕ້ (ໄປຕາເວັນອອກ) · ຈຸດກັບລົດ
    var wh = logi.warehouses[CFG.depot], bay = wh.bayPos(CFG.dock || 0), app = wh.approachPos(CFG.dock || 0), ax = app[0];
    var shopById = {}; town.shops && Object.keys(town.shops).forEach(function (k) { shopById[k] = town.shops[k]; });

    var tk = VOX.Truck.create(ext, { id: AD.truck.id, type: AD.truck.type || 'van' }, ST);
    ext.scene.add(tk.root); ext.addPickRoot(tk.root);

    // ---------- ຂໍ້ມູນຕຳແໜ່ງຮ້ານ ----------
    function info(id) {
      var L = G.LAYOUT[id]; if (!L || L.dest) return null;
      var n = L.row === 'n', dx = (n ? -1 : 1) * L.w * 0.22;
      return { n: n, x: TX + L.x + dx, lane: n ? LN : LS, side: n ? -1 : 1, face: TZ + G.ROW_Z[L.row] + (n ? 4.5 : -4.5),
               px: TX + L.x, pz: TZ + G.ROW_Z[L.row], h: L.h, key: n ? 100 - (TX + L.x + dx) : 1000 + (TX + L.x + dx) };
    }
    // ---------- Pin ສະຖານະເທິງຫຼັງຄາຮ້ານ ----------
    var pins = {}, pinSig = '';
    function pinFor(id) {
      if (pins[id]) return pins[id];
      var inf = info(id), g = new T.Group(), m = new T.MeshLambertMaterial({ color: 0xf59e0b });
      var c = new T.Mesh(new T.ConeGeometry(0.55, 1.4, 12), m); c.rotation.x = Math.PI; c.position.y = 0; g.add(c);
      var s = new T.Mesh(new T.SphereGeometry(0.62, 12, 10), m); s.position.y = 0.95; g.add(s);
      c.raycast = s.raycast = function () {};
      g.position.set(inf.px, inf.h + 3.4, inf.pz); ext.scene.add(g); return (pins[id] = { g: g, m: m, base: inf.h + 3.4 });
    }
    function shopState(id) {
      var a = AD.list.filter(function (i) { return i.shop === id; }); if (!a.length) return null;
      if (a.some(function (i) { return i.status === 'delivering'; })) return 'delivering';
      return a.every(function (i) { return i.status === 'delivered'; }) ? 'delivered' : 'pending';
    }
    function refreshPins() {
      var sig = AD.list.map(function (i) { return i.shop + i.status; }).join('|'); if (sig === pinSig) return; pinSig = sig;
      Object.keys(pins).forEach(function (k) { pins[k].g.visible = false; });
      AD.list.forEach(function (i) { if (!info(i.shop)) return; var st = shopState(i.shop), p = pinFor(i.shop); p.g.visible = true; p.m.color.set(SS[st].color); });
    }
    // ---------- ລັງ Asset (ຍົກລົງຈາກລົດ) ----------
    var crate = new T.Group(); ext.scene.add(crate); crate.visible = false;
    box(crate, 1.0, 1.0, 1.0, 0, 0, 0, '#e0f2fe'); box(crate, 1.04, 0.22, 1.04, 0, 0.4, 0, '#2563eb'); box(crate, 0.5, 0.4, 0.06, 0, 0.3, 0.52, '#ffffff', true);
    crate.traverse(function (o) { o.raycast = function () {}; });

    // ---------- ແຜນເສັ້ນທາງ ----------
    var path = null, trip = { n: 0, stops: [], i: 0 }, ph = 'depot', timer = CFG.depotWaitSec, s = 0, v = 0, rot = 0, t = 0, selected = false;
    function buildPath() {
      var pts = [bay, app, [ax - 12, 9.9], [27.9, 9.9], [27.9, LN], [UX, LN], [UX, LS], [32.1, LS], [32.1, 14.1], [ax - 12, 14.1], app, bay];
      path = VOX.Logistics.buildPath(pts);
    }
    function sOf(x, z, from) {
      var best = 1e9, bs = from; for (var q = from; q <= path.len; q += 0.2) { var p = VOX.Logistics.sample(path, q), d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; bs = q; } } return bs;
    }
    function plan() {
      var by = {}, order = [];
      AD.list.forEach(function (it) {
        if (it.status === 'delivered') return; var inf = info(it.shop); if (!inf) return;
        if (!by[it.shop]) { by[it.shop] = { shop: it.shop, inf: inf, items: [], state: 'pending' }; order.push(by[it.shop]); }
        by[it.shop].items.push(it);
      });
      order.sort(function (a, b) { return a.inf.key - b.inf.key; });
      if (order.length) { var from = 1; order.forEach(function (o) { o.s = sOf(o.inf.x, o.inf.lane, from); from = o.s + 1; }); }
      return order;
    }
    function startTrip() {
      if (!path) buildPath();
      var st = plan();
      if (!st.length && CFG.demoLoop && AD.list.length) { AD.list.forEach(function (i) { i.status = 'pending'; delete i.deliveredAt; }); st = plan(); }
      if (!st.length) return false;
      trip = { n: trip.n + 1, stops: st, i: 0 }; s = 0; v = 0; ph = 'go'; return true;
    }
    function units(stop) { return stop.items.reduce(function (a, i) { return a + (i.qty || 1); }, 0); }
    function rev(q) { return q < path.first + 0.01 || q > path.len - path.last - 0.01; }

    function place(dt) {
      if (!path) buildPath();
      var sp = VOX.Logistics.sample(path, s), r = rev(s), want = Math.atan2(sp.dx, sp.dz) + (r ? Math.PI : 0);
      rot = lerpA(rot, want, Math.min(1, dt * 5)); tk.root.position.set(sp.x, 0, sp.z); tk.root.rotation.y = rot;
    }
    function label() {
      var cur = trip.stops[trip.i], n = trip.stops.length;
      if (ph === 'depot') tk.setStatus('depot', 'Trip ' + (trip.n + 1));
      else if (ph === 'unload') tk.setStatus('unloading', (shopById[cur.shop] ? shopById[cur.shop].name : cur.shop));
      else if (cur) tk.setStatus('onroute', 'Stop ' + (trip.i + 1) + '/' + n);
      else tk.setStatus('returning', n + '/' + n + ' done');
    }
    function drive(dt) {
      var nx = trip.stops[trip.i], target = nx ? nx.s : path.len, d = target - s, sp = VOX.Logistics.sample(path, s);
      var inTown = sp.x < 12 && sp.z > 40 && sp.z < 70, vmax = CFG.speed * (inTown ? 0.65 : 1) * ((rev(s) || s < 14 || path.len - s < 14) ? 0.5 : 1);
      var tv = Math.min(vmax, 1.4 + d * 1.3); v += (tv - v) * Math.min(1, dt * 3); if (d > 0.15 && v < 0.9) v = 0.9;
      s += v * dt;
      if (s >= target - 0.04) {
        s = target; v = 0;
        if (nx) { ph = 'unload'; t = 0; nx.state = 'delivering'; nx.items.forEach(function (i) { i.status = 'delivering'; }); nx.crates = Math.min(3, units(nx)); nx.dwell = 1.0 + nx.crates * CFG.crateSec + 0.6; }
        else { ph = 'depot'; timer = CFG.depotWaitSec; crate.visible = false; }
      }
    }
    function unload(dt) {
      var nx = trip.stops[trip.i], inf = nx.inf; t += dt; crate.visible = false;
      var k = Math.floor((t - 0.6) / CFG.crateSec);
      if (k >= 0 && k < nx.crates) {
        var u = ((t - 0.6) - k * CFG.crateSec) / CFG.crateSec, sx = inf.x, sz = inf.lane + inf.side * 1.25, ez = inf.face - inf.side * 0.9;
        crate.position.set(sx, 1.4 + Math.sin(Math.PI * u) * 1.1 - u * 0.9, sz + (ez - sz) * u); crate.rotation.y = 0;
        crate.scale.setScalar(u > 0.8 ? Math.max(0.35, 1 - (u - 0.8) * 3) : 1); crate.visible = true;
      }
      if (t >= nx.dwell) {
        nx.state = 'done'; nx.items.forEach(function (i) { i.status = 'delivered'; i.deliveredAt = Date.now(); }); trip.i++; ph = 'go'; crate.visible = false;
      }
    }
    function update(dt, tm) {
      dt = Math.min(dt, 0.05);
      if (ph === 'depot') { timer -= dt; if (timer <= 0 && !startTrip()) timer = 2; }
      else if (ph === 'go') drive(dt); else unload(dt);
      place(dt); label(); refreshPins();
      Object.keys(pins).forEach(function (k, i) { var p = pins[k]; if (p.g.visible) p.g.position.y = p.base + Math.sin(tm * 2.5 + i) * 0.22; });
      tk.setSelected(selected);
    }
    buildPath(); place(1); label(); refreshPins();
    ext.addUpdater(update);

    function stats() {
      var tot = 0, del = 0, dlv = 0;
      AD.list.forEach(function (i) { var q = i.qty || 1; tot += q; if (i.status === 'delivered') del += q; else if (i.status === 'delivering') dlv += q; });
      var st = ph === 'depot' ? 'depot' : ph === 'unload' ? 'unloading' : (trip.stops[trip.i] ? 'onroute' : 'returning');
      return { total: tot, delivered: del, delivering: dlv, pending: tot - del - dlv, stops: trip.stops.length, stopNo: Math.min(trip.i + (ph === 'unload' ? 1 : 0), trip.stops.length), state: st, trip: trip.n || 1,
               current: trip.stops[trip.i] && ph !== 'depot' ? trip.stops[trip.i].shop : null };
    }
    function stops() {   // ລຳດັບແວ່ຂອງຮອບນີ້ (ຖ້າຍັງຢູ່ສາງ ສະແດງແຜນຮອບຕໍ່ໄປ)
      var src = (ph === 'depot' && trip.stops.every(function (x) { return x.state === 'done'; })) ? plan() : trip.stops;
      return src.map(function (x) { return { shop: x.shop, state: x.state, items: x.items }; });
    }
    return { truck: tk, stats: stats, stops: stops, update: update, select: function (on) { selected = !!on; },
      truckPos: function () { var p = tk.root.position; return new T.Vector3(p.x, 1.2, p.z); } };
  }
  VOX.AssetDelivery = { create: create };
})();
