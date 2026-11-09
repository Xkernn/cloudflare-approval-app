import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Atmosphere } from './core/Atmosphere.js';
import { WorldManager } from './core/WorldManager.js';
import { CompanyHub } from './worlds/CompanyHub.js';
import { WorldExperiences } from './worlds/WorldExperiences.js';
import { OfficeOverviewAdapter } from './data/OfficeOverviewAdapter.js';
import { Overlay } from './ui/Overlay.js';

const container = document.getElementById('world-canvas');
const overlay = new Overlay();
const engine = new Engine(container);
const atmosphere = new Atmosphere(engine);

// Each 3D environment is isolated in its own Group. No existing app or API files are changed.
const hubRoot = new THREE.Group(); hubRoot.name = 'company-hub-root'; engine.scene.add(hubRoot);
const companyHub = new CompanyHub(hubRoot);
const experiences = new WorldExperiences(engine.scene);
const hubWorld = { id: 'hub', name: 'Company Hub', group: companyHub.tower };
const worlds = [hubWorld, ...companyHub.worlds];
const manager = new WorldManager(engine, worlds, hubRoot, experiences);
manager.onSelect = (world) => overlay.selectWorld(world);
companyHub.worlds.forEach((world) => manager.addPickable(world.group, world.id));
manager.addPickable(companyHub.tower, 'hub');

const home = () => manager.select('hub');
const zoom = (factor) => {
  const offset = engine.camera.position.clone().sub(engine.controls.target).multiplyScalar(factor);
  engine.camera.position.copy(engine.controls.target).add(offset);
};
overlay.bind({
  onWorld: (id) => manager.select(id), onHome: home, onBack: home,
  onZoomIn: () => zoom(.84), onZoomOut: () => zoom(1.18),
  onAtmosphere: () => { const mode = atmosphere.toggleNight(); overlay.setClock(mode); overlay.toast(`Atmosphere: ${mode}`); },
  onExplore: () => manager.select('warehouse')
});

// Existing Admin overview endpoint: GET-only, same-origin, no backend/schema changes.
const adapter = new OfficeOverviewAdapter('/api/admin/office-overview');
const controller = new AbortController();
async function refreshOverview() {
  try { overlay.setMetrics(await adapter.load(controller.signal)); }
  catch (error) { if (error.name !== 'AbortError') overlay.setDataError(error.message || 'Overview unavailable'); }
}
refreshOverview();
const refreshTimer = window.setInterval(refreshOverview, 60000);
let atmosphereTimer;
window.addEventListener('pagehide', () => {
  controller.abort(); clearInterval(refreshTimer); clearInterval(atmosphereTimer); engine.dispose();
}, { once: true });

const initialMode = atmosphere.applyByClock(); overlay.setClock(initialMode);
atmosphereTimer = window.setInterval(() => overlay.setClock(atmosphere.applyByClock()), 30000);
engine.start((delta, elapsed) => { companyHub.update(elapsed); experiences.update(elapsed); });
manager.select('hub'); overlay.finishLoading();
