import * as THREE from 'three';

const material = (color, roughness = 0.78, metalness = 0.02) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const M = {
  lawn: material(0xd9edc9), lawn2: material(0xc8e4b9), concrete: material(0xe9eef4), road: material(0xb8c8d9),
  roadLine: material(0xffd66e), blue: material(0x1768d8, .62), blueDark: material(0x0d4eaa, .66),
  blueLight: material(0x4d9bfa, .55), white: material(0xf8fbff), glass: new THREE.MeshStandardMaterial({color:0x9ed8f4,roughness:.2,metalness:.18,transparent:true,opacity:.72}),
  gold: material(0xf0c34f,.48), dark: material(0x243b59), wood: material(0xb98954), carton: material(0xd8b27b),
  green: material(0x55a76a), leaf: material(0x4eaa68), tire: material(0x263342), window: material(0x8dc8ed,.24,.08),
  retailYellow: material(0xf2c34e), red: material(0xe94c4c)
};
const box = (parent,w,h,d,mat,x,y,z,opts={}) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z); mesh.castShadow=opts.castShadow!==false; mesh.receiveShadow=true;
  if(opts.rotationY) mesh.rotation.y=opts.rotationY;
  parent.add(mesh); return mesh;
};
const cylinder = (parent,rTop,rBottom,h,mat,x,y,z,segments=20) => {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,segments),mat);
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
};
function textSprite(text, bg='#155fc5') {
  const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=128;
  const c=canvas.getContext('2d'); c.clearRect(0,0,512,128);
  c.fillStyle=bg; c.beginPath(); c.roundRect(14,15,484,98,30); c.fill();
  c.strokeStyle='rgba(255,255,255,.9)'; c.lineWidth=5; c.stroke();
  c.fillStyle='#fff'; c.font='700 42px Arial'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(text,256,65,450);
  const tex=new THREE.CanvasTexture(canvas); tex.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
  sprite.scale.set(10,2.5,1); return sprite;
}
function makeTree(parent,x,z,s=1) {
  const g=new THREE.Group(); g.position.set(x,0,z); parent.add(g);
  cylinder(g,.16*s,.23*s,1.25*s,M.wood,0,.62*s,0,10);
  for(let i=0;i<3;i++){
    const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(.8*s-i*.09,1),M.leaf);
    crown.position.set(0,(1.35+i*.38)*s,0); crown.scale.set(1.05,.92,1); crown.castShadow=true; g.add(crown);
  }
  return g;
}
function makePallet(parent,x,z,scale=1) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  box(g,1.55*scale,.16*scale,1.25*scale,M.wood,0,.1*scale,0);
  for(let i=0;i<3;i++) box(g,.13*scale,.16*scale,1.28*scale,M.carton,(-.55+i*.55)*scale,.11*scale,0);
  const cartons=[[0,.58,0],[-.32,.58,-.22],[.32,.58,-.22],[0,1.02,-.1]];
  cartons.slice(0,scale>1?4:3).forEach(([cx,cy,cz],i)=>{
    box(g,.52*scale,.55*scale,.48*scale,i%2?M.carton:M.wood,cx*scale,cy*scale,cz*scale);
    box(g,.54*scale,.035*scale,.5*scale,M.gold,cx*scale,(cy+.2)*scale,cz*scale);
  });
  return g;
}
function makeCooler(parent,x,y,z,scale=1) {
  const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);
  box(g,.82*scale,1.65*scale,.72*scale,M.white,0,.83*scale,0);
  box(g,.76*scale,1.52*scale,.05*scale,M.blue,0,.84*scale,.38*scale);
  box(g,.65*scale,.09*scale,.035*scale,M.white,0,1.48*scale,.415*scale);
  box(g,.035*scale,.22*scale,.035*scale,M.gold,.27*scale,.9*scale,.42*scale);
  return g;
}
function makeTruck(parent,x,z,scale=1,rotation=0) {
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;g.scale.setScalar(scale);parent.add(g);
  box(g,3.1,.18,1.55,M.dark,0,.12,0);
  box(g,2.05,1.42,1.48,M.white,-.35,1.0,0);
  box(g,1.05,1.25,1.42,M.blue,.95,.9,0);
  box(g,.65,.58,.045,M.window,1.02,1.15,.735);
  box(g,.12,.2,.05,M.gold,1.48,.48,.75);
  // Beerlao-style gold side stripe (generic company fleet livery).
  box(g,1.75,.12,.025,M.retailYellow,-.32,1.1,.755);
  for(const wx of [-1.05,.95]) for(const wz of [-.78,.78]) {
    const wheel=cylinder(g,.34,.34,.18,M.tire,wx,.36,wz,18);wheel.rotation.z=Math.PI/2;
    cylinder(g,.15,.15,.19,M.road,wx,.36,wz,14).rotation.z=Math.PI/2;
  }
  return g;
}
function makeForklift(parent,x,z,scale=1) {
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
  box(g,1.55,.55,1.05,M.retailYellow,0,.62,0);
  box(g,.58,.95,.9,M.dark,-.28,1.3,0);
  box(g,.06,1.75,.08,M.dark,.78,1.05,.4);
  box(g,.06,1.75,.08,M.dark,.78,1.05,-.4);
  box(g,.75,.09,.1,M.dark,1.1,.45,0);
  for(const wx of [-.45,.48]) for(const wz of [-.52,.52]) {
    const w=cylinder(g,.22,.22,.15,M.tire,wx,.25,wz,16);w.rotation.z=Math.PI/2;
  }
  return g;
}
function makeWarehouse(parent,x,z,w=19,d=14) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  box(g,w,.6,d,M.concrete,0,.3,0);
  box(g,w*.94,4.2,d*.9,M.blue,0,2.65,0);
  box(g,w*.98,.34,d*.94,M.blueDark,0,4.92,0);
  // Blue corrugated roof ribs and front facade.
  for(let i=-6;i<=6;i++) box(g,.09,.1,d*.88,M.blueLight,i*w/14,4.97,0);
  box(g,w*.98,.26,.3,M.retailYellow,0,4.68,d*.47);
  for(let i=-2;i<=2;i++) {
    const doorX=i*w*.155;
    box(g,2.45,2.65,.12,M.blueDark,doorX,1.75,d*.455);
    box(g,2.12,2.35,.08,M.white,doorX,1.72,d*.46);
    box(g,1.88,2.1,.04,M.blue,doorX,1.65,d*.49);
    box(g,.12,2.1,.04,M.gold,doorX-.88,1.65,d*.515);
  }
  const sign=textSprite('BEERLAO · WAREHOUSE','#125ec6');sign.position.set(0,5.95,d*.49);sign.scale.set(10,2.5,1);g.add(sign);
  // visible rack and cooler stock through the loading apron
  for(let row=0;row<2;row++) for(let col=0;col<4;col++) makePallet(g,-7.2+col*4.8,-d*.7+row*2.4,.8);
  for(let i=0;i<3;i++) makeCooler(g,-7+i*1.5,.6,d*.68,.8);
  return g;
}
function makeOffice(parent,x,z) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  box(g,13,.55,9,M.concrete,0,.28,0);
  box(g,12.3,4.9,8.3,M.white,0,2.95,0);
  box(g,12.5,.42,8.5,M.blue,0,5.55,0);
  box(g,12.35,3.1,.1,M.glass,0,3.15,4.17);
  for(let i=-4;i<=4;i++) box(g,.12,3.1,.12,M.blueDark,i*1.35,3.15,4.24);
  box(g,3.2,1.2,.2,M.white,0,4.65,4.28);
  const sign=textSprite('HEAD OFFICE','#1768d8');sign.position.set(0,6.6,4.3);sign.scale.set(7.3,1.8,1);g.add(sign);
  box(g,2.4,2.8,.22,M.blueDark,0,1.65,4.25);
  return g;
}
function makeRetail(parent,x,z) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  box(g,10,.45,7,M.concrete,0,.23,0);
  box(g,9.5,3.2,6.5,M.white,0,1.9,0);
  box(g,9.7,.55,6.7,M.retailYellow,0,3.75,0);
  box(g,9.35,1.7,.12,M.glass,0,1.8,3.25);
  for(let i=-3;i<=3;i++) box(g,.08,1.7,.1,M.blueDark,i*1.25,1.8,3.33);
  box(g,2.1,2.2,.15,M.blue,0,1.35,3.38);
  const sign=textSprite('BEERLAO RETAIL','#e4ae32');sign.position.set(0,4.7,3.6);sign.scale.set(7.5,1.85,1);g.add(sign);
  makeCooler(g,-3,.55,-.5,.8);makeCooler(g,-1.5,.55,-.5,.8);
  return g;
}
function makeLogistics(parent,x,z) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  box(g,14,.5,9,M.concrete,0,.25,0);
  box(g,13.4,4,8.3,M.white,0,2.3,0);
  box(g,13.6,.35,8.5,M.blue,0,4.48,0);
  box(g,13.4,2.5,.1,M.blueDark,0,1.9,4.18);
  for(let i=-2;i<=2;i++) box(g,2,.12,.08,M.retailYellow,i*2.4,.65,4.25);
  const sign=textSprite('LOGISTICS HUB','#155fc5');sign.position.set(0,5.4,4.25);sign.scale.set(8,2,1);g.add(sign);
  return g;
}
function makeProvinceDisplay(parent,x,z) {
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  box(g,10,.4,7,M.concrete,0,.2,0);
  box(g,8.8,4.5,.32,M.white,0,2.65,-1.7);
  box(g,8.4,4.1,.1,M.blue,0,2.65,-1.48);
  // Abstract stylized Laos-shaped network, deliberately schematic, not geographic data.
  const pts=[[-1.1,4.1],[-.3,3.4],[-.7,2.8],[.3,2.1],[-.2,1.5],[.7,.7],[.3,.1],[1.1,-.7],[.4,-1.4],[1.1,-2.2],[.2,-2.8],[-.6,-2.1],[-.9,-1.2],[-1.5,-.5],[-1.2,.6],[-1.7,1.5],[-1.3,2.6]];
  for(let i=0;i<pts.length-1;i++){
    const [ax,ay]=pts[i],[bx,by]=pts[i+1];
    const dx=bx-ax,dy=by-ay;
    const line=box(g,.12,Math.hypot(dx,dy),.1,M.retailYellow,(ax+bx)/2,2.7+(ay+by)/2,-1.38);
    line.rotation.z=-Math.atan2(dx,dy);
  }
  pts.filter((_,i)=>i%3===0).forEach(([px,py])=>{const p=new THREE.Mesh(new THREE.SphereGeometry(.16,12,10),M.white);p.position.set(px,2.9+py,-1.28);g.add(p)});
  const sign=textSprite('PROVINCE NETWORK','#155fc5');sign.position.set(0,5.3,-1.4);sign.scale.set(8,2,1);g.add(sign);
  return g;
}

