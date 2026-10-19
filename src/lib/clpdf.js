/**
 * ຕື່ມຂໍ້ມູນໃສ່ຟອມ PDF "ໃບສັນຍາຢືມ ແລະ ນຳໃຊ້ຕູ້ແຊ່" (public/forms/loan.pdf, A4, 2 ໜ້າ)
 * ຕົ້ນສະບັບຟອມບໍ່ຖືກແຕະ — ລະບົບພຽງຂຽນຂໍ້ຄວາມ · ກາເຄື່ອງໝາຍ ✓ · ວາງຮູບລາຍເຊັນທັບລົງໄປຕາມຊ່ອງຫວ່າງ
 * ຊ່ອງທີ່ບໍ່ມີຂໍ້ມູນ ປະຫວ່າງໄວ້ຂຽນມືຄືເຈ້ຍຈິງ
 *
 * ພອດມາຈາກ coolers-page-code/server/lib/clpdf.js (Cooler Master Maintenance, Node/pg) → Workers:
 *   - fs.readFileSync(...)  → readAsset() ອ່ານຈາກ Workers Static Assets binding (env.ASSETS)
 *   - readUpload(local disk) → readR2() ອ່ານຮູບລາຍເຊັນຈາກ R2 bucket (env.PHOTOS) ດ້ວຍ key
 *   - ຕັດ kind 'cancel'/'lost' ອອກ (ຍັງບໍ່ໄດ້ຮ້ອງຂໍ) — ເຫຼືອສະເພາະ 'loan' (ໃບສັນຍາຢືມ)
 *
 * ຟອນ: Noto Sans Lao (ໂຕລາວ) + Noto Sans (ລາຕິນ/ຕົວເລກ) ຝັງດ້ວຍ fontkit — ໄຟລ໌ຢູ່ public/forms/
 */
import { PDFDocument, rgb, LineCapStyle } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { drawShaped, widthShaped } from './pdftext.js';
import { addOwnerDocPage } from './ownerdocpage.js';

const INK = rgb(0.08, 0.16, 0.45);   // ສີໜຶກຂຽນ — ຟ້າເຂັ້ມ ໃຫ້ແຍກອອກຈາກຟອມພິມ
const BLACK = rgb(0, 0, 0);

