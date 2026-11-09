/* Virtual Company 3D — ສາກ 3D (Three.js r128 + OrbitControls) ແບບ Isometric Cartoon
   ໂຄງສ້າງ: helpers → props (ເຟີນິເຈີ) → rooms (ແຕ່ລະແຜນກ) → characters (ພະນັກງານ) → camera/controls → loop */
(function () {
  'use strict';
  var THREE = window.THREE;

  // ---------- ຂະໜາດຜັງຫ້ອງການ (grid 3x3, 1 unit ≈ 1 ແມັດ) ----------
  var CELL_W = 11, CELL_D = 7;
  var BASE_W = 39, BASE_D = 27;
  function cellCenter(col, row) { return { x: -12.5 + col * 12.5, z: -8.5 + row * 8.5 }; }

  var SKIN = ['#f3cfae', '#e2ad82', '#c68c60'];
  var HAIR = ['#2b2118', '#3d2b1f', '#161616', '#6b4423'];
  var SCALE = 0.78; // ຂະໜາດຕົວລະຄອນ

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerpAngle(a, b, k) {
    var d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * k;
  }
  function tint(hex, to, amt) { return '#' + new THREE.Color(hex).lerp(new THREE.Color(to), amt).getHexString(); }

  function create(container, data, cb) {
    cb = cb || {};
    var STATUS = data.STATUS;
    var deptById = {}, empById = {};
    data.departments.forEach(function (d) { deptById[d.id] = d; });
    data.employees.forEach(function (e) { empById[e.id] = e; });

    // ---------- renderer / scene / camera ----------
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, (window.innerWidth < 860 ? 1.35 : (window.innerWidth < 1200 ? 1.5 : 1.85)))); // Premium pass: balanced DPR for mobile/tablet/desktop
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.5, 700);

    var ambient = new THREE.AmbientLight(0xfff4df, 0.66);
    var hemi = new THREE.HemisphereLight(0xdcecff, 0x7b6b55, 0.42);
    var sun = new THREE.DirectionalLight(0xffe5b4, 0.82);
    var rim = new THREE.DirectionalLight(0x8db6d2, 0.28);
    rim.position.set(24, 18, -26);
    scene.add(rim);
    sun.position.set(-18, 34, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
    sun.shadow.camera.near = 5; sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.00045;
    sun.shadow.radius = 3;
    scene.add(ambient); scene.add(hemi); scene.add(sun); scene.add(sun.target);

    // ---------- material / geometry helpers ----------
    var matCache = {}, geoCache = {};
    function mat(hex) {
      if (!matCache[hex]) matCache[hex] = new THREE.MeshLambertMaterial({ color: hex });
      return matCache[hex];
    }
    var glowCache = {};
    function glow(hex) {
      if (!glowCache[hex]) glowCache[hex] = new THREE.MeshBasicMaterial({ color: hex });
      return glowCache[hex];
    }
    function geo(key, make) { if (!geoCache[key]) geoCache[key] = make(); return geoCache[key]; }
    function place(m, parent, x, y, z, shadow) {
      m.position.set(x, y, z);
      m.castShadow = shadow !== false; m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    // y = ຂອບລຸ່ມ
    function box(p, w, h, d, x, y, z, color, basic) {
      var g = geo('b' + w + '_' + h + '_' + d, function () { return new THREE.BoxGeometry(w, h, d); });
      return place(new THREE.Mesh(g, basic ? glow(color) : mat(color)), p, x, y + h / 2, z, !basic);
    }
    function cyl(p, rt, rb, h, x, y, z, color, seg) {
      seg = seg || 14;
      var g = geo('c' + rt + '_' + rb + '_' + h + '_' + seg, function () { return new THREE.CylinderGeometry(rt, rb, h, seg); });
      return place(new THREE.Mesh(g, mat(color)), p, x, y + h / 2, z);
    }
    function sph(p, r, x, y, z, color) {
      var g = geo('s' + r, function () { return new THREE.SphereGeometry(r, 14, 10); });
      return place(new THREE.Mesh(g, mat(color)), p, x, y, z);
    }

    // ---------- props (ເຟີນິເຈີ) ----------
    function plant(p, x, z, s) {
      s = s || 1;
      cyl(p, 0.2 * s, 0.15 * s, 0.32 * s, x, 0, z, '#d6a77a');
      sph(p, 0.3 * s, x, 0.62 * s, z, '#4f9d55');
      sph(p, 0.22 * s, x + 0.14 * s, 0.82 * s, z - 0.06 * s, '#5fb067');
      sph(p, 0.2 * s, x - 0.14 * s, 0.76 * s, z + 0.1 * s, '#3f8a49');
    }
    function chair(p, x, z, rot, color) {
      var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; p.add(g);
      cyl(g, 0.04, 0.04, 0.34, 0, 0.06, 0, '#4b5563', 8);
      cyl(g, 0.26, 0.26, 0.04, 0, 0.02, 0, '#374151', 10);
      box(g, 0.56, 0.08, 0.56, 0, 0.4, 0, color);
      box(g, 0.56, 0.5, 0.07, 0, 0.48, 0.27, color);
      return g;
    }
    // ໂຕະ + ຈໍ + ເກົ້າອີ້. rot 0 = ຄົນນັ່ງຢູ່ດ້ານ +z ແລະ ຫັນໜ້າໄປ -z
    function deskSet(p, x, z, rot, o) {
      o = o || {};
      var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; p.add(g);
      var w = o.w || 1.5;
      box(g, w, 0.06, 0.8, 0, 0.74, 0, o.top || '#d1a97a');
      box(g, 0.06, 0.74, 0.7, -(w / 2 - 0.06), 0, 0, '#a98259');
      box(g, 0.06, 0.74, 0.7, (w / 2 - 0.06), 0, 0, '#a98259');
      box(g, w - 0.2, 0.46, 0.04, 0, 0.26, -0.32, '#a98259');
      var mons = o.monitors || 1;
      for (var i = 0; i < mons; i++) {
        var mx = mons === 1 ? 0 : (i - (mons - 1) / 2) * 0.55;
        box(g, 0.07, 0.2, 0.06, mx, 0.8, -0.2, '#475569');
        box(g, 0.24, 0.02, 0.16, mx, 0.8, -0.2, '#475569');
        box(g, 0.5, 0.32, 0.03, mx, 0.98, -0.2, '#1f2937');
        box(g, 0.44, 0.26, 0.01, mx, 1.01, -0.18, o.screen || '#7cb7ff', true);
      }
      box(g, 0.42, 0.02, 0.14, 0, 0.8, 0.12, '#eef2f7');
      box(g, 0.07, 0.03, 0.1, 0.38, 0.8, 0.12, '#eef2f7');
      if (o.mug !== false) cyl(g, 0.05, 0.05, 0.1, -w / 2 + 0.2, 0.8, 0.0, o.mugColor || '#f87171', 10);
      chair(g, 0, 0.85, 0, o.chair || '#475569');
      return { x: x + Math.sin(rot) * 0.85, z: z + Math.cos(rot) * 0.85, yaw: rot + Math.PI };
    }
    function sofa(p, x, z, rot, color, len) {
      len = len || 2.2;
      var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; p.add(g);
      box(g, len, 0.4, 0.9, 0, 0.1, 0, color);
      box(g, len, 0.55, 0.22, 0, 0.45, -0.34, tint(color, '#000000', 0.12));
      box(g, 0.22, 0.38, 0.9, -(len / 2 - 0.11), 0.4, 0, tint(color, '#000000', 0.12));
      box(g, 0.22, 0.38, 0.9, (len / 2 - 0.11), 0.4, 0, tint(color, '#000000', 0.12));
      return g;
    }
    function cabinet(p, x, z, rot, color, w) {
      var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot || 0; p.add(g);
      w = w || 0.8;
      box(g, w, 1.3, 0.55, 0, 0, 0, color || '#94a3b8');
      for (var i = 0; i < 3; i++) box(g, w - 0.12, 0.02, 0.02, 0, 0.3 + i * 0.4, 0.28, '#e2e8f0');
      return g;
    }
    function shelf(p, x, z, w, colors) {
      box(p, w, 1.5, 0.35, x, 0, z, '#8b6b4a');
      for (var r = 0; r < 3; r++) {
        var cx = x - w / 2 + 0.2;
        for (var i = 0; cx < x + w / 2 - 0.15; i++) {
          var bw = 0.12 + ((i * 7 + r * 3) % 4) * 0.03;
          box(p, bw, 0.28, 0.24, cx + bw / 2, 0.12 + r * 0.45 + 0.06, z + 0.05, colors[(i + r) % colors.length]);
          cx += bw + 0.03;
        }
      }
    }
    function board(p, x, y, z, w, h, color, bars) { // ກະດານຕິດຝາ (ກຣາບ)
      box(p, w, h, 0.08, x, y, z, '#e5e7eb');
      box(p, w - 0.12, h - 0.12, 0.02, x, y + 0.06, z + 0.045, color || '#ffffff', true);
      if (bars) {
        var n = bars.length, bw = (w - 0.5) / n;
        for (var i = 0; i < n; i++) {
          var bh = (h - 0.5) * bars[i];
          box(p, bw * 0.6, bh, 0.02, x - w / 2 + 0.3 + bw * (i + 0.5), y + 0.2, z + 0.06, '#3b82f6', true);
        }
      }
    }
    function rug(p, x, z, r, color) {
      var m = cyl(p, r, r, 0.03, x, 0.1, z, color, 28); m.castShadow = false; return m;
    }
    function crate(p, x, y, z, s, color) { return box(p, s, s * 0.8, s, x, y, z, color || '#c9a06c'); }

    // ---------- ຂໍ້ຄວາມປ້າຍ (sprite) ----------
    function labelSprite(text, color) {
      var c = document.createElement('canvas'); c.width = 512; c.height = 128;
      var g = c.getContext('2d');
      g.fillStyle = 'rgba(255,255,255,0.95)';
      var r = 28, w = 512, h = 128;
      g.beginPath(); g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r); g.lineTo(w, h - r);
      g.quadraticCurveTo(w, h, w - r, h); g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.closePath(); g.fill();
      g.fillStyle = color; g.fillRect(0, h - 14, w, 14);
      g.fillStyle = '#1e293b'; g.font = '700 50px "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 - 6);
      var tex = new THREE.CanvasTexture(c);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sp.scale.set(4.2, 1.05, 1);
      return sp;
    }

    // ---------- ພື້ນຖານ (island) ----------
    box(scene, BASE_W + 3, 0.5, BASE_D + 3, 0, -1.1, 0, '#c9d3e0');
    var ground = box(scene, BASE_W, 0.6, BASE_D, 0, -0.6, 0, '#eef1f6');
    ground.castShadow = false;
    // ເສັ້ນທາງຍ່າງ (corridor strips)
    [-6.25, 6.25].forEach(function (x) { var m = box(scene, 1.1, 0.02, BASE_D - 1, x, 0.0, 0, '#dfe5ee'); m.castShadow = false; });
    [-4.25, 4.25].forEach(function (z) { var m = box(scene, BASE_W - 1, 0.02, 1.1, 0, 0.0, z, '#dfe5ee'); m.castShadow = false; });
    // ປະຕູທາງເຂົ້າ + ພົມ
    var mat0 = box(scene, 3, 0.03, 1.4, 0, 0.0, 12.8, '#94a3b8'); mat0.castShadow = false;

    // ---------- ສ້າງແຕ່ລະຫ້ອງ ----------
    var rooms = {};          // id -> { group, floor, frame, center, accent }
    var roomGroups = [];
    var charMeshRoots = [];  // ຕົວລະຄອນທັງໝົດ (group ຮາກ)
    var chars = {};          // employeeId -> char

    function buildRoom(d) {
      var c = cellCenter(d.col, d.row);
      var r = new THREE.Group(); r.position.set(c.x, 0, c.z); scene.add(r);
      roomGroups.push(r);
      var floorMat = new THREE.MeshLambertMaterial({ color: d.color });
      var floor = new THREE.Mesh(new THREE.BoxGeometry(CELL_W, 0.1, CELL_D), floorMat);
      floor.position.set(0, 0.05, 0); floor.receiveShadow = true; r.add(floor);

      // ຝາ (cutaway ຕ່ຳ ເພື່ອໃຫ້ເຫັນພາຍໃນ)
      var wallC = '#f8fafc';
      box(r, CELL_W, 1.3, 0.2, 0, 0.1, -CELL_D / 2, wallC);
      box(r, 0.2, 1.3, CELL_D, -CELL_W / 2, 0.1, 0, wallC);
      box(r, CELL_W + 0.2, 0.08, 0.28, 0, 1.4, -CELL_D / 2, d.accent);
      box(r, 0.28, 0.08, CELL_D, -CELL_W / 2, 1.4, 0, d.accent);
      // ເສົາມຸມ
      box(r, 0.34, 1.5, 0.34, -CELL_W / 2, 0.1, -CELL_D / 2, tint(d.accent, '#ffffff', 0.2));

      // ກອບເນັ້ນ (ສະແດງເມື່ອເລືອກແຜນກ)
      var frame = new THREE.Group(); frame.visible = false; r.add(frame);
      var fm = glow(d.accent);
      [[CELL_W + 0.3, 0.12, -CELL_D / 2 - 0.1, 0], [CELL_W + 0.3, 0.12, CELL_D / 2 + 0.1, 0]].forEach(function (a) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(a[0], 0.14, 0.16), fm); m.position.set(0, 0.12, a[2]); frame.add(m);
      });
      [-CELL_W / 2 - 0.1, CELL_W / 2 + 0.1].forEach(function (x) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, CELL_D + 0.3), fm); m.position.set(x, 0.12, 0); frame.add(m);
      });

      var label = labelSprite(d.short === 'Meeting' ? 'Meeting Room' : d.name.replace(' Department', ''), d.accent);
      label.position.set(0, 3.1, -CELL_D / 2 + 0.2); r.add(label);

      rooms[d.id] = { group: r, floor: floor, floorMat: floorMat, frame: frame, center: new THREE.Vector3(c.x, 0, c.z), accent: d.accent, def: d, desks: [], standSpots: [], seats: [] };
      return rooms[d.id];
    }

    // ເສັ້ນຈັດໂຕະແບບ pod: ແຖວຫຼັງ (ຫັນໄປຝາ) ແລະ ແຖວໜ້າ (ຫັນມາຫາກ້ອງ)
    function podLayout(r, n, o) {
      o = o || {};
      var xsA = [-3.6, -1.2, 1.2, 3.6], xsB = [-3.6, -1.2, 1.2, 3.6];
      var zA = o.zA != null ? o.zA : -1.9, zB = o.zB != null ? o.zB : 1.3;
      var res = [];
      for (var i = 0; i < n; i++) {
        var a = i < 4;
        var x = (a ? xsA : xsB)[i % 4] + (o.dx || 0);
        res.push(deskSet(r.group, x, a ? zA : zB, a ? 0 : Math.PI, { monitors: o.monitors || 1, screen: o.screen, chair: o.chair, top: o.top, mugColor: o.mugColor }));
      }
      return res;
    }

    function furnish(d, r) {
      var g = r.group, acc = d.accent;
      var Z0 = -CELL_D / 2;
      switch (d.style || d.id) {
        case 'ceo': {
          r.desks.push(deskSet(g, 1.2, -1.3, 0, { w: 2.2, monitors: 2, top: '#8b5e3c', chair: '#7c2d12', screen: '#fcd34d' }));
          r.desks.push(deskSet(g, -3.4, 1.7, Math.PI, { monitors: 1, chair: '#475569' }));
          shelf(g, -2.6, Z0 + 0.35, 3.0, ['#b45309', '#1d4ed8', '#15803d', '#be123c', '#475569']);
          shelf(g, 2.2, Z0 + 0.35, 2.4, ['#475569', '#b45309', '#0f766e']);
          rug(g, 1.2, -0.2, 2.4, '#fde7b9');
          sofa(g, 3.8, 2.2, -Math.PI / 2, '#a16207', 2.0);
          box(g, 0.9, 0.35, 0.9, 2.6, 0.1, 2.2, '#8b5e3c');
          plant(g, -4.8, 2.7, 1.2); plant(g, 4.9, -2.9, 1.1);
          box(g, 0.5, 0.9, 0.5, -4.6, 0.1, -2.7, '#fbbf24'); // trophy stand
          sph(g, 0.2, -4.6, 1.15, -2.7, '#facc15');
          break;
        }
        case 'sales': {
          podLayout(r, 5, { screen: '#86efac', chair: '#7f1d1d' }).forEach(function (s) { r.desks.push(s); });
          board(g, -1.5, 0.5, Z0 + 0.14, 3.2, 1.0, '#ffffff', [0.3, 0.45, 0.4, 0.65, 0.55, 0.85, 1]);
          board(g, 3.0, 0.5, Z0 + 0.14, 1.6, 1.0, '#fff1f2', [0.9, 0.6, 0.35]);
          plant(g, 4.9, 2.9, 1.1); plant(g, -4.9, 2.9, 1.0);
          cabinet(g, -4.9, -2.9, Math.PI / 2, '#fca5a5', 1.0);
          break;
        }
        case 'marketing': {
          podLayout(r, 4, { screen: '#f0abfc', chair: '#86198f' }).forEach(function (s) { r.desks.push(s); });
          // easel + poster wall
          box(g, 0.06, 1.5, 0.06, 4.4, 0, 2.4, '#a16207'); box(g, 0.06, 1.5, 0.06, 5.0, 0, 2.4, '#a16207');
          box(g, 1.0, 0.8, 0.05, 4.7, 0.7, 2.35, '#fdf4ff'); box(g, 0.7, 0.4, 0.02, 4.7, 0.9, 2.39, '#e879f9', true);
          board(g, -1.0, 0.45, Z0 + 0.14, 2.0, 1.1, '#fae8ff');
          box(g, 0.6, 0.7, 0.03, 0.5, 0.55, Z0 + 0.14, '#f472b6'); box(g, 0.6, 0.7, 0.03, 1.3, 0.55, Z0 + 0.14, '#60a5fa'); box(g, 0.6, 0.7, 0.03, 2.1, 0.55, Z0 + 0.14, '#fbbf24');
          // tripod + camera
          cyl(g, 0.03, 0.03, 1.2, -4.8, 0, -2.8, '#334155', 6); box(g, 0.4, 0.25, 0.3, -4.8, 1.2, -2.8, '#111827');
          sofa(g, -4.0, 2.7, Math.PI, '#c026d3', 1.8);
          plant(g, 4.9, -2.9, 1.0);
          break;
        }
        case 'finance': {
          podLayout(r, 4, { screen: '#bbf7d0', chair: '#14532d' }).forEach(function (s) { r.desks.push(s); });
          cabinet(g, -4.9, -2.7, Math.PI / 2, '#86a79a', 1.0); cabinet(g, -4.9, -1.7, Math.PI / 2, '#86a79a', 1.0);
          cabinet(g, 4.9, -2.9, -Math.PI / 2, '#86a79a', 1.0);
          // safe
          box(g, 0.9, 0.9, 0.7, 4.3, 0, 2.7, '#374151'); cyl(g, 0.16, 0.16, 0.05, 4.3, 0.45, 3.07, '#facc15', 14).rotation.x = Math.PI / 2;
          board(g, 0.5, 0.5, Z0 + 0.14, 3.0, 1.0, '#f0fdf4', [0.4, 0.55, 0.5, 0.8, 0.7, 0.95]);
          plant(g, -4.9, 2.9, 1.0);
          break;
        }
        case 'hr': {
          podLayout(r, 3, { screen: '#fde68a', chair: '#92400e' }).forEach(function (s) { r.desks.push(s); });
          cabinet(g, -4.9, -2.8, Math.PI / 2, '#d6b98a', 1.0); cabinet(g, 4.9, -2.8, -Math.PI / 2, '#d6b98a', 1.0);
          // ໂຕະສຳພາດ
          cyl(g, 0.8, 0.8, 0.06, 3.4, 0.7, 2.3, '#fff7e6', 20); cyl(g, 0.08, 0.08, 0.7, 3.4, 0, 2.3, '#94a3b8', 8);
          chair(g, 2.4, 2.3, Math.PI / 2, '#d97706'); chair(g, 4.4, 2.3, -Math.PI / 2, '#d97706');
          plant(g, -4.9, 2.9, 1.1);
          board(g, 0.5, 0.5, Z0 + 0.14, 3.0, 1.0, '#fffbeb', [0.5, 0.35, 0.7, 0.45]);
          break;
        }
        case 'it': {
          podLayout(r, 5, { monitors: 2, screen: '#93c5fd', chair: '#1e1b4b', mugColor: '#38bdf8' }).forEach(function (s) { r.desks.push(s); });
          // server racks
          for (var i = 0; i < 3; i++) {
            var rx = 3.6 + i * 0.0, rz = -2.6 + i * 0.0;
            if (i === 0) { rx = 3.5; rz = -2.7; } if (i === 1) { rx = 4.35; rz = -2.7; } if (i === 2) { rx = 5.0; rz = -1.9; }
            box(g, 0.7, 1.7, 0.7, rx, 0, rz, '#1f2937');
            for (var k = 0; k < 6; k++) {
              box(g, 0.5, 0.05, 0.02, rx, 0.25 + k * 0.25, rz + 0.36, '#0f172a');
              box(g, 0.05, 0.05, 0.02, rx + 0.18, 0.26 + k * 0.25, rz + 0.375, (k % 2 ? '#34d399' : '#60a5fa'), true);
            }
          }
          board(g, -1.5, 0.5, Z0 + 0.14, 3.2, 1.0, '#0f172a', [0.5, 0.8, 0.6, 0.9, 0.4, 0.7]);
          plant(g, -4.9, 2.9, 1.0);
          break;
        }
        case 'operations': {
          podLayout(r, 4, { screen: '#d9f99d', chair: '#3f6212' }).forEach(function (s) { r.desks.push(s); });
          // ແຜນທີ່/ກະດານຕິດຝາ ແລະ ພາເລດ-ກ່ອງສິນຄ້າ
          box(g, 3.4, 1.2, 0.08, -1.0, 0.4, Z0 + 0.14, '#e5e7eb'); box(g, 3.2, 1.0, 0.02, -1.0, 0.5, Z0 + 0.19, '#ecfccb', true);
          [[-2.2, 0.7, '#84cc16'], [-1.4, 0.4, '#3b82f6'], [-0.2, 0.9, '#f59e0b'], [0.4, 0.5, '#ef4444']].forEach(function (p) { sph(g, 0.09, p[0], p[1] + 0.35, Z0 + 0.22, p[2]).castShadow = false; });
          box(g, 1.3, 0.12, 1.1, 4.1, 0, 2.2, '#b9915a'); crate(g, 4.1, 0.12, 2.2, 0.55); crate(g, 4.45, 0.12, 2.2, 0.5, '#b8895a'); crate(g, 4.25, 0.67, 2.2, 0.5, '#d4aa75');
          box(g, 1.3, 0.12, 1.1, -4.3, 0, 2.5, '#b9915a'); crate(g, -4.3, 0.12, 2.5, 0.6, '#c99a62');
          cabinet(g, 4.9, -2.8, -Math.PI / 2, '#a3b18a', 1.0);
          plant(g, -4.9, -2.9, 1.0);
          break;
        }
        case 'meeting': {
          // ໂຕະປະຊຸມຍາວ
          box(g, 5.2, 0.1, 1.7, 0, 0.74, 0.2, '#9a7452');
          box(g, 0.5, 0.74, 1.1, -1.7, 0, 0.2, '#6b5238'); box(g, 0.5, 0.74, 1.1, 1.7, 0, 0.2, '#6b5238');
          // ຈໍສະແດງຜົນ
          box(g, 4.4, 1.9, 0.1, 0, 0.4, Z0 + 0.15, '#1f2937');
          box(g, 4.2, 1.7, 0.02, 0, 0.5, Z0 + 0.21, '#dbeafe', true);
          [0.4, 0.65, 0.5, 0.9, 0.75].forEach(function (v, i) { box(g, 0.45, 1.2 * v, 0.02, -1.6 + i * 0.8, 0.7, Z0 + 0.23, i % 2 ? '#60a5fa' : '#3b82f6', true); });
          // ເກົ້າອີ້ 10 ບ່ອນ
          var seats = [];
          [-1.8, -0.6, 0.6, 1.8].forEach(function (x) {
            chair(g, x, 1.45, 0, '#2563eb'); seats.push({ x: x, z: 1.4, yaw: Math.PI });       // ຝັ່ງ +z ຫັນຫາ -z
          });
          [-1.8, -0.6, 0.6, 1.8].forEach(function (x) {
            chair(g, x, -1.05, Math.PI, '#2563eb'); seats.push({ x: x, z: -1.0, yaw: 0 });    // ຝັ່ງ -z ຫັນຫາ +z
          });
          chair(g, -3.1, 0.2, -Math.PI / 2, '#1d4ed8'); seats.push({ x: -3.1, z: 0.2, yaw: Math.PI / 2 });
          chair(g, 3.1, 0.2, Math.PI / 2, '#1d4ed8'); seats.push({ x: 3.1, z: 0.2, yaw: -Math.PI / 2 });
          r.seats = seats;
          // ເຄື່ອງໃນໂຕະ
          box(g, 0.5, 0.02, 0.35, 0, 0.84, 0.2, '#e5e7eb'); cyl(g, 0.1, 0.1, 0.14, 1.0, 0.84, 0.0, '#f59e0b', 10);
          plant(g, -4.9, 2.8, 1.2); plant(g, 4.9, 2.8, 1.2);
          break;
        }
        case 'reception': {
          // ເຄົາເຕີ + ພະນັກງານຕ້ອນຮັບຢູ່ຫຼັງເຄົາເຕີ ຫັນໜ້າມາທາງຜູ້ມາຕິດຕໍ່
          box(g, 4.2, 1.0, 0.9, 0, 0.1, -1.2, '#fff7ed');
          box(g, 4.3, 0.08, 1.0, 0, 1.1, -1.2, '#14b8a6');
          box(g, 0.5, 0.02, 0.35, -1.0, 1.18, -1.15, '#e2e8f0'); box(g, 0.5, 0.3, 0.03, -1.0, 1.2, -1.35, '#1f2937'); box(g, 0.44, 0.24, 0.01, -1.0, 1.23, -1.33, '#7dd3fc', true);
          chair(g, 0, -2.3, Math.PI, '#0f766e');
          r.desks.push({ x: 0, z: -2.3, yaw: 0, hipLift: 0 }); // ຫັນໜ້າ +z
          // ໂລໂກ້ຝາ
          box(g, 2.6, 0.9, 0.08, 0, 0.5, Z0 + 0.14, '#0f766e'); box(g, 2.2, 0.5, 0.02, 0, 0.7, Z0 + 0.19, '#99f6e4', true);
          // ໂຊຟາຮັບແຂກ + ໂຕະກາເຟ
          sofa(g, -3.7, 1.7, Math.PI / 2, '#0d9488', 2.1);
          box(g, 0.8, 0.3, 1.2, -2.5, 0.1, 1.7, '#e2e8f0');
          // ເຄື່ອງກາເຟ + ຕູ້ນ້ຳ (ຈຸດພັກ)
          box(g, 0.9, 1.0, 0.6, 4.7, 0.1, 0.4, '#e2e8f0'); box(g, 0.4, 0.3, 0.3, 4.7, 1.1, 0.4, '#334155'); cyl(g, 0.2, 0.2, 0.5, 4.7, 1.1, -0.4, '#bfdbfe', 12);
          r.standSpots = [{ x: 3.6, z: 1.4, yaw: Math.PI / 2 + 0.3 }, { x: 3.6, z: 2.4, yaw: Math.PI / 2 - 0.2 }];
          plant(g, 4.9, 2.9, 1.2); plant(g, -4.9, -2.9, 1.1); plant(g, 4.9, -2.9, 1.0);
          break;
        }
      }
    }

    // Phase 6: ของตกແຕ່ງສະເພາະຫ້ອງ (ແຕ່ລະຫ້ອງ = ຫ້ອງທຳງານຂອງໜ້າທີ່ໜຶ່ງ) — ໃຊ້ style ເດີມເປັນພື້ນ ແລ້ວເພີ່ມຂອງບົ່ງບອກໜ້າທີ່
    function furnishExtra(d, r) {
      var g = r.group, Z0 = -CELL_D / 2;
      switch (d.id) {
        case 'admin':           // ແຜງຄວບຄຸມ Admin: ຈໍສິດຜູ້ໃຊ້ + ກຸນແຈ
          box(g, 1.5, 0.9, 0.06, -4.4, 0.9, 0.6, '#1f2937'); box(g, 1.4, 0.8, 0.02, -4.4, 0.95, 0.64, '#fde68a', true);
          cyl(g, 0.14, 0.14, 0.05, -4.4, 1.75, 0.62, '#c58b2a', 14).rotation.x = Math.PI / 2; break;
        case 'asset_request':   // ຕູ້ແຊ່ທີ່ຖືກຂໍ (Asset) ຕັ້ງລໍຖ້າ
          box(g, 0.9, 1.3, 0.8, 4.2, 0.1, 2.3, '#e0f2fe'); box(g, 0.7, 0.8, 0.02, 4.2, 0.45, 2.71, '#7dd3fc', true); box(g, 0.95, 0.1, 0.85, 4.2, 1.4, 2.3, '#2563eb'); break;
        case 'contract':        // ເອກະສານໃບສັນຍາ + ປາກກາເທິງໂຕະເຊັນ
          box(g, 0.5, 0.03, 0.4, 3.4, 0.77, 2.3, '#ffffff'); box(g, 0.3, 0.02, 0.04, 3.4, 0.8, 2.25, '#2563eb', true); box(g, 0.16, 0.16, 0.02, 3.55, 0.8, 2.4, '#ef4444', true); break;
        case 'announce':        // ໂທລະໂຄ່ງ + ປ້າຍແຈ້ງເຕືອນ
          cyl(g, 0.1, 0.34, 0.55, 3.9, 1.0, -2.6, '#f43f5e', 14).rotation.z = Math.PI / 2; box(g, 0.2, 0.3, 0.2, 3.5, 0.9, -2.6, '#1f2937');
          cyl(g, 0.03, 0.03, 0.9, 3.5, 0, -2.6, '#475569', 6); sph(g, 0.16, 2.6, 1.85, Z0 + 0.3, '#facc15'); break;
        case 'asset_tracking':  // ໝຸດຕຳແໜ່ງ Asset + ວົງ radar
          cyl(g, 0.04, 0.04, 1.0, -3.6, 0, 2.4, '#94a3b8', 6); sph(g, 0.3, -3.6, 1.25, 2.4, '#ef4444'); cyl(g, 0.7, 0.7, 0.03, -3.6, 0.02, 2.4, '#c7d2fe', 24).castShadow = false; break;
        case 'budget':          // ກຣາບງົບ ແລະ ເຄື່ອງຄິດເລກຢູ່ກຳແພງຂ້າງ
          box(g, 0.06, 1.0, 1.8, -5.3, 0.5, 0.2, '#f0fdf4'); [0.4, 0.6, 0.5, 0.85].forEach(function (v, i) { box(g, 0.04, 0.8 * v, 0.28, -5.25, 0.6, -0.5 + i * 0.4, '#22c55e', true); }); break;
        case 'delivery':        // ກ່ອງຂະໜານສົ່ງ + ປ້າຍເສັ້ນທາງ
          box(g, 0.5, 0.35, 0.9, -2.2, 0.76, -2.7, '#f8fafc'); box(g, 0.45, 0.3, 0.35, -2.2, 0.76, -2.0, '#2563eb'); break;
      }
    }
    data.departments.forEach(function (d) { var rm = buildRoom(d); furnish(d, rm); furnishExtra(d, rm); });

    // ໝາຍ deptId ໃສ່ທຸກ mesh ໃນຫ້ອງ (ໃຊ້ຕອນຄລິກ)
    roomGroups.forEach(function (rg, i) {
      var id = data.departments[i].id;
      rg.traverse(function (o) { if (o.isMesh) o.userData.deptId = id; });
    });

    // ---------- ຕົວລະຄອນ ----------
    var shirtOf = {}; data.departments.forEach(function (d) { shirtOf[d.id] = tint(d.accent, '#ffffff', 0.15); });
    var PANTS = ['#334155', '#1f2937', '#44403c'];

    function makeChar(emp) {
      var root = new THREE.Group(); root.userData.employeeId = emp.id;
      var rig = new THREE.Group(); rig.scale.set(SCALE, SCALE, SCALE); root.add(rig);
      var skin = SKIN[emp.tone % SKIN.length], hair = HAIR[(emp.hair + emp.id.charCodeAt(2)) % HAIR.length];
      var shirt = shirtOf[emp.dept], pants = PANTS[emp.id.charCodeAt(2) % PANTS.length];
      function add(m, parent, x, y, z) { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; m.userData.employeeId = emp.id; parent.add(m); return m; }
      function cy(r1, r2, h, c, s) { return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s || 12), mat(c)); }
      function sp(r, c) { return new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(c)); }

      var torso = add(cy(0.22, 0.27, 0.6, shirt, 14), rig, 0, 0.96, 0);
      var head = new THREE.Group(); head.position.set(0, 1.56, 0); rig.add(head);
      add(sp(0.3, skin), head, 0, 0, 0);
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.325, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(hair));
      add(cap, head, 0, 0.02, -0.03);
      if (emp.hair === 1) add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.16), mat(hair)), head, 0, -0.08, -0.22);
      if (emp.hair === 2) { add(sp(0.1, hair), head, -0.28, 0.0, -0.02); add(sp(0.1, hair), head, 0.28, 0.0, -0.02); }
      add(sp(0.045, '#1f2937'), head, -0.1, 0.03, 0.27);
      add(sp(0.045, '#1f2937'), head, 0.1, 0.03, 0.27);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), mat('#9a3412')), head, 0, -0.1, 0.285);
      add(sp(0.05, '#f9a8a8'), head, -0.19, -0.05, 0.22).scale.set(1, 0.6, 0.4);
      add(sp(0.05, '#f9a8a8'), head, 0.19, -0.05, 0.22).scale.set(1, 0.6, 0.4);
      if (/Manager|Chief|Lead|Director/.test(emp.role)) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.02), mat(deptById[emp.dept].accent)), rig, 0, 1.0, 0.255);
      }

      function arm(side) {
        var piv = new THREE.Group(); piv.position.set(side * 0.31, 1.2, 0); rig.add(piv);
        add(cy(0.07, 0.065, 0.5, shirt, 8), piv, 0, -0.25, 0);
        add(sp(0.085, skin), piv, 0, -0.54, 0);
        return piv;
      }
      function leg(side) {
        var hip = new THREE.Group(); hip.position.set(side * 0.12, 0.66, 0); rig.add(hip);
        add(cy(0.105, 0.095, 0.32, pants, 10), hip, 0, -0.16, 0);
        var knee = new THREE.Group(); knee.position.set(0, -0.32, 0); hip.add(knee);
        add(cy(0.09, 0.08, 0.32, pants, 10), knee, 0, -0.16, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.28), mat('#111827')), knee, 0, -0.34, 0.05);
        return { hip: hip, knee: knee };
      }
      var armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

      // ວົງເລືອກ + ລູກສອນ
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.64, 32), glow(deptById[emp.dept].accent));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.visible = false; root.add(ring);
      var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), glow('#ef4444'));
      arrow.rotation.x = Math.PI; arrow.position.y = 2.3; arrow.visible = false; root.add(arrow);

      var cup = null;
      if (emp.activity === 'break') {
        cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 10), mat('#f8fafc'));
        cup.position.set(0, -0.6, 0.1); cup.userData.employeeId = emp.id; armR.add(cup);
      }
      var c = {
        emp: emp, root: root, rig: rig, head: head, torso: torso, armL: armL, armR: armR, legL: legL, legR: legR,
        ring: ring, arrow: arrow, mode: 'stand', phase: Math.random() * 10, base: { x: 0, z: 0, yaw: 0 }, route: null, cup: cup,
        meshes: []
      };
      root.traverse(function (o) { if (o.isMesh && o.userData.employeeId) c.meshes.push(o); }); // ring/arrow ບໍ່ມີ employeeId → ບໍ່ຮັບ click
      chars[emp.id] = c; charMeshRoots.push(root);
      return c;
    }

    function sitChar(c, room, s, mode) {
      // ນັ່ງ: ຂາຕັ້ງຂຶ້ນລົງເຮັດຈາກ pose ໃນ animate
      c.mode = mode; c.room = room;
      room.group.add(c.root);
      var hipY = 0.66 * SCALE;
      c.root.position.set(s.x, 0.48 - hipY, s.z);
      c.root.rotation.y = s.yaw;
      c.base.x = s.x; c.base.z = s.z; c.base.yaw = s.yaw;
    }
    function standChar(c, room, s) {
      c.mode = 'stand'; c.room = room;
      room.group.add(c.root);
      c.root.position.set(s.x, 0.1, s.z);
      c.root.rotation.y = s.yaw;
      c.base.x = s.x; c.base.z = s.z; c.base.yaw = s.yaw;
    }

    // ເສັ້ນທາງຍ່າງ: ວົນຮອບຕຶກຍ່ອຍຜ່ານທາງຍ່າງ (ບໍ່ຜ່ານເຟີນິເຈີ)
    var ROUTES = {
      A: [[6.25, -4.25], [18.75, -4.25], [18.75, 4.25], [6.25, 4.25]],      // ອ້ອມ HR
      B: [[-18.75, 4.25], [-6.25, 4.25], [-6.25, 12.75], [-18.75, 12.75]],  // ອ້ອມ IT
      C: [[6.25, 4.25], [18.75, 4.25], [18.75, 12.75], [6.25, 12.75]],      // ອ້ອມ Operations
      D: [[-6.25, -4.25], [6.25, -4.25], [6.25, 4.25], [-6.25, 4.25]]       // ອ້ອມ Marketing
    };

    var meetOrder = [0, 5, 1, 6, 2, 7, 8, 9, 3, 4];
    var meetIdx = 0;
    data.employees.forEach(function (emp) {
      if (emp.activity === 'leave') return; // ບໍ່ຢູ່ຫ້ອງການ → ບໍ່ສະແດງໃນ 3D
      var c = makeChar(emp);
      var room = rooms[emp.dept];
      if (emp.activity === 'work') {
        var s = room.desks[emp.desk];
        if (!s) { standChar(c, room, { x: 0, z: 1.5, yaw: 0 }); } else
        if (emp.dept === 'reception' && emp.desk === 0) { // ຕ້ອນຮັບ: ນັ່ງຫຼັງເຄົາເຕີ
          sitChar(c, room, { x: 0, z: -2.3, yaw: 0 }, 'sit-work');
        } else sitChar(c, room, s, 'sit-work');
      } else if (emp.activity === 'meeting') {
        var m = rooms.meeting, seat = m.seats[meetOrder[meetIdx++ % m.seats.length]];
        sitChar(c, m, seat, 'sit-meet');
      } else if (emp.activity === 'break') {
        standChar(c, rooms.reception, rooms.reception.standSpots[emp.spot || 0]);
        c.mode = 'break';
      } else if (emp.activity === 'walk') {
        scene.add(c.root);
        var pts = ROUTES[emp.route].map(function (p) { return new THREE.Vector3(p[0], 0.02, p[1]); });
        var start = (emp.id.charCodeAt(2) + emp.id.charCodeAt(1)) % pts.length;
        c.route = { pts: pts, i: (start + 1) % pts.length, wait: 0, dir: emp.id.charCodeAt(2) % 2 ? 1 : -1 };
        c.root.position.copy(pts[start]);
        c.mode = 'walk';
      }
    });

    // ---------- animation ຂອງຕົວລະຄອນ ----------
    function poseSit(c, t, meet) {
      var p = c.phase;
      c.legL.hip.rotation.x = c.legR.hip.rotation.x = -Math.PI / 2;
      c.legL.knee.rotation.x = c.legR.knee.rotation.x = Math.PI / 2;
      if (!meet) {
        c.armL.rotation.x = -1.15 + Math.sin(t * 9 + p) * 0.06;
        c.armR.rotation.x = -1.15 + Math.sin(t * 8 + p * 2) * 0.06;
        c.head.rotation.x = 0.05 + Math.sin(t * 0.9 + p) * 0.05;
        c.head.rotation.y = Math.sin(t * 0.3 + p) * 0.12;
      } else {
        c.armL.rotation.x = -0.75;
        var raise = Math.pow(Math.max(0, Math.sin(t * 0.35 + p)), 10);
        c.armR.rotation.x = -0.75 - 1.8 * raise;
        c.head.rotation.y = Math.sin(t * 0.55 + p) * 0.5;
        c.head.rotation.x = Math.sin(t * 1.3 + p) * 0.06;
      }
    }
    function poseStand(c, t) {
      c.legL.hip.rotation.x = c.legR.hip.rotation.x = 0;
      c.legL.knee.rotation.x = c.legR.knee.rotation.x = 0;
      c.armL.rotation.x = Math.sin(t * 1.2 + c.phase) * 0.05;
      c.armR.rotation.x = c.cup ? -1.35 + Math.sin(t * 0.8 + c.phase) * 0.12 : Math.sin(t * 1.2 + c.phase + 1) * 0.05;
      c.head.rotation.y = Math.sin(t * 0.6 + c.phase) * 0.4;
      c.head.rotation.x = Math.sin(t * 1.1 + c.phase) * 0.05;
      c.rig.position.y = Math.sin(t * 1.6 + c.phase) * 0.008;
    }
    function poseWalk(c) {
      var s = Math.sin(c.phase);
      c.legR.hip.rotation.x = s * 0.7; c.legL.hip.rotation.x = -s * 0.7;
      c.legR.knee.rotation.x = Math.max(0, Math.cos(c.phase)) * 0.8;
      c.legL.knee.rotation.x = Math.max(0, -Math.cos(c.phase)) * 0.8;
      c.armR.rotation.x = -s * 0.6; c.armL.rotation.x = s * 0.6;
      c.head.rotation.y *= 0.9; c.head.rotation.x = 0;
      c.rig.position.y = Math.abs(s) * 0.035;
    }

    function updateChars(dt, t) {
      for (var id in chars) {
        var c = chars[id];
        if (c.mode === 'sit-work') poseSit(c, t, false);
        else if (c.mode === 'sit-meet') poseSit(c, t, true);
        else if (c.mode === 'break' || c.mode === 'stand') poseStand(c, t);
        else if (c.mode === 'walk') {
          var r = c.route;
          if (r.wait > 0) { // ຢຸດຄິດ/ເບິ່ງອ້ອມ
            r.wait -= dt; poseStand(c, t);
            if (r.wait <= 0) c.phase = 0;
          } else {
            var tgt = r.pts[r.i], pos = c.root.position;
            var dx = tgt.x - pos.x, dz = tgt.z - pos.z, dist = Math.sqrt(dx * dx + dz * dz);
            var step = 1.5 * dt;
            if (dist <= step) {
              pos.x = tgt.x; pos.z = tgt.z;
              r.i = (r.i + r.dir + r.pts.length) % r.pts.length;
              if (Math.random() < 0.35) r.wait = 1.2 + Math.random() * 2.2;
            } else {
              pos.x += dx / dist * step; pos.z += dz / dist * step;
              c.root.rotation.y = lerpAngle(c.root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
              c.phase += dt * 9;
              poseWalk(c);
            }
          }
        }
        if (c.arrow.visible) c.arrow.position.y = 2.3 + Math.sin(t * 4) * 0.1;
        if (c.ring.visible) { var k = 1 + Math.sin(t * 4) * 0.06; c.ring.scale.set(k, k, k); }
      }
    }

    // ---------- controls / ກ້ອງ ----------
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.85; controls.panSpeed = 0.9;
    controls.screenSpacePanning = false;
    controls.minDistance = 7; controls.maxDistance = 80; // Phase 2: ext.setWorld() ຂະຫຍາຍໄດ້
    controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.25;

    var HOME_TARGET = new THREE.Vector3(0, 0, 1.5);
    var HOME_DIR = new THREE.Vector3(1, 1.05, 1.05).normalize(); // ມຸມ isometric
    var focusGoal = null;
    function homeDist() {
      var a = camera.aspect || 1.6;
      return 66 * (a < 1.5 ? 1.5 / a : 1);
    }
    function placeCamera(target, dir, dist) {
      controls.target.copy(target);
      camera.position.copy(target).add(dir.clone().multiplyScalar(dist));
      camera.lookAt(target);
      controls.update();
    }
    placeCamera(HOME_TARGET, HOME_DIR, 66);

    controls.addEventListener('start', function () { focusGoal = null; });

    function focusOn(target, dist, dir) { focusGoal = { target: target.clone(), dist: clamp(dist, controls.minDistance, controls.maxDistance), dir: dir || null }; }
    function resetCamera() { focusOn(HOME_TARGET, homeDist(), HOME_DIR); }

    var actions = { panL: 0, panR: 0, rotL: 0, rotR: 0, zIn: 0, zOut: 0 }; // ຄ່າ = ເວລາທີ່ຍັງຕ້ອງເຮັດຕໍ່ (ວິນາທີ)
    var held = {};
    function setAction(name, on) {
      held[name] = !!on;
      if (on) { actions[name] = Math.max(actions[name], 0.35); focusGoal = null; }
    }
    var UP = new THREE.Vector3(0, 1, 0);
    function updateActions(dt) {
      var any = false;
      for (var n in actions) {
        if (held[n]) actions[n] = Math.max(actions[n], 0.05);
        if (actions[n] > 0) { any = true; }
      }
      if (!any) return;
      var off = camera.position.clone().sub(controls.target);
      var dist = off.length();
      function on(n) { var v = actions[n] > 0; if (v) actions[n] = Math.max(0, actions[n] - dt); return v; }
      var pl = on('panL'), pr = on('panR'), rl = on('rotL'), rr = on('rotR'), zi = on('zIn'), zo = on('zOut');
      if (pl || pr) {
        camera.updateMatrixWorld();
        var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        right.y = 0; right.normalize();
        var d = (pr ? 1 : 0) - (pl ? 1 : 0);
        right.multiplyScalar(d * dist * 0.55 * dt);
        controls.target.add(right); camera.position.add(right);
      }
      if (rl || rr) off.applyAxisAngle(UP, ((rl ? 1 : 0) - (rr ? 1 : 0)) * 1.4 * dt);
      if (zi || zo) {
        var f = Math.pow(0.28, dt * ((zi ? 1 : 0) - (zo ? 1 : 0)));
        dist = clamp(dist * f, controls.minDistance, controls.maxDistance);
      }
      off.setLength(dist);
      camera.position.copy(controls.target).add(off);
    }
    function updateFocus(dt) {
      if (!focusGoal) return;
      var k = 1 - Math.pow(0.0008, dt);
      var off = camera.position.clone().sub(controls.target);
      var dist = off.length(), dir = off.clone().normalize();
      if (focusGoal.dir) dir.lerp(focusGoal.dir, k).normalize();
      controls.target.lerp(focusGoal.target, k);
      var nd = dist + (focusGoal.dist - dist) * k;
      camera.position.copy(controls.target).add(dir.multiplyScalar(nd));
      if (controls.target.distanceTo(focusGoal.target) < 0.03 && Math.abs(nd - focusGoal.dist) < 0.08) focusGoal = null;
    }
    var BOUNDS = { x0: -26, x1: 26, z0: -18, z1: 20 };
    function clampTarget() {
      var t = controls.target, nx = clamp(t.x, BOUNDS.x0, BOUNDS.x1), nz = clamp(t.z, BOUNDS.z0, BOUNDS.z1);
      if (nx !== t.x || nz !== t.z) { camera.position.x += nx - t.x; camera.position.z += nz - t.z; t.x = nx; t.z = nz; }
    }

    // ---------- ເລືອກ / hover ----------
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    var selEmp = null, selDept = null, hoverEmp = null;
    var allCharMeshes = []; Object.keys(chars).forEach(function (id) { allCharMeshes = allCharMeshes.concat(chars[id].meshes); });

    function setNdc(ev) {
      var r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    }
    function empFromObject(o) { while (o && !(o.userData && o.userData.employeeId)) o = o.parent; return o ? o.userData.employeeId : null; }
    function pickEmployee(ev) {
      setNdc(ev);
      var hits = raycaster.intersectObjects(allCharMeshes, false);
      return hits.length ? empFromObject(hits[0].object) : null;
    }
    function pickDept(ev) {
      setNdc(ev);
      var hits = raycaster.intersectObjects(roomGroups, true);
      for (var i = 0; i < hits.length; i++) { if (hits[i].object.userData && hits[i].object.userData.deptId) return hits[i].object.userData.deptId; }
      return null;
    }

    // ---------- Phase 2 extension: ວັດຖຸນອກຫ້ອງການ (ຄລັງ/ລົດ) ----------
    var worldRoots = [], updaters = [];
    function pickWorld(ev) {
      if (!worldRoots.length) return null;
      setNdc(ev);
      var hits = raycaster.intersectObjects(worldRoots, true);
      for (var i = 0; i < hits.length; i++) { var o = hits[i].object; while (o && !(o.userData && o.userData.worldPick)) o = o.parent; if (o) return o.userData.worldPick; }
      return null;
    }
    function camState() { return { target: controls.target.clone(), dist: camera.position.distanceTo(controls.target) }; }
    var ext = {
      THREE: THREE, scene: scene, camera: camera, controls: controls,
      mat: mat, glow: glow, box: box, cyl: cyl, sph: sph, labelSprite: labelSprite, plant: plant, crate: crate,
      addPickRoot: function (g) { worldRoots.push(g); },
      addUpdater: function (fn) { updaters.push(fn); },
      focusOn: function (target, dist, dir) { clearSelection(); focusOn(target, dist, dir); },
      setWorld: function (o) { if (o.bounds) BOUNDS = o.bounds; if (o.maxDistance) controls.maxDistance = o.maxDistance; },
      homeCamera: function () { clearSelection(); resetCamera(); },
      camState: camState, HOME_DIR: HOME_DIR
    };
    function empWorldPos(id) { var v = new THREE.Vector3(); chars[id].root.updateMatrixWorld(true); chars[id].root.getWorldPosition(v); v.y = 0.9; return v; }

    function highlightDept(id) {
      Object.keys(rooms).forEach(function (k) {
        var on = k === id;
        rooms[k].frame.visible = on;
        rooms[k].floorMat.emissive.set(on ? rooms[k].accent : '#000000');
        rooms[k].floorMat.emissive.multiplyScalar(on ? 0.22 : 1);
      });
    }
    function selectDepartment(id, focus) {
      selDept = id;
      if (selEmp) { chars[selEmp].ring.visible = false; chars[selEmp].arrow.visible = false; selEmp = null; }
      highlightDept(id);
      if (id && focus !== false) focusOn(rooms[id].center, 24);
    }
    function selectEmployee(id, focus) {
      if (selEmp && chars[selEmp]) { chars[selEmp].ring.visible = false; chars[selEmp].arrow.visible = false; }
      selEmp = (id && chars[id]) ? id : null;
      if (selEmp) {
        highlightDept(null); selDept = null;
        chars[selEmp].ring.visible = true; chars[selEmp].arrow.visible = true;
        if (focus !== false) focusOn(empWorldPos(selEmp), 16);
      }
    }
    function clearSelection() {
      if (selEmp && chars[selEmp]) { chars[selEmp].ring.visible = false; chars[selEmp].arrow.visible = false; }
      selEmp = null; selDept = null; highlightDept(null);
    }

    var downX = 0, downY = 0, downT = 0, downOn = false;
    var dom = renderer.domElement;
    function onDown(ev) { downX = ev.clientX; downY = ev.clientY; downT = Date.now(); downOn = true; }
    function onUp(ev) {
      if (!downOn) return; downOn = false;
      var moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (moved > 6 || Date.now() - downT > 600) return;
      var id = pickEmployee(ev);
      if (id) { selectEmployee(id, true); if (cb.onSelectEmployee) cb.onSelectEmployee(id); return; }
      var wp = pickWorld(ev);
      if (wp) { if (cb.onSelectWorld) cb.onSelectWorld(wp); return; }
      var d = pickDept(ev);
      if (d) { selectDepartment(d, true); if (cb.onSelectDepartment) cb.onSelectDepartment(d); return; }
      clearSelection(); if (cb.onSelectEmployee) cb.onSelectEmployee(null);
    }
    var hoverPending = null;
    function onMove(ev) {
      if (ev.buttons) { if (hoverEmp) { hoverEmp = null; dom.style.cursor = ''; if (cb.onHover) cb.onHover(null); } return; }
      if (hoverPending) { hoverPending = ev; return; }
      hoverPending = ev;
      requestAnimationFrame(function () {
        var e = hoverPending; hoverPending = null;
        var id = pickEmployee(e);
        if (id !== hoverEmp) { hoverEmp = id; dom.style.cursor = id ? 'pointer' : ''; }
        if (cb.onHover) cb.onHover(id, e.clientX, e.clientY);
      });
    }
    function onLeave() { hoverEmp = null; dom.style.cursor = ''; if (cb.onHover) cb.onHover(null); }
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerleave', onLeave);

    // ---------- resize + loop ----------
    function resize() {
      var w = container.clientWidth || 800, h = container.clientHeight || 500;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    var ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container); else window.addEventListener('resize', resize);
    resize();
    placeCamera(HOME_TARGET, HOME_DIR, homeDist());

    var clock = new THREE.Clock(), raf = 0, running = true;
    function tick() {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      var dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      updateChars(dt, t);
      for (var ui = 0; ui < updaters.length; ui++) updaters[ui](dt, t);
      sun.position.set(controls.target.x - 18, 34, controls.target.z + 22 - 1.5); sun.target.position.set(controls.target.x, 0, controls.target.z - 1.5); sun.target.updateMatrixWorld();
      updateActions(dt);
      updateFocus(dt);
      controls.update();
      clampTarget();
      renderer.render(scene, camera);
    }
    tick();
    if (cb.onReady) cb.onReady();

    return {
      selectEmployee: selectEmployee,
      selectDepartment: selectDepartment,
      clearSelection: clearSelection,
      resetCamera: resetCamera,
      setAction: setAction,
      hasChar: function (id) { return !!chars[id]; },
      ext: ext,
      dispose: function () {
        running = false; cancelAnimationFrame(raf);
        dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointerup', onUp);
        dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerleave', onLeave);
        if (ro) ro.disconnect(); controls.dispose(); renderer.dispose();
        if (dom.parentNode) dom.parentNode.removeChild(dom);
      }
    };
  }

  window.VO3D = { create: create };
})();
