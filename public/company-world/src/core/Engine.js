import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Engine {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9bb0b5);
    this.scene.fog = new THREE.FogExp2(0x9bb0b5, 0.0029);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
    this.camera.position.set(58, 48, 62);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.8));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 145;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.target.set(0, 4, 0);
    this.controls.update();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.running = false;
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize, { passive: true });
  }
  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 700 ? 1.25 : 1.75));
    this.renderer.setSize(w, h);
  }
  start(update = () => {}) {
    this.running = true;
    const frame = () => {
      if (!this.running) return;
      requestAnimationFrame(frame);
      const delta = Math.min(this.clock.getDelta(), 0.05);
      this.controls.update();
      update(delta, this.clock.elapsedTime);
      this.renderer.render(this.scene, this.camera);
    };
    frame();
  }
  dispose() {
    this.running = false;
    window.removeEventListener('resize', this._resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
