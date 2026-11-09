const WORLD_COPY = {
  hub: { title: 'Company Hub', description: 'The central gateway to every Beerlao business world.', kicker: 'COMPANY OVERVIEW' },
  office: { title: 'Head Office', description: 'Departments, executive workspace and daily reporting.', kicker: 'WORLD GATEWAY' },
  warehouse: { title: 'Warehouses', description: 'Cooler inventory, stock visibility and storage operations.', kicker: 'WORLD GATEWAY' },
  retail: { title: 'Retail Network', description: 'Outlet coverage, installed coolers and shop network.', kicker: 'WORLD GATEWAY' },
  logistics: { title: 'Logistics', description: 'Truck movements, delivery routes and cooler transfers.', kicker: 'WORLD GATEWAY' },
  province: { title: 'Province Network', description: 'Provincial distribution and regional operations.', kicker: 'WORLD GATEWAY' }
};
const $ = (id) => document.getElementById(id);

export class Overlay {
  constructor() {
    this.detail = $('world-detail');
    this.toastTimer = null;
    this.worldButtons = [...document.querySelectorAll('[data-world]')];
  }
  bind({ onWorld, onHome, onZoomIn, onZoomOut, onAtmosphere, onExplore }) {
    this.worldButtons.forEach((button) => button.addEventListener('click', () => onWorld(button.dataset.world)));
    $('reset-camera').addEventListener('click', onHome);
    $('camera-home').addEventListener('click', onHome);
    $('zoom-in').addEventListener('click', onZoomIn);
    $('zoom-out').addEventListener('click', onZoomOut);
    $('atmosphere-toggle').addEventListener('click', onAtmosphere);
    $('explore-world').addEventListener('click', onExplore);
    $('detail-close').addEventListener('click', () => this.detail.classList.remove('show'));
  }
  selectWorld(world, isGateway = true) {
    this.worldButtons.forEach((button) => button.classList.toggle('active', button.dataset.world === world.id));
    const copy = WORLD_COPY[world.id] || WORLD_COPY.hub;
    $('detail-kicker').textContent = copy.kicker;
    $('detail-title').textContent = copy.title;
    $('detail-description').textContent = copy.description;
    $('detail-status').textContent = isGateway ? 'GATEWAY PREVIEW · WORLD SCENE IN NEXT PHASE' : 'COMPANY HUB';
    if (world.id === 'hub') this.detail.classList.remove('show'); else this.detail.classList.add('show');
    $('scene-label')?.remove();
  }
  setMetrics(data) {
    $('metric-attention').textContent = data.attention.toLocaleString();
    $('metric-new').textContent = data.new24.toLocaleString();
    const icons = { office: '▥', warehouse: '▤', retail: '⌑', logistics: '⇢', province: '⌖' };
    $('world-summary').innerHTML = data.worlds.map((world) => `
      <div class="summary-row">
        <span class="summary-icon">${icons[world.id] || '◇'}</span>
        <span class="summary-name">${world.name}</span>
        <span class="summary-value">${world.attention.toLocaleString()}</span>
        <span class="summary-state ${world.status}">${world.status.toUpperCase()}</span>
      </div>`).join('');
    $('updated-at').textContent = data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live overview received';
    $('data-status').textContent = 'LIVE DATA';
    document.querySelector('.status-chip b').style.background = '#72c2a4';
  }
  setDataError(error) {
    $('data-status').textContent = 'DATA UNAVAILABLE';
    document.querySelector('.status-chip b').style.background = '#c58e79';
    $('updated-at').textContent = error === 'Admin access required' ? 'Sign in with an Admin account to view live data' : 'Unable to load live overview';
    $('metric-attention').textContent = '—'; $('metric-new').textContent = '—';
    this.toast(error === 'Admin access required' ? 'Admin permission is required for live company data.' : '3D world loaded; live company data is unavailable.');
  }
  setClock(mode) {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Vientiane', hour: '2-digit', minute: '2-digit' }).format(new Date());
    $('clock').textContent = `${time} · ${mode.toUpperCase()}`;
  }
  toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }
  finishLoading() { $('loading-screen').classList.add('done'); setTimeout(() => $('loading-screen')?.remove(), 700); }
}
