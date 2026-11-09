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
    this.metrics = null;
    this.currentWorld = null;
    this.worldButtons = [...document.querySelectorAll('[data-world]')];
  }
  bind({ onWorld, onHome, onBack, onZoomIn, onZoomOut, onAtmosphere, onExplore }) {
    this.worldButtons.forEach((button) => button.addEventListener('click', () => onWorld(button.dataset.world)));
    $('reset-camera').addEventListener('click', onHome);
    $('return-hub').addEventListener('click', onBack);
    $('camera-home').addEventListener('click', onHome);
    $('zoom-in').addEventListener('click', onZoomIn);
    $('zoom-out').addEventListener('click', onZoomOut);
    $('atmosphere-toggle').addEventListener('click', onAtmosphere);
    $('explore-world').addEventListener('click', onExplore);
    $('detail-close').addEventListener('click', () => this.detail.classList.remove('show'));
  }
  selectWorld(world, isGateway = true) {
    this.currentWorld = world.id;
    this.worldButtons.forEach((button) => button.classList.toggle('active', button.dataset.world === world.id));
    $('return-hub').hidden = world.id === 'hub';
    const copy = WORLD_COPY[world.id] || WORLD_COPY.hub;
    $('detail-kicker').textContent = copy.kicker;
    $('detail-title').textContent = copy.title;
    $('detail-description').textContent = copy.description;
    $('detail-status').textContent = isGateway ? 'WORLD ENVIRONMENT · INTERACTIVE 3D SCENE' : 'COMPANY HUB';
    if (world.id === 'hub') this.detail.classList.remove('show'); else this.detail.classList.add('show');
    $('scene-label')?.remove();
    this.renderWorldData();
  }
  setMetrics(data) {
    this.metrics = data;
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
    this.renderWorldData();
  }
  renderWorldData() {
    const host = $('world-live-data');
    if (!host) return;
    host.replaceChildren();
    if (!this.currentWorld || this.currentWorld === 'hub') return;
    const world = this.metrics?.worlds?.find((entry) => entry.id === this.currentWorld);
    if (!world || !world.available) {
      const empty = document.createElement('div'); empty.className = 'live-data-empty';
      empty.textContent = 'No operational data is available for this world.'; host.append(empty); return;
    }
    if (world.hasErrors) {
      const warning = document.createElement('p'); warning.className = 'live-data-warning';
      warning.textContent = 'Some source sections could not be loaded. Displayed values may be incomplete.'; host.append(warning);
    }
    if (world.stats?.length) {
      const heading = document.createElement('h3'); heading.className = 'live-data-heading'; heading.textContent = 'OPERATIONAL SNAPSHOT'; host.append(heading);
      const grid = document.createElement('div'); grid.className = 'live-stat-grid';
      world.stats.slice(0, 8).forEach((stat) => {
        const card = document.createElement('div'); card.className = 'live-stat';
        const label = document.createElement('span'); label.textContent = stat.label;
        const value = document.createElement('strong'); value.textContent = Number(stat.value).toLocaleString();
        card.append(label, value); grid.append(card);
      });
      host.append(grid);
    }
    if (world.items?.length) {
      const heading = document.createElement('h3'); heading.className = 'live-data-heading'; heading.textContent = 'RECENT ACTIVITY'; host.append(heading);
      world.items.slice(0, 6).forEach((item) => {
        const row = document.createElement('div'); row.className = 'live-item';
        const title = document.createElement('strong'); title.textContent = item.text; row.append(title);
        if (item.sub) { const sub = document.createElement('small'); sub.textContent = item.sub; row.append(sub); }
        if (item.at) {
          const date = new Date(item.at);
          if (!Number.isNaN(date.getTime())) { const time = document.createElement('time'); time.dateTime = date.toISOString(); time.textContent = date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); row.append(time); }
        }
        host.append(row);
      });
    }
    if (!world.stats?.length && !world.items?.length) {
      const empty = document.createElement('div'); empty.className = 'live-data-empty';
      empty.textContent = 'The API returned no detailed records for this world yet.'; host.append(empty);
    }
    const source = document.createElement('div'); source.className = 'live-data-source';
    source.textContent = `READ-ONLY SOURCES · ${(world.sources || []).join(' / ').toUpperCase()}`; host.append(source);
  }
  setDataError(error) {
    $('data-status').textContent = 'DATA UNAVAILABLE';
    document.querySelector('.status-chip b').style.background = '#c58e79';
    $('updated-at').textContent = error === 'Admin access required' ? 'Sign in with an Admin account to view live data' : 'Unable to load live overview';
    $('metric-attention').textContent = '—'; $('metric-new').textContent = '—';
    this.metrics = null; this.renderWorldData();
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
