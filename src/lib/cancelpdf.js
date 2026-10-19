/**
 * ຕື່ມຂໍ້ມູນໃສ່ຟອມ PDF "ໃບສະເໜີຍົກເລີກສັນຍາຢືມ ແລະ ນຳໃຊ້ຕູ້ແຊ່" (T-) — public/forms/cancel.pdf (Letter, 1 ໜ້າ)
 * ຕົ້ນສະບັບຟອມບໍ່ຖືກແຕະ — ຂຽນຂໍ້ຄວາມທັບເສັ້ນຈຸດ · ກາເຄື່ອງໝາຍ ✓ · ວາງຮູບລາຍເຊັນ ຄືກັນກັບ clpdf.js (ໃບສັນຍາຢືມ)
 * ພິກັດທັງໝົດວັດຈາກ cancel.pdf (ຫົວໜ່ວຍ pt, ຈຸດເລີ່ມຢູ່ມຸມຊ້າຍລຸ່ມ)
 */
import { PDFDocument, rgb, LineCapStyle } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { drawShaped, widthShaped } from './pdftext.js';
import { addOwnerDocPage } from './ownerdocpage.js';

const INK = rgb(0.08, 0.16, 0.45);
const cache = {};
async function readAsset(env, path) {
  if (cache[path]) return cache[path];
  const res = await env.ASSETS.fetch(new URL(path, 'https://assets.local/'));
  if (!res.ok) throw new Error(`ອ່ານໄຟລ໌ຟອມ/ຟອນບໍ່ພົບ: ${path}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  cache[path] = buf;
  return buf;
}
async function readR2(env, key) {
  if (!key) return null;
  try {
    const obj = await env.PHOTOS.get(key);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  } catch { return null; }
}
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
const phoneLo = (v) => {
  let n = String(v || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('856')) n = n.slice(3);
  if (!n.startsWith('0')) n = `0${n}`;
  return n.length === 11 ? `${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}` : n;
};
const suffix = (docNo, prefix) => String(docNo || '').replace(new RegExp(`^${prefix}\\s*-?\\s*`, 'i'), '');

// ຂອບຊ່ອງ (ເສັ້ນຕັ້ງ) ຂອງຕາຕະລາງລະຫັດຕູ້ — ວັດຈາກ cancel.pdf
const EDGES_QR = [217.9, 234.4, 251.0, 267.5, 284.0, 300.5, 317.0];               // 6 ຊ່ອງຫຼັງ "C L -"
const EDGES_SN = [165.7, 184.3, 201.2, 217.9, 234.4, 251.0, 267.5, 284.0, 300.5, 317.0, 333.5, 350.1,
  366.7, 384.0, 401.2, 418.4, 435.7, 453.0, 469.5, 486.1, 502.7, 519.1, 540.1, 558.1]; // Serial / Cap-X (23 ຊ່ອງ)

// ຈຸດກາງກ່ອງ checkbox ຂອງແຕ່ລະເຫດຜົນ
const REASON_BOX = {
  damaged: [93.8, 443.8],
  closed: [256.5, 443.8],
  small_business: [434.5, 443.8],
  replace: [92.2, 415.4],
};

/**
 * @param d  ແຖວ cancel_contracts — ໃນໂໝດ preview sig_* ເປັນ base64 data URL ແທນ R2 key
 */
export async function buildCancelPdf(env, d, opts = {}) {
  const pdf = await PDFDocument.load(await readAsset(env, '/forms/cancel.pdf'));
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
  const [pg] = pdf.getPages();

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
  const draw = (rs, x, y, sz, color) => {
    let cx = x;
    for (const r of rs) cx += drawShaped(pg, r.s, { x: cx, y, size: sz, font: r.font, color });
  };
  // ຂຽນຂໍ້ຄວາມ — ຫຍໍ້ຂະໜາດ/ຕັດ "…" ຖ້າຍາວເກີນ maxW
  const txt = (s, x, y, { size = 9.5, bold = false, maxW = 0, lift = 1.6 } = {}) => {
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
    draw(rs, x, y + lift, sz, INK);
  };
  const mid = (s, x, w, y, { size = 9, bold = false } = {}) => {
    const str = s == null ? '' : String(s).trim();
    if (!str) return;
    const rs = runs(str, bold ? FONT.bold : FONT.regular);
    let sz = size;
    while (sz > 5 && widthOf(rs, sz) > w) sz -= 0.5;
    draw(rs, x + (w - widthOf(rs, sz)) / 2, y, sz, INK);
  };
  const cells = (s, edges, y, size = 9.5) => {
    const str = s == null ? '' : String(s).trim();
    for (let i = 0; i < str.length && i < edges.length - 1; i++) {
      mid(str[i], edges[i], edges[i + 1] - edges[i], y, { size });
    }
  };
  const tick = (cx, cy, s = 7.6) => {
    const h = s / 2;
    const a = { x: cx - h, y: cy - 0.05 * s };
    const b = { x: cx - 0.15 * s, y: cy - h + 0.15 * s };
    const c = { x: cx + h + 0.15 * s, y: cy + h + 0.1 * s };
    pg.drawLine({ start: a, end: b, thickness: 1.9, color: INK, lineCap: LineCapStyle.Round });
    pg.drawLine({ start: b, end: c, thickness: 1.9, color: INK, lineCap: LineCapStyle.Round });
  };
  const sign = async (slot, box) => {
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
    if (slot !== 'mde' && d[`sig_${slot}_name`]) mid(d[`sig_${slot}_name`], box.x, box.w, 119, { size: 8 });
  };

  // ເລກທີເອກະສານ (ຕໍ່ຈາກ "T -" ໃນກ່ອງມຸມຂວາເທິງ)
  txt(suffix(d.doc_no, 'T'), 472, 682, { size: 10, bold: true });

  // ຂໍ້ມູນຮ້ານຄ້າ (ຂຽນທັບເສັ້ນຈຸດ)
  txt(d.outlet_owner, 158, 535.5, { maxW: 124 });
  txt(d.outlet_name, 406, 535.5, { maxW: 148 });
  txt(d.outlet_type, 126, 513.4, { maxW: 104 });
  txt(d.outlet_code, 287, 513.4, { maxW: 116 });
  txt(d.outlet_grade, 459, 513.4, { maxW: 94 });
  txt(d.village, 95, 491.6, { maxW: 84 });
  txt(d.district, 208, 491.6, { maxW: 88 });
  txt(d.province, 330, 491.6, { maxW: 100 });
  txt(phoneLo(d.outlet_phone), 450, 491.6, { maxW: 104 });

  // ເຫດຜົນ — ຕິກໄດ້ຫຼາຍຂໍ້
  for (const r of String(d.reasons || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const b = REASON_BOX[r];
    if (b) tick(b[0], b[1]);
  }

  // ເລກທີສັນຍາທີ່ຕ້ອງການຍົກເລີກ (ຕໍ່ຈາກ "DOC -")
  txt(suffix(d.loan_doc_no, 'DOC'), 264, 359.2, { size: 10, bold: true });

  // ຕາຕະລາງລະຫັດຕູ້
  cells(suffix(d.qr_cd, 'CL'), EDGES_QR, 339.2);
  mid(d.cooler_brand, 366.7, 86.3, 339.2, { size: 9 });
  // ຊ່ອງ Door: ຂະໜາດຕູ້ 1 ປະຕູ ມີຕົວເລືອກເສີມ (modern small / table cooler) — ຂຽນ 2 ແຖວໃນຊ່ອງ Door (ເລກ 1 + ຕົວເລືອກເສີມ)
  const DOOR_VARIANT_LABEL = { modern_small: 'modern small', table_cooler: 'table cooler' };
  const variantLabel = Number(d.doors) === 1 ? DOOR_VARIANT_LABEL[d.door_variant] : null;
  if (variantLabel) {
    mid('1', 502.7, 55.4, 345.6, { size: 8.5 });
    mid(variantLabel, 502.7, 55.4, 336.6, { size: 6.5 });
  } else {
    mid(d.doors ? String(d.doors) : '', 502.7, 55.4, 339.2, { size: 9.5 });
  }
  cells(d.serial_no, EDGES_SN, 316.6);
  cells(d.capx, EDGES_SN, 294.1);

  // ວັນທີ
  const dv = dmy(d.sig_mde_at || d.created_at);
  if (dv) {
    txt(dv[0], 436, 245.5, { size: 9, lift: 0 });
    txt(dv[1], 481, 245.5, { size: 9, lift: 0 });
    txt(dv[2], 512, 245.5, { size: 9, lift: 0 });
  }

  // ລາຍເຊັນ (ຢູ່ລຸ່ມຊື່ບົດບາດ) — DSM/ເຈົ້າຂອງຮ້ານ ປະຫວ່າງໄວ້ຂຽນມື ຖ້າບໍ່ມີລາຍເຊັນ
  await sign('admin', { x: 64, y: 128, w: 120, h: 56 });
  await sign('dsm', { x: 207, y: 128, w: 120, h: 56 });
  await sign('mde', { x: 347, y: 128, w: 120, h: 56 });
  await sign('outlet', { x: 472, y: 128, w: 100, h: 56 });

  // ຜູ້ແຈ້ງ (MDE)
  txt(d.informer_name || d.sig_mde_name, 384, 117.5, { size: 8.5, maxW: 72 });
  txt(suffix(d.mde_code, 'MDE'), 420, 101.8, { size: 8.5, maxW: 38 });
  txt(phoneLo(d.mde_phone).replace(/^020\s*/, ''), 402, 86, { size: 8.5, maxW: 54 });

  // ຕໍ່ເອກະສານເຈົ້າຂອງຮ້ານເປັນໜ້າສຸດທ້າຍ (opts.ownerDocBytes ຈາກ endpoint — admin/MDE ເຈົ້າຂອງໃບ/DSM ເທົ່ານັ້ນ)
  if (opts.ownerDocBytes) await addOwnerDocPage(pdf, opts.ownerDocBytes);
  return pdf.save();
}
