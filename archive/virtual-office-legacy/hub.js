(function(){'use strict';
if(!window.THREE||!THREE.OrbitControls){document.getElementById('toast').textContent='Three.js could not load. Check your internet connection.';document.getElementById('toast').classList.add('show');return;}
const T=THREE, host=document.getElementById('world');
const scene=new T.Scene();scene.background=new T.Color(0x9aaebd);scene.fog=new T.Fog(0x9aaebd,48,105);
const camera=new T.PerspectiveCamera(42,innerWidth/innerHeight,.1,300);camera.position.set(31,27,37);
const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.35:1.8));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;host.appendChild(renderer.domElement);
const controls=new T.OrbitControls(camera,renderer.domElement);controls.target.set(0,4,0);controls.enableDamping=true;controls.dampingFactor=.065;controls.minDistance=11;controls.maxDistance=78;controls.maxPolarAngle=Math.PI*.47;controls.screenSpacePanning=true;
const hemi=new T.HemisphereLight(0xd9e9f5,0x46515a,1.05);scene.add(hemi);
const ambient=new T.AmbientLight(0xffffff,.32);scene.add(ambient);
const sun=new T.DirectionalLight(0xffe2b1,2.1);sun.position.set(-24,38,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-48;sun.shadow.camera.right=48;sun.shadow.camera.top=48;sun.shadow.camera.bottom=-48;sun.shadow.bias=-.00035;scene.add(sun);
const fill=new T.DirectionalLight(0x8cb8d4,.75);fill.position.set(25,18,-22);scene.add(fill);
const mats={navy:new T.MeshStandardMaterial({color:0x172b40,metalness:.48,roughness:.35}),navy2:new T.MeshStandardMaterial({color:0x263b50,metalness:.38,roughness:.42}),gold:new T.MeshStandardMaterial({color:0xd2ad65,metalness:.78,roughness:.25}),goldGlow:new T.MeshBasicMaterial({color:0xffd889}),glass:new T.MeshPhysicalMaterial({color:0x83b7cf,metalness:.25,roughness:.12,transparent:true,opacity:.48,clearcoat:.9}),concrete:new T.MeshStandardMaterial({color:0xc2c9c4,roughness:.85}),road:new T.MeshStandardMaterial({color:0x303d49,roughness:.9}),grass:new T.MeshStandardMaterial({color:0x637d68,roughness:1}),leaf:new T.MeshStandardMaterial({color:0x557d62,roughness:.95}),water:new T.MeshStandardMaterial({color:0x5a9ba9,metalness:.22,roughness:.22}),white:new T.MeshStandardMaterial({color:0xe7e8e3,roughness:.62})};
function mesh(geo,mat,x,y,z,parent=scene){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,mat,x,y,z,parent=scene){return mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent);}
function cyl(rt,rb,h,mat,x,y,z,seg=24,parent=scene){return mesh(new T.CylinderGeometry(rt,rb,h,seg),mat,x,y,z,parent);}
function labelSprite(text){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='rgba(10,24,38,.88)';roundRect(ctx,8,8,496,112,22);ctx.fill();ctx.strokeStyle='rgba(218,184,111,.85)';ctx.lineWidth=3;roundRect(ctx,8,8,496,112,22);ctx.stroke();ctx.fillStyle='#f3d99c';ctx.font='600 35px Inter,Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.toUpperCase(),256,65);const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;const s=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));s.scale.set(7.8,1.95,1);return s;}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// Terrain base and plaza
box(100,.9,88,mats.grass,0,-.65,0);box(51,.18,49,mats.concrete,0,-.12,0);
// radial paths
for(let a=0;a<5;a++){const ang=a*Math.PI*2/5;const path=box(2.5,.08,22,mats.road,Math.sin(ang)*10,.0,Math.cos(ang)*10);path.rotation.y=ang;}
cyl(12,12,.16,mats.water,0,.02,0,64);cyl(10.7,10.7,.12,mats.gold,0,.12,0,64);cyl(9.7,9.7,.12,mats.concrete,0,.19,0,64);
// central tower podium
cyl(6.8,7.4,.75,mats.navy2,0,.62,0,48);cyl(6.1,6.1,.18,mats.gold,0,1.08,0,48);cyl(5.8,5.8,.18,mats.navy,0,1.25,0,48);
// Tower body glass core
box(5.4,17,5.4,mats.glass,0,10,0);box(5.8,.42,5.8,mats.navy,0,1.65,0);box(5.8,.32,5.8,mats.gold,0,18.7,0);
// vertical gold fins around tower
for(let i=0;i<12;i++){const a=i*Math.PI/6;const r=2.85;const fin=box(.13,17.3,.18,mats.gold,Math.sin(a)*r,10,Math.cos(a)*r);fin.rotation.y=-a;}
// floor bands / horizontal rings
for(let y of [4,7.5,11,14.5,18.6]){const ring=mesh(new T.TorusGeometry(3.85,.09,8,64),mats.gold,0,y,0);ring.rotation.x=Math.PI/2;}
// roof cap and antenna
cyl(3.25,3.7,.48,mats.navy,0,19.05,0,32);cyl(1.55,2.0,.5,mats.gold,0,19.52,0,32);box(.18,2.5,.18,mats.gold,0,21,0);const beacon=cyl(.32,.32,.3,mats.goldGlow,0,22.35,0,20);
// entrance canopy and steps
box(7,.25,2.1,mats.gold,0,1.9,3.6);box(6.5,.18,1.8,mats.navy2,0,1.72,3.6);for(let i=0;i<4;i++)box(5.8-i*.45,.16,.65,mats.concrete,0,1.45-i*.16,4.35+i*.45);
// tower signage
const towerLabel=labelSprite('Beerlao Central');towerLabel.position.set(0,5.5,2.82);towerLabel.scale.set(4.3,1.08,1);scene.add(towerLabel);
// Gateway buildings, arranged around tower
const worlds=[
 {id:'office',name:'Head Office',desc:'AI workspace, departments and daily reporting.',angle:-Math.PI/2,color:0x83b7cf},
 {id:'warehouse',name:'Warehouses',desc:'Cooler inventory, stock status and storage locations.',angle:-Math.PI/2+Math.PI*2/5,color:0xd6ad62},
 {id:'retail',name:'Retail Network',desc:'Shop network, installed coolers and outlet status.',angle:-Math.PI/2+Math.PI*4/5,color:0x80a987},
 {id:'logistics',name:'Logistics',desc:'Delivery routes, truck movements and returns.',angle:-Math.PI/2+Math.PI*6/5,color:0xc18d69},
 {id:'province',name:'Province Network',desc:'Geographic distribution and provincial operations.',angle:-Math.PI/2+Math.PI*8/5,color:0x8e9dc5}
];
const pickables=[];const gatewayGroups={};
worlds.forEach((w,i)=>{const r=21.5,x=Math.sin(w.angle)*r,z=Math.cos(w.angle)*r;const g=new T.Group();g.position.set(x,0,z);scene.add(g);gatewayGroups[w.id]=g;
 // landscaped gateway plinth
 cyl(4.2,4.5,.42,mats.navy2,0,.2,0,32,g);cyl(3.75,3.75,.12,mats.gold,0,.47,0,32,g);
 // distinctive pavilion
 box(4.5,.35,3.6,mats.navy,0,.82,0,g);box(4.1,2.6,.18,mats.glass,0,2.25,-1.55,g);box(4.1,2.6,.18,mats.glass,0,2.25,1.55,g);box(.18,2.6,3.1,mats.gold,-2.05,2.25,0,g);box(.18,2.6,3.1,mats.gold,2.05,2.25,0,g);box(4.6,.22,3.8,mats.gold,0,3.62,0,g);box(3.9,.22,3.2,mats.navy,0,3.82,0,g);
 // gateway portal ring
 const portal=mesh(new T.TorusGeometry(1.28,.095,10,48),new T.MeshStandardMaterial({color:w.color,emissive:w.color,emissiveIntensity:.22,metalness:.55,roughness:.25}),0,2.35,1.7,g);portal.scale.set(1.05,1.25,1);portal.rotation.y=0;
 const plinth=box(3.2,.08,2.8,mats.gold,0,.56,0,g);plinth.userData.worldId=w.id;pickables.push(plinth);
 const lab=labelSprite(w.name);lab.position.set(0,5.1,0);lab.scale.set(5.6,1.4,1);g.add(lab);
 // colored location beacon
 const orb=cyl(.22,.22,.18,new T.MeshBasicMaterial({color:w.color}),0,4.35,0,24,g);const glowRing=mesh(new T.TorusGeometry(.45,.035,6,32),new T.MeshBasicMaterial({color:w.color}),0,4.35,0,g);glowRing.rotation.x=Math.PI/2;
 g.userData.worldId=w.id;g.userData.worldName=w.name;g.userData.worldDesc=w.desc;g.traverse(o=>{if(o.isMesh){o.userData.worldId=w.id;pickables.push(o);}});
});
// stylized terrain hills and water ribbon around outer perimeter
for(let i=0;i<18;i++){const a=i*Math.PI*2/18;const x=Math.sin(a)*39,z=Math.cos(a)*34;const h=2.5+(i%4)*1.2;const hill=mesh(new T.SphereGeometry(1,18,12),mats.grass,x,h*.25,z);hill.scale.set(5,h,4);hill.castShadow=true;}
// water strip / reflecting pool
const river=box(2,.035,62,mats.water,39,.02,0);river.rotation.y=-.25;
// trees along paths
function tree(x,z,s=1){const g=new T.Group();g.position.set(x,0,z);scene.add(g);cyl(.17*s,.24*s,1.3*s,matWood,.0,.65*s,.0,10,g);for(let j=0;j<3;j++){const crown=mesh(new T.IcosahedronGeometry(.85*s-j*.1,1),mats.leaf,0,(1.45+j*.48)*s,0,g);crown.scale.set(1.0,.9,1.0);}return g;}
const matWood=new T.MeshStandardMaterial({color:0x70533b,roughness:1});
for(let i=0;i<26;i++){const a=i*Math.PI*2/26;const r=31+(i%3)*1.1;tree(Math.sin(a)*r,Math.cos(a)*r,.8+(i%4)*.08);}
// street lamps
for(let i=0;i<10;i++){const a=i*Math.PI*2/10;const x=Math.sin(a)*15,z=Math.cos(a)*15; cyl(.07,.09,2.7,mats.navy,x,1.35,z,8);box(.55,.08,.18,mats.gold,x,2.75,z);}
// click and camera focus
const ray=new T.Raycaster(),pointer=new T.Vector2();let downX=0,downY=0,active='hub',night=false;
function showWorld(id){const w=worlds.find(x=>x.id===id);if(!w)return;active=id;document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.world===id));document.getElementById('detailEyebrow').textContent='WORLD GATEWAY';document.getElementById('detailTitle').textContent=w.name;document.getElementById('detailText').textContent=w.desc+' This is a visual destination preview; live project navigation will be connected in a later integration step.';document.getElementById('detailCard').classList.add('show');document.getElementById('sceneLabel').textContent=w.name.toUpperCase();const p=gatewayGroups[id].getWorldPosition(new T.Vector3());const target=new T.Vector3(p.x,2,p.z);animateCamera(target,17);toast(w.name+' gateway selected');}
function animateCamera(target,distance){const startPos=camera.position.clone(),startTarget=controls.target.clone();const dir=new T.Vector3(1,.78,1).normalize();const endPos=target.clone().add(dir.multiplyScalar(distance));const t0=performance.now(),dur=1050;function step(now){const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);camera.position.lerpVectors(startPos,endPos,e);controls.target.lerpVectors(startTarget,target,e);if(k<1)requestAnimationFrame(step);}requestAnimationFrame(step);}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),2200);}
renderer.domElement.addEventListener('pointerdown',e=>{downX=e.clientX;downY=e.clientY;});renderer.domElement.addEventListener('click',e=>{if(Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY)>8)return;const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(pickables,true);if(hits.length){let o=hits[0].object;while(o&&!o.userData.worldId)o=o.parent;if(o&&o.userData.worldId)showWorld(o.userData.worldId);else showHub();}else if(ray.intersectObject(towerLabel).length)showHub();});
function showHub(){active='hub';document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.world==='hub'));document.getElementById('detailCard').classList.remove('show');document.getElementById('sceneLabel').textContent='CENTRAL TOWER';animateCamera(new T.Vector3(0,4,0),44);}
document.querySelectorAll('[data-world]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.world;if(id==='hub')showHub();else showWorld(id);document.getElementById('sideNav').classList.remove('open');}));
document.getElementById('closeDetail').onclick=()=>document.getElementById('detailCard').classList.remove('show');document.getElementById('homeCamera').onclick=showHub;document.getElementById('zoomIn').onclick=()=>{camera.position.lerp(controls.target,.12);};document.getElementById('zoomOut').onclick=()=>{const d=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(d.multiplyScalar(1.12));};document.getElementById('menuToggle').onclick=()=>document.getElementById('sideNav').classList.toggle('open');
function atmosphere(){const now=new Date(),hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Vientiane',hour:'2-digit',hourCycle:'h23'}).format(now));const t=hour<6||hour>=19?'night':hour<10?'morning':hour<16?'day':'sunset';let bg,hemiI,sunI,hemiSky,sunColor,exp;if(night||t==='night'){bg=0x111b2a;hemiI=.35;sunI=.25;hemiSky=0x425c82;sunColor=0x9ebbe4;exp=.82;}else if(t==='morning'){bg=0xb3c6d0;hemiI=1.0;sunI=1.65;hemiSky=0xe0edf4;sunColor=0xffd7a0;exp=1.12;}else if(t==='sunset'){bg=0x9d8990;hemiI=.78;sunI=1.45;hemiSky=0xf0c4a0;sunColor=0xffae72;exp=1.08;}else{bg=0x9aafbd;hemiI=1.05;sunI=2.1;hemiSky=0xd9e9f5;sunColor=0xffe2b1;exp=1.12;}scene.background.setHex(bg);scene.fog.color.setHex(bg);hemi.intensity=hemiI;hemi.color.setHex(hemiSky);sun.intensity=sunI;sun.color.setHex(sunColor);renderer.toneMappingExposure=exp;document.getElementById('clock').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'}).format(now)+' · '+t.toUpperCase();}
document.getElementById('dayMode').onclick=()=>{night=!night;atmosphere();toast(night?'Night atmosphere':'Automatic atmosphere');};
let lastAtmos=0;function animate(now){requestAnimationFrame(animate);controls.update();if(now-lastAtmos>30000){atmosphere();lastAtmos=now;}beacon.rotation.y+=.012;beacon.position.y=22.35+Math.sin(now*.0018)*.12;renderer.render(scene,camera);}atmosphere();requestAnimationFrame(animate);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.35:1.8));});
// Initial overview camera
showHub();
})();