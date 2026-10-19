/**
 * PDF "ໃບສົ່ງຕູ້ແຊ່ຕ່າງແຂວງ" ສຳລັບຜູ້ຮັບປາຍທາງ (ເປີດຈາກລິ້ງເຊັນຮັບ /receive?t=...)
 * - ສະແດງສະເພາະຕູ້ຂອງແຂວງຂອງຜູ້ຮັບ (ບໍ່ເປີດເຜີຍຕູ້ຂອງແຂວງອື່ນໃນຖ້ຽວດຽວກັນ)
 * - A4 ແນວຕັ້ງ, ຕາຕະລາງຂຶ້ນໜ້າໃໝ່ອັດຕະໂນມັດ, ມີລາຍເຊັນຜູ້ຈັດສົ່ງ / ຄົນຂັບ / ຜູ້ອະນຸມັດ (ຖ້າເຊັນແລ້ວ)
 */
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { drawShaped, widthShaped } from './pdftext.js';

const INK = rgb(0.07, 0.09, 0.15);
const GRAY = rgb(0.4, 0.45, 0.52);
const HEAD_BG = rgb(0.9, 0.91, 0.92);
const LINE = rgb(0.35, 0.35, 0.35);

const cache = {};
async function readAsset(env, path) {
  if (cache[path]) return cache[path];
  const res = await env.ASSETS.fetch(new URL(path, 'https://assets.local/'));
  if (!res.ok) throw new Error(`ອ່ານໄຟລ໌ຟອນ/ຮູບບໍ່ພົບ: ${path}`);
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
const fmtDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || '-');
};

/**
 * @param trip   ແຖວ ship_trips (trip_no, truck_plate, driver_name, driver_phone, trip_date, note, sig_*)
 * @param province  ແຂວງປາຍທາງຂອງຜູ້ຮັບ
 * @param items  ຕູ້ຂອງແຂວງນີ້ (receiptItems)
 */
