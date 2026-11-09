/* Virtual Company 3D — Phase 2 · Component: Truck (ລົດບັນທຸກ 3D: trailer / flatbed / van)
   VOX.Truck.create(ext, def, statusMap) → { root, def, setStatus(key, extra), setSelected(on) }
   ໂມເດລຫັນໜ້າໄປທາງ +Z · ຈຸດກາງ = ກາງລົດ · ຍາວ ≈ 9 (trailer/flatbed) ຫຼື 5.6 (van) */
(function () {
  'use strict';
  var VOX = window.VOX = window.VOX || {};
  var BODY = { trailer: '#f8fafc', flatbed: '#e2e8f0', van: '#ffffff' };

  function create(ext, def, ST) {
    var T = ext.THREE, box = ext.box, cyl = ext.cyl, sph = ext.sph;
    var root = new T.Group(), g = new T.Group(); root.add(g);
    var van = def.type === 'van', L = van ? 5.6 : 9.2, cabZ = L / 2 - 1.4;       // cabZ = ກາງຫ້ອງຄົນຂັບ
    var C = { cab: van ? '#ffffff' : '#2563eb', dark: '#1e3a8a', glass: '#9ad0f5' };
    function wheel(x, z, r) {
      var t = cyl(g, r, r, 0.34, x, 0, z, '#111827', 16); t.rotation.z = Math.PI / 2; t.position.y = r;
      var h = cyl(g, r * 0.55, r * 0.55, 0.38, x + (x > 0 ? 0.03 : -0.03), 0, z, '#cbd5e1', 12); h.rotation.z = Math.PI / 2; h.position.y = r;
    }
    // ----- ແຄັບ -----
    box(g, 2.3, 1.1, 2.7, 0, 0.55, cabZ, C.cab);                              // ຕົວແຄັບລຸ່ມ
    box(g, 2.25, 1.35, 1.7, 0, 1.65, cabZ - 0.3, C.cab);                       // ຫຼັງຄາແຄັບ
    box(g, 2.0, 0.85, 0.08, 0, 1.85, cabZ + 0.58, C.glass).rotation.x = -0.22; // ກະຈົກໜ້າ
    box(g, 0.08, 0.8, 1.2, -1.14, 1.85, cabZ - 0.3, C.glass); box(g, 0.08, 0.8, 1.2, 1.14, 1.85, cabZ - 0.3, C.glass);   // ກະຈົກຂ້າງ
    box(g, 2.35, 0.3, 0.25, 0, 0.35, cabZ + 1.4, '#334155');                   // ບໍາເປີ
    box(g, 1.7, 0.55, 0.1, 0, 0.75, cabZ + 1.36, '#0f172a');                   // grille
    for (var i = 0; i < 3; i++) box(g, 1.6, 0.05, 0.12, 0, 0.65 + i * 0.16, cabZ + 1.38, '#64748b');
    box(g, 0.35, 0.22, 0.1, -0.85, 0.9, cabZ + 1.37, '#fde68a', true); box(g, 0.35, 0.22, 0.1, 0.85, 0.9, cabZ + 1.37, '#fde68a', true);
    box(g, 0.2, 0.3, 0.12, -1.28, 1.55, cabZ + 0.7, '#111827'); box(g, 0.2, 0.3, 0.12, 1.28, 1.55, cabZ + 0.7, '#111827'); // mirror
    if (!van) { cyl(g, 0.09, 0.09, 1.7, -1.0, 1.2, cabZ - 1.25, '#9ca3af', 8); box(g, 2.3, 0.14, 0.9, 0, 0.35, cabZ - 1.7, '#1f2937'); }
    box(g, 2.32, 0.14, 2.72, 0, 0.5, cabZ, C.dark);                           // ແຖບສີຂ້າງແຄັບ
    // ----- ຖັງ/ກະບະ -----
    var bz = -L / 2 + (van ? 1.6 : 3.2);                                      // ກາງບ່ອນບັນທຸກ
    if (def.type === 'flatbed') {
      box(g, 2.4, 0.3, 6.4, 0, 0.55, bz, '#475569'); box(g, 2.5, 0.12, 6.5, 0, 0.85, bz, '#94a3b8');
      for (i = 0; i < 6; i++) { box(g, 0.5, 0.6, 0.1, -1.15, 0.97, bz - 2.7 + i * 1.08, '#64748b'); box(g, 0.5, 0.6, 0.1, 1.15, 0.97, bz - 2.7 + i * 1.08, '#64748b'); }
      var cc = ['#38bdf8', '#ef4444', '#4ade80'];
      for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) for (var l = 0; l < 3; l++) box(g, 0.95, 0.62, 0.95, -0.55 + (r) * 1.1, 0.97 + l * 0.64, bz - 2.2 + c * 2.15, cc[(c + l + r) % 3]);
    } else {
      var H = van ? 2.1 : 3.0, W = van ? 2.3 : 2.5, len = van ? 3.4 : 6.5;
      box(g, 2.2, 0.35, len, 0, 0.45, bz, '#475569');                          // ໂຄງລຸ່ມ
      box(g, W, H, len, 0, 0.8, bz, BODY[def.type]);                           // ຕູ້
      box(g, W + 0.06, 0.45, len + 0.06, 0, 1.0, bz, '#2563eb'); // ແຖບສີ
      box(g, W + 0.08, 0.14, len + 0.1, 0, 0.8 + H, bz, '#cbd5e1');             // ຂອບຫຼັງຄາ
      for (i = 0; i < Math.floor(len / 1.1); i++) { box(g, W + 0.05, H - 0.4, 0.07, 0, 1.0, bz - len / 2 + 0.6 + i * 1.1, '#e2e8f0'); }   // ຊີ່ຂອບຕູ້
      box(g, W - 0.2, H - 0.3, 0.06, 0, 0.9, bz - len / 2 - 0.02, '#cbd5e1');   // ປະຕູຫຼັງ
      box(g, 0.08, H - 0.4, 0.07, 0, 0.9, bz - len / 2 - 0.06, '#94a3b8');
      box(g, 0.05, 0.9, Math.min(3.2, len - 1), W / 2 + 0.03, 1.7, bz, '#2563eb'); box(g, 0.05, 0.9, Math.min(3.2, len - 1), -W / 2 - 0.03, 1.7, bz, '#2563eb');
      box(g, 0.05, 0.45, Math.min(2.4, len - 1.6), W / 2 + 0.07, 1.75, bz, '#ffffff'); box(g, 0.05, 0.45, Math.min(2.4, len - 1.6), -W / 2 - 0.07, 1.75, bz, '#ffffff');
    }
    // ----- ລໍ້ + ໄຟຫຼັງ + ປ້າຍ -----
    wheel(-1.1, cabZ + 0.4, 0.5); wheel(1.1, cabZ + 0.4, 0.5);
    if (van) { wheel(-1.1, -1.7, 0.5); wheel(1.1, -1.7, 0.5); }
    else { [-3.4, -2.2, -0.1].forEach(function (z) { wheel(-1.1, z, 0.5); wheel(1.1, z, 0.5); }); box(g, 0.5, 0.4, 0.06, -0.85, 0.45, -L / 2 - 0.1, '#ef4444', true); box(g, 0.5, 0.4, 0.06, 0.85, 0.45, -L / 2 - 0.1, '#ef4444', true); }
    var ring = new T.Mesh(new T.RingGeometry(L * 0.62, L * 0.62 + 0.28, 40), new T.MeshBasicMaterial({ color: 0x2563eb, side: T.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; ring.visible = false; ring.raycast = function () {}; root.add(ring);
    var lab = null, cur = '';
    function setStatus(k, extra) {
      var key = k + '|' + (extra || ''); if (key === cur) return; cur = key;
      var s = ST[k]; if (lab) { root.remove(lab); lab.material.map.dispose(); lab.material.dispose(); }
      lab = VOX.label(T, def.id, s.label + (extra ? ' · ' + extra : ''), s.color, s.color, 5.6, 1.4); lab.position.set(0, 5.4, 0); lab.userData.worldPick = { type: 'truck', id: def.id }; root.add(lab);
    }
    root.traverse(function (o) { if (o.isMesh) o.userData.worldPick = { type: 'truck', id: def.id }; });
    return { root: root, def: def, ring: ring, setStatus: setStatus, setSelected: function (on) { ring.visible = !!on; } };
  }
  VOX.Truck = { create: create };
})();
