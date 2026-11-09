const CANONICAL = { asset_request: 'requests', contract: 'contracts' };
const WORLD_MAP = {
  office: ['admin', 'contracts', 'announce'],
  warehouse: ['stock', 'newcoolers'],
  retail: ['requests', 'assets'],
  logistics: ['delivery', 'trips'],
  province: ['budget', 'checks']
};
const WORLD_LABELS = { office: 'Head Office', warehouse: 'Warehouses', retail: 'Retail Network', logistics: 'Logistics', province: 'Province Network' };
const WORLD_SOURCES = { office: ['admin', 'contracts', 'announce'], warehouse: ['stock', 'newcoolers'], retail: ['requests', 'assets'], logistics: ['delivery', 'trips'], province: ['budget', 'checks'] };

export class OfficeOverviewAdapter {
  constructor(endpoint = '/api/admin/office-overview') { this.endpoint = endpoint; this.last = null; }
  async load(signal) {
    const response = await fetch(this.endpoint, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Admin access required' : `API request failed (${response.status})`);
    const payload = await response.json();
    if (!payload || (!Array.isArray(payload.rooms) && !Array.isArray(payload.rooms3d))) throw new Error('Unexpected overview response');
    const rooms = new Map();
    for (const room of [...(payload.rooms || []), ...(payload.rooms3d || [])]) {
      if (!room || !room.id) continue;
      const key = CANONICAL[room.id] || room.id;
      if (!rooms.has(key)) rooms.set(key, { ...room, id: key });
    }
    const all = [...rooms.values()];
    const result = {
      generatedAt: payload.generated_at || null,
      attention: all.reduce((sum, room) => sum + (Number(room.attention) || 0), 0),
      new24: all.reduce((sum, room) => sum + (Number(room.new24) || 0), 0),
      worlds: Object.entries(WORLD_MAP).map(([id, keys]) => {
        const parts = keys.map((key) => rooms.get(key)).filter(Boolean);
        const attention = parts.reduce((sum, room) => sum + (Number(room.attention) || 0), 0);
        const new24 = parts.reduce((sum, room) => sum + (Number(room.new24) || 0), 0);
        const status = parts.some((room) => room.error) ? 'pending' : new24 > 0 ? 'working' : attention > 0 ? 'pending' : 'available';
        const stats = parts.flatMap((room) => Array.isArray(room.stats) ? room.stats.map((stat) => ({ label: String(stat.label || 'Metric'), value: Number(stat.value) || 0, source: room.title || room.id })) : []);
        const items = parts.flatMap((room) => Array.isArray(room.items) ? room.items.map((item) => ({ text: String(item.text || '—'), sub: String(item.sub || ''), at: item.at || null, state: item.state || 'working', source: room.title || room.id })) : [])
          .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 8);
        return { id, name: WORLD_LABELS[id], attention, new24, status, available: parts.length > 0, stats, items, sources: WORLD_SOURCES[id] || [], hasErrors: parts.some((room) => Boolean(room.error)) };
      })
    };
    this.last = result;
    return result;
  }
}