const cache = {};
/** ອ່ານໄຟລ໌ຄົງທີ່ (loan.pdf / ຟອນ) ຈາກ Workers Static Assets — cache ໄວ້ໃນ memory ຂອງ isolate */
async function readAsset(env, path) {
  if (cache[path]) return cache[path];
  const res = await env.ASSETS.fetch(new URL(path, 'https://assets.local/'));
  if (!res.ok) throw new Error(`ອ່ານໄຟລ໌ຟອມ/ຟອນບໍ່ພົບ: ${path}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  cache[path] = buf;
  return buf;
}

/** ອ່ານຮູບລາຍເຊັນຈາກ R2 (key ເກັບໄວ້ໃນ D1 loan_contracts.sig_*) */
async function readR2(env, key) {
  if (!key) return null;
  try {
    const obj = await env.PHOTOS.get(key);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  } catch { return null; }
}

/** ຖອດ base64 data URL (ຈາກ canvas.toDataURL ຝັ່ງ browser) ເປັນ bytes — ໃຊ້ສະເພາະໂໝດ preview (ຍັງບໍ່ໄດ້ອັບ R2) */
function readInline(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  try {
    const b64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

const dmy = (d) => {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Vientiane', day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(x);
  const g = (t) => p.find((q) => q.type === t)?.value || '';
  return [g('day'), g('month'), g('year')];
};
/** ເບີໂທແບບລາວ — master ເກັບເປັນ 2058876444 → ພິມເປັນ 020 5887 6444 ໃຫ້ອ່ານງ່າຍ */
const phoneLo = (v) => {
  let n = String(v || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('856')) n = n.slice(3);
  if (!n.startsWith('0')) n = `0${n}`;
  return n.length === 11 ? `${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}` : n;
};
const suffix = (docNo, prefix) => String(docNo || '').replace(new RegExp(`^${prefix}\\s*-?\\s*`, 'i'), '');

/**
 * ຂອບຊ່ອງ (ເສັ້ນຕັ້ງ) ຂອງຕາຕະລາງລະຫັດຕູ້ — QR Code / Serial Number / Cap-X Number
 * ຊ່ອງບໍ່ເທົ່າກັນ ຈຶ່ງເກັບເປັນພິກັດຂອບຈິງ (ວັດຈາກ loan.pdf ໂດຍໂຄດຕົ້ນສະບັບ)
 */
const EDGES_LOAN = [161.8, 180.5, 197.2, 214.0, 230.5, 247.0, 263.7, 280.0, 296.7, 313.0, 329.7, 346.2,
  362.7, 379.3, 395.8, 412.5, 429.0, 445.5, 462.2, 478.5, 495.2, 511.7, 528.3, 547.7];

/**
 * ສ້າງ PDF "ໃບສັນຍາຢືມ" ທີ່ຕື່ມແລ້ວ
 * @param env  Worker env (ຕ້ອງການ env.ASSETS, ແລະ env.PHOTOS ຖ້າບໍ່ແມ່ນໂໝດ preview)
 * @param d    ແຖວ loan_contracts (ເບິ່ງ migration_add_loan_contracts.sql) — ໃນໂໝດ preview: sig_* ເປັນ base64
 *             data URL ໂດຍກົງ (ຈາກ canvas.toDataURL) ແທນ R2 key, ຍ້ອນຍັງບໍ່ໄດ້ບັນທຶກ/ອັບໂຫລດແທ້
 * @param opts { preview?: boolean } preview=true → ອ່ານລາຍເຊັນຈາກ base64 ໃນ d ໂດຍກົງ, ບໍ່ແຕະ R2/DB
 * @returns Uint8Array
 */
export async function buildLoanPdf(env, d, opts = {}) {
  const pdf = await PDFDocument.load(await readAsset(env, '/forms/loan.pdf'));
  pdf.registerFontkit(fontkit);
  const FONT = {
    regular: {
      lao: await pdf.embedFont(await readAsset(env, '/forms/NotoSansLao-Regular.ttf'), { subset: true }),
      lat: await pdf.embedFont(await readAsset(env, '/forms/NotoSans-Regular.ttf'), { subset: true }),
    },
    bold: {
      lao: await pdf.embedFont(await readAsset(env, '/forms/NotoSansLao-Bold.ttf'), { subset: true }),
      lat: await pdf.embedFont(await readAsset(env, '/forms/NotoSans-Bold.ttf'), { subset: true }),
    },
  };
  const [p1, p2] = pdf.getPages();

  // ── ເຄື່ອງມືຂຽນ (ຄືເດີມ, ພອດຈາກ clpdf.js) ──
  const isLao = (c) => { const o = c.codePointAt(0); return o >= 0x0E80 && o <= 0x0EFF; };
  const runs = (str, w) => {
    const out = [];
    for (const c of str) {
      const k = isLao(c) ? 'lao' : (c === ' ' && out.length) ? out[out.length - 1].k : 'lat';
      const last = out[out.length - 1];
      if (last && last.k === k) last.s += c; else out.push({ k, s: c });
    }
    return out.map((r) => ({ ...r, font: w[r.k] }));
  };
  const widthOf = (rs, sz) => rs.reduce((a, r) => a + widthShaped(r.s, sz, r.font), 0);
  const draw = (pg, rs, x, y, sz, color) => {
    let cx = x;
    for (const r of rs) cx += drawShaped(pg, r.s, { x: cx, y, size: sz, font: r.font, color });
  };
  const txt = (pg, s, x, y, { size = 9, bold = false, color = INK, maxW = 0,
    lift = 1.6, clear: clr = false } = {}) => {
    const str = s == null ? '' : String(s).trim();
    if (!str) return;
    const w = bold ? FONT.bold : FONT.regular;
    let rs = runs(str, w);
    let sz = size;
    if (maxW) {
      while (sz > 5.5 && widthOf(rs, sz) > maxW) sz -= 0.5;
      if (widthOf(rs, sz) > maxW) {
        let cut = str;
        while (cut.length > 1 && widthOf(runs(`${cut}…`, w), sz) > maxW) cut = cut.slice(0, -1);
        rs = runs(`${cut}…`, w);
      }
    }
    if (clr) {
      const wide = typeof clr === 'number' ? clr : Math.min(widthOf(rs, sz) + 3, maxW || 1e4);
      pg.drawRectangle({ x: x - 1.5, y: y - 2.6, width: wide, height: sz + 1.5, color: rgb(1, 1, 1) });
    }
    draw(pg, rs, x, y + lift, sz, color);
  };
  const row = (pg, y, x0, x1, cells, o = {}) => {
    const { label: ls = 9, value: vs0 = 9.5, gap = 7, min = 6.5, lift = 1.4 } = o;
    const items = cells.filter((c) => c.label || c.value);
    if (!items.length) return;
    pg.drawRectangle({ x: x0, y: y - 3, width: (x1 - x0) + (o.wipe ?? 7), height: (o.h || 12), color: rgb(1, 1, 1) });
    const labs = items.map((c) => runs(String(c.label || ''), FONT.regular));
    const labW = labs.map((r) => widthOf(r, ls));
    const vals = items.map((c) => String(c.value ?? '').trim());
    const holds = items.map((c) => c.min || 0);
    const fixed = labW.reduce((a, b) => a + b, 0) + items.length * 2 + gap * (items.length - 1);
    const avail = Math.max(x1 - x0 - fixed, 20);
    let vs = vs0;
    const natural = () => vals.reduce((a, v, i) => a + Math.max(widthOf(runs(v, FONT.regular), vs), holds[i]), 0);
    while (vs > min && natural() > avail) vs -= 0.25;
    const wide = vals.map((v) => widthOf(runs(v, FONT.regular), vs));
    const totalW = wide.reduce((a, b, i) => a + Math.max(b, holds[i]), 0);
    const share = totalW > avail ? wide.map((w) => (w / (totalW || 1)) * avail) : wide;
    let x = x0;
    items.forEach((c, i) => {
      draw(pg, labs[i], x, y + lift, ls, BLACK);
      x += labW[i] + 2;
      const rest = items.slice(i + 1).reduce((a, _, k) => a + labW[i + 1 + k] + 2 + Math.max(holds[i + 1 + k], 8) + gap, 0);
      const room = Math.max(Math.min(share[i], x1 - x - rest), 10);
      let rs = runs(vals[i], FONT.regular);
      if (widthOf(rs, vs) > room + 0.5) {
        let cut = vals[i];
        while (cut.length > 1 && widthOf(runs(`${cut}…`, FONT.regular), vs) > room) cut = cut.slice(0, -1);
        rs = runs(`${cut}…`, FONT.regular);
      }
      draw(pg, rs, x, y + lift, vs, INK);
      x += Math.max(widthOf(rs, vs), holds[i]) + gap;
    });
  };
  const mid = (pg, s, x, w, y, { size = 9, bold = false, color = INK } = {}) => {
    const str = s == null ? '' : String(s).trim();
    if (!str) return;
    const rs = runs(str, bold ? FONT.bold : FONT.regular);
    let sz = size;
    while (sz > 5 && widthOf(rs, sz) > w) sz -= 0.5;
    draw(pg, rs, x + (w - widthOf(rs, sz)) / 2, y, sz, color);
  };
  const cells = (pg, s, y, { from = 0, size = 9, bold = false } = {}) => {
    const str = s == null ? '' : String(s).trim();
    if (!str) return;
    for (let i = 0; i < str.length && from + i < EDGES_LOAN.length - 1; i++) {
      const x = EDGES_LOAN[from + i];
      mid(pg, str[i], x, EDGES_LOAN[from + i + 1] - x, y, { size, bold });
    }
  };
  const date = (pg, dv, x, y, gap = [0, 30, 58], size = 8.5) => {
    const v = dmy(dv);
    if (!v) return;
    txt(pg, v[0], x + gap[0], y, { size });
    txt(pg, v[1], x + gap[1], y, { size });
    txt(pg, v[2], x + gap[2], y, { size });
  };
  const tick = (pg, cx, cy, s = 7.6) => {
    const h = s / 2;
    const a = { x: cx - h, y: cy - 0.05 * s };
    const b = { x: cx - 0.15 * s, y: cy - h + 0.15 * s };
    const c = { x: cx + h + 0.15 * s, y: cy + h + 0.1 * s };
    pg.drawLine({ start: a, end: b, thickness: 1.9, color: INK, lineCap: LineCapStyle.Round });
    pg.drawLine({ start: b, end: c, thickness: 1.9, color: INK, lineCap: LineCapStyle.Round });
  };
  /** ຮູບລາຍເຊັນໃສ່ຊ່ອງ (ຢູ່ກາງກ່ອງ) — d[`sig_${slot}`] ເປັນ R2 key, ຖ້າບໍ່ມີ (ເຊັ່ນ dsm) ປະຊ່ອງຫວ່າງໄວ້ຂຽນມື */
  const sign = async (pg, slot, box) => {
    const img = opts.preview ? readInline(d[`sig_${slot}`]) : await readR2(env, d[`sig_${slot}`]);
    if (img) {
      try {
        const im = await pdf.embedPng(img);
        const k = Math.min(box.w / im.width, box.h / im.height);
        const w = im.width * k;
        const h = im.height * k;
        pg.drawImage(im, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h });
      } catch { /* ໄຟລ໌ລາຍເຊັນເສຍ — ປະຊ່ອງຫວ່າງ */ }
    }
    if (box.nameY && d[`sig_${slot}_name`]) {
      mid(pg, d[`sig_${slot}_name`], box.x, box.w, box.nameY, { size: 7.5 });
    }
  };

  const doors = d.doors || null;
  const created = d.created_at;

  txt(p1, suffix(d.doc_no, 'DOC'), 471, 715.5, { size: 10, bold: true });

  // 1.1 ຮ້ານຄ້າ
  row(p1, 470.2, 79.6, 544, [
    { label: 'ລະຫັດຮ້ານຄ້າ:', value: d.outlet_code },
    { label: 'ຊື່ຮ້ານຄ້າ:', value: d.outlet_name },
    { label: 'ຊື່ເຈົ້າຂອງຮ້ານ:', value: d.outlet_owner },
  ]);
  row(p1, 454.5, 79.6, 544, [
    { label: 'ປະເພດຮ້ານ:', value: d.outlet_type },
    { label: 'ລະດັບຮ້ານ:', value: d.outlet_grade, min: 12 },
    { label: 'ເບີໂທຮ້ານ:', value: phoneLo(d.outlet_phone), min: 52 },
    { label: 'ເຮືອນເລກທີ:', value: '', min: 30 },
    { label: 'ໜ່ວຍ:', value: '', min: 18 },
  ]);
  row(p1, 438.7, 79.6, 544, [
    { label: 'ບ້ານ:', value: d.village },
    { label: 'ເມືອງ:', value: d.district },
    { label: 'ແຂວງ:', value: d.province },
  ]);

  // ຕາຕະລາງຍອດຂາຍ (ດ້ານເທິງ) — ຕື່ມສະເພາະແຖວ Total ຂອງ 4 ປະເພດ ໃສ່ຊ່ອງຄ່າ (ຖັດຈາກຄຳວ່າ Total) · ພິກັດວັດຈາກ loan.pdf
  // ຊ່ອງວ່າງ (ບໍ່ໄດ້ກອກ) ປະໄວ້ຂຽນມື; 0 ພິມເປັນ 0
  const fmtSales = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
  };
  const SALES_CELLS = [
    ['sales_beer', 138.4, 60.6],
    ['sales_premium', 264.4, 60.3],
    ['sales_csd_energy', 381.4, 62.9],
    ['sales_water_soda', 502.9, 44.5],
  ];
  for (const [k, x, w] of SALES_CELLS) mid(p1, fmtSales(d[k]), x, w, 511.2, { size: 9, bold: true });

  // ປະເພດສັນຍາ · ການມອບຕູ້ · ຂະໜາດຕູ້ (ພິກັດ = ໃຈກາງກ່ອງ checkbox ຂອງຟອມ)
  const ct = { partner_club: 185, competitive: 296, none: 424.8 }[d.contract_type];
  if (ct) tick(p1, ct, 425.3);
  const ho = { new: 183.5, move: 281, extra: 352, replace: 420, survey: 479.5 }[d.handover_type];
  if (ho) tick(p1, ho, 392.3);
  const dr = { 1: 183.2, 2: 298.5, 3: 426 }[doors];
  if (dr) tick(p1, dr, 374.8);

  // ຕາຕະລາງລະຫັດຕູ້ — QR ຂຽນຕໍ່ຈາກຊ່ອງ C L - (ຊ່ອງທີ 3)
  cells(p1, suffix(d.qr_cd, 'CL'), 353.3, { from: 3, size: 9.5 });
  // ຂະໜາດຕູ້ 1 ປະຕູ ມີຕົວເລືອກເສີມ (modern small / table cooler) — ຕໍ່ທ້າຍຊື່ຍີ່ຫໍ້ຕູ້ແຊ່
  const DOOR_VARIANT_LABEL = { modern_small: '1 door modern small', table_cooler: 'table cooler' };
  const variantLabel = doors === 1 ? DOOR_VARIANT_LABEL[d.door_variant] : null;
  const brandText = [d.cooler_brand, variantLabel].filter((x) => x && String(x).trim()).join(' ');
  mid(p1, brandText, 362.7, 185, 353.3, { size: 9 });
  cells(p1, d.serial_no, 338.3, { size: 9.5 });
  cells(p1, d.capx, 321.2, { size: 9.5 });

  // ກ່ອງ "ສະເພາະຕູ້ແຊ່ຖືກເຄື່ອນຍ້າຍມາຈາກຮ້ານຄ້າອື່ນ" — ຕື່ມສະເພາະໃບຍ້າຍຕູ້ (handover_type === 'move')
  if (d.handover_type === 'move') {
    txt(p1, suffix(d.old_doc_no, 'DOC'), 425, 271, { size: 9, lift: 0 });
    txt(p1, d.old_outlet_code, 425, 256.3, { size: 8, maxW: 118, lift: 0 });
    txt(p1, d.old_outlet_name, 425, 241.6, { size: 8, maxW: 118, lift: 0 });
    txt(p1, phoneLo(d.old_outlet_phone), 425, 226.8, { size: 8, maxW: 118, lift: 0 });
    txt(p1, d.move_reason, 245, 212.1, { size: 7, maxW: 118, lift: 0 });
    await sign(p1, 'old_outlet', { x: 420, y: 186, w: 124, h: 22 });
    txt(p1, d.sig_old_outlet_name, 423, 180, { size: 6.5, maxW: 118, lift: 0 });
  }

  // ລາຍເຊັນ (mde · dsm · admin) — dsm ບໍ່ມີບົດບາດນີ້ໃນລະບົບ ຈຶ່ງປະຊ່ອງຫວ່າງໄວ້ຂຽນມືສະເໝີ
  await sign(p1, 'mde', { x: 85, y: 104, w: 140, h: 42 });
  await sign(p1, 'dsm', { x: 235, y: 104, w: 140, h: 42 });
  await sign(p1, 'admin', { x: 385, y: 104, w: 155, h: 42 });
  txt(p1, d.sig_mde_name, 115, 92.4, { size: 8.5, maxW: 90, clear: true });
  txt(p1, suffix(d.mde_code, 'MDE'), 152, 76.6, { size: 8.5, maxW: 52, clear: true });
  txt(p1, phoneLo(d.mde_phone).replace(/^020\s*/, ''), 137, 60.9, { size: 8.5, maxW: 67, clear: true });
  mid(p1, d.sig_dsm_name, 232, 146, 78, { size: 8 });
  mid(p1, d.sig_admin_name, 384, 160, 78, { size: 8 });
  date(p1, d.sig_mde_at, 85, 43.8, [26, 58, 84], 8);
  date(p1, d.sig_dsm_at, 236.4, 43.8, [26, 58, 84], 8);
  date(p1, d.sig_admin_at, 382, 43.8, [26, 58, 84], 8);

  // ໜ້າ 2 — ເງື່ອນໄຂສັນຍາ + ລາຍເຊັນເຈົ້າຂອງຮ້ານ
  date(p2, d.sig_outlet_at || created, 445.2, 183.7, [7, 43, 67], 9);
  await sign(p2, 'outlet', { x: 395, y: 56, w: 145, h: 58 });
  if (d.sig_outlet_name) mid(p2, d.sig_outlet_name, 395, 145, 48, { size: 8 });

  // ຕໍ່ເອກະສານເຈົ້າຂອງຮ້ານເປັນໜ້າສຸດທ້າຍ (opts.ownerDocBytes ຈາກ endpoint — admin/MDE ເຈົ້າຂອງໃບ/DSM ເທົ່ານັ້ນ)
  if (opts.ownerDocBytes) await addOwnerDocPage(pdf, opts.ownerDocBytes);
  return pdf.save();
}
