/* Virtual Company 3D — Phase 5 · Live Warehouse Read Integration
   Read-only bridge to existing application APIs. No new tables and no stock writes.
   Endpoints: GET /api/warehouses, /api/warehouse-stock, /api/warehouse-stock/history
*/
(function () {
  'use strict';
  var cache = { warehouses: null, stock: null, stockAt: 0, byId: Object.create(null) };
  var TTL = 30000;
  function token() {
    try { var s = JSON.parse(localStorage.getItem('app_session_v1') || 'null'); return s && s.token || ''; }
    catch (e) { return ''; }
  }
  function get(path) {
    var headers = { Accept: 'application/json' }, t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    return fetch(path, { method: 'GET', headers: headers, credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) {
        var err = new Error('HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    });
  }
  function remember(rows) {
    cache.byId = Object.create(null);
    (rows || []).forEach(function (r) { cache.byId[String(r.id)] = r; });
    return rows || [];
  }
  var API = {
    getWarehouses: function (force) {
      if (!force && cache.warehouses) return Promise.resolve(cache.warehouses);
      return get('/api/warehouses').then(function (rows) { cache.warehouses = rows || []; return cache.warehouses; });
    },
    getStock: function (force) {
      if (!force && cache.stock && Date.now() - cache.stockAt < TTL) return Promise.resolve(cache.stock);
      return get('/api/warehouse-stock').then(function (rows) {
        cache.stock = remember(rows); cache.stockAt = Date.now(); return cache.stock;
      });
    },
    search: function (query, warehouseId) {
      var p = new URLSearchParams();
      p.set('search', String(query || '').trim());
      if (warehouseId) p.set('warehouse_id', String(warehouseId));
      return get('/api/warehouse-stock?' + p.toString()).then(function (rows) { return rows || []; });
    },
    history: function (record) {
      var q = record && (record.qr_code || record.serial_number || record.capex || record.cooler_model) || '';
      if (!q) return Promise.resolve([]);
      var p = new URLSearchParams(); p.set('search', q);
      return get('/api/warehouse-stock/history?' + p.toString()).then(function (rows) { return rows || []; });
    },
    find: function (id) { return cache.byId[String(id)] || null; },
    refresh: function () { cache.stockAt = 0; cache.stock = null; return API.getStock(true); },
    statusLabel: function (status) {
      return ({ in_warehouse: 'In warehouse', reserved: 'Reserved', on_truck: 'On truck', outlet: 'At outlet', event: 'Event', shipped_out: 'Shipped out', pending_write_off: 'Pending write-off', write_off: 'Written off' })[status] || String(status || 'Unknown').replace(/_/g, ' ');
    },
    coolerStatusLabel: function (status) {
      return ({ 'new': 'New', second_hand: 'Second hand', broken: 'Broken' })[status] || String(status || '—');
    }
  };
  window.VO_WAREHOUSE_LIVE = API;
})();
