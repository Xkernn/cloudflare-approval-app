// ຕໍ່ຮູບເອກະສານເຈົ້າຂອງຮ້ານເປັນໜ້າສຸດທ້າຍ ໃນ PDFDocument ດຽວກັນກັບສັນຍາ (ກ່ອນ save)
// ເຫດຜົນ: ເມື່ອກ່ອນ save PDF ແລ້ວ load ໃໝ່ເພື່ອຕໍ່ໜ້າ -> parse/save ຟອນ Lao ຊ້ຳ ໃຊ້ CPU/ໜ່ວຍຄວາມຈຳ 2 ເທົ່າ ຈົນ Worker ອາດຖືກ Cloudflare ຕັດ (ໜ້າ error)
// ຖ້າຮູບຜິດຮູບແບບ/ຝັງບໍ່ໄດ້ -> ຂ້າມ (PDF ສັນຍາຍັງອອກປົກກະຕິ)
export async function addOwnerDocPage(pdf, bytes) {
  if (!bytes || !bytes.length) return false;
  try {
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    let img;
    if (isJpg) img = await pdf.embedJpg(bytes);
    else if (isPng) img = await pdf.embedPng(bytes);
    else return false;
    const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const scale = Math.min((PAGE_W - 2 * MARGIN) / img.width, (PAGE_H - 2 * MARGIN) / img.height);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
    return true;
  } catch (e) {
    console.error('ຕໍ່ໜ້າເອກະສານເຈົ້າຂອງຮ້ານບໍ່ສຳເລັດ:', e);
    return false;
  }
}
