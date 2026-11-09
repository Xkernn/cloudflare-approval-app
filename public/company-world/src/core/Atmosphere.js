import * as THREE from 'three';

export class Atmosphere {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.hemisphere = new THREE.HemisphereLight(0xddebf0, 0x596c55, 1.35);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xffe3bd, 2.4);
    this.sun.position.set(-42, 68, 35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.22);
    this.scene.add(this.ambient);
    this.nightOverride = null;
    this.applyByClock();
  }
  applyByClock() {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Vientiane', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const mode = hour < 6 || hour >= 19 ? 'night' : hour < 10 ? 'morning' : hour < 16 ? 'day' : 'sunset';
    this.setMode(this.nightOverride === null ? mode : (this.nightOverride ? 'night' : 'day'));
    return mode;
  }
  setMode(mode) {
    const palettes = {
      night: { sky: 0x101c2b, ground: 0x202d31, hemi: 0.42, sun: 0.32, sunColor: 0x8ba6d2, exposure: 0.88 },
      morning: { sky: 0xb5c8cb, ground: 0x65745f, hemi: 1.25, sun: 2.0, sunColor: 0xffd8a5, exposure: 1.12 },
      day: { sky: 0x9bb0b5, ground: 0x62765e, hemi: 1.35, sun: 2.45, sunColor: 0xffe3bd, exposure: 1.13 },
      sunset: { sky: 0xa98983, ground: 0x665c4d, hemi: 0.9, sun: 1.55, sunColor: 0xffad78, exposure: 1.05 }
    };
    const p = palettes[mode] || palettes.day;
    this.scene.background.setHex(p.sky);
    this.scene.fog.color.setHex(p.sky);
    this.hemisphere.intensity = p.hemi;
    this.sun.intensity = p.sun;
    this.sun.color.setHex(p.sunColor);
    this.ambient.intensity = mode === 'night' ? 0.42 : 0.22;
    this.engine.renderer.toneMappingExposure = p.exposure;
    this.mode = mode;
  }
  toggleNight() {
    this.nightOverride = this.mode !== 'night';
    this.setMode(this.nightOverride ? 'night' : 'day');
    return this.mode;
  }
}
