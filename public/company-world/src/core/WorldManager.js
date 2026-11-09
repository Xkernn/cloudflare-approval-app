import * as THREE from 'three';

export class WorldManager {
  constructor(engine, worlds) {
    this.engine = engine;
    this.worlds = worlds;
    this.pickables = [];
    this.activeWorld = 'hub';
    this.onSelect = () => {};
    this._down = null;
    const canvas = engine.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => { this._down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('click', (e) => this.handleClick(e));
  }
  addPickable(object, worldId) {
    object.traverse((child) => {
      if (child.isMesh) {
        child.userData.worldId = worldId;
        this.pickables.push(child);
      }
    });
  }
  handleClick(event) {
    if (!this._down || Math.abs(event.clientX - this._down.x) + Math.abs(event.clientY - this._down.y) > 7) return;
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    this.engine.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.engine.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.engine.raycaster.setFromCamera(this.engine.pointer, this.engine.camera);
    const hit = this.engine.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit) return;
    const id = hit.object.userData.worldId;
    if (id) this.select(id);
  }
  select(id) {
    const world = this.worlds.find((item) => item.id === id);
    if (!world) return;
    this.activeWorld = id;
    const target = world.group.getWorldPosition(new THREE.Vector3());
    this.focus(target, id === 'hub' ? 44 : 24);
    this.onSelect(world);
  }
  focus(target, distance = 32) {
    const direction = new THREE.Vector3(1, 0.82, 1).normalize();
    const endPosition = target.clone().add(direction.multiplyScalar(distance));
    const startPosition = this.engine.camera.position.clone();
    const startTarget = this.engine.controls.target.clone();
    const start = performance.now();
    const duration = 950;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.engine.camera.position.lerpVectors(startPosition, endPosition, eased);
      this.engine.controls.target.lerpVectors(startTarget, target, eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
