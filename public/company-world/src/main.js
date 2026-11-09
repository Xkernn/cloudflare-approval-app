import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Atmosphere } from './core/Atmosphere.js';
import { WorldManager } from './core/WorldManager.js';
import { CompanyHub } from './worlds/CompanyHub.js';
import { WorldExperiences } from './worlds/WorldExperiences.js';
import { OfficeOverviewAdapter } from './data/OfficeOverviewAdapter.js';
import { Overlay } from './ui/Overlay.js';

const container=document.getElementById('world-canvas');
const overlay=new Overlay();
const engine=new Engine(container);
const atmosphere=new Atmosphere(engine);
const hubRoot=new THREE.Group();hubRoot.name='company-hub-isometric-root';engine.scene.add(hubRoot);
const companyHub=new CompanyHub(hubRoot);
const experiences=new WorldExperiences(engine.scene);
const hubWorld={id:'hub',name:'Company Hub',group:companyHub.tower};
const worlds=[hubWorld,...companyHub.worlds];
const manager=new WorldManager(engine,worlds,hubRoot,experiences);
manager.onSelect=world=>overlay.selectWorld(world);
companyHub.worlds.forEach(world=>manager.addPickable(world.group,world.id));
// Do not add the entire hub root as a pickable: it would override each gateway's identity.
const home=()=>manager.select('hub');
const zoom=factor=>{
  const offset=engine.camera.position.clone().sub(engine.controls.target).multiplyScalar(factor);
  engine.camera.position.copy(engine.controls.target).add(offset);
};
overlay.bind({
  onWorld:id=>manager.select(id),onHome:home,onBack:home,
  onZoomIn:()=>zoom(.86),onZoomOut:()=>zoom(1.16),
  onAtmosphere:()=>{const mode=atmosphere.toggleNight();overlay.toast(`Lighting: ${mode}`);},
  onExplore:()=>manager.select('warehouse')
});
const adapter=new OfficeOverviewAdapter('/api/admin/office-overview');
const controller=new AbortController();
async function refreshOverview(){
  try{overlay.setMetrics(await adapter.load(controller.signal));}
  catch(error){if(error.name!=='AbortError')overlay.setDataError(error.message||'Overview unavailable');}
}
refreshOverview();
const refreshTimer=window.setInterval(refreshOverview,60000);
window.addEventListener('pagehide',()=>{
  controller.abort();clearInterval(refreshTimer);engine.dispose();
},{once:true});
engine.start((delta,elapsed)=>{companyHub.update(elapsed);experiences.update(elapsed);});
manager.select('hub');
overlay.finishLoading();