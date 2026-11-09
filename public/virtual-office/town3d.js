/* Virtual Company 3D — Phase 4 · Component: Shop Town (ເມືອງຮ້ານຄ້າ 1 ຈຸດ + ລົດວິ່ງເຂົ້າໄປແລ້ວຫາຍຕົວ)
   VOX.Town.create(ext, SD) → { shops, stats(), select(id), clearSelection(), update }
   - ເມືອງຕັ້ງຢູ່ທິດໃຕ້-ຕາເວັນຕົກຂອງຫ້ອງການ ຕໍ່ຖະໜົນແຍກ (spur) ຈາກທາງຫຼວງສາຍຫຼັກ x=30
   - ລົດ (sedan/hatch/suv/pickup/van/tuk-tuk) ເກີດທີ່ປາຍທາງຫຼວງ → ແລ່ນເລນຂວາ → ເຂົ້າເມືອງ → ຂັບເຂົ້າປະຕູຕຶກ (ຕະຫຼາດ/ສູນບໍລິການ/ຕຶກຈອດ) → ຫາຍຕົວ → ເກີດໃໝ່
   - ພິກັດ: ຈຸດເລີ່ມເມືອງ (world) = (TX, TZ) · ຖະໜົນຫຼັກຂອງເມືອງ z = TZ · ເລນລົດ (ຂວາ) z = TZ-1.5 */
(function () {
  'use strict';
  var VOX = window.VOX = window.VOX || {};
  var TX = -15, TZ = 54, LANE = TZ - 1.5, RAD = 4.5;

  // ---------- Layout ຂອງຕຶກ (ພິກັດ local ຂອງເມືອງ) ----------
  // row n = ແຖວເໜືອ (ຫນ້າຫັນ +z ມາຫາຖະໜົນ) · row s = ແຖວໃຕ້ (ຕຶກຕ່ຳ ເພື່ອບໍ່ບັງຖະໜົນຈາກມຸມກ້ອງ ແລະ ມີປ້າຍເທິງຫຼັງຄາ)
  var LAYOUT = {
    'sh-mart':    { row: 'n', x: 21,    w: 6,   h: 5.4, wall: '#fff1d6', awn: '#ef4444', sign: 'MINI MART' },
    'sh-cafe':    { row: 'n', x: 14.5,  w: 6,   h: 5.7, wall: '#f1e4d3', awn: '#92400e', sign: 'CAFE' },
    'sh-bakery':  { row: 'n', x: 4.5,   w: 7,   h: 5.2, wall: '#fde8e8', awn: '#f59e0b', sign: 'BAKERY' },
    'sh-pharma':  { row: 'n', x: -6.5,  w: 6.6, h: 5.8, wall: '#e8f5ee', awn: '#16a34a', sign: 'PHARMACY' },
    'sh-fashion': { row: 'n', x: -13.5, w: 7,   h: 5.4, wall: '#f5e8f3', awn: '#db2777', sign: 'FASHION' },
    'sh-elec':    { row: 's', x: 21,    w: 7,   h: 3.8, wall: '#e0ecff', awn: '#2563eb', sign: 'ELECTRONICS' },
    'sh-flower':  { row: 's', x: 13.5,  w: 7,   h: 3.6, wall: '#eafbe7', awn: '#22c55e', sign: 'FLOWERS' },
    'sh-phone':   { row: 's', x: 6,     w: 7,   h: 3.9, wall: '#ede9fe', awn: '#7c3aed', sign: 'PHONE SHOP' },
    'sh-resto':   { row: 's', x: -1.5,  w: 7,   h: 4.0, wall: '#ffe9d6', awn: '#ea580c', sign: 'RESTAURANT' },
    'sh-noodle':  { row: 's', x: -9,    w: 7,   h: 3.7, wall: '#fff7d6', awn: '#ca8a04', sign: 'NOODLE SHOP' },
    'sh-books':   { row: 's', x: -16.5, w: 7,   h: 3.8, wall: '#e6f0f5', awn: '#0891b2', sign: 'BOOKS & GIFTS' },
    // ຈຸດໝາຍປາຍທາງ (ລົດຂັບເຂົ້າປະຕູແລ້ວຫາຍ) — door = ພິກັດ local ຂອງປະຕູ (x ຫຼື z ຕາມດ້ານໜ້າ)
    'sh-market':  { dest: true, x: -1,    z: -18, w: 12, d: 7,  rot: 0,            h: 5.8, wall: '#dbeafe', accent: '#0ea5e9', sign: 'FRESH MARKET', doorAt: -1 },
    'sh-auto':    { dest: true, x: 9.75,  z: -18, w: 8,  d: 7,  rot: 0,            h: 5.4, wall: '#fee2e2', accent: '#ef4444', sign: 'AUTO SERVICE', doorAt: 9.75 },
    'sh-parking': { dest: true, x: -22.5, z: 0,   w: 10, d: 7,  rot: Math.PI / 2,  h: 5.6, wall: '#e2e8f0', accent: '#2563eb', sign: 'PARKING',      doorAt: -1.5 }
  };
  var ROW_Z = { n: -10, s: 10 }, ROW_D = 9;

  // ---------- ເສັ້ນທາງລົດ (world) ----------
  // ເລນຂວາ: ທາງຫຼວງ x=30 ຂ້າງລົງໃຕ້ = x 27.9 · ຂ້າງຂຶ້ນເໜືອ = x 32.1 · ເລນເຂົ້າເມືອງ (ມຸ່ງຕາເວັນຕົກ) z = LANE
  var ENTRY = {
    N: { w: 0.4, pts: [[27.9, -36], [27.9, LANE]] },                       // ຈາກປາຍເໜືອ ລົງໃຕ້
    C: { w: 0.3, pts: [[96, 9.9], [27.9, 9.9], [27.9, LANE]] },            // ຈາກຝັ່ງ Central DC
    S: { w: 0.3, pts: [[96, 65.9], [32.1, 65.9], [32.1, LANE]] }           // ຈາກຝັ່ງ South Hub ຂຶ້ນເໜືອ
  };
  var TAIL = {   // ປາຍທາງ: ຈຸດສຸດທ້າຍຢູ່ເລິກເຂົ້າໄປໃນຕຶກ (ຕົວລົດຖືກຝາຕຶກບັງ ກ່ອນຫາຍ)
    'sh-parking': { w: 0.4,  pts: [[TX - 22.4, LANE]] },
    'sh-market':  { w: 0.3,  pts: [[TX - 1, LANE], [TX - 1, TZ - 14.5 - 3.4]] },
    'sh-auto':    { w: 0.3,  pts: [[TX + 9.75, LANE], [TX + 9.75, TZ - 14.5 - 3.4]] }
  };

  function smooth(pts, R) {      // ມຸມມົນ (quadratic bezier)
    var out = [pts[0]], n = pts.length, i, s;
    for (i = 1; i < n - 1; i++) {
      var P = pts[i], A = pts[i - 1], B = pts[i + 1];
      var la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]), r = Math.min(R, la / 2, lb / 2);
      if (r < 0.3) { out.push(P); continue; }
      var p1 = [P[0] + (A[0] - P[0]) / la * r, P[1] + (A[1] - P[1]) / la * r], p2 = [P[0] + (B[0] - P[0]) / lb * r, P[1] + (B[1] - P[1]) / lb * r];
      for (s = 0; s <= 8; s++) { var t = s / 8, u = 1 - t; out.push([u * u * p1[0] + 2 * u * t * P[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * P[1] + t * t * p2[1]]); }
    }
    out.push(pts[n - 1]);
    var cum = [0]; for (i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { p: out, cum: cum, len: cum[cum.length - 1] };
  }
  function sample(path, s) {
    var c = path.cum, i = 1; s = Math.max(0, Math.min(path.len, s));
    while (i < c.length - 1 && c[i] < s) i++;
    var a = path.p[i - 1], b = path.p[i], seg = (c[i] - c[i - 1]) || 1, t = (s - c[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
  }
  function lerpA(a, b, k) { var d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function pickW(items) { var r = Math.random(), a = 0; for (var i = 0; i < items.length; i++) { a += items[i].w; if (r <= a) return items[i]; } return items[items.length - 1]; }

  function create(ext, SD) {
    var T = ext.THREE, box = ext.box, cyl = ext.cyl, sph = ext.sph;
    var root = new T.Group(); root.position.set(TX, 0, TZ); ext.scene.add(root);
    root.userData.worldPick = { type: 'shop', id: 'town' };
    var wg = new T.Group(); ext.scene.add(wg);          // ສ່ວນທີ່ຢູ່ນອກເມືອງ (ຖະໜົນແຍກ)
    var shopById = {}; SD.shops.forEach(function (s) { shopById[s.id] = s; });
    var frames = {}, visits = {}, arrived = 0;
    var ASPHALT = '#4b5563';

    // ================= ພື້ນ + ຖະໜົນ =================
    box(root, 54, 0.5, 48, 0, -1.1, 0, '#c9d3e0').castShadow = false;
    box(root, 52, 0.6, 46, 0, -0.6, 0, '#e4eddc').castShadow = false;
    function asphalt(w, d, x, z) { var m = box(root, w, 0.06, d, x, 0.06, z, ASPHALT); m.castShadow = false; return m; }
    asphalt(46, 6, 3, 0);                                   // ຖະໜົນຫຼັກ x -20 → 26
    asphalt(3.6, 12, -1, -9);                               // ເລນເຂົ້າຕະຫຼາດ
    asphalt(3.6, 12, 9.75, -9);                             // ເລນເຂົ້າສູນບໍລິການ
    // ເສັ້ນກາງ + ຂອບ
    for (var k = 0; k < 11; k++) { var d0 = box(root, 2.2, 0.04, 0.22, 22 - k * 4, 0.12, 0, '#facc15'); d0.castShadow = false; }
    [-2.85, 2.85].forEach(function (z) { var e = box(root, 45, 0.04, 0.2, 3, 0.12, z, '#e5e7eb'); e.castShadow = false; });
    for (k = 0; k < 6; k++) { var cw = box(root, 2.4, 0.04, 0.5, 21.5, 0.12, -2.5 + k, '#f8fafc'); cw.castShadow = false; }   // ທາງມ້າລາຍ
    // ທາງຍ່າງ (ຕັດຊ່ອງເລນ)
    function walk(x0, x1, z) { var m = box(root, x1 - x0, 0.16, 2, (x0 + x1) / 2, 0, z, '#f1f5f9'); m.castShadow = false; }
    walk(-19, -2.8, -4); walk(0.8, 7.95, -4); walk(11.55, 25, -4);     // ເໜືອ (ຕັດຊ່ອງເລນ -2.8..0.8 · 7.95..11.55)
    walk(-19, 25, 4);                                                  // ໃຕ້
    // ຮອຍຕໍ່ຖະໜົນແຍກ (world) ຈາກທາງຫຼວງ x=30 ຫາປະຕູເມືອງ + ແຜ່ນປິດເສັ້ນຂອບທາງຫຼວງ
    (function () {
      var m = box(wg, 17, 0.06, 6, 19.5, 0.06, TZ, ASPHALT); m.castShadow = false;                            // x 11 → 28
      [-2.85, 2.85].forEach(function (z) { var e = box(wg, 17, 0.04, 0.2, 19.5, 0.12, TZ + z, '#e5e7eb'); e.castShadow = false; });
      for (var i = 0; i < 4; i++) { var dd = box(wg, 2.2, 0.04, 0.22, 25 - i * 4, 0.12, TZ, '#facc15'); dd.castShadow = false; }
      var p = box(wg, 6.2, 0.1, 6, 30, 0.06, TZ, ASPHALT); p.castShadow = false;                               // ປິດເສັ້ນຂອບທາງຫຼວງຕອນຕັດກັນ
      var cp = box(wg, 0.25, 0.04, 6, 30, 0.16, TZ, ASPHALT); cp.castShadow = false;
    })();

    // ================= ເຄື່ອງປະກອບສາກ =================
    function tree(x, z, s) {
      s = s || 1;
      cyl(root, 0.18 * s, 0.24 * s, 1.3 * s, x, 0, z, '#8b5a2b', 8);
      sph(root, 1.25 * s, x, 2.0 * s, z, '#4f9d55'); sph(root, 0.9 * s, x + 0.55 * s, 2.75 * s, z - 0.2 * s, '#5fb067'); sph(root, 0.75 * s, x - 0.5 * s, 2.5 * s, z + 0.35 * s, '#3f8a49');
    }
    function lamp(x, z) {
      cyl(root, 0.07, 0.1, 3.4, x, 0, z, '#475569', 8); box(root, 0.55, 0.22, 0.55, x, 3.4, z, '#fde68a', true); box(root, 0.7, 0.08, 0.7, x, 3.62, z, '#475569');
    }
    [22, 14, 6, -6, -12, -17].forEach(function (x) { lamp(x, -3.6); });
    [22, 14, 6, -2, -10, -16].forEach(function (x) { lamp(x, 3.6); });
    // ສວນດ້ານຫຼັງ + ສະນ້ຳ
    var ti = 0;
    for (var tx = -24; tx <= 24; tx += 4.4) {
      if (tx < -9 || tx > 16) tree(tx, -20, 0.9 + hash(++ti) * 0.35);                     // ຫຼັງແຖວເໜືອ (ຫຼີກຕຶກຕະຫຼາດ/ສູນບໍລິການ)
      if (tx < -9 || tx > 17) tree(tx, 21, 0.9 + hash(++ti) * 0.35);
    }
    var pond = box(root, 14, 0.04, 6, 0, 0.0, 18.5, '#7dd3fc'); pond.castShadow = false; box(root, 14.8, 0.12, 0.4, 0, 0, 15.3, '#cbd5e1'); box(root, 14.8, 0.12, 0.4, 0, 0, 21.7, '#cbd5e1');
    box(root, 0.4, 0.12, 6.4, -7.2, 0, 18.5, '#cbd5e1'); box(root, 0.4, 0.12, 6.4, 7.2, 0, 18.5, '#cbd5e1');
    [-4, 0, 4].forEach(function (x) { box(root, 1.6, 0.45, 0.6, x, 0.15, 14.2, '#a16207'); });   // ມ້ານັ່ງ
    // ຕະຫຼາດນັດ (ຮົ່ມ) ທາງຕາເວັນຕົກຫຼັງເໜືອ
    [[-22, -12], [-22, -8], [-22.5, -17]].forEach(function (p, i) { cyl(root, 0.06, 0.06, 2.1, p[0], 0, p[1], '#64748b', 6); cyl(root, 0.1, 1.4, 0.7, p[0], 2.1, p[1], ['#ef4444', '#facc15', '#38bdf8'][i], 10); });

    // ================= ປ້າຍ (canvas) =================
    var signCache = {};
    function signMat(text, bg, fg) {
      var key = text + '|' + bg; if (signCache[key]) return signCache[key];
      var c = document.createElement('canvas'); c.width = 512; c.height = 128; var g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, 512, 128); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
      var fs = 68; g.font = '800 ' + fs + 'px "Noto Sans",Arial,sans-serif';
      while (g.measureText(text).width > 456 && fs > 24) { fs -= 4; g.font = '800 ' + fs + 'px "Noto Sans",Arial,sans-serif'; }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
      var m = new T.MeshBasicMaterial({ map: new T.CanvasTexture(c) }); signCache[key] = m; return m;
    }
    function signPlane(parent, text, bg, w, h, x, y, z, ry) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), signMat(text, bg, '#ffffff')); m.position.set(x, y, z); if (ry) m.rotation.y = ry; parent.add(m); return m;
    }

    // ================= ຕຶກ =================
    function doorLocalX(L) {            // ປ່ຽນຕຳແໜ່ງປະຕູ (local ເມືອງ) → ແກນ x ຂອງຕຶກທີ່ໝຸນແລ້ວ
      if (!L.dest) return null;
      if (L.rot === 0) return L.doorAt - L.x;
      if (L.rot === Math.PI) return -(L.doorAt - L.x);
      return -(L.doorAt - L.z);          // rot = π/2: x ຂອງຕຶກ → -z ຂອງເມືອງ
    }
    function building(id, L) {
      var g = new T.Group(), w = L.w, d = L.d || ROW_D, h = L.h, fz = d / 2, rot = L.rot, x = L.x, z = L.z;
      if (!L.dest) { z = ROW_Z[L.row]; rot = L.row === 'n' ? 0 : Math.PI; }
      g.position.set(x, 0, z); g.rotation.y = rot; root.add(g); g.userData.worldPick = { type: 'shop', id: id };
      var acc = L.dest ? L.accent : L.awn;
      box(g, w, h, d, 0, 0, 0, L.wall);
      box(g, w + 0.2, 0.55, d + 0.2, 0, 0, 0, '#64748b');                          // ຖານ
      box(g, w + 0.45, 0.3, d + 0.45, 0, h, 0, '#94a3b8');                         // ຂອບຫຼັງຄາ
      box(g, w - 0.8, 0.18, d - 0.8, 0, h + 0.3, 0, '#cbd5e1');
      box(g, 1.4, 0.8, 1.0, w * 0.25, h + 0.48, -d * 0.2, '#e5e7eb'); cyl(g, 0.4, 0.4, 0.1, w * 0.25, h + 1.28, -d * 0.2, '#475569', 12);   // AC ເທິງຫຼັງຄາ
      box(g, 0.35, h, 0.22, -w / 2 + 0.05, 0, fz + 0.02, '#e2e8f0'); box(g, 0.35, h, 0.22, w / 2 - 0.05, 0, fz + 0.02, '#e2e8f0');            // ເສົາຂ້າງ
      if (!L.dest) {
        var dx = -w * 0.22, low = h < 4.5, awY = low ? 2.45 : 3.05, sgY = low ? 2.65 : 3.55, sgH = low ? 0.85 : 1.1, dH = low ? 2.25 : 2.5, wH = low ? 1.45 : 1.7;
        box(g, 1.6, dH, 0.14, dx, 0, fz + 0.04, '#1e3a8a'); box(g, 1.15, dH - 0.55, 0.16, dx, 0.12, fz + 0.06, '#9ad0f5');                   // ປະຕູ
        box(g, w * 0.4, wH, 0.14, w * 0.2, 0.6, fz + 0.04, '#9ad0f5'); box(g, w * 0.4 + 0.3, 0.14, 0.2, w * 0.2, 0.46, fz + 0.06, '#64748b'); // ປ່ອງຢ້ຽມ
        var aw = new T.Group(); aw.position.set(0, awY, fz + 0.9); aw.rotation.x = 0.28; g.add(aw);                                       // ຫຼັງຄາຜ້າໃບ
        var n = 6, sw = (w - 0.4) / n; for (var i = 0; i < n; i++) box(aw, sw, 0.14, 2.0, -((w - 0.4) / 2) + sw * (i + 0.5), 0, 0, i % 2 ? '#ffffff' : L.awn);
        box(g, w - 1, sgH, 0.1, 0, sgY, fz + 0.02, L.awn);
        signPlane(g, L.sign, L.awn, w - 1.15, sgH - 0.15, 0, sgY + sgH / 2, fz + 0.09);
        ext.plant(g, w / 2 - 0.9, fz + 1.0, 1.2); ext.plant(g, -w / 2 + 0.6, fz + 1.0, 1.0);
        if (L.row === 's') {   // ຕຶກແຖວໃຕ້ຫັນໜ້າໜີກ້ອງ → ເພີ່ມປ້າຍເທິງຫຼັງຄາ ໃຫ້ເຫັນຈາກມຸມເລີ່ມຕົ້ນ
          box(g, w - 1.2, 1.15, 0.12, 0, h + 0.95, -fz + 0.4, L.awn); signPlane(g, L.sign, L.awn, w - 1.4, 1.0, 0, h + 1.52, -fz + 0.47, Math.PI);
          box(g, 0.12, 0.7, 0.12, -(w - 2) / 2, h + 0.3, -fz + 0.4, '#64748b'); box(g, 0.12, 0.7, 0.12, (w - 2) / 2, h + 0.3, -fz + 0.4, '#64748b');
        }
      } else {               // ຕຶກຈຸດໝາຍ: ປະຕູໃຫຍ່ເປີດໂລ່ງ ໃຫ້ລົດຂັບເຂົ້າ
        var dl = doorLocalX(L), dw = 4.2;
        box(g, dw + 0.7, 3.9, 0.16, dl, 0, fz + 0.03, '#facc15');                  // ກອບ
        box(g, dw, 3.4, 0.22, dl, 0, fz + 0.08, '#0b1220');                         // ຊ່ອງມືດ
        box(g, dw + 0.7, 0.35, 0.2, dl, 3.9, fz + 0.04, '#111827');
        for (var s = 0; s < 6; s++) box(g, 0.45, 0.35, 0.22, dl - dw / 2 - 0.2 + s * ((dw + 0.4) / 5), 3.9, fz + 0.05, s % 2 ? '#facc15' : '#111827');   // ລາຍເຕືອນ
        box(g, 0.3, 0.3, 0.12, dl - dw / 2 - 0.7, 3.0, fz + 0.1, '#22c55e', true); box(g, 0.3, 0.3, 0.12, dl + dw / 2 + 0.7, 3.0, fz + 0.1, '#22c55e', true);
        box(g, w - 1.6, 1.15, 0.12, 0, h - 1.45, fz + 0.03, acc); signPlane(g, L.sign, acc, w - 1.8, 1.0, 0, h - 1.38, fz + 0.1);
        box(g, w - 0.6, 0.12, 0.7, 0, 0.0, fz + 0.4, '#facc15').castShadow = false;
      }
      var fr = new T.Group(); fr.visible = false; g.add(fr); frames[id] = fr;                   // ກອບເລືອກ (ຟ້າ)
      var fw = w + 1.6, fd = d + 1.6;
      box(fr, fw, 0.06, 0.3, 0, 0.2, fd / 2, '#2563eb', true); box(fr, fw, 0.06, 0.3, 0, 0.2, -fd / 2, '#2563eb', true);
      box(fr, 0.3, 0.06, fd, fw / 2, 0.2, 0, '#2563eb', true); box(fr, 0.3, 0.06, fd, -fw / 2, 0.2, 0, '#2563eb', true);
      return g;
    }
    SD.shops.forEach(function (s) { if (LAYOUT[s.id]) building(s.id, LAYOUT[s.id]); visits[s.id] = 0; });

    // ================= ປະຕູເມືອງ + ປ້າຍລອຍ =================
    [-4.4, 4.4].forEach(function (z) { box(root, 0.9, 6.6, 0.9, 25.3, 0, z, '#1e3a8a'); box(root, 1.3, 0.5, 1.3, 25.3, 0, z, '#64748b'); });
    box(root, 1.3, 1.5, 10.4, 25.3, 6.0, 0, '#2563eb'); box(root, 1.4, 0.3, 10.6, 25.3, 7.5, 0, '#facc15');
    var lab = null, labKey = '';
    function setLabel(sub) {
      if (sub === labKey || !VOX.label) return; labKey = sub;
      if (lab) { root.remove(lab); lab.material.map.dispose(); lab.material.dispose(); }
      lab = VOX.label(T, SD.town.name, sub, '#16a34a', '#2563eb', 9, 2.25); lab.position.set(25.3, 10.6, 0); lab.userData.worldPick = { type: 'shop', id: 'town' }; root.add(lab);
    }

    // ================= ລົດ =================
    function wheel(g, x, z, r) {
      var t = cyl(g, r, r, 0.28, x, 0, z, '#111827', 14); t.rotation.z = Math.PI / 2; t.position.y = r;
      var h = cyl(g, r * 0.5, r * 0.5, 0.32, x + (x > 0 ? 0.02 : -0.02), 0, z, '#cbd5e1', 10); h.rotation.z = Math.PI / 2; h.position.y = r;
    }
    function lights(g, hw, zf, zr, y) {
      box(g, 0.34, 0.18, 0.08, -hw, y, zf, '#fde68a', true); box(g, 0.34, 0.18, 0.08, hw, y, zf, '#fde68a', true);
      box(g, 0.34, 0.16, 0.08, -hw, y, zr, '#ef4444', true); box(g, 0.34, 0.16, 0.08, hw, y, zr, '#ef4444', true);
    }
    var GLASS = '#9ad0f5';
    function makeCar(kind, c) {
      var root0 = new T.Group(), g = new T.Group(), L = 4.2; root0.add(g);
      if (kind === 'sedan') {
        L = 4.2;
        box(g, 1.8, 0.62, 4.2, 0, 0.32, 0, c); box(g, 1.62, 0.5, 2.2, 0, 0.94, -0.25, GLASS); box(g, 1.56, 0.1, 1.9, 0, 1.44, -0.25, c);
        [[-0.8, 0.85], [0.8, 0.85], [-0.8, -1.35], [0.8, -1.35]].forEach(function (p) { box(g, 0.1, 0.5, 0.1, p[0], 0.94, p[1], c); });
        wheel(g, -0.92, 1.35, 0.36); wheel(g, 0.92, 1.35, 0.36); wheel(g, -0.92, -1.35, 0.36); wheel(g, 0.92, -1.35, 0.36); lights(g, 0.62, 2.1, -2.1, 0.62);
      } else if (kind === 'hatch') {
        L = 3.7;
        box(g, 1.76, 0.62, 3.7, 0, 0.32, 0, c); box(g, 1.6, 0.58, 2.5, 0, 0.94, -0.35, GLASS); box(g, 1.54, 0.1, 2.3, 0, 1.5, -0.35, c);
        [[-0.78, 0.9], [0.78, 0.9], [-0.78, -1.55], [0.78, -1.55]].forEach(function (p) { box(g, 0.1, 0.58, 0.1, p[0], 0.94, p[1], c); });
        wheel(g, -0.9, 1.2, 0.34); wheel(g, 0.9, 1.2, 0.34); wheel(g, -0.9, -1.2, 0.34); wheel(g, 0.9, -1.2, 0.34); lights(g, 0.6, 1.86, -1.86, 0.62);
      } else if (kind === 'suv') {
        L = 4.5;
        box(g, 1.9, 0.78, 4.5, 0, 0.4, 0, c); box(g, 1.76, 0.6, 3.0, 0, 1.08, -0.35, GLASS); box(g, 1.7, 0.1, 2.8, 0, 1.68, -0.35, '#1f2937');
        [[-0.86, 1.1], [0.86, 1.1], [-0.86, -1.85], [0.86, -1.85]].forEach(function (p) { box(g, 0.1, 0.6, 0.1, p[0], 1.08, p[1], c); });
        wheel(g, -0.98, 1.45, 0.42); wheel(g, 0.98, 1.45, 0.42); wheel(g, -0.98, -1.45, 0.42); wheel(g, 0.98, -1.45, 0.42); lights(g, 0.66, 2.26, -2.26, 0.78);
      } else if (kind === 'pickup') {
        L = 4.9;
        box(g, 1.9, 0.58, 4.9, 0, 0.34, 0, c); box(g, 1.72, 0.55, 1.5, 0, 0.92, 0.75, GLASS); box(g, 1.68, 0.1, 1.4, 0, 1.47, 0.75, c);
        box(g, 0.1, 0.5, 2.1, -0.9, 0.92, -1.45, c); box(g, 0.1, 0.5, 2.1, 0.9, 0.92, -1.45, c); box(g, 1.9, 0.5, 0.1, 0, 0.92, -2.45, c); box(g, 1.9, 0.5, 0.1, 0, 0.92, -0.4, c);
        box(g, 0.9, 0.7, 0.9, -0.35, 0.92, -1.5, '#e0b070'); box(g, 0.8, 0.5, 0.8, 0.45, 0.92, -1.2, '#d97706');
        wheel(g, -0.98, 1.55, 0.42); wheel(g, 0.98, 1.55, 0.42); wheel(g, -0.98, -1.5, 0.42); wheel(g, 0.98, -1.5, 0.42); lights(g, 0.66, 2.46, -2.46, 0.66);
      } else if (kind === 'van') {
        L = 4.5;
        box(g, 1.9, 1.35, 4.5, 0, 0.36, 0, '#f8fafc'); box(g, 1.94, 0.34, 4.5, 0, 0.9, 0, c); box(g, 1.7, 0.55, 0.08, 0, 1.15, 2.24, GLASS);
        box(g, 0.06, 0.45, 1.3, -0.96, 1.2, 1.0, GLASS); box(g, 0.06, 0.45, 1.3, 0.96, 1.2, 1.0, GLASS);
        wheel(g, -0.98, 1.4, 0.4); wheel(g, 0.98, 1.4, 0.4); wheel(g, -0.98, -1.4, 0.4); wheel(g, 0.98, -1.4, 0.4); lights(g, 0.66, 2.26, -2.26, 0.62);
      } else {   // tuk-tuk (ຈຳໂບ້)
        L = 3.0;
        box(g, 1.35, 0.5, 2.7, 0, 0.36, -0.1, c); box(g, 1.1, 0.3, 0.8, 0, 0.84, -0.8, '#7c2d12');
        [[-0.62, 0.5], [0.62, 0.5], [-0.62, -1.25], [0.62, -1.25]].forEach(function (p) { box(g, 0.07, 1.25, 0.07, p[0], 0.86, p[1], '#64748b'); });
        box(g, 1.55, 0.1, 2.1, 0, 2.1, -0.4, c === '#facc15' ? '#ef4444' : '#facc15'); box(g, 1.2, 0.5, 0.08, 0, 0.86, 1.2, GLASS);
        wheel(g, 0, 1.2, 0.32); wheel(g, -0.72, -1.0, 0.34); wheel(g, 0.72, -1.0, 0.34); box(g, 0.3, 0.18, 0.08, 0, 0.6, 1.3, '#fde68a', true); box(g, 0.3, 0.16, 0.08, 0, 0.6, -1.46, '#ef4444', true);
      }
      return { root: root0, L: L };
    }
    var KINDS = ['sedan', 'hatch', 'suv', 'pickup', 'van', 'tuk', 'sedan', 'hatch', 'suv', 'tuk'];
    var COLORS = ['#ef4444', '#2563eb', '#f8fafc', '#facc15', '#16a34a', '#7c3aed', '#0ea5e9', '#f97316', '#334155', '#d1d5db'];
    var cg = new T.Group(); ext.scene.add(cg);
    var cars = [];
    for (var ci = 0; ci < KINDS.length; ci++) {
      var cm = makeCar(KINDS[ci], COLORS[(ci * 3 + 1) % COLORS.length]);
      cm.root.visible = false; cg.add(cm.root);
      cars.push({ view: cm.root, L: cm.L, active: false, s: 0, v: 0, rot: 0, sc: 1, cool: ci * 0.8, x: 0, z: 0, hx: 0, hz: 1, path: null, dest: '', maxV: 0 });
    }
    // ສ້າງ path ທັງໝົດ (entry × dest)
    var PATHS = {}, ENTRY_KEYS = ['N', 'C', 'S'], DEST_KEYS = ['sh-parking', 'sh-market', 'sh-auto'];
    // ຈຸດຕັດທີ່ລົດຕ້ອງຢັບຢັ້ງກັນ (ລົດທີ່ໃກ້ຈຸດຕັດກວ່າ/ຢູ່ໃນຈຸດຕັດກ່ອນ ໄປກ່ອນ): [x0, x1, z0, z1]
    var ZONES = [[23, 37, 48.5, 56.5],     // ລ້ຽວເຂົ້າເມືອງທີ່ທາງຫຼວງ x=30
                 [22, 34, 5.5, 14.5]];     // ລົດຈາກ Central DC ລ້ຽວເຂົ້າທາງຫຼວງທີ່ z=12
    function zoneRange(path) {   // ຊ່ວງ s ທີ່ path ຜ່ານແຕ່ລະຈຸດຕັດ
      path.z = ZONES.map(function (Z) {
        var a = -1, b = -1; for (var s0 = 0; s0 <= path.len; s0 += 0.25) { var q = sample(path, s0), inz = q.x > Z[0] && q.x < Z[1] && q.z > Z[2] && q.z < Z[3]; if (inz && a < 0) a = s0; if (inz) b = s0; }
        return a < 0 ? null : { a: a, b: b };
      });
    }
    ENTRY_KEYS.forEach(function (e) { DEST_KEYS.forEach(function (d) { PATHS[e + d] = smooth(ENTRY[e].pts.concat(TAIL[d].pts), RAD); zoneRange(PATHS[e + d]); }); });

    function nearSpawn(p) { for (var i = 0; i < cars.length; i++) { var c = cars[i]; if (c.active && Math.hypot(c.x - p[0], c.z - p[1]) < 8) return true; } return false; }
    function spawn() {
      if (window.VO_ASSETS && window.VO_ASSETS.config && window.VO_ASSETS.config.ambientTraffic === false) return;   // Phase 5: ມີແຕ່ລົດສົ່ງ Asset ຄັນດຽວ
      var free = cars.filter(function (c) { return !c.active && c.cool <= 0; });
      if (!free.length || cars.filter(function (c) { return c.active; }).length >= SD.town.maxCars) return;
      var ek = pickW(ENTRY_KEYS.map(function (k) { return { k: k, w: ENTRY[k].w }; })).k;
      if (nearSpawn(ENTRY[ek].pts[0])) return;
      var dk = pickW(DEST_KEYS.map(function (k) { return { k: k, w: TAIL[k].w }; })).k;
      var c = free[Math.floor(Math.random() * free.length)];
      c.path = PATHS[ek + dk]; c.dest = dk; c.s = 0; c.v = 0; c.maxV = 11 + Math.random() * 5; c.sc = 0.05; c.active = true;
      var sp = sample(c.path, 0); c.x = sp.x; c.z = sp.z; c.hx = sp.dx; c.hz = sp.dz; c.rot = Math.atan2(sp.dx, sp.dz);
      c.view.position.set(c.x, 0, c.z); c.view.rotation.y = c.rot; c.view.scale.setScalar(c.sc); c.view.visible = true;
    }
    var spawnT = 0.5;
    function step(dt) {
      spawnT -= dt; if (spawnT <= 0) { spawn(); spawnT = 1.8 + Math.random() * 2.6; }
      for (var i = 0; i < cars.length; i++) {
        var c = cars[i];
        if (!c.active) { if (c.cool > 0) c.cool -= dt; continue; }
        var sp = sample(c.path, c.s); c.hx = sp.dx; c.hz = sp.dz;
        var f = 1;                                                // ຂັບຕາມຫຼັງລົດຄັນໜ້າ (ຫ່າງ ≥ ~5 ຫົວໜ່ວຍ)
        for (var j = 0; j < cars.length; j++) {
          var o = cars[j]; if (o === c || !o.active) continue;
          var rx = o.x - c.x, rz = o.z - c.z, fwd = rx * c.hx + rz * c.hz;
          if (fwd > 0 && fwd < 10 && Math.abs(-rx * c.hz + rz * c.hx) < 2.3 && (o.hx * c.hx + o.hz * c.hz) > 0.3) f = Math.min(f, Math.max(0, (fwd - 5) / 4.5));
        }
        for (var zi = 0; zi < ZONES.length && f > 0; zi++) {   // ຢັບຢັ້ງກັນທີ່ຈຸດຕັດ ບໍ່ໃຫ້ຊົນກັນຕອນລ້ຽວ/ເຂົ້າທາງຫຼວງ
          var zc = c.path.z[zi]; if (!zc) continue;
          var rem = zc.a - c.s; if (!(rem > 0 && rem < 14)) continue;
          for (var m = 0; m < cars.length; m++) {
            var q = cars[m]; if (q === c || !q.active || !q.path.z[zi] || (q.hx * c.hx + q.hz * c.hz) > 0.3) continue;
            var zq = q.path.z[zi], qrem = zq.a - q.s;
            if ((q.s >= zq.a && q.s <= zq.b) || (qrem > 0 && qrem < 14 && (qrem < rem || (qrem === rem && m < i)))) { f = 0; break; }
          }
        }
        var inTown = sp.x < 14, left = c.path.len - c.s;
        var target = c.maxV * f * (inTown ? 0.62 : 1) * (left < 9 ? 0.7 : 1);
        c.v += (target - c.v) * Math.min(1, dt * 3.5);
        c.s += c.v * dt;
        var np = sample(c.path, c.s); c.x = np.x; c.z = np.z;
        c.rot = lerpA(c.rot, Math.atan2(np.dx, np.dz), Math.min(1, dt * 6));
        c.view.position.set(c.x, 0, c.z); c.view.rotation.y = c.rot;
        if (c.sc < 1) { c.sc = Math.min(1, c.sc + dt * 2.4); c.view.scale.setScalar(c.sc); }
        if (c.s >= c.path.len - 0.02) {                           // ເຂົ້າໄປໃນຕຶກແລ້ວ → ຫາຍຕົວ
          c.active = false; c.view.visible = false; c.cool = 1.5 + Math.random() * 2.5; arrived++; visits[c.dest] = (visits[c.dest] || 0) + 1;
        }
      }
    }
    // ເລີ່ມຕົ້ນດ້ວຍລົດທີ່ກຳລັງແລ່ນຢູ່ແລ້ວ (ຈຳລອງລ່ວງໜ້າ ~16 ວິນາທີ)
    for (var w0 = 0; w0 < 160; w0++) { if (w0 % 14 === 0) spawnT = 0; step(0.1); }
    arrived = 0; for (var vk in visits) visits[vk] = 0;

    function counts() { var inT = 0, on = 0; cars.forEach(function (c) { if (c.active) { if (c.x < 11) inT++; else on++; } }); return { inTown: inT, onRoad: on }; }
    var lastSub = '';
    function update(dt) {
      dt = Math.min(dt, 0.05); step(dt);
      var k = counts(), sub = (window.VO_ASSETS && window.VO_ASSETS.config && window.VO_ASSETS.config.ambientTraffic === false) ? SD.shops.length + ' shops' : k.inTown + ' cars · ' + SD.shops.length + ' shops';
      if (sub !== lastSub) { lastSub = sub; setLabel(sub); }
    }
    setLabel(SD.shops.length + ' shops');
    ext.addUpdater(update); ext.addPickRoot(root);

    var selId = null;
    function clearSelection() { if (selId && frames[selId]) frames[selId].visible = false; selId = null; }
    function select(id) { clearSelection(); if (id && frames[id]) { selId = id; frames[id].visible = true; } }
    function stats() {
      var k = counts(), open = 0, vis = 0;
      SD.shops.forEach(function (s) { if (s.status !== 'closed') open++; vis += s.visitors + (visits[s.id] || 0); });
      return { shops: SD.shops.length, open: open, carsInTown: k.inTown, carsOnRoad: k.onRoad, arrived: arrived, visitors: vis };
    }
    return { root: root, geom: { TX: TX, TZ: TZ, LAYOUT: LAYOUT, ROW_Z: ROW_Z }, shops: shopById, stats: stats, select: select, clearSelection: clearSelection, visitsOf: function (id) { return (visits[id] || 0); },
      focusPos: function (id) { var L = LAYOUT[id]; if (!L) return new T.Vector3(TX, 0, TZ); var z = L.dest ? L.z : ROW_Z[L.row]; return new T.Vector3(TX + L.x, 0, TZ + z); }, update: update };
  }
  VOX.Town = { create: create, TX: TX, TZ: TZ };
})();