export class CompanyHub {
  constructor(root) {
    this.root=root;this.worlds=[];this.animated=[];this.buildCampus();
  }
  buildCampus() {
    const ground=box(this.root,118,.5,94,M.lawn,0,-.45,0);ground.receiveShadow=true;
    // landscaped raised campus pads
    box(this.root,108,.28,84,M.concrete,0,-.12,0);
    // Loop road around the main distribution campus.
    box(this.root,106,.16,9,M.road,0,-.01,34);
    box(this.root,106,.16,9,M.road,0,-.01,-34);
    box(this.root,9,.16,60,M.road,48,-.01,0);
    box(this.root,9,.16,60,M.road,-48,-.01,0);
    for(let i=-8;i<=8;i++) {
      box(this.root,2.2,.025,.13,M.roadLine,i*6.2,.09,34);
      box(this.root,2.2,.025,.13,M.roadLine,i*6.2,.09,-34);
    }
    // campus plaza and parking aprons
    box(this.root,75,.18,53,M.white,0,-.02,0);
    for(let i=-5;i<=5;i++) box(this.root,.12,.025,12,M.roadLine,-42+i*8.2,.09,24);
    // main warehouse, deliberately central and visually dominant
    const warehouse=makeWarehouse(this.root,0,-1,29,22);
    const office=makeOffice(this.root,-34,-15);
    const retail=makeRetail(this.root,-31,22);
    const logistics=makeLogistics(this.root,34,-16);
    const province=makeProvinceDisplay(this.root,37,19);
    // outdoor stock, coolers and handling equipment
    for(const [x,z,s] of [[-18,13,1],[-12,14,.9],[18,13,1],[23,10,.9],[13,-22,.8],[-17,-21,.8]]) makePallet(this.root,x,z,s);
    for(const [x,z] of [[-17,4],[-14,4],[16,4],[19,4]]) makeCooler(this.root,x,.2,z,.82);
    const forklift1=makeForklift(this.root,-9,16,.9);
    const forklift2=makeForklift(this.root,17,-24,.8);
    const truck1=makeTruck(this.root,-25,34,1.05,0);
    const truck2=makeTruck(this.root,25,34,1.0,Math.PI);
    const truck3=makeTruck(this.root,39,-1,.78,Math.PI/2);
    this.animated.push({object:truck1,baseZ:34,phase:0,kind:'truck'});
    this.animated.push({object:truck2,baseZ:34,phase:2.3,kind:'truck'});
    this.animated.push({object:forklift1,baseX:-9,phase:.2,kind:'forklift'});
    this.animated.push({object:forklift2,baseX:17,phase:2.1,kind:'forklift'});
    // green belt and ornamental trees
    for(let i=0;i<26;i++){
      const x=-52+(i%13)*8.6,z=i<13?-39:39;
      makeTree(this.root,x,z,.75+(i%3)*.12);
    }
    for(let i=0;i<12;i++){
      const x=i<6?-53:53,z=-25+(i%6)*10;
      makeTree(this.root,x,z,.75+(i%2)*.16);
    }
    this.addWorld('office','Head Office','Departments, executive workspace and company administration.',office);
    this.addWorld('warehouse','Warehouse','Cooler inventory, storage zones and warehouse operations.',warehouse);
    this.addWorld('retail','Retail Network','Retail outlets and cooler installation locations.',retail);
    this.addWorld('logistics','Logistics','Truck fleet, dispatch yard and cooler transfers.',logistics);
    this.addWorld('province','Province Network','Provincial network overview and regional distribution.',province);
    // soft floating labels at gateway anchors
    const labels=[
      ['HEAD OFFICE',-34,9,-10],['WAREHOUSE',0,10,-1],['RETAIL NETWORK',-31,7,22],
      ['LOGISTICS',34,8,-11],['PROVINCE NETWORK',37,8,19]
    ];
    labels.forEach(([name,x,y,z])=>{const s=textSprite(name);s.position.set(x,y,z);s.scale.set(8.8,2.2,1);this.root.add(s)});
  }
  addWorld(id,name,desc,group) {
    group.userData.worldId=id;
    this.worlds.push({id,name,desc,description:desc,group});
  }
  update(elapsed) {
    this.animated.forEach((item)=>{
      if(item.kind==='truck') item.object.position.z=item.baseZ+Math.sin(elapsed*.18+item.phase)*.45;
      if(item.kind==='forklift') item.object.position.x=item.baseX+Math.sin(elapsed*.32+item.phase)*.55;
    });
  }
  get tower(){return this.root;}
}