import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Atmosphere } from './core/Atmosphere.js';
import { WorldManager } from './core/WorldManager.js';
import { CompanyHub } from './worlds/CompanyHub.js';
import { OfficeOverviewAdapter } from './data/OfficeOverviewAdapter.js';
import { Overlay } from './ui/Overlay.js';

const container = document.getElementById('world-canvas');
const overlay = new Overlay();
const engine = new Engine(container);
const atmosphere = new Atmosphere(engine);
const companyHub = new CompanyHub(engine.scene);
const manager = new WorldManager(engine, companyHub.worlds);

const hubWorld = { id: 'hub', name: 'Company Hub', group: companyHub.tower };
manager.worlds.unshift(hubWorld);
manager.onSelect = (world) => overlay.selectWorld(world);
companyHub.worlds.forEach((world) => manager.addPickable(world.group, world.id));
manager.addPickable(companyHub.tower, 'hub');

const home = () => manager.select('hub');
const zoom = (factor) => {
  const offset = engine.camera.position.clone().sub(engine.controls.target).multiplyScalar(factor);
  engine.camera.position.copy(engine.controls.target).add(offset);
};
overlay.bind({
  onWorld: (id) => manager.select(id),
  onHome: home,
  onZoomIn: () => zoom(.84),
  onZoomOut: () => zoom(1.18),
  onAtmosphere: () => {
    const mode = atmosphere.toggleNight(); overlay.setClock(mode); overlay.toast(`Atmosphere: ${mode}`);
  },
  onExplore: () => manager.select('warehouse')
});

// Read-only connection to the existing Admin overview endpoint. No writes or backend changes.
const adapter = new OfficeOverviewAdapter('/api/admin/office-overview');
const controller = new AbortController();
async function refreshOverview() {
  try {
    const data = await adapter.load(controller.signal);
    overlay.setMetrics(data);
  } catch (error) {
    if (error.name !== 'AbortError') overlay.setDataError(error.message || 'Overview unavailable');
  }
}
refreshOverview();
const refreshTimer = window.setInterval(refreshOverview, 60000);
window.addEventListener('pagehide', () => { controller.abort(); clearInterval(refreshTimer); engine.dispose(); }, { once: true });

const startHour = new Date().getHours();
const initialMode = atmosphere.applyByClock();
overlay.setClock(initialMode);
window.setInterval(() => { const mode = atmosphere.applyByClock(); overlay.setClock(mode); }, 30000);
engine.start((delta, elapsed) => companyHub.update(elapsed));
manager.select('hub');
overlay.finishLoading();

// Expose a small, read-only debug marker for smoke tests without adding globals from Three.js.
window.__BEERLAO_COMPANY_WORLD__ = Object.freeze({ engine: 'three', revision: THREE.REVISION, mode: 'read-only' });
