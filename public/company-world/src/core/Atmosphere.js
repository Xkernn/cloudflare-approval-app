import * as THREE from 'three';
export class Atmosphere {
  constructor(engine){
    this.engine=engine;this.scene=engine.scene;
    this.hemisphere=new THREE.HemisphereLight(0xeaf5ff,0x9ab58a,1.65);this.scene.add(this.hemisphere);
    this.sun=new THREE.DirectionalLight(0xfff1d7,2.55);this.sun.position.set(-48,82,42);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-75;this.sun.shadow.camera.right=75;
    this.sun.shadow.camera.top=75;this.sun.shadow.camera.bottom=-75;this.sun.shadow.normalBias=.035;
    this.scene.add(this.sun);this.scene.add(this.sun.target);
    this.ambient=new THREE.AmbientLight(0xffffff,.3);this.scene.add(this.ambient);
    this.nightOverride=null;this.applyByClock();
  }
  applyByClock(){
    const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Vientiane',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
    const mode=hour<6||hour>=19?'night':hour<10?'morning':hour<16?'day':'sunset';
    this.setMode(this.nightOverride===null?mode:(this.nightOverride?'night':'day'));return mode;
  }
  setMode(mode){
    const palettes={
      night:{sky:0x253a58,ground:0x8296ad,hemi:.8,sun:.55,sunColor:0x9cb9ef,exposure:1.05},
      morning:{sky:0xdceeff,ground:0xb8d4a9,hemi:1.55,sun:2.25,sunColor:0xffe3b8,exposure:1.2},
      day:{sky:0xeaf4ff,ground:0xc7dfb8,hemi:1.7,sun:2.55,sunColor:0xfff1d7,exposure:1.22},
      sunset:{sky:0xf5e5d9,ground:0xc5cda9,hemi:1.25,sun:1.55,sunColor:0xffc18c,exposure:1.12}
    };
    const p=palettes[mode]||palettes.day;
    this.scene.background.setHex(p.sky);this.scene.fog.color.setHex(p.sky);
    this.hemisphere.intensity=p.hemi;this.sun.intensity=p.sun;this.sun.color.setHex(p.sunColor);
    this.ambient.intensity=mode==='night'?.38:.3;this.engine.renderer.toneMappingExposure=p.exposure;this.mode=mode;
  }
  toggleNight(){this.nightOverride=this.mode!=='night';this.setMode(this.nightOverride?'night':'day');return this.mode;}
}