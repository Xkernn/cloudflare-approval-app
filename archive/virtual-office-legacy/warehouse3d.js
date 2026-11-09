/* Virtual Company 3D — Phase 2 · Component: Warehouse (ອາຄານຄລັງສິນຄ້າ 3D ແບບ Isometric Cartoon)
   VOX.Warehouse.create(ext, def, statusMap) → { root, def, bayPos(i), approachPos(i), setStatus(key), setSelected(on), update(dt,t) }
   ປະກອບດ້ວຍ: Warehouse Building · Loading/Unloading Area · Storage Zones · Loading Docks · Inventory Area */
(function () {
  'use strict';
  var VOX = window.VOX = window.VOX || {};
  var DOCK_X = [-9, -3, 3, 9], BAY_Z = 7.4, YARD_Z = 18;

  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // ປ້າຍລອຍ (ຊື່ + ສະຖານະ)
  function label(T, title, sub, dot, accent, w, h) {
    var c = document.createElement('canvas'); c.width = 640; c.height = 160; var g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.96)'; rr(g, 4, 4, 632, 152, 30); g.fill();
    g.fillStyle = accent; rr(g, 4, 4, 22, 152, 11); g.fill();
    g.fillStyle = '#0f172a'; g.font = '700 52px "Noto Sans","Noto Sans Lao",Arial,sans-serif'; g.textBaseline = 'middle'; g.fillText(title, 46, 56);
    g.fillStyle = dot; g.beginPath(); g.arc(58, 112, 14, 0, 7); g.fill();
    g.fillStyle = '#475569'; g.font = '600 36px "Noto Sans","Noto Sans Lao",Arial,sans-serif'; g.fillText(sub, 84, 114);
    var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
    sp.scale.set(w || 10, h || 2.5, 1); return sp;
  }
  function plate(T, text, bg, fg, w, h) {
    var c = document.createElement('canvas'); c.width = 128; c.height = Math.round(128 * h / w); var g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg; g.font = '800 ' + Math.round(c.height * 0.7) + 'px Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + 3);
    return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c) }));
  }
  VOX.label = label;

  var toothGeo = null;
  function create(ext, def, ST) {
    var T = ext.THREE, box = ext.box, cyl = ext.cyl, sph = ext.sph, A = def.accent;
    var root = new T.Group(); root.position.set(def.x, 0, def.z); ext.scene.add(root);
    function ro(m, y) { if (y != null) m.rotation.y = y; return m; }

    // ----- ພື້ນ + ຮົ້ວ + ປະຕູລົດ -----
    box(root, 58, 0.5, 36, 0, -0.5, 5, '#7f909d').castShadow = false;
    box(root, 58, 0.06, 36, 0, 0, 5, '#aebbc4').castShadow = false;
    for (var i = -14; i <= 14; i++) { box(root, 0.14, 1.3, 0.14, i * 2, 0.06, -13, '#687b89'); }
    box(root, 58, 0.1, 0.1, 0, 1.0, -13, '#687b89'); box(root, 58, 0.1, 0.1, 0, 0.5, -13, '#687b89');
    for (i = 0; i < 9; i++) { box(root, 0.14, 1.3, 0.14, -29, 0.06, -11 + i * 4, '#687b89'); }
    box(root, 0.1, 0.1, 36, -29, 1.0, 5, '#687b89');
    // ----- Warehouse Building -----
    var wall = box(root, 28, 5.2, 12, 0, 0.06, -4, '#d8dfe3');
    box(root, 28.3, 0.55, 12.3, 0, 0.06, -4, '#354a5a');                       // ຖານອາຄານ
    box(root, 28.4, 0.9, 0.5, 0, 4.3, 2.1, A);                                // ແຖບສີບໍລິສັດ
    box(root, 0.5, 0.9, 12.3, 14.1, 4.3, -4, tintHex(A));
    for (i = 0; i < 6; i++) { box(root, 0.06, 4.2, 0.1, -12.5 + i * 5, 0.6, 2.06, '#b9c4cb'); }   // ຄີບຝາ
    if (!toothGeo) { var sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(7, 0); sh.lineTo(7, 1.7); sh.lineTo(0, 0); toothGeo = new T.ExtrudeGeometry(sh, { depth: 12.4, bevelEnabled: false }); }
    for (i = 0; i < 4; i++) {
      var tooth = new T.Mesh(toothGeo, ext.mat('#9eabb5')); tooth.position.set(-14 + i * 7, 5.26, -10.2); tooth.castShadow = true; tooth.receiveShadow = true; root.add(tooth);
      box(root, 0.06, 1.2, 11.8, -14 + i * 7 + 7.03, 5.5, -4, '#8daebd', true);                    // skylight
    }
    box(root, 28.6, 0.3, 12.6, 0, 5.2, -4, '#b99a5b');                         // ຂອບຫຼັງຄາ
    // ເຄື່ອງປັບອາກາດເທິງຫຼັງຄາ
    [[-8, -7], [6, -8], [11, -2]].forEach(function (p) { box(root, 1.8, 0.9, 1.4, p[0], 6.9, p[1], '#e5e7eb'); cyl(root, 0.5, 0.5, 0.12, p[0], 7.8, p[1], '#475569', 14); });
    // ----- Loading Docks (4 ຊ່ອງ) · premium dock portals -----
    DOCK_X.forEach(function (x, k) {
      box(root, 4.3, 4.1, 0.5, x, 0.06, 1.95, '#263746');
      box(root, 3.6, 3.5, 0.2, x, 0.06, 2.2, '#101d29');
      box(root, 3.6, 1.7, 0.25, x, 1.9, 2.28, '#9ca9b5');
      for (var s = 0; s < 5; s++) box(root, 3.6, 0.045, 0.28, x, 1.95 + s * 0.32, 2.3, '#687987');
      box(root, 0.5, 0.8, 0.4, x - 1.55, 0.7, 2.5, '#17232d'); box(root, 0.5, 0.8, 0.4, x + 1.55, 0.7, 2.5, '#17232d');
      box(root, 3.4, 0.08, 1.2, x, 0.06, 2.9, '#c9a45e');
      box(root, 0.3, 0.12, 0.3, x - 2.35, 3.4, 2.3, '#e6c77e', true); box(root, 0.3, 0.12, 0.3, x + 2.35, 3.4, 2.3, '#e6c77e', true);
      // champagne-gold dock frame and illuminated bay number
      box(root, 0.12, 4.05, 0.16, x - 1.95, 0.08, 2.52, '#b99553');
      box(root, 0.12, 4.05, 0.16, x + 1.95, 0.08, 2.52, '#b99553');
      box(root, 4.05, 0.12, 0.16, x, 4.02, 2.52, '#b99553');
      var p = plate(T, 'DOCK ' + String(k + 1), '#172635', '#ead39d', 2.0, 0.55); p.position.set(x, 4.62, 2.58); root.add(p);
      box(root, 2.8, 0.08, 0.5, x, 4.12, 2.55, '#d8bd7d', true);
    });
    // Subtle safety lane + loading guides, replacing the flat yellow strip with a premium floor graphic
    box(root, 28, 0.025, 0.08, 0, 0.075, 3.55, '#d6b56e', true).castShadow = false;
    for (var lane = -12; lane <= 12; lane += 6) {
      box(root, 0.07, 0.025, 10.5, lane, 0.075, 9.0, '#b6c0c7', true).castShadow = false;
      box(root, 2.1, 0.025, 0.07, lane, 0.075, 14.2, '#c9a45e', true).castShadow = false;
    }
    // ----- Loading / Unloading Area -----
    box(root, 28, 0.02, 0.7, 0, 0.07, 3.6, '#facc15').castShadow = false;
    [-12, -6, 0, 6, 12].forEach(function (x) { box(root, 0.16, 0.02, 11, x, 0.07, 9, '#ffffff').castShadow = false; });
    [[-14, 4], [14, 4]].forEach(function (p) { for (var c = 0; c < 3; c++) cyl(root, 0.12, 0.3, 0.7, p[0] + c * 0.6, 0.06, p[1] + 5 + c * 0.1, '#c49a55', 10); });
    // ----- Storage Zone (ໂຊນເກັບ — ເປີດໂຕ ເຫັນຊັ້ນວາງ) -----
    box(root, 12.4, 0.02, 12, -21, 0.07, -4, '#8799a5').castShadow = false;
    [[-27, -9.6], [-15, -9.6], [-27, 1.6], [-15, 1.6]].forEach(function (p) { box(root, 0.3, 4, 0.3, p[0], 0.06, p[1], '#475569'); });
    box(root, 13, 0.3, 12.8, -21, 4.0, -4, '#b9c4cb'); box(root, 13.1, 0.18, 0.3, -21, 3.95, 2.45, A);
    var zi = 0;
    [-8, -4.4, -0.8].forEach(function (z) {
      [-25.7, -16.3].forEach(function (x) { box(root, 0.16, 3.4, 0.16, x, 0.06, z - 0.6, '#536f80'); box(root, 0.16, 3.4, 0.16, x, 0.06, z + 0.6, '#536f80'); });
      for (var lv = 0; lv < 3; lv++) {
        var y = 0.4 + lv * 1.1; box(root, 9.6, 0.12, 0.12, -21, y, z - 0.6, '#c49a55'); box(root, 9.6, 0.12, 0.12, -21, y, z + 0.6, '#c49a55');
        for (var b = 0; b < 7; b++) { var h = hash(++zi + def.x); if (h > 0.22) box(root, 1.1, 0.8, 1.0, -24.6 + b * 1.4, y + 0.12, z, h > 0.75 ? '#60a5fa' : (h > 0.5 ? '#e0b070' : '#f1f5f9')); }
      }
    });
    var zp = plate(T, 'ZONE A-C', A, '#ffffff', 2.4, 0.8); zp.position.set(-21, 3.4, 2.6); root.add(zp);
    // ----- Inventory Area (ພື້ນທີ່ສິນຄ້າຄົງຄັງ) -----
    box(root, 12, 0.02, 15, 21, 0.07, -3, '#cbd5e1').castShadow = false;
    [[21, -10.6, 12, 0.2], [21, 4.6, 12, 0.2]].forEach(function (a) { box(root, a[2], 0.03, a[3], a[0], 0.08, a[1], '#facc15').castShadow = false; });
    var cols = ['#38bdf8', '#ef4444', '#4ade80', '#fbbf24'];
    for (i = 0; i < 6; i++) {
      var px = 17.5 + (i % 2) * 4.4, pz = -8 + Math.floor(i / 2) * 3.4, lay = 2 + (i % 3);
      box(root, 1.9, 0.18, 1.9, px, 0.08, pz, '#b9895a');
      for (var l = 0; l < lay; l++) for (var q = 0; q < 4; q++) box(root, 0.86, 0.7, 0.86, px + (q % 2 ? 0.46 : -0.46), 0.26 + l * 0.72, pz + (q > 1 ? 0.46 : -0.46), cols[(i + l) % 4]);
    }
    var coolerPicks = [];
    for (i = 0; i < 3; i++) {                                                   // Premium Beerlao glass-door cooler display · selectable
      var cx = 16.5 + i * 1.5, coolerId = 'BL-' + def.id.toUpperCase() + '-' + String(i + 1).padStart(4, '0');
      var cg = new T.Group(); cg.position.set(cx, 0.08, 1.2); root.add(cg);
      box(cg, 1.18, 2.28, 0.98, 0, 0, 0, '#dce3e8');                            // insulated cabinet
      box(cg, 1.2, 0.32, 1.02, 0, 1.94, 0, '#9b252d');                         // Beerlao red crown
      box(cg, 0.98, 1.62, 0.075, 0, 0.30, 0.52, '#243746');                    // dark door frame
      box(cg, 0.82, 1.43, 0.035, 0, 0.38, 0.57, '#9bc5d5', true);             // glass reflection panel
      box(cg, 0.045, 1.22, 0.05, 0.34, 0.47, 0.61, '#c9a45e');                // handle
      box(cg, 0.72, 0.13, 0.035, 0, 1.74, 0.61, '#e6c77e', true);             // brand strip
      for (var shelf = 0; shelf < 3; shelf++) {
        box(cg, 0.68, 0.035, 0.34, 0, 0.47 + shelf * 0.39, 0.33, '#c4d0d8');
        for (var can = 0; can < 4; can++) {
          var canX = -0.25 + can * 0.16;
          cyl(cg, 0.045, 0.045, 0.22, canX, 0.51 + shelf * 0.39, 0.28, (can % 2 ? '#e2bd70' : '#b8c7d0'), 10);
        }
      }
      box(cg, 0.72, 0.12, 0.04, 0, 2.00, 0.54, '#f0d99f', true);
      cg.userData.worldPick = { type: 'cooler', id: coolerId, warehouseId: def.id, x: cx, z: 1.2 };
      cg.traverse(function (o) { if (o.isMesh) o.userData.worldPick = cg.userData.worldPick; });
      coolerPicks.push(cg);
    }
    // Premium zone markers: transparent pick surfaces keep the existing scene geometry intact.
    var zonePicks = [];
    [
      { id: 'storage', title: 'Storage racks', x: -21, z: -4, w: 12, d: 11.5 },
      { id: 'inventory', title: 'Cooler inventory', x: 21, z: -3, w: 11.5, d: 14 },
      { id: 'receiving', title: 'Receiving & loading', x: 0, z: 9, w: 26, d: 9 }
    ].forEach(function (z) {
      var hit = new T.Mesh(new T.BoxGeometry(z.w, 0.035, z.d), new T.MeshBasicMaterial({ color: '#d6b56e', transparent: true, opacity: 0.025, depthWrite: false }));
      hit.position.set(z.x, 0.105, z.z); hit.userData.worldPick = { type: 'warehouseZone', id: def.id + ':' + z.id, warehouseId: def.id, zone: z.id, title: z.title, x: z.x, z: z.z };
      root.add(hit); zonePicks.push(hit);
    });
    // Premium storage-zone edge trims and warm aisle markers
    box(root, 12.55, 0.045, 0.08, -21, 0.09, 2.18, '#c9a45e', true).castShadow = false;
    box(root, 0.08, 0.045, 11.8, -27.0, 0.09, -4, '#c9a45e', true).castShadow = false;
    box(root, 0.08, 0.045, 11.8, -15.0, 0.09, -4, '#c9a45e', true).castShadow = false;
    box(root, 6, 2.6, 2.4, 22.5, 0.08, 1.2, tintHex(A)); for (i = 0; i < 6; i++) box(root, 0.08, 2.5, 2.5, 19.7 + i * 1.0, 0.1, 1.2, '#7c8aa0');
    // ----- ປ້ອມຍາມ + ສິ່ງແວດລ້ອມ -----
    box(root, 2.2, 2.2, 2.2, -20, 0.06, 17, '#f1f5f9'); box(root, 2.6, 0.2, 2.6, -20, 2.26, 17, A); box(root, 0.9, 0.7, 0.06, -20, 1.0, 18.12, '#7dd3fc', true);
    box(root, 4, 0.12, 0.12, -17.5, 1.0, 17, '#ef4444'); box(root, 0.3, 1.1, 0.3, -19.4, 0.06, 15.4, '#334155');
    ext.plant(root, -25, 12, 2.2); ext.plant(root, 25, 12, 2.2); ext.plant(root, 26, -10, 1.8);
    // beacon + ກອບເລືອກ + ປ້າຍ
    var beacon = sph(root, 0.55, 0, 9.0, 0, '#16a34a'); cyl(root, 0.1, 0.1, 2.2, 0, 6.8, 0, '#475569', 8);
    var frame = new T.Group(); frame.visible = false; root.add(frame);
    [[0, -13, 58.4, 0.3], [0, 23, 58.4, 0.3]].forEach(function (a) { var m = box(frame, a[2], 0.2, a[3], a[0], 0.1, a[1], A, true); });
    [[-29, 5], [29, 5]].forEach(function (a) { box(frame, 0.3, 0.2, 36.4, a[0], 0.1, a[1], A, true); });
    frame.traverse(function (o) { o.raycast = function () {}; });
    var lab = null, cur = 'operating';
    function setStatus(k) {
      cur = k; var s = ST[k]; beacon.material = ext.glow(s.color);
      if (lab) { root.remove(lab); lab.material.map.dispose(); lab.material.dispose(); }
      lab = label(T, def.short + ' · ' + def.name.split(' ')[0], s.label + ' · ' + s.lao, s.color, A, 10, 2.5); lab.position.set(0, 11.6, 2); lab.userData.worldPick = { type: 'warehouse', id: def.id }; root.add(lab);
    }
    setStatus(def.status);
    root.traverse(function (o) { if (o.isMesh) { o.userData.worldPick = { type: 'warehouse', id: def.id }; } });
    // Restore precise pick metadata after the generic warehouse-pick pass.
    coolerPicks.forEach(function (cg) { var pick = cg.userData.worldPick; cg.traverse(function (o) { if (o.isMesh) o.userData.worldPick = pick; }); });
    zonePicks.forEach(function (hit) { hit.userData.worldPick = { type: 'warehouseZone', id: def.id + ':' + hit.userData.worldPick.zone, warehouseId: def.id, zone: hit.userData.worldPick.zone, title: hit.userData.worldPick.title, x: hit.position.x, z: hit.position.z }; });
    // ----- Forklift (ແລ່ນໃນລານໂຫຼດ) -----
    var fk = new T.Group(); root.add(fk); fk.userData.worldPick = { type: 'warehouse', id: def.id };
    box(fk, 1.2, 0.7, 1.7, 0, 0.35, 0, '#fbbf24'); box(fk, 1.1, 0.12, 1.0, 0, 1.3, -0.35, '#1f2937'); box(fk, 0.08, 1.1, 0.08, -0.5, 0.75, -0.7, '#1f2937'); box(fk, 0.08, 1.1, 0.08, 0.5, 0.75, -0.7, '#1f2937');
    box(fk, 0.12, 1.9, 0.12, -0.4, 0.3, 1.0, '#374151'); box(fk, 0.12, 1.9, 0.12, 0.4, 0.3, 1.0, '#374151'); box(fk, 0.2, 0.08, 1.0, -0.3, 0.12, 1.55, '#374151'); box(fk, 0.2, 0.08, 1.0, 0.3, 0.12, 1.55, '#374151');
    sph(fk, 0.12, 0, 1.45, -0.7, '#c49a55');
    // Premium forklift details: overhead safety cage, operator seat, lamps and wheel hubs.
    box(fk, 1.35, 0.10, 1.45, 0, 2.02, -0.18, '#d5ad5d');
    box(fk, 0.10, 1.55, 0.10, -0.62, 1.22, -0.72, '#d5ad5d');
    box(fk, 0.10, 1.55, 0.10, 0.62, 1.22, -0.72, '#d5ad5d');
    box(fk, 0.82, 0.12, 0.55, 0, 0.78, -0.42, '#263746');
    box(fk, 0.72, 0.10, 0.28, 0, 0.92, -0.48, '#9b252d');
    box(fk, 0.22, 0.16, 0.08, -0.43, 0.70, 0.86, '#f5e2a8');
    box(fk, 0.22, 0.16, 0.08, 0.43, 0.70, 0.86, '#f5e2a8');
    var forkBeacon = sph(fk, 0.10, 0, 2.15, -0.55, '#e5b84f');
    [[-0.62, -0.5], [0.62, -0.5], [-0.62, 0.55], [0.62, 0.55]].forEach(function (w) {
      var m = cyl(fk, 0.28, 0.28, 0.22, w[0], 0.0, w[1], '#111827', 12); m.rotation.z = Math.PI / 2; m.position.y = 0.28;
      var hub = cyl(fk, 0.12, 0.12, 0.235, w[0] * 1.01, 0.28, w[1], '#c49a55', 12); hub.rotation.z = Math.PI / 2;
    });
    var fp = new T.Group(); fk.add(fp); box(fp, 1.3, 0.14, 1.3, 0, 0.3, 1.6, '#b9895a'); box(fp, 1.1, 0.8, 1.1, 0, 0.44, 1.6, '#38bdf8');
    var fpts = [[-2, 6.5], [14, 6.5], [14, 3.6], [-2, 3.6]], fi = 0, fwait = 0, fpos = fk.position; fpos.set(-2, 0, 6.5);
    function update(dt, t) {
      beacon.scale.setScalar(1 + Math.sin(t * 3 + def.x) * 0.12);
      forkBeacon.scale.setScalar(0.82 + Math.abs(Math.sin(t * 5)) * 0.35);
      if (fwait > 0) { fwait -= dt; return; }
      var tg = fpts[(fi + 1) % 4], dx = tg[0] - fpos.x, dz = tg[1] - fpos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { fi = (fi + 1) % 4; fwait = 1.4; fp.visible = !fp.visible; return; }
      fpos.x += dx / d * dt * 4; fpos.z += dz / d * dt * 4;
      var ang = Math.atan2(dx, dz), da = ((ang - fk.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; fk.rotation.y += da * Math.min(1, dt * 8);
    }
    return {
      root: root, def: def, status: function () { return cur; },
      bayPos: function (i) { return [def.x + DOCK_X[i], def.z + BAY_Z]; },
      approachPos: function (i) { return [def.x + DOCK_X[i], def.z + YARD_Z]; },
      setStatus: setStatus, setSelected: function (on) { frame.visible = !!on; }, update: update,
      coolerPicks: coolerPicks, zonePicks: zonePicks
    };
  }
  function tintHex(h) { return h; }
  VOX.Warehouse = { create: create, YARD_Z: YARD_Z, BAY_Z: BAY_Z, DOCK_X: DOCK_X };
})();