export async function buildTripDocPdf(env, trip, province, items) {
  const pdf = await PDFDocument.create();
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

  const W = 595.28, H = 841.89, M = 36;
  let pg = null;
  let y = 0;

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
  const draw = (rs, x, yy, sz, color) => {
    let cx = x;
    for (const r of rs) cx += drawShaped(pg, r.s, { x: cx, y: yy, size: sz, font: r.font, color });
  };
  // ຂຽນຂໍ້ຄວາມ (ຕັດ … ຖ້າຍາວເກີນ maxW)
  const txt = (s, x, yy, { size = 9.5, bold = false, maxW = 0, color = INK, align = 'left', fit = 0 } = {}) => {
    let str = s == null ? '' : String(s).trim();
    if (!str) return;
    const w = bold ? FONT.bold : FONT.regular;
    let rs = runs(str, w);
    // fit = ຂະໜາດຕ່ຳສຸດ: ຖ້າຍາວເກີນຊ່ອງ ໃຫ້ຫຍໍ້ຕົວອັກສອນລົງກ່ອນ (ບໍ່ຕັດ/ບໍ່ທັບຊ່ອງຖັດໄປ) ຈຶ່ງຄ່ອຍຕັດ …
    if (fit && maxW) {
      while (size > fit && widthOf(rs, size) > maxW) size = Math.max(fit, size - 0.25);
    }
    if (maxW && widthOf(rs, size) > maxW) {
      let cut = str;
      while (cut.length > 1 && widthOf(runs(`${cut}…`, w), size) > maxW) cut = cut.slice(0, -1);
      str = `${cut}…`;
      rs = runs(str, w);
    }
    let xx = x;
    if (align === 'center' && maxW) xx = x + (maxW - widthOf(rs, size)) / 2;
    draw(rs, xx, yy, size, color);
  };

  const newPage = () => {
    pg = pdf.addPage([W, H]);
    y = H - M;
  };

  // ---------- ຫົວກະດາດ ----------
  newPage();
  try {
    const logo = await pdf.embedPng(await readAsset(env, '/icons/beerlao-logo.png'));
    const lh = 54;
    const lw = (logo.width / logo.height) * lh;
    pg.drawImage(logo, { x: M, y: y - lh, width: lw, height: lh });
  } catch { /* ບໍ່ມີໂລໂກ້ — ຂ້າມ */ }
  const tx = M + 80;
  txt('Lao Brewery Co., Ltd.', tx, y - 14, { size: 14, bold: true });
  txt('Km 12 Thadeua Road, Hadsayfong District, Vientiane LAO P.D.R. P.O Box 1016', tx, y - 28, { size: 8, color: GRAY });
  txt('Tel: (856-21) 812001, 812045, 812253  |  E-mail: info@beerlao.la', tx, y - 39, { size: 8, color: GRAY });
  y -= 62;
  pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: INK });
  y -= 24;

  txt('ໃບສົ່ງຕູ້ແຊ່ຕ່າງແຂວງ', M, y, { size: 17, bold: true, maxW: W - 2 * M, align: 'center' });
  y -= 18;
  txt(`ເລກຖ້ຽວ: ${trip.trip_no || '-'}`, M, y, { size: 10.5, maxW: W - 2 * M, align: 'center' });
  y -= 20;

  // ---------- ຂໍ້ມູນຖ້ຽວ ----------
  const infoRows = [
    ['ເລກທະບຽນລົດ', trip.truck_plate || '-', 'ວັນທີອອກລົດ', fmtDate(trip.trip_date)],
    ['ຄົນຂັບລົດ', trip.driver_name || '-', 'ເບີໂທ', trip.driver_phone || '-'],
    ['ແຂວງປາຍທາງ', province || '-', 'ຈຳນວນຕູ້', `${items.length} ຕູ້`],
  ];
  const cw = (W - 2 * M) / 4;
  const rh = 20;
  for (const r of infoRows) {
    for (let i = 0; i < 4; i++) {
      const x = M + i * cw;
      const isKey = i % 2 === 0;
      pg.drawRectangle({
        x, y: y - rh, width: cw, height: rh,
        borderColor: LINE, borderWidth: 0.6, color: isKey ? HEAD_BG : undefined,
      });
      txt(r[i], x + 5, y - 13.5, { size: 9.5, bold: isKey, maxW: cw - 10 });
    }
    y -= rh;
  }
  if (trip.note) {
    pg.drawRectangle({ x: M, y: y - rh, width: cw, height: rh, borderColor: LINE, borderWidth: 0.6, color: HEAD_BG });
    pg.drawRectangle({ x: M + cw, y: y - rh, width: cw * 3, height: rh, borderColor: LINE, borderWidth: 0.6 });
    txt('ໝາຍເຫດ', M + 5, y - 13.5, { size: 9.5, bold: true, maxW: cw - 10 });
    txt(trip.note, M + cw + 5, y - 13.5, { size: 9.5, maxW: cw * 3 - 10 });
    y -= rh;
  }
  y -= 16;

  // ---------- ຕາຕະລາງຕູ້ ----------
  txt(`ແຂວງ ${province || '-'}  (${items.length} ຕູ້)`, M, y, { size: 12, bold: true });
  y -= 10;

  // ຄໍລຳ: ລ/ດ, Brand, Type, Model, QR Code, Serial, CapEx
  const cols = [
    { k: '#', t: 'ລ/ດ', w: 24, c: true },
    { k: 'cooler_brand', t: 'Brand', w: 56 },
    { k: 'cooler_type', t: 'Type', w: 56 },
    { k: 'cooler_model', t: 'Model', w: 66 },
    { k: 'qr_code', t: 'QR Code', w: 80 },
    { k: 'serial_number', t: 'Serial', w: 0 },
    { k: 'capex', t: 'CapEx', w: 116 },
  ];
  const fixed = cols.reduce((a, c) => a + c.w, 0);
  cols.find((c) => c.k === 'serial_number').w = W - 2 * M - fixed;

  const drawHeader = () => {
    let x = M;
    for (const c of cols) {
      pg.drawRectangle({ x, y: y - 18, width: c.w, height: 18, borderColor: LINE, borderWidth: 0.6, color: HEAD_BG });
      txt(c.t, x + 4, y - 12.5, { size: 9, bold: true, maxW: c.w - 8, align: c.c ? 'center' : 'left' });
      x += c.w;
    }
    y -= 18;
  };
  drawHeader();

  const trh = 18;
  items.forEach((it, i) => {
    if (y - trh < M + 30) { newPage(); drawHeader(); }
    let x = M;
    for (const c of cols) {
      pg.drawRectangle({ x, y: y - trh, width: c.w, height: trh, borderColor: LINE, borderWidth: 0.6 });
      const v = c.k === '#' ? String(i + 1) : it[c.k];
      txt(v, x + 4, y - 12.5, { size: 8.5, maxW: c.w - 8, align: c.c ? 'center' : 'left', fit: 6 });
      x += c.w;
    }
    y -= trh;
  });
  y -= 14;

  // ---------- ຜູ້ຮັບປາຍທາງ (ເຊັນຜ່ານລິ້ງ) ----------
  if (y < M + 150) { newPage(); }
  txt(`ຜູ້ຮັບຕູ້ປາຍທາງ (ແຂວງ ${province || '-'}): ເຊັນຮັບໃນລິ້ງອອນລາຍ`, M, y, { size: 9.5, color: GRAY, maxW: W - 2 * M });
  y -= 22;

  // ---------- ລາຍເຊັນຝ່າຍຂົນສົ່ງ ----------
  const boxes = [
    { label: 'ຜູ້ຈັດສົ່ງ / ຜູ້ກວດນັບຕູ້', key: trip.sig_sender },
    { label: 'ຄົນຂັບລົດ', key: trip.sig_driver },
    { label: 'ຜູ້ອະນຸມັດ', key: trip.sig_approver },
  ];
  const gap = 14;
  const bw = (W - 2 * M - gap * 2) / 3;
  const sigH = 46;
  for (let i = 0; i < boxes.length; i++) {
    const x = M + i * (bw + gap);
    const img = await readR2(env, boxes[i].key);
    if (img) {
      try {
        const im = await pdf.embedPng(img);
        const k = Math.min((bw - 20) / im.width, sigH / im.height);
        const w = im.width * k;
        const h = im.height * k;
        pg.drawImage(im, { x: x + (bw - w) / 2, y: y - sigH + (sigH - h) / 2, width: w, height: h });
      } catch { /* ລາຍເຊັນເສຍ — ປະຊ່ອງຫວ່າງ */ }
    }
    pg.drawLine({ start: { x: x + 6, y: y - sigH - 4 }, end: { x: x + bw - 6, y: y - sigH - 4 }, thickness: 0.7, color: INK });
    txt(boxes[i].label, x, y - sigH - 17, { size: 9, maxW: bw, align: 'center' });
  }

  // ເລກໜ້າ
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    pg = p;
    txt(`${trip.trip_no || ''} · ${province || ''}   ${i + 1}/${pages.length}`, M, 18, { size: 8, color: GRAY, maxW: W - 2 * M, align: 'center' });
  });

  return await pdf.save();
}
