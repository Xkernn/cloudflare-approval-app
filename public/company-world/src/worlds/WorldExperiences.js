import * as THREE from 'three';

const material = (color, roughness = 0.72, metalness = 0.08, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const MAT = {
  ground: material(0x65766a), concrete: material(0xb8b9ad), asphalt: material(0x3b4b50, 0.96),
  navy: material(0x172d39, 0.42, 0.42), glass: material(0x75aab4, 0.22, 0.42, { transparent: true, opacity: 0.78 }),
  gold: material(0xc5a15d, 0.34, 0.62), white: material(0xe7e5d9), red: material(0x9b493a),
  green: material(0x587b5c), blue: material(0x527d98), wood: material(0x73543b),
  rack: material(0x52636a, 0.46, 0.6), cooler: material(0xe4e8e4, 0.36, 0.16),
  darkGlass: material(0x233d49, 0.18, 0.42), leaf: material(0x3f684e)
};

function mesh(parent, geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const item = new THREE.Mesh(geometry, mat);
  item.position.set(x, y, z); item.scale.set(sx, sy, sz);
  item.castShadow = true; item.receiveShadow = true; parent.add(item);
  return item;
}
function box(parent, w, h, d, mat, x, y, z) { return mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
function cylinder(parent, rTop, rBottom, h, mat, x, y, z, segments = 24) {
  return mesh(parent, new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat, x, y, z);
}
function textSprite(text, color = '#f1dfb8') {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(9,25,32,.82)'; ctx.beginPath(); ctx.roundRect(8, 8, 752, 144, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(197,161,93,.8)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = color; ctx.font = '700 42px Manrope, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 384, 80, 700);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(13, 2.7, 1); return sprite;
}
function baseWorld(group, title, subtitle) {
  mesh(group, new THREE.PlaneGeometry(150, 150), MAT.ground, 0, -0.2, 0).rotation.x = -Math.PI / 2;
  const platform = box(group, 56, 0.5, 42, MAT.concrete, 0, 0.05, 0);
  platform.receiveShadow = true;
  const titleTag = textSprite(title); titleTag.position.set(0, 16, -19); group.add(titleTag);
  const subTag = textSprite(subtitle, '#b8c9c3'); subTag.position.set(0, 12.8, -19); subTag.scale.set(10, 1.8, 1); group.add(subTag);
  // Framing lights and landscaped perimeter make each scene read as a place, not a floating model.
  for (const x of [-25, 25]) for (const z of [-17, 17]) {
    cylinder(group, 0.08, 0.12, 4.2, MAT.navy, x, 2.1, z, 10);
    mesh(group, new THREE.SphereGeometry(0.24, 12, 8), MAT.gold, x, 4.25, z);
  }
}
function addTree(group, x, z, size = 1) {
  cylinder(group, 0.18 * size, 0.24 * size, 1.7 * size, MAT.wood, x, 0.85 * size, z, 10);
  mesh(group, new THREE.IcosahedronGeometry(1.05 * size, 1), MAT.leaf, x, 2.05 * size, z, 1.1, 1.25, 1.05);
  mesh(group, new THREE.IcosahedronGeometry(0.72 * size, 1), MAT.green, x + 0.2 * size, 2.75 * size, z, 1.1, 1.1, 1.05);
}
function addCooler(group, x, z, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); group.add(g);
  box(g, 1.45, 2.75, 1.15, MAT.cooler, 0, 1.42, 0);
  box(g, 1.22, 2.15, 0.08, MAT.darkGlass, 0, 1.55, 0.61);
  box(g, 1.12, 0.16, 0.12, MAT.gold, 0, 2.72, 0.68);
  box(g, 0.16, 0.72, 0.1, MAT.white, 0.48, 1.52, 0.69);
  box(g, 1.15, 0.13, 0.1, MAT.red, 0, 2.98, 0.67);
  return g;
}
function addTruck(group, x, z, color = MAT.white, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); group.add(g);
  box(g, 5.6, 2.3, 2.5, color, -0.8, 1.55, 0);
  box(g, 2.2, 2.0, 2.35, MAT.red, 3.0, 1.42, 0);
  box(g, 1.25, 1.0, 0.06, MAT.glass, 3.45, 1.8, 1.2);
  for (const wx of [-2.3, 2.7]) for (const wz of [-1.05, 1.05]) {
    const wheel = cylinder(g, 0.58, 0.58, 0.32, MAT.navy, wx, 0.55, wz, 20); wheel.rotation.x = Math.PI / 2;
  }
  box(g, 4.7, 0.13, 2.6, MAT.gold, -0.8, 2.78, 0);
  return g;
}
function addRack(group, x, z, levels = 3) {
  const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
  for (const sx of [-1.9, 1.9]) box(g, 0.18, levels * 1.75 + 0.6, 0.22, MAT.rack, sx, (levels * 1.75 + 0.6) / 2, 0);
  for (let level = 0; level < levels; level++) {
    const y = 0.9 + level * 1.75;
    box(g, 4.0, 0.14, 1.15, MAT.gold, 0, y, 0);
    for (let slot = -1; slot <= 1; slot++) {
      box(g, 0.95, 1.1, 0.82, level % 2 ? MAT.blue : MAT.wood, slot * 1.25, y + 0.62, 0);
    }
  }
  return g;
}

