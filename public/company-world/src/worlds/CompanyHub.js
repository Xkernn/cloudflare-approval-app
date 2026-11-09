import * as THREE from 'three';

const mat = (color, roughness = 0.72, metalness = 0.08, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const M = {
  grass: mat(0x718b67), grass2: mat(0x8b9b72), stone: mat(0xb8b9a8), road: mat(0x596b6c, 0.94),
  dark: mat(0x1a303b, 0.38, 0.48), glass: mat(0x8bb7bd, 0.2, 0.42, { transparent: true, opacity: 0.72 }),
  gold: mat(0xc5a15d, 0.3, 0.7), white: mat(0xe5e5d9), wood: mat(0x70543d), leaf: mat(0x3f684e),
  water: mat(0x6faaa9, 0.17, 0.55), concrete: mat(0xc4c6ba, 0.82),
  office: mat(0x7899a0), warehouse: mat(0xb99a67), retail: mat(0x6e9a7d), logistics: mat(0xb77d5f), province: mat(0x8292b1)
};

function addMesh(group, geometry, material, position, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function box(group, w, h, d, material, x, y, z) { return addMesh(group, new THREE.BoxGeometry(w, h, d), material, [x, y, z]); }
function cylinder(group, r1, r2, h, material, x, y, z, segments = 48) { return addMesh(group, new THREE.CylinderGeometry(r1, r2, h, segments), material, [x, y, z]); }
function label(text, color = '#f4e4bd') {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(7,22,28,.72)';
  ctx.beginPath(); ctx.roundRect(18, 20, 476, 88, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(214,179,107,.7)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = color; ctx.font = '600 34px Manrope, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.toUpperCase(), 256, 65, 440);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(8.4, 2.1, 1); return sprite;
}
function makeTree(scene, x, z, size = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group);
  cylinder(group, .14 * size, .2 * size, 1.35 * size, M.wood, 0, .68 * size, 0, 10);
  for (let i = 0; i < 3; i++) {
    const crown = addMesh(group, new THREE.IcosahedronGeometry(.8 * size - i * .08, 1), M.leaf, [0, (1.35 + i * .43) * size, 0], [1.05, .95, 1.0]);
    crown.castShadow = true;
  }
  return group;
}
function makeBuilding(group, style, x, z, width = 7, depth = 5) {
  const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
  const base = box(g, width, .6, depth, M.concrete, 0, .3, 0);
  const bodyMat = style === 'warehouse' ? M.warehouse : style === 'retail' ? M.retail : style === 'logistics' ? M.logistics : style === 'province' ? M.province : M.office;
  box(g, width * .92, 3.4, depth * .9, bodyMat, 0, 2.3, 0);
  box(g, width * .98, .22, depth * .98, M.dark, 0, 4.1, 0);
  for (let i = -1; i <= 1; i++) {
    box(g, width * .19, 1.6, .08, M.glass, i * width * .27, 2.35, depth * .455);
  }
  box(g, width * .24, 2.1, .12, M.dark, 0, 1.75, depth * .46);
  base.receiveShadow = true;
  return g;
}

export class CompanyHub {
  constructor(scene) {
    this.scene = scene;
    this.worlds = [];
    this.animated = [];
    this.buildGround();
    this.buildCentralTower();
    this.buildGateways();
    this.buildLandscape();
  }
  buildGround() {
    const ground = addMesh(this.scene, new THREE.CircleGeometry(76, 96), M.grass, [0, -0.65, 0]);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    const plaza = cylinder(this.scene, 38, 38, .35, M.stone, 0, -.35, 0, 96);
    const inner = cylinder(this.scene, 27, 27, .16, M.concrete, 0, -.08, 0, 96);
    const roadRing = addMesh(this.scene, new THREE.RingGeometry(31.5, 34.2, 96), M.road, [0, -.12, 0]); roadRing.rotation.x = -Math.PI / 2;
    const pool = cylinder(this.scene, 11.8, 11.8, .14, M.water, 0, .03, 0, 72);
    const poolTrim = addMesh(this.scene, new THREE.TorusGeometry(12.3, .24, 10, 72), M.gold, [0, .15, 0]); poolTrim.rotation.x = Math.PI / 2;
    // Five radial stone promenades.
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const path = box(this.scene, 3.2, .08, 20, M.concrete, Math.sin(a) * 18, -.02, Math.cos(a) * 18);
      path.rotation.y = a;
    }
    // Small landscape terraces around the campus.
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI * 2 / 24; const r = 47 + (i % 3) * 1.2;
      const mound = addMesh(this.scene, new THREE.SphereGeometry(1, 18, 12), i % 2 ? M.grass2 : M.grass, [Math.sin(a) * r, -.15, Math.cos(a) * r], [5.5, 1.5 + (i % 4) * .3, 4.2]);
      mound.castShadow = false;
    }
  }
  buildCentralTower() {
    const g = new THREE.Group(); this.scene.add(g);
    cylinder(g, 8, 8.5, .8, M.dark, 0, .45, 0, 64);
    cylinder(g, 7.3, 7.3, .22, M.gold, 0, .95, 0, 64);
    cylinder(g, 6.9, 6.9, .22, M.dark, 0, 1.15, 0, 64);
    box(g, 5.8, 17.5, 5.8, M.glass, 0, 10, 0);
    box(g, 6.25, .34, 6.25, M.gold, 0, 1.55, 0);
    box(g, 6.2, .32, 6.2, M.dark, 0, 18.85, 0);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8; const radius = 3.08;
      const fin = box(g, .14, 17.1, .2, M.gold, Math.sin(a) * radius, 10, Math.cos(a) * radius);
      fin.rotation.y = -a;
    }
    for (const y of [4.2, 7.6, 11, 14.4, 18.65]) {
      const ring = addMesh(g, new THREE.TorusGeometry(4.0, .075, 8, 64), M.gold, [0, y, 0]); ring.rotation.x = Math.PI / 2;
    }
    cylinder(g, 3.7, 3.7, .55, M.dark, 0, 19.2, 0, 48);
    cylinder(g, 1.55, 2.1, .45, M.gold, 0, 19.65, 0, 40);
    box(g, .2, 2.1, .2, M.gold, 0, 20.9, 0);
    const beacon = addMesh(g, new THREE.SphereGeometry(.36, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf2d58f, emissive: 0xd59b43, emissiveIntensity: 1.7 }), [0, 22.1, 0]);
    this.animated.push({ object: beacon, y: 22.1, phase: 0 });
    // Main entrance and forecourt steps.
    box(g, 7.8, .24, 2.2, M.gold, 0, 1.9, 4.0);
    box(g, 7.2, .18, 1.8, M.dark, 0, 1.72, 4.0);
    for (let i = 0; i < 4; i++) box(g, 6.6 - i * .38, .13, .65, M.concrete, 0, 1.5 - i * .14, 4.65 + i * .46);
    const sign = label('Beerlao Central Tower'); sign.position.set(0, 5.2, 3.03); sign.scale.set(7.8, 1.95, 1); g.add(sign);
    this.tower = g;
  }
  buildGateways() {
    const defs = [
      { id: 'office', name: 'Head Office', desc: 'Departments, executive workspace and daily reporting.', color: 0x83b6c2, material: M.office },
      { id: 'warehouse', name: 'Warehouses', desc: 'Cooler inventory, stock visibility and storage operations.', color: 0xd2ad68, material: M.warehouse },
      { id: 'retail', name: 'Retail Network', desc: 'Outlet coverage, installed coolers and shop network.', color: 0x83b58f, material: M.retail },
      { id: 'logistics', name: 'Logistics', desc: 'Truck movements, delivery routes and cooler transfers.', color: 0xc18a68, material: M.logistics },
      { id: 'province', name: 'Province Network', desc: 'Provincial distribution and regional operations.', color: 0x91a3cb, material: M.province }
    ];
    defs.forEach((def, i) => {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const x = Math.sin(angle) * 25; const z = Math.cos(angle) * 25;
      const group = new THREE.Group(); group.position.set(x, 0, z); this.scene.add(group);
      cylinder(group, 4.5, 4.8, .48, M.dark, 0, .24, 0, 40);
      cylinder(group, 4.1, 4.1, .12, M.gold, 0, .53, 0, 40);
      box(group, 5.0, .35, 4.0, M.dark, 0, .83, 0);
      box(group, 4.3, 2.9, .18, M.glass, 0, 2.35, -1.7);
      box(group, 4.3, 2.9, .18, M.glass, 0, 2.35, 1.7);
      box(group, .18, 2.8, 3.35, M.gold, -2.12, 2.35, 0);
      box(group, .18, 2.8, 3.35, M.gold, 2.12, 2.35, 0);
      box(group, 4.9, .22, 4.2, def.material, 0, 3.86, 0);
      const portalMat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: .24, metalness: .55, roughness: .28 });
      const portal = addMesh(group, new THREE.TorusGeometry(1.12, .09, 10, 48), portalMat, [0, 2.25, 1.83]); portal.scale.set(1.05, 1.28, 1);
      const marker = addMesh(group, new THREE.SphereGeometry(.2, 20, 14), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: .8 }), [0, 4.45, 0]);
      this.animated.push({ object: marker, y: 4.45, phase: i * .9 });
      const sign = label(def.name, '#f2e4c3'); sign.position.set(0, 5.25, 0); sign.scale.set(6.4, 1.6, 1); group.add(sign);
      // Decorative building beyond each gateway.
      if (def.id === 'warehouse') {
        makeBuilding(group, 'warehouse', 0, -7.3, 9.4, 7.2);
        for (let j = -1; j <= 1; j++) box(group, 1.7, 2.1, .13, M.dark, j * 2.7, 1.65, -3.55);
      } else if (def.id === 'office') {
        makeBuilding(group, 'office', 0, -7.3, 7.5, 5.8);
        for (let j = 0; j < 3; j++) box(group, .22, 3.1, .22, M.gold, -2.8 + j * 2.8, 2.0, -4.2);
      } else if (def.id === 'retail') {
        for (let j = -1; j <= 1; j++) makeBuilding(group, 'retail', j * 4.0, -7.4, 3.3, 4.2);
      } else if (def.id === 'logistics') {
        makeBuilding(group, 'logistics', 0, -7.5, 9.0, 5.6);
        this.addTruck(group, 5.8, .25, -4.7);
      } else {
        makeBuilding(group, 'province', -2.6, -7.4, 4.5, 4.2);
        makeBuilding(group, 'province', 3.0, -8.1, 4.0, 3.7);
        for (let j = 0; j < 4; j++) cylinder(group, .12, .18, 1.4, M.wood, -5 + j * 3.1, .7, -11, 8);
      }
      group.userData.worldId = def.id;
      this.worlds.push({ ...def, group });
    });
  }
  addTruck(group, x, y, z) {
    const truck = new THREE.Group(); truck.position.set(x, y, z); group.add(truck);
    box(truck, 2.4, 1.05, 1.25, M.white, 0, .75, 0);
    box(truck, .95, .9, 1.15, M.logistics, 1.55, .78, 0);
    box(truck, .65, .52, .035, M.glass, 1.75, .92, .59);
    for (const wx of [-.65, 1.35]) { const wheel = cylinder(truck, .28, .28, .18, M.dark, wx, .3, .66, 20); wheel.rotation.x = Math.PI / 2; }
  }
  buildLandscape() {
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI * 2 / 32; const r = 40 + (i % 4) * 1.4;
      makeTree(this.scene, Math.sin(a) * r, Math.cos(a) * r, .78 + (i % 4) * .08);
    }
    // Plaza lights.
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI * 2 / 12; const x = Math.sin(a) * 16; const z = Math.cos(a) * 16;
      cylinder(this.scene, .055, .08, 2.7, M.dark, x, 1.35, z, 8);
      box(this.scene, .48, .08, .16, M.gold, x, 2.68, z);
    }
    // Thin road markings around the plaza.
    for (let i = 0; i < 40; i++) {
      const a = i * Math.PI * 2 / 40; const r = 33;
      const dash = box(this.scene, .16, .035, 1.0, M.white, Math.sin(a) * r, .08, Math.cos(a) * r);
      dash.rotation.y = a;
    }
  }
  update(elapsed) {
    for (const item of this.animated) item.object.position.y = item.y + Math.sin(elapsed * 1.3 + item.phase) * .13;
    for (const world of this.worlds) {
      const portal = world.group.children.find((child) => child.geometry?.type === 'TorusGeometry');
      if (portal) portal.rotation.z = Math.sin(elapsed * .5 + world.group.position.x) * .035;
    }
  }
}
