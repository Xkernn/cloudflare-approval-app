/* Virtual Company 3D — Phase 2 · Component: LogisticsRoute (ຖະໜົນ + ເສັ້ນທາງຂົນສົ່ງ + ລົດແລ່ນຕໍ່ເນື່ອງ)
   VOX.Logistics.create(ext, LD) → { warehouses, trucks, routes, stats(), select(type,id), update }
   ວົງຈອນລົດ: loading → onroute (A→B) → unloading → onroute (B→A) · ເຂົ້າຈອດຖອຍຫຼັງເຂົ້າ dock */
(function () {
  'use strict';
  var VOX = window.VOX = window.VOX || {};

  // ----- path ມີມຸມມົນ (ຍົກເວັ້ນມຸມຈອດ dock) -----
  function buildPath(pts) {
    var out = [pts[0]], n = pts.length;
    for (var i = 1; i < n - 1; i++) {
      var P = pts[i], A = pts[i - 1], B = pts[i + 1];
      var la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]), r = Math.min(6, la / 2, lb / 2);
      if (i === 1 || i === n - 2 || r < 0.5) { out.push(P); continue; }
      var p1 = [P[0] + (A[0] - P[0]) / la * r, P[1] + (A[1] - P[1]) / la * r], p2 = [P[0] + (B[0] - P[0]) / lb * r, P[1] + (B[1] - P[1]) / lb * r];
      for (var s = 0; s <= 8; s++) { var t = s / 8, u = 1 - t; out.push([u * u * p1[0] + 2 * u * t * P[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * P[1] + t * t * p2[1]]); }
    }
    out.push(pts[n - 1]);
    var cum = [0]; for (i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { p: out, cum: cum, len: cum[cum.length - 1], first: cum[1], last: cum[cum.length - 1] - cum[cum.length - 2] };
  }
  function sample(path, s) {       // → {x,z,dx,dz} ຢູ່ໄລຍະ s
    var c = path.cum, i = 1; s = Math.max(0, Math.min(path.len, s));
    while (i < c.length - 1 && c[i] < s) i++;
    var a = path.p[i - 1], b = path.p[i], seg = (c[i] - c[i - 1]) || 1, t = (s - c[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
  }
  function lerpA(a, b, k) { var d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }

  function create(ext, LD) {
    var T = ext.THREE, box = ext.box, WS = LD.WH_STATUS, TS = LD.TRUCK_STATUS;
    var whs = {}, rts = {}, trks = [], trkById = {}, group = new T.Group(); ext.scene.add(group);
    LD.warehouses.forEach(function (d) { var w = VOX.Warehouse.create(ext, d, WS); whs[d.id] = w; ext.addPickRoot(w.root); });

    // ----- ຖະໜົນ (asphalt + ເສັ້ນກາງ + ຂອບທາງ) -----
    function road(pts, w) {
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ang = Math.atan2(dx, dz), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
        var m = box(group, w, 0.06, L, cx, 0.06, cz, '#4b5563'); m.rotation.y = ang; m.castShadow = false;
        [-1, 1].forEach(function (sd) { var e = box(group, 0.25, 0.04, L, cx + Math.cos(ang) * (w / 2 - 0.2) * sd, 0.12, cz - Math.sin(ang) * (w / 2 - 0.2) * sd, '#e5e7eb'); e.rotation.y = ang; e.castShadow = false; });
        for (var k = 0; k < L / 4 - 0.5; k++) { var o = 2 + k * 4 - L / 2 + 1, d = box(group, 0.25, 0.04, 1.8, cx + Math.sin(ang) * o, 0.12, cz + Math.cos(ang) * o, '#facc15'); d.rotation.y = ang; d.castShadow = false; }
      }
    }
    LD.roads.forEach(function (r) { road(r, 6); });
    [[30, -37], [30, 12], [30, 68], [30, 20]].forEach(function (p) { var j = ext.cyl(group, 3.4, 3.4, 0.06, p[0], 0.06, p[1], '#4b5563', 24); j.castShadow = false; });
    box(group, 4, 0.05, 1.6, 0, 0.0, 14.5, '#94a3b8').castShadow = false;

    // ຈຸດຮັບ (ຟ້າ) / ຈຸດສົ່ງ (ຂຽວ) ປະຈຳແຕ່ລະສາງ — ຫຼອດເວລາ
    var pins = [];
    LD.warehouses.forEach(function (d) {
      [[-13.5, '#2563eb'], [13.5, '#16a34a']].forEach(function (e, k) {
        var pg = new T.Group(); pg.position.set(d.x + e[0], 0, d.z + 10);
        var c = new T.Mesh(new T.ConeGeometry(0.55, 1.4, 12), new T.MeshLambertMaterial({ color: e[1] })); c.rotation.x = Math.PI; c.position.y = 2.2; pg.add(c);
        var s = new T.Mesh(new T.SphereGeometry(0.62, 12, 10), new T.MeshLambertMaterial({ color: e[1] })); s.position.y = 3.15; pg.add(s);
        var r = new T.Mesh(new T.RingGeometry(0.9, 1.25, 28), new T.MeshBasicMaterial({ color: e[1], side: T.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.y = 0.1; pg.add(r);
        group.add(pg); pins.push(pg);
      });
    });
    // ----- Routes: bay → approach → via... → approach → bay -----
    LD.routes.forEach(function (r) { rts[r.id] = { def: r, hl: null }; });
    function routePts(rd, dockA, dockB) {
      var A = whs[rd.from], B = whs[rd.to], a = A.bayPos(dockA), ap = A.approachPos(dockA), bp = B.approachPos(dockB), b = B.bayPos(dockB);
      return [a, ap].concat(rd.via, [bp, b]);
    }
    // ເສັ້ນເນັ້ນເສັ້ນທາງ (ສະແດງເມື່ອເລືອກ) + ຈຸດຮັບ/ສົ່ງ
    Object.keys(rts).forEach(function (id) {
      var rd = rts[id].def, g = new T.Group(); g.visible = false; group.add(g);
      var pts = [whs[rd.from].approachPos(3)].concat(rd.via, [whs[rd.to].approachPos(3)]);
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.01, m = box(g, 1.0, 0.04, L, (a[0] + b[0]) / 2, 0.2, (a[1] + b[1]) / 2, rd.color, true); m.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); m.castShadow = false;
      }
      [[pts[0], '#2563eb'], [pts[pts.length - 1], '#16a34a']].forEach(function (e) {            // ຈຸດຮັບ (ຟ້າ) / ຈຸດສົ່ງ (ຂຽວ)
        var c = new T.Mesh(new T.ConeGeometry(0.9, 2.2, 14), new T.MeshLambertMaterial({ color: e[1] })); c.rotation.x = Math.PI; c.position.set(e[0][0], 3.4, e[0][1]); g.add(c);
        var s = new T.Mesh(new T.SphereGeometry(0.95, 14, 10), new T.MeshLambertMaterial({ color: e[1] })); s.position.set(e[0][0], 4.8, e[0][1]); g.add(s);
      });
      rts[id].hl = g;
    });

    // ----- ລົດ -----
    LD.trucks.forEach(function (d) {
      var tk = VOX.Truck.create(ext, d, TS); group.add(tk.root); ext.addPickRoot(tk.root);
      var rd = rts[d.route].def, pts = routePts(rd, d.dockA, d.dockB), path = buildPath(pts);
      var t = { def: d, view: tk, path: path, dir: 1, s: 0, phase: 'loading', timer: d.dwell, rot: 0, status: 'loading' };
      // ເລີ່ມຕົ້ນຕາມ t0: ຈຳລອງຜ່ານວົງຈອນ
      var cycle = (d.dwell + path.len / d.speed) * 2, tt = d.t0 % cycle;
      (function warm() { var step = 0.25; for (var x = 0; x < tt; x += step) advance(t, step); })();
      var sp = sample(path, t.s); tk.root.position.set(sp.x, 0, sp.z); t.rot = Math.atan2(sp.dx * t.dir, sp.dz * t.dir) + (rev(t) ? Math.PI : 0); tk.root.rotation.y = t.rot;
      trks.push(t); trkById[d.id] = t;
    });
    function rev(t) { return (t.dir > 0 && t.s > t.path.len - t.path.last - 0.01) || (t.dir < 0 && t.s < t.path.first + 0.01); }
    function advance(t, dt) {
      if (t.phase === 'loading' || t.phase === 'unloading') {
        t.timer -= dt; if (t.timer <= 0) { t.phase = 'travel'; t.status = 'onroute'; }
      } else {
        t.s += t.dir * t.def.speed * dt * (rev(t) || nearEnd(t) ? 0.45 : 1);
        if (t.dir > 0 && t.s >= t.path.len) { t.s = t.path.len; t.dir = -1; t.phase = 'unloading'; t.status = 'unloading'; t.timer = t.def.dwell; }
        else if (t.dir < 0 && t.s <= 0) { t.s = 0; t.dir = 1; t.phase = 'loading'; t.status = 'loading'; t.timer = t.def.dwell; }
      }
    }
    function nearEnd(t) { return t.s < 12 || t.s > t.path.len - 12; }
    var selT = null, selW = null, selR = null;
    function update(dt, tm) {
      dt = Math.min(dt, 0.05);
      Object.keys(whs).forEach(function (k) { whs[k].update(dt, tm); });
      pins.forEach(function (p, i) { p.children[0].position.y = 2.2 + Math.sin(tm * 2.5 + i) * 0.22; p.children[1].position.y = 3.15 + Math.sin(tm * 2.5 + i) * 0.22; });
      trks.forEach(function (t) {
        advance(t, dt);
        var sp = sample(t.path, t.s), r = rev(t), want = Math.atan2(sp.dx * t.dir, sp.dz * t.dir) + (r ? Math.PI : 0);
        t.rot = lerpA(t.rot, want, Math.min(1, dt * 5)); t.view.root.position.set(sp.x, 0, sp.z); t.view.root.rotation.y = t.rot;
        var raw = t.phase === 'travel' ? (t.dir > 0 ? t.s : t.path.len - t.s) / t.path.len : 1 - t.timer / t.def.dwell, pct = Math.min(100, Math.round(raw * 10) * 10) + '%'; t.pct = Math.max(0, Math.min(100, Math.round(raw * 100)));
        t.view.setStatus(t.status, pct);
      });
    }
    ext.addUpdater(update);

    function stats() {
      var c = { loading: 0, onroute: 0, unloading: 0 }; trks.forEach(function (t) { c[t.status]++; });
      var ws = LD.warehouses, act = ws.filter(function (w) { return WS[(whs[w.id].status())].active; }).length;
      return { warehouses: ws.length, activeWarehouses: act, trucks: trks.length, onRoute: c.onroute, loading: c.loading, unloading: c.unloading,
        activeDeliveries: c.onroute + c.unloading, inbound: ws.reduce(function (a, w) { return a + w.inbound; }, 0), outbound: ws.reduce(function (a, w) { return a + w.outbound; }, 0), totalItems: ws.reduce(function (a, w) { return a + w.totalItems; }, 0) };
    }
    function clearSel() {
      if (selT) selT.view.setSelected(false); if (selW) selW.setSelected(false); if (selR) rts[selR].hl.visible = false; selT = selW = selR = null;
    }
    function select(type, id) {
      clearSel();
      if (type === 'warehouse' && whs[id]) { selW = whs[id]; selW.setSelected(true); }
      else if (type === 'truck' && trkById[id]) { selT = trkById[id]; selT.view.setSelected(true); selR = selT.def.route; rts[selR].hl.visible = true; }
      else if (type === 'route' && rts[id]) { selR = id; rts[id].hl.visible = true; }
    }
    return { warehouses: whs, trucks: trkById, truckList: trks, routes: rts, stats: stats, select: select, clearSelection: clearSel, update: update,
      truckPos: function (id) { var p = trkById[id].view.root.position; return new T.Vector3(p.x, 1.2, p.z); }, truckState: function (id) { var t = trkById[id]; return { status: t.status, dir: t.dir, pct: t.pct || 0 }; } };
  }
  VOX.Logistics = { create: create, buildPath: buildPath, sample: sample };
})();
