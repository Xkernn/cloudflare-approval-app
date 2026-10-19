/**
 * ຂຽນຂໍ້ຄວາມລາວລົງ PDF ໃຫ້ສະຫຼະ/ວັນນະຍຸດຢູ່ຖືກໂຕ
 *
 * ບັນຫາ: pdf-lib ວາງ glyph ຕາມ advance width ຢ່າງດຽວ ບໍ່ອ່ານຕາຕະລາງ GPOS ຂອງຟອນ
 * ແຕ່ Noto Sans Lao ອອກແບບໃຫ້ເຄື່ອງໝາຍ (ີ ້ ຸ ົ ່ …) ຢູ່ຂວາຈຸດເລີ່ມ ແລ້ວອາໄສ GPOS
 * (mark-to-base) ດຶງກັບມາທັບພະຍັນຊະນະ → ຜົນຄື ເຄື່ອງໝາຍໄປຕົກໃສ່ໂຕຖັດໄປ
 *
 * ວິທີແກ້: ໃຫ້ fontkit ຈັດວາງ (layout) ໄດ້ຕຳແໜ່ງແຕ່ລະ glyph ແລ້ວຂຽນທີລະ glyph
 * ດ້ວຍ text matrix ຂອງມັນເອງ — ຮັກສາ GSUB ແລະ GPOS ຄົບຖ້ວນ
 *
 * ພອດມາຈາກ coolers-page-code (Cooler Master Maintenance) — ບໍ່ໄດ້ໃຊ້ fs/Node API ໃດໆ
 * ໃຊ້ໄດ້ໃນ Cloudflare Workers runtime ໂດຍບໍ່ຕ້ອງແກ້
 */
import { beginText, endText, setFontAndSize, setTextMatrix, showText, setFillingColor,
  PDFHexString } from 'pdf-lib';

/** ໂຕທີ່ຟອນບໍ່ມີ (ເຊັ່ນ ອັກສອນໄທ/ຈີນ) → ? ແທນທີ່ຈະເປັນກ່ອງເປົ່າ */
function supported(str, font) {
  const fk = font.embedder.font;
  let out = '';
  for (const ch of str) out += fk.hasGlyphForCodePoint(ch.codePointAt(0)) ? ch : '?';
  return out;
}

/** ຄວາມກວ້າງຕາມທີ່ຟອນຈັດວາງແທ້ (ລວມ kerning · mark ບໍ່ກິນເນື້ອທີ່) */
export function widthShaped(str, size, font) {
  const s = str == null ? '' : String(str);
  if (!s) return 0;
  const fk = font.embedder.font;
  return fk.layout(supported(s, font)).advanceWidth * size / fk.unitsPerEm;
}

/**
 * ຂຽນ str ທີ່ (x, y) — ຄືນຄວາມກວ້າງທີ່ຂຽນໄປ
 * @param pg    PDFPage
 * @param font  PDFFont ທີ່ຝັງດ້ວຍ fontkit (embedFont)
 */
export function drawShaped(pg, str, { x, y, size, font, color }) {
  const s = supported(str == null ? '' : String(str), font);
  if (!s) return 0;
  const fk = font.embedder.font;
  const run = fk.layout(s);
  const hex = font.encodeText(s).toString().replace(/[<>]/g, '');
  const ids = hex.match(/.{4}/g) || [];
  if (ids.length !== run.glyphs.length) {
    pg.drawText(s, { x, y, size, font, color });
    return font.widthOfTextAtSize(s, size);
  }
  const k = size / fk.unitsPerEm;
  const key = pg.node.newFontDictionary(font.name, font.ref);
  const ops = [beginText(), setFillingColor(color), setFontAndSize(key, size)];
  let cx = x;
  for (let i = 0; i < ids.length; i++) {
    const p = run.positions[i];
    ops.push(setTextMatrix(1, 0, 0, 1, cx + p.xOffset * k, y + p.yOffset * k),
      showText(PDFHexString.of(ids[i])));
    cx += p.xAdvance * k;
  }
  ops.push(endText());
  pg.pushOperators(...ops);
  return cx - x;
}