export class WorldExperiences {
  constructor(scene) {
    this.scene = scene; this.worlds = new Map(); this.animated = [];
    this.buildOffice(); this.buildWarehouse(); this.buildRetail(); this.buildLogistics(); this.buildProvince();
    for (const group of this.worlds.values()) { group.visible = false; scene.add(group); }
  }
  create(id, title, subtitle) {
    const group = new THREE.Group(); group.name = `${id}-world`; group.userData.worldId = id;
    baseWorld(group, title, subtitle); this.worlds.set(id, group); return group;
  }
  buildOffice() {
    const g = this.create('office', 'Head Office', 'PEOPLE · DEPARTMENTS · DAILY REPORTING');
    box(g, 18, 10, 13, MAT.navy, 0, 5.3, -1);
    box(g, 18.8, 0.5, 13.8, MAT.gold, 0, 10.5, -1);
    for (let floor = 0; floor < 4; floor++) for (let col = -2; col <= 2; col++) {
      box(g, 2.65, 1.25, 0.12, MAT.glass, col * 3.2, 2.1 + floor * 2.1, 5.58);
    }
    box(g, 4.2, 3.8, 0.3, MAT.darkGlass, 0, 2.2, 5.72);
    box(g, 8, 0.45, 3.5, MAT.concrete, 0, 0.45, 8.5);
    for (let i = -2; i <= 2; i++) cylinder(g, 0.18, 0.18, 3.1, MAT.gold, i * 1.6, 1.55, 8.5, 12);
    for (const x of [-17, 17]) addTree(g, x, -6, 1.3);
    const flag = box(g, 0.12, 5.4, 0.12, MAT.gold, 13, 2.7, -7);
    box(g, 2.4, 1.2, 0.08, MAT.red, 14.2, 4.5, -7);
    this.animated.push({ type: 'flag', object: flag, base: flag.position.y });
  }
  buildWarehouse() {
    const g = this.create('warehouse', 'Warehouse World', 'COOLER STOCK · STORAGE · INVENTORY CONTROL');
    box(g, 31, 0.7, 22, MAT.concrete, 0, 0.6, -1);
    box(g, 29, 8.5, 19, MAT.white, 0, 5.1, -2);
    box(g, 30, 0.55, 20, MAT.navy, 0, 9.5, -2);
    box(g, 9, 5.8, 0.24, MAT.darkGlass, 0, 3.6, 7.55);
    for (const x of [-11, 11]) box(g, 0.35, 8.2, 0.35, MAT.gold, x, 5, 7.65);
    for (const x of [-10, -3.4, 3.4, 10]) addRack(g, x, -3, 3);
    for (const x of [-9, -4.5, 0, 4.5, 9]) addCooler(g, x, 5.5, 0.82);
    for (let i = 0; i < 5; i++) box(g, 0.12, 0.035, 16, MAT.gold, -13 + i * 6.5, 0.99, -1);
    const beacon = mesh(g, new THREE.SphereGeometry(0.36, 18, 12), new THREE.MeshStandardMaterial({ color: 0x8dd4bd, emissive: 0x2b9878, emissiveIntensity: 1.2 }), 13, 11.3, 7);
    this.animated.push({ type: 'pulse', object: beacon, base: 1 });
  }
  buildRetail() {
    const g = this.create('retail', 'Retail Network', 'OUTLETS · COOLER PLACEMENT · SHOP COVERAGE');
    box(g, 42, 0.45, 24, MAT.concrete, 0, 0.2, 0);
    for (let i = -2; i <= 2; i++) {
      const x = i * 8;
      box(g, 6.7, 4.8, 7.5, i % 2 ? MAT.white : MAT.green, x, 2.75, -3.2);
      box(g, 6.9, 0.4, 7.8, MAT.red, x, 5.25, -3.2);
      box(g, 2.2, 2.3, 0.12, MAT.darkGlass, x, 1.75, 0.62);
      box(g, 1.1, 0.8, 0.12, MAT.gold, x, 4.55, 0.68);
      addCooler(g, x + 2.3, 2.1, 0.72);
      const sign = textSprite(`SHOP ${String(i + 3).padStart(2, '0')}`, '#f7e9c9'); sign.position.set(x, 6.6, 1.1); sign.scale.set(4.2, 0.9, 1); g.add(sign);
    }
    box(g, 44, 0.12, 4.5, MAT.asphalt, 0, 0.5, 11.2);
    for (const x of [-18, -9, 0, 9, 18]) addTree(g, x, -11, 0.75);
  }
  buildLogistics() {
    const g = this.create('logistics', 'Logistics World', 'TRUCK FLEET · DELIVERY · COOLER TRANSFERS');
    box(g, 48, 0.4, 27, MAT.asphalt, 0, 0.1, 0);
    box(g, 20, 7.5, 11, MAT.navy, -12, 4, -5);
    box(g, 20.6, 0.45, 11.5, MAT.gold, -12, 7.9, -5);
    for (let i = 0; i < 4; i++) {
      box(g, 3.2, 3.5, 0.18, MAT.darkGlass, -19 + i * 4.7, 2.5, 0.62);
      box(g, 3.2, 0.16, 0.22, MAT.gold, -19 + i * 4.7, 4.35, 0.7);
    }
    const truck1 = addTruck(g, 4, -4, MAT.white, 0.92);
    const truck2 = addTruck(g, 15, 7, MAT.blue, 0.75);
    this.animated.push({ type: 'truck', object: truck1, origin: 4, amplitude: 5, speed: 0.16 });
    this.animated.push({ type: 'truck', object: truck2, origin: 15, amplitude: 3.5, speed: 0.12, phase: 1.4 });
    for (let i = -3; i <= 3; i++) box(g, 0.16, 0.04, 2.2, MAT.gold, i * 5, 0.34, 0);
    addTree(g, -23, 9, 1.1); addTree(g, 23, -10, 1.1);
  }
  buildProvince() {
    const g = this.create('province', 'Province Network', 'REGIONAL HUBS · PROVINCE COVERAGE · DISTRIBUTION');
    box(g, 42, 0.45, 26, MAT.concrete, 0, 0.2, 0);
    const hub = cylinder(g, 3.2, 3.8, 1.1, MAT.navy, 0, 1, 0, 48);
    cylinder(g, 2.7, 2.7, 0.18, MAT.gold, 0, 1.65, 0, 48);
    box(g, 2.3, 4.5, 2.3, MAT.glass, 0, 4, 0);
    const positions = [[-14,-7],[-7,8],[8,-8],[15,7],[-17,7],[2,9]];
    positions.forEach(([x,z], i) => {
      const height = 2.8 + (i % 3) * 0.7;
      cylinder(g, 1.4, 1.7, 0.45, MAT.navy, x, 0.75, z, 24);
      box(g, 2.5, height, 2.5, i % 2 ? MAT.green : MAT.blue, x, 0.95 + height / 2, z);
      box(g, 2.65, 0.18, 2.65, MAT.gold, x, 1.02 + height, z);
      for (let w = -1; w <= 1; w++) box(g, 0.32, 0.42, 0.06, MAT.glass, x + w * 0.65, 1.35, z + 1.28);
      const node = mesh(g, new THREE.SphereGeometry(0.32, 16, 10), new THREE.MeshStandardMaterial({ color: 0xf1ce81, emissive: 0x956c2e, emissiveIntensity: 0.8 }), x, height + 2, z);
      this.animated.push({ type: 'node', object: node, base: node.position.y, phase: i * 0.7 });
      const line = mesh(g, new THREE.CylinderGeometry(0.055, 0.055, 1, 8), MAT.gold, 0, 0, 0);
      const a = new THREE.Vector3(0, 1.4, 0), b = new THREE.Vector3(x, 1.2, z);
      line.position.copy(a).add(b).multiplyScalar(0.5); line.scale.y = a.distanceTo(b); line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    });
    addTree(g, -23, -11, 0.8); addTree(g, 23, 11, 0.8);
  }
  show(id) {
    for (const [key, group] of this.worlds) group.visible = key === id;
    return this.worlds.get(id) || null;
  }
  hideAll() { for (const group of this.worlds.values()) group.visible = false; }
  update(elapsed) {
    for (const item of this.animated) {
      if (item.type === 'pulse') item.object.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.16);
      if (item.type === 'node') item.object.position.y = item.base + Math.sin(elapsed * 1.1 + item.phase) * 0.18;
      if (item.type === 'truck') item.object.position.x = item.origin + Math.sin(elapsed * item.speed + (item.phase || 0)) * item.amplitude;
      if (item.type === 'flag') item.object.rotation.z = Math.sin(elapsed * 2.4) * 0.08;
    }
  }
}
