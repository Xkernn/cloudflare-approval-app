/* Virtual Company 3D — Phase 3 · Charts (SVG ລ້ວນ, ບໍ່ມີ library ພາຍນອກ, ໂຫຼດແບບ lazy ເມື່ອເປີດແຜງ Analytics ຄັ້ງທຳອິດ)
   ແຕ່ລະຟັງຊັນຄືນ SVG string · ອົງປະກອບທີ່ໂຕ້ຕອບໄດ້ມີ data-tip="ຫົວຂໍ້|ລາຍລະອຽດ" (tooltip) ແລະ data-go="type:id" (ຄລິກ) */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var FONT = 'font-family="Noto Sans,Noto Sans Lao,Arial,sans-serif"';
  function svg(w, h, inner, label) { return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>'; }
  function txt(x, y, s, o) { o = o || {}; return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 9) + '" fill="' + (o.fill || '#64748b') + '" text-anchor="' + (o.anchor || 'start') + '" font-weight="' + (o.weight || 500) + '" ' + FONT + '>' + esc(s) + '</text>'; }
  function niceMax(v) { if (v <= 5) return 5; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  // Employee Activity Overview — stacked horizontal bars ຕໍ່ແຜນກ  rows:[{id,label,vals:{work,meeting,walk,break,leave},total}]
  function stacked(rows, keys, colors, names) {
    var W = 290, H = 132, L = 58, R = 22, top = 4, rh = (H - top) / rows.length, bh = Math.min(11, rh - 5), max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1])), sc = (W - L - R) / max, o = '';
    rows.forEach(function (r, i) {
      var y = top + i * rh + (rh - bh) / 2, x = L;
      o += '<g data-go="dept:' + r.id + '" class="hit">' + txt(L - 6, y + bh - 2, r.label, { anchor: 'end', size: 9, fill: '#334155', weight: 600 });
      o += '<rect x="' + L + '" y="' + y + '" width="' + (W - L - R) + '" height="' + bh + '" rx="3" fill="#eef2f7"/>';
      keys.forEach(function (k) {
        var v = r.vals[k] || 0; if (!v) return; var w = v * sc;
        o += '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(1, w - 1).toFixed(1) + '" height="' + bh + '" rx="2" fill="' + colors[k] + '" data-tip="' + esc(r.label + ' · ' + names[k] + '|' + v + ' of ' + r.total + ' staff') + '"/>';
        x += w;
      });
      o += txt(W - R + 4, y + bh - 2, r.total, { size: 9, fill: '#0f172a', weight: 700 }) + '</g>';
    });
    return svg(W, H, o, 'Employee activity by department');
  }

  // Warehouse Inbound / Outbound — grouped vertical bars  rows:[{id,label,inbound,outbound}]
  function grouped(rows) {
    var W = 290, H = 132, L = 26, B = 18, T = 14, ph = H - B - T, max = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(r.inbound, r.outbound); }).concat([1]))), o = '', gw = (W - L - 6) / rows.length, bw = Math.min(30, gw / 3);
    [0, 0.5, 1].forEach(function (f) { var y = T + ph * (1 - f); o += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1"/>' + txt(L - 4, y + 3, Math.round(max * f), { anchor: 'end', size: 8 }); });
    rows.forEach(function (r, i) {
      var cx = L + gw * i + gw / 2;
      [['inbound', '#2563eb', -bw - 1], ['outbound', '#16a34a', 1]].forEach(function (s) {
        var v = r[s[0]], h = ph * v / max, x = cx + s[2];
        o += '<g data-go="warehouse:' + r.id + '" class="hit"><rect x="' + x + '" y="' + (T + ph - h) + '" width="' + bw + '" height="' + Math.max(1, h) + '" rx="3" fill="' + s[1] + '" data-tip="' + esc(r.label + ' · ' + (s[0] === 'inbound' ? 'Inbound' : 'Outbound') + '|' + v + ' shipments today') + '"/>' + txt(x + bw / 2, T + ph - h - 3, v, { anchor: 'middle', size: 8.5, fill: '#0f172a', weight: 700 }) + '</g>';
      });
      o += txt(cx, H - 4, r.label, { anchor: 'middle', size: 9, fill: '#334155', weight: 600 });
    });
    return svg(W, H, o, 'Warehouse inbound and outbound');
  }

  // Logistics Performance — line (on-time %) + bars (deliveries)  perf:{labels,onTime,deliveries}
  function line(perf) {
    var W = 290, H = 132, L = 28, R = 8, T = 12, B = 18, pw = W - L - R, ph = H - T - B, n = perf.onTime.length, lo = 85, hi = 100, o = '', dmax = niceMax(Math.max.apply(null, perf.deliveries)), step = pw / n;
    [85, 90, 95, 100].forEach(function (v) { var y = T + ph * (1 - (v - lo) / (hi - lo)); o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e2e8f0"/>' + txt(L - 4, y + 3, v + '%', { anchor: 'end', size: 8 }); });
    var ty = T + ph * (1 - (95 - lo) / (hi - lo)); o += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ty + '" y2="' + ty + '" stroke="#f59e0b" stroke-dasharray="3 3"/>' + txt(W - R, ty - 3, 'target 95%', { anchor: 'end', size: 7.5, fill: '#d97706' });
    perf.deliveries.forEach(function (v, i) { var h = ph * 0.45 * v / dmax; o += '<rect x="' + (L + step * i + step * 0.22).toFixed(1) + '" y="' + (T + ph - h).toFixed(1) + '" width="' + (step * 0.56).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="#bae6fd" opacity=".75"/>'; });
    var pts = perf.onTime.map(function (v, i) { return [L + step * i + step / 2, T + ph * (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo))]; });
    o += '<path d="M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L') + '" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function (p, i) {
      o += '<g data-go="view:logistics" class="hit"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="#fff" stroke="#0ea5e9" stroke-width="2" data-tip="' + esc(perf.labels[i] + '|On-time ' + perf.onTime[i] + '% · ' + perf.deliveries[i] + ' deliveries') + '"/>' + txt(p[0], H - 4, perf.labels[i], { anchor: 'middle', size: 8, fill: i === n - 1 ? '#0f172a' : '#64748b', weight: i === n - 1 ? 700 : 500 }) + '</g>';
    });
    o += txt(pts[n - 1][0], pts[n - 1][1] - 6, perf.onTime[n - 1] + '%', { anchor: 'middle', size: 9, fill: '#0369a1', weight: 700 });
    return svg(W, H, o, 'Logistics on-time performance');
  }

  // Department Status Distribution — donut  items:[{key,value,depts}] defs: OP_STATUS · active = ຕົວກອງປັດຈຸບັນ
  function donut(items, defs, active) {
    var W = 290, H = 132, cx = 66, cy = 66, r = 42, sw = 18, C = 2 * Math.PI * r, total = items.reduce(function (s, i) { return s + i.value; }, 0) || 1, off = 0, o = '';
    o += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eef2f7" stroke-width="' + sw + '"/>';
    items.forEach(function (it) {
      if (!it.value) return; var len = C * it.value / total, d = defs[it.key], on = !active || active === it.key;
      o += '<circle class="hit" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + d.color + '" stroke-width="' + (active === it.key ? sw + 4 : sw) + '" stroke-dasharray="' + (len - 1.5).toFixed(2) + ' ' + (C - len + 1.5).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" opacity="' + (on ? 1 : 0.28) + '" data-go="status:' + it.key + '" data-tip="' + esc(d.label + ' · ' + it.value + ' dept' + (it.value > 1 ? 's' : '') + '|' + it.depts.join(', ')) + '"/>';
      off += len;
    });
    o += '<g pointer-events="none">' + txt(cx, cy + 3, total, { anchor: 'middle', size: 20, fill: '#0f172a', weight: 800 }) + txt(cx, cy + 16, 'departments', { anchor: 'middle', size: 7.5 }) + '</g>';
    var y = 16; items.forEach(function (it) {
      var d = defs[it.key], on = !active || active === it.key;
      o += '<g class="hit" data-go="status:' + it.key + '" opacity="' + (it.value ? (on ? 1 : 0.4) : 0.35) + '"><rect x="132" y="' + (y - 8) + '" width="9" height="9" rx="2.5" fill="' + d.color + '"/>' + txt(146, y, d.label, { size: 9, fill: '#334155', weight: 600 }) + txt(W - 6, y, it.value, { anchor: 'end', size: 9.5, fill: '#0f172a', weight: 700 }) + '</g>'; y += 16.5;
    });
    return svg(W, H, o, 'Department status distribution');
  }
  window.VOCharts = { stacked: stacked, grouped: grouped, line: line, donut: donut };
})();
