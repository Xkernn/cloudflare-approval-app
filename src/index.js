import { sendWebPushToUser, sendWebPushToRoles } from "./webpush.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { createSessionToken, verifySessionToken, readBearerToken, passwordVersion } from "./session.js";
import { PDFDocument } from "pdf-lib";
import { buildLoanPdf } from "./lib/clpdf.js";
import { buildCancelPdf } from "./lib/cancelpdf.js";
import { buildTripDocPdf } from "./lib/tripdocpdf.js";
import { sendEmail } from "./lib/mailer.js";

// ອອກໃບສັນຍາຢືມ — ເດົາ handover_type ຈາກ assets.doc_type ອັດຕະໂນມັດ (ແກ້ໄຂໄດ້ຢູ່ໜ້າຟອມກ່ອນອອກໃບ)
// "ເກັບຄືນສາງ" ບໍ່ແມ່ນການມອບຕູ້ອອກ ຈຶ່ງບໍ່ມີ checkbox ໃຫ້ (null = ບໍ່ກາເຄື່ອງໝາຍໃດ)
const DOC_TYPE_TO_HANDOVER = {
  "ມອບຕູ້ໃໝ່ຄັ້ງແລກ": "new",
  "ຕູ້ເຄື່ອນຍ້າຍ": "move",
  "ມອບຕູ້ເພີ່ມ": "extra",
  "ຕູ້ປ່ຽນແທນ": "replace",
};

// ຫາ handover_type ຈາກ doc_type — ປັບຕົວສະກົດໃຫ້ຕົງກັນກ່ອນ: ໃນ DB/ຟອມ ໃຊ້ "ໃຫມ່" (ຫ+ມ) ແຕ່ຄີໃນ map ຂ້າງເທິງເປັນ "ໃໝ່" (ໝ)
// ຈຶ່ງເຄີຍຈັບຄູ່ບໍ່ໄດ້ ເຮັດໃຫ້ໃບອັດຕະໂນມັດບໍ່ກາ "ມອບຕູ້ໃໝ່ຄັ້ງແລກ"
function normLao(str) {
  return String(str == null ? "" : str).replace(/\u0edd/g, "\u0eab\u0ea1").replace(/\s+/g, "").trim();
}
function handoverFromDocType(docType) {
  const n = normLao(docType);
  if (!n) return null;
  for (const [k, v] of Object.entries(DOC_TYPE_TO_HANDOVER)) {
    if (normLao(k) === n) return v;
  }
  return null;
}

// ເດົາຈຳນວນປະຕູ (+ ຕົວເລືອກເສີມ 1 ປະຕູ) ຈາກຊື່ Type/Model ຂອງຕູ້ ເຊັ່ນ "2 door", "3 ປະຕູ", "table cooler", "1 door modern small"
// ຖ້າຊື່ບໍ່ບອກຊັດເຈນ ຈະຄືນ null (ປ່ອຍໃຫ້ຜູ້ອອກໃບເລືອກເອງຕອນເຊັນ)
function inferDoorsFromCooler(...texts) {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  if (!t) return { doors: null, variant: null };
  if (/table\s*cooler/.test(t)) return { doors: 1, variant: "table_cooler" };
  const m = t.match(/([1-3])\s*(?:-?\s*door|\u0e9b\u0eb0\u0e95\u0eb9)/);
  if (!m) return { doors: null, variant: null };
  const doors = Number(m[1]);
  return { doors, variant: doors === 1 && /modern\s*small/.test(t) ? "modern_small" : null };
}

// ສະຕ໋ອກສາງ (ຢູ່ໃນສາງ + ສະພາບໃໝ່) ຕ່ຳກວ່າງົບທີ່ຍັງຄ້າງເບີກ ຕໍ່ Brand + Type: 1 ປະຕູ = 1D_AMD, 2 ປະຕູ = 2D_MD, 3 ປະຕູ = 3D_MD
// ງົບຄ້າງເບີກ = ໂຄຕ້າລວມທຸກທີມ - ຄຳຂໍ 'ໃໝ່' ທີ່ອະນຸມັດແລ້ວ. ຄືນສະເພາະກຸ່ມທີ່ສະຕ໋ອກຕ່ຳກວ່າງົບ
const BUDGET_MODEL_BY_DOORS = { 1: '1D_AMD', 2: '2D_MD', 3: '3D_MD' };
// model ທີ່ໃຊ້ກວດງົບ: 1 ປະຕູ = 1D_AMD, 1 ປະຕູ Modern Small = 1D_ASM, 2 ປະຕູ = 2D_MD, 3 ປະຕູ = 3D_MD (table cooler ບໍ່ກວດ)
function budgetModelFor(...texts) {
  const inf = inferDoorsFromCooler(...texts);
  if (inf.variant === 'table_cooler') return null;
  if (inf.doors === 1 && inf.variant === 'modern_small') return '1D_ASM';
  return BUDGET_MODEL_BY_DOORS[inf.doors] || null;
}
async function computeStockBudgetAlerts(env) {
  const budgets = (await env.DB.prepare(
    `SELECT IFNULL(cooler_brand,'') AS brand, IFNULL(cooler_type,'') AS type, SUM(quota) AS total,
            SUM((SELECT COUNT(*) FROM asset_requests r WHERE r.status = 'approved' AND IFNULL(r.asset_condition,'new') = 'new'
                  AND r.team = budgets.team AND IFNULL(r.cooler_brand,'') = IFNULL(budgets.cooler_brand,'') AND IFNULL(r.cooler_type,'') = IFNULL(budgets.cooler_type,'')
                  AND (budgets.period_start IS NULL OR r.requested_at >= budgets.period_start))) AS approved_in_period
       FROM budgets WHERE archived_at IS NULL GROUP BY 1, 2`
  ).all()).results || [];
  const stock = (await env.DB.prepare(
    `SELECT IFNULL(cooler_brand,'') AS brand, REPLACE(REPLACE(UPPER(IFNULL(cooler_model,'')), ' ', ''), '-', '_') AS model, COUNT(*) AS cnt
       FROM warehouse_stock WHERE status = 'in_warehouse' AND IFNULL(cooler_status,'new') = 'new' GROUP BY 1, 2`
  ).all()).results || [];
  const stockMap = {}; for (const r of stock) stockMap[r.brand + '\u0001' + r.model] = r.cnt;
  const alerts = [];
  for (const b of budgets) {
    const model = budgetModelFor(b.type);
    if (!model) continue;
    const outstanding = Math.max((b.total || 0) - (b.approved_in_period || 0), 0);
    const inStock = stockMap[b.brand + '\u0001' + model] || 0;
    if (outstanding > 0 && inStock < outstanding) {
      alerts.push({ brand: b.brand, type: b.type, model, in_stock: inStock, outstanding, short: outstanding - inStock });
    }
  }
  return alerts;
}

// ==========================================================================
// ແຈ້ງເຕືອນອັດຕະໂນມັດ (Automated Notification Digest)
// ຮັນຜ່ານ Cron Trigger (scheduled handler ດ້ານລຸ່ມ) ທຸກໆເຊົ້າ, ຫຼືກົດທົດສອບເອງໄດ້ຈາກ
// Admin Dashboard (POST /api/admin/run-notification-check)
// ກວດ 2 ຢ່າງ ແລ້ວແຍກສົ່ງຫາຄົນລະ role ຕາມທີ່ກ່ຽວຂ້ອງ:
//   1) ຄຳຂໍເບີກ Asset ທີ່ຄ້າງອະນຸມັດເກີນ 24 ຊົ່ວໂມງ -> ສົ່ງຫາ admin, warehouse
//   2) Asset Tracking ທີ່ສະຖານະເປັນ "ຢູ່ລະຫວ່າງຈັດສົ່ງ"/"ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ" ແຕ່ຄ້າງບໍ່ໄດ້ຈັດສົ່ງເກີນ 7 ວັນ -> ສົ່ງຫາ warehouse, delivery
// ==========================================================================
const PENDING_REQUEST_REMINDER_HOURS = 24;
const DELIVERY_STUCK_REMINDER_DAYS = 7;
const DELIVERED_STATUS = "ສຳເລັດ";
// ເຕືອນ MDE (user) ທີ່ຍັງບໍ່ເຊັນໃບສັນຍາຢືມ / ຍັງບໍ່ທັນອອກໃບສັນຍາ ຫຼັງຈາກຜ່ານໄປຈັກມື້ (ຮັນທຸກເຊົ້າຈົນກວ່າຈະເຊັນຄົບ)
const LOAN_USER_REMINDER_DAYS = 1;
// ສະຖານະ Asset ທີ່ຖ້າຖືກຕັ້ງ (ປ່ຽນເປັນສະຖານະນີ້) ໃຫ້ແຈ້ງເຕືອນ warehouse/delivery ວ່າມີລາຍການຈັດສົ່ງໃໝ່
// ລຳດັບຂັ້ນຕອນ Asset: ຍັງບໍ່ທັນສົ່ງເອກະສານ -> ຍັງບໍ່ຊັບມິດ PowerApp -> ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ (Admin ຕັ້ງຫຼັງ MDE ຊັບມິດ PowerApp ຜ່ານ)
//   -> [ສະແກນຕູ້ອອກສາງ ຂຶ້ນລົດ] ຢູ່ລະຫວ່າງຈັດສົ່ງ (ຢູ່ເທິງລົດ ກຳລັງໄປຮ້ານ) -> [ລາຍງານການຈັດສົ່ງ] ສຳເລັດ
const WAITING_DISPATCH_STATUS = "ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ";
const SHIPPING_NOTIFY_STATUSES = ["ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ", "ຢູ່ລະຫວ່າງຈັດສົ່ງ"];
// ປ່ຽນເປັນສະຖານະເຫຼົ່ານີ້ -> push ແຈ້ງ warehouse/delivery (ລວມ "ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ" ທີ່ເປັນຈຸດເລີ່ມຂອງວຽກຂອງສາງ)
const DISPATCH_NOTIFY_STATUSES = [WAITING_DISPATCH_STATUS, ...SHIPPING_NOTIFY_STATUSES];
// ຈຳນວນ MDE ສູງສຸດທີ່ Admin ເລືອກສົ່ງແຈ້ງເຕືອນໃນການກົດຄັ້ງດຽວ (ກັນ Worker ເກີນຂີດຈຳກັດ subrequest ຕໍ່ 1 ຄຳຂໍ)
const MAX_BULK_MDE_NOTIFY = 150;
// ຈຳນວນອີເມວສູງສຸດທີ່ສົ່ງໃນການກົດຄັ້ງດຽວ (ກັນເກີນຂີດຈຳກັດ subrequest ຂອງ Worker ແລະ ໂຄຕ້າສົ່ງ Gmail ຕໍ່ມື້)
const MAX_BULK_MDE_EMAIL = 100;
const escMailHtml = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
// ສະຖານະ Asset Tracking ທີ່ Admin ສາມາດກົດ "ແຈ້ງເຕືອນ MDE" ດ້ວຍຕົນເອງໄດ້ (ຄ້າງເອກະສານ / ຄ້າງ PowerApp)
const NOTIFY_PENDING_STATUSES = ["ຍັງບໍ່ທັນສົ່ງເອກະສານ", "ຍັງບໍ່ຊັບມິດ PowerApp"];

// ສ້າງອີເມວແຈ້ງເຕືອນ MDE ທີ່ມີ Asset ຄ້າງ (ເອກະສານ / PowerApp)
function buildPendingMdeEmail({ mdeCode, mdeName, lines, trackingList, appUrl }) {
  const who = mdeName ? `${mdeCode} - ${mdeName}` : mdeCode;
  const shown = (trackingList || []).slice(0, 20);
  const more = (trackingList || []).length - shown.length;
  const text = [
    `ເຖິງ MDE ${who}`,
    "",
    "ທ່ານມີລາຍການ Asset Tracking ທີ່ຍັງຄ້າງດຳເນີນການ:",
    ...(lines || []),
    shown.length ? `\nເລກ Tracking: ${shown.join(", ")}${more > 0 ? ` ແລະ ອີກ ${more} ລາຍການ` : ""}` : "",
    "",
    "ກະລຸນາດຳເນີນການໂດຍໄວ (ສົ່ງເອກະສານ / ຊັບມິດ PowerApp).",
    appUrl ? `ເປີດລະບົບ: ${appUrl}` : "",
  ].filter((x) => x !== "").join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px">
    <p>ເຖິງ MDE <b>${escMailHtml(who)}</b></p>
    <p>ທ່ານມີລາຍການ Asset Tracking ທີ່ຍັງຄ້າງດຳເນີນການ:</p>
    <ul>${(lines || []).map((l) => `<li>${escMailHtml(String(l).replace(/^•\s*/, ""))}</li>`).join("")}</ul>
    ${shown.length ? `<p style="font-size:13px;color:#475569">ເລກ Tracking: ${shown.map(escMailHtml).join(", ")}${more > 0 ? ` ແລະ ອີກ ${more} ລາຍການ` : ""}</p>` : ""}
    <p>ກະລຸນາດຳເນີນການໂດຍໄວ (ສົ່ງເອກະສານ / ຊັບມິດ PowerApp).</p>
    ${appUrl ? `<p><a href="${escMailHtml(appUrl)}">ເປີດລະບົບ</a></p>` : ""}</div>`;
  return { subject: "ແຈ້ງເຕືອນ Asset Tracking: ມີລາຍການຄ້າງດຳເນີນການ", text, html };
}

// ອີເມວແຈ້ງເຕືອນເອກະສານຄ້າງເຊັນ (ໃຊ້ທັງ MDE ແລະ DSM). docs = [{ label, url? }] — DSM ໄດ້ລິ້ງເຊັນຕໍ່ໃບ
const MAX_BULK_SIGN_MDE = 150;
const MAX_BULK_SIGN_DSM = 50;
const MAX_SIGN_DOCS_PER_EMAIL = 30;
function buildSignReminderEmail({ subject, who, intro, docs, moreCount, footer, appUrl }) {
  const text = [
    `ເຖິງ ${who}`, "", intro, "",
    ...(docs || []).map((d) => `• ${d.label}${d.url ? `\n  ${d.url}` : ""}${d.note ? `\n  (${d.note})` : ""}`),
    moreCount > 0 ? `ແລະ ອີກ ${moreCount} ໃບ` : "",
    "", footer || "",
    appUrl ? `ເປີດລະບົບ: ${appUrl}` : "",
  ].filter((x) => x !== "").join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
    <p>ເຖິງ <b>${escMailHtml(who)}</b></p>
    <p>${escMailHtml(intro)}</p>
    <ul>${(docs || []).map((d) => `<li>${escMailHtml(d.label)}${d.url ? `<br><a href="${escMailHtml(d.url)}">${escMailHtml(d.url)}</a>` : ""}${d.note ? `<br><span style="font-size:12px;color:#64748b">${escMailHtml(d.note)}</span>` : ""}</li>`).join("")}</ul>
    ${moreCount > 0 ? `<p style="font-size:13px;color:#475569">ແລະ ອີກ ${moreCount} ໃບ</p>` : ""}
    ${footer ? `<p style="font-size:13px;color:#475569">${escMailHtml(footer)}</p>` : ""}
    ${appUrl ? `<p><a href="${escMailHtml(appUrl)}">ເປີດລະບົບ</a></p>` : ""}</div>`;
  return { subject, text, html };
}

// ດຶງຊື່ MDE (mde_name) ຈາກ mde_list ຕາມ mde_code - ໃຊ້ຕິດໃສ່ຂໍ້ຄວາມແຈ້ງເຕືອນ ເພື່ອໃຫ້ admin/warehouse/delivery ຮູ້ວ່າແມ່ນ MDE ໃດໂດຍບໍ່ຕ້ອງເປີດເບິ່ງ
// ບໍ່ throw error ອອກໄປ (ຄືກັນກັບຟັງຊັນສົ່ງແຈ້ງເຕືອນອື່ນໆ) ເພື່ອບໍ່ໃຫ້ save ລົ້ມເຫລວຖ້າດຶງຊື່ບໍ່ໄດ້
async function getMdeName(env, mdeCode) {
  if (!mdeCode) return '';
  try {
    const row = await env.DB.prepare("SELECT mde_name FROM mde_list WHERE mde_code = ?").bind(mdeCode).first();
    return (row && row.mde_name) || '';
  } catch (e) {
    console.error("line 70", e);
    return '';
  }
}

// ດຶງຊື່ DSM (ຫົວໜ້າທີມ) ຈາກ dsm_list ຕາມ Team ຂອງ MDE - ໃຊ້ຕື່ມ sig_dsm_name ອັດຕະໂນມັດຕອນອອກໃບສັນຍາຢືມ
// ບໍ່ throw error ອອກໄປ (ຄືກັນກັບ getMdeName) ເພື່ອບໍ່ໃຫ້ການອອກໃບລົ້ມເຫລວຖ້າຍັງບໍ່ໄດ້ຕັ້ງຄ່າ DSM ຂອງ Team ນັ້ນ
async function getDsmNameForTeam(env, team) {
  if (!team) return '';
  try {
    const row = await env.DB.prepare("SELECT dsm_name FROM dsm_list WHERE team = ?").bind(team).first();
    return (row && row.dsm_name) || '';
  } catch (e) {
    console.error("line 82", e);
    return '';
  }
}

// ເລີ່ມສ້າງໃບສັນຍາຢືມ (ຮ່າງ) ໃຫ້ Asset ໜຶ່ງລາຍການ ອັດຕະໂນມັດ — ໃຊ້ຮ່ວມກັນລະຫວ່າງ:
//   1) POST /api/loan-contracts (ຜູ້ໃຊ້ອອກໃບເອງ ໂດຍເລືອກ asset_id)
//   2) ອະນຸມັດຄຳຂໍ Asset (/api/admin/update-asset-request-status) - ອອກໃບຮ່າງໃຫ້ອັດຕະໂນມັດທັນທີທີ່ອະນຸມັດ
// ບໍ່ throw error ອອກໄປ (ຄືກັນກັບ getMdeName/getDsmNameForTeam) ເພື່ອບໍ່ໃຫ້ຂັ້ນຕອນຫຼັກ (ອະນຸມັດ/ບັນທຶກ) ລົ້ມເຫລວ
// ຖ້າ opts ບໍ່ໄດ້ລະບຸ (contract_type/doors/...) ຈະປ່ອຍວ່າງໄວ້ໃຫ້ແກ້ໄຂ/ຕື່ມພາຍຫຼັງກ່ອນເຊັນ
// ຊື່ຮ້ານຈາກ Outlet Master Data ຕາມ code (ບໍ່ກອງ active ເພາະຮ້ານເກົ່າອາດປິດໄປແລ້ວ)
// code ຖືກ normalize (trim+UPPER) ຕອນບັນທຶກ -> ໃຊ້ code = ? ກົງໆ ເພື່ອໃຫ້ໃຊ້ unique index (UPPER(code) ເຮັດໃຫ້ scan ທັງຕາຕະລາງ)
async function getOutletMasterByCode(env, code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  return env.DB.prepare("SELECT code, name, phone FROM outlets WHERE code = ? ORDER BY active DESC LIMIT 1").bind(c).first();
}

// ສ້າງເລກ DOC- ໃໝ່ຖັດໄປໃນລຳດັບ ສຳລັບ "ໃບເກົ່າເລກທີ" ຂອງໃບຕູ້ເຄື່ອນຍ້າຍ — ບໍ່ສ້າງໃບໃນລະບົບ
// ເລກ DOC ມາຈາກ id (AUTOINCREMENT) ຈຶ່ງ "ໃຊ້" ເລກໜຶ່ງໂດຍການ insert ແຖວຊົ່ວຄາວແລ້ວລຶບທັນທີ:
// id ບໍ່ຖືກໃຊ້ຊ້ຳ ເລກນີ້ຈຶ່ງບໍ່ຊ້ຳກັບໃບໃດໃນອະນາຄົດ (ລວມທັງໃບໃໝ່ທີ່ກຳລັງອອກນີ້)
async function allocateNextDocNo(env) {
  const ins = await env.DB.prepare("INSERT INTO loan_contracts DEFAULT VALUES").run();
  const id = ins.meta.last_row_id;
  await env.DB.prepare("DELETE FROM loan_contracts WHERE id = ?").bind(id).run();
  return `DOC${String(id).padStart(4, "0")}`;
}

// ເລກ DOC ຄາດວ່າຈະໄດ້ (ໃຊ້ສະເພາະຕົວຢ່າງ PDF ບໍ່ຈອງເລກ)
async function peekNextDocNo(env) {
  let seq = 0;
  try {
    const r = await env.DB.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'loan_contracts'").first();
    seq = (r && r.seq) || 0;
  } catch (e) {
    console.error("line 115", e);
    const r = await env.DB.prepare("SELECT MAX(id) AS m FROM loan_contracts").first();
    seq = (r && r.m) || 0;
  }
  return `DOC${String(seq + 1).padStart(4, "0")}`;
}

// ຕົວເລືອກເສີມຂອງຕູ້ 1 ປະຕູ (ຕໍ່ທ້າຍຊື່ຍີ່ຫໍ້ຕູ້ໃນໃບສັນຍາ) — ໃຊ້ໄດ້ສະເພາະ doors = 1
const DOOR_VARIANTS = { modern_small: "1 door modern small", table_cooler: "table cooler" };
function normDoorVariant(doors, variant) {
  return Number(doors) === 1 && Object.prototype.hasOwnProperty.call(DOOR_VARIANTS, variant) ? variant : null;
}

// Cooler Type ຂອງໃບສັນຍາ = ຂະໜາດຕູ້ (ຈຳນວນປະຕູ + ຕົວເລືອກເສີມ) ທີ່ເລືອກໃນ Step 2
// ພະຍາຍາມຈັບຄູ່ກັບຊື່ໃນ Master List (cooler_types) ກ່ອນ; ຖ້າບໍ່ມີ ໃຊ້ຊື່ມາດຕະຖານ ເຊັ່ນ "2 door", "table cooler"
async function resolveCoolerTypeFromDoors(env, doors, doorVariant) {
  const d = Number(doors);
  if (![1, 2, 3].includes(d)) return null;
  const variant = normDoorVariant(d, doorVariant);
  try {
    const { results } = await env.DB.prepare("SELECT name FROM cooler_types ORDER BY name").all();
    for (const r of (results || [])) {
      const g = inferDoorsFromCooler(r.name);
      if (g.doors === d && (g.variant || null) === variant) return r.name;
    }
  } catch (e) { /* ໃຊ້ຊື່ມາດຕະຖານແທນ */ }
  if (variant === "table_cooler") return "table cooler";
  if (variant === "modern_small") return "1 door modern small";
  return `${d} door`;
}

// ຍອດຂາຍລວມ (Total) ແຕ່ລະປະເພດ ໃນໃບສັນຍາຢືມ — ຄ່າທີ່ບໍ່ຖືກຕ້ອງ (ຕິດລົບ/ບໍ່ແມ່ນຕົວເລກ) ຖືວ່າບໍ່ໄດ້ປ້ອນ (null); 0 ຖືວ່າປ້ອນແລ້ວ
const LOAN_SALES_FIELDS = ["sales_beer", "sales_premium", "sales_csd_energy", "sales_water_soda"];
function parseSalesTotal(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function createLoanContractDraftForAsset(env, assetId, createdByEmail, opts) {
  opts = opts || {};
  const asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(assetId).first();
  if (!asset) return null;

  const outlet = asset.outlet_code
    ? await env.DB.prepare("SELECT * FROM outlets WHERE code = ?").bind(asset.outlet_code).first()
    : null;
  const mde = await env.DB.prepare("SELECT phone, team FROM mde_list WHERE mde_code = ?").bind(asset.mde_code).first();
  const dsmName = await getDsmNameForTeam(env, mde && mde.team);
  const oldOutlet = asset.old_outlet_code
    ? await env.DB.prepare("SELECT phone FROM outlets WHERE code = ?").bind(asset.old_outlet_code).first()
    : null;
  let village = "", district = "";
  if (outlet && outlet.address) {
    const parts = String(outlet.address).split(",");
    village = (parts[0] || "").trim();
    district = (parts[1] || "").trim();
  }
  // ຮ້ານທີ່ບໍ່ມີໃນ Outlet Master (ບໍ່ມີ Outlet Code): ໃຊ້ຂໍ້ມູນຮ້ານທີ່ກອກຕອນຂໍ Asset ແທນ
  const manual = (!outlet && opts.manual_outlet) || null;
  const ownerVal = (outlet && outlet.owner_name) || (manual && manual.owner) || null;
  const typeVal = (outlet && outlet.outlet_type) || (manual && manual.type) || null;
  const levelVal = (outlet && outlet.outlet_level) || (manual && manual.level) || null;
  const phoneVal = (outlet && outlet.phone) || (manual && manual.phone) || null;
  const provinceVal = (outlet && outlet.province) || (manual && manual.province) || null;
  if (manual) { village = manual.village || ""; district = manual.district || ""; }
  const handoverType = opts.handover_type || handoverFromDocType(asset.doc_type) || null;
  // ຂະໜາດຕູ້: ຖ້າບໍ່ໄດ້ລະບຸມາ ໃຫ້ເດົາຈາກ Type/Model ຂອງຕູ້ (ເຊັ່ນ "2 door") ເພື່ອໃຫ້ໃບອັດຕະໂນມັດກາຊ່ອງຈຳນວນປະຕູໃຫ້
  const guess = inferDoorsFromCooler(asset.cooler_type);
  const doorsVal = opts.doors || guess.doors || null;
  const doorVariantVal = opts.doors ? normDoorVariant(opts.doors, opts.door_variant) : normDoorVariant(doorsVal, guess.variant);

  const ins = await env.DB.prepare(
    `INSERT INTO loan_contracts (
      asset_id, tracking_no, outlet_code, outlet_name, outlet_owner, outlet_type, outlet_grade, outlet_phone,
      village, district, province, contract_type, handover_type, doors, door_variant, cooler_brand, cooler_type, qr_cd, serial_no, capx,
      old_doc_no, old_outlet_code, old_outlet_name, old_outlet_phone, move_reason,
      mde_code, mde_phone, sig_dsm_name, created_by,
      sales_beer, sales_premium, sales_csd_energy, sales_water_soda
    ) VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?)`
  ).bind(
    asset.id, asset.tracking_no || null, asset.outlet_code || null, (outlet && outlet.name) || asset.outlet_name || null,
    ownerVal, typeVal, levelVal,
    phoneVal, village || null, district || null, provinceVal,
    opts.contract_type || null, handoverType, doorsVal, doorVariantVal, asset.cooler_brand || null, asset.cooler_type || (await resolveCoolerTypeFromDoors(env, doorsVal, doorVariantVal)) || null, asset.qr_code || null,
    asset.serial_number || null, asset.capex || null,
    opts.old_doc_no || null, asset.old_outlet_code || null, asset.old_outlet_name || null, (oldOutlet && oldOutlet.phone) || null,
    opts.move_reason || null,
    asset.mde_code || null, (mde && mde.phone) || null, dsmName || null, createdByEmail || null,
    parseSalesTotal(opts.sales_beer), parseSalesTotal(opts.sales_premium), parseSalesTotal(opts.sales_csd_energy), parseSalesTotal(opts.sales_water_soda)
  ).run();
  const newId = ins.meta.last_row_id;
  const docNo = `DOC${String(newId).padStart(4, "0")}`;
  await env.DB.prepare("UPDATE loan_contracts SET doc_no = ? WHERE id = ?").bind(docNo, newId).run();
  return env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(newId).first();
}


// ອອກໃບສັນຍາຢືມແບບປ້ອນເອງ (ບໍ່ມີ Asset ອ້າງອີງ) ປະເພດ "ຕູ້ເຄື່ອນຍ້າຍ" (handover_type = 'move')
// -> ສ້າງແຖວ Asset Tracking (doc_type "ຕູ້ເຄື່ອນຍ້າຍ", ສະຖານະ "ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ") ໃຫ້ອັດຕະໂນມັດ ແລ້ວຜູກໃບສັນຍານີ້ເຂົ້າກັບ Asset ທີ່ສ້າງ
// ບໍ່ throw error ອອກໄປ: ຖ້າສ້າງ Asset ບໍ່ໄດ້ (ເຊັ່ນ QR/Serial/CapEx ຊໍ້າ) ໃບສັນຍາທີ່ບັນທຶກແລ້ວຍັງຢູ່ຄືເກົ່າ ແລະ ສົ່ງ warning ກັບໄປແທນ
const RELOCATION_ASSET_DOC_TYPE = "ຕູ້ເຄື່ອນຍ້າຍ";
const RELOCATION_ASSET_STATUS = "ຍັງບໍ່ທັນສົ່ງເອກະສານ";
async function createRelocationAssetForContract(env, contract) {
  try {
    const dupError = await findQrSerialCapexDuplicate(env, "assets", {
      qr_code: contract.qr_cd, serial_number: contract.serial_no, capex: contract.capx,
    }, null, DELIVERED_STATUS); // Asset ທີ່ "ສຳເລັດ" ແລ້ວ (ຕູ້ຢູ່ຮ້ານເດີມ) ບໍ່ນັບວ່າຊໍ້າ
    if (dupError) return { asset: null, warning: `ບໍ່ໄດ້ສ້າງ Asset Tracking ອັດຕະໂນມັດ: ${dupError}` };

    const newOutlet = contract.outlet_code
      ? await env.DB.prepare("SELECT latitude, longitude FROM outlets WHERE code = ?").bind(contract.outlet_code).first()
      : null;
    const oldOutlet = contract.old_outlet_code
      ? await env.DB.prepare("SELECT name, latitude, longitude FROM outlets WHERE code = ?").bind(contract.old_outlet_code).first()
      : null;

    const coolerTypeVal = contract.cooler_type || (await resolveCoolerTypeFromDoors(env, contract.doors, contract.door_variant));
    const placeholder = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ins = await env.DB.prepare(
      `INSERT INTO assets (tracking_no, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code, serial_number, capex,
                           latitude, longitude, old_outlet_code, old_outlet_name, old_latitude, old_longitude, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      placeholder, contract.outlet_code || null, contract.outlet_name || null, contract.cooler_brand || null, coolerTypeVal,
      contract.mde_code, RELOCATION_ASSET_DOC_TYPE, contract.qr_cd || null, contract.serial_no || null, contract.capx || null,
      (newOutlet && newOutlet.latitude) ?? null, (newOutlet && newOutlet.longitude) ?? null,
      contract.old_outlet_code || null, contract.old_outlet_name || (oldOutlet && oldOutlet.name) || null,
      (oldOutlet && oldOutlet.latitude) ?? null, (oldOutlet && oldOutlet.longitude) ?? null,
      RELOCATION_ASSET_STATUS
    ).run();

    const assetId = ins.meta.last_row_id;
    const trackingNo = `TRK${String(assetId).padStart(4, "0")}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE assets SET tracking_no = ? WHERE id = ?").bind(trackingNo, assetId),
      env.DB.prepare("UPDATE loan_contracts SET asset_id = ?, tracking_no = ? WHERE id = ?").bind(assetId, trackingNo, contract.id),
    ]);

    // ແຈ້ງເຕືອນ MDE ເຈົ້າຂອງລາຍການ (ສະຖານະ "ຍັງບໍ່ທັນສົ່ງເອກະສານ" ບໍ່ແມ່ນສະຖານະຈັດສົ່ງ ຈຶ່ງບໍ່ແຈ້ງ warehouse/delivery)
    try {
      await notifyMdeUserOfStatusChange(env, contract.mde_code, trackingNo, contract.outlet_name, RELOCATION_ASSET_STATUS);
    } catch (pushErr) { /* ປ່ອຍໃຫ້ສຳເລັດຕາມປົກກະຕິ */ }

    const asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(assetId).first();
    return { asset, warning: null };
  } catch (e) {
    console.error("line 261", e);
    return { asset: null, warning: "ບໍ່ສາມາດສ້າງ Asset Tracking ອັດຕະໂນມັດໄດ້ — ກະລຸນາສ້າງເອງທີ່ໜ້າ Asset Tracking" };
  }
}


// ຮ້ານ + MDE ສຳລັບໃບ T- — ບໍ່ອີງໃບສັນຍາ DOC- ອີກຕໍ່ໄປ: ດຶງຮ້ານຈາກ Outlet Master Data, MDE ຈາກ mde_list
// ຜູ້ໃຊ້ທີ່ບໍ່ແມ່ນ admin/warehouse/delivery ຖືກບັງຄັບໃຫ້ໃຊ້ MDE Code ຂອງຕົນເອງ (ບໍ່ເຊື່ອຄ່າຈາກ client)
async function resolveCancelContext(env, requester, body, canViewAllFn) {
  const outletCode = String(body.outlet_code || "").trim().toUpperCase();
  if (!outletCode) return { error: "ກະລຸນາເລືອກຮ້ານກ່ອນ", status: 400 };
  const outlet = await env.DB.prepare("SELECT * FROM outlets WHERE code = ?").bind(outletCode).first();
  if (!outlet) return { error: "ບໍ່ພົບຮ້ານນີ້ໃນ Outlet Master Data", status: 404 };

  const mdeCode = String((canViewAllFn(requester.role) ? body.mde_code : requester.mde_code) || "").trim().toUpperCase();
  if (!mdeCode) return { error: "ກະລຸນາປ້ອນ MDE Code", status: 400 };
  const mde = await env.DB.prepare("SELECT mde_name, phone, team FROM mde_list WHERE UPPER(mde_code) = UPPER(?)").bind(mdeCode).first();

  let village = "", district = "";
  if (outlet.address) {
    const parts = String(outlet.address).split(",");
    village = (parts[0] || "").trim();
    district = (parts[1] || "").trim();
  }
  return { outlet, mde, mdeCode, village, district };
}

// ==========================================================================
// QR / Serial / Cap-X / ແບນຕູ້ ທີ່ user ຄີເອງ: ຖ້າສົ່ງມາ ໃຊ້ຄ່າທີ່ຄີ (trim) — ຖ້າບໍ່ສົ່ງມາ ໃຊ້ຄ່າ fallback
function cleanCoolerField(v, fallback) {
  if (v === undefined || v === null) return fallback ? String(fallback).trim() || null : null;
  return String(v).trim() || null;
}

// ຕິກ "ຍ້າຍເອງແລ້ວ" (ຕູ້ເຄື່ອນຍ້າຍ / T- ເກັບຄືນສາງ): ບໍ່ສ້າງ Asset ລໍຈັດສົ່ງ ແຕ່ບັນທຶກເຂົ້າ "ປະຫວັດການຈັດສົ່ງ" (status = ສຳເລັດ) ທັນທີ ພ້ອມໝາຍ self_moved = 1 ເພື່ອໄຮໄລ້ວ່າ MDE ຍ້າຍເອງ
// - ຖ້າມີ Asset ທີ່ຍັງບໍ່ສຳເລັດ (ຜູກກັບໃບແລ້ວ ຫຼື QR/Serial ກົງກັນ) -> ອັບເດດແຖວນັ້ນເປັນ ສຳເລັດ + self_moved (ບໍ່ສ້າງຊໍ້າ)
// - ບໍ່ throw error: ຖ້າບັນທຶກບໍ່ໄດ້ ໃບທີ່ບັນທຶກແລ້ວຍັງຢູ່ຄືເກົ່າ ແລະ ສົ່ງ warning ກັບໄປແທນ
// table: "loan_contracts" | "cancel_contracts"; docType: ຕູ້ເຄື່ອນຍ້າຍ | ເກັບຄືນສາງ
async function recordSelfMovedAsset(env, contract, table, docType, actorEmail, coolerTypeVal) {
  try {
    const qr = String(contract.qr_cd || "").trim();
    const sn = String(contract.serial_no || "").trim();
    const linkSql = table === "cancel_contracts"
      ? "UPDATE cancel_contracts SET asset_id = ?, tracking_no = ?, cooler_type = ? WHERE id = ?"
      : "UPDATE loan_contracts SET asset_id = ?, tracking_no = ? WHERE id = ?";
    const linkBinds = (assetId, trackingNo) => table === "cancel_contracts"
      ? [assetId, trackingNo, coolerTypeVal || null, contract.id]
      : [assetId, trackingNo, contract.id];

    // ຫາ Asset ທີ່ຍັງບໍ່ສຳເລັດ ເພື່ອອັບເດດ
    let pending = null;
    if (contract.asset_id) {
      pending = await env.DB.prepare("SELECT id, tracking_no, status FROM assets WHERE id = ?").bind(contract.asset_id).first();
      if (pending && pending.status === DELIVERED_STATUS) pending = null;
    }
    if (!pending && (qr || sn)) {
      pending = await env.DB.prepare(
        `SELECT id, tracking_no FROM assets
         WHERE IFNULL(status,'') != ? AND ((? != '' AND qr_code = ?) OR (? != '' AND serial_number = ?))
         ORDER BY id DESC LIMIT 1`
      ).bind(DELIVERED_STATUS, qr, qr, sn, sn).first();
    }
    if (pending) {
      await env.DB.prepare(
        `UPDATE assets SET status = ?, self_moved = 1, delivered_at = CURRENT_TIMESTAMP, delivered_by = ?, last_update = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(DELIVERED_STATUS, actorEmail || null, pending.id).run();
      await env.DB.prepare(linkSql).bind(...linkBinds(pending.id, pending.tracking_no || null)).run();
      return { trackingNo: pending.tracking_no || null, warning: null };
    }

    const dupError = await findQrSerialCapexDuplicate(env, "assets", {
      qr_code: contract.qr_cd, serial_number: contract.serial_no, capex: contract.capx,
    }, null, DELIVERED_STATUS);
    if (dupError) return { trackingNo: null, warning: `ບໍ່ໄດ້ບັນທຶກເຂົ້າປະຫວັດການຈັດສົ່ງ: ${dupError}` };

    const outlet = contract.outlet_code
      ? await env.DB.prepare("SELECT latitude, longitude FROM outlets WHERE code = ?").bind(contract.outlet_code).first()
      : null;
    const oldOutlet = contract.old_outlet_code
      ? await env.DB.prepare("SELECT name, latitude, longitude FROM outlets WHERE code = ?").bind(contract.old_outlet_code).first()
      : null;

    const placeholder = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ins = await env.DB.prepare(
      `INSERT INTO assets (tracking_no, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code, serial_number, capex,
                           latitude, longitude, old_outlet_code, old_outlet_name, old_latitude, old_longitude,
                           status, self_moved, delivered_at, delivered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)`
    ).bind(
      placeholder, contract.outlet_code || null, contract.outlet_name || null, contract.cooler_brand || null, coolerTypeVal || null,
      contract.mde_code, docType, qr || null, sn || null, contract.capx || null,
      (outlet && outlet.latitude) ?? null, (outlet && outlet.longitude) ?? null,
      contract.old_outlet_code || null, contract.old_outlet_name || (oldOutlet && oldOutlet.name) || null,
      (oldOutlet && oldOutlet.latitude) ?? null, (oldOutlet && oldOutlet.longitude) ?? null,
      DELIVERED_STATUS, actorEmail || null
    ).run();
    const assetId = ins.meta.last_row_id;
    const trackingNo = `TRK${String(assetId).padStart(4, "0")}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE assets SET tracking_no = ? WHERE id = ?").bind(trackingNo, assetId),
      env.DB.prepare(linkSql).bind(...linkBinds(assetId, trackingNo)),
    ]);
    return { trackingNo, warning: null };
  } catch (e) {
    console.error("line 364", e);
    return { trackingNo: null, warning: "ບໍ່ສາມາດບັນທຶກເຂົ້າປະຫວັດການຈັດສົ່ງໄດ້ — ກະລຸນາບັນທຶກເອງທີ່ໜ້າລາຍງານການຈັດສົ່ງ" };
  }
}

// ໃບ T- (ຮັບຕູ້ເຂົ້າສາງ) -> ສ້າງແຖວ Asset Tracking (doc_type "ເກັບຄືນສາງ", ສະຖານະ "ຍັງບໍ່ທັນສົ່ງເອກະສານ") ໃຫ້ອັດຕະໂນມັດ
// ຄືກັນກັບ createRelocationAssetForContract. ຖ້າມີ Asset "ເກັບຄືນສາງ" ທີ່ຍັງບໍ່ສຳເລັດ ຂອງ MDE+ຮ້ານ+QR/Serial ນີ້ຢູ່ແລ້ວ ໃຫ້ຜູກກັບແຖວນັ້ນ (ບໍ່ສ້າງຊໍ້າ)
// ບໍ່ throw error: ຖ້າສ້າງບໍ່ໄດ້ ໃບ T- ທີ່ບັນທຶກແລ້ວຍັງຢູ່ຄືເກົ່າ ແລະ ສົ່ງ warning ກັບໄປແທນ
async function createReturnAssetForCancelContract(env, contract) {
  try {
    const qr = String(contract.qr_cd || "").trim();
    const sn = String(contract.serial_no || "").trim();

    // ມີ Asset ເກັບຄືນສາງ ທີ່ຍັງຄ້າງຢູ່ແລ້ວ -> ຜູກໃບນີ້ກັບແຖວນັ້ນ
    const existing = (qr || sn)
      ? await env.DB.prepare(
          `SELECT id, tracking_no FROM assets
           WHERE UPPER(IFNULL(mde_code,'')) = UPPER(?) AND outlet_code = ? AND doc_type = ? AND IFNULL(status,'') != ?
             AND ((? != '' AND qr_code = ?) OR (? != '' AND serial_number = ?))
           ORDER BY id DESC LIMIT 1`
        ).bind(contract.mde_code || "", contract.outlet_code || "", RETURN_TO_WAREHOUSE_DOC_TYPE, DELIVERED_STATUS, qr, qr, sn, sn).first()
      : null;
    if (existing) {
      await env.DB.prepare("UPDATE cancel_contracts SET asset_id = ?, tracking_no = ? WHERE id = ?")
        .bind(existing.id, existing.tracking_no || null, contract.id).run();
      return { asset: existing, warning: null, linked: true };
    }

    const dupError = await findQrSerialCapexDuplicate(env, "assets", {
      qr_code: contract.qr_cd, serial_number: contract.serial_no, capex: contract.capx,
    }, null, DELIVERED_STATUS); // Asset ທີ່ "ສຳເລັດ" ແລ້ວ (ຕູ້ຢູ່ຮ້ານເດີມ) ບໍ່ນັບວ່າຊໍ້າ
    if (dupError) return { asset: null, warning: `ບໍ່ໄດ້ສ້າງ Asset Tracking ອັດຕະໂນມັດ: ${dupError}` };

    const outlet = contract.outlet_code
      ? await env.DB.prepare("SELECT latitude, longitude FROM outlets WHERE code = ?").bind(contract.outlet_code).first()
      : null;
    const coolerTypeVal = contract.cooler_type || (await resolveCoolerTypeFromDoors(env, contract.doors, contract.door_variant));

    const placeholder = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ins = await env.DB.prepare(
      `INSERT INTO assets (tracking_no, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code, serial_number, capex,
                           latitude, longitude, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      placeholder, contract.outlet_code || null, contract.outlet_name || null, contract.cooler_brand || null, coolerTypeVal || null,
      contract.mde_code, RETURN_TO_WAREHOUSE_DOC_TYPE, qr || null, sn || null, contract.capx || null,
      (outlet && outlet.latitude) ?? null, (outlet && outlet.longitude) ?? null,
      RELOCATION_ASSET_STATUS
    ).run();

    const assetId = ins.meta.last_row_id;
    const trackingNo = `TRK${String(assetId).padStart(4, "0")}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE assets SET tracking_no = ? WHERE id = ?").bind(trackingNo, assetId),
      env.DB.prepare("UPDATE cancel_contracts SET asset_id = ?, tracking_no = ?, cooler_type = ? WHERE id = ?")
        .bind(assetId, trackingNo, coolerTypeVal || null, contract.id),
    ]);

    try {
      await notifyMdeUserOfStatusChange(env, contract.mde_code, trackingNo, contract.outlet_name, RELOCATION_ASSET_STATUS);
    } catch (pushErr) { /* ປ່ອຍໃຫ້ສຳເລັດຕາມປົກກະຕິ */ }

    const asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(assetId).first();
    return { asset, warning: null, linked: false };
  } catch (e) {
    console.error("line 428", e);
    return { asset: null, warning: "ບໍ່ສາມາດສ້າງ Asset Tracking ອັດຕະໂນມັດໄດ້ — ກະລຸນາສ້າງເອງທີ່ໜ້າ Asset Tracking" };
  }
}

// ==========================================================================
// ຮັບຕູ້ເຂົ້າສາງ (T-) — ໃບສະເໜີຍົກເລີກສັນຍາຢືມ (cancel_contracts) ຕື່ມລົງ public/forms/cancel.pdf
// ==========================================================================
const CANCEL_REASONS = ["damaged", "closed", "small_business", "replace"];

// ຮັບ reasons ເປັນ array ຫຼື string ຄັ່ນດ້ວຍຈ້ຳ -> string ທີ່ຜ່ານການກວດ (ມີສະເພາະຄ່າທີ່ຮູ້ຈັກ)
function normalizeCancelReasons(v) {
  const arr = Array.isArray(v) ? v : String(v || "").split(",");
  const out = [];
  for (const r of arr.map((x) => String(x).trim())) {
    if (CANCEL_REASONS.includes(r) && !out.includes(r)) out.push(r);
  }
  return out.join(",");
}

// ຊື່ໄຟລ໌ຕອນ MDE ບັນທຶກ PDF ລົງເຄື່ອງ: ຊື່ຮ້ານ + ປະເພດຕູ້ (ບໍ່ມີ -> Brand -> ເລກໃບ) — ສົ່ງເປັນ header X-Save-Name (encodeURIComponent)
function contractSaveName(row) {
  const clean = (v) => String(v == null ? "" : v).replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const outlet = clean(row.outlet_name) || clean(row.outlet_code);
  const type = clean(row.cooler_type) || clean(row.cooler_brand);
  const name = [outlet, type].filter(Boolean).join("_") || clean(row.doc_no) || "contract";
  return name.slice(0, 80);
}

// ລວມເອກະສານເຈົ້າຂອງຮ້ານເຂົ້າ PDF ສັນຍາອັດຕະໂນມັດ (ບໍ່ຕ້ອງແຍກ): ຕໍ່ເປັນໜ້າສຸດທ້າຍ ຕອນສ້າງ PDF (ເບິ່ງ lib/ownerdocpage.js)
// ຟັງຊັນນີ້ຄືນ bytes ຮູບເອກະສານ ເພື່ອສົ່ງເຂົ້າ build*Pdf(env, row, { ownerDocBytes }) — ຄືນ null ຖ້າບໍ່ຕ້ອງລວມ
// - ລວມສະເພາະ admin ແລະ MDE ເຈົ້າຂອງໃບ (session != null); DSM ເຫັນຜ່ານລິ້ງເຊັນ (session = null, forDsm = true); ສາງ/ຂົນສົ່ງ ໄດ້ PDF ສັນຍາປົກກະຕິ
// - ໃບທີ່ບໍ່ມີເອກະສານແນບ ຫຼື ອ່ານ R2 ບໍ່ໄດ້ -> null (ຍັງເປີດ PDF ສັນຍາເດີມໄດ້)
async function ownerDocBytesFor(env, session, row, forDsm) {
  if (!row || !row.owner_doc_photo) return null;
  if (!forDsm) {
    const isOwner = !!row.mde_code && String(row.mde_code).trim().toUpperCase() === String((session && session.mde_code) || "").trim().toUpperCase();
    if (!session || (!isAdminLike(session.role) && !isOwner)) return null;
  }
  try {
    const obj = await env.PHOTOS.get(row.owner_doc_photo);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  } catch (e) {
    console.error("ອ່ານເອກະສານເຈົ້າຂອງຮ້ານຈາກ R2 ບໍ່ໄດ້:", e);
    return null;
  }
}

// ==========================================================================
// ເອກະສານເຈົ້າຂອງຮ້ານ (ແນບກ່ອນ MDE ເຊັນ ທັງໃບ DOC- ແລະ T-)
// - ຕ້ອງແນບຢ່າງໜ້ອຍ 1 ຢ່າງ: ບັດປະຈຳໂຕ / Passport / ໃບທະບຽນວິສາຫະກິດ / ສຳມະໂນຄົວ (ເປັນຮູບ JPEG/PNG/WebP ≤ 5MB)
// - ເກັບໃນ R2 key: loan-contract/<id>/owner-doc-<ts>.jpg | cancel-contract/<id>/owner-doc-<ts>.jpg
// - ເບິ່ງໄດ້ສະເພາະ admin ແລະ MDE ເຈົ້າຂອງໃບ ຜ່ານ GET /api/contract-owner-doc (ເປັນຂໍ້ມູນສ່ວນຕົວ ຈຶ່ງບໍ່ເປີດຜ່ານ /api/photo)
// ==========================================================================
const OWNER_DOC_TYPES = { id_card: "ບັດປະຈຳໂຕ", passport: "Passport", business_reg: "ໃບທະບຽນວິສາຫະກິດ", census: "ສຳມະໂນຄົວ" };

// ກວດກ່ອນສ້າງ/ບັນທຶກໃບ ເມື່ອມີລາຍເຊັນ MDE ສົ່ງມາ: ຕ້ອງມີເອກະສານເຈົ້າຂອງຮ້ານ (ສົ່ງມາໃໝ່ ຫຼື ມີໃນໃບຢູ່ແລ້ວ) ພ້ອມຊະນິດທີ່ຖືກຕ້ອງ
function validateOwnerDocInput(body, existingRow) {
  const hasExisting = !!(existingRow && existingRow.owner_doc_photo);
  if (!body.owner_doc_photo && !hasExisting) {
    return "ກະລຸນາແນບເອກະສານເຈົ້າຂອງຮ້ານ (ບັດປະຈຳໂຕ / Passport / ໃບທະບຽນວິສາຫະກິດ / ສຳມະໂນຄົວ) ຢ່າງໜ້ອຍ 1 ຢ່າງ ກ່ອນ MDE ເຊັນ";
  }
  const type = body.owner_doc_type || (existingRow && existingRow.owner_doc_type) || null;
  if (!type || !Object.prototype.hasOwnProperty.call(OWNER_DOC_TYPES, type)) {
    return "ກະລຸນາເລືອກຊະນິດເອກະສານເຈົ້າຂອງຮ້ານ (ບັດປະຈຳໂຕ / Passport / ໃບທະບຽນວິສາຫະກິດ / ສຳມະໂນຄົວ)";
  }
  return null;
}

// ກຽມການອັບໂຫລດເອກະສານເຈົ້າຂອງຮ້ານ: ເພີ່ມເຂົ້າ toUpload (ອັບພ້ອມລາຍເຊັນ - ສຳເລັດທັງໝົດ ຫຼື ບໍ່ອັບເລີຍ) ແລ້ວຄືນ {key, type} | null
function planOwnerDocUpload(prefix, id, row, body, stamp, toUpload) {
  if (!body.owner_doc_photo) return null;
  const type = body.owner_doc_type || row.owner_doc_type || null;
  if (!type || !Object.prototype.hasOwnProperty.call(OWNER_DOC_TYPES, type)) throw new Error("INVALID_OWNER_DOC");
  const key = `${prefix}/${id}/owner-doc-${stamp}.jpg`;
  toUpload.push([body.owner_doc_photo, key]);
  return { key, type };
}

// ອັບໂຫລດລາຍເຊັນຂຶ້ນ R2 ແລ້ວອັບເດດ cancel_contracts — ຄືກັນກັບ applyLoanContractSignatures
async function applyCancelContractSignatures(env, id, row, body) {
  const sigSlots = ["mde", "dsm", "admin", "outlet"];
  const stamp = Date.now();
  const newKeys = {};
  const toUpload = [];
  for (const slot of sigSlots) {
    if (body[`sig_${slot}`]) {
      const key = `cancel-contract/${id}/${slot}-${stamp}.png`;
      toUpload.push([body[`sig_${slot}`], key]);
      newKeys[slot] = key;
    }
  }
  const ownerDoc = planOwnerDocUpload("cancel-contract", id, row, body, stamp, toUpload);
  if (!toUpload.length) return row;
  await savePhotosToR2(env, toUpload);
  const oldKeysToDelete = sigSlots.filter((s) => newKeys[s] && row[`sig_${s}`]).map((s) => row[`sig_${s}`]);
  if (ownerDoc && row.owner_doc_photo) oldKeysToDelete.push(row.owner_doc_photo);

  const sets = [];
  const vals = [];
  for (const slot of sigSlots) {
    if (newKeys[slot]) {
      sets.push(`sig_${slot} = ?`, `sig_${slot}_name = ?`, `sig_${slot}_at = CURRENT_TIMESTAMP`);
      vals.push(newKeys[slot], body[`sig_${slot}_name`] || null);
    }
  }
  if (ownerDoc) {
    sets.push("owner_doc_type = ?", "owner_doc_photo = ?", "owner_doc_at = CURRENT_TIMESTAMP");
    vals.push(ownerDoc.type, ownerDoc.key);
  }
  vals.push(id);
  await env.DB.prepare(`UPDATE cancel_contracts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  if (oldKeysToDelete.length) await deleteR2Photos(env, oldKeysToDelete);

  let updated = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(id).first();
  // MDE ເຊັນແລ້ວ -> ລໍຖ້າ DSM ເຊັນ (awaiting_dsm); ຖ້າ DSM ເຊັນແລ້ວກ່ອນ -> ສຳເລັດ (completed) — ຄືກັນກັບໃບ DOC-
  if (updated.sig_mde && updated.status !== "completed" && updated.status !== "awaiting_dsm") {
    const next = updated.sig_dsm ? "completed" : "awaiting_dsm";
    await env.DB.prepare("UPDATE cancel_contracts SET status = ? WHERE id = ?").bind(next, id).run();
    updated.status = next;
    try {
      await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
        title: next === "completed" ? "ໃບຮັບຕູ້ເຂົ້າສາງ (T-) ເຊັນຄົບແລ້ວ" : "ໃບຮັບຕູ້ເຂົ້າສາງ (T-) ລໍຖ້າ DSM ເຊັນ",
        body: `${updated.doc_no || ''}${updated.loan_doc_no ? ' (ຍົກເລີກ ' + updated.loan_doc_no + ')' : ''}\n${updated.outlet_name || ''}`.trim(),
        url: next === "completed" ? "loanContract:docs" : "loanContract:queue",
      });
    } catch (e) { /* ບໍ່ຕ້ອງເຮັດຫຍັງ */ }
  }
  return updated;
}


function formatMdeOutletLine(mdeCode, mdeName, outletName) {
  const mdePart = mdeCode ? `MDE: ${mdeCode}${mdeName ? ' - ' + mdeName : ''}` : '';
  const outletPart = outletName ? `ຊື່ຮ້ານ: ${outletName}` : '';
  return [mdePart, outletPart].filter(Boolean).join(' | ');
}

async function runAutomatedNotificationChecks(env) {
  const summaryLines = [];
  let sentAny = false;

  // 1) ຄຳຂໍທີ່ຄ້າງອະນຸມັດເກີນ 24 ຊົ່ວໂມງ -> ແຈ້ງເຕືອນ admin, warehouse
  const pendingRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM asset_requests
     WHERE status = 'pending' AND requested_at <= datetime('now', ?)`
  ).bind(`-${PENDING_REQUEST_REMINDER_HOURS} hours`).first();
  const pendingCount = (pendingRow && pendingRow.cnt) || 0;
  if (pendingCount > 0) {
    const line = `• ${pendingCount} ຄຳຂໍເບີກ Asset ຄ້າງອະນຸມັດເກີນ ${PENDING_REQUEST_REMINDER_HOURS} ຊົ່ວໂມງ`;
    summaryLines.push(line);
    await sendWebPushToRoles(env, ["admin", "assistant_admin", "warehouse"], {
      title: "ສະຫຼຸບແຈ້ງເຕືອນປະຈຳວັນ",
      body: line,
      url: "request",
    });
    sentAny = true;
  }

  // 2) Asset Tracking ທີ່ສະຖານະເປັນ "ຢູ່ລະຫວ່າງຈັດສົ່ງ" ຫຼື "ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ" ແຕ່ຄ້າງບໍ່ໄດ້ຈັດສົ່ງເກີນ 7 ວັນ (ນັບຈາກ last_update) -> ແຈ້ງເຕືອນ warehouse, delivery
  const stuckRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM assets
     WHERE status IN (${SHIPPING_NOTIFY_STATUSES.map(() => '?').join(',')}) AND last_update <= datetime('now', ?)`
  ).bind(...SHIPPING_NOTIFY_STATUSES, `-${DELIVERY_STUCK_REMINDER_DAYS} days`).first();
  const stuckCount = (stuckRow && stuckRow.cnt) || 0;
  if (stuckCount > 0) {
    const line = `• ${stuckCount} ຕູ້ເຢັນ ຢູ່ໃນສະຖານະ "ຢູ່ລະຫວ່າງຈັດສົ່ງ"/"ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ" ຄ້າງບໍ່ໄດ້ຈັດສົ່ງເກີນ ${DELIVERY_STUCK_REMINDER_DAYS} ວັນ`;
    summaryLines.push(line);
    await sendWebPushToRoles(env, ["warehouse", "delivery"], {
      title: "ສະຫຼຸບແຈ້ງເຕືອນປະຈຳວັນ",
      body: line,
      url: "asset",
    });
    sentAny = true;
  }

  // 3) ຕູ້ແຊ່ Event ທີ່ເກີນກຳນົດເອົາກັບຄືນ (expected_return_date ຜ່ານໄປແລ້ວ) ແຕ່ຍັງບໍ່ໄດ້ບັນທຶກ "ເອົາກັບຄືນ" -> ແຈ້ງເຕືອນ admin
  const overdueRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM cooler_events
     WHERE returned = 0 AND expected_return_date IS NOT NULL AND expected_return_date != ''
       AND date(expected_return_date) < date('now')`
  ).first();
  const overdueCount = (overdueRow && overdueRow.cnt) || 0;
  if (overdueCount > 0) {
    const line = `• ${overdueCount} ຕູ້ເຢັນ Event ເກີນກຳນົດເອົາກັບຄືນສາງແລ້ວ`;
    summaryLines.push(line);
    await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
      title: "ສະຫຼຸບແຈ້ງເຕືອນປະຈຳວັນ",
      body: line,
      url: "coolerEventList",
    });
    sentAny = true;
  }

  // 4) ຜູ້ສະໝັກໃໝ່ທີ່ຄ້າງລໍຖ້າ Admin ອະນຸມັດເກີນ 24 ຊົ່ວໂມງ -> ແຈ້ງເຕືອນ admin
  const pendingUserRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM users
     WHERE status = 'pending' AND created_at <= datetime('now', ?)`
  ).bind(`-${PENDING_REQUEST_REMINDER_HOURS} hours`).first();
  const pendingUserCount = (pendingUserRow && pendingUserRow.cnt) || 0;
  if (pendingUserCount > 0) {
    const line = `• ${pendingUserCount} ຜູ້ສະໝັກໃໝ່ ຄ້າງລໍຖ້າອະນຸມັດເກີນ ${PENDING_REQUEST_REMINDER_HOURS} ຊົ່ວໂມງ`;
    summaryLines.push(line);
    await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
      title: "ສະຫຼຸບແຈ້ງເຕືອນປະຈຳວັນ",
      body: line,
      url: "dashboard",
    });
    sentAny = true;
  }

  // 5) ຮອບກວດນັບສາງທີ່ເປີດຄ້າງ (ຍັງບໍ່ປິດຮອບ) ເກີນ 3 ວັນ -> ແຈ້ງເຕືອນ warehouse, admin
  const openCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM stock_counts
     WHERE status = 'open' AND started_at <= datetime('now', '-3 days')`
  ).first();
  const openCountCnt = (openCountRow && openCountRow.cnt) || 0;
  if (openCountCnt > 0) {
    const line = `• ${openCountCnt} ຮອບກວດນັບສາງ ເປີດຄ້າງເກີນ 3 ວັນ ຍັງບໍ່ໄດ້ປິດຮອບ`;
    summaryLines.push(line);
    await sendWebPushToRoles(env, ["admin", "assistant_admin", "warehouse"], {
      title: "ສະຫຼຸບແຈ້ງເຕືອນປະຈຳວັນ",
      body: line,
      url: "stockCount",
    });
    sentAny = true;
  }

  // 6) ເຕືອນກວດນັບສາງປະຈຳເດືອນ: ຕັ້ງແຕ່ວັນທີ 25 ຂອງເດືອນ (ເວລາລາວ) ຖ້າສາງທີ່ເປີດໃຊ້ງານຍັງບໍ່ມີຮອບກວດນັບຂອງເດືອນນີ້ -> ແຈ້ງເຕືອນ warehouse, admin
  const laoNow = new Date(Date.now() + 7 * 3600 * 1000);
  if (laoNow.getUTCDate() >= 25) {
    const noCountRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM wh_warehouses w
       WHERE w.active = 1
         AND w.name NOT IN (?, ?)
         AND NOT EXISTS (SELECT 1 FROM stock_counts c WHERE c.warehouse_id = w.id AND c.period = ?)`
    ).bind(OUTLET_WAREHOUSE_NAME, PROVINCE_WAREHOUSE_NAME, currentLaoPeriod()).first();
    const noCountCnt = (noCountRow && noCountRow.cnt) || 0;
    if (noCountCnt > 0) {
      const line = `• ${noCountCnt} ສາງ ຍັງບໍ່ໄດ້ກວດນັບປະຈຳເດືອນ ${currentLaoPeriod()}`;
      summaryLines.push(line);
      await sendWebPushToRoles(env, ["admin", "assistant_admin", "warehouse"], {
        title: "ເຕືອນກວດນັບສາງປະຈຳເດືອນ",
        body: line,
        url: "stockCount",
      });
      sentAny = true;
    }
  }

  // 7) ໃບສັນຍາຢືມທີ່ຍັງເປັນ "ຮ່າງ" (MDE ຍັງບໍ່ໄດ້ເຊັນ) ຄ້າງ -> ບໍ່ສົ່ງສະຫຼຸບຫາ role ອື່ນ (admin/warehouse/delivery) ອີກ
  //    ສົ່ງຫາ MDE (user) ເຈົ້າຂອງໃບນັ້ນໆ ຢ່າງດຽວ ຜ່ານຂໍ້ 8 ຂ້າງລຸ່ມນີ້

  // 8) ແຈ້ງເຕືອນ MDE (user) ຮາຍຄົນ: ຄຳຂໍທີ່ອະນຸມັດແລ້ວ ແຕ່ (ກ) ຍັງບໍ່ທັນອອກໃບສັນຍາຢືມ ຫຼື (ຂ) ອອກໃບແລ້ວແຕ່ຍັງບໍ່ໄດ້ເຊັນ
  //    ("ເກັບຄືນສາງ" ບໍ່ຕ້ອງມີໃບສັນຍາ ຈຶ່ງບໍ່ນັບ ໃນ (ກ))
  const notIssuedRows = await env.DB.prepare(
    `SELECT r.user_id AS user_id, COUNT(*) AS cnt FROM asset_requests r
     JOIN users u ON u.id = r.user_id AND u.status = 'approved' AND u.role != 'warehouse'
     WHERE r.status = 'approved' AND r.asset_id IS NOT NULL AND IFNULL(r.doc_type, '') != ?
       AND r.updated_at <= datetime('now', ?)
       AND NOT EXISTS (SELECT 1 FROM loan_contracts lc WHERE lc.asset_id = r.asset_id)
     GROUP BY r.user_id`
  ).bind(RETURN_TO_WAREHOUSE_DOC_TYPE, `-${LOAN_USER_REMINDER_DAYS} days`).all();
  const unsignedRows = await env.DB.prepare(
    `SELECT u.id AS user_id, COUNT(*) AS cnt FROM loan_contracts lc
     JOIN users u ON u.mde_code = lc.mde_code AND u.role = 'user' AND u.status = 'approved'
     WHERE lc.status != 'completed' AND lc.created_at <= datetime('now', ?)
     GROUP BY u.id`
  ).bind(`-${LOAN_USER_REMINDER_DAYS} days`).all();

  const loanReminders = new Map(); // user_id -> { notIssued, unsigned }
  for (const row of (notIssuedRows.results || [])) {
    loanReminders.set(row.user_id, { notIssued: row.cnt, unsigned: 0 });
  }
  for (const row of (unsignedRows.results || [])) {
    const cur = loanReminders.get(row.user_id) || { notIssued: 0, unsigned: 0 };
    cur.unsigned = row.cnt;
    loanReminders.set(row.user_id, cur);
  }
  let loanReminderUsers = 0;
  for (const [userId, c] of loanReminders) {
    const lines = [];
    if (c.unsigned > 0) lines.push(`ມີໃບສັນຍາຢືມ ${c.unsigned} ໃບ ທີ່ຍັງບໍ່ໄດ້ເຊັນ`);
    if (c.notIssued > 0) lines.push(`ມີ ${c.notIssued} ຄຳຂໍທີ່ອະນຸມັດແລ້ວ ແຕ່ຍັງບໍ່ທັນອອກໃບສັນຍາຢືມ`);
    if (lines.length === 0) continue;
    try {
      await sendWebPushToUser(env, userId, {
        title: "ເຕືອນ: ໃບສັນຍາຢືມຍັງບໍ່ສຳເລັດ",
        body: lines.join("\n"),
        url: c.unsigned > 0 ? "loanContract:queue" : "history",
      });
      loanReminderUsers++;
    } catch (e) { /* ຂ້າມ user ນີ້ ແລ້ວສົ່ງຄົນຕໍ່ໄປ */ }
  }
  if (loanReminderUsers > 0) {
    summaryLines.push(`• ແຈ້ງເຕືອນ MDE ${loanReminderUsers} ຄົນ ໃຫ້ເຊັນ/ອອກໃບສັນຍາຢືມ`);
    sentAny = true;
  }

  if (!sentAny) {
    return { sent: false, summary: "ບໍ່ມີລາຍການທີ່ຕ້ອງແຈ້ງເຕືອນໃນຕອນນີ້" };
  }

  return { sent: true, summary: summaryLines.join("\n") };
}

// ແຈ້ງເຕືອນ user (role = 'user') ຂອງ MDE code ນັ້ນ ທຸກຄັ້ງທີ່ status ຂອງ Asset ລາວປ່ຽນ (ບໍ່ວ່າຈະປ່ຽນເປັນ status ໃດກໍຕາມ)
// ບໍ່ throw error ອອກໄປ ເພື່ອບໍ່ໃຫ້ save Asset ລົ້ມເຫລວ ຖ້າສົ່ງ push ບໍ່ສຳເລັດ
async function notifyMdeUserOfStatusChange(env, mdeCode, trackingNo, outletName, status) {
  if (!mdeCode) return;
  try {
    const mdeUser = await env.DB.prepare(
      "SELECT id FROM users WHERE mde_code = ? AND role = 'user'"
    ).bind(mdeCode).first();
    if (mdeUser) {
      const mdeName = await getMdeName(env, mdeCode);
      const detailLine = formatMdeOutletLine(mdeCode, mdeName, outletName);
      await sendWebPushToUser(env, mdeUser.id, {
        title: "ອັບເດດສະຖານະ ຕູ້ແຊ່",
        body: `${trackingNo || ''}${detailLine ? '\n' + detailLine : ''}\nສະຖານະປ່ຽນເປັນ "${status}"`,
        url: "asset",
      });
    }
  } catch (pushErr) { /* ไม่ต้องทำอะไร ปล่อยให้ save สำเร็จตามปกติ */ }
}

// ==========================================================================
// ແຈ້ງເຕືອນງົບປະມານຂອງທີມ (Budget Available Notification)
// ສົ່ງຫາ user (role = 'user', ອະນຸມັດແລ້ວ) ຂອງທີມນັ້ນ ເມື່ອ:
//   1) Admin ເພີ່ມງົບໃໝ່ (Brand/Type ໃໝ່) ຫຼື ເພີ່ມໂຄຕ້າໃຫ້ງົບເກົ່າ ແລະ ຍັງເຫຼືອໃຫ້ເບີກ
//   2) ງົບປ່ຽນຈາກ "ໝົດ" ມາເປັນ "ມີ" (ຄຳຂໍຖືກປະຕິເສດ ຫຼື Admin ລຶບຄຳຂໍ ທຳໃຫ້ໂຄຕ້າຄືນມາ)
// ບໍ່ throw error ອອກໄປ ເພື່ອບໍ່ໃຫ້ການບັນທຶກງົບ/ອະນຸມັດຄຳຂໍລົ້ມເຫລວ ຖ້າສົ່ງແຈ້ງເຕືອນບໍ່ສຳເລັດ
// ==========================================================================
// ໂຄຕ້າທີ່ຖືກນັບແລ້ວ (ຄຳຂໍ 'ໃໝ່' ທີ່ pending/approved) - ນັບແບບດຽວກັບ /api/budgets ແລະ /api/asset-requests
// ຊື່ team ພິເສດຂອງ Spare Cooler ຂອງ admin (ແຖວໃນ budgets) — ໂອນໃຫ້ທີມເມື່ອງົບທີມໝົດ ຜ່ານ /api/admin/transfer-spare
const SPARE_TEAM = "ADMIN_SPARE";
async function getBudgetUsed(env, team, brand, type) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM asset_requests
     WHERE status IN ('pending','approved') AND IFNULL(asset_condition,'new') = 'new'
     AND team = ?1 AND IFNULL(cooler_brand,'') = IFNULL(?2, '') AND IFNULL(cooler_type,'') = IFNULL(?3, '')
     AND requested_at >= COALESCE((SELECT period_start FROM budgets WHERE team = ?1 AND IFNULL(cooler_brand,'') = IFNULL(?2, '') AND IFNULL(cooler_type,'') = IFNULL(?3, '') AND archived_at IS NULL LIMIT 1), '0000-01-01')`
  ).bind(team, brand ?? null, type ?? null).first();
  return (row && row.cnt) || 0;
}

async function notifyTeamBudgetAvailable(env, { team, brand, type, quota, remaining, freed, newPeriod, periodLabel }) {
  const users = await env.DB.prepare(
    "SELECT id FROM users WHERE team = ? AND role = 'user' AND status = 'approved'"
  ).bind(team).all();
  const label = [brand, type].filter(Boolean).join(' ') || 'Asset';
  const payload = {
    title: freed ? "ງົບປະມານກັບມາເບີກໄດ້ແລ້ວ"
      : (newPeriod ? `ງົບປະມານຮອບໃໝ່ເປີດແລ້ວ${periodLabel ? ' (' + periodLabel + ')' : ''}` : "ມີງົບປະມານໃໝ່ສຳລັບທີມຂອງທ່ານ"),
    body: `${label}\n${newPeriod ? 'ເລີ່ມນັບໃໝ່ ' : ''}ເຫຼືອເບີກໄດ້ ${remaining} ຕູ້ (ໂຄຕ້າທັງໝົດ ${quota})`,
    url: "teamBudget",
  };
  for (const u of (users.results || [])) {
    await sendWebPushToUser(env, u.id, payload);
  }
}

// ຄຳຂໍຖືກປະຕິເສດ/ລຶບ -> ໂຄຕ້າຄືນມາ 1 ໜ່ວຍ: ແຈ້ງເຕືອນສະເພາະເມື່ອງົບປ່ຽນຈາກ "ໝົດ" ມາເປັນ "ມີ"
async function notifyBudgetFreedIfWasFull(env, team, brand, type) {
  try {
    const budget = await env.DB.prepare(
      "SELECT quota FROM budgets WHERE team = ? AND IFNULL(cooler_brand,'') = IFNULL(?, '') AND IFNULL(cooler_type,'') = IFNULL(?, '') AND archived_at IS NULL"
    ).bind(team, brand ?? null, type ?? null).first();
    if (!budget) return;
    const usedAfter = await getBudgetUsed(env, team, brand, type);
    const remainingAfter = budget.quota - usedAfter;
    const remainingBefore = budget.quota - (usedAfter + 1);
    if (remainingBefore <= 0 && remainingAfter > 0) {
      await notifyTeamBudgetAvailable(env, { team, brand, type, quota: budget.quota, remaining: remainingAfter, freed: true });
    }
  } catch (e) { /* ບໍ່ຕ້ອງເຮັດຫຍັງ ປ່ຽນສະຖານະ/ລຶບຄຳຂໍສຳເລັດຕາມປົກກະຕິ */ }
}


// ==========================================================================
// ລິ້ງເຊັນຮັບຕູ້ປາຍທາງ (ship_trip_receipts) — token ສຸ່ມ 256-bit, ເກັບສະເພາະ SHA-256 hash, ໃຊ້ໄດ້ຄັ້ງດຽວ, ໝົດອາຍຸ 7 ວັນ
// ==========================================================================
function newReceiptToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ລິ້ງເຊັນຄັ້ງດຽວທີ່ "ສະແດງ/ສົ່ງລິ້ງເກົ່າໄດ້": token = HMAC-SHA256(SESSION_SECRET, scope + nonce) (256-bit, ຮູບແບບດຽວກັບ token ສຸ່ມເດີມ)
// ຖານຂໍ້ມູນເກັບສະເພາະ nonce + SHA-256 hash ຂອງ token (ບໍ່ເກັບ token ຕົວຈິງ) -> ຄິດ token ຄືນໄດ້ເມື່ອມີ SESSION_SECRET ເທົ່ານັ້ນ
async function linkHmacToken(env, scope, nonce) {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET_MISSING");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`sign-link:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${scope}:${nonce}`)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function newLinkNonce() { return newReceiptToken().slice(0, 24); }
// ເວລາໝົດອາຍຸ (UTC 'YYYY-MM-DD HH:MM:SS') -> ເວລາລາວ dd/mm/yyyy HH:MM
function fmtLaoExpiry(utc) {
  const d = new Date(String(utc || "").replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  const l = new Date(d.getTime() + 7 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(l.getUTCDate())}/${p(l.getUTCMonth() + 1)}/${l.getUTCFullYear()} ${p(l.getUTCHours())}:${p(l.getUTCMinutes())}`;
}
// ລິ້ງເຊັນ DSM ຂອງໃບ 1 ໃບ: ຖ້າມີລິ້ງເດີມທີ່ຍັງບໍ່ໝົດອາຍຸ + ຍັງບໍ່ເຊັນ ແລະ ຄິດ token ຄືນໄດ້ -> ໃຊ້ລິ້ງເດີມ (reused = true)
// forceNew = true -> ອອກລິ້ງໃໝ່ (ລິ້ງເກົ່າໃຊ້ບໍ່ໄດ້). ລິ້ງທີ່ສ້າງກ່ອນມີ nonce ຈະອອກໃໝ່ 1 ຄັ້ງ
async function ensureDsmSignLink(env, kind, docId, actor, forceNew) {
  const scope = `dsm:${kind}:${docId}`;
  const ex = await env.DB.prepare(
    "SELECT token_hash, nonce, expires_at, (status = 'pending' AND expires_at > CURRENT_TIMESTAMP) AS live FROM dsm_sign_links WHERE kind = ? AND doc_id = ?"
  ).bind(kind, docId).first();
  if (!forceNew && ex && ex.live && ex.nonce) {
    const token = await linkHmacToken(env, scope, ex.nonce);
    if ((await sha256Hex(token)) === ex.token_hash) return { token, expires_at: ex.expires_at, reused: true };
  }
  const nonce = newLinkNonce();
  const token = await linkHmacToken(env, scope, nonce);
  const hash = await sha256Hex(token);
  await env.DB.prepare(
    `INSERT INTO dsm_sign_links (kind, doc_id, token_hash, status, expires_at, created_by, nonce)
     VALUES (?1, ?2, ?3, 'pending', datetime('now','+7 day'), ?4, ?5)
     ON CONFLICT(kind, doc_id) DO UPDATE SET token_hash = excluded.token_hash, status = 'pending',
       expires_at = excluded.expires_at, created_by = excluded.created_by, created_at = CURRENT_TIMESTAMP,
       signer_name = NULL, signed_at = NULL, nonce = excluded.nonce`
  ).bind(kind, docId, hash, actor, nonce).run();
  const row = await env.DB.prepare("SELECT expires_at FROM dsm_sign_links WHERE kind = ? AND doc_id = ?").bind(kind, docId).first();
  return { token, expires_at: row && row.expires_at, reused: false };
}

// ==========================================================================
// ລິ້ງເຊັນ DSM (dsm_sign_links) — ສົ່ງໃຫ້ DSM ເຊັນໃບສັນຍາຢືມ (DOC-) / ໃບເກັບຕູ້ເຂົ້າສາງ (T-) ໂດຍບໍ່ຕ້ອງ login
// token ສຸ່ມ 256-bit (ເກັບສະເພາະ hash), ໃຊ້ໄດ້ຄັ້ງດຽວ, ໝົດອາຍຸ 7 ວັນ — ໃຊ້ຕົວຊ່ວຍດຽວກັນກັບລິ້ງຮັບຕູ້ປາຍທາງ
// ==========================================================================
const DSM_DOC_KINDS = {
  loan:   { table: "loan_contracts",   prefix: "loan-contract",   title: "ໃບສັນຍາຢືມ",         build: (env, row, opts) => buildLoanPdf(env, row, opts) },
  cancel: { table: "cancel_contracts", prefix: "cancel-contract", title: "ໃບເກັບຕູ້ເຂົ້າສາງ (T-)", build: (env, row, opts) => buildCancelPdf(env, row, opts) },
};
// ສະຖານະລິ້ງ DSM ຂອງແຕ່ລະໃບ: signed | pending | expired | '' (ຍັງບໍ່ເຄີຍສ້າງລິ້ງ) — ໃຊ້ເປັນ subselect ໃນ history
const dsmLinkStatusSql = (kind, tbl) =>
  `(SELECT CASE WHEN l.status = 'signed' THEN 'signed' WHEN l.expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE 'pending' END
      FROM dsm_sign_links l WHERE l.kind = '${kind}' AND l.doc_id = ${tbl}.id) AS dsm_link_status`;
// ລຶບລິ້ງ DSM ຂອງໃບທີ່ຖືກລຶບ (best-effort — ຖ້າຍັງບໍ່ໄດ້ຮັນ migration ກໍບໍ່ກະທົບການລຶບໃບ)
async function deleteDsmLinks(env, kind, docId) {
  try { await env.DB.prepare("DELETE FROM dsm_sign_links WHERE kind = ? AND doc_id = ?").bind(kind, docId).run(); } catch (e) { /* ບໍ່ຕ້ອງເຮັດຫຍັງ */ }
}
// ===================== ງົບຕູ້ແຊ່ຕ່າງແຂວງ (province_budgets) =====================
// ໂຄຕ້າຈຳນວນຕູ້ ຕໍ່ ແຂວງ / ສາງສະເພາະແຂວງ / Brand / Type (warehouse = '' = ງົບແບບເກົ່າທັງແຂວງ). ຍອດ "ຕັດແລ້ວ" = ຕູ້ທີ່ສົ່ງອອກແລ້ວ (shipped_out ຫຼັງຈາກລົດອອກ), "ຈອງ" = ຕູ້ທີ່ຢູ່ໃນຖ້ຽວທີ່ຍັງບໍ່ອອກ
const pbKey = (p, w, b, t) => `${p}\u0001${w}\u0001${b}\u0001${t}`;
const pbLabel = (p, w, b, t) => `${p}${w ? " / " + w : ""} / ${b} ${t}`;

// ສາງສະເພາະແຂວງຂອງແຕ່ລະແຂວງ (ship_province_warehouses) -> { ຊື່ແຂວງ: [ຊື່ສາງ, ...] }
async function provWhMap(env) {
  const { results } = await env.DB.prepare("SELECT p.name AS province, w.name AS warehouse FROM ship_province_warehouses w JOIN ship_provinces p ON p.id = w.province_id ORDER BY w.name").all();
  const m = {};
  for (const r of results || []) (m[r.province] = m[r.province] || []).push(r.warehouse);
  return m;
}
// ກວດສາງປາຍທາງ: ແຂວງທີ່ມີສາງສະເພາະແຂວງ -> ສາງຕ້ອງຢູ່ໃນແຂວງນັ້ນ (ຖ້າ require = true ຕ້ອງເລືອກ); ແຂວງທີ່ບໍ່ມີສາງ -> ບໍ່ເກັບສາງ ('')
function provWhResolve(whMap, province, warehouse, require) {
  const wh = String(warehouse == null ? "" : warehouse).trim().slice(0, 100);
  const prov = String(province == null ? "" : province).trim();
  const names = (prov && whMap[prov]) || [];
  if (!names.length) return { wh: "" };
  if (!wh) return require ? { error: `ແຂວງ "${prov}" ມີສາງສະເພາະແຂວງ — ກະລຸນາເລືອກສາງປາຍທາງ` } : { wh: "" };
  if (!names.includes(wh)) return { error: `ສາງ "${wh}" ບໍ່ຢູ່ໃນແຂວງ "${prov}"` };
  return { wh };
}

// ===================== ແຜນສົ່ງຕູ້ (ship plan) — helper ໃຊ້ຮ່ວມກັນ =====================
// ຈັບຄູ່ຕູ້ -> ຊະນິດຕູ້: 1) ຕາມຊື່ Model ທີ່ຕັ້ງໄວ້ 2) ຖ້າບໍ່ກົງ ເດົາຈຳນວນປະຕູ ແລ້ວໃຊ້ຊະນິດ "ຄ່າເລີ່ມຕົ້ນ" ຂອງຈຳນວນປະຕູນັ້ນ. ຄືນ function (model, type) -> size id | null
function shipPlanSizeResolver(sizes) {
  const norm = (v) => String(v || "").toLowerCase().replace(/[\s_\-]/g, "");
  const modelMap = {};
  for (const z of sizes) {
    String(z.models || "").split(/[,;\n]/).map(norm).filter(Boolean).forEach((m) => { if (!modelMap[m]) modelMap[m] = z.id; });
  }
  const defaultByDoors = {};
  for (const z of sizes) if (z.is_default && !defaultByDoors[z.doors]) defaultByDoors[z.doors] = z.id;
  for (const z of sizes) if (!defaultByDoors[z.doors]) defaultByDoors[z.doors] = z.id;
  const doorsFromCode = (v) => { const m = String(v || "").match(/(?:^|[^a-z0-9])([1-3])d(?:[^a-z0-9]|$)/i); return m ? Number(m[1]) : null; }; // ເຊັ່ນ 1D_AMD, 2D-XX
  return (model, type) => {
    let sid = modelMap[norm(model)] || null;
    if (!sid) {
      const doors = doorsFromCode(model) || doorsFromCode(type) || inferDoorsFromCooler(type, model).doors;
      sid = doors ? defaultByDoors[doors] || null : null;
    }
    return sid;
  };
}

// ສ້າງຖ້ຽວລົດ (ເລກຖ້ຽວ TRP-YYYYMMDD-NN) — ໃຊ້ຮ່ວມກັນລະຫວ່າງ POST /api/admin/ship-trips ແລະ ແຜນສົ່ງຕູ້. ຄືນ trip ຫຼື null
async function createShipTripRow(env, f, actor) {
  const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const laosToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const tripDate = /^\d{4}-\d{2}-\d{2}$/.test(String(f.trip_date || "")) ? String(f.trip_date) : laosToday;
  const ymd = tripDate.replace(/-/g, "");
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await env.DB.prepare(
      "SELECT trip_no FROM ship_trips WHERE trip_no LIKE ? ORDER BY trip_no DESC LIMIT 1"
    ).bind(`TRP-${ymd}-%`).first();
    const seq = last ? (parseInt(String(last.trip_no).split("-").pop(), 10) || 0) + 1 : 1;
    const tripNo = `TRP-${ymd}-${String(seq).padStart(2, "0")}`;
    try {
      const res = await env.DB.prepare(
        `INSERT INTO ship_trips (trip_no, truck_plate, driver_name, driver_phone, trip_date, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(tripNo, clean(f.truck_plate, 30), clean(f.driver_name, 100) || null, clean(f.driver_phone, 30) || null,
        tripDate, clean(f.note, 300) || null, actor || null).run();
      return await env.DB.prepare("SELECT * FROM ship_trips WHERE id = ?").bind(res.meta.last_row_id).first();
    } catch (e) {
      console.error("line 833", e);
      if (!/UNIQUE/i.test(String((e && e.message) || e))) throw e; // ເລກຖ້ຽວຊ້ຳ (ສ້າງພ້ອມກັນ) -> ລອງເລກຖັດໄປ
    }
  }
  return null;
}

// ===================== ແຜນຂອງຖ້ຽວ (ship_trip_plan_items) =====================
// ຖ້ຽວທີ່ສ້າງຈາກແຜນສົ່ງຕູ້ = ລໍຖ້າຈັດຕູ້ຂຶ້ນລົດ. ຕູ້ທີ່ສະແກນ/ເລືອກຂຶ້ນລົດ ຕ້ອງຕົງກັບແຜນ: ແຂວງ/ສາງ + ຊະນິດຕູ້ (ຈັບຈາກ Type/Model ດ້ວຍ shipPlanSizeResolver) ແລະ ຍັງບໍ່ເກີນຈຳນວນ
// ຖ້ຽວທີ່ບໍ່ມີແຖວແຜນ = ຖ້ຽວແບບເກົ່າ (ເພີ່ມຕູ້ໄດ້ອິດສະຫຼະ, ບໍ່ກວດແຜນ)
async function loadShipSizes(env) {
  try {
    const z = await env.DB.prepare("SELECT id, label, doors, models, w, l, max_per_truck, is_default FROM truck_cooler_sizes ORDER BY sort_order, id").all();
    const sizes = z.results || [];
    const sizeLabel = {};
    for (const x of sizes) sizeLabel[x.id] = x.label;
    return { sizes, sizeLabel, sizeOf: shipPlanSizeResolver(sizes) };
  } catch (e) {
    console.error("line 850", e);
    return { sizes: [], sizeLabel: {}, sizeOf: () => null }; // ຍັງບໍ່ໄດ້ຮັນ migration_add_truck_types.sql
  }
}

// ຫາແຖວແຜນທີ່ຕູ້ນີ້ເຂົ້າໄດ້ (ແຂວງກົງ + ຊະນິດກົງ + ຍັງບໍ່ຄົບຈຳນວນ). ສາງ: ກົງກັນ ຫຼື ແຖວບໍ່ກຳນົດສາງ (warehouse = ''). Brand: ກົງກັນ ຫຼື ແຖວບໍ່ກຳນົດ Brand (brand = '')
// ຖ້າຫຼາຍແຖວເຂົ້າໄດ້ ເລືອກແຖວທີ່ "ລະບຸໄວ້ສະເພາະ" ກ່ອນ (ສາງກົງ ແລະ Brand ກົງ) ແລ້ວຈຶ່ງແຖວທີ່ບໍ່ກຳນົດ
const planBrandKey = (v) => String(v == null ? "" : v).trim().toLowerCase();
function planFindSlot(items, prov, wh, sid, brand) {
  const p = String(prov == null ? "" : prov).trim();
  const w = String(wh == null ? "" : wh).trim();
  const bk = planBrandKey(brand);
  let best = null, bestScore = -1;
  for (const it of items) {
    if (it.province !== p || Number(it.size_id) !== Number(sid) || it.loaded >= it.qty) continue;
    if (it.warehouse && it.warehouse !== w) continue;
    const ib = planBrandKey(it.brand);
    if (ib && ib !== bk) continue;
    const score = (it.warehouse ? 2 : 0) + (ib ? 1 : 0);
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return best;
}

// ກວດຕູ້ 1 ໜ່ວຍກັບແຜນຂອງຖ້ຽວ -> { slot } ຖ້າເຂົ້າໄດ້, ຫຼື { error } ບອກເຫດຜົນ. c = { brand, type, model }
function planCheckCooler(items, sz, prov, wh, c) {
  const label = [c.brand, c.type, c.model].filter(Boolean).join(" / ") || "ຕູ້";
  const sid = sz.sizeOf(c.model, c.type);
  if (!sid) return { error: `${label}: ບໍ່ຮູ້ຊະນິດຕູ້ (Type/Model) ຈຶ່ງບໍ່ຢູ່ໃນແຜນຂອງຖ້ຽວນີ້` };
  const slot = planFindSlot(items, prov, wh, sid, c.brand);
  if (slot) return { slot, sid };
  const sizeName = sz.sizeLabel[sid] || "ຊະນິດຕູ້";
  const provT = String(prov || "").trim(), whT = String(wh == null ? "" : wh).trim();
  const samePS = items.filter((it) => it.province === provT && Number(it.size_id) === Number(sid) && (!it.warehouse || it.warehouse === whT));
  if (samePS.length) {
    const bk = planBrandKey(c.brand);
    const sameB = samePS.filter((it) => !it.brand || planBrandKey(it.brand) === bk);
    if (sameB.length) {
      const got = sameB.reduce((a, it) => a + it.loaded, 0), need = sameB.reduce((a, it) => a + it.qty, 0);
      return { error: `${label}: ແຜນ ${provT}${wh ? " / " + wh : ""} • ${sizeName}${sameB.some((it) => it.brand) ? " • " + (c.brand || "-") : ""} ຄົບແລ້ວ (${got}/${need})` };
    }
    const wanted = [...new Set(samePS.map((it) => it.brand).filter(Boolean))].join(", ");
    return { error: `${label}: Brand ບໍ່ກົງກັບແຜນ — ແຜນ ${provT}${wh ? " / " + wh : ""} • ${sizeName} ກຳນົດ Brand: ${wanted || "-"}` };
  }
  return { error: `${label} (${sizeName}) ບໍ່ຢູ່ໃນແຜນຂອງຖ້ຽວນີ້ ສຳລັບແຂວງ ${provT || "-"}${wh ? " / " + wh : ""}` };
}

// ໂຫຼດແຜນ + ຈຳນວນຕູ້ທີ່ຂຶ້ນຖ້ຽວແລ້ວ (loaded). tripId = ຖ້ຽວດຽວ ຫຼື null = ທຸກຖ້ຽວ open ທີ່ມີແຜນ. ຄືນ Map(trip_id -> items[]) ສະເພາະຖ້ຽວທີ່ມີແຜນ
async function loadTripPlans(env, sz, tripId) {
  const out = new Map();
  const cond = tripId ? "= ?" : "IN (SELECT DISTINCT p.trip_id FROM ship_trip_plan_items p JOIN ship_trips t ON t.id = p.trip_id WHERE t.status = 'open')";
  const binds = tripId ? [tripId] : [];
  let planRows;
  try {
    planRows = (await env.DB.prepare(
      `SELECT id, trip_id, province, warehouse, brand, size_id, size_label, qty FROM ship_trip_plan_items WHERE trip_id ${cond} ORDER BY id`
    ).bind(...binds).all()).results || [];
  } catch (e) {
    console.error("line 907", e);
    try { // ຍັງບໍ່ໄດ້ຮັນ migration_add_ship_trip_plan_brand.sql -> ແຜນເກົ່າບໍ່ມີ Brand (ຮັບທຸກ Brand)
      planRows = (await env.DB.prepare(
        `SELECT id, trip_id, province, warehouse, size_id, size_label, qty FROM ship_trip_plan_items WHERE trip_id ${cond} ORDER BY id`
      ).bind(...binds).all()).results || [];
    } catch (e2) { return out; } // ຍັງບໍ່ໄດ້ຮັນ migration_add_ship_trip_plan_items.sql -> ທຸກຖ້ຽວເປັນແບບເກົ່າ
  }
  for (const r of planRows) {
    if (!out.has(r.trip_id)) out.set(r.trip_id, []);
    out.get(r.trip_id).push({
      id: r.id, trip_id: r.trip_id, province: String(r.province || "").trim(), warehouse: String(r.warehouse || "").trim(), brand: String(r.brand || "").trim(),
      size_id: r.size_id, size_label: sz.sizeLabel[r.size_id] || r.size_label || "", qty: r.qty, loaded: 0
    });
  }
  if (!out.size) return out;
  const a = (await env.DB.prepare(
    `SELECT trip_id, TRIM(COALESCE(ship_province, '')) AS province, TRIM(COALESCE(ship_warehouse, '')) AS warehouse, cooler_brand, cooler_type, cooler_model
       FROM new_coolers WHERE trip_id ${cond}`
  ).bind(...binds).all()).results || [];
  const b = (await env.DB.prepare(
    `SELECT l.trip_id AS trip_id, TRIM(COALESCE(l.ship_province, '')) AS province, TRIM(COALESCE(l.ship_warehouse, '')) AS warehouse, ws.cooler_brand AS cooler_brand, ws.cooler_type AS cooler_type, ws.cooler_model AS cooler_model
       FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id WHERE l.trip_id ${cond}`
  ).bind(...binds).all()).results || [];
  for (const r of [...a, ...b]) {
    const items = out.get(r.trip_id);
    if (!items) continue;
    const sid = sz.sizeOf(r.cooler_model, r.cooler_type);
    const slot = sid ? planFindSlot(items, r.province, r.warehouse, sid, r.cooler_brand) : null;
    if (slot) slot.loaded++;
  }
  return out;
}

// ===================== ງົບຕູ້ແຊ່ຕ່າງແຂວງ: ຕັດງົບຕາມ Brand / Type =====================
// ແຖວງົບ: ແຂວງ + ສາງ + Brand + Type (ບໍ່ແຍກ Model). ຕູ້ 1 ໜ່ວຍຕັດງົບແຖວທີ່ ແຂວງ/ສາງ/Brand/Type ກົງກັນ; ບໍ່ມີແຖວ = ບໍ່ຈຳກັດ
async function loadProvBudgets(env, full) {
  const cols = "province, warehouse, cooler_brand, cooler_type, quota" + (full ? ", id, note, updated_by, updated_at" : "");
  const rows = (await env.DB.prepare(`SELECT ${cols} FROM province_budgets ORDER BY province, warehouse, cooler_brand, cooler_type`).all()).results || [];
  const t = (v) => String(v == null ? "" : v).trim();
  return rows.map((r) => ({ ...r, province: t(r.province), warehouse: t(r.warehouse), cooler_brand: t(r.cooler_brand), cooler_type: t(r.cooler_type) }));
}
function pbIndex(budgets) {
  const quota = {}, info = {};
  for (const b of budgets) {
    const k = pbKey(b.province, b.warehouse, b.cooler_brand, b.cooler_type);
    quota[k] = b.quota; info[k] = b;
  }
  return { quota, info };
}
function pbResolve(idx, p, w, b, t) {
  const k = pbKey(p, w, b, t);
  return k in idx.quota ? k : null;
}
// ລວມຕູ້ທີ່ໃຊ້/ຈອງ ເຂົ້າແຖວງົບທີ່ຕັດ. none = ຕູ້ທີ່ບໍ່ມີງົບຄຸມ (ຍັງບໍ່ໄດ້ກຳນົດ)
function pbUsage(idx, usageRows) {
  const used = {}, reserved = {}, none = [];
  for (const r of usageRows) {
    const k = pbResolve(idx, r.province, r.warehouse, r.brand, r.type);
    if (k === null) { none.push(r); continue; }
    const m = r.st === "used" ? used : reserved;
    m[k] = (m[k] || 0) + r.c;
  }
  return { used, reserved, none };
}

// ===================== ແຜນສົ່ງຕູ້ -> ກວດ/ຕັດງົບຕູ້ແຊ່ຕ່າງແຂວງ =====================
// ກວດຈາກແຖວໃນແຜນໂດຍກົງ (ບໍ່ຜູກກັບຕູ້ຈິງ). ແຖວແຜນມີ ແຂວງ/ສາງ/Brand/ຊະນິດຕູ້(size)/ຈຳນວນ ແຕ່ງົບຄິດຕາມ ແຂວງ/ສາງ/Brand/Type
// ຈຶ່ງຈັບຄູ່ແຖວແຜນ -> ແຖວງົບ ໂດຍ: ແຂວງກົງ, ສາງກົງ (ແຖວແຜນບໍ່ກຳນົດສາງ = ທຸກສາງ), Brand ກົງ (ບໍ່ກຳນົດ = ທຸກ Brand), ແລະ Type ຂອງງົບຖືກຈັບເປັນຊະນິດຕູ້ (size) ດຽວກັບແຖວແຜນ
//   ໄດ້ 0 ແຖວງົບ = ບໍ່ຈຳກັດ; ໄດ້ 1 ແຖວ = ຕັດແຖວນັ້ນ; ໄດ້ຫຼາຍແຖວ = ບອກບໍ່ໄດ້ວ່າຕັດແຖວໃດ -> ນັບເປັນ unchecked
// ງົບທີ່ເຫຼືອ = ໂຄຕ້າ - ຕັດແລ້ວ (ລົດອອກ) - ຈອງ (ຕູ້ຢູ່ໃນຖ້ຽວ open) - ສ່ວນທີ່ຍັງບໍ່ໄດ້ຂຶ້ນລົດຂອງແຜນຖ້ຽວ open ອື່ນ
function pbMatchPlanItem(idx, sz, it) {
  const wantWh = String(it.warehouse || "").trim();
  const wantBrand = planBrandKey(it.brand);
  const cands = Object.values(idx.info).filter((b) =>
    b.province === String(it.province || "").trim()
    && (!wantBrand || planBrandKey(b.cooler_brand) === wantBrand)
    && Number(sz.sizeOf("", b.cooler_type)) === Number(it.size_id));
  if (!cands.length) return { key: null, ambiguous: false };
  let pool = cands;
  if (wantWh) { // ສາງກົງກ່ອນ; ບໍ່ມີ -> ງົບແບບເກົ່າທັງແຂວງ (warehouse = '')
    const exact = cands.filter((b) => b.warehouse === wantWh);
    pool = exact.length ? exact : cands.filter((b) => !b.warehouse);
    if (!pool.length) return { key: null, ambiguous: false };
  }
  if (pool.length === 1) return { key: pbKey(pool[0].province, pool[0].warehouse, pool[0].cooler_brand, pool[0].cooler_type), ambiguous: false };
  return { key: null, ambiguous: true };
}

// ສະຖານະ "ຈອງໃນແຜນ" (planned) ແຍກຈາກ "ຈອງໃນຖ້ຽວ" (reserved = ຕູ້ຈິງຢູ່ໃນຖ້ຽວ) ແລະ "ຕັດແລ້ວ" (used = ລົດອອກ)
// ຕັດງົບທັນທີທີ່ສ້າງຖ້ຽວຈາກແຜນສົ່ງຕູ້: ນັບສ່ວນທີ່ຍັງບໍ່ໄດ້ຂຶ້ນລົດຂອງແຜນຖ້ຽວ open (qty - loaded). ເມື່ອຕູ້ຂຶ້ນລົດ ຍອດຍ້າຍຈາກ planned -> reserved ເອງ
// ຄືນ { planned: {ກະແຈງົບ: ຈຳນວນ}, none: [ແຖວແຜນທີ່ບໍ່ມີແຖວງົບຮອງຮັບ] }
async function provBudgetPlannedMap(env, idx, sz) {
  const planned = {}, none = [];
  let openPlans;
  try { openPlans = await loadTripPlans(env, sz, null); } catch (e) { return { planned, none }; }
  for (const items of openPlans.values()) {
    for (const it of items) {
      const left = it.qty - it.loaded;
      if (left <= 0) continue;
      const m = pbMatchPlanItem(idx, sz, it);
      if (m.key !== null) planned[m.key] = (planned[m.key] || 0) + left;
      else if (!m.ambiguous) none.push({ province: it.province, warehouse: it.warehouse || "", brand: it.brand || "", type: sz.sizeLabel[it.size_id] || it.size_label || "", c: left });
    }
  }
  return { planned, none };
}

async function shipPlanBudgetCheck(env, sz, trucks) {
  const out = { problems: [], unchecked: 0 };
  let budgets;
  try { budgets = await loadProvBudgets(env, false); } catch (e) { return out; }
  // ບໍ່ມີງົບສັກແຖວ ກໍບໍ່ return — ທຸກລາຍການໃນແຜນຈະຖືກນັບເປັນ "ຍັງບໍ່ໄດ້ກຳນົດງົບ" (ຕ້ອງ admin ຢືນຢັນເອົາໄປນອກງົບ)
  const idx = pbIndex(budgets);

  // ສ່ວນທີ່ແຜນຂອງຖ້ຽວ open ອື່ນຈອງໄວ້ແລ້ວ (ຍັງບໍ່ໄດ້ຂຶ້ນລົດ) ໃຊ້ງົບກ່ອນ
  const plannedMap = (await provBudgetPlannedMap(env, idx, sz)).planned;
  // ແຜນໃໝ່: ລວມຕາມແຖວງົບທີ່ຕັດ
  const need = {};
  const noBudget = {}; // ລາຍການໃນແຜນທີ່ບໍ່ມີແຖວງົບຮອງຮັບ -> ຖືເປັນບັນຫາ (ສ້າງໄດ້ສະເພາະ admin ຢືນຢັນເອົາໄປນອກງົບ)
  for (const t of trucks) {
    for (const it of t.items) {
      const m = pbMatchPlanItem(idx, sz, it);
      if (m.ambiguous) { out.unchecked += it.n; continue; }
      if (m.key === null) {
        const nk = [it.province, it.warehouse || "", it.brand || "", it.size_id].join("|");
        const g = (noBudget[nk] = noBudget[nk] || { n: 0, it });
        g.n += it.n;
        continue;
      }
      const g = (need[m.key] = need[m.key] || { n: 0, refs: [] });
      g.n += it.n;
      if (it.ref) g.refs.push(it.ref);
    }
  }
  for (const g of Object.values(noBudget)) {
    const it = g.it;
    const label = [it.province, it.warehouse, it.brand, sz.sizeLabel[it.size_id]].filter(Boolean).join(" / ");
    out.problems.push({
      province: it.province, warehouse: it.warehouse || "", brand: it.brand || "", type: sz.sizeLabel[it.size_id] || "",
      no_budget: true, need: g.n, remaining: 0,
      text: `${label}: ຍັງບໍ່ໄດ້ກຳນົດງົບ, ແຜນນີ້ຕ້ອງການ ${g.n}`
    });
  }
  const { used: usedMap, reserved: resMap } = pbUsage(idx, await provBudgetUsageRows(env));
  for (const [k, g] of Object.entries(need)) {
    const b = idx.info[k];
    const used = usedMap[k] || 0, reserved = (resMap[k] || 0) + (plannedMap[k] || 0);
    const remaining = idx.quota[k] - used - reserved;
    if (g.n > remaining) {
      out.problems.push({
        province: b.province, warehouse: b.warehouse, brand: b.cooler_brand, type: b.cooler_type,
        quota: idx.quota[k], used, reserved, need: g.n, remaining: Math.max(remaining, 0), refs: g.refs || [],
        text: `${pbLabel(b.province, b.warehouse, b.cooler_brand, b.cooler_type)}: ງົບ ${idx.quota[k]}, ຕັດແລ້ວ ${used}, ຈອງ/ຢູ່ໃນແຜນ ${reserved}, ແຜນນີ້ຕ້ອງການ ${g.n} (ເຫຼືອ ${Math.max(remaining, 0)})`
      });
    }
  }
  return out;
}

async function provBudgetUsageRows(env) {
  const { results } = await env.DB.prepare(
    `SELECT province, warehouse, brand, type, st, COUNT(*) AS c FROM (
        SELECT TRIM(COALESCE(ship_province, '')) AS province, TRIM(COALESCE(ship_warehouse, '')) AS warehouse, TRIM(COALESCE(cooler_brand, '')) AS brand, TRIM(COALESCE(cooler_type, '')) AS type,
               CASE WHEN status = 'shipped_out' THEN 'used' ELSE 'reserved' END AS st
          FROM new_coolers
         WHERE status = 'shipped_out' OR (status = 'confirmed' AND ship_requested = 1 AND trip_id IS NOT NULL)
        UNION ALL
        SELECT TRIM(COALESCE(l.ship_province, '')), TRIM(COALESCE(l.ship_warehouse, '')), TRIM(COALESCE(ws.cooler_brand, '')), TRIM(COALESCE(ws.cooler_type, '')),
               CASE WHEN ws.status = 'shipped_out' THEN 'used' ELSE 'reserved' END
          FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
         WHERE ws.status IN ('shipped_out', 'reserved')
     ) GROUP BY province, warehouse, brand, type, st`
  ).all();
  return results || [];
}

// ກວດກ່ອນລົດອອກ: ຖ້າຕູ້ໃນຖ້ຽວມີງົບ (ຕາມ Brand/Type) ແລະ (ຕັດແລ້ວ + ຕູ້ໃນຖ້ຽວນີ້) ເກີນໂຄຕ້າ -> ສົ່ງຂໍ້ຄວາມ error (null = ຜ່ານ)
async function provBudgetCheckTrip(env, tripId) {
  const { results: tripRows } = await env.DB.prepare(
    `SELECT province, warehouse, brand, type, COUNT(*) AS c FROM (
        SELECT TRIM(COALESCE(ship_province, '')) AS province, TRIM(COALESCE(ship_warehouse, '')) AS warehouse, TRIM(COALESCE(cooler_brand, '')) AS brand, TRIM(COALESCE(cooler_type, '')) AS type
          FROM new_coolers WHERE trip_id = ?1 AND status = 'confirmed' AND ship_requested = 1
        UNION ALL
        SELECT TRIM(COALESCE(l.ship_province, '')), TRIM(COALESCE(l.ship_warehouse, '')), TRIM(COALESCE(ws.cooler_brand, '')), TRIM(COALESCE(ws.cooler_type, ''))
          FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
         WHERE l.trip_id = ?1 AND ws.status = 'reserved'
     ) GROUP BY province, warehouse, brand, type`
  ).bind(tripId).all();
  if (!tripRows || !tripRows.length) return null;
  const idx = pbIndex(await loadProvBudgets(env, false));
  const { used: usedMap } = pbUsage(idx, await provBudgetUsageRows(env));
  const needMap = {};
  for (const r of tripRows) {
    const k = pbResolve(idx, r.province, r.warehouse, r.brand, r.type);
    if (k === null) continue; // ບໍ່ມີງົບ = ບໍ່ຈຳກັດ
    needMap[k] = (needMap[k] || 0) + r.c;
  }
  const problems = [];
  for (const [k, c] of Object.entries(needMap)) {
    const b = idx.info[k];
    const used = usedMap[k] || 0;
    const remaining = idx.quota[k] - used;
    if (c > remaining) {
      problems.push(`${pbLabel(b.province, b.warehouse, b.cooler_brand, b.cooler_type)}: ໂຄຕ້າ ${idx.quota[k]}, ຕັດແລ້ວ ${used}, ຖ້ຽວນີ້ ${c} (ຄົງເຫຼືອ ${Math.max(remaining, 0)})`);
    }
  }
  if (!problems.length) return null;
  return "ເກີນງົບຕູ້ແຊ່ຕ່າງແຂວງ (ຕາມສາງ) — " + problems.join(" | ") + ' — ກະລຸນາເພີ່ມໂຄຕ້າໃນເມນູ "ງົບຕູ້ແຊ່ຕ່າງແຂວງ" ຫຼື ເອົາຕູ້ອອກຈາກຖ້ຽວ';
}

// ຕູ້ຂອງຖ້ຽວ + ແຂວງ + ສາງສະເພາະແຂວງ (ຕູ້ໃໝ່ + ຕູ້ຈາກສາງ). warehouse = '' = ແຂວງທີ່ບໍ່ມີສາງ / ຕູ້ທີ່ບໍ່ໄດ້ລະບຸສາງ
const recvLabel = (province, warehouse) => `${province}${warehouse ? " / " + warehouse : ""}`;
async function receiptItems(env, tripId, province, warehouse) {
  const { results } = await env.DB.prepare(
    `SELECT cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex
       FROM new_coolers WHERE trip_id = ?1 AND TRIM(COALESCE(ship_province, '')) = ?2 AND TRIM(COALESCE(ship_warehouse, '')) = ?3
     UNION ALL
     SELECT ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex
       FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
      WHERE l.trip_id = ?1 AND TRIM(COALESCE(l.ship_province, '')) = ?2 AND TRIM(COALESCE(l.ship_warehouse, '')) = ?3`
  ).bind(tripId, province, String(warehouse || "").trim()).all();
  return results || [];
}
const RECEIPT_NO_CACHE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

// ຮັນງານພື້ນຫຼັງ (ບໍ່ໃຫ້ການຕອບກັບຊ້າ ເມື່ອທີມມີ user ຫຼາຍຄົນ)
function runInBackground(ctx, promise) {
  const safe = Promise.resolve(promise).catch(() => {});
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(safe);
  return safe;
}

// ==========================================================================
// ດ່ານກວດສິດ (Authentication / Authorization)
// ກ່ອນນີ້ລະບົບເຊື່ອ userId ທີ່ browser ສົ່ງມາໂດຍກົງ -> ຜູ້ໃດກໍປອມເປັນ Admin ໄດ້
// ຕອນນີ້ທຸກ API (ຍົກເວັ້ນ PUBLIC_API_ROUTES) ຕ້ອງແນບ header:
//     Authorization: Bearer <token ທີ່ໄດ້ຕອນ login>
// ແລະ userId/callerId ຈະຖືກ "ທັບ" ດ້ວຍ id ຈາກ token ສະເໝີ (ຄ່າທີ່ browser ສົ່ງມາຖືກປະຖິ້ມ)
// ==========================================================================
// ຮູບແບບອີເມວແບບງ່າຍ: ຕ້ອງມີ @ ແລະ ຈຸດ, ບໍ່ມີຊ່ອງວ່າງ ແລະ ບໍ່ມີ < > " ' (ກັນຂໍ້ຄວາມແປກປອມ ເຊັ່ນ <script> ຖືກຕັ້ງເປັນອີເມວ)
const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const ROLE_ADMIN = ["admin"];
// ຜູ້ຊ່ວຍ admin (assistant_admin): ສິດຄືກັບ admin ທຸກຢ່າງ ຍົກເວັ້ນ ຈັດການຜູ້ໃຊ້ / ປ່ຽນສິດ / ລຶບຂໍ້ມູນ / ຕັ້ງຄ່າລະບົບ
const isAdminLike = (role) => role === "admin" || role === "assistant_admin";
const ASSISTANT_ADMIN_DENIED_PATHS = new Set([
  "/api/admin/users", "/api/admin/update-status", "/api/admin/update-user-role", "/api/admin/reset-password", "/api/admin/create-dsm-users",
  "/api/admin/user-app-status", "/api/admin/login-logs", "/api/admin/maintenance",
  "/api/admin/ship-trip-receipts/reset", "/api/admin/backup",
]);
// ເສັ້ນທາງທີ່ຜູ້ຊ່ວຍ admin ເຮັດບໍ່ໄດ້: ຈັດການຜູ້ໃຊ້ ແລະ ທຸກການລຶບ (delete-* ຫຼື .../delete)
const isAssistantAdminDenied = (path) =>
  ASSISTANT_ADMIN_DENIED_PATHS.has(path) || /^\/api\/admin\/(?:.*\/)?delete(?:-[a-z0-9-]+)?(?:\/.*)?$/.test(path);
// DSM: ຜູ້ຈັດການຂາຍປະຈຳທີມ — ເບິ່ງຂໍ້ມູນສະເພາະທີມຕົນເອງ (users.team = mde_list.team) + ເຊັນເອກະສານ (ສັນຍາຢືມ DOC-/ໃບຍົກເລີກ T-) ຂອງທີມ
const TEAM_MDE_SQL = "UPPER(TRIM(mde_code)) IN (SELECT UPPER(TRIM(mde_code)) FROM mde_list WHERE team = ?)";
const ROLE_STAFF = ["admin", "warehouse", "delivery"];
const ROLE_WH = ["admin", "warehouse"]; // ພະນັກງານສາງ + admin ເທົ່ານັ້ນ ທີ່ຈັດການສະຕັອກສາງໄດ້
const ROLE_WH_USER = ["admin", "warehouse", "user"]; // admin + ພະນັກງານສາງ + user (MDE) — ໃຊ້ກັບເມນູສະແກນກວດທີ່ມາຂອງຕູ້ (Cooler Master)

// API ທີ່ເປີດໃຫ້ໃຊ້ໄດ້ໂດຍບໍ່ຕ້ອງ login (ໜ້າສະໝັກ/ໜ້າ login ຕ້ອງໃຊ້)
const PUBLIC_API_ROUTES = new Set([
  "/api/login",
  "/api/maintenance-status",
  "/api/register",
  "/api/register/send-otp",
  "/api/forgot-password/email",
  "/api/reset-password-with-code",
  "/api/mde-list",
  "/api/catalog",
  "/api/push/vapid-public-key",
  // ລິ້ງເຊັນຮັບຕູ້ປາຍທາງ (ຜູ້ຮັບຕູ້ບໍ່ມີບັນຊີ) — ຄວາມປອດໄພອີງ token ສຸ່ມ 256-bit ທີ່ໃຊ້ໄດ້ຄັ້ງດຽວ + ໝົດອາຍຸ
  "/api/public/receipt",
  "/api/public/receipt/sign",
  "/api/public/receipt/pdf",
  // ລິ້ງເຊັນ DSM (DSM ບໍ່ຕ້ອງມີບັນຊີ) — ຄວາມປອດໄພອີງ token ສຸ່ມ 256-bit ທີ່ໃຊ້ໄດ້ຄັ້ງດຽວ + ໝົດອາຍຸ 7 ວັນ
  "/api/public/dsm-sign",
  "/api/public/dsm-sign/sign",
  "/api/public/dsm-sign/pdf",
]);

// API ທີ່ຕ້ອງມີ role ສະເພາະ (ນອກເໜືອຈາກການ login)
// ໝາຍເຫດ: /api/admin/* ອັນໃດບໍ່ຢູ່ໃນນີ້ ຈະຖືວ່າ "admin ເທົ່ານັ້ນ" ໂດຍອັດຕະໂນມັດ
// ===== ໂຕນັບຮອບສະແກນຕູ້ເຂົ້າໃໝ່ (ໃຊ້ຮ່ວມກັນທຸກເຄື່ອງ) =====
async function ncFillRoundOpen(env) {
  return await env.DB.prepare("SELECT * FROM new_cooler_fill_rounds WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1").first();
}
async function ncFillRoundSummary(env, round) {
  if (!round) return { round_id: null, started_at: null, count: 0, groups: [] };
  const rows = await env.DB.prepare(
    "SELECT nc.cooler_brand AS cooler_brand, nc.cooler_type AS cooler_type, nc.cooler_model AS cooler_model, COUNT(*) AS cnt " +
    "FROM new_cooler_fill_scans s JOIN new_coolers nc ON nc.id = s.new_cooler_id WHERE s.round_id = ? " +
    "GROUP BY nc.cooler_brand, nc.cooler_type, nc.cooler_model ORDER BY cnt DESC"
  ).bind(round.id).all();
  const groups = (rows.results || []).map(r => ({
    label: [r.cooler_brand, r.cooler_type, r.cooler_model].filter(Boolean).join(" / ") || "ຕູ້ແຊ່", n: r.cnt
  }));
  return { round_id: round.id, started_at: round.started_at, count: groups.reduce((a, g) => a + g.n, 0), groups };
}

const ROUTE_ROLES = {
  "/api/dsm/contracts": ["dsm"],
  "/api/dsm/contract-pdf": ["dsm"],
  "/api/dsm/sign": ["dsm"],
  // "/api/dsm-list" (GET): ບໍ່ຈຳກັດ role - user ທົ່ວໄປຕ້ອງເບິ່ງໄດ້ ເພື່ອສະແດງຊື່ DSM ຂອງທີມຕົນເອງ
  // ຕອນອອກໃບສັນຍາຢືມ (ຂຽນ/ແກ້ໄຂ ຈຳກັດສະເພາະ admin ຜ່ານ /api/admin/save-dsm, /api/admin/delete-dsm)
  "/api/admin/update-asset-request-status": ROLE_STAFF, // warehouse/delivery ອະນຸມັດຄຳຂໍໄດ້
  "/api/asset-status/update": ROLE_ADMIN,
  "/api/no-doc-delivery": ROLE_STAFF,
  "/api/asset-delivery/dispatch": ROLE_STAFF, // ສະແກນຕູ້ອອກສາງຂຶ້ນລົດ — warehouse / delivery / admin
  "/api/asset-delivery/on-truck": ROLE_STAFF,
  "/api/cooler-event": ROLE_STAFF,
  "/api/cooler-event/return": ROLE_STAFF,
  "/api/cooler-writeoff": ROLE_WH, // ລາຍງານຕູ້ແຊ່ສະສາງ - admin + warehouse ເທົ່ານັ້ນ (ລຶບ = admin ຜ່ານ /api/admin/delete-cooler-writeoff)
  "/api/warehouse-stock": ROLE_STAFF,
  "/api/warehouse-stock/history": ROLE_STAFF,
  "/api/warehouse-stock/budget-alerts": ROLE_STAFF,
  "/api/admin/save-warehouse-stock": ROLE_WH,
  "/api/admin/delete-warehouse-stock": ROLE_ADMIN, // ລຶບລາຍການສະຕັອກ - ຈຳກັດສະເພາະ admin (warehouse ເພີ່ມ/ແກ້ໄຂໄດ້ ແຕ່ລຶບບໍ່ໄດ້)
  // ກວດນັບສາງປະຈຳເດືອນ (admin + warehouse); ລຶບຮອບກວດນັບໄດ້ສະເພາະ admin
  "/api/stock-counts": ROLE_WH,
  "/api/stock-count/items": ROLE_WH,
  "/api/stock-count/start": ROLE_WH,
  "/api/stock-count/scan": ROLE_WH,
  "/api/stock-count/unmark": ROLE_WH,
  "/api/stock-count/complete": ROLE_WH,
  "/api/stock-count/delete": ROLE_ADMIN,
  // Cooler Master Data (ຂໍ້ມູນຕູ້ແຊ່ທົ່ວປະເທດ): ຄົ້ນຫາ/ສະແກນ = admin + warehouse; Import/ລຶບ = admin ເທົ່ານັ້ນ
  "/api/cooler-master/stats": ROLE_WH_USER, // admin + warehouse + user (ອ່ານຢ່າງດຽວ; import/delete ຍັງ admin ເທົ່ານັ້ນ)
  "/api/cooler-master/search": ROLE_WH_USER, // admin + warehouse + user (ອ່ານຢ່າງດຽວ; import/delete ຍັງ admin ເທົ່ານັ້ນ)
  "/api/admin/cooler-master/import": ROLE_ADMIN,
  "/api/admin/cooler-master/delete": ROLE_ADMIN,
  "/api/admin/cooler-master/refresh-stats": ROLE_ADMIN,
  "/api/admin/lost-coolers/list": ROLE_ADMIN,
  "/api/admin/lost-coolers/logs": ROLE_ADMIN,
  "/api/admin/lost-coolers/add": ROLE_ADMIN,
  "/api/admin/lost-coolers/import": ROLE_ADMIN,
  "/api/admin/lost-coolers/update": ROLE_ADMIN,
  "/api/admin/lost-coolers/exclude": ROLE_ADMIN,
  "/api/admin/lost-coolers/restore": ROLE_ADMIN,
  "/api/admin/lost-coolers/delete": ROLE_ADMIN,
  "/api/admin/update-new-cooler": ROLE_WH, // warehouse ແກ້ໄຂຂໍ້ມູນຕູ້ໃນ popup ຢືນຢັນໄດ້
  "/api/admin/fix-new-cooler-qr": ROLE_WH, // ແກ້/ສະຫຼັບ QR ເມື່ອ QR ຕິດສະຫຼັບຕູ້
  // ຕູ້ແຊ່ເຂົ້າໃຫມ່: role warehouse ໃຊ້ໄດ້ສະເພາະ "ສະແກນຢືນຢັນວ່າມີຕູ້" ແລະ "ຮັບເຂົ້າສາງ" (ຄົ້ນຫາ/ຢືນຢັນ/ຮັບເຂົ້າສາງ) — Import, ແກ້ໄຂ, ຍົກເລີກ, ລຶບ, ສົ່ງອອກຕ່າງແຂວງ, ຖ້ຽວລົດ ຍັງເປັນ admin ເທົ່ານັ້ນ
  "/api/admin/new-coolers": ROLE_WH,
  "/api/admin/new-cooler-fill-round": ROLE_WH, // ໂຕນັບຮອບສະແກນຕູ້ເຂົ້າໃໝ່ (ອ່ານ)
  "/api/admin/new-cooler-fill-round/add": ROLE_WH, // ນັບຕູ້ທີ່ສະແກນບັນທຶກແລ້ວເຂົ້າຮອບ
  "/api/admin/new-cooler-fill-round/close": ROLE_WH, // ປິດຮອບສະແກນ
  "/api/admin/lookup-new-cooler": ROLE_WH,
  "/api/admin/create-new-cooler": ROLE_WH, // ເມນູ "ສະແກນຕູ້ເຂົ້າໃໝ່": ເພີ່ມຕູ້ໃໝ່ເມື່ອບໍ່ພົບ QR (warehouse ໃຊ້ໄດ້)
  "/api/admin/confirm-new-cooler": ROLE_WH,
  "/api/admin/confirm-new-coolers-bulk": ROLE_ADMIN, // admin ຢືນຢັນຫຼາຍຕູ້ພ້ອມກັນ
  "/api/admin/receive-new-coolers": ROLE_WH,
  "/api/admin/new-cooler-receipts": ROLE_WH, // ບັນທຶກ/ເບິ່ງ ລ໋ອດ + ຄອນເທນເນີ ຂອງຕູ້ທີ່ຮັບເຂົ້າສາງ (warehouse ໃຊ້ໄດ້)
  "/api/admin/new-cooler-receipts/assign": ROLE_WH, // ໃສ່ລ໋ອດໃຫ້ຕູ້ທີ່ຮັບເຂົ້າສາງແລ້ວ
  "/api/admin/new-cooler-receipts/close": ROLE_WH, // ປິດລ໋ອດ (ເພີ່ມຕູ້ເຂົ້າລ໋ອດບໍ່ໄດ້ອີກ)
  "/api/admin/new-cooler-receipts/export": ROLE_WH, // Export ປະຫວັດລ໋ອດ + ຕູ້ໃນລ໋ອດ ເປັນ Excel (ບໍ່ຈຳກັດ 200 ລ໋ອດ)
  // ຖ້ຽວລົດສົ່ງຕູ້ຕ່າງແຂວງ: warehouse ໃຊ້ໄດ້ທັງໜ້າ ຍົກເວັ້ນ "ລຶບຖ້ຽວ" (/api/admin/ship-trips/delete ຍັງເປັນ admin ເທົ່ານັ້ນ)
  "/api/admin/ship-trips": ROLE_WH,
  "/api/admin/ship-trips/update": ROLE_WH,
  "/api/admin/ship-trip-plan": ROLE_WH,
  "/api/admin/ship-trips/plan-check": ROLE_WH,
  "/api/admin/ship-trip-stock": ROLE_WH,
  "/api/admin/ship-trips/add-stock": ROLE_WH,
  "/api/admin/ship-trips/remove-stock": ROLE_WH,
  "/api/admin/ship-trips/add-coolers": ROLE_WH,
  "/api/admin/ship-trips/remove-cooler": ROLE_WH,
  "/api/admin/ship-trips/scan": ROLE_WH,
  "/api/admin/ship-trips/unscan": ROLE_WH,
  "/api/admin/ship-trips/sign": ROLE_WH,
  "/api/admin/ship-trip-receipts": ROLE_WH,
  "/api/admin/ship-trip-receipts/create": ROLE_WH,
  "/api/admin/ship-trip-receipts/reset": ROLE_WH,
  "/api/admin/ship-trip-stops": ROLE_WH,
  "/api/admin/ship-trip-stops/order": ROLE_WH,
  "/api/admin/ship-trips/depart": ROLE_WH,
  "/api/admin/ship-trips/reopen": ROLE_WH,
  "/api/admin/provinces": ROLE_WH,
};

// API ທີ່ຊ່ອງ "userId" ໝາຍເຖິງ "ຜູ້ໃຊ້ງານເປົ້າໝາຍ" ບໍ່ແມ່ນຜູ້ເອີ້ນ -> ຫ້າມທັບຄ່າ
const TARGET_USER_ID_ROUTES = new Set([
  "/api/admin/update-status",
  "/api/admin/update-user-role",
  "/api/admin/delete-user",
  "/api/admin/reset-password",
]);

function base64UrlFromBytes(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// OTP ລືມລະຫັດຜ່ານ: ຕົວເລກ 6 ໂຕ (000000-999999). ໃຊ້ rejection sampling ເພື່ອບໍ່ໃຫ້ມີ modulo bias
function generateResetCode() {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 1000000) * 1000000;
  let n;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
  return String(n % 1000000).padStart(6, "0");
}
// ຮັບ OTP ທີ່ user ພິມ (ອາດມີຍະຫວ່າງ/ຂີດ) ແລ້ວເຫຼືອສະເພາະຕົວເລກ — ຕ້ອງຄົບ 6 ໂຕ ຖ້າບໍ່ຄົບຈະຄືນຄ່າວ່າງ
function normalizeResetCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
}

function unauthorized(message, code, status) {
  return Response.json({ error: message, code }, { status });
}

// ລົບຮູບ (object) ອອກຈາກ R2 bucket "PHOTOS" ແບບ best-effort:
// - keys ອາດຈະມີຄ່າ null/undefined (ຊ່ອງທີ່ບໍ່ໄດ້ຖ່າຍຮູບ) -> filter ອອກກ່ອນ
// - ຖ້າລົບ R2 fail (ເຊັ່ນ key ບໍ່ມີຢູ່ແລ້ວ/network) ຈະບໍ່ throw ຂຶ້ນໄປ ເພື່ອບໍ່ໃຫ້ການລົບແຖວໃນ D1
//   (ທີ່ສຳເລັດໄປແລ້ວ) ກາຍເປັນ error response ທັງທີ່ຂໍ້ມູນຫຼັກຖືກລົບຮຽບຮ້ອຍແລ້ວ
async function deleteR2Photos(env, keys) {
  const validKeys = (keys || []).filter((k) => !!k);
  if (validKeys.length === 0 || !env.PHOTOS) return;
  await Promise.all(
    validKeys.map((key) =>
      env.PHOTOS.delete(key).catch((err) => {
        console.error(`ລົບຮູບໃນ R2 ບໍ່ສຳເລັດ (key: ${key}):`, err);
      })
    )
  );
}

// ==========================================================================
// ຮູບຖ່າຍ (R2): ກວດ + ບັນທຶກຮູບຢ່າງປອດໄພ
// - ຮັບສະເພາະ data URL ຂອງຮູບ JPEG/PNG/WebP ຂະໜາດບໍ່ເກີນ MAX_PHOTO_BYTES
// - ຊະນິດໄຟລ໌ (Content-Type) ຕັດສິນຈາກ magic bytes ຂອງໄຟລ໌ຈິງ ບໍ່ເຊື່ອຄ່າທີ່ client ສົ່ງມາ
//   (ກັນການອັບໂຫລດ text/html ເຂົ້າ R2 ແລ້ວມາເປີດເປັນໜ້າເວັບຜ່ານ /api/photo)
// ==========================================================================
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// ຮູບຖ່າຍຕອນຮັບຕູ້ (ລິ້ງເຊັນຮັບຕູ້ຕ່າງແຂວງ): ຢ່າງໜ້ອຍ 1 ຮູບ, ສູງສຸດ 5 ຮູບ — ເກັບ key ເປັນ JSON array ໃນ ship_trip_receipts.recv_photos
const RECV_PHOTO_MAX = 5;
function parseRecvPhotoKeys(v) {
  try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a.filter((k) => typeof k === "string" && k) : []; } catch (e) { return []; }
}

function sniffImageType(b) {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") throw new Error("INVALID_PHOTO");
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !/^data:image\/[a-z0-9.+-]+;base64$/i.test(dataUrl.slice(0, comma))) throw new Error("INVALID_PHOTO");
  const base64 = dataUrl.slice(comma + 1);
  if (base64.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 8) throw new Error("INVALID_PHOTO");
  let bytes;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch (e) {
    console.error("line 1238", e);
    throw new Error("INVALID_PHOTO");
  }
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) throw new Error("INVALID_PHOTO");
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new Error("INVALID_PHOTO");
  return { bytes, contentType };
}

// ອັບໂຫລດຫຼາຍຮູບພ້ອມກັນ: entries = [[dataUrl | null, key], ...] -> ຄືນ array ຂອງ key (null ຖ້າບໍ່ມີຮູບ)
// ຖ້າຮູບໃດຜິດ/ອັບໂຫລດບໍ່ສຳເລັດ ຈະລຶບຮູບທີ່ອັບໄປແລ້ວອອກ (ບໍ່ໃຫ້ຄ້າງເປັນຂີ້ເຫຍື້ອໃນ R2) ແລ້ວ throw
async function savePhotosToR2(env, entries) {
  const decoded = entries.map(([dataUrl]) => (dataUrl ? decodeImageDataUrl(dataUrl) : null)); // ກວດທຸກຮູບກ່ອນ ຄ່ອຍອັບ
  const results = await Promise.allSettled(
    decoded.map((img, i) => (img
      ? env.PHOTOS.put(entries[i][1], img.bytes, { httpMetadata: { contentType: img.contentType } })
      : Promise.resolve(null)))
  );
  const savedKeys = entries.map(([, key], i) => (decoded[i] && results[i].status === "fulfilled" ? key : null));
  const failed = results.find((r) => r.status === "rejected");
  if (failed) {
    await deleteR2Photos(env, savedKeys);
    throw failed.reason;
  }
  return savedKeys;
}

function photoErrorResponse(e) {
  if (e && e.message === "INVALID_OWNER_DOC") {
    return Response.json({ error: "ກະລຸນາເລືອກຊະນິດເອກະສານເຈົ້າຂອງຮ້ານ (ບັດປະຈຳໂຕ / Passport / ໃບທະບຽນວິສາຫະກິດ / ສຳມະໂນຄົວ)" }, { status: 400 });
  }
  if (e && e.message === "INVALID_PHOTO") {
    return Response.json({ error: "ຮູບພາບບໍ່ຖືກຕ້ອງ (ຮອງຮັບ JPEG/PNG/WebP ຂະໜາດບໍ່ເກີນ 5MB)" }, { status: 400 });
  }
  return null;
}

// ==========================================================================
// Cooler Master Data (ຂໍ້ມູນຕູ້ແຊ່ທົ່ວປະເທດ) — ຕາຕະລາງ cooler_master ແຍກຈາກ warehouse_stock/assets
// - ຄົ້ນຫາ/ສະແກນ QR/Serial/CapEx -> ສະແດງຂໍ້ມູນ master + "ຕຳແໜ່ງໃນລະບົບ" (ສາງ/Asset Tracking/ຕູ້ໃໝ່/Event/ສະສາງ)
// - Admin Import ເປັນ batch (ແບ່ງສົ່ງເທື່ອລະ ~40 ແຖວ) ແລະ upsert ຕາມ QR -> Serial -> CapEx
// ==========================================================================
function cmNorm(v) {
  return String(v == null ? "" : v).trim().toUpperCase();
}
function cmClean(v, max = 300) {
  const t = String(v == null ? "" : v).trim();
  return t ? t.slice(0, max) : null;
}
function cmLikeEscape(v) {
  return String(v).replace(/[\\%_]/g, (c) => "\\" + c);
}

// ===== Manage Lost Cooler Master Data (Admin) =====
// ຕູ້ທີ່ຢູ່ໃນ Cooler Master (ຕາມຮ້ານ) ແຕ່ຫາໂຕຈິງບໍ່ເຫັນ -> pending_smc (Pending SMC MDE; ເຄີຍມີ "suspected" ແຍກ ແຕ່ລວມເຂົ້າເປັນອັນດຽວກັນແລ້ວ - 'suspected' ຍັງຢູ່ໃນລາຍການລຸ່ມນີ້ເພື່ອຮອງຮັບແຖວເກົ່າກ່ອນຮັນ migration) -> verifying (Pending DSM ຢືນຢັນ) -> confirmed_lost (ຂັ້ນສຸດທ້າຍ; ໃນ Master ຕູ້ຈະຢູ່ສາງ "Lost cooler warehouse") | found  (excluded ເປັນສະຖານະເກົ່າ ບໍ່ໃຊ້ແລ້ວ)
const LOST_ACTIVE = ["suspected", "pending_smc", "verifying", "confirmed_lost"];
const LOST_EDITABLE = ["suspected", "pending_smc", "verifying", "confirmed_lost", "found"]; // excluded ຕັ້ງໄດ້ສະເພາະຜ່ານ /exclude
// ຂໍ້ມູນລາຍງານຈາກແຖວ Cooler Master: Village = ຖັນ address; Channel/Grade/Lat/Long/Team/MDE/DSM/FSM = ຖັນຂອງ Master
// (ແຖວເກົ່າທີ່ເຄີຍ Import ກ່ອນມີຖັນເຫຼົ່ານີ້ ຄ່າຈະຢູ່ໃນ extra_json -> ໃຊ້ເປັນ fallback)
function lostMasterExtras(m) {
  let ex = {};
  try { ex = m && m.extra_json ? JSON.parse(m.extra_json) || {} : {}; } catch (_) { ex = {}; }
  const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9\u0E80-\u0EFF]/g, "");
  const map = {};
  for (const [k, v] of Object.entries(ex)) map[norm(k)] = v;
  const g = (...names) => { for (const n of names) { const v = map[n]; if (v != null && String(v).trim()) return String(v).trim(); } return null; };
  const col = (v) => (v != null && String(v).trim() ? String(v).trim() : null);
  m = m || {};
  return {
    village: col(m.address) || g("village", "ບ້ານ"),
    channel: col(m.channel) || g("channel"), grade: col(m.grade) || g("grade"),
    lat_position: col(m.lat_position) || g("latposition", "lat", "latitude"),
    long_position: col(m.long_position) || g("longposition", "long", "lng", "longitude"),
    dsm: col(m.dsm) || g("dsm"), fsm: col(m.fsm) || g("fsm"), mde: col(m.mde) || g("mde"), team: col(m.team) || g("team"),
  };
}
function lostLogStmt(env, lostId, action, fromStatus, toStatus, note, actor) {
  return env.DB.prepare(
    "INSERT INTO lost_cooler_logs (lost_id, action, from_status, to_status, note, actor) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(lostId, action, fromStatus || null, toStatus || null, note || null, actor || null);
}

// ຕູ້ທີ່ Cooler Master ເກັບໄວ້ໃນ outlet/ສາງ "Lost cooler warehouse" = ຕູ້ທີ່ຢືນຢັນສູນຫາຍແລ້ວ
const LOST_WH_CODE = "LOST-COOLER-WH";
const LOST_WH_NAME = "Lost cooler warehouse";
function lostIsWarehouse(m) {
  const t = String((m && m.outlet_name) || "") + " " + String((m && m.outlet_code) || "");
  return /lostcooler/.test(t.toLowerCase().replace(/[^a-z0-9]/g, ""));
}
// Team ຂອງຕູ້ສູນຫາຍ: ຖ້າບໍ່ໄດ້ປ້ອນ ໃຫ້ດຶງຈາກ MDE Code ເອງ - ໃຊ້ Team ໃນ MDE List ກ່ອນ, ຖ້າບໍ່ພົບໃຫ້ອ່ານຈາກຮູບແບບລະຫັດ (MDE-A1 -> A)
function lostTeamFromMdeCode(code) {
  const m = /^MDE[\s_\-]*([A-Za-z]+)/i.exec(String(code == null ? "" : code).trim());
  return m ? m[1].toUpperCase() : null;
}
async function lostTeamMap(env, codes) {
  const map = new Map();
  const uniq = [...new Set((codes || []).map((c) => String(c == null ? "" : c).trim().toUpperCase()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 90) {
    const part = uniq.slice(i, i + 90);
    try {
      const r = await env.DB.prepare(
        `SELECT UPPER(TRIM(mde_code)) AS c, team FROM mde_list WHERE UPPER(TRIM(mde_code)) IN (${part.map(() => "?").join(",")})`
      ).bind(...part).all();
      for (const row of (r.results || [])) if (row.team) map.set(row.c, row.team);
    } catch (_) { /* ຄົ້ນຫາ Team ບໍ່ສຳເລັດ - ໃຊ້ການອ່ານຈາກຮູບແບບລະຫັດແທນ */ }
  }
  return map;
}
function lostTeamFor(map, code) {
  if (!code) return null;
  return map.get(String(code).trim().toUpperCase()) || lostTeamFromMdeCode(code);
}

// ຄິດສະຖິຕິ Cooler Master ໃໝ່ ແລ້ວເກັບໃນ cache (scan ເທື່ອດຽວ ຕອນ Import ຈົບ/ລຶບ)
async function cmRefreshStats(env) {
  const [tot, prov] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n, MAX(updated_at) AS last_updated FROM cooler_master"),
    env.DB.prepare("SELECT province, COUNT(*) AS n FROM cooler_master WHERE province IS NOT NULL AND province != '' GROUP BY province ORDER BY province"),
  ]);
  const t = (tot.results && tot.results[0]) || { n: 0, last_updated: null };
  const row = { total: t.n || 0, last_updated: t.last_updated || null, provinces_json: JSON.stringify(prov.results || []) };
  try {
    await env.DB.prepare(
      `INSERT INTO cooler_master_stats (id, total, last_updated, provinces_json, refreshed_at) VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET total = excluded.total, last_updated = excluded.last_updated,
         provinces_json = excluded.provinces_json, refreshed_at = CURRENT_TIMESTAMP`
    ).bind(row.total, row.last_updated, row.provinces_json).run();
  } catch (e) { console.error("cmRefreshStats cache write", e); }
  return row;
}

// ຫາ "ຕຳແໜ່ງໃນລະບົບ" ຂອງຊຸດລະຫັດ (QR/Serial/CapEx) ຈາກຕາຕະລາງທີ່ມີຢູ່ແລ້ວ ເຊິ່ງເປັນ array ຂອງ prepared statements
function cmLocationStatements(env, codes) {
  const list = [...new Set(codes.map(cmNorm).filter(Boolean))];
  if (!list.length) return null;
  const ph = list.map(() => "?").join(",");
  const b3 = [...list, ...list, ...list];
  const cond = (q, sn, cx) => `(${q} COLLATE NOCASE IN (${ph}) OR ${sn} COLLATE NOCASE IN (${ph}) OR ${cx} COLLATE NOCASE IN (${ph}))`;
  return [
    env.DB.prepare(
      `SELECT ws.id, ws.status, ws.cooler_status, ws.updated_at, w.name AS warehouse_name, w.province AS warehouse_province
         FROM warehouse_stock ws JOIN wh_warehouses w ON w.id = ws.warehouse_id
        WHERE ${cond("ws.qr_code", "ws.serial_number", "ws.capex")} ORDER BY ws.updated_at DESC LIMIT 3`
    ).bind(...b3),
    env.DB.prepare(
      `SELECT id, tracking_no, outlet_code, outlet_name, doc_type, status, delivered_at, last_update
         FROM assets WHERE ${cond("qr_code", "serial_number", "capex")} ORDER BY last_update DESC LIMIT 3`
    ).bind(...b3),
    env.DB.prepare(
      `SELECT id, status, ship_province, ship_warehouse, received_at, trip_id,
              COALESCE(received_at, trip_scanned_at, shipped_at, confirmed_at, created_at) AS updated_at
         FROM new_coolers WHERE ${cond("qr_code", "serial_number", "capex")} ORDER BY id DESC LIMIT 2`
    ).bind(...b3),
    env.DB.prepare(
      `SELECT id, event_name, event_location, taken_date, expected_return_date
         FROM cooler_events WHERE returned = 0 AND ${cond("qr_code", "serial_number", "capex")} ORDER BY id DESC LIMIT 2`
    ).bind(...b3),
    env.DB.prepare(
      `SELECT id, reason, writeoff_date, status
         FROM cooler_writeoffs WHERE ${cond("qr_code", "serial_number", "capex")} ORDER BY id DESC LIMIT 2`
    ).bind(...b3),
  ];
}
function cmLocationsFromBatch(rs) {
  const rows = (i) => (rs[i] && rs[i].results) || [];
  return {
    warehouse_stock: rows(0),
    assets: rows(1),
    new_coolers: rows(2),
    events: rows(3),
    writeoffs: rows(4),
  };
}

// ==========================================================================
// ກວດນັບສາງປະຈຳເດືອນ (Stock Count)
// - ເລີ່ມຮອບ: ຖ່າຍ snapshot ສະຕັອກທີ່ "ຢູ່ໃນສາງ" ຂອງສາງນັ້ນ (expected = 1, result = 'pending')
// - ສະແກນ QR/Serial/CapEx: ພົບໃນ snapshot -> 'found'; ບໍ່ຢູ່ໃນ snapshot ແຕ່ມີໃນລະບົບ -> 'extra'
// - ປິດຮອບ: ລາຍການທີ່ຍັງ 'pending' ຖືກບັນທຶກເປັນ 'missing' ແລ້ວລັອກຮອບ (ບໍ່ແກ້ໄຂສະຕັອກອັດຕະໂນມັດ)
// ==========================================================================
function currentLaoPeriod() {
  // ເດືອນປັດຈຸບັນຕາມເວລາລາວ (UTC+7) ຮູບແບບ YYYY-MM
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

const STOCK_COUNT_SUMMARY_SQL = `
  SELECT c.*, w.code AS warehouse_code, w.name AS warehouse_name,
    (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id = c.id AND i.expected = 1) AS expected_count,
    (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id = c.id AND i.result = 'found') AS found_count,
    (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id = c.id AND i.result = 'pending') AS pending_count,
    (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id = c.id AND i.result = 'missing') AS missing_count,
    (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id = c.id AND i.result = 'extra') AS extra_count
  FROM stock_counts c
  JOIN wh_warehouses w ON w.id = c.warehouse_id`;

// ແນບສະຖານະ "ເອກະສານ" ໃຫ້ແຕ່ລະ Asset ເພື່ອສະແດງ badge ໃນ Asset Tracking / ປະຫວັດການຈັດສົ່ງ
//   loan_state          : 'completed' = ໃບສັນຍາຢືມເຊັນແລ້ວ (ມີເອກະສານ) | 'draft' = ອອກແລ້ວແຕ່ຍັງບໍ່ເຊັນ | 'none' = ຍັງບໍ່ໄດ້ອອກໃບ
//   delivery_doc_state  : ສະເພາະ Asset ທີ່ຈັດສົ່ງສຳເລັດແລ້ວ - 'with_doc' = ມີຮູບເອກະສານ (ຢືນຢັນປົກກະຕິ) | 'no_doc' = ບໍ່ມີຮູບເອກະສານ (ລາຍງານແບບບໍ່ມີເອກະສານ) | null = ຍັງບໍ່ທັນຈັດສົ່ງ
// ສະຖານະໃບ -> loan_state: completed | awaiting_dsm | draft (ຮັກສາສະຖານະທີ່ "ສູງກວ່າ" ຖ້າ Asset ມີຫຼາຍໃບ)
function contractStateOf(status, cur) {
  const rank = { draft: 0, awaiting_dsm: 1, completed: 2 };
  const st = status === "completed" ? "completed" : (status === "awaiting_dsm" ? "awaiting_dsm" : "draft");
  return cur && rank[cur] > rank[st] ? cur : st;
}
async function attachDocStates(env, assets) {
  const list = assets || [];
  if (!list.length) return list;
  const { results: loanRows } = await env.DB.prepare(
    "SELECT asset_id, status FROM loan_contracts WHERE asset_id IS NOT NULL"
  ).all();
  const loanByAsset = new Map();
  for (const c of (loanRows || [])) {
    const cur = loanByAsset.get(c.asset_id);
    // ຕໍ່ 1 Asset: completed > awaiting_dsm (MDE ເຊັນແລ້ວ ລໍຖ້າ DSM) > draft
    if (cur !== "completed") loanByAsset.set(c.asset_id, contractStateOf(c.status, cur));
  }

  // Asset doc_type "ເກັບຄືນສາງ": ເອກະສານຂອງມັນຄື "ໃບເກັບຕູ້ເຂົ້າສາງ (T-)" (cancel_contracts) ບໍ່ແມ່ນໃບສັນຍາຢືມ
  // -> ໃຊ້ສະຖານະຈາກ cancel_contracts ແທນ ແລະ ໝາຍ contract_kind = 'cancel' ໃຫ້ໜ້າເວັບສະແດງ badge/ປຸ່ມຖືກປະເພດ
  const cancelByAsset = new Map();
  if (list.some((a) => a.doc_type === RETURN_TO_WAREHOUSE_DOC_TYPE)) {
    const { results: cancelRows } = await env.DB.prepare(
      "SELECT asset_id, status FROM cancel_contracts WHERE asset_id IS NOT NULL"
    ).all();
    for (const c of (cancelRows || [])) {
      const cur = cancelByAsset.get(c.asset_id);
      if (cur !== "completed") cancelByAsset.set(c.asset_id, contractStateOf(c.status, cur));
    }
  }

  return list.map((a) => {
    const isCancel = a.doc_type === RETURN_TO_WAREHOUSE_DOC_TYPE;
    return {
      ...a,
      contract_kind: isCancel ? "cancel" : "loan",
      loan_state: (isCancel ? cancelByAsset : loanByAsset).get(a.id) || "none",
      delivery_doc_state: a.status === "ສຳເລັດ" ? (a.delivery_photo_document ? "with_doc" : "no_doc") : null,
    };
  });
}

// ສາງ "ຮ້ານຄ້າ" - ສາງຈຳລອງທີ່ໃຊ້ສະແດງວ່າຕູ້ຢູ່ຮ້ານລູກຄ້າແລ້ວ (Admin ສ້າງໃນໜ້າຈັດການສາງ ດ້ວຍຊື່ນີ້ຕົງໆ)
// ເມື່ອຈັດສົ່ງສຳເລັດ ສະຕັອກຈະຖືກຍ້າຍມາຢູ່ສາງນີ້; ຖ້າຍັງບໍ່ໄດ້ສ້າງສາງນີ້ ລະບົບຈະບໍ່ຍ້າຍ (ສາງເດີມຄືເກົ່າ)
const OUTLET_WAREHOUSE_NAME = "ຮ້ານຄ້າ";

async function getOutletWarehouseId(env) {
  const row = await env.DB.prepare(
    "SELECT id FROM wh_warehouses WHERE name = ? AND active = 1 ORDER BY id ASC LIMIT 1"
  ).bind(OUTLET_WAREHOUSE_NAME).first();
  return row ? row.id : null;
}

// ສາງ "ຕ່າງແຂວງ" - ສາງຈຳລອງ (Admin ສ້າງໃນໜ້າຈັດການສາງ ດ້ວຍຊື່ນີ້ຕົງໆ) ໃຊ້ສະແດງວ່າຕູ້ຖືກສົ່ງໄປຕ່າງແຂວງແລ້ວ
// ເມື່ອຢືນຢັນ "ລົດອອກ" ຕູ້ຈາກສາງໃນຖ້ຽວຈະຖືກຍ້າຍມາຢູ່ສາງນີ້; ຖ້າຍັງບໍ່ໄດ້ສ້າງສາງນີ້ ລະບົບຈະບໍ່ຍ້າຍ (ສາງເດີມຄືເກົ່າ)
const PROVINCE_WAREHOUSE_NAME = "ຕ່າງແຂວງ";

async function getProvinceWarehouseId(env) {
  const row = await env.DB.prepare(
    "SELECT id FROM wh_warehouses WHERE name = ? AND active = 1 ORDER BY id ASC LIMIT 1"
  ).bind(PROVINCE_WAREHOUSE_NAME).first();
  return row ? row.id : null;
}

// ຕອນຕູ້ກັບຄືນສາງ: ຖ້າປັດຈຸບັນຢູ່ສາງ "ຮ້ານຄ້າ" ໃຫ້ຫາ "ສາງເດີມ" ຈາກປະຫວັດ (ຕອນຍ້າຍອອກ old_warehouse_id ຖືກບັນທຶກໄວ້)
// ຖ້າຫາບໍ່ພົບ/ສາງເດີມຖືກປິດແລ້ວ -> ໃຊ້ສາງຫຼັກ; ຖ້າບໍ່ໄດ້ຢູ່ສາງ "ຮ້ານຄ້າ" -> ຢູ່ສາງເດີມ
async function resolveReturnWarehouseId(env, stock) {
  // ສາງຈຳລອງ: "ຮ້ານຄ້າ" ແລະ "ຕ່າງແຂວງ" — ຖ້າຕູ້ຢູ່ສາງໃດໜຶ່ງໃນນີ້ ຕ້ອງຫາ "ສາງເດີມ" ກັບຄືນ
  const outletWhId = await getOutletWarehouseId(env);
  const provWhId = await getProvinceWarehouseId(env);
  const virtualIds = [outletWhId, provWhId].filter((v) => v);
  if (!virtualIds.length || !virtualIds.includes(stock.warehouse_id)) return stock.warehouse_id;
  const ph = virtualIds.map(() => "?").join(",");
  const prev = await env.DB.prepare(
    `SELECT h.old_warehouse_id AS id FROM warehouse_stock_history h
       JOIN wh_warehouses w ON w.id = h.old_warehouse_id AND w.active = 1
      WHERE h.stock_id = ? AND h.old_warehouse_id IS NOT NULL AND h.old_warehouse_id NOT IN (${ph})
      ORDER BY h.id DESC LIMIT 1`
  ).bind(stock.id, ...virtualIds).first();
  if (prev) return prev.id;
  const main = await env.DB.prepare(
    `SELECT id FROM wh_warehouses WHERE active = 1 AND id NOT IN (${ph}) ORDER BY is_main DESC, id ASC LIMIT 1`
  ).bind(...virtualIds).first();
  return main ? main.id : stock.warehouse_id;
}

// ຈອງສະຕັອກຕອນອະນຸມັດຄຳຂໍ: 'in_warehouse' -> 'reserved' (ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ)
// ກັນລາຍການດຽວກັນຖືກອະນຸມັດຊ້ຳ ແຕ່ຍັງບໍ່ນັບເປັນ "ອອກໄປຮ້ານແລ້ວ" ຈົນກວ່າຈະຈັດສົ່ງສຳເລັດຈິງ
// ບໍ່ throw error ຖ້າຫາບໍ່ພົບ
async function markWarehouseStockReserved(env, { qr_code, serial_number }, actorEmail, note) {
  try {
    let stock = null;
    if (qr_code) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(qr_code).first();
    }
    if (!stock && serial_number) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(serial_number).first();
    }
    if (!stock || stock.status !== "in_warehouse") return; // ຈອງໄດ້ສະເພາະລາຍການທີ່ຢູ່ໃນສາງ

    await env.DB.prepare(
      "UPDATE warehouse_stock SET status = 'reserved', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(stock.id).run();

    await env.DB.prepare(
      `INSERT INTO warehouse_stock_history
         (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
       VALUES (?, ?, NULL, 'update', ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`
    ).bind(
      stock.id, stock.warehouse_id, stock.cooler_brand, stock.cooler_type, stock.cooler_model,
      stock.qr_code, stock.serial_number, stock.capex, stock.status, actorEmail || null, note || null
    ).run();
  } catch (e) {
    console.error("line 1413", e);
    // ບໍ່ໃຫ້ຂັ້ນຕອນນີ້ລົ້ມແລ້ວກະທົບການອະນຸມັດຫຼັກ
  }
}

// ເຊື່ອມຕໍ່ "ສະຕ໋ອກສາງ" (warehouse_stock) ກັບການຈັດສົ່ງ asset ອອກຮ້ານ
// ເວລາ asset ຈັດສົ່ງສຳເລັດ (ຜ່ານ /api/asset-delivery/confirm ຫຼື /api/no-doc-delivery) ໃຫ້ຄົ້ນຫາ
// ລາຍການໃນ warehouse_stock ທີ່ QR/Serial ກົງກັນ ແລ້ວປ່ຽນ status ເປັນ 'outlet' ໃຫ້ອັດຕະໂນມັດ
// (ບັນທຶກລົງ warehouse_stock_history ນຳ ເພື່ອໃຫ້ໂຊວ໌ຢູ່ໃນປະຫວັດ Asset ວ່າອອກຈາກສາງແລ້ວ)
// ບໍ່ throw error ຖ້າຫາບໍ່ພົບ - ບໍ່ແມ່ນທຸກ asset ຈະຖືກຕິດຕາມຢູ່ໃນລະບົບສະຕ໋ອກສາງ
async function markWarehouseStockDeliveredToOutlet(env, { qr_code, serial_number }, actorEmail, note) {
  try {
    let stock = null;
    if (qr_code) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(qr_code).first();
    }
    if (!stock && serial_number) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(serial_number).first();
    }
    if (!stock || stock.status === "outlet") return; // ບໍ່ພົບ ຫຼື ອອກໄປແລ້ວ - ບໍ່ຕ້ອງເຮັດຫຍັງຕໍ່

    // ຈັດສົ່ງສຳເລັດ -> ຍ້າຍໄປສາງ "ຮ້ານຄ້າ" (ຖ້າມີ) ແລະ ບັນທຶກສາງເດີມໄວ້ໃນ old_warehouse_id ເພື່ອໃຊ້ຕອນເກັບຄືນ
    const outletWhId = await getOutletWarehouseId(env);
    const newWhId = outletWhId || stock.warehouse_id;
    const oldWhId = newWhId !== stock.warehouse_id ? stock.warehouse_id : null;

    await env.DB.prepare(
      "UPDATE warehouse_stock SET status = 'outlet', warehouse_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(newWhId, stock.id).run();

    await env.DB.prepare(
      `INSERT INTO warehouse_stock_history
         (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
       VALUES (?, ?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, 'outlet', ?, ?)`
    ).bind(
      stock.id, newWhId, oldWhId, stock.cooler_brand, stock.cooler_type, stock.cooler_model,
      stock.qr_code, stock.serial_number, stock.capex, stock.status, actorEmail || null, note || null
    ).run();
  } catch (e) {
    console.error("line 1455", e);
    // ບໍ່ໃຫ້ຂັ້ນຕອນນີ້ລົ້ມແລ້ວກະທົບການຢືນຢັນຈັດສົ່ງຫຼັກ
  }
}

// ສະແກນຕູ້ອອກຈາກສາງຂຶ້ນລົດ: 'in_warehouse' / 'reserved' -> 'on_truck' (ຢູ່ເທິງລົດ ກຳລັງເດີນທາງໄປຮ້ານ)
// ສາງເດີມຄືເກົ່າ (ຍັງບໍ່ຍ້າຍໄປສາງ "ຮ້ານຄ້າ" ຈົນກວ່າຈະຈັດສົ່ງສຳເລັດ) — ບໍ່ throw error ບໍ່ໃຫ້ກະທົບຂັ້ນຕອນຫຼັກ
async function markWarehouseStockOnTruck(env, { qr_code, serial_number }, actorEmail, note) {
  try {
    let stock = null;
    if (qr_code) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(qr_code).first();
    }
    if (!stock && serial_number) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(serial_number).first();
    }
    if (!stock || (stock.status !== "in_warehouse" && stock.status !== "reserved")) return;
    await env.DB.prepare(
      "UPDATE warehouse_stock SET status = 'on_truck', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(stock.id).run();
    await env.DB.prepare(
      `INSERT INTO warehouse_stock_history
         (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
       VALUES (?, ?, NULL, 'update', ?, ?, ?, ?, ?, ?, ?, 'on_truck', ?, ?)`
    ).bind(
      stock.id, stock.warehouse_id, stock.cooler_brand, stock.cooler_type, stock.cooler_model,
      stock.qr_code, stock.serial_number, stock.capex, stock.status, actorEmail || null, note || null
    ).run();
  } catch (e) {
    console.error("markWarehouseStockOnTruck", e);
  }
}

// ຄູ່ກັນກັບ markWarehouseStockDeliveredToOutlet() ຂ້າງເທິງ — ໃຊ້ຕອນ "ລຶບ" Asset Tracking ອອກ
// (admin ລຶບລາຍການທີ່ອະນຸມັດ/ອອກໄປຮ້ານແລ້ວຜິດ) ໃຫ້ QR/Serial ດຽວກັນນັ້ນກັບຄືນເປັນ "ຢູ່ໃນສາງ" ອັດຕະໂນມັດ
// ບໍ່ແຕະຕ້ອງສະຕັອກທີ່ບໍ່ແມ່ນສະຖານະ 'outlet' ແລ້ວ (ເຊັ່ນ ຖືກສະສາງ/ໄປໃຊ້ Event ໄປແລ້ວ) ແລະ ບໍ່ throw error
async function restoreWarehouseStockToWarehouse(env, { qr_code, serial_number }, actorEmail, note) {
  try {
    let stock = null;
    if (qr_code) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(qr_code).first();
    }
    if (!stock && serial_number) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(serial_number).first();
    }
    if (!stock || (stock.status !== "outlet" && stock.status !== "reserved" && stock.status !== "on_truck")) return; // ບໍ່ພົບ ຫຼື ບໍ່ແມ່ນ "ຈອງແລ້ວ/ຢູ່ເທິງລົດ/ອອກໄປຮ້ານແລ້ວ" - ບໍ່ຕ້ອງເຮັດຫຍັງຕໍ່

    const backWhId = await resolveReturnWarehouseId(env, stock);
    const fromWhId = backWhId !== stock.warehouse_id ? stock.warehouse_id : null;

    await env.DB.prepare(
      "UPDATE warehouse_stock SET status = 'in_warehouse', warehouse_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(backWhId, stock.id).run();

    await env.DB.prepare(
      `INSERT INTO warehouse_stock_history
         (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
       VALUES (?, ?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, 'in_warehouse', ?, ?)`
    ).bind(
      stock.id, backWhId, fromWhId, stock.cooler_brand, stock.cooler_type, stock.cooler_model,
      stock.qr_code, stock.serial_number, stock.capex, stock.status, actorEmail || null, note || null
    ).run();
  } catch (e) {
    console.error("line 1493", e);
    // ບໍ່ໃຫ້ຂັ້ນຕອນນີ້ລົ້ມແລ້ວກະທົບການລຶບ Asset ຫຼັກ
  }
}

// ເຊື່ອມຕໍ່ "ສະຕ໋ອກສາງ" (warehouse_stock) ກັບໂມດູນ "ຕູ້ແຊ່ Event" (cooler_events)
// - direction = 'out'  : ເອົາຕູ້ໄປ Event -> ຖ້າ QR/Serial ກົງກັບສະຕັອກທີ່ "ຢູ່ໃນສາງ" ປ່ຽນເປັນ 'event' (ກຳລັງໃຊ້ງານ Event)
// - direction = 'back' : ເອົາຕູ້ກັບຄືນ    -> ຖ້າສະຕັອກເປັນ 'event' ປ່ຽນກັບເປັນ 'in_warehouse'
// ບັນທຶກລົງ warehouse_stock_history ນຳ. ບໍ່ແຕະຕ້ອງສະຕັອກທີ່ເປັນ outlet/write_off ແລະ ບໍ່ throw error
// (ບໍ່ແມ່ນທຸກຕູ້ໃນ Event ຈະຖືກຕິດຕາມຢູ່ໃນລະບົບສະຕ໋ອກສາງ)
async function syncWarehouseStockForEvent(env, { qr_code, serial_number }, direction, actorEmail, note) {
  try {
    let stock = null;
    if (qr_code) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(qr_code).first();
    }
    if (!stock && serial_number) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(serial_number).first();
    }
    if (!stock) return;

    const fromStatus = direction === "out" ? "in_warehouse" : "event";
    const toStatus = direction === "out" ? "event" : "in_warehouse";
    if (stock.status !== fromStatus) return;

    await env.DB.prepare(
      "UPDATE warehouse_stock SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(toStatus, stock.id).run();

    await env.DB.prepare(
      `INSERT INTO warehouse_stock_history
         (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
       VALUES (?, ?, NULL, 'update', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      stock.id, stock.warehouse_id, stock.cooler_brand, stock.cooler_type, stock.cooler_model,
      stock.qr_code, stock.serial_number, stock.capex, fromStatus, toStatus, actorEmail || null, note || null
    ).run();
  } catch (e) {
    console.error("line 1534", e);
    // ບໍ່ໃຫ້ຂັ້ນຕອນນີ້ລົ້ມແລ້ວກະທົບການບັນທຶກ Event ຫຼັກ
  }
}

// ລາຍງານຕູ້ແຊ່ສະສາງ (cooler_writeoffs) <-> ສະຕັອກສາງ (warehouse_stock)
const WRITEOFF_REASONS = { broken: "ຊຳລຸດເສຍຫາຍ", old: "ໝົດອາຍຸການໃຊ້ງານ", lost: "ສູນຫາຍ", other: "ອື່ນໆ" };

// ຫາລາຍການສະຕັອກຈາກ QR ກ່ອນ ແລ້ວຈຶ່ງ Serial (ຄືກັນກັບໂມດູນ Event)
async function findWarehouseStockByQrSerial(env, { qr_code, serial_number }) {
  let stock = null;
  if (qr_code) {
    stock = await env.DB.prepare(
      "SELECT s.*, w.name AS warehouse_name FROM warehouse_stock s LEFT JOIN wh_warehouses w ON w.id = s.warehouse_id WHERE s.qr_code = ? AND s.qr_code != '' ORDER BY s.updated_at DESC LIMIT 1"
    ).bind(qr_code).first();
  }
  if (!stock && serial_number) {
    stock = await env.DB.prepare(
      "SELECT s.*, w.name AS warehouse_name FROM warehouse_stock s LEFT JOIN wh_warehouses w ON w.id = s.warehouse_id WHERE s.serial_number = ? AND s.serial_number != '' ORDER BY s.updated_at DESC LIMIT 1"
    ).bind(serial_number).first();
  }
  return stock;
}

// ປ່ຽນສະຖານະສະຕັອກ + ບັນທຶກ warehouse_stock_history
async function setWarehouseStockStatus(env, stock, fromStatus, toStatus, actorEmail, note) {
  await env.DB.prepare("UPDATE warehouse_stock SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(toStatus, stock.id).run();
  await env.DB.prepare(
    `INSERT INTO warehouse_stock_history
       (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
     VALUES (?, ?, NULL, 'update', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    stock.id, stock.warehouse_id, stock.cooler_brand, stock.cooler_type, stock.cooler_model,
    stock.qr_code, stock.serial_number, stock.capex, fromStatus, toStatus, actorEmail || null, note || null
  ).run();
}

// Doc Type ທີ່ໝາຍວ່າເປັນການ "ເກັບຄືນສາງ" (ກົງກັນຂ້າມກັບການຈັດສົ່ງອອກຮ້ານ)
const RETURN_TO_WAREHOUSE_DOC_TYPE = "ເກັບຄືນສາງ";

// ອັບໂຫລດຮູບລາຍເຊັນ (ຖ້າມີສົ່ງມາໃນ body) ຂຶ້ນ R2 ແລ້ວອັບເດດ loan_contracts, ລຶບຮູບເກົ່າອອກ
// ໃຊ້ຮ່ວມກັນທັງຕອນ "ສ້າງໃໝ່ພ້ອມເຊັນຄັ້ງດຽວ" ແລະ ຕອນ "ແກ້ໄຂ/ຕື່ມລາຍເຊັນພາຍຫຼັງ"
async function applyLoanContractSignatures(env, id, row, body) {
  const sigSlots = ["mde", "admin", "outlet", "old_outlet"];
  const stamp = Date.now();
  const newKeys = {};
  const toUpload = [];
  for (const slot of sigSlots) {
    if (body[`sig_${slot}`]) {
      const key = `loan-contract/${id}/${slot}-${stamp}.png`;
      toUpload.push([body[`sig_${slot}`], key]);
      newKeys[slot] = key;
    }
  }
  const ownerDoc = planOwnerDocUpload("loan-contract", id, row, body, stamp, toUpload);
  if (!toUpload.length) return row;
  // savePhotosToR2 ອັບໂຫລດທັງໝົດ ຫຼື throw (ບໍ່ອັບແຕ່ບາງສ່ວນ) — ຖ້າສຳເລັດ key ທຸກອັນທີ່ສົ່ງໄປແມ່ນຖືກບັນທຶກແລ້ວ
  await savePhotosToR2(env, toUpload);
  const oldKeysToDelete = sigSlots.filter((s) => newKeys[s] && row[`sig_${s}`]).map((s) => row[`sig_${s}`]);
  if (ownerDoc && row.owner_doc_photo) oldKeysToDelete.push(row.owner_doc_photo);

  const sets = [];
  const vals = [];
  for (const slot of sigSlots) {
    if (newKeys[slot]) {
      sets.push(`sig_${slot} = ?`, `sig_${slot}_name = ?`, `sig_${slot}_at = CURRENT_TIMESTAMP`);
      vals.push(newKeys[slot], body[`sig_${slot}_name`] || null);
    }
  }
  if (ownerDoc) {
    sets.push("owner_doc_type = ?", "owner_doc_photo = ?", "owner_doc_at = CURRENT_TIMESTAMP");
    vals.push(ownerDoc.type, ownerDoc.key);
  }
  vals.push(id);
  await env.DB.prepare(`UPDATE loan_contracts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  if (oldKeysToDelete.length) await deleteR2Photos(env, oldKeysToDelete);

  let updated = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(id).first();
  // ເຊັນ MDE (ຜູ້ຂໍ) ແລ້ວ → ຖືວ່າໃບສັນຍາສຳເລັດ (Admin/ເຈົ້າຂອງຮ້ານ/ຮ້ານເກົ່າ ບໍ່ຕ້ອງເຊັນໃນລະບົບອີກ)
  // MDE ເຊັນແລ້ວ → ລໍຖ້າ DSM ເຊັນ (awaiting_dsm, ຍັງບໍ່ສ້າງ/ເປີດ PDF); DSM ເຊັນແລ້ວ (ຜ່ານລິ້ງ) → completed
  if (updated.sig_mde && updated.status !== "completed" && updated.status !== "awaiting_dsm") {
    const next = updated.sig_dsm ? "completed" : "awaiting_dsm";
    await env.DB.prepare("UPDATE loan_contracts SET status = ? WHERE id = ?").bind(next, id).run();
    updated.status = next;
    // ແຈ້ງເຕືອນ admin (ບໍ່ throw error ອອກໄປ)
    try {
      await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
        title: next === "completed" ? "ໃບສັນຍາຢືມເຊັນຄົບແລ້ວ" : "ໃບສັນຍາຢືມ ລໍຖ້າ DSM ເຊັນ",
        body: `${updated.doc_no || ''}\n${formatMdeOutletLine(updated.mde_code, '', updated.outlet_name)}`.trim(),
        url: next === "completed" ? "loanContract:docs" : "loanContract:queue",
      });
    } catch (e) { /* ບໍ່ຕ້ອງເຮັດຫຍັງ */ }
  }
  return updated;
}

// ຫາໃບສັນຍາຢືມ (loan_contracts) ທີ່ຜູກກັບ Asset ນີ້ — ໃຊ້ຕອນຈັດສົ່ງ: ມີໃບສັນຍາ -> ລາຍເຊັນລູກຄ້າໄປຢູ່ໃນໃບສັນຍາ, ບໍ່ມີ -> ເກັບໃນ assets
async function findLoanContractForAsset(env, asset) {
  if (!asset) return null;
  return await env.DB.prepare(
    `SELECT id, doc_no, status, sig_outlet FROM loan_contracts
     WHERE asset_id = ? OR (IFNULL(tracking_no, '') != '' AND tracking_no = ?)
     ORDER BY (status = 'completed') DESC, (status = 'awaiting_dsm') DESC, id DESC LIMIT 1`
  ).bind(asset.id, asset.tracking_no || "").first();
}

// ເຊື່ອມຕໍ່ "ສະຕ໋ອກສາງ" (warehouse_stock) ກັບການລາຍງານ "ເກັບຄືນສາງ" (ກົງກັນຂ້າມກັບ markWarehouseStockDeliveredToOutlet ຂ້າງເທິງ)
// ເວລາລາຍງານການຈັດສົ່ງທີ່ມີ doc_type = "ເກັບຄືນສາງ" ຖືກບັນທຶກ (ຜ່ານ /api/asset-delivery/confirm ຫຼື /api/no-doc-delivery)
// - ຖ້າ QR/Serial ກົງກັບລາຍການທີ່ມີຢູ່ແລ້ວໃນ warehouse_stock -> ປ່ຽນ status ກັບເປັນ 'in_warehouse'
// - ຖ້າ QR/Serial ນີ້ບໍ່ເຄີຍຖືກ track ຢູ່ໃນ warehouse_stock ມາກ່ອນ -> ສ້າງແຖວໃໝ່ເຂົ້າ warehouse_stock ໂດຍໃຊ້ຂໍ້ມູນ
//   Brand/Type/Model ຈາກ asset ທີ່ລາຍງານ ແລະ ໃສ່ໄວ້ໃນ "ສາງຫຼັກ" (wh_warehouses ທີ່ is_main = 1) ເປັນຄ່າເລີ່ມຕົ້ນ
//   (ຖ້າບໍ່ມີສາງຫຼັກ ຈະໃຊ້ສາງທີ່ active ອັນທຳອິດແທນ, ຖ້າບໍ່ມີສາງ active ເລີຍ -> ບໍ່ສ້າງ ຍ້ອນ warehouse_id ເປັນ NOT NULL)
// (ບັນທຶກລົງ warehouse_stock_history ນຳ ເພື່ອໃຫ້ໂຊວ໌ຢູ່ໃນປະຫວັດວ່າກັບຄືນສາງ/ຖືກສ້າງໃໝ່)
// ບໍ່ throw error ຖ້າມີບັນຫາ - ບໍ່ໃຫ້ຂັ້ນຕອນນີ້ລົ້ມແລ້ວກະທົບການຢືນຢັນຈັດສົ່ງຫຼັກ
async function markWarehouseStockReturnedToWarehouse(env, { qr_code, serial_number, cooler_brand, cooler_type, cooler_model, capex }, actorEmail, note) {
  try {
    let stock = null;
    if (qr_code) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(qr_code).first();
    }
    if (!stock && serial_number) {
      stock = await env.DB.prepare(
        "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
      ).bind(serial_number).first();
    }

    if (stock) {
      if (stock.status === "in_warehouse") return; // ຢູ່ໃນສາງແລ້ວ - ບໍ່ຕ້ອງເຮັດຫຍັງຕໍ່

      const backWhId = await resolveReturnWarehouseId(env, stock);
      const fromWhId = backWhId !== stock.warehouse_id ? stock.warehouse_id : null;

      await env.DB.prepare(
        "UPDATE warehouse_stock SET status = 'in_warehouse', warehouse_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(backWhId, stock.id).run();

      await env.DB.prepare(
        `INSERT INTO warehouse_stock_history
           (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
         VALUES (?, ?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, 'in_warehouse', ?, ?)`
      ).bind(
        stock.id, backWhId, fromWhId, stock.cooler_brand, stock.cooler_type, stock.cooler_model,
        stock.qr_code, stock.serial_number, stock.capex, stock.status, actorEmail || null, note || null
      ).run();
      return;
    }

    // ບໍ່ພົບລາຍການເກົ່າ -> ສ້າງໃໝ່ເຂົ້າ warehouse_stock (ຕ້ອງມີ QR ຫຼື Serial ຢ່າງໜ້ອຍໜຶ່ງຢ່າງ ແລະ ຕ້ອງມີສາງໃຫ້ໃສ່)
    if (!qr_code && !serial_number) return;

    const targetWarehouse = await env.DB.prepare(
      "SELECT id FROM wh_warehouses WHERE active = 1 AND name NOT IN (?, ?) ORDER BY is_main DESC, id ASC LIMIT 1"
    ).bind(OUTLET_WAREHOUSE_NAME, PROVINCE_WAREHOUSE_NAME).first();
    if (!targetWarehouse) return; // ບໍ່ມີສາງ active ໃນລະບົບເລີຍ - ບໍ່ສາມາດສ້າງລາຍການໄດ້

    const insertResult = await env.DB.prepare(
      `INSERT INTO warehouse_stock (warehouse_id, cooler_brand, cooler_type, cooler_model, cooler_status, qr_code, serial_number, capex, status, notes)
       VALUES (?, ?, ?, ?, 'second_hand', ?, ?, ?, 'in_warehouse', ?)`
    ).bind(
      targetWarehouse.id, cooler_brand || '-', cooler_type || '-', cooler_model || null,
      qr_code || null, serial_number || null, capex || null, note || null
    ).run();

    await env.DB.prepare(
      `INSERT INTO warehouse_stock_history
         (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
       VALUES (?, ?, NULL, 'create', ?, ?, ?, ?, ?, ?, NULL, 'in_warehouse', ?, ?)`
    ).bind(
      insertResult.meta.last_row_id, targetWarehouse.id, cooler_brand || '-', cooler_type || '-', cooler_model || null,
      qr_code || null, serial_number || null, capex || null, actorEmail || null, note || null
    ).run();
  } catch (e) {
    console.error("line 1692", e);
    // ບໍ່ໃຫ້ຂັ້ນຕອນນີ້ລົ້ມແລ້ວກະທົບການຢືນຢັນຈັດສົ່ງຫຼັກ
  }
}

// ນະໂຍບາຍ: Team ແລະ MDE Code ຂອງແຕ່ລະ MDE ຈະບໍ່ປ່ຽນ, ສິ່ງທີ່ປ່ຽນເລື້ອຍໆແມ່ນ "ຊື່" (mde_name)
// -> ຊື່ປ່ຽນ ໝາຍຄວາມວ່າຄົນຮັບຜິດຊອບ MDE ນີ້ປ່ຽນໄປແລ້ວ ບໍ່ແມ່ນຄົນເດີມອີກຕໍ່ໄປ
// -> ບັນຊີ user ເດີມທີ່ຜູກກັບ mde_code ນີ້ຕ້ອງຖືກລຶບອອກ ບັງຄັບໃຫ້ຄົນໃໝ່ຕ້ອງສະໝັກບັນຊີໃໝ່ (ຄືກັນກັບ /api/admin/delete-user
//    ລວມທັງລົບ push_subscriptions/notifications ທີ່ພົວພັນ ເພື່ອບໍ່ໃຫ້ຄ້າງເປັນ orphan ໃນ D1)
// ກັນ QR Code / Serial Number / CapEx ຊໍ້າກັນ - ໃຊ້ຮ່ວມກັນລະຫວ່າງ warehouse_stock ແລະ assets
// ກວດຫາແຖວອື່ນ (id ບໍ່ຕົງກັບ excludeId) ໃນຕາຕະລາງທີ່ລະບຸ ທີ່ມີ qr_code/serial_number/capex ຄ່າດຽວກັນ (ບໍ່ຈຳກັດສາງ/ຮ້ານ)
// ຄືນຄ່າ error message ຖ້າພົບຊໍ້າ, ຫຼື null ຖ້າບໍ່ພົບ
async function findQrSerialCapexDuplicate(env, table, { qr_code, serial_number, capex }, excludeId, ignoreStatus) {
  const checks = [
    { field: "qr_code", label: "QR Code", value: (qr_code || "").trim() },
    { field: "serial_number", label: "Serial Number", value: (serial_number || "").trim() },
    { field: "capex", label: "CapEx", value: (capex || "").trim() },
  ];
  for (const c of checks) {
    if (!c.value) continue;
    // ignoreStatus: ບໍ່ນັບແຖວທີ່ມີສະຖານະນີ້ວ່າຊໍ້າ (ໃຊ້ກັບ table assets ເທົ່ານັ້ນ)
    const statusSql = ignoreStatus ? ` AND IFNULL(status, '') != ?` : "";
    const binds = [c.value];
    if (excludeId) binds.push(excludeId);
    if (ignoreStatus) binds.push(ignoreStatus);
    const row = await env.DB.prepare(
      `SELECT id FROM ${table} WHERE ${c.field} = ? AND ${c.field} != ''${excludeId ? " AND id != ?" : ""}${statusSql}`
    ).bind(...binds).first();
    if (row) return `${c.label} "${c.value}" ມີຢູ່ໃນລະບົບແລ້ວ (ຊໍ້າກັບລາຍການອື່ນ), ບໍ່ສາມາດບັນທຶກຊໍ້າກັນໄດ້`;
  }
  return null;
}

// ຫາຕູ້ໃນ new_coolers ຈາກ QR / Serial / CapEx ທີ່ສະແກນ ຫຼື ພິມ (ບໍ່ສົນຕົວພິມໃຫຍ່-ນ້ອຍ)
// ຖ້າບໍ່ພົບແບບກົງໆ ແລະ ຂໍ້ຄວາມທີ່ສະແກນຍາວ (ເຊັ່ນ URL) -> ແຍກເປັນຊິ້ນແລ້ວລອງທີລະຊິ້ນ. ລາຍການທີ່ຍັງ pending ຖືກຈັດລຳດັບກ່ອນ
// ເລກ Serial / CapEx ຊ້ຳແທ້ໆ -> ຕໍ່ທ້າຍອັດຕະໂນມັດ: Serial ເປັນ "-1", "-2"...; CapEx ເປັນ ".1", ".2"...
// ກວດຊ້ຳກັບ new_coolers (ຍົກເວັ້ນແຖວຕົນເອງ) + warehouse_stock + ຄ່າທີ່ໃຊ້ໄປແລ້ວໃນໄຟລ໌ດຽວກັນ (taken)
// CapEx ຂອງຕູ້ໃໝ່ມີຮູບແບບຄົງທີ່: <PREFIX>.<ເລກກາງ>.<SUFFIX> ເຊັ່ນ 21861.12345.SAL.LBC — ຜູ້ໃຊ້ກອກສະເພາະເລກກາງ ລະບົບຕື່ມໃຫ້
// (ຖ້າຕ້ອງການປ່ຽນ ໃຫ້ແກ້ຄ່າຄົງທີ່ 2 ໂຕນີ້ ແລະ NC_CAPEX_PREFIX / NC_CAPEX_SUFFIX ໃນ public/index.html ໃຫ້ຄືກັນ)
const NC_CAPEX_PREFIX = "21861";
const NC_CAPEX_SUFFIX = "SAL.LBC";
function ncBuildCapex(mid) {
  const m = String(mid === null || mid === undefined ? "" : mid).trim().replace(/^\.+|\.+$/g, "");
  if (!m) return "";
  return `${NC_CAPEX_PREFIX}.${m}.${NC_CAPEX_SUFFIX}`;
}
const NC_DEDUPE_SEP = { serial_number: "-", capex: "." };
async function ncIsTaken(env, field, value, selfId, taken) {
  const up = String(value).toUpperCase();
  if (taken && taken.has(up)) return true;
  const a = await env.DB.prepare(`SELECT id FROM new_coolers WHERE ${field} COLLATE NOCASE = ? AND id != ? LIMIT 1`).bind(up, selfId || 0).first();
  if (a) return true;
  const b = await env.DB.prepare(`SELECT id FROM warehouse_stock WHERE ${field} COLLATE NOCASE = ? LIMIT 1`).bind(up).first();
  return !!b;
}
// ຫາວ່າລະຫັດ Serial/CapEx ທີ່ຊ້ຳ ເປັນຂອງຕູ້ໜ່ວຍໃດ (ໃນ new_coolers ກ່ອນ, ແລ້ວຈຶ່ງ warehouse_stock) ເພື່ອສະແດງໃຫ້ຜູ້ໃຊ້ເບິ່ງ
async function ncFindOwner(env, field, value, selfId) {
  const up = String(value).toUpperCase();
  const a = await env.DB.prepare(
    `SELECT id, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, status FROM new_coolers WHERE ${field} COLLATE NOCASE = ? AND id != ? ORDER BY id DESC LIMIT 1`
  ).bind(up, selfId || 0).first();
  if (a) return { source: "new_coolers", ...a };
  const b = await env.DB.prepare(
    `SELECT id, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, status FROM warehouse_stock WHERE ${field} COLLATE NOCASE = ? ORDER BY id DESC LIMIT 1`
  ).bind(up).first();
  return b ? { source: "warehouse_stock", ...b } : null;
}
async function ncDedupeCode(env, field, value, selfId, taken) {
  if (!value || !(await ncIsTaken(env, field, value, selfId, taken))) return { value, changed: false };
  const sep = NC_DEDUPE_SEP[field];
  // ດຶງຄ່າທີ່ຊ້ຳທັງໝົດທີ່ຂຶ້ນຕົ້ນດ້ວຍ value+sep ໃນ 2 query (ໃຊ້ index) ແລ້ວຫາເລກທີ່ວ່າງໃນໜ່ວຍຄວາມຈຳ
  const like = String(value).toUpperCase().replace(/[\\%_]/g, (c) => "\\" + c) + sep.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const used = new Set();
  for (const table of ["new_coolers", "warehouse_stock"]) {
    const extra = table === "new_coolers" ? " AND id != ?2" : "";
    const stmt = env.DB.prepare(
      `SELECT UPPER(${field}) AS v FROM ${table} WHERE ${field} LIKE ?1 ESCAPE '\\'${extra} LIMIT 500`
    );
    const { results } = await (table === "new_coolers" ? stmt.bind(like, selfId || 0) : stmt.bind(like)).all();
    (results || []).forEach((r) => used.add(r.v));
  }
  for (let n = 1; n <= 200; n++) {
    const cand = `${value}${sep}${n}`;
    const up = cand.toUpperCase();
    if (!used.has(up) && !(taken && taken.has(up))) return { value: cand, changed: true };
  }
  throw new Error("DEDUPE_EXHAUSTED");
}

// ຫາເລກຕໍ່ທ້າຍທີ່ວ່າງ (Serial: -1, -2 ... / CapEx: .1, .2 ...) ໂດຍບໍ່ຕ້ອງມີຄ່າຊ້ຳກ່ອນ — ບັງຄັບໃສ່ເລກຕໍ່ທ້າຍສະເໝີ
async function ncPickSuffix(env, field, value, excludeId, taken) {
  const sep = NC_DEDUPE_SEP[field];
  const like = String(value).toUpperCase().replace(/[\\%_]/g, (c) => "\\" + c) + sep.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const used = new Set();
  for (const table of ["new_coolers", "warehouse_stock"]) {
    const extra = table === "new_coolers" ? " AND id != ?2" : "";
    const stmt = env.DB.prepare(`SELECT UPPER(${field}) AS v FROM ${table} WHERE ${field} LIKE ?1 ESCAPE '\\'${extra} LIMIT 500`);
    const { results } = await (table === "new_coolers" ? stmt.bind(like, excludeId || 0) : stmt.bind(like)).all();
    (results || []).forEach((r) => used.add(r.v));
  }
  for (let n = 1; n <= 200; n++) {
    const cand = `${value}${sep}${n}`;
    const up = cand.toUpperCase();
    if (!used.has(up) && !(taken && taken.has(up))) return cand;
  }
  throw new Error("DEDUPE_EXHAUSTED");
}
// ແກ້ Serial/CapEx ຊ້ຳ ຕາມກົດ:
//  - ຊ້ຳກັບຕູ້ທີ່ "ຢືນຢັນແລ້ວ/ຮັບເຂົ້າສາງ/ສົ່ງອອກ" ຫຼື ສະຕັອກສາງ -> ໃສ່ເລກຕໍ່ທ້າຍໃຫ້ຕູ້ທີ່ກຳລັງບັນທຶກ
//  - ຊ້ຳກັບຕູ້ທີ່ "ຍັງບໍ່ໄດ້ສະແກນ" (pending) ເທົ່ານັ້ນ -> ໃສ່ເລກຕໍ່ທ້າຍໃຫ້ຕູ້ທີ່ຍັງບໍ່ໄດ້ສະແກນນັ້ນ ຕູ້ທີ່ກຳລັງບັນທຶກຄົງຄ່າເດີມ
// ຄືນຄ່າສຸດທ້າຍຂອງຕູ້ທີ່ກຳລັງບັນທຶກ; notices = ຂໍ້ຄວາມແຈ້ງຜູ້ໃຊ້
async function ncResolveDup(env, field, value, selfId, taken, notices) {
  if (!value) return value;
  const label = { serial_number: "Serial Number", capex: "CapEx" }[field];
  const up = String(value).toUpperCase();
  const { results: nc } = await env.DB.prepare(
    `SELECT id, status, qr_code FROM new_coolers WHERE ${field} COLLATE NOCASE = ? AND id != ?`
  ).bind(up, selfId || 0).all();
  const stk = await env.DB.prepare(`SELECT id FROM warehouse_stock WHERE ${field} COLLATE NOCASE = ? LIMIT 1`).bind(up).first();
  const owners = nc || [];
  const settled = !!stk || owners.some((r) => r.status !== "pending") || (taken && taken.has(up));
  if (settled) {
    const nv = await ncPickSuffix(env, field, value, selfId, taken);
    taken.add(nv.toUpperCase());
    notices.push(`${label} ${value} ຊ້ຳກັບຕູ້ທີ່ຢືນຢັນ/ຮັບເຂົ້າສາງແລ້ວ → ຕູ້ນີ້ປ່ຽນເປັນ ${nv}`);
    return nv;
  }
  for (const o of owners) {
    const nv = await ncPickSuffix(env, field, value, selfId, taken);
    taken.add(nv.toUpperCase());
    await env.DB.prepare(`UPDATE new_coolers SET ${field} = ? WHERE id = ? AND status = 'pending'`).bind(nv, o.id).run();
    notices.push(`${label} ${value} ຊ້ຳກັບຕູ້ທີ່ຍັງບໍ່ໄດ້ສະແກນ (QR ${o.qr_code || "-"}) → ຕູ້ທີ່ຍັງບໍ່ໄດ້ສະແກນນັ້ນປ່ຽນເປັນ ${nv}`);
  }
  return value;
}

// ຄືກັບ findNewCoolerByCode ແຕ່ຄືນທຸກແຖວທີ່ກົງ (ສູງສຸດ 10) — ໃຊ້ຕອນ QR ຫາຍ ແລ້ວ Serial/CapEx ຊ້ຳຫຼາຍໜ່ວຍ ເພື່ອໃຫ້ຜູ້ໃຊ້ເລືອກເອງ
async function findNewCoolersAllByCode(env, code) {
  const q = String(code || "").trim();
  if (!q) return { rows: [], partial: false };
  const sql =
    `SELECT * FROM new_coolers
       WHERE (qr_code COLLATE NOCASE = ? AND qr_code != '')
          OR (serial_number COLLATE NOCASE = ? AND serial_number != '')
          OR (capex COLLATE NOCASE = ? AND capex != '')
       ORDER BY (status = 'pending') DESC, id DESC LIMIT 10`;
  let r = await env.DB.prepare(sql).bind(q, q, q).all();
  if (r.results && r.results.length) return { rows: r.results, partial: false };
  const tokens = q.split(/[\s,;|/?&=#:]+/).filter((t) => t.length >= 3).slice(0, 8);
  if (tokens.length > 1) {
    for (const t of tokens) {
      r = await env.DB.prepare(sql).bind(t, t, t).all();
      if (r.results && r.results.length) return { rows: r.results, partial: false };
    }
  }
  // ພິມ QR ບໍ່ມີ CL- ນຳໜ້າ (ເຊັ່ນ ພິມ 12345 ແຕ່ QR ຈິງ CL-12345) -> ລອງຕື່ມ CL- ໃຫ້ກ່ອນ (ກົງເປ໊ະ)
  if (!/^CL-/i.test(q)) {
    r = await env.DB.prepare(sql).bind("CL-" + q, "CL-" + q, "CL-" + q).all();
    if (r.results && r.results.length) return { rows: r.results, partial: false };
  }
  // ບໍ່ພົບແບບກົງ: ຄົ້ນຫາແບບພິມບາງສ່ວນ (ມີຢູ່ໃນ QR, Serial ຫຼື CapEx) — ຕ້ອງພິມຢ່າງໜ້ອຍ 3 ຕົວ
  // ຈັດລຳດັບ: QR ທີ່ລົງທ້າຍດ້ວຍຄ່າທີ່ພິມກ່ອນ (ເຊັ່ນ ພິມ 12345 -> CL-12345) ແລ້ວຈຶ່ງຕາມດ້ວຍທີ່ມີຄ່ານັ້ນຢູ່ກາງ
  if (q.length >= 3) {
    const esc = q.toUpperCase().replace(/[\\%_]/g, (c) => "\\" + c);
    const pr = await env.DB.prepare(
      `SELECT * FROM new_coolers
         WHERE UPPER(qr_code) LIKE ?1 ESCAPE '\\' OR UPPER(serial_number) LIKE ?1 ESCAPE '\\' OR UPPER(capex) LIKE ?1 ESCAPE '\\'
         ORDER BY (UPPER(qr_code) LIKE ?2 ESCAPE '\\') DESC, (status = 'pending') DESC, id DESC LIMIT 10`
    ).bind("%" + esc + "%", "%" + esc).all();
    if (pr.results && pr.results.length) return { rows: pr.results, partial: true };
  }
  return { rows: [], partial: false };
}

async function findNewCoolerByCode(env, code) {
  const q = String(code || "").trim();
  if (!q) return null;
  const sql =
    `SELECT * FROM new_coolers
       WHERE (qr_code COLLATE NOCASE = ? AND qr_code != '')
          OR (serial_number COLLATE NOCASE = ? AND serial_number != '')
          OR (capex COLLATE NOCASE = ? AND capex != '')
       ORDER BY (status = 'pending') DESC, id DESC LIMIT 1`;
  let row = await env.DB.prepare(sql).bind(q, q, q).first();
  if (row) return row;
  if (!/^CL-/i.test(q)) { // ພິມ QR ບໍ່ມີ CL- ນຳໜ້າ
    row = await env.DB.prepare(sql).bind("CL-" + q, "CL-" + q, "CL-" + q).first();
    if (row) return row;
  }
  const tokens = q.split(/[\s,;|/?&=#:]+/).filter((t) => t.length >= 3).slice(0, 8);
  if (tokens.length > 1) {
    for (const t of tokens) {
      row = await env.DB.prepare(sql).bind(t, t, t).first();
      if (row) return row;
    }
  }
  return null;
}

async function loadNewCoolerItem(env, id) {
  return env.DB.prepare(
    `SELECT n.*, w.name AS warehouse_name FROM new_coolers n
       LEFT JOIN wh_warehouses w ON w.id = n.received_warehouse_id WHERE n.id = ?`
  ).bind(id).first();
}

// ຮັບຕູ້ທີ່ "ຢືນຢັນແລ້ວ" (confirmed) ເຂົ້າສາງ: ໝາຍ received + ສ້າງແຖວໃໝ່ໃນ warehouse_stock (ຢູ່ໃນສາງ, ສະພາບຕູ້ = ໃໝ່) + ບັນທຶກປະຫວັດສະຕັອກ
// ຄືນຄ່າ { outcome, message?, error? } ບໍ່ throw ສຳລັບກໍລະນີທີ່ຄາດໄວ້ (ຍັງບໍ່ຢືນຢັນ / ຮັບແລ້ວ / ຊ້ຳກັບສະຕັອກ)
// ລ໋ອດ (new_cooler_receipts.lot_no) ຖືກປິດແລ້ວບໍ? — ປິດແລ້ວ = ເພີ່ມຕູ້ເຂົ້າ/ສ້າງລ໋ອດຊື່ດຽວກັນບໍ່ໄດ້
async function isReceiptLotClosed(env, lotNo) {
  const r = await env.DB.prepare("SELECT 1 AS x FROM new_cooler_receipts WHERE lot_no = ? COLLATE NOCASE AND closed_at IS NOT NULL LIMIT 1").bind(String(lotNo || "").trim()).first();
  return !!r;
}

async function receiveNewCoolerRow(env, row, wh, actorEmail) {
  if (row.status === "received") return { outcome: "already", message: "ຕູ້ນີ້ຮັບເຂົ້າສາງໄປແລ້ວ" };
  if (row.status === "shipped_out") return { outcome: "shipped", error: "ຕູ້ນີ້ຖືກສົ່ງອອກຕ່າງແຂວງໄປແລ້ວ (ຖ້າຕ້ອງການຮັບເຂົ້າສາງ ໃຫ້ຍົກເລີກການສົ່ງອອກກ່ອນ)" };
  if (row.status !== "confirmed") return { outcome: "not_confirmed", error: "ຕ້ອງສະແກນຢືນຢັນວ່າມີຕູ້ກ່ອນ ຈຶ່ງຮັບເຂົ້າສາງໄດ້" };
  if (row.ship_requested) return { outcome: "ship_pending", error: "ຕູ້ນີ້ຖືກໝາຍ \"ສົ່ງອອກຕ່າງແຂວງ\" ລໍຖ້າຢືນຢັນ (ຖ້າຕ້ອງການຮັບເຂົ້າສາງ ໃຫ້ຍົກເລີກລາຍການສົ່ງອອກກ່ອນ)" };

  // ກັນ QR/Serial/CapEx ຊ້ຳກັບສະຕັອກທີ່ມີຢູ່ແລ້ວ
  const dupError = await findQrSerialCapexDuplicate(env, "warehouse_stock", row, null);
  if (dupError) return { outcome: "conflict", error: dupError };

  // ຈອງສິດກ່ອນ (ກັນກົດ/ສະແກນຊ້ຳພ້ອມກັນ ຈົນສ້າງສະຕັອກສອງແຖວ)
  const claim = await env.DB.prepare(
    `UPDATE new_coolers SET status = 'received', received_warehouse_id = ?, received_by = ?, received_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'confirmed'`
  ).bind(wh.id, actorEmail, row.id).run();
  if (!claim.meta || !claim.meta.changes) return { outcome: "already", message: "ຕູ້ນີ້ຮັບເຂົ້າສາງໄປແລ້ວ" };

  let newStockId = null;
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO warehouse_stock
         (warehouse_id, cooler_brand, cooler_type, cooler_model, cooler_status, qr_code, serial_number, capex, status, notes)
       VALUES (?, ?, ?, ?, 'new', ?, ?, ?, 'in_warehouse', ?)`
    ).bind(wh.id, row.cooler_brand, row.cooler_type, row.cooler_model || null, row.qr_code || null, row.serial_number || null, row.capex || null, row.notes || null).run();
    newStockId = inserted.meta ? inserted.meta.last_row_id : null;
    await env.DB.batch([
      env.DB.prepare("UPDATE new_coolers SET received_stock_id = ? WHERE id = ?").bind(newStockId, row.id),
      env.DB.prepare(
        `INSERT INTO warehouse_stock_history
           (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
         VALUES (?, ?, NULL, 'create', ?, ?, ?, ?, ?, ?, NULL, 'in_warehouse', ?, ?)`
      ).bind(newStockId, wh.id, row.cooler_brand, row.cooler_type, row.cooler_model || null, row.qr_code || null, row.serial_number || null, row.capex || null, actorEmail, "ຮັບຕູ້ແຊ່ເຂົ້າໃຫມ່ເຂົ້າສາງ"),
    ]);
  } catch (err) {
    console.error("line 1798", err);
    // ສ້າງສະຕັອກບໍ່ສຳເລັດ -> ຄືນສະຖານະເປັນ confirmed ເພື່ອໃຫ້ລອງໃໝ່ໄດ້
    await env.DB.prepare(
      "UPDATE new_coolers SET status = 'confirmed', received_warehouse_id = NULL, received_by = NULL, received_at = NULL, received_stock_id = NULL WHERE id = ?"
    ).bind(row.id).run().catch(() => {});
    if (newStockId) await env.DB.prepare("DELETE FROM warehouse_stock WHERE id = ?").bind(newStockId).run().catch(() => {});
    return { outcome: "error", error: "ສ້າງສະຕັອກບໍ່ສຳເລັດ" };
  }
  return { outcome: "received", message: `ຮັບເຂົ້າສາງ "${wh.name}" ແລ້ວ` };
}

async function revokeUserByMdeCode(env, mdeCode) {
  const user = await env.DB.prepare("SELECT id, role FROM users WHERE mde_code = ?").bind(mdeCode).first();
  if (!user || isAdminLike(user.role)) return false; // ບໍ່ມີ user ຜູກຢູ່ ຫຼື ເປັນບັນຊີ admin -> ບໍ່ແຕະຕ້ອງ

  await env.DB.batch([
    env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return true;
}

// ຫໍ່ request ໃໝ່ ເພື່ອບັງຄັບໃຫ້ userId/callerId ໃນ body ມາຈາກ token ເທົ່ານັ້ນ
function withTrustedIds(request, userId, overrideUserId) {
  const originalJson = request.json.bind(request);
  return {
    method: request.method,
    url: request.url,
    headers: request.headers,
    async json() {
      const body = await originalJson();
      if (!body || typeof body !== "object" || Array.isArray(body)) return body;
      const trusted = { ...body, callerId: userId };
      if (overrideUserId) trusted.userId = userId;
      return trusted;
    },
  };
}

// ==========================================================================
// ໂໝດປິດລະບົບ (Maintenance): Admin ເປີດ/ປິດໄດ້ຈາກໜ້າ Admin Dashboard
// ເມື່ອເປີດ: ມີແຕ່ role "admin" ແລະ team "ADMIN TEAM" (ຮັບທັງ ADMIN TEAM / ADMIN_TEAM / ADMIN-TEAM) ທີ່ login + ໃຊ້ງານໄດ້
// ຄົນອື່ນໄດ້ຮັບ HTTP 503 + code "MAINTENANCE" (frontend ສະແດງໜ້າ "ກຳລັງປັບປຸງ")
// ຄ່າເກັບໃນຕາຕະລາງ app_settings (migration_add_maintenance_mode.sql). ຍັງບໍ່ມີຕາຕະລາງ = ຖືວ່າປິດໂໝດນີ້ (ບໍ່ກະທົບລະບົບ)
// ==========================================================================
const MAINTENANCE_DEFAULT_MESSAGE = "ລະບົບກຳລັງປັບປຸງ ກະລຸນາກັບມາໃໝ່ພາຍຫຼັງ";
const MAINTENANCE_CACHE_MS = 5000; // cache ຕໍ່ isolate ເພື່ອບໍ່ໃຫ້ອ່ານ DB ທຸກ request (ມີຜົນພາຍໃນ ~5 ວິນາທີ)
const MAINTENANCE_OPEN_ROUTES = new Set(["/api/login", "/api/maintenance-status"]); // ເປີດໃຫ້ເອີ້ນໄດ້ສະເໝີ (login ກວດສິດຢູ່ໃນຕົວມັນເອງ)
let maintenanceCache = { at: 0, enabled: false, message: MAINTENANCE_DEFAULT_MESSAGE, updated_at: null };

async function getMaintenance(env, force = false) {
  const now = Date.now();
  if (!force && now - maintenanceCache.at < MAINTENANCE_CACHE_MS) return maintenanceCache;
  try {
    const { results } = await env.DB.prepare(
      "SELECT key, value, updated_at FROM app_settings WHERE key IN ('maintenance_enabled', 'maintenance_message')"
    ).all();
    const m = {};
    let updatedAt = null;
    for (const r of results || []) {
      m[r.key] = r.value;
      if (r.updated_at && (!updatedAt || r.updated_at > updatedAt)) updatedAt = r.updated_at;
    }
    maintenanceCache = {
      at: now,
      enabled: m.maintenance_enabled === "1",
      message: m.maintenance_message || MAINTENANCE_DEFAULT_MESSAGE,
      updated_at: updatedAt,
    };
  } catch (e) {
    // ຍັງບໍ່ໄດ້ຮັນ migration_add_maintenance_mode.sql (ຫຼື D1 ຂັດຂ້ອງຊົ່ວຄາວ) -> ຖືວ່າບໍ່ໄດ້ປິດລະບົບ
    console.error("getMaintenance", e);
    maintenanceCache = { at: now, enabled: false, message: MAINTENANCE_DEFAULT_MESSAGE, updated_at: null };
  }
  return maintenanceCache;
}

function normalizeTeamName(team) {
  return String(team || "").toUpperCase().replace(/[\s_\-]+/g, "");
}
function canBypassMaintenance(user) {
  return !!user && (isAdminLike(user.role) || normalizeTeamName(user.team) === "ADMINTEAM");
}
function maintenanceResponse(m) {
  return Response.json(
    { error: m.message, message: m.message, code: "MAINTENANCE", maintenance: true },
    { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } }
  );
}
// API สาธารณะ (ບໍ່ຕ້ອງ login) ທີ່ admin/ADMIN TEAM ຍັງຕ້ອງໃຊ້ຕອນປິດລະບົບ (ເຊັ່ນ /api/mde-list, /api/catalog) -> ກວດ token ແບບເບົາ
async function tokenCanBypassMaintenance(env, request) {
  try {
    const payload = await verifySessionToken(env, readBearerToken(request));
    if (!payload) return false;
    const u = await env.DB.prepare("SELECT id, team, role, status, password_hash FROM users WHERE id = ?").bind(payload.uid).first();
    if (!u || u.status !== "approved") return false;
    if (payload.pv !== (await passwordVersion(u.password_hash))) return false;
    return canBypassMaintenance(u);
  } catch (_) {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---- ໂໝດປິດລະບົບ: API ສາທາລະນະ (ບໍ່ຕ້ອງ login) ຖືກບລັອກ ຍົກເວັ້ນ login/status ແລະຄົນທີ່ມີ token ຂອງ admin/ADMIN TEAM ----
    let maint = null;
    if (url.pathname.startsWith("/api/")) {
      maint = await getMaintenance(env);
      if (maint.enabled && PUBLIC_API_ROUTES.has(url.pathname) && !MAINTENANCE_OPEN_ROUTES.has(url.pathname)) {
        if (!(await tokenCanBypassMaintenance(env, request))) return maintenanceResponse(maint);
      }
    }

    // ---- ດ່ານກວດສິດ: ຮັນກ່ອນທຸກ route ----
    let session = null;
    if (url.pathname.startsWith("/api/") && !PUBLIC_API_ROUTES.has(url.pathname)) {
      let payload;
      try {
        payload = await verifySessionToken(env, readBearerToken(request));
      } catch (e) {
        console.error("line 1848", e);
        if (e.message === "SESSION_SECRET_MISSING") {
          return Response.json({
            error: "ລະບົບຍັງບໍ່ໄດ້ຕັ້ງຄ່າ SESSION_SECRET (ຮັນ: npx wrangler secret put SESSION_SECRET)"
          }, { status: 500 });
        }
        throw e;
      }
      if (!payload) {
        return unauthorized("ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່", "UNAUTHENTICATED", 401);
      }

      // ດຶງຂໍ້ມູນຜູ້ໃຊ້ງານຈາກ DB ໃໝ່ທຸກຄັ້ງ (role/status ອາດຖືກ Admin ປ່ຽນຫຼັງຈາກອອກ token)
      session = await env.DB.prepare(
        "SELECT id, email, team, mde_code, role, status, password_hash FROM users WHERE id = ?"
      ).bind(payload.uid).first();

      if (!session) return unauthorized("ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ", "UNAUTHENTICATED", 401);
      if (session.status !== "approved") {
        return unauthorized("ບັນຊີນີ້ຍັງບໍ່ໄດ້ຮັບອະນຸມັດ ຫຼື ຖືກລະງັບການໃຊ້ງານ", "FORBIDDEN", 403);
      }
      // ປ່ຽນລະຫັດຜ່ານແລ້ວ -> token ເກົ່າທຸກອັນໃຊ້ບໍ່ໄດ້
      if (payload.pv !== (await passwordVersion(session.password_hash))) {
        return unauthorized("ລະຫັດຜ່ານຖືກປ່ຽນແລ້ວ ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່", "UNAUTHENTICATED", 401);
      }
      delete session.password_hash;

      // ໂໝດປິດລະບົບ: ມີແຕ່ admin / ADMIN TEAM ເທົ່ານັ້ນທີ່ຜ່ານ
      if (maint && maint.enabled && !canBypassMaintenance(session)) return maintenanceResponse(maint);

      // ກວດ role ຕາມນະໂຍບາຍຂອງແຕ່ລະເສັ້ນທາງ
      const requiredRoles = ROUTE_ROLES[url.pathname]
        || (url.pathname.startsWith("/api/admin/") ? ROLE_ADMIN : null);
      // ຜູ້ຊ່ວຍ admin ຖືກນັບເປັນ admin ສຳລັບເສັ້ນທາງທີ່ບໍ່ຢູ່ໃນລາຍການຫ້າມ (ຈັດການຜູ້ໃຊ້/ລຶບ/ຕັ້ງຄ່າລະບົບ)
      const effectiveRole = (session.role === "assistant_admin" && !isAssistantAdminDenied(url.pathname)) ? "admin" : session.role;
      if (requiredRoles && !requiredRoles.includes(effectiveRole)) {
        return unauthorized("ບໍ່ມີສິດເຮັດລາຍການນີ້", "FORBIDDEN", 403);
      }

      // ບັງຄັບຕົວຕົນ: ທັບ userId/callerId ທັງໃນ query string ແລະ body
      url.searchParams.set("userId", String(session.id));
      request = withTrustedIds(request, session.id, !TARGET_USER_ID_ROUTES.has(url.pathname));
    }

    // บทบาทที่เห็นข้อมูลทุก MDE ได้เหมือน Admin: admin (สิทธิ์เต็ม) และ warehouse (พนักงานคลัง - แก้ได้แค่ Status + ອະນຸມັດคำขอ)
    const canViewAll = (role) => isAdminLike(role) || role === 'warehouse' || role === 'delivery';

    // API ดึง MDE List Dynamic จาก DB D1
    // ເພີ່ມ has_user = 1 ຖ້າ MDE Code ນັ້ນມີຜູ້ໃຊ້ງານສະໝັກໄປແລ້ວ (ໃຊ້ເພື່ອເຊື່ອງອອກຈາກໜ້າລົງທະບຽນ
    // ໂດຍບໍ່ກະທົບບ່ອນອື່ນທີ່ຍັງໃຊ້ dbMdeList ຊຸດເຕັມ ເຊັ່ນ Admin MDE Master List / ຄົ້ນຫາ Asset)
    if (url.pathname === "/api/mde-list" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT m.*, CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END AS has_user
         FROM mde_list m
         LEFT JOIN users u ON u.mde_code = m.mde_code
         ORDER BY m.team, m.mde_code`
      ).all();
      return Response.json(results || []);
    }

    // API ดึง DSM List (ຫົວໜ້າທີມຕໍ່ Team) - ໃຊ້ໜ້າ Admin ຈັດການ DSM List
    if (url.pathname === "/api/dsm-list" && request.method === "GET") {
      // ອີເມວ DSM ເຫັນໄດ້ສະເພາະ Admin (API ນີ້ເປີດໃຫ້ທຸກ role ເພື່ອສະແດງຊື່ DSM ຂອງທີມ)
      const isAdminCaller = !!(session && isAdminLike(session.role));
      // Admin ເຫັນເພີ່ມວ່າ DSM ແຕ່ລະຄົນມີບັນຊີ login ແລ້ວຫຼືຍັງ (ຈັບຄູ່ດ້ວຍອີເມວ)
      const { results } = await env.DB.prepare(
        isAdminCaller
          ? `SELECT d.*, u.id AS user_id, u.role AS user_role, u.status AS user_status, u.team AS user_team
             FROM dsm_list d LEFT JOIN users u ON LOWER(u.email) = LOWER(d.email) AND d.email IS NOT NULL AND d.email != ''
             ORDER BY d.team`
          : "SELECT * FROM dsm_list ORDER BY team"
      ).all();
      return Response.json((results || []).map((r) => {
        if (isAdminCaller) return r;
        const { email, ...rest } = r;
        return rest;
      }));
    }

    // API ดึง Brand/Type ทั้งหมดจาก Master List (สำหรับตัวเลือก dropdown ในฟอร์มต่างๆ)
    if (url.pathname === "/api/catalog" && request.method === "GET") {
      const brandRows = await env.DB.prepare("SELECT name FROM cooler_brands ORDER BY name").all();
      const typeRows = await env.DB.prepare("SELECT name FROM cooler_types ORDER BY name").all();
      const modelRows = await env.DB.prepare("SELECT name FROM cooler_models ORDER BY name").all();
      const docTypeRows = await env.DB.prepare("SELECT name FROM doc_types ORDER BY name").all();
      const specialBrandRows = await env.DB.prepare("SELECT name FROM special_cooler_brands ORDER BY name").all();
      return Response.json({
        brands: (brandRows.results || []).map(r => r.name),
        types: (typeRows.results || []).map(r => r.name),
        models: (modelRows.results || []).map(r => r.name),
        docTypes: (docTypeRows.results || []).map(r => r.name),
        specialBrands: (specialBrandRows.results || []).map(r => r.name)
      });
    }

    // API ดึงรายชื่อ "ສາງ" (Warehouse) ທີ່ active ໃຫ້ທຸກ role ທີ່ login ແລ້ວໃຊ້ (dropdown ໜ້າອອກໃບ/ກວດນັບສາງ)
    if (url.pathname === "/api/warehouses" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, code, name, province, is_main FROM wh_warehouses WHERE active = 1 ORDER BY is_main DESC, name"
      ).all();
      return Response.json(results || []);
    }

    // API ຈັດການ "ສາງ" (Master List) - ດຶງລາຍການທັງໝົດ (ລວມສາງທີ່ປິດໃຊ້ງານແລ້ວ - ສະເພາະ Admin)
    if (url.pathname === "/api/admin/warehouses" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM wh_warehouses ORDER BY is_main DESC, name"
      ).all();
      return Response.json(results || []);
    }

    // API ຈັດການ "ສາງ" - ເພີ່ມ/ແກ້ໄຂ
    if (url.pathname === "/api/admin/save-warehouse" && request.method === "POST") {
      try {
        const { id, code, name, province, is_main, active } = await request.json();
        if (!code || !name) return Response.json({ error: "ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ສາງ" }, { status: 400 });
        const isMain = is_main ? 1 : 0;
        const isActive = active === false ? 0 : 1;

        if (id) {
          await env.DB.prepare(
            "UPDATE wh_warehouses SET code = ?, name = ?, province = ?, is_main = ?, active = ? WHERE id = ?"
          ).bind(code, name, province || null, isMain, isActive, id).run();
          return Response.json({ message: "ແກ້ໄຂຂໍ້ມູນສາງຮຽບຮ້ອຍແລ້ວ" });
        } else {
          await env.DB.prepare(
            "INSERT INTO wh_warehouses (code, name, province, is_main, active) VALUES (?, ?, ?, ?, ?)"
          ).bind(code, name, province || null, isMain, isActive).run();
          return Response.json({ message: "ເພີ່ມສາງໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-warehouse", e);
        return Response.json({ error: "ລະຫັດສາງນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
      }
    }

    // API ຈັດການ "ສາງ" - ລຶບ
    // ກວດກ່ອນວ່າຍັງມີ warehouse_stock / stock_counts ທີ່ຜູກກັບສາງນີ້ຢູ່ບໍ (warehouse_id ບໍ່ມີ ON DELETE CASCADE)
    // ຖ້າລຶບໄປເລີຍ ແຖວເຫຼົ່ານັ້ນຈະກາຍເປັນ orphan ແລະ "ຫາຍ" ຈາກໜ້າສະຕັອກ/ປະຫວັດ/ກວດນັບ ທັນທີ ເພາະທຸກໜ້ານັ້ນ JOIN wh_warehouses ແບບ INNER JOIN
    if (url.pathname === "/api/admin/delete-warehouse" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const stockCount = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM warehouse_stock WHERE warehouse_id = ?"
        ).bind(id).first();
        if (stockCount && stockCount.n > 0) {
          return Response.json(
            { error: `ບໍ່ສາມາດລຶບໄດ້ ເນື່ອງຈາກຍັງມີສະຕັອກ ${stockCount.n} ລາຍການຢູ່ໃນສາງນີ້ ກະລຸນາຍ້າຍ/ລຶບສະຕັອກອອກກ່ອນ` },
            { status: 400 }
          );
        }
        const openCount = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM stock_counts WHERE warehouse_id = ? AND status = 'open'"
        ).bind(id).first();
        if (openCount && openCount.n > 0) {
          return Response.json(
            { error: "ບໍ່ສາມາດລຶບໄດ້ ເນື່ອງຈາກສາງນີ້ຍັງມີຮອບກວດນັບສາງທີ່ຍັງບໍ່ປິດ (open) ຢູ່" },
            { status: 400 }
          );
        }

        await env.DB.prepare("DELETE FROM wh_warehouses WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບສາງຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-warehouse", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // API ດຶງລາຍຊື່ "Outlet" (Master Data) ທີ່ active ໃຫ້ທຸກ role ທີ່ login ແລ້ວໃຊ້ (dropdown ໜ້າອອກໃບ/ຄຳຂໍ ໃນອະນາຄົດ)
    if (url.pathname === "/api/outlets" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, code, name, owner_name, outlet_type, outlet_level, province, address, phone, latitude, longitude FROM outlets WHERE active = 1 ORDER BY name"
      ).all();
      // ລາຍການຮ້ານປ່ຽນບໍ່ຖີ່ ແຕ່ query ນີ້ອ່ານທຸກແຖວ -> ໃຫ້ browser cache 5 ນາທີ ເພື່ອຫຼຸດ row read ຂອງ D1
      return Response.json(results || [], { headers: { "Cache-Control": "private, max-age=300" } });
    }

    // API ຈັດການ "Outlet" (Master List) - ສະເພາະ Admin
    // ມີ q (ຄຳຄົ້ນຫາ) -> ຄົ້ນຫາໃນ code/name/province/outlet_level ຢູ່ໃນ D1 ເລີຍ (ບໍ່ໄດ້ດຶງທັງໝົດມາ filter ຝັ່ງ browser)
    // ບໍ່ມີ q -> ດຶງທັງໝົດ (ໃຊ້ສະເພາະຕອນ import Excel ເພື່ອກວດ code ຊໍ້າ, ບໍ່ໄດ້ໃຊ້ໂຫລດຕາຕະລາງໜ້າ Outlet ອີກຕໍ່ໄປ)
    if (url.pathname === "/api/admin/outlets" && request.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q) {
        const like = `%${q}%`;
        const { results } = await env.DB.prepare(
          `SELECT * FROM outlets
           WHERE code LIKE ? OR name LIKE ? OR IFNULL(province,'') LIKE ? OR IFNULL(outlet_level,'') LIKE ?
           ORDER BY name LIMIT 200`
        ).bind(like, like, like, like).all();
        return Response.json(results || []);
      }
      const { results } = await env.DB.prepare(
        "SELECT * FROM outlets ORDER BY name"
      ).all();
      return Response.json(results || []);
    }

    // API ຈັດການ "Outlet" - ເພີ່ມ/ແກ້ໄຂ
    if (url.pathname === "/api/admin/save-outlet" && request.method === "POST") {
      try {
        const {
          id, code: rawCode, name: rawName, owner_name, outlet_type, outlet_level, province, address, phone,
          latitude, longitude, active
        } = await request.json();
        // ຕັດຍະຫວ່າງໜ້າ/ຫຼັງ ແລະ ປ່ຽນ Outlet Code ເປັນຕົວພິມໃຫຍ່ ເພື່ອກັນລະຫັດຊໍ້າແບບ OUT001 / out001 / "OUT001 "
        const code = String(rawCode || "").trim().replace(/\s+/g, "").toUpperCase();
        const name = String(rawName || "").trim();
        if (!code || !name) return Response.json({ error: "ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ຮ້ານ" }, { status: 400 });

        // ກວດລະຫັດຊໍ້າ — code ຖືກ trim/uppercase ໄວ້ແລ້ວຂ້າງເທິງ ຈຶ່ງປຽບທຽບກົງໆກັບ column code ໄດ້ເລີຍ
        // (ບໍ່ຫໍ່ດ້ວຍ UPPER(TRIM()) ອີກຕໍ່ໄປ ເພື່ອໃຫ້ D1 ໃຊ້ UNIQUE index ຂອງ code ໄດ້ ແທນທີ່ຈະ scan ທັງຕາຕະລາງ
        // ທຸກຄັ້ງທີ່ບັນທຶກ — ຈຸດນີ້ຄືສາເຫດຫຼັກທີ່ Rows Read ພຸ່ງສູງຕອນ import Outlet ຈຳນວນຫຼາຍ)
        const dup = await env.DB.prepare(
          "SELECT id, name FROM outlets WHERE code = ? AND id != ? LIMIT 1"
        ).bind(code, id || 0).first();
        if (dup) {
          return Response.json({ error: `ລະຫັດ Outlet ${code} ມີຢູ່ໃນລະບົບແລ້ວ (${dup.name})` }, { status: 400 });
        }
        const isActive = active === false ? 0 : 1;
        const lat = (latitude === "" || latitude === undefined) ? null : latitude;
        const lng = (longitude === "" || longitude === undefined) ? null : longitude;

        if (id) {
          await env.DB.prepare(
            `UPDATE outlets SET code = ?, name = ?, owner_name = ?, outlet_type = ?, outlet_level = ?, province = ?,
               address = ?, phone = ?, latitude = ?, longitude = ?, active = ? WHERE id = ?`
          ).bind(code, name, owner_name || null, outlet_type || null, outlet_level || null, province || null,
            address || null, phone || null, lat, lng, isActive, id).run();
          return Response.json({ message: "ແກ້ໄຂຂໍ້ມູນ Outlet ຮຽບຮ້ອຍແລ້ວ" });
        } else {
          await env.DB.prepare(
            `INSERT INTO outlets (code, name, owner_name, outlet_type, outlet_level, province, address, phone, latitude, longitude, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(code, name, owner_name || null, outlet_type || null, outlet_level || null, province || null,
            address || null, phone || null, lat, lng, isActive).run();
          return Response.json({ message: "ເພີ່ມ Outlet ໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-outlet", e);
        if (String((e && e.message) || e).includes("UNIQUE")) {
          return Response.json({ error: "ລະຫັດ Outlet ນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
        }
        return Response.json({ error: "ບັນທຶກຂໍ້ມູນ Outlet ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // API ຈັດການ "Outlet" - ລຶບ
    if (url.pathname === "/api/admin/delete-outlet" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM outlets WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບ Outlet ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-outlet", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // ==================== ກວດນັບສາງປະຈຳເດືອນ (Stock Count) ====================
    // ລາຍການຮອບກວດນັບ (ຮອງຮັບ ?warehouse_id=)
    if (url.pathname === "/api/stock-counts" && request.method === "GET") {
      const warehouseId = url.searchParams.get("warehouse_id");
      let sql = STOCK_COUNT_SUMMARY_SQL + " WHERE 1=1";
      const binds = [];
      if (warehouseId) { sql += " AND c.warehouse_id = ?"; binds.push(warehouseId); }
      sql += " ORDER BY c.period DESC, c.id DESC LIMIT 200";
      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return Response.json({ current_period: currentLaoPeriod(), counts: results || [] });
    }

    // ລາຍລະອຽດ 1 ຮອບ + ລາຍການທັງໝົດ
    if (url.pathname === "/api/stock-count/items" && request.method === "GET") {
      const countId = url.searchParams.get("count_id");
      if (!countId) return Response.json({ error: "ບໍ່ພົບຮອບກວດນັບ" }, { status: 400 });
      const count = await env.DB.prepare(STOCK_COUNT_SUMMARY_SQL + " WHERE c.id = ?").bind(countId).first();
      if (!count) return Response.json({ error: "ບໍ່ພົບຮອບກວດນັບ" }, { status: 404 });
      const { results } = await env.DB.prepare(
        "SELECT * FROM stock_count_items WHERE count_id = ? ORDER BY expected DESC, cooler_brand, cooler_type, id"
      ).bind(countId).all();
      return Response.json({ count, items: results || [] });
    }

    // ເລີ່ມຮອບກວດນັບໃໝ່ (1 ສາງ ຕໍ່ 1 ເດືອນ)
    if (url.pathname === "/api/stock-count/start" && request.method === "POST") {
      try {
        const { warehouse_id, period, notes } = await request.json();
        if (!warehouse_id) return Response.json({ error: "ກະລຸນາເລືອກສາງ" }, { status: 400 });
        const wh = await env.DB.prepare("SELECT id, name FROM wh_warehouses WHERE id = ? AND active = 1").bind(warehouse_id).first();
        if (!wh) return Response.json({ error: "ບໍ່ພົບສາງທີ່ເລືອກ ຫຼືສາງປິດໃຊ້ງານແລ້ວ" }, { status: 400 });
        if (wh.name === OUTLET_WAREHOUSE_NAME || wh.name === PROVINCE_WAREHOUSE_NAME) {
          return Response.json({ error: `ສາງ "${wh.name}" ບໍ່ຕ້ອງກວດນັບປະຈຳເດືອນ` }, { status: 400 });
        }

        const per = /^\d{4}-(0[1-9]|1[0-2])$/.test(period || "") ? period : currentLaoPeriod();
        const exist = await env.DB.prepare(
          "SELECT id FROM stock_counts WHERE warehouse_id = ? AND period = ?"
        ).bind(warehouse_id, per).first();
        if (exist) {
          return Response.json({ error: `${wh.name} ມີການກວດນັບຂອງເດືອນ ${per} ແລ້ວ`, count_id: exist.id }, { status: 400 });
        }

        const actor = (session && session.email) || null;
        const ins = await env.DB.prepare(
          "INSERT INTO stock_counts (warehouse_id, period, status, notes, started_by) VALUES (?, ?, 'open', ?, ?)"
        ).bind(warehouse_id, per, notes || null, actor).run();
        const countId = ins.meta && ins.meta.last_row_id;

        await env.DB.prepare(
          `INSERT INTO stock_count_items
             (count_id, stock_id, qr_code, serial_number, capex, cooler_brand, cooler_type, cooler_model, expected, result)
           SELECT ?, id, qr_code, serial_number, capex, cooler_brand, cooler_type, cooler_model, 1, 'pending'
           FROM warehouse_stock WHERE warehouse_id = ? AND status = 'in_warehouse'`
        ).bind(countId, warehouse_id).run();

        const count = await env.DB.prepare(STOCK_COUNT_SUMMARY_SQL + " WHERE c.id = ?").bind(countId).first();
        runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin", "warehouse"], {
          title: "ເລີ່ມຮອບກວດນັບສາງ",
          body: `${wh.name} | ເດືອນ ${per}\n${count.expected_count} ລາຍການທີ່ຕ້ອງກວດນັບ`,
          url: "stockCount",
        }));
        return Response.json({ message: `ເລີ່ມກວດນັບ ${wh.name} ເດືອນ ${per} ແລ້ວ (${count.expected_count} ລາຍການ)`, count });
      } catch (e) {
        console.error("/api/stock-count/start", e);
        return Response.json({ error: "ເລີ່ມກວດນັບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // ສະແກນ/ປ້ອນ QR, Serial ຫຼື CapEx ເພື່ອໝາຍວ່າ "ນັບພົບແລ້ວ"
    if (url.pathname === "/api/stock-count/scan" && request.method === "POST") {
      try {
        const { count_id, code } = await request.json();
        const q = String(code || "").trim();
        if (!count_id || !q) return Response.json({ error: "ກະລຸນາປ້ອນ QR, Serial ຫຼື CapEx" }, { status: 400 });

        const count = await env.DB.prepare("SELECT * FROM stock_counts WHERE id = ?").bind(count_id).first();
        if (!count) return Response.json({ error: "ບໍ່ພົບຮອບກວດນັບ" }, { status: 404 });
        if (count.status !== "open") return Response.json({ error: "ຮອບນີ້ປິດແລ້ວ ບໍ່ສາມາດນັບເພີ່ມໄດ້" }, { status: 400 });

        const actor = (session && session.email) || null;
        const matchSql = "(qr_code COLLATE NOCASE = ? OR serial_number COLLATE NOCASE = ? OR capex COLLATE NOCASE = ?)";

        // 1) ຢູ່ໃນຮອບນີ້ແລ້ວ (snapshot ຫຼື ເຄີຍສະແກນເປັນ extra)
        const item = await env.DB.prepare(
          `SELECT * FROM stock_count_items WHERE count_id = ? AND ${matchSql} ORDER BY expected DESC LIMIT 1`
        ).bind(count_id, q, q, q).first();
        if (item) {
          if (item.result === "pending") {
            await env.DB.prepare(
              "UPDATE stock_count_items SET result = 'found', counted_by = ?, counted_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(actor, item.id).run();
            const updated = await env.DB.prepare("SELECT * FROM stock_count_items WHERE id = ?").bind(item.id).first();
            return Response.json({ outcome: "found", message: "ນັບພົບແລ້ວ", item: updated });
          }
          return Response.json({ outcome: "duplicate", message: "ລາຍການນີ້ສະແກນແລ້ວ", item });
        }

        // 2) ບໍ່ຢູ່ໃນ snapshot -> ຫາໃນສະຕັອກທັງລະບົບ
        const stock = await env.DB.prepare(
          `SELECT ws.*, w.name AS warehouse_name FROM warehouse_stock ws
           JOIN wh_warehouses w ON w.id = ws.warehouse_id
           WHERE ${matchSql.replace(/qr_code/g, "ws.qr_code").replace(/serial_number/g, "ws.serial_number").replace(/capex/g, "ws.capex")}
           ORDER BY ws.updated_at DESC LIMIT 1`
        ).bind(q, q, q).first();
        if (!stock) {
          return Response.json({ error: `ບໍ່ພົບ "${q}" ໃນສະຕ໋ອກສາງ (ຖ້າເປັນຕູ້ໃໝ່ ໃຫ້ເພີ່ມໃນໜ້າສະຕັອກສາງກ່ອນ)` }, { status: 404 });
        }

        const statusLabel = { in_warehouse: "ຢູ່ໃນສາງ", reserved: "ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ", outlet: "ອອກໄປຮ້ານແລ້ວ", event: "ກຳລັງໃຊ້ງານ Event", shipped_out: "ສົ່ງຕ່າງແຂວງແລ້ວ", write_off: "ສະສາງ", pending_write_off: "ລໍຖ້າສະສາງ" }[stock.status] || stock.status;
        const note = stock.warehouse_id === count.warehouse_id
          ? `ລະບົບບັນທຶກສະຖານະ "${statusLabel}" ແຕ່ພົບຢູ່ໃນສາງນີ້`
          : `ລະບົບບັນທຶກວ່າຢູ່ ${stock.warehouse_name} (${statusLabel})`;
        const ins = await env.DB.prepare(
          `INSERT INTO stock_count_items
             (count_id, stock_id, qr_code, serial_number, capex, cooler_brand, cooler_type, cooler_model,
              expected, result, counted_by, counted_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'extra', ?, CURRENT_TIMESTAMP, ?)`
        ).bind(count_id, stock.id, stock.qr_code, stock.serial_number, stock.capex,
          stock.cooler_brand, stock.cooler_type, stock.cooler_model, actor, note).run();
        const created = await env.DB.prepare("SELECT * FROM stock_count_items WHERE id = ?").bind(ins.meta.last_row_id).first();
        return Response.json({ outcome: "extra", message: `ພົບແຕ່ບໍ່ຢູ່ໃນລາຍການຂອງສາງນີ້: ${note}`, item: created });
      } catch (e) {
        console.error("/api/stock-count/scan", e);
        return Response.json({ error: "ບັນທຶກການນັບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // ຍົກເລີກການນັບ 1 ລາຍການ (ນັບຜິດ) - ລາຍການ snapshot ກັບເປັນ pending, ລາຍການ extra ຖືກລຶບ
    if (url.pathname === "/api/stock-count/unmark" && request.method === "POST") {
      try {
        const { item_id } = await request.json();
        const item = await env.DB.prepare(
          `SELECT i.*, c.status AS count_status FROM stock_count_items i
           JOIN stock_counts c ON c.id = i.count_id WHERE i.id = ?`
        ).bind(item_id).first();
        if (!item) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 404 });
        if (item.count_status !== "open") return Response.json({ error: "ຮອບນີ້ປິດແລ້ວ ບໍ່ສາມາດແກ້ໄຂໄດ້" }, { status: 400 });
        if (item.expected === 1) {
          await env.DB.prepare(
            "UPDATE stock_count_items SET result = 'pending', counted_by = NULL, counted_at = NULL WHERE id = ?"
          ).bind(item_id).run();
        } else {
          await env.DB.prepare("DELETE FROM stock_count_items WHERE id = ?").bind(item_id).run();
        }
        return Response.json({ message: "ຍົກເລີກການນັບລາຍການນີ້ແລ້ວ" });
      } catch (e) {
        console.error("/api/stock-count/unmark", e);
        return Response.json({ error: "ບໍ່ສາມາດຍົກເລີກໄດ້" }, { status: 500 });
      }
    }

    // ປິດຮອບ: ລາຍການທີ່ຍັງບໍ່ໄດ້ນັບ -> 'missing'
    if (url.pathname === "/api/stock-count/complete" && request.method === "POST") {
      try {
        const { count_id, notes } = await request.json();
        const count = await env.DB.prepare("SELECT * FROM stock_counts WHERE id = ?").bind(count_id).first();
        if (!count) return Response.json({ error: "ບໍ່ພົບຮອບກວດນັບ" }, { status: 404 });
        if (count.status !== "open") return Response.json({ error: "ຮອບນີ້ປິດແລ້ວ" }, { status: 400 });

        const actor = (session && session.email) || null;
        await env.DB.prepare(
          "UPDATE stock_count_items SET result = 'missing' WHERE count_id = ? AND expected = 1 AND result = 'pending'"
        ).bind(count_id).run();
        await env.DB.prepare(
          `UPDATE stock_counts SET status = 'completed', completed_by = ?, completed_at = CURRENT_TIMESTAMP,
             notes = COALESCE(?, notes) WHERE id = ?`
        ).bind(actor, notes || null, count_id).run();

        const summary = await env.DB.prepare(STOCK_COUNT_SUMMARY_SQL + " WHERE c.id = ?").bind(count_id).first();
        if (summary) {
          runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin", "warehouse"], {
            title: summary.missing_count > 0 ? "ປິດຮອບກວດນັບສາງ - ພົບຕູ້ຫາຍ" : "ປິດຮອບກວດນັບສາງແລ້ວ",
            body: `${summary.warehouse_name} | ເດືອນ ${summary.period}\nພົບ ${summary.found_count} | ຫາຍ ${summary.missing_count} | ເກີນ ${summary.extra_count}`,
            url: "stockCount",
          }));
        }
        return Response.json({ message: "ປິດຮອບກວດນັບຮຽບຮ້ອຍແລ້ວ", count: summary });
      } catch (e) {
        console.error("/api/stock-count/complete", e);
        return Response.json({ error: "ປິດຮອບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // ລຶບຮອບກວດນັບ (admin ເທົ່ານັ້ນ) - ໃຊ້ເມື່ອເລີ່ມຮອບຜິດ ແລະ ຕ້ອງການເລີ່ມໃໝ່
    if (url.pathname === "/api/stock-count/delete" && request.method === "POST") {
      try {
        const { count_id } = await request.json();
        if (!count_id) return Response.json({ error: "ບໍ່ພົບຮອບກວດນັບ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM stock_count_items WHERE count_id = ?").bind(count_id).run();
        await env.DB.prepare("DELETE FROM stock_counts WHERE id = ?").bind(count_id).run();
        return Response.json({ message: "ລຶບຮອບກວດນັບແລ້ວ" });
      } catch (e) {
        console.error("/api/stock-count/delete", e);
        return Response.json({ error: "ລຶບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===== Cooler Master Data =====
    // ສະຖິຕິ: ຈຳນວນທັງໝົດ + ລາຍຊື່ແຂວງ (ໄວ້ເຮັດຕົວກອງ) + ເວລາ Import ຫຼ້າສຸດ
    // ອ່ານຈາກ cache ຕາຕະລາງ cooler_master_stats (1 ແຖວ) — ບໍ່ scan cooler_master ທຸກເທື່ອທີ່ເປີດໜ້າ
    if (url.pathname === "/api/cooler-master/stats" && request.method === "GET") {
      try {
        let row = null;
        try { row = await env.DB.prepare("SELECT total, last_updated, provinces_json FROM cooler_master_stats WHERE id = 1").first(); } catch (_) { row = null; }
        if (!row) row = await cmRefreshStats(env);
        let provinces = [];
        try { provinces = JSON.parse(row.provinces_json || "[]"); } catch (_) {}
        return Response.json({ total: row.total || 0, last_updated: row.last_updated || null, provinces });
      } catch (e) {
        console.error("/api/cooler-master/stats", e);
        return Response.json({ error: "ໂຫລດຂໍ້ມູນບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_cooler_master.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // admin: ຄິດສະຖິຕິໃໝ່ (Frontend ເອີ້ນ 1 ເທື່ອຫຼັງ Import ຈົບທຸກ chunk)
    if (url.pathname === "/api/admin/cooler-master/refresh-stats" && request.method === "POST") {
      try {
        const row = await cmRefreshStats(env);
        return Response.json({ total: row.total || 0 });
      } catch (e) {
        console.error("/api/admin/cooler-master/refresh-stats", e);
        return Response.json({ error: "ອັບເດດສະຖິຕິບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_cooler_master_perf.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // ຄົ້ນຫາ/ສະແກນ: q = QR/Serial/CapEx (ກົງເປ໊ະ ກ່ອນ) ຖ້າບໍ່ພົບຈຶ່ງຄົ້ນແບບບາງສ່ວນ (ລວມ Outlet Code/ຊື່ຮ້ານ)
    if (url.pathname === "/api/cooler-master/search" && request.method === "GET") {
      try {
        const qRaw = (url.searchParams.get("q") || "").trim().slice(0, 100);
        const q = cmNorm(qRaw);
        const province = (url.searchParams.get("province") || "").trim();
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
        // outlet=1: ຄົ້ນຫາດ້ວຍ Outlet Code ໄດ້ນຳ (ໃຊ້ໃນ Manage Lost Cooler ຕອນເພີ່ມຕູ້) - ໜ້າອື່ນບໍ່ສົ່ງ param ນີ້ ຈຶ່ງບໍ່ກະທົບ
        const byOutlet = url.searchParams.get("outlet") === "1";
        if (!q && !province) return Response.json({ matches: [], exact: false, locations: {}, system_only: null });

        let matches = [];
        let exact = false;
        const provCond = province ? " AND province = ?" : "";
        if (q) {
          const ex = await env.DB.prepare(
            `SELECT * FROM cooler_master WHERE (qr_norm = ? OR serial_norm = ? OR capex_norm = ?)${provCond} ORDER BY id LIMIT 10`
          ).bind(q, q, q, ...(province ? [province] : [])).all();
          matches = ex.results || [];
          exact = matches.length > 0;
          if (!exact && byOutlet && qRaw) {
            // ບໍ່ກົງ QR/Serial/CapEx -> ລອງ Outlet Code (ກົງເປ໊ະກ່ອນ, ບໍ່ພົບຄ່ອຍຂຶ້ນຕົ້ນດ້ວຍ) - ໃຊ້ index idx_cooler_master_outlet
            const oc = qRaw.trim();
            const ocUp = oc.toUpperCase();
            const orr = await env.DB.prepare(
              `SELECT * FROM cooler_master WHERE (outlet_code = ? OR outlet_code = ?)${provCond} ORDER BY id LIMIT ?`
            ).bind(oc, ocUp, ...(province ? [province] : []), limit).all();
            matches = orr.results || [];
            if (!matches.length && oc.length >= 3) {
              const ohi = ocUp + "\uffff";
              const opr = await env.DB.prepare(
                `SELECT * FROM cooler_master WHERE (outlet_code >= ? AND outlet_code < ?)${provCond} ORDER BY outlet_code, id LIMIT ?`
              ).bind(ocUp, ohi, ...(province ? [province] : []), limit).all();
              matches = opr.results || [];
            }
          }
          if (!exact && !matches.length && q.length >= 3) {
            // ບໍ່ພົບກົງເປ໊ະ -> ຄົ້ນແບບ "ຂຶ້ນຕົ້ນດ້ວຍ" ສະເພາະ QR/Serial/CapEx (ໃຊ້ range ເທິງ index ແທນ LIKE '%..%' ທີ່ scan ທັງຕາຕະລາງ)
            const hi = q + "\uffff";
            const pr = await env.DB.prepare(
              `SELECT * FROM cooler_master
                WHERE ((qr_norm >= ? AND qr_norm < ?) OR (serial_norm >= ? AND serial_norm < ?) OR (capex_norm >= ? AND capex_norm < ?))${provCond}
                ORDER BY id LIMIT ?`
            ).bind(q, hi, q, hi, q, hi, ...(province ? [province] : []), limit).all();
            matches = pr.results || [];
          }
          if (byOutlet && !matches.length && q.length >= 3) {
            // ຍັງບໍ່ພົບ -> ຄົ້ນແບບ "ມີຄຳນີ້ຢູ່ບ່ອນໃດກໍໄດ້" ໃນ QR / Serial / CapEx / Outlet Code (ພິມພຽງບາງສ່ວນໄດ້ ເຊັ່ນ 12345 ຈາກ CL-12345)
            // ໝາຍເຫດ: LIKE '%..%' ໃຊ້ index ບໍ່ໄດ້ (scan ທັງຕາຕະລາງ) ຈຶ່ງເຮັດສະເພາະເມື່ອ 3 ວິທີຂ້າງເທິງບໍ່ພົບ ແລະ ເປີດໃຊ້ສະເພາະໜ້າເພີ່ມຕູ້ສູນຫາຍ (outlet=1)
            const lk = "%" + cmLikeEscape(q) + "%";
            const cr = await env.DB.prepare(
              `SELECT * FROM cooler_master
                WHERE (qr_norm LIKE ? ESCAPE '\\' OR serial_norm LIKE ? ESCAPE '\\' OR capex_norm LIKE ? ESCAPE '\\' OR UPPER(COALESCE(outlet_code,'')) LIKE ? ESCAPE '\\')${provCond}
                ORDER BY id LIMIT ?`
            ).bind(lk, lk, lk, lk, ...(province ? [province] : []), limit).all();
            matches = cr.results || [];
          }
        } else {
          const pr = await env.DB.prepare(`SELECT * FROM cooler_master WHERE province = ? ORDER BY id LIMIT ?`).bind(province, limit).all();
          matches = pr.results || [];
        }

        // ກົງເປ໊ະ -> ຄົ້ນ "ຕຳແໜ່ງໃນລະບົບ" ຂອງແຕ່ລະໜ່ວຍ (ສູງສຸດ 5 ໜ່ວຍ ເພື່ອບໍ່ໃຫ້ query ຫຼາຍເກີນ) ດ້ວຍ batch ດຽວ
        const locations = {};
        let systemOnly = null;
        if (exact) {
          const subset = matches.slice(0, 5);
          const stmts = [];
          const owners = [];
          for (const m of subset) {
            const st = cmLocationStatements(env, [m.qr_code, m.serial_number, m.capex]);
            if (st) { stmts.push(...st); owners.push(m.id); }
          }
          if (stmts.length) {
            const rs = await env.DB.batch(stmts);
            owners.forEach((id, i) => { locations[id] = cmLocationsFromBatch(rs.slice(i * 5, i * 5 + 5)); });
          }
        } else if (q && !matches.length) {
          // ບໍ່ມີໃນ Master ເລີຍ -> ລອງເບິ່ງວ່າມີໃນລະບົບອື່ນບໍ (ເຊັ່ນ ຕູ້ໃໝ່ທີ່ຍັງບໍ່ໄດ້ໃສ່ Master)
          const st = cmLocationStatements(env, [q]);
          if (st) systemOnly = cmLocationsFromBatch(await env.DB.batch(st));
        }
        // ຕູ້ທີ່ຢູ່ໃນລາຍການ Lost Cooler (ຍັງບໍ່ປິດ) -> ໃຫ້ໜ້າຄົ້ນຫາສະແດງປ້າຍເຕືອນ (ຖ້າຍັງບໍ່ຮັນ migration_add_lost_coolers.sql ກໍບໍ່ກະທົບການຄົ້ນຫາ)
        const lost = {};
        if (matches.length) {
          try {
            const ids = matches.slice(0, 100).map((m) => m.id);
            const lr = await env.DB.prepare(
              `SELECT master_id, status FROM lost_coolers WHERE master_id IN (${ids.map(() => "?").join(",")}) AND status IN ('suspected','pending_smc','verifying','confirmed_lost')`
            ).bind(...ids).all();
            for (const r of (lr.results || [])) lost[r.master_id] = r.status;
          } catch (_) { /* ຍັງບໍ່ມີຕາຕະລາງ */ }
        }
        return Response.json({ matches, exact, locations, system_only: systemOnly, limit, lost });
      } catch (e) {
        console.error("/api/cooler-master/search", e);
        return Response.json({ error: "ຄົ້ນຫາບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // Import (admin): ຮັບ rows ເທື່ອລະ ~40 ແຖວ -> upsert ຕາມ QR -> Serial -> CapEx (ຈັບຄູ່ກັບແຖວເກົ່າໄດ້ກໍ່ແກ້ໄຂແທນສ້າງໃໝ່)
    if (url.pathname === "/api/admin/cooler-master/import" && request.method === "POST") {
      try {
        const body = await request.json();
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!rows.length) return Response.json({ error: "ບໍ່ພົບແຖວຂໍ້ມູນ" }, { status: 400 });
        if (rows.length > 50) return Response.json({ error: "ສົ່ງເທື່ອລະບໍ່ເກີນ 50 ແຖວ" }, { status: 400 });
        const actor = (session && session.email) || null;

        const items = [];
        const errors = [];
        rows.forEach((r, idx) => {
          const qr = cmClean(r.qr_code, 120), sn = cmClean(r.serial_number, 120), cx = cmClean(r.capex, 120);
          if (!qr && !sn && !cx) { errors.push({ index: idx, error: "ບໍ່ມີທັງ QR, Serial ແລະ CapEx" }); return; }
          let extra = null;
          if (r.extra && typeof r.extra === "object") {
            const e = {};
            for (const [k, v] of Object.entries(r.extra).slice(0, 30)) {
              const val = cmClean(v, 300);
              if (val) e[String(k).slice(0, 60)] = val;
            }
            if (Object.keys(e).length) extra = JSON.stringify(e);
          }
          items.push({
            index: idx, qr, sn, cx, extra,
            brand: cmClean(r.cooler_brand, 120), type: cmClean(r.cooler_type, 120), model: cmClean(r.cooler_model, 120),
            outlet_code: cmClean(r.outlet_code, 60), outlet_name: cmClean(r.outlet_name, 200),
            province: cmClean(r.province, 100), district: cmClean(r.district, 100),
            address: cmClean(r.address, 400), status: cmClean(r.status, 100), notes: cmClean(r.notes, 500),
            channel: cmClean(r.channel, 100), grade: cmClean(r.grade, 50), lat_position: cmClean(r.lat_position, 40), long_position: cmClean(r.long_position, 40),
            team: cmClean(r.team, 150), mde: cmClean(r.mde, 150), dsm: cmClean(r.dsm, 150), fsm: cmClean(r.fsm, 150),
          });
        });

        // 1) ຫາແຖວເດີມ (batch ດຽວ)
        const finds = items.map((it) => env.DB.prepare(
          `SELECT id FROM cooler_master WHERE (? != '' AND qr_norm = ?) OR (? != '' AND serial_norm = ?) OR (? != '' AND capex_norm = ?)
            ORDER BY (CASE WHEN ? != '' AND qr_norm = ? THEN 0 WHEN ? != '' AND serial_norm = ? THEN 1 ELSE 2 END) LIMIT 1`
        ).bind(
          cmNorm(it.qr), cmNorm(it.qr), cmNorm(it.sn), cmNorm(it.sn), cmNorm(it.cx), cmNorm(it.cx),
          cmNorm(it.qr), cmNorm(it.qr), cmNorm(it.sn), cmNorm(it.sn)
        ));
        const found = finds.length ? await env.DB.batch(finds) : [];

        // 2) ສ້າງຄຳສັ່ງ insert/update (batch ດຽວ). ຄ່າຫວ່າງໃນໄຟລ໌ໃໝ່ ຈະບໍ່ທັບຄ່າເດີມ (COALESCE)
        let inserted = 0, updated = 0;
        const writes = items.map((it, i) => {
          const existing = found[i] && found[i].results && found[i].results[0];
          const vals = [it.qr, it.sn, it.cx, cmNorm(it.qr) || null, cmNorm(it.sn) || null, cmNorm(it.cx) || null,
            it.brand, it.type, it.model, it.outlet_code, it.outlet_name, it.province, it.district, it.address, it.status, it.notes, it.extra,
            it.channel, it.grade, it.lat_position, it.long_position, it.team, it.mde, it.dsm, it.fsm];
          if (existing) {
            updated++;
            return env.DB.prepare(
              `UPDATE cooler_master SET
                 qr_code = COALESCE(?, qr_code), serial_number = COALESCE(?, serial_number), capex = COALESCE(?, capex),
                 qr_norm = COALESCE(?, qr_norm), serial_norm = COALESCE(?, serial_norm), capex_norm = COALESCE(?, capex_norm),
                 cooler_brand = COALESCE(?, cooler_brand), cooler_type = COALESCE(?, cooler_type), cooler_model = COALESCE(?, cooler_model),
                 outlet_code = COALESCE(?, outlet_code), outlet_name = COALESCE(?, outlet_name), province = COALESCE(?, province),
                 district = COALESCE(?, district), address = COALESCE(?, address), status = COALESCE(?, status),
                 notes = COALESCE(?, notes), extra_json = COALESCE(?, extra_json),
                 channel = COALESCE(?, channel), grade = COALESCE(?, grade), lat_position = COALESCE(?, lat_position), long_position = COALESCE(?, long_position),
                 team = COALESCE(?, team), mde = COALESCE(?, mde), dsm = COALESCE(?, dsm), fsm = COALESCE(?, fsm),
                 imported_by = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`
            ).bind(...vals, actor, existing.id);
          }
          inserted++;
          return env.DB.prepare(
            `INSERT INTO cooler_master
               (qr_code, serial_number, capex, qr_norm, serial_norm, capex_norm, cooler_brand, cooler_type, cooler_model,
                outlet_code, outlet_name, province, district, address, status, notes, extra_json,
                channel, grade, lat_position, long_position, team, mde, dsm, fsm, imported_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(...vals, actor);
        });
        if (writes.length) await env.DB.batch(writes);

        // Master ອັບເດດໃໝ່ ແລ້ວພົບວ່າຕູ້ທີ່ "ຢືນຢັນສູນຫາຍ" ໄປຢູ່ outlet ຈິງ (ບໍ່ແມ່ນ Lost cooler warehouse) -> ປ່ຽນເປັນ "ພົບຕູ້ແລ້ວ" ທັນທີ
        let lostFound = 0;
        try {
          const moved = [];
          items.forEach((it, i) => {
            const ex = found[i] && found[i].results && found[i].results[0];
            if (!ex || !(it.outlet_code || it.outlet_name)) return;
            if (lostIsWarehouse({ outlet_code: it.outlet_code, outlet_name: it.outlet_name })) return;
            moved.push({ id: ex.id, it });
          });
          if (moved.length) {
            const ids = [...new Set(moved.map((x) => x.id))];
            const q = await env.DB.prepare(
              `SELECT id, master_id FROM lost_coolers WHERE status = 'confirmed_lost' AND master_id IN (${ids.map(() => "?").join(",")})`
            ).bind(...ids).all();
            const hit = new Map((q.results || []).map((r) => [r.master_id, r.id]));
            if (hit.size) {
              const nowTs = new Date().toISOString().replace("T", " ").slice(0, 19);
              const done = new Set();
              const st = [];
              for (const { id, it } of moved) {
                const lid = hit.get(id);
                if (!lid || done.has(lid)) continue;
                done.add(lid);
                const loc = (String(it.outlet_name || "") + (it.outlet_code ? " [" + it.outlet_code + "]" : "") + (it.province ? " · " + it.province : "")).trim().slice(0, 300);
                const note = "ພົບອັດຕະໂນມັດ: Cooler Master ອັບເດດ ຕູ້ຢູ່ outlet " + loc;
                st.push(env.DB.prepare(
                  `UPDATE lost_coolers SET status = 'found', found_location = ?, verified_by = ?, verified_at = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND status = 'confirmed_lost'`
                ).bind(loc, actor, nowTs, note.slice(0, 500), lid));
                st.push(lostLogStmt(env, lid, "status", "confirmed_lost", "found", note.slice(0, 500), actor));
              }
              if (st.length) { await env.DB.batch(st); lostFound = done.size; }
            }
          }
        } catch (e) { console.error("cooler-master import: auto-found check", e); }
        return Response.json({ inserted, updated, skipped: errors.length, errors, lost_found: lostFound });
      } catch (e) {
        console.error("/api/admin/cooler-master/import", e);
        return Response.json({ error: "Import ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // ລຶບ 1 ແຖວ Master (admin)
    if (url.pathname === "/api/admin/cooler-master/delete" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM cooler_master WHERE id = ?").bind(id).run();
        try { await cmRefreshStats(env); } catch (_) {}
        return Response.json({ message: "ລຶບແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/cooler-master/delete", e);
        return Response.json({ error: "ລຶບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===== Manage Lost Cooler Master Data (admin) =====
    // ລາຍການ + ຈຳນວນແຍກຕາມສະຖານະ. params: status ('' = ທັງໝົດ | active | ຊື່ສະຖານະ), q, limit, offset, all=1 (Export ສູງສຸດ 5000 ແຖວ)
    if (url.pathname === "/api/admin/lost-coolers/list" && request.method === "GET") {
      try {
        const status = (url.searchParams.get("status") || "").trim();
        const qRaw = (url.searchParams.get("q") || "").trim().slice(0, 100);
        const all = url.searchParams.get("all") === "1";
        const limit = all ? 5000 : Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
        const offset = all ? 0 : Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

        const conds = [];
        const binds = [];
        if (status === "active") conds.push(`status IN ('suspected','pending_smc','verifying','confirmed_lost')`);
        else if (status) {
          if (![...LOST_EDITABLE, "excluded"].includes(status)) return Response.json({ error: "ສະຖານະບໍ່ຖືກຕ້ອງ" }, { status: 400 });
          conds.push("status = ?"); binds.push(status);
        }
        if (qRaw) {
          const like = "%" + cmLikeEscape(cmNorm(qRaw)) + "%";
          conds.push(`(qr_norm LIKE ? ESCAPE '\\' OR serial_norm LIKE ? ESCAPE '\\' OR capex_norm LIKE ? ESCAPE '\\'
            OR UPPER(COALESCE(outlet_code,'')) LIKE ? ESCAPE '\\' OR UPPER(COALESCE(outlet_name,'')) LIKE ? ESCAPE '\\' OR UPPER(COALESCE(province,'')) LIKE ? ESCAPE '\\'
            OR UPPER(COALESCE(dsm,'')) LIKE ? ESCAPE '\\' OR UPPER(COALESCE(mde,'')) LIKE ? ESCAPE '\\' OR UPPER(COALESCE(team,'')) LIKE ? ESCAPE '\\')`);
          binds.push(like, like, like, like, like, like, like, like, like);
        }
        const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
        const [cnt, tot, rows] = await env.DB.batch([
          env.DB.prepare("SELECT status, COUNT(*) AS n FROM lost_coolers GROUP BY status"),
          env.DB.prepare(`SELECT COUNT(*) AS n FROM lost_coolers ${where}`).bind(...binds),
          env.DB.prepare(`SELECT * FROM lost_coolers ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...binds, limit, offset),
        ]);
        const counts = {};
        for (const r of (cnt.results || [])) counts[r.status] = r.n;
        const items = (rows.results || []).map((r) => {
          const { master_snapshot_json, ...rest } = r;
          return { ...rest, has_snapshot: !!master_snapshot_json };
        });
        return Response.json({ items, counts, total: (tot.results && tot.results[0] && tot.results[0].n) || 0, limit, offset });
      } catch (e) {
        console.error("/api/admin/lost-coolers/list", e);
        return Response.json({ error: "ໂຫລດຂໍ້ມູນບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_lost_coolers.sql ແລະ migration_add_lost_cooler_report_fields.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/lost-coolers/logs" && request.method === "GET") {
      try {
        const id = parseInt(url.searchParams.get("id") || "", 10);
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const r = await env.DB.prepare("SELECT * FROM lost_cooler_logs WHERE lost_id = ? ORDER BY id DESC LIMIT 100").bind(id).all();
        return Response.json({ logs: r.results || [] });
      } catch (e) {
        console.error("/api/admin/lost-coolers/logs", e);
        return Response.json({ error: "ໂຫລດປະຫວັດບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ເພີ່ມຕູ້ເຂົ້າລາຍການ: ຮັບ QR / Serial / CapEx (ຫຼາຍໂຕໄດ້ ສູງສຸດ 100) ແລ້ວຈັບຄູ່ກັບ Cooler Master ແບບກົງເປ໊ະ
    // ບໍ່ພົບໃນ Master / ກົງກັບ Master ຫຼາຍແຖວ (ກຳກວມ) / ຢູ່ໃນລາຍການແລ້ວ -> ບໍ່ເພີ່ມ ແຕ່ລາຍງານກັບຄືນ
    if (url.pathname === "/api/admin/lost-coolers/add" && request.method === "POST") {
      try {
        const body = await request.json();
        const rawCodes = Array.isArray(body.codes) ? body.codes : String(body.codes || "").split(/[\n\r,;\t]+/);
        const codes = [...new Set(rawCodes.map((c) => cmNorm(c).slice(0, 120)).filter(Boolean))];
        // master_ids: ເລືອກຕູ້ຈາກຜົນຄົ້ນຫາ Cooler Master ໂດຍກົງ (ບໍ່ຕ້ອງຈັບຄູ່ດ້ວຍລະຫັດ)
        const fills = (body.fills && typeof body.fills === "object") ? body.fills : {}; // { [master_id]: ຂໍ້ມູນທີ່ຕື່ມເພີ່ມ }
        const masterIds = [...new Set((Array.isArray(body.master_ids) ? body.master_ids : []).map((x) => parseInt(x, 10)).filter((x) => x > 0))];
        if (!codes.length && !masterIds.length) return Response.json({ error: "ກະລຸນາເລືອກຕູ້ ຫຼື ປ້ອນ QR / Serial / CapEx ຢ່າງໜ້ອຍ 1 ໂຕ" }, { status: 400 });
        if (codes.length > 100 || masterIds.length > 100) return Response.json({ error: "ເພີ່ມເທື່ອລະບໍ່ເກີນ 100 ໂຕ" }, { status: 400 });
        const note = cmClean(body.note, 500);
        const actor = (session && session.email) || null;

        // ເລືອກຕູ້ດ້ວຍ master_ids (codes ຫວ່າງ) -> D1 batch([]) ຈະ error "No SQL statements detected" ຈຶ່ງຕ້ອງຂ້າມ
        const finds = codes.length ? await env.DB.batch(codes.map((c) => env.DB.prepare(
          `SELECT m.*, (SELECT l.id FROM lost_coolers l WHERE l.master_id = m.id AND l.status IN ('suspected','pending_smc','verifying','confirmed_lost') LIMIT 1) AS lost_id
             FROM cooler_master m WHERE m.qr_norm = ? OR m.serial_norm = ? OR m.capex_norm = ? ORDER BY m.id LIMIT 3`
        ).bind(c, c, c))) : [];

        const notFound = [], ambiguous = [], duplicates = [];
        const toAdd = [];
        const seenMaster = new Set();
        if (masterIds.length) {
          const mr = await env.DB.prepare(
            `SELECT m.*, (SELECT l.id FROM lost_coolers l WHERE l.master_id = m.id AND l.status IN ('suspected','pending_smc','verifying','confirmed_lost') LIMIT 1) AS lost_id
               FROM cooler_master m WHERE m.id IN (${masterIds.map(() => "?").join(",")})`
          ).bind(...masterIds).all();
          const byId = new Map((mr.results || []).map((m) => [m.id, m]));
          for (const id of masterIds) {
            const m = byId.get(id);
            if (!m) { notFound.push(String(id)); continue; }
            if (m.lost_id || seenMaster.has(m.id)) { duplicates.push(m.qr_code || m.serial_number || m.capex || String(id)); continue; }
            seenMaster.add(m.id);
            toAdd.push(m);
          }
        }
        codes.forEach((c, i) => {
          const rows = (finds[i] && finds[i].results) || [];
          if (!rows.length) { notFound.push(c); return; }
          if (rows.length > 1) { ambiguous.push(c); return; }
          const m = rows[0];
          if (m.lost_id || seenMaster.has(m.id)) { duplicates.push(c); return; }
          seenMaster.add(m.id);
          toAdd.push(m);
        });

        let added = 0;
        if (toAdd.length) {
          // ຂໍ້ມູນຕູ້/ຮ້ານ: ໃຊ້ຄ່າຈາກ Master ກ່ອນ, ຖ້າ Master ຫວ່າງ ຈຶ່ງໃຊ້ຄ່າທີ່ຜູ້ໃຊ້ຕື່ມ. ຖັນລາຍງານ (Channel/Grade/Team/...) ມາຈາກທີ່ຕື່ມເທົ່ານັ້ນ
          const pick = (mv, fv, max) => (mv != null && String(mv).trim() !== "" ? mv : cmClean(fv, max));
          const mdeAdd = toAdd.map((m) => { const ff = (fills[m.id] && typeof fills[m.id] === "object") ? fills[m.id] : {}; return cmClean(ff.mde, 150) || lostMasterExtras(m).mde; });
          const teamMapAdd = await lostTeamMap(env, mdeAdd);
          const ins = await env.DB.batch(toAdd.map((m, idx) => {
            const f = (fills[m.id] && typeof fills[m.id] === "object") ? fills[m.id] : {};
            const ex = lostMasterExtras(m);
            return env.DB.prepare(
              `INSERT INTO lost_coolers
                 (master_id, qr_code, serial_number, capex, qr_norm, serial_norm, capex_norm, cooler_brand, cooler_type, cooler_model,
                  outlet_code, outlet_name, province, district, address, master_status, status, reason, reported_by,
                  channel, grade, village, lat_position, long_position, dsm, mde, team, submit_date, fsm)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_smc', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(m.id, m.qr_code, m.serial_number, m.capex, m.qr_norm, m.serial_norm, m.capex_norm,
              pick(m.cooler_brand, f.cooler_brand, 100), pick(m.cooler_type, f.cooler_type, 100), m.cooler_model,
              pick(m.outlet_code, f.outlet_code, 100), pick(m.outlet_name, f.outlet_name, 200),
              pick(m.province, f.province, 100), pick(m.district, f.district, 100), m.address, m.status, note, actor,
              cmClean(f.channel, 100) || ex.channel, cmClean(f.grade, 50) || ex.grade, cmClean(f.village, 150) || ex.village,
              cmClean(f.lat_position, 40) || ex.lat_position, cmClean(f.long_position, 40) || ex.long_position,
              cmClean(f.dsm, 150) || ex.dsm, cmClean(f.mde, 150) || ex.mde, cmClean(f.team, 150) || ex.team || lostTeamFor(teamMapAdd, mdeAdd[idx]), cmClean(f.submit_date, 40),
              cmClean(f.fsm, 150) || ex.fsm);
          }));
          await env.DB.batch(ins.map((r) => lostLogStmt(env, r.meta.last_row_id, "add", null, "pending_smc", note, actor)));
          added = toAdd.length;
        }
        return Response.json({ added, duplicates, not_found: notFound, ambiguous });
      } catch (e) {
        console.error("/api/admin/lost-coolers/add", e);
        return Response.json({ error: "ເພີ່ມບໍ່ສຳເລັດ: " + String((e && e.message) || e).slice(0, 300) + " (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_lost_coolers.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // Import Excel (ແຈ້ງຕູ້ສູນຫາຍຈາກທີມ): ຫົວຖັນ QR Code, Brand, Cooler type, Serial Number, CAPEX, Outlet_Code, Outlet_Name, Channel, Grade,
    // Village, District, Province, Lat_Position, Long_Position, DSM, MDE, Team, date submit, status
    // ຈັບຄູ່ກັບ Cooler Master ດ້ວຍ QR / Serial / CapEx (ຕົງກັນແຖວດຽວເທົ່ານັ້ນ). ບໍ່ພົບ / ກຳກວມ / ຢູ່ໃນລາຍການແລ້ວ -> ຂ້າມ ແລ້ວລາຍງານກັບຄືນ
    // ຂໍ້ມູນຕູ້/ຮ້ານ ເອົາຈາກ Master ກ່ອນ (ຖ້າ Master ຫວ່າງ ຈຶ່ງໃຊ້ຄ່າຈາກ Excel). ສະຖານະ: ຮອງຮັບ suspected / pending_smc / verifying / confirmed_lost
    // (ຄ່າອື່ນລວມທັງ found ຈະເປັນ suspected ແລ້ວແຈ້ງໃນຜົນລັບ ເພາະ found ຕ້ອງລະບຸ \"ບ່ອນທີ່ພົບ\" ໃນລະບົບ)
    if (url.pathname === "/api/admin/lost-coolers/import" && request.method === "POST") {
      try {
        const body = await request.json();
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!rows.length) return Response.json({ error: "ບໍ່ມີຂໍ້ມູນ" }, { status: 400 });
        if (rows.length > 100) return Response.json({ error: "ນຳເຂົ້າເທື່ອລະບໍ່ເກີນ 100 ແຖວ" }, { status: 400 });
        const actor = (session && session.email) || null;
        const mapStatus = (v) => {
          const t = String(v == null ? "" : v).trim().toLowerCase().replace(/[\s_\-–]+/g, "");
          // "ສົງໄສ – ລໍກວດສອບ" ກັບ "Pending SMC MDE" ເປັນສະຖານະດຽວກັນ -> ທັງໝົດເປັນ pending_smc
          if (!t) return { status: "pending_smc", adjusted: false };
          if (["suspected", "pending", "new", "ສົງໄສ", "ສົງໄສລໍກວດສອບ", "pendingsmcmde", "pendingsmc", "smcmde", "smc"].includes(t)) return { status: "pending_smc", adjusted: false };
          if (["verifying", "checking", "ກຳລັງກວດສອບ", "pendingdsm", "pendingdsmຢືນຢັນ", "dsm"].includes(t)) return { status: "verifying", adjusted: false };
          if (["confirmedlost", "lost", "confirmed", "ຢືນຢັນສູນຫາຍ", "ສູນຫາຍ"].includes(t)) return { status: "confirmed_lost", adjusted: false };
          return { status: "pending_smc", adjusted: true };
        };

        const prepared = rows.map((r, i) => {
          const rowNo = parseInt(r && r.row_no, 10) || i + 2;
          const qr = cmClean(r && r.qr_code, 120), sn = cmClean(r && r.serial_number, 120), cx = cmClean(r && r.capex, 120);
          return { r: r || {}, rowNo, qr, sn, cx, qn: cmNorm(qr), snn: cmNorm(sn), cn: cmNorm(cx) };
        });
        const out = { added: 0, duplicates: [], not_found: [], ambiguous: [], no_code: [], status_adjusted: [] };
        const valid = prepared.filter((p) => {
          if (!p.qn && !p.snn && !p.cn) { out.no_code.push({ row: p.rowNo }); return false; }
          return true;
        });

        const finds = valid.length ? await env.DB.batch(valid.map((p) => env.DB.prepare(
          `SELECT m.*, (SELECT l.id FROM lost_coolers l WHERE l.master_id = m.id AND l.status IN ('suspected','pending_smc','verifying','confirmed_lost') LIMIT 1) AS lost_id
             FROM cooler_master m
            WHERE (? != '' AND m.qr_norm = ?) OR (? != '' AND m.serial_norm = ?) OR (? != '' AND m.capex_norm = ?)
            ORDER BY m.id LIMIT 3`
        ).bind(p.qn, p.qn, p.snn, p.snn, p.cn, p.cn))) : [];

        const toAdd = [];
        const oldRows = []; // ຕູ້ທີ່ຢືນຢັນສູນຫາຍແລ້ວ ແຕ່ບໍ່ມີໃນ Cooler Master (ຂໍ້ມູນເກົ່າ) - ນຳເຂົ້າຈາກ Excel ໂດຍກົງ
        const seenMaster = new Set();
        valid.forEach((p, i) => {
          const label = p.qr || p.sn || p.cx;
          const found = (finds[i] && finds[i].results) || [];
          if (!found.length) {
            const st0 = mapStatus(p.r.status);
            if (st0.status === "confirmed_lost" && !st0.adjusted) oldRows.push({ p, label });
            else out.not_found.push({ row: p.rowNo, code: label });
            return;
          }
          // ກົງກັບ Master ຫຼາຍແຖວ: ລອງແຄບລົງດ້ວຍ QR -> CAPEX -> Serial (ອັນທຳອິດທີ່ເຫຼືອແຖວດຽວ). Serial ໃນ Excel ມັກພິມຂາດ/ຜິດ ຈຶ່ງໄປຕົງກັບຕູ້ອື່ນ
          let cand = found;
          if (cand.length > 1) {
            for (const [col, val] of [["qr_norm", p.qn], ["capex_norm", p.cn], ["serial_norm", p.snn]]) {
              if (!val) continue;
              const sub = cand.filter((x) => String(x[col] || "").trim().toUpperCase() === val);
              if (sub.length === 1) { cand = sub; break; }
            }
          }
          if (cand.length > 1) { out.ambiguous.push({ row: p.rowNo, code: label }); return; }
          const m = cand[0];
          if (m.lost_id || seenMaster.has(m.id)) { out.duplicates.push({ row: p.rowNo, code: label }); return; }
          seenMaster.add(m.id);
          let st = mapStatus(p.r.status);
          // ຕູ້ຢູ່ "Lost cooler warehouse" ໃນ Master ແລະ Excel ບໍ່ໄດ້ໃສ່ສະຖານະ -> ຖືວ່າຢືນຢັນສູນຫາຍແລ້ວ
          if (!String(p.r.status == null ? "" : p.r.status).trim() && lostIsWarehouse(m)) st = { status: "confirmed_lost", adjusted: false };
          if (st.adjusted) out.status_adjusted.push({ row: p.rowNo, code: label, value: cmClean(p.r.status, 40) });
          toAdd.push({ p, m, status: st.status });
        });

        if (toAdd.length) {
          const nowTs = new Date().toISOString().replace("T", " ").slice(0, 19);
          const pick = (masterVal, excelVal, max) => (masterVal != null && String(masterVal).trim() !== "" ? masterVal : cmClean(excelVal, max));
          const mdeImp = toAdd.map(({ p, m }) => cmClean(p.r.mde, 150) || lostMasterExtras(m).mde);
          const teamMapImp = await lostTeamMap(env, mdeImp);
          const ins = await env.DB.batch(toAdd.map(({ p, m, status }, idx) => { const ex = lostMasterExtras(m); const wh = lostIsWarehouse(m); const pickO = (mv, ev, max) => (wh ? (cmClean(ev, max) || mv) : pick(mv, ev, max)); return env.DB.prepare(
            `INSERT INTO lost_coolers
               (master_id, qr_code, serial_number, capex, qr_norm, serial_norm, capex_norm, cooler_brand, cooler_type, cooler_model,
                outlet_code, outlet_name, province, district, address, master_status, status, reason, reported_by, verified_by, verified_at,
                channel, grade, village, lat_position, long_position, dsm, mde, team, submit_date, fsm)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            m.id, m.qr_code, m.serial_number, m.capex, m.qr_norm, m.serial_norm, m.capex_norm,
            pick(m.cooler_brand, p.r.cooler_brand, 100), pick(m.cooler_type, p.r.cooler_type, 100), m.cooler_model,
            // ຖ້າ Master ເກັບຕູ້ໄວ້ທີ່ Lost cooler warehouse ໃຫ້ໃຊ້ຮ້ານເດີມຈາກ Excel (ຮ້ານທີ່ຕູ້ຫາຍ) ກ່ອນ
            pickO(m.outlet_code, p.r.outlet_code, 100), pickO(m.outlet_name, p.r.outlet_name, 200),
            pickO(m.province, p.r.province, 100), pickO(m.district, p.r.district, 100), m.address, m.status,
            status, "ນຳເຂົ້າຈາກ Excel", actor,
            status === "confirmed_lost" ? actor : null, status === "confirmed_lost" ? nowTs : null,
            cmClean(p.r.channel, 100) || ex.channel, cmClean(p.r.grade, 50) || ex.grade, cmClean(p.r.village, 150) || ex.village,
            cmClean(p.r.lat_position, 40) || ex.lat_position, cmClean(p.r.long_position, 40) || ex.long_position,
            cmClean(p.r.dsm, 150) || ex.dsm, cmClean(p.r.mde, 150) || ex.mde, cmClean(p.r.team, 150) || ex.team || lostTeamFor(teamMapImp, mdeImp[idx]), cmClean(p.r.submit_date, 40),
            cmClean(p.r.fsm, 150) || ex.fsm
          ); }));
          await env.DB.batch(ins.map((r, i) => lostLogStmt(env, r.meta.last_row_id, "add", null, toAdd[i].status, "ນຳເຂົ້າຈາກ Excel", actor)));
          out.added = toAdd.length;
          // ຕູ້ທີ່ import ເປັນ "ຢືນຢັນສູນຫາຍ" ແລະ ຍັງບໍ່ຢູ່ສາງ Lost -> ຍ້າຍໃນ Cooler Master ໄປ "Lost cooler warehouse" (ຄ່າເດີມເກັບໄວ້ໃນລາຍການແລ້ວ)
          const whUpd = toAdd.filter(({ m, status }) => status === "confirmed_lost" && !lostIsWarehouse(m))
            .map(({ m }) => env.DB.prepare("UPDATE cooler_master SET outlet_code = ?, outlet_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(LOST_WH_CODE, LOST_WH_NAME, m.id));
          if (whUpd.length) { await env.DB.batch(whUpd); try { await cmRefreshStats(env); } catch (_) {} }
        }
        // ຂໍ້ມູນເກົ່າ: ຢືນຢັນສູນຫາຍແລ້ວ ແລະ ບໍ່ມີໃນ Cooler Master -> ບັນທຶກຈາກ Excel (master_id = NULL), ຕັດຊ້ຳກັບລາຍການທີ່ມີແລ້ວ ແລະ ແຖວຊ້ຳໃນໄຟລ໌
        out.added_no_master = 0;
        if (oldRows.length) {
          const dupChecks = await env.DB.batch(oldRows.map(({ p }) => env.DB.prepare(
            `SELECT id FROM lost_coolers WHERE status IN ('suspected','pending_smc','verifying','confirmed_lost')
                AND ((? != '' AND qr_norm = ?) OR (? != '' AND serial_norm = ?) OR (? != '' AND capex_norm = ?)) LIMIT 1`
          ).bind(p.qn, p.qn, p.snn, p.snn, p.cn, p.cn)));
          const seenKeys = new Set();
          const oldAdd = [];
          oldRows.forEach(({ p, label }, i) => {
            const keys = [p.qn, p.snn, p.cn].filter(Boolean);
            const exists = dupChecks[i] && dupChecks[i].results && dupChecks[i].results.length;
            if (exists || keys.some((k) => seenKeys.has(k))) { out.duplicates.push({ row: p.rowNo, code: label }); return; }
            keys.forEach((k) => seenKeys.add(k));
            oldAdd.push({ p, label });
          });
          if (oldAdd.length) {
            const nowTs2 = new Date().toISOString().replace("T", " ").slice(0, 19);
            const mdeOld = oldAdd.map(({ p }) => cmClean(p.r.mde, 150));
            const teamMapOld = await lostTeamMap(env, mdeOld);
            const insOld = await env.DB.batch(oldAdd.map(({ p }, idx) => env.DB.prepare(
              `INSERT INTO lost_coolers
                 (master_id, qr_code, serial_number, capex, qr_norm, serial_norm, capex_norm, cooler_brand, cooler_type, cooler_model,
                  outlet_code, outlet_name, province, district, address, master_status, status, reason, reported_by, verified_by, verified_at,
                  channel, grade, village, lat_position, long_position, dsm, mde, team, submit_date, fsm)
               VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'confirmed_lost', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              p.qr, p.sn, p.cx, p.qn || null, p.snn || null, p.cn || null,
              cmClean(p.r.cooler_brand, 100), cmClean(p.r.cooler_type, 100), cmClean(p.r.cooler_model, 100),
              cmClean(p.r.outlet_code, 100), cmClean(p.r.outlet_name, 200), cmClean(p.r.province, 100), cmClean(p.r.district, 100),
              "ບໍ່ມີໃນ Cooler Master (ຂໍ້ມູນເກົ່າ)", "ນຳເຂົ້າຈາກ Excel (ຂໍ້ມູນເກົ່າ ຢືນຢັນສູນຫາຍແລ້ວ)", actor, actor, nowTs2,
              cmClean(p.r.channel, 100), cmClean(p.r.grade, 50), cmClean(p.r.village, 150),
              cmClean(p.r.lat_position, 40), cmClean(p.r.long_position, 40),
              cmClean(p.r.dsm, 150), mdeOld[idx], cmClean(p.r.team, 150) || lostTeamFor(teamMapOld, mdeOld[idx]), cmClean(p.r.submit_date, 40),
              cmClean(p.r.fsm, 150)
            )));
            await env.DB.batch(insOld.map((r) => lostLogStmt(env, r.meta.last_row_id, "add", null, "confirmed_lost", "ນຳເຂົ້າຈາກ Excel (ຂໍ້ມູນເກົ່າ ບໍ່ມີໃນ Cooler Master)", actor)));
            out.added_no_master = oldAdd.length;
            out.added += oldAdd.length;
          }
        }
        return Response.json(out);
      } catch (e) {
        console.error("/api/admin/lost-coolers/import", e);
        return Response.json({ error: "ນຳເຂົ້າບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_lost_cooler_report_fields.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // ແກ້ໄຂສະຖານະ / ໝາຍເຫດ / ບ່ອນພົບຕູ້. ຢືນຢັນສູນຫາຍ ຫຼື ພົບຕູ້ = "ກວດສອບແລ້ວ" (ບັນທຶກຜູ້ກວດ + ເວລາ)
    if (url.pathname === "/api/admin/lost-coolers/update" && request.method === "POST") {
      try {
        const body = await request.json();
        const id = parseInt(body.id, 10);
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const row = await env.DB.prepare("SELECT * FROM lost_coolers WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 404 });
        if (row.status === "excluded") return Response.json({ error: "ຕູ້ນີ້ຖືກຄັດອອກຈາກ Master ແລ້ວ ກະລຸນາກູ້ຄືນກ່ອນ ຈຶ່ງແກ້ໄຂໄດ້" }, { status: 400 });
        const actor = (session && session.email) || null;

        let newStatus = body.status ? String(body.status) : row.status;
        if (newStatus === "suspected") newStatus = "pending_smc"; // ລວມ "ສົງໄສ" ເຂົ້າ Pending SMC MDE
        if (!LOST_EDITABLE.includes(newStatus)) return Response.json({ error: "ສະຖານະບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        const note = cmClean(body.note, 500);
        const foundLocation = body.found_location !== undefined ? cmClean(body.found_location, 300) : row.found_location;
        if (newStatus === "found" && !foundLocation) {
          return Response.json({ error: "ພົບຕູ້ແລ້ວ ກະລຸນາລະບຸບ່ອນທີ່ພົບຕູ້" }, { status: 400 });
        }
        const changed = newStatus !== row.status;
        let verifiedBy = row.verified_by, verifiedAt = row.verified_at;
        if (changed) {
          if (newStatus === "confirmed_lost" || newStatus === "found") { verifiedBy = actor; verifiedAt = new Date().toISOString().replace("T", " ").slice(0, 19); }
          else { verifiedBy = null; verifiedAt = null; }
        }
        const stmts = [
          env.DB.prepare(
            `UPDATE lost_coolers SET status = ?, reason = ?, found_location = ?, verified_by = ?, verified_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(newStatus, note || row.reason, newStatus === "found" ? foundLocation : (foundLocation || null), verifiedBy, verifiedAt, id),
          lostLogStmt(env, id, changed ? "status" : "edit", row.status, newStatus, note, actor),
        ];
        let masterTouched = false;
        if (changed && row.master_id) {
          if (newStatus === "confirmed_lost") {
            // ຢືນຢັນສູນຫາຍ -> ຍ້າຍຕູ້ໃນ Cooler Master ໄປ outlet/ສາງ "Lost cooler warehouse" ອັດຕະໂນມັດ
            stmts.push(env.DB.prepare("UPDATE cooler_master SET outlet_code = ?, outlet_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(LOST_WH_CODE, LOST_WH_NAME, row.master_id));
            masterTouched = true;
          } else if (row.status === "confirmed_lost") {
            // ອອກຈາກ "ຢືນຢັນສູນຫາຍ" (ພົບຕູ້/ກັບໄປກວດ) -> ຄືນ outlet ເດີມ (ຄ່າທີ່ເກັບໄວ້ຕອນເພີ່ມເຂົ້າລາຍການ) ຖ້າ Master ຍັງຢູ່ສາງ Lost
            const mrow = await env.DB.prepare("SELECT outlet_code, outlet_name FROM cooler_master WHERE id = ?").bind(row.master_id).first();
            if (mrow && lostIsWarehouse(mrow) && (row.outlet_code || row.outlet_name) && !lostIsWarehouse(row)) {
              stmts.push(env.DB.prepare("UPDATE cooler_master SET outlet_code = ?, outlet_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.outlet_code || null, row.outlet_name || null, row.master_id));
              masterTouched = true;
            }
          }
        }
        await env.DB.batch(stmts);
        if (masterTouched) { try { await cmRefreshStats(env); } catch (_) {} }
        return Response.json({ message: "ບັນທຶກແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/lost-coolers/update", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຍົກເລີກຂັ້ນຕອນ "ຄັດອອກຈາກ Master" ແລ້ວ: ຂັ້ນສຸດທ້າຍແມ່ນ "ຢືນຢັນສູນຫາຍ". ຕອນ update Cooler Master ຕູ້ເຫຼົ່ານີ້ຈະໄປຢູ່ outlet/ສາງ "Lost cooler warehouse" ເອງ
    if (url.pathname === "/api/admin/lost-coolers/exclude" && request.method === "POST") {
      return Response.json({ error: "ຂັ້ນຕອນ \"ຄັດອອກຈາກ Master\" ຖືກຍົກເລີກແລ້ວ - ຂັ້ນສຸດທ້າຍແມ່ນ \"ຢືນຢັນສູນຫາຍ\" (ໃນ Master ຕູ້ຈະຢູ່ສາງ Lost cooler warehouse)" }, { status: 410 });
    }

    // ກູ້ຄືນຕູ້ທີ່ຄັດອອກແລ້ວ ເຂົ້າ Cooler Master ຕາມ snapshot (ສະຖານະກັບໄປເປັນ "Pending DSM ຢືນຢັນ" / verifying)
    if (url.pathname === "/api/admin/lost-coolers/restore" && request.method === "POST") {
      try {
        const body = await request.json();
        const id = parseInt(body.id, 10);
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const row = await env.DB.prepare("SELECT * FROM lost_coolers WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 404 });
        if (row.status !== "excluded" || !row.master_snapshot_json) return Response.json({ error: "ກູ້ຄືນໄດ້ສະເພາະຕູ້ທີ່ຄັດອອກແລ້ວ" }, { status: 400 });
        let m;
        try { m = JSON.parse(row.master_snapshot_json); } catch (_) { return Response.json({ error: "ຂໍ້ມູນ snapshot ເສຍຮູບແບບ" }, { status: 500 }); }
        const qn = cmNorm(m.qr_code), sn = cmNorm(m.serial_number), cn = cmNorm(m.capex);
        const dup = await env.DB.prepare(
          `SELECT id FROM cooler_master WHERE (? != '' AND qr_norm = ?) OR (? != '' AND serial_norm = ?) OR (? != '' AND capex_norm = ?) LIMIT 1`
        ).bind(qn, qn, sn, sn, cn, cn).first();
        if (dup) return Response.json({ error: "ມີຕູ້ທີ່ QR/Serial/CapEx ຕົງກັນໃນ Cooler Master ແລ້ວ ກູ້ຄືນບໍ່ໄດ້" }, { status: 400 });
        const actor = (session && session.email) || null;
        const ins = await env.DB.prepare(
          `INSERT INTO cooler_master
             (qr_code, serial_number, capex, qr_norm, serial_norm, capex_norm, cooler_brand, cooler_type, cooler_model,
              outlet_code, outlet_name, province, district, address, status, notes, extra_json, imported_by,
              channel, grade, lat_position, long_position, team, mde, dsm, fsm, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`
        ).bind(
          m.qr_code ?? null, m.serial_number ?? null, m.capex ?? null, qn || null, sn || null, cn || null,
          m.cooler_brand ?? null, m.cooler_type ?? null, m.cooler_model ?? null, m.outlet_code ?? null, m.outlet_name ?? null,
          m.province ?? null, m.district ?? null, m.address ?? null, m.status ?? null, m.notes ?? null, m.extra_json ?? null,
          m.imported_by ?? null,
          m.channel ?? null, m.grade ?? null, m.lat_position ?? null, m.long_position ?? null, m.team ?? null, m.mde ?? null, m.dsm ?? null, m.fsm ?? null,
          m.created_at ?? null
        ).run();
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE lost_coolers SET status = 'verifying', master_id = ?, master_snapshot_json = NULL, excluded_by = NULL, excluded_at = NULL,
               verified_by = NULL, verified_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(ins.meta.last_row_id, id),
          lostLogStmt(env, id, "restore", "excluded", "verifying", null, actor),
        ]);
        try { await cmRefreshStats(env); } catch (_) {}
        return Response.json({ message: "ກູ້ຄືນເຂົ້າ Cooler Master ແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/lost-coolers/restore", e);
        return Response.json({ error: "ກູ້ຄືນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ລຶບລາຍການອອກຈາກລາຍການ Lost (ບໍ່ກະທົບ Cooler Master). ຕູ້ທີ່ຄັດອອກແລ້ວ ຕ້ອງກູ້ຄືນກ່ອນ ບໍ່ດັ່ງນັ້ນ snapshot ຈະຫາຍ
    if (url.pathname === "/api/admin/lost-coolers/delete" && request.method === "POST") {
      try {
        const body = await request.json();
        const id = parseInt(body.id, 10);
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const row = await env.DB.prepare("SELECT status FROM lost_coolers WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 404 });
        if (row.status === "excluded") return Response.json({ error: "ຕູ້ນີ້ຖືກຄັດອອກຈາກ Master ແລ້ວ ກະລຸນາກູ້ຄືນກ່ອນ ຈຶ່ງລຶບໄດ້" }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare("DELETE FROM lost_cooler_logs WHERE lost_id = ?").bind(id),
          env.DB.prepare("DELETE FROM lost_coolers WHERE id = ?").bind(id),
        ]);
        return Response.json({ message: "ລຶບແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/lost-coolers/delete", e);
        return Response.json({ error: "ລຶບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ເຕືອນສະຕ໋ອກສາງຕ່ຳກວ່າງົບທີ່ຍັງຄ້າງເບີກ (ສະແດງເທິງໜ້າສະຕ໋ອກສາງ)
    if (url.pathname === "/api/warehouse-stock/budget-alerts" && request.method === "GET") {
      try {
        return Response.json(await computeStockBudgetAlerts(env));
      } catch (e) {
        console.error("/api/warehouse-stock/budget-alerts", e);
        return Response.json([]);
      }
    }

    // API ສະຕັອກເຄື່ອງໃນສາງ (Warehouse Stock) - ດຶງລາຍການ (admin/warehouse/delivery ເບິ່ງໄດ້)
    // ຮອງຮັບ query: warehouse_id, status, cooler_status, search (ຄົ້ນ QR/Serial/CapEx/Model)
    if (url.pathname === "/api/warehouse-stock" && request.method === "GET") {
      const warehouseId = url.searchParams.get("warehouse_id");
      const status = url.searchParams.get("status");
      const coolerStatus = url.searchParams.get("cooler_status");
      const search = (url.searchParams.get("search") || "").trim();

      let sql = `SELECT ws.*, w.code AS warehouse_code, w.name AS warehouse_name
                 FROM warehouse_stock ws
                 JOIN wh_warehouses w ON w.id = ws.warehouse_id
                 WHERE 1=1`;
      const binds = [];
      if (warehouseId) { sql += " AND ws.warehouse_id = ?"; binds.push(warehouseId); }
      if (status) { sql += " AND ws.status = ?"; binds.push(status); }
      if (coolerStatus) { sql += " AND ws.cooler_status = ?"; binds.push(coolerStatus); }
      if (search) {
        sql += " AND (ws.qr_code LIKE ? OR ws.serial_number LIKE ? OR ws.capex LIKE ? OR ws.cooler_model LIKE ?)";
        const like = `%${search}%`;
        binds.push(like, like, like, like);
      }
      sql += " ORDER BY ws.updated_at DESC";

      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return Response.json(results || []);
    }

    // API ສະຕັອກເຄື່ອງໃນສາງ - ເພີ່ມ/ແກ້ໄຂ (admin/warehouse)
    // - ຖ້າບໍ່ສົ່ງ id ມາ ແຕ່ມີ qr_code ຫຼື serial_number ທີ່ກົງກັບລາຍການເກົ່າໃນສາງດຽວກັນ -> ແກ້ໄຂລາຍການເດີມແທນ (ກັນຊ້ຳຕອນ Import ຄືນ)
    // - ທຸກການສ້າງ/ແກ້ໄຂ/ລຶບ ຈະຖືກບັນທຶກໄວ້ໃນ warehouse_stock_history
    if (url.pathname === "/api/admin/save-warehouse-stock" && request.method === "POST") {
      try {
        const {
          id, warehouse_id, cooler_brand, cooler_type, cooler_model,
          cooler_status, qr_code, serial_number, capex, status, notes
        } = await request.json();

        if (!warehouse_id || !cooler_brand || !cooler_type) {
          return Response.json({ error: "ກະລຸນາເລືອກສາງ, ປ້ອນ Brand ແລະ Type" }, { status: 400 });
        }
        const wh = await env.DB.prepare("SELECT id FROM wh_warehouses WHERE id = ?").bind(warehouse_id).first();
        if (!wh) return Response.json({ error: "ບໍ່ພົບສາງທີ່ເລືອກ" }, { status: 400 });

        const coolerStatusVal = ["new", "second_hand", "broken"].includes(cooler_status) ? cooler_status : "new";
        let statusVal = ["in_warehouse", "reserved", "on_truck", "outlet", "event", "shipped_out", "pending_write_off", "write_off"].includes(status) ? status : "in_warehouse";
        const actorEmail = (session && session.email) || null;

        // ຖ້າ QR/Serial ນີ້ ຕົງກັບ Asset ທີ່ຈັດສົ່ງໄປຮ້ານແລ້ວ (status ສຳເລັດ ແລະ ບໍ່ແມ່ນ doc_type "ເກັບຄືນສາງ")
        // -> ຕູ້ນີ້ຢູ່ຮ້ານແລ້ວ ບໍ່ແມ່ນຢູ່ໃນສາງ -> ບັງຄັບ status ເປັນ "outlet" ໃຫ້ອັດຕະໂນມັດ (ກັນກໍລະນີ Backfill ຂໍ້ມູນເກົ່າເຂົ້າສະຕ໋ອກ ແລ້ວຫຼົງເຫຼືອເປັນ "ຢູ່ໃນສາງ" ທັງທີ່ຄວາມຈິງອອກໄປແລ້ວ)
        let autoOutletNote = null;
        if (statusVal !== 'outlet' && (qr_code || serial_number)) {
          const deployedAsset = await env.DB.prepare(
            `SELECT tracking_no, outlet_name FROM assets
               WHERE status = ? AND IFNULL(doc_type, '') != ?
                 AND ((qr_code = ? AND qr_code != '') OR (serial_number = ? AND serial_number != ''))
               LIMIT 1`
          ).bind(DELIVERED_STATUS, RETURN_TO_WAREHOUSE_DOC_TYPE, qr_code || '__none__', serial_number || '__none__').first();
          if (deployedAsset) {
            statusVal = 'outlet';
            autoOutletNote = ` (ອັດຕະໂນມັດປ່ຽນເປັນ "ອອກຮ້ານແລ້ວ" ເພາະ QR/Serial ນີ້ກົງກັບ Asset Tracking No ${deployedAsset.tracking_no} ທີ່ຈັດສົ່ງໄປຮ້ານ "${deployedAsset.outlet_name || '-'}" ແລ້ວ)`;
          }
        }
        // QR/Serial ກົງກັບ Asset ທີ່ອະນຸມັດແລ້ວ ແຕ່ຍັງບໍ່ທັນຈັດສົ່ງສຳເລັດ -> "ຈອງແລ້ວ" (reserved)
        if (statusVal === 'in_warehouse' && (qr_code || serial_number)) {
          const pendingAsset = await env.DB.prepare(
            `SELECT tracking_no, outlet_name FROM assets
               WHERE IFNULL(status, '') != ? AND IFNULL(doc_type, '') != ?
                 AND ((qr_code = ? AND qr_code != '') OR (serial_number = ? AND serial_number != ''))
               LIMIT 1`
          ).bind(DELIVERED_STATUS, RETURN_TO_WAREHOUSE_DOC_TYPE, qr_code || '__none__', serial_number || '__none__').first();
          if (pendingAsset) {
            statusVal = 'reserved';
            autoOutletNote = ` (ອັດຕະໂນມັດປ່ຽນເປັນ "ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ" ເພາະ QR/Serial ນີ້ກົງກັບ Asset Tracking No ${pendingAsset.tracking_no} ທີ່ຍັງບໍ່ທັນຈັດສົ່ງ)`;
          }
        }

        let targetId = id || null;
        let existing = null;
        if (targetId) {
          existing = await env.DB.prepare("SELECT * FROM warehouse_stock WHERE id = ?").bind(targetId).first();
        } else if (qr_code || serial_number) {
          // ພະຍາຍາມຫາລາຍການເກົ່າໃນສາງດຽວກັນທີ່ QR ຫຼື Serial ກົງກັນ (ໃຊ້ຕອນ Import)
          if (qr_code) {
            existing = await env.DB.prepare(
              "SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND qr_code = ? AND qr_code != ''"
            ).bind(warehouse_id, qr_code).first();
          }
          if (!existing && serial_number) {
            existing = await env.DB.prepare(
              "SELECT * FROM warehouse_stock WHERE warehouse_id = ? AND serial_number = ? AND serial_number != ''"
            ).bind(warehouse_id, serial_number).first();
          }
          if (existing) targetId = existing.id;
        }

        // ກັນ QR/Serial/CapEx ຊໍ້າກັບແຖວອື່ນ (ບໍ່ຈຳກັດສະເພາະສາງດຽວກັນ - ກວດທົ່ວທັງລະບົບ)
        const dupError = await findQrSerialCapexDuplicate(env, "warehouse_stock", { qr_code, serial_number, capex }, targetId);
        if (dupError) return Response.json({ error: dupError }, { status: 400 });

        if (targetId) {
          await env.DB.prepare(
            `UPDATE warehouse_stock SET
               warehouse_id = ?, cooler_brand = ?, cooler_type = ?, cooler_model = ?,
               cooler_status = ?, qr_code = ?, serial_number = ?, capex = ?, status = ?, notes = ?,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          ).bind(
            warehouse_id, cooler_brand, cooler_type, cooler_model || null,
            coolerStatusVal, qr_code || null, serial_number || null, capex || null, statusVal, notes || null,
            targetId
          ).run();
          await env.DB.prepare(
            `INSERT INTO warehouse_stock_history
               (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
             VALUES (?, ?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            targetId, warehouse_id, existing ? existing.warehouse_id : null, cooler_brand, cooler_type, cooler_model || null,
            qr_code || null, serial_number || null, capex || null,
            existing ? existing.status : null, statusVal, actorEmail, notes || null
          ).run();
          return Response.json({ message: (existing && id ? "ແກ້ໄຂຂໍ້ມູນສະຕັອກຮຽບຮ້ອຍແລ້ວ" : "ແກ້ໄຂລາຍການເດີມ (ພົບ QR/Serial ຊ້ຳ) ຮຽບຮ້ອຍແລ້ວ") + (autoOutletNote || '') });
        } else {
          const inserted = await env.DB.prepare(
            `INSERT INTO warehouse_stock
               (warehouse_id, cooler_brand, cooler_type, cooler_model, cooler_status, qr_code, serial_number, capex, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            warehouse_id, cooler_brand, cooler_type, cooler_model || null,
            coolerStatusVal, qr_code || null, serial_number || null, capex || null, statusVal, notes || null
          ).run();
          const newId = inserted.meta ? inserted.meta.last_row_id : null;
          await env.DB.prepare(
            `INSERT INTO warehouse_stock_history
               (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
             VALUES (?, ?, NULL, 'create', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
          ).bind(
            newId, warehouse_id, cooler_brand, cooler_type, cooler_model || null,
            qr_code || null, serial_number || null, capex || null, statusVal, actorEmail, notes || null
          ).run();
          return Response.json({ message: "ເພີ່ມລາຍການສະຕັອກຮຽບຮ້ອຍແລ້ວ" + (autoOutletNote || '') });
        }
      } catch (e) {
        console.error("/api/admin/save-warehouse-stock", e);
        return Response.json({ error: "ບໍ່ສາມາດບັນທຶກຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // API ສະຕັອກເຄື່ອງໃນສາງ - ລຶບ (admin/warehouse)
    if (url.pathname === "/api/admin/delete-warehouse-stock" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        const existing = await env.DB.prepare("SELECT * FROM warehouse_stock WHERE id = ?").bind(id).first();
        const delStockRes = await env.DB.prepare("DELETE FROM warehouse_stock WHERE id = ?").bind(id).run();
        // ກົດລຶບຊ້ຳ/ພ້ອມກັນ: ບັນທຶກປະຫວັດ 'delete' ສະເພາະຄຳຂໍທີ່ລຶບແຖວໄດ້ຈິງ (changes > 0)
        if (existing && delStockRes.meta && delStockRes.meta.changes > 0) {
          const actorEmail = (session && session.email) || null;
          await env.DB.prepare(
            `INSERT INTO warehouse_stock_history
               (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by)
             VALUES (?, ?, ?, 'delete', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
          ).bind(
            // ໝາຍເຫດ: ເກັບ stock_id ເດີມໄວ້ (ເຖິງລາຍການຈະຖືກລຶບແລ້ວ) ເພື່ອໃຫ້ຈັດກຸ່ມປະຫວັດຂອງ asset ດຽວກັນໄດ້
            existing.id, existing.warehouse_id, existing.warehouse_id, existing.cooler_brand, existing.cooler_type, existing.cooler_model,
            existing.qr_code, existing.serial_number, existing.capex, existing.status, actorEmail
          ).run();
        }
        return Response.json({ message: "ລຶບລາຍການສະຕັອກຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-warehouse-stock", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // ===================== ຕູ້ແຊ່ເຂົ້າໃຫມ່ (new_coolers) =====================
    // /api/admin/* ຖືກຈຳກັດສະເພາະ admin ໂດຍດ່ານກວດສິດດ້ານເທິງແລ້ວ
    // ດຶງລາຍການທັງໝົດ (ຍັງບໍ່ຮັບ + ຮັບແລ້ວ)
    if (url.pathname === "/api/admin/new-coolers" && request.method === "GET") {
      // ?ids=1,2,3 -> ດຶງສະເພາະແຖວທີ່ປ່ຽນ (ໜ້າເວັບໃຊ້ອັບເດດແຖວ ແທນການໂຫຼດທັງຕາຕະລາງຄືນທຸກຄັ້ງທີ່ສະແກນ — ຫຼຸດ D1 rows read)
      const idsParam = url.searchParams.get("ids");
      let idList = null;
      if (idsParam !== null) {
        idList = [...new Set(idsParam.split(",").map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 100);
        if (!idList.length) return Response.json([]);
      }
      const where = idList ? `WHERE n.id IN (${idList.map(() => "?").join(",")})` : "";
      const tail = idList ? "ORDER BY n.id DESC" : "ORDER BY n.id DESC LIMIT 5000";
      const binds = idList || [];
      const { results } = await env.DB.prepare(
        `SELECT n.*, w.name AS warehouse_name, t.trip_no AS trip_no
           FROM new_coolers n
           LEFT JOIN wh_warehouses w ON w.id = n.received_warehouse_id
           LEFT JOIN ship_trips t ON t.id = n.trip_id
          ${where} ${tail}`
      ).bind(...binds).all();
      return Response.json(results || []);
    }

    // Import ລາຍການຕູ້ໃໝ່ (frontend ອ່ານ Excel/CSV ແລ້ວສົ່ງມາເປັນກ້ອນລະບໍ່ເກີນ 200 ແຖວ)
    // ຂ້າມແຖວທີ່ຂາດ Brand/Type, ບໍ່ມີ QR/Serial/CapEx ເລີຍ, ຫຼື ຊ້ຳກັບ new_coolers / warehouse_stock / ແຖວອື່ນໃນໄຟລ໌
    if (url.pathname === "/api/admin/import-new-coolers" && request.method === "POST") {
      try {
        const body = await request.json();
        const rows = Array.isArray(body.rows) ? body.rows.slice(0, 200) : [];
        if (!rows.length) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນທີ່ຈະນຳເຂົ້າ" }, { status: 400 });
        const actorEmail = (session && session.email) || null;
        const clean = (v) => (v === null || v === undefined ? "" : String(v)).trim();
        const items = rows.map((r) => ({
          cooler_brand: clean(r.cooler_brand),
          cooler_type: clean(r.cooler_type),
          cooler_model: clean(r.cooler_model),
          qr_code: clean(r.qr_code),
          serial_number: clean(r.serial_number),
          capex: clean(r.capex),
          notes: clean(r.notes),
        }));

        // ດຶງຄ່າທີ່ມີຢູ່ແລ້ວທັງໝົດຄັ້ງດຽວ (ແທນທີ່ຈະກວດທີລະແຖວ) ເພື່ອບໍ່ໃຫ້ເກີນຈຳນວນ query ຕໍ່ request
        const fields = ["qr_code", "serial_number", "capex"];
        // new_coolers ເກັບເປັນ Map(ຄ່າ -> {id, status}) ເພື່ອຮູ້ວ່າແຖວເດີມແມ່ນໃຜ (ໃຊ້ທັບຂໍ້ມູນຕາມ QR Code); warehouse_stock ເກັບເປັນ Set
        const existing = { new_coolers: {}, warehouse_stock: {} };
        for (const table of Object.keys(existing)) {
          for (const f of fields) {
            existing[table][f] = table === "new_coolers" ? new Map() : new Set();
            const vals = [...new Set(items.map((i) => i[f].toUpperCase()).filter(Boolean))];
            for (let i = 0; i < vals.length; i += 80) {
              const chunk = vals.slice(i, i + 80);
              const { results } = await env.DB.prepare(
                `SELECT ${table === "new_coolers" ? "id, status, " : ""}UPPER(${f}) AS v FROM ${table} WHERE ${f} COLLATE NOCASE IN (${chunk.map(() => "?").join(",")})`
              ).bind(...chunk).all();
              (results || []).forEach((r) => {
                if (table === "new_coolers") existing[table][f].set(r.v, { id: r.id, status: r.status });
                else existing[table][f].add(r.v);
              });
            }
          }
        }

        const fieldLabel = { qr_code: "QR Code", serial_number: "Serial Number", capex: "CapEx" };
        const seen = { qr_code: new Set(), serial_number: new Set(), capex: new Set() };
        const errors = [];
        const stmts = [];
        let insertedCount = 0, updatedCount = 0;
        const adjusted = [];
        for (const it of items) {
          const label = it.qr_code || it.serial_number || it.capex || "(ແຖວບໍ່ມີ QR/Serial/CapEx)";
          if (!it.qr_code && !it.serial_number && !it.capex) { errors.push({ label, reason: "ຕ້ອງມີ QR Code, Serial Number ຫຼື CapEx ຢ່າງໜ້ອຍໜຶ່ງຢ່າງ" }); continue; }
          if (!it.cooler_brand || !it.cooler_type) { errors.push({ label, reason: "ຂາດ Cooler Brand ຫຼື Cooler Type" }); continue; }
          // QR Code ເປັນຫຼັກ: ຖ້າ QR ກົງກັບຕູ້ໃໝ່ທີ່ນຳເຂົ້າໄວ້ແລ້ວ -> ທັບຂໍ້ມູນເດີມ (ສະເພາະສະຖານະ 'pending' ຍັງບໍ່ໄດ້ສະແກນ ເພື່ອບໍ່ໃຫ້ກະທົບຕູ້ທີ່ສະແກນ/ຮັບເຂົ້າສາງ/ສົ່ງອອກໄປແລ້ວ)
          const selfRow = it.qr_code ? existing.new_coolers.qr_code.get(it.qr_code.toUpperCase()) : null;
          if (selfRow && selfRow.status !== "pending" && selfRow.status !== "confirmed") {
            errors.push({ label, reason: "QR Code ນີ້ມີໃນລະບົບແລ້ວ ແລະ ຖືກຮັບເຂົ້າສາງ/ສົ່ງອອກໄປແລ້ວ ຈຶ່ງທັບຂໍ້ມູນບໍ່ໄດ້" });
            continue;
          }
          // QR ຊ້ຳກັບສະຕັອກສາງ / ແຖວອື່ນໃນໄຟລ໌ = ຜິດພາດ (QR ເປັນຕົວຫຼັກ). Serial/CapEx ຊ້ຳ = ຕໍ່ທ້າຍ "-1" / ".1" ອັດຕະໂນມັດ
          let reason = null;
          if (it.qr_code) {
            const v = it.qr_code.toUpperCase();
            if (existing.warehouse_stock.qr_code.has(v)) reason = "QR Code ມີໃນສະຕັອກສາງແລ້ວ";
            else if (seen.qr_code.has(v)) reason = "QR Code ຊ້ຳກັບແຖວອື່ນໃນໄຟລ໌ດຽວກັນ";
          }
          if (reason) { errors.push({ label, reason }); continue; }
          for (const f of ["serial_number", "capex"]) {
            if (!it[f]) continue;
            const r = await ncDedupeCode(env, f, it[f], selfRow ? selfRow.id : 0, seen[f]);
            if (r.changed) { adjusted.push(`${label}: ${fieldLabel[f]} ${it[f]} → ${r.value}`); it[f] = r.value; }
          }
          for (const f of fields) { if (it[f]) seen[f].add(it[f].toUpperCase()); }
          if (selfRow) {
            updatedCount++;
            stmts.push(
              env.DB.prepare(
                `UPDATE new_coolers SET cooler_brand = ?, cooler_type = ?, cooler_model = ?, serial_number = ?, capex = ?, notes = ?
                  WHERE id = ? AND status IN ('pending', 'confirmed')`
              ).bind(it.cooler_brand, it.cooler_type, it.cooler_model || null, it.serial_number || null, it.capex || null, it.notes || null, selfRow.id)
            );
            continue;
          }
          insertedCount++;
          stmts.push(
            env.DB.prepare(
              `INSERT INTO new_coolers (cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, notes, status, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
            ).bind(it.cooler_brand, it.cooler_type, it.cooler_model || null, it.qr_code || null, it.serial_number || null, it.capex || null, it.notes || null, actorEmail)
          );
        }
        for (let i = 0; i < stmts.length; i += 50) {
          await env.DB.batch(stmts.slice(i, i + 50));
        }
        return Response.json({ inserted: insertedCount, updated: updatedCount, adjusted, errors });
      } catch (e) {
        console.error("/api/admin/import-new-coolers", e);
        return Response.json({ error: "ນຳເຂົ້າຂໍ້ມູນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຂັ້ນ 1 (ກ່ອນຢືນຢັນ) - ຄົ້ນຫາຕູ້ຈາກ QR / Serial / CapEx ທີ່ສະແກນ ຫຼື ພິມ ເພື່ອສະແດງໃນ popup (ບໍ່ປ່ຽນສະຖານະ)
    if (url.pathname === "/api/admin/lookup-new-cooler" && request.method === "POST") {
      try {
        const { code } = await request.json();
        if (!String(code || "").trim()) return Response.json({ error: "ກະລຸນາປ້ອນ QR, Serial ຫຼື CapEx" }, { status: 400 });
        const found = await findNewCoolersAllByCode(env, code);
        const rowsAll = found.rows;
        if (!rowsAll.length) {
          return Response.json({ outcome: "not_found", error: "ບໍ່ພົບຕູ້ນີ້ໃນລາຍການຕູ້ແຊ່ເຂົ້າໃຫມ່ (ຍັງບໍ່ໄດ້ Import ຫຼື ເລກບໍ່ຖືກ)" }, { status: 404 });
        }
        // ພົບຫຼາຍໜ່ວຍ (ເຊັ່ນ Serial/CapEx ຊ້ຳ) -> ສົ່ງທຸກໜ່ວຍໃຫ້ຜູ້ໃຊ້ເລືອກ
        if (rowsAll.length > 1) {
          const items = [];
          for (const r of rowsAll) items.push(await loadNewCoolerItem(env, r.id));
          return Response.json({ outcome: "multiple", items, partial: found.partial });
        }
        return Response.json({ item: await loadNewCoolerItem(env, rowsAll[0].id), partial: found.partial });
      } catch (e) {
        console.error("/api/admin/lookup-new-cooler", e);
        return Response.json({ error: "ຄົ້ນຫາຕູ້ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===== ໂຕນັບຮອບສະແກນຕູ້ເຂົ້າໃໝ່ (ໃຊ້ຮ່ວມກັນທຸກເຄື່ອງ) =====
    // ອ່ານໂຕນັບຂອງຮອບທີ່ເປີດຢູ່
    if (url.pathname === "/api/admin/new-cooler-fill-round" && request.method === "GET") {
      try {
        const round = await ncFillRoundOpen(env);
        return Response.json(await ncFillRoundSummary(env, round));
      } catch (e) {
        console.error("/api/admin/new-cooler-fill-round", e);
        return Response.json({ error: "ໂຫລດໂຕນັບບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_new_cooler_fill_rounds.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // ນັບຕູ້ທີ່ສະແກນ/ບັນທຶກ/ຢືນຢັນແລ້ວເຂົ້າຮອບ (ຕູ້ດຽວກັນນັບຄັ້ງດຽວຕໍ່ຮອບ)
    if (url.pathname === "/api/admin/new-cooler-fill-round/add" && request.method === "POST") {
      try {
        const b = await request.json().catch(() => ({}));
        const id = Number(b.id);
        if (!id) return Response.json({ error: "ບໍ່ພົບຕູ້" }, { status: 400 });
        const cooler = await env.DB.prepare("SELECT id FROM new_coolers WHERE id = ?").bind(id).first();
        if (!cooler) return Response.json({ error: "ບໍ່ພົບຕູ້" }, { status: 404 });

        let round = await ncFillRoundOpen(env);
        if (!round) {
          await env.DB.prepare("INSERT INTO new_cooler_fill_rounds (started_at) VALUES (CURRENT_TIMESTAMP)").run();
          round = await ncFillRoundOpen(env);
        }
        const actor = (session && session.email) || null;
        await env.DB.prepare(
          "INSERT OR IGNORE INTO new_cooler_fill_scans (round_id, new_cooler_id, scanned_by) VALUES (?, ?, ?)"
        ).bind(round.id, id, actor).run();
        return Response.json(await ncFillRoundSummary(env, round));
      } catch (e) {
        console.error("/api/admin/new-cooler-fill-round/add", e);
        return Response.json({ error: "ບັນທຶກໂຕນັບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ປິດຮອບ: ບັນທຶກຈຳນວນ ແລ້ວຮອບຖັດໄປເລີ່ມນັບຈາກ 0 (ທຸກເຄື່ອງ)
    if (url.pathname === "/api/admin/new-cooler-fill-round/close" && request.method === "POST") {
      try {
        const round = await ncFillRoundOpen(env);
        if (!round) return Response.json({ error: "ບໍ່ມີຮອບທີ່ເປີດຢູ່" }, { status: 400 });
        const summary = await ncFillRoundSummary(env, round);
        if (!summary.count) return Response.json({ error: "ຮອບນີ້ຍັງບໍ່ໄດ້ສະແກນຕູ້ໃດ" }, { status: 400 });
        const actor = (session && session.email) || null;
        await env.DB.prepare(
          "UPDATE new_cooler_fill_rounds SET closed_at = CURRENT_TIMESTAMP, closed_by = ?, closed_count = ? WHERE id = ? AND closed_at IS NULL"
        ).bind(actor, summary.count, round.id).run();
        return Response.json({ message: `ປິດຮອບແລ້ວ — ສະແກນທັງໝົດ ${summary.count} ໜ່ວຍ`, closed_count: summary.count });
      } catch (e) {
        console.error("/api/admin/new-cooler-fill-round/close", e);
        return Response.json({ error: "ປິດຮອບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // ແກ້ໄຂຂໍ້ມູນຕູ້ໃໝ່ (ຕອນສະແກນຢືນຢັນແລ້ວເຫັນວ່າຂໍ້ມູນບໍ່ຕົງກັບຕູ້ຈິງ): ແກ້ Brand/Type/Model/Serial/CapEx/ໝາຍເຫດ — QR Code ແກ້ບໍ່ໄດ້
    // ແກ້ໄດ້ສະເພາະຕູ້ທີ່ຍັງບໍ່ຮັບເຂົ້າສາງ / ບໍ່ໄດ້ສົ່ງອອກ (ຫຼັງຈາກນັ້ນຂໍ້ມູນຖືກສຳເນົາໄປສະຕັອກສາງແລ້ວ)
    if (url.pathname === "/api/admin/update-new-cooler" && request.method === "POST") {
      try {
        const b = await request.json();
        const id = Number(b.id);
        const clean = (v) => (v === null || v === undefined ? "" : String(v)).trim();
        // Brand / Type / Model / ໝາຍເຫດ ແກ້ບໍ່ໄດ້ (ຖືກລັອກ) — ບໍ່ອ່ານຄ່າເຫຼົ່ານີ້ຈາກ request ແກ້ໄດ້ສະເພາະ Serial ແລະ CapEx
        const serial = clean(b.serial_number).slice(0, 120);
        let capex = clean(b.capex).slice(0, 120);
        // ກອກສະເພາະເລກກາງ (capex_mid) -> ລະບົບຕື່ມ 21861.<ເລກ>.SAL.LBC ໃຫ້
        if (b.capex_mid !== undefined && b.capex_mid !== null && clean(b.capex_mid) !== "") {
          const mid = clean(b.capex_mid).replace(/^\.+|\.+$/g, "");
          if (!/^[A-Za-z0-9-]{1,40}$/.test(mid)) {
            return Response.json({ error: "ເລກ CapEx ກາງໃຊ້ໄດ້ສະເພາະຕົວເລກ/ຕົວອັກສອນ (ບໍ່ຕ້ອງໃສ່ຈຸດ ຫຼື ຍະຫວ່າງ)" }, { status: 400 });
          }
          capex = ncBuildCapex(mid);
        }
        if (!id) return Response.json({ error: "ບໍ່ພົບຕູ້" }, { status: 400 });
        const row = await env.DB.prepare("SELECT * FROM new_coolers WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບຕູ້" }, { status: 404 });
        if (row.status === "received" || row.status === "shipped_out") {
          return Response.json({ error: "ຕູ້ນີ້ຮັບເຂົ້າສາງ/ສົ່ງອອກໄປແລ້ວ ແກ້ຢູ່ບ່ອນນີ້ບໍ່ໄດ້ (ໃຫ້ແກ້ໃນໜ້າສະຕັອກສາງ)" }, { status: 400 });
        }
        if (!row.qr_code && !serial && !capex) return Response.json({ error: "ຕ້ອງມີ QR, Serial ຫຼື CapEx ຢ່າງໜ້ອຍໜຶ່ງຢ່າງ" }, { status: 400 });
        const adjusted = [];
        const takenSet = new Set();
        const serialFinal = await ncResolveDup(env, "serial_number", serial, id, takenSet, adjusted);
        const capexFinal = await ncResolveDup(env, "capex", capex, id, takenSet, adjusted);
        // confirm_present (ຈາກເມນູ ກອກ Serial / CapEx): ບັນທຶກແລ້ວຢືນຢັນວ່າມີຕູ້ເລີຍ (pending -> confirmed)
        const confirmNow = !!b.confirm_present && row.status === "pending";
        const actorEmail = (session && session.email) || null;
        if (confirmNow) {
          await env.DB.prepare(
            `UPDATE new_coolers SET serial_number = ?, capex = ?, status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
              WHERE id = ? AND status = 'pending'`
          ).bind(serialFinal || null, capexFinal || null, actorEmail, id).run();
        } else {
          await env.DB.prepare(
            `UPDATE new_coolers SET serial_number = ?, capex = ?
              WHERE id = ? AND status IN ('pending', 'confirmed')`
          ).bind(serialFinal || null, capexFinal || null, id).run();
        }
        return Response.json({
          message: confirmNow ? "ບັນທຶກ ແລະ ຢືນຢັນວ່າມີຕູ້ແລ້ວ" : "ແກ້ໄຂຂໍ້ມູນຕູ້ແລ້ວ", confirmed: confirmNow, adjusted,
          item: await loadNewCoolerItem(env, id)
        });
      } catch (e) {
        console.error("/api/admin/update-new-cooler", e);
        return Response.json({ error: "ແກ້ໄຂບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ແກ້ QR ຂອງຕູ້ (ກໍລະນີ QR ຕິດສະຫຼັບກັນ: Serial/CapEx ຕົງກັບຕູ້ຈິງ ແຕ່ QR ເປັນຂອງໜ່ວຍອື່ນ)
    // ຖ້າ QR ໃໝ່ ມີຢູ່ກັບໜ່ວຍອື່ນ -> ບໍ່ບັນທຶກທັນທີ, ສົ່ງ qr_taken ກັບໄປໃຫ້ຢືນຢັນ; ຢືນຢັນ (swap) ແລ້ວ ສະຫຼັບ QR ລະຫວ່າງສອງໜ່ວຍແບບ atomic
    // ເພີ່ມຕູ້ໃໝ່ເຂົ້າລາຍການ (ເມື່ອສະແກນ QR ແລ້ວບໍ່ພົບໃນລາຍການ Import) — ກອກໄດ້ທຸກຊ່ອງ; ສະຖານະເລີ່ມເປັນ pending
    if (url.pathname === "/api/admin/create-new-cooler" && request.method === "POST") {
      try {
        const b = await request.json();
        const clean = (v) => (v === null || v === undefined ? "" : String(v)).trim();
        const brand = clean(b.cooler_brand).slice(0, 120);
        const type = clean(b.cooler_type).slice(0, 120);
        const model = clean(b.cooler_model).slice(0, 120);
        const qr = clean(b.qr_code).slice(0, 200);
        const notes = clean(b.notes).slice(0, 500);
        let serial = clean(b.serial_number).slice(0, 120);
        let capex = clean(b.capex).slice(0, 120);
        if (b.capex_mid !== undefined && b.capex_mid !== null && clean(b.capex_mid) !== "") {
          const mid = clean(b.capex_mid).replace(/^\.+|\.+$/g, "");
          if (!/^[A-Za-z0-9-]{1,40}$/.test(mid)) {
            return Response.json({ error: "ເລກ CapEx ກາງໃຊ້ໄດ້ສະເພາະຕົວເລກ/ຕົວອັກສອນ (ບໍ່ຕ້ອງໃສ່ຈຸດ ຫຼື ຍະຫວ່າງ)" }, { status: 400 });
          }
          capex = ncBuildCapex(mid);
        }
        if (!brand || !type) return Response.json({ error: "ກະລຸນາເລືອກ Brand ແລະ Type" }, { status: 400 });
        if (!qr && !serial && !capex) return Response.json({ error: "ຕ້ອງມີ QR, Serial ຫຼື CapEx ຢ່າງໜ້ອຍໜຶ່ງຢ່າງ" }, { status: 400 });
        if (qr && (await ncIsTaken(env, "qr_code", qr, 0, null))) {
          const owner = await ncFindOwner(env, "qr_code", qr, 0);
          return Response.json({ outcome: "qr_taken", error: "QR ນີ້ມີໃນລະບົບແລ້ວ", owner }, { status: 409 });
        }
        const adjusted = [];
        const takenSet = new Set();
        serial = await ncResolveDup(env, "serial_number", serial, 0, takenSet, adjusted);
        capex = await ncResolveDup(env, "capex", capex, 0, takenSet, adjusted);
        const actorEmail = (session && session.email) || null;
        const ins = await env.DB.prepare(
          `INSERT INTO new_coolers (cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, notes, status, created_by, confirmed_by, confirmed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, CURRENT_TIMESTAMP)`
        ).bind(brand, type, model || null, qr || null, serial || null, capex || null, notes || null, actorEmail, actorEmail).run();
        const newId = ins && ins.meta ? ins.meta.last_row_id : null;
        if (!newId) return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ" }, { status: 500 });
        return Response.json({ message: "ເພີ່ມຕູ້ໃໝ່ ແລະ ຢືນຢັນວ່າມີຕູ້ແລ້ວ", adjusted, item: await loadNewCoolerItem(env, newId) });
      } catch (e) {
        console.error("/api/admin/create-new-cooler", e);
        return Response.json({ error: "ເພີ່ມຕູ້ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/fix-new-cooler-qr" && request.method === "POST") {
      try {
        const b = await request.json();
        const id = Number(b.id);
        const newQr = String(b.qr_code === null || b.qr_code === undefined ? "" : b.qr_code).trim().slice(0, 200);
        if (!id) return Response.json({ error: "ບໍ່ພົບຕູ້" }, { status: 400 });
        if (!newQr) return Response.json({ error: "ກະລຸນາປ້ອນ QR ໃໝ່" }, { status: 400 });
        const row = await env.DB.prepare("SELECT * FROM new_coolers WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບຕູ້" }, { status: 404 });
        if (row.status === "received" || row.status === "shipped_out") {
          return Response.json({ error: "ຕູ້ນີ້ຮັບເຂົ້າສາງ/ສົ່ງອອກໄປແລ້ວ ແກ້ QR ຢູ່ບ່ອນນີ້ບໍ່ໄດ້" }, { status: 400 });
        }
        if (String(row.qr_code || "").toUpperCase() === newQr.toUpperCase()) {
          return Response.json({ message: "QR ນີ້ຄືຄ່າເດີມຢູ່ແລ້ວ", item: await loadNewCoolerItem(env, id) });
        }
        const inStock = await env.DB.prepare("SELECT id FROM warehouse_stock WHERE qr_code COLLATE NOCASE = ? LIMIT 1").bind(newQr.toUpperCase()).first();
        if (inStock) return Response.json({ error: "QR ນີ້ມີຢູ່ໃນສະຕັອກສາງແລ້ວ ບໍ່ສາມາດໃຊ້ຊ້ຳໄດ້" }, { status: 409 });
        const other = await env.DB.prepare("SELECT * FROM new_coolers WHERE qr_code COLLATE NOCASE = ? AND id != ? ORDER BY id DESC LIMIT 1").bind(newQr.toUpperCase(), id).first();
        if (other) {
          if (other.status === "received" || other.status === "shipped_out") {
            return Response.json({ error: "QR ນີ້ເປັນຂອງຕູ້ທີ່ຮັບເຂົ້າສາງ/ສົ່ງອອກໄປແລ້ວ ສະຫຼັບບໍ່ໄດ້" }, { status: 409 });
          }
          if (!b.swap) {
            return Response.json({
              outcome: "qr_taken",
              error: "QR ນີ້ເປັນຂອງຕູ້ໜ່ວຍອື່ນ",
              owner: await loadNewCoolerItem(env, other.id),
              will_get: row.qr_code || null
            }, { status: 409 });
          }
          await env.DB.batch([
            env.DB.prepare("UPDATE new_coolers SET qr_code = ? WHERE id = ? AND status IN ('pending', 'confirmed')").bind(newQr, id),
            env.DB.prepare("UPDATE new_coolers SET qr_code = ? WHERE id = ? AND status IN ('pending', 'confirmed')").bind(row.qr_code || null, other.id)
          ]);
          return Response.json({
            message: "ສະຫຼັບ QR ລະຫວ່າງສອງໜ່ວຍແລ້ວ",
            item: await loadNewCoolerItem(env, id),
            swapped_item: await loadNewCoolerItem(env, other.id)
          });
        }
        await env.DB.prepare("UPDATE new_coolers SET qr_code = ? WHERE id = ? AND status IN ('pending', 'confirmed')").bind(newQr, id).run();
        return Response.json({ message: "ແກ້ QR ແລ້ວ", item: await loadNewCoolerItem(env, id) });
      } catch (e) {
        console.error("/api/admin/fix-new-cooler-qr", e);
        return Response.json({ error: "ແກ້ QR ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }


    // ຂັ້ນ 1 - ຢືນຢັນວ່າມີຕູ້: ສະແກນ/ພິມ QR, Serial ຫຼື CapEx (code) ຫຼື ກົດຈາກແຖວ (id) -> pending => confirmed (ຍັງບໍ່ເຂົ້າສາງ)
    // ship_out = true: ໝາຍ "ສົ່ງອອກຕ່າງແຂວງ" -> ບັນທຶກໄປໜ້າສົ່ງອອກຕ່າງແຂວງ ສະຖານະລໍຖ້າຢືນຢັນ (ship_requested = 1) ພ້ອມແຂວງ/ໝາຍເຫດ (ບໍ່ບັງຄັບ)
    if (url.pathname === "/api/admin/confirm-new-cooler" && request.method === "POST") {
      try {
        const { id, code, ship_out, province, warehouse, note } = await request.json();
        const shipOut = !!ship_out;
        // warehouse ຢືນຢັນວ່າມີຕູ້ໄດ້ ແຕ່ໝາຍ "ສົ່ງອອກຕ່າງແຂວງ" ບໍ່ໄດ້ (admin ເທົ່ານັ້ນ)
        if (shipOut && !(session && isAdminLike(session.role))) {
          return Response.json({ error: "ບໍ່ມີສິດໝາຍສົ່ງອອກຕ່າງແຂວງ" }, { status: 403 });
        }
        const prov = String(province || "").trim().slice(0, 100);
        const noteVal = String(note || "").trim().slice(0, 300);
        // ສາງສະເພາະແຂວງ (ບໍ່ບັງຄັບຕອນນີ້ — ບັງຄັບຕອນເພີ່ມເຂົ້າຖ້ຽວລົດ)
        const whChk = shipOut && prov ? provWhResolve(await provWhMap(env), prov, warehouse, false) : { wh: "" };
        if (whChk.error) return Response.json({ error: whChk.error }, { status: 400 });
        let row = null;
        if (id) {
          row = await env.DB.prepare("SELECT * FROM new_coolers WHERE id = ?").bind(id).first();
        } else {
          if (!String(code || "").trim()) return Response.json({ error: "ກະລຸນາປ້ອນ QR, Serial ຫຼື CapEx" }, { status: 400 });
          row = await findNewCoolerByCode(env, code);
        }
        if (!row) {
          return Response.json({ outcome: "not_found", error: "ບໍ່ພົບຕູ້ນີ້ໃນລາຍການຕູ້ແຊ່ເຂົ້າໃຫມ່ (ຍັງບໍ່ໄດ້ Import ຫຼື ເລກບໍ່ຖືກ)" }, { status: 404 });
        }
        if (row.status === "received") {
          return Response.json({ outcome: "already_received", message: "ຕູ້ນີ້ຮັບເຂົ້າສາງໄປແລ້ວ", item: await loadNewCoolerItem(env, row.id) });
        }
        if (row.status === "shipped_out") {
          return Response.json({ outcome: "already_shipped", message: "ຕູ້ນີ້ຖືກສົ່ງອອກຕ່າງແຂວງໄປແລ້ວ", item: await loadNewCoolerItem(env, row.id) });
        }
        if (row.status === "confirmed") {
          // ຢືນຢັນໄປແລ້ວ: ຖ້າຕິກ "ສົ່ງອອກຕ່າງແຂວງ" ເພີ່ມ ແລະ ຍັງບໍ່ເຄີຍໝາຍ -> ໝາຍເປັນລໍຖ້າຢືນຢັນສົ່ງອອກ
          if (shipOut && !row.ship_requested) {
            await env.DB.prepare(
              "UPDATE new_coolers SET ship_requested = 1, ship_province = ?, ship_warehouse = ?, ship_note = ? WHERE id = ? AND status = 'confirmed'"
            ).bind(prov || null, whChk.wh || null, noteVal || null, row.id).run();
            return Response.json({ outcome: "ship_requested", message: "ບັນທຶກໄປໜ້າ ສົ່ງອອກຕ່າງແຂວງ ແລ້ວ (ລໍຖ້າຢືນຢັນ)", item: await loadNewCoolerItem(env, row.id) });
          }
          if (row.ship_requested) {
            return Response.json({ outcome: "already_confirmed", message: "ຕູ້ນີ້ຢືນຢັນແລ້ວ ແລະ ລໍຖ້າຢືນຢັນສົ່ງອອກຕ່າງແຂວງ", item: await loadNewCoolerItem(env, row.id) });
          }
          return Response.json({ outcome: "already_confirmed", message: "ຕູ້ນີ້ສະແກນຢືນຢັນໄປແລ້ວ (ລໍຖ້າຮັບເຂົ້າສາງ)", item: await loadNewCoolerItem(env, row.id) });
        }
        const actorEmail = (session && session.email) || null;
        const shipVals = [actorEmail, shipOut ? 1 : 0, shipOut ? (prov || null) : null, shipOut ? (whChk.wh || null) : null, shipOut ? (noteVal || null) : null];
        const confRes = await env.DB.prepare(
          "UPDATE new_coolers SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP, ship_requested = ?, ship_province = ?, ship_warehouse = ?, ship_note = ? WHERE id = ? AND status = 'pending'"
        ).bind(...shipVals, row.id).run();
        if (!confRes.meta || !confRes.meta.changes) {
          // ບໍ່ມີແຖວຖືກປ່ຽນ: ອ່ານສະຖານະຫຼ້າສຸດມາຕອບໃຫ້ຖືກ (ຢ່າຕອບ "ຢືນຢັນແລ້ວ" ຖ້າຄົນອື່ນເຮັດກ່ອນ)
          return Response.json({
            outcome: "already_confirmed",
            message: "ຕູ້ນີ້ຖືກຢືນຢັນ/ປ່ຽນສະຖານະໄປແລ້ວ",
            item: await loadNewCoolerItem(env, row.id)
          }, { status: 409 });
        }
        return Response.json({
          outcome: shipOut ? "confirmed_ship" : "confirmed",
          message: shipOut ? "ຢືນຢັນວ່າມີຕູ້ແລ້ວ ແລະ ບັນທຶກໄປໜ້າ ສົ່ງອອກຕ່າງແຂວງ (ລໍຖ້າຢືນຢັນ)" : "ຢືນຢັນວ່າມີຕູ້ແລ້ວ (ລໍຖ້າຮັບເຂົ້າສາງ)",
          item: await loadNewCoolerItem(env, row.id)
        });
      } catch (e) {
        console.error("/api/admin/confirm-new-cooler", e);
        return Response.json({ error: "ຢືນຢັນຕູ້ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // admin ຢືນຢັນຫຼາຍຕູ້ພ້ອມກັນ (pending -> confirmed) ຈາກລາຍການ Import
    // ຕູ້ທີ່ບໍ່ແມ່ນ pending ແລ້ວ ຖືກຂ້າມ (skipped)
    if (url.pathname === "/api/admin/confirm-new-coolers-bulk" && request.method === "POST") {
      try {
        const b = await request.json();
        const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!ids.length) return Response.json({ error: "ກະລຸນາເລືອກຕູ້ທີ່ຈະຢືນຢັນ" }, { status: 400 });
        if (ids.length > 300) return Response.json({ error: "ເລືອກໄດ້ເທື່ອລະບໍ່ເກີນ 300 ຕູ້" }, { status: 400 });
        const actorEmail = (session && session.email) || null;
        const pendingIds = [];
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const r = await env.DB.prepare(`SELECT id FROM new_coolers WHERE status = 'pending' AND id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all();
          (r.results || []).forEach((x) => pendingIds.push(x.id));
        }
        const skipped = ids.length - pendingIds.length;
        if (!pendingIds.length) {
          return Response.json({ confirmed: 0, skipped, failed: 0, message: "ບໍ່ມີຕູ້ທີ່ຍັງບໍ່ໄດ້ສະແກນໃນລາຍການທີ່ເລືອກ (ອາດຖືກຢືນຢັນໄປແລ້ວ)" });
        }
        let confirmed = 0;
        for (let i = 0; i < pendingIds.length; i += 50) {
          const chunk = pendingIds.slice(i, i + 50);
          const stmts = chunk.map((id) => env.DB.prepare(
            "UPDATE new_coolers SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP, ship_requested = 0, ship_province = NULL, ship_warehouse = NULL, ship_note = NULL WHERE id = ? AND status = 'pending'"
          ).bind(actorEmail, id));
          const results = await env.DB.batch(stmts);
          results.forEach((r) => { if (r.meta && r.meta.changes) confirmed++; });
        }
        const failed = pendingIds.length - confirmed;
        return Response.json({
          confirmed, skipped, failed,
          message: `ຢືນຢັນວ່າມີຕູ້ແລ້ວ ${confirmed} ໜ່ວຍ`
        });
      } catch (e) {
        console.error("/api/admin/confirm-new-coolers-bulk", e);
        return Response.json({ error: "ຢືນຢັນຫຼາຍຕູ້ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຍົກເລີກການຢືນຢັນ (confirmed => pending) ກໍລະນີສະແກນຜິດ - ເຮັດໄດ້ສະເພາະທີ່ຍັງບໍ່ໄດ້ຮັບເຂົ້າສາງ
    if (url.pathname === "/api/admin/unconfirm-new-cooler" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        // trip_id IS NULL: ຕູ້ທີ່ຢູ່ໃນຖ້ຽວລົດແລ້ວຍົກເລີກບໍ່ໄດ້ (ຕ້ອງເອົາອອກຈາກຖ້ຽວກ່ອນ, ເຮັດໄດ້ສະເພາະຖ້ຽວ open)
        const base = "status = 'pending', confirmed_by = NULL, confirmed_at = NULL, ship_requested = 0, ship_province = NULL, ship_warehouse = NULL, ship_note = NULL, trip_id = NULL, trip_scanned_at = NULL, trip_scanned_by = NULL";
        const where = " WHERE id = ? AND status = 'confirmed' AND trip_id IS NULL";
        const res = await env.DB.prepare("UPDATE new_coolers SET " + base + where).bind(id).run();
        if (!res.meta || !res.meta.changes) {
          const cur = await env.DB.prepare("SELECT status, trip_id FROM new_coolers WHERE id = ?").bind(id).first();
          if (cur && cur.status === "confirmed" && cur.trip_id) {
            return Response.json({ error: "ຍົກເລີກບໍ່ໄດ້ ຕູ້ນີ້ຢູ່ໃນຖ້ຽວລົດແລ້ວ — ເອົາອອກຈາກຖ້ຽວກ່ອນ" }, { status: 409 });
          }
          return Response.json({ error: "ຍົກເລີກບໍ່ໄດ້ (ບໍ່ພົບລາຍການ, ຍັງບໍ່ໄດ້ຢືນຢັນ ຫຼື ຮັບເຂົ້າສາງໄປແລ້ວ)" }, { status: 400 });
        }
        return Response.json({ message: "ຍົກເລີກການຢືນຢັນແລ້ວ" });
      } catch (e) {
        console.error("unconfirm-new-cooler failed", e);
        return Response.json({ error: "ຍົກເລີກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຍົກເລີກການຢືນຢັນຫຼາຍຕູ້ພ້ອມກັນ (admin ເທົ່ານັ້ນ ເພາະບໍ່ຢູ່ໃນ ROUTE_ROLES) — ກົດດຽວກັບ unconfirm-new-cooler: ສະເພາະ confirmed ທີ່ຍັງບໍ່ຢູ່ໃນຖ້ຽວລົດ
    if (url.pathname === "/api/admin/unconfirm-new-coolers-bulk" && request.method === "POST") {
      try {
        const body = await request.json();
        const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!ids.length) return Response.json({ error: "ກະລຸນາເລືອກລາຍການ" }, { status: 400 });
        if (ids.length > 1000) return Response.json({ error: "ເລືອກໄດ້ສູງສຸດ 1000 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });
        const base = "status = 'pending', confirmed_by = NULL, confirmed_at = NULL, ship_requested = 0, ship_province = NULL, ship_warehouse = NULL, ship_note = NULL, trip_id = NULL, trip_scanned_at = NULL, trip_scanned_by = NULL";
        let done = 0;
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const where = ` WHERE id IN (${chunk.map(() => "?").join(",")}) AND status = 'confirmed' AND trip_id IS NULL`;
          const r = await env.DB.prepare("UPDATE new_coolers SET " + base + where).bind(...chunk).run();
          done += (r && r.meta && r.meta.changes) || 0;
        }
        return Response.json({ message: `ຍົກເລີກການຢືນຢັນແລ້ວ ${done} ໜ່ວຍ`, unconfirmed: done, skipped: ids.length - done });
      } catch (e) {
        console.error("/api/admin/unconfirm-new-coolers-bulk", e);
        return Response.json({ error: "ຍົກເລີກການຢືນຢັນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ລ໋ອດ + ຄອນເທນເນີ ຂອງຕູ້ທີ່ຮັບເຂົ້າສາງ (new_cooler_receipts)
    // GET  -> ປະຫວັດການຮັບເຂົ້າ (ລ່າສຸດ 200 ລາຍການ)
    // POST -> ສ້າງບັນທຶກກ່ອນຮັບເຂົ້າ { lot_no, container_units: [ຈຳນວນໜ່ວຍຂອງແຕ່ລະຄອນ], warehouse_id, note } -> { id }
    //         frontend ສົ່ງ receipt_id ນີ້ໄປກັບ /api/admin/receive-new-coolers ເພື່ອຜູກຕູ້ເຂົ້າກັບລ໋ອດ
    if (url.pathname === "/api/admin/new-cooler-receipts" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          `SELECT r.*, w.name AS warehouse_name
             FROM new_cooler_receipts r
             LEFT JOIN wh_warehouses w ON w.id = r.warehouse_id
            ORDER BY r.id DESC LIMIT 200`
        ).all();
        return Response.json(results || []);
      } catch (e) {
        console.error("/api/admin/new-cooler-receipts GET", e);
        return Response.json({ error: "ໂຫຼດປະຫວັດລ໋ອດບໍ່ສຳເລັດ (ກວດວ່າຮັນ migration_add_new_cooler_receipts.sql ແລ້ວ)" }, { status: 500 });
      }
    }
    if (url.pathname === "/api/admin/new-cooler-receipts" && request.method === "POST") {
      try {
        const body = await request.json();
        const lotNo = String(body.lot_no || "").trim().slice(0, 60);
        if (!lotNo) return Response.json({ error: "ກະລຸນາລະບຸເລກລ໋ອດ" }, { status: 400 });
        if (await isReceiptLotClosed(env, lotNo)) return Response.json({ error: `ລ໋ອດ "${lotNo}" ປິດແລ້ວ ເພີ່ມຕູ້ເຂົ້າບໍ່ໄດ້ — ກະລຸນາໃຊ້ເລກລ໋ອດໃໝ່` }, { status: 400 });
        const units = Array.isArray(body.container_units) ? body.container_units.map(Number) : [];
        if (units.length > 200 || units.some((n) => !Number.isInteger(n) || n <= 0 || n > 100000)) {
          return Response.json({ error: "ຈຳນວນໜ່ວຍຕໍ່ຄອນເທນເນີຕ້ອງເປັນຈຳນວນເຕັມ ຫຼາຍກວ່າ 0 (ສູງສຸດ 200 ຄອນເທນເນີ)" }, { status: 400 });
        }
        const total = units.reduce((a, b) => a + b, 0);
        const whId = Number(body.warehouse_id) || null;
        const note = String(body.note || "").trim().slice(0, 300) || null;
        const actorEmail = (session && session.email) || null;
        const ins = await env.DB.prepare(
          `INSERT INTO new_cooler_receipts (lot_no, container_count, container_units, total_units, warehouse_id, note, received_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(lotNo, units.length, JSON.stringify(units), total, whId, note, actorEmail).run();
        return Response.json({ id: ins.meta ? ins.meta.last_row_id : null, lot_no: lotNo, container_count: units.length, total_units: total });
      } catch (e) {
        console.error("/api/admin/new-cooler-receipts POST", e);
        return Response.json({ error: "ບັນທຶກລ໋ອດບໍ່ສຳເລັດ (ກວດວ່າຮັນ migration_add_new_cooler_receipts.sql ແລະ migration_add_new_cooler_receipts_close.sql ແລ້ວ)" }, { status: 500 });
      }
    }

    // ໃສ່ລ໋ອດໃຫ້ຕູ້ທີ່ "ຮັບເຂົ້າສາງແລ້ວ" ແຕ່ຍັງບໍ່ມີລ໋ອດ { receipt_id, ids } (ຕູ້ທີ່ມີລ໋ອດແລ້ວ ຈະບໍ່ຖືກຍ້າຍໄປລ໋ອດອື່ນ; ລ໋ອດທີ່ປິດແລ້ວເພີ່ມບໍ່ໄດ້)
    // Export ປະຫວັດລ໋ອດ: ?lot=ເລກລ໋ອດ (ບໍ່ໃສ່ = ທຸກລ໋ອດ) -> { receipts: [...], coolers: [...] } ໃຫ້ໜ້າເວັບສ້າງ Excel
    if (url.pathname === "/api/admin/new-cooler-receipts/export" && request.method === "GET") {
      try {
        const lot = (url.searchParams.get("lot") || "").trim();
        const rb = lot ? [lot] : [];
        const { results: receipts } = await env.DB.prepare(
          `SELECT r.*, w.name AS warehouse_name
             FROM new_cooler_receipts r
             LEFT JOIN wh_warehouses w ON w.id = r.warehouse_id
            ${lot ? "WHERE r.lot_no = ? COLLATE NOCASE" : ""}
            ORDER BY r.lot_no COLLATE NOCASE, r.id`
        ).bind(...rb).all();
        const { results: coolers } = await env.DB.prepare(
          `SELECT n.lot_no, n.cooler_brand, n.cooler_type, n.cooler_model, n.qr_code, n.serial_number, n.capex, n.notes, n.status, n.received_by, w.name AS warehouse_name, s.status AS stock_status, cw.name AS current_warehouse_name,
                    COALESCE(NULLIF(TRIM(st.ship_province), ''), n.ship_province) AS ship_province,
                    COALESCE(NULLIF(TRIM(st.ship_warehouse), ''), n.ship_warehouse) AS ship_warehouse,
                    COALESCE(tr.trip_no, tn.trip_no) AS trip_no,
                    COALESCE(tr.departed_at, tn.departed_at, n.shipped_at) AS shipped_at
             FROM new_coolers n
             LEFT JOIN wh_warehouses w ON w.id = n.received_warehouse_id
             LEFT JOIN warehouse_stock s ON s.id = n.received_stock_id
             LEFT JOIN wh_warehouses cw ON cw.id = s.warehouse_id
             LEFT JOIN ship_trip_stock st ON st.stock_id = n.received_stock_id
             LEFT JOIN ship_trips tr ON tr.id = st.trip_id
             LEFT JOIN ship_trips tn ON tn.id = n.trip_id
            ${lot ? "WHERE n.lot_no = ? COLLATE NOCASE" : "WHERE n.lot_no IS NOT NULL AND n.lot_no != ''"}
            ORDER BY n.lot_no COLLATE NOCASE, n.id`
        ).bind(...rb).all();
        return Response.json({ receipts: receipts || [], coolers: coolers || [] });
      } catch (e) {
        console.error("/api/admin/new-cooler-receipts/export", e);
        return Response.json({ error: "Export ປະຫວັດລ໋ອດບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }
    if (url.pathname === "/api/admin/new-cooler-receipts/assign" && request.method === "POST") {
      try {
        const { receipt_id, ids } = await request.json();
        const idList = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!idList.length) return Response.json({ error: "ກະລຸນາເລືອກຕູ້" }, { status: 400 });
        if (idList.length > 50) return Response.json({ error: "ໃສ່ລ໋ອດໄດ້ສູງສຸດ 50 ໜ່ວຍຕໍ່ຄັ້ງ" }, { status: 400 });
        const receipt = await env.DB.prepare("SELECT id, lot_no FROM new_cooler_receipts WHERE id = ?").bind(Number(receipt_id) || 0).first();
        if (!receipt) return Response.json({ error: "ບໍ່ພົບບັນທຶກລ໋ອດ" }, { status: 400 });
        if (await isReceiptLotClosed(env, receipt.lot_no)) return Response.json({ error: `ລ໋ອດ "${receipt.lot_no}" ປິດແລ້ວ ເພີ່ມຕູ້ເຂົ້າບໍ່ໄດ້` }, { status: 400 });
        const r = await env.DB.prepare(
          `UPDATE new_coolers SET receipt_id = ?, lot_no = ?
            WHERE status = 'received' AND (lot_no IS NULL OR TRIM(lot_no) = '') AND id IN (${idList.map(() => "?").join(",")})`
        ).bind(receipt.id, receipt.lot_no, ...idList).run();
        const assigned = (r && r.meta && r.meta.changes) || 0;
        if (assigned) await env.DB.prepare("UPDATE new_cooler_receipts SET received_count = received_count + ? WHERE id = ?").bind(assigned, receipt.id).run();
        return Response.json({ assigned, skipped: idList.length - assigned, lot_no: receipt.lot_no });
      } catch (e) {
        console.error("/api/admin/new-cooler-receipts/assign", e);
        return Response.json({ error: "ໃສ່ລ໋ອດບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ປິດລ໋ອດ { lot_no }: ປິດທຸກການຮັບເຂົ້າຂອງລ໋ອດນີ້ — ຫຼັງປິດ ເພີ່ມຕູ້ເຂົ້າລ໋ອດນີ້ ແລະ ສ້າງລ໋ອດຊື່ດຽວກັນໃໝ່ບໍ່ໄດ້
    if (url.pathname === "/api/admin/new-cooler-receipts/close" && request.method === "POST") {
      try {
        const { lot_no } = await request.json();
        const lotNo = String(lot_no || "").trim();
        if (!lotNo) return Response.json({ error: "ກະລຸນາລະບຸເລກລ໋ອດ" }, { status: 400 });
        const exists = await env.DB.prepare("SELECT id FROM new_cooler_receipts WHERE lot_no = ? COLLATE NOCASE LIMIT 1").bind(lotNo).first();
        if (!exists) return Response.json({ error: "ບໍ່ພົບລ໋ອດນີ້" }, { status: 404 });
        const actorEmail = (session && session.email) || null;
        const r = await env.DB.prepare(
          "UPDATE new_cooler_receipts SET closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE lot_no = ? COLLATE NOCASE AND closed_at IS NULL"
        ).bind(actorEmail, lotNo).run();
        return Response.json({ message: `ປິດລ໋ອດ "${lotNo}" ແລ້ວ`, closed: (r && r.meta && r.meta.changes) || 0 });
      } catch (e) {
        console.error("/api/admin/new-cooler-receipts/close", e);
        return Response.json({ error: "ປິດລ໋ອດບໍ່ສຳເລັດ (ກວດວ່າຮັນ migration_add_new_cooler_receipts_close.sql ແລ້ວ)" }, { status: 500 });
      }
    }

    // ຂັ້ນ 2 - ຮັບເຂົ້າສາງ: ຮັບໄດ້ເທື່ອລະຫຼາຍລາຍການ (ids) ສະເພາະທີ່ຢືນຢັນແລ້ວ. ຈຳກັດ 10 ລາຍການຕໍ່ຄັ້ງ (ກັນເກີນຈຳນວນ query ຕໍ່ request) - frontend ແບ່ງສົ່ງເປັນກ້ອນໃຫ້
    if (url.pathname === "/api/admin/receive-new-coolers" && request.method === "POST") {
      try {
        const { ids, warehouse_id, receipt_id } = await request.json();
        const idList = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!idList.length) return Response.json({ error: "ກະລຸນາເລືອກລາຍການທີ່ຈະຮັບເຂົ້າສາງ" }, { status: 400 });
        if (idList.length > 10) return Response.json({ error: "ຮັບໄດ້ສູງສຸດ 10 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });
        if (!warehouse_id) return Response.json({ error: "ກະລຸນາເລືອກສາງທີ່ຈະຮັບເຂົ້າ" }, { status: 400 });
        const wh = await env.DB.prepare("SELECT id, name FROM wh_warehouses WHERE id = ?").bind(warehouse_id).first();
        if (!wh) return Response.json({ error: "ບໍ່ພົບສາງທີ່ເລືອກ" }, { status: 400 });

        const actorEmail = (session && session.email) || null;
        // ລ໋ອດ (ບໍ່ບັງຄັບ): ຖ້າສົ່ງ receipt_id ມາ ຈະຜູກຕູ້ທີ່ຮັບສຳເລັດເຂົ້າກັບລ໋ອດນັ້ນ
        let receipt = null;
        if (receipt_id) {
          receipt = await env.DB.prepare("SELECT id, lot_no FROM new_cooler_receipts WHERE id = ?").bind(Number(receipt_id)).first();
          if (!receipt) return Response.json({ error: "ບໍ່ພົບບັນທຶກລ໋ອດ" }, { status: 400 });
          if (await isReceiptLotClosed(env, receipt.lot_no)) return Response.json({ error: `ລ໋ອດ "${receipt.lot_no}" ປິດແລ້ວ ເພີ່ມຕູ້ເຂົ້າບໍ່ໄດ້` }, { status: 400 });
        }
        let received = 0;
        const receivedIds = [];
        const failures = [];
        for (const rid of idList) {
          const row = await env.DB.prepare("SELECT * FROM new_coolers WHERE id = ?").bind(rid).first();
          const label = row ? (row.qr_code || row.serial_number || row.capex || `#${rid}`) : `#${rid}`;
          if (!row) { failures.push({ id: rid, label, reason: "ບໍ່ພົບລາຍການ" }); continue; }
          const r = await receiveNewCoolerRow(env, row, wh, actorEmail);
          if (r.outcome === "received") { received++; receivedIds.push(rid); }
          else failures.push({ id: rid, label, reason: r.error || r.message || "ຮັບເຂົ້າສາງບໍ່ສຳເລັດ" });
        }
        if (receipt && receivedIds.length) {
          try {
            await env.DB.batch([
              env.DB.prepare(`UPDATE new_coolers SET receipt_id = ?, lot_no = ? WHERE (lot_no IS NULL OR TRIM(lot_no) = '') AND id IN (${receivedIds.map(() => "?").join(",")})`).bind(receipt.id, receipt.lot_no, ...receivedIds),
              env.DB.prepare("UPDATE new_cooler_receipts SET received_count = received_count + ? WHERE id = ?").bind(receivedIds.length, receipt.id),
            ]);
          } catch (tagErr) { console.error("/api/admin/receive-new-coolers tag lot", tagErr); }
        }
        return Response.json({ received, failures, warehouse_name: wh.name });
      } catch (e) {
        console.error("/api/admin/receive-new-coolers", e);
        return Response.json({ error: "ຮັບຕູ້ເຂົ້າສາງບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ທາງເລືອກຂັ້ນ 2 - ຕູ້ເຂົ້າມາໃໝ່ ແຕ່ບໍ່ເຂົ້າສາງ ຖືກສົ່ງອອກໄປຕ່າງແຂວງເລີຍ: confirmed => shipped_out
    // (ບໍ່ສ້າງແຖວໃນ warehouse_stock ເພາະຕູ້ບໍ່ເຄີຍຢູ່ໃນສາງ) ເກັບແຂວງປາຍທາງ + ໝາຍເຫດ + ຜູ້ເຮັດ/ເວລາ
    if (url.pathname === "/api/admin/ship-new-coolers" && request.method === "POST") {
      try {
        const { ids, province, warehouse, note } = await request.json();
        const idList = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!idList.length) return Response.json({ error: "ກະລຸນາເລືອກລາຍການທີ່ຈະສົ່ງອອກ" }, { status: 400 });
        if (idList.length > 100) return Response.json({ error: "ສົ່ງອອກໄດ້ສູງສຸດ 100 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });
        const prov = String(province || "").trim().slice(0, 100);
        const noteVal = String(note || "").trim().slice(0, 300);
        const whChk = prov ? provWhResolve(await provWhMap(env), prov, warehouse, false) : { wh: "" };
        if (whChk.error) return Response.json({ error: whChk.error }, { status: 400 });
        const actorEmail = (session && session.email) || null;
        // ແຂວງ: ໃຊ້ທີ່ປ້ອນມາ; ຖ້າບໍ່ໄດ້ປ້ອນ ໃຊ້ແຂວງທີ່ບັນທຶກໄວ້ໃນລາຍການ (ຕອນຕິກສົ່ງອອກຢູ່ຂັ້ນ 1). ຖ້າບໍ່ມີທັງສອງ -> ບໍ່ສົ່ງອອກ
        const results = await env.DB.batch(idList.map((rid) =>
          env.DB.prepare(
            `UPDATE new_coolers SET status = 'shipped_out',
                    ship_province = COALESCE(NULLIF(?1, ''), ship_province),
                    ship_warehouse = CASE WHEN ?1 != '' THEN NULLIF(?5, '') ELSE ship_warehouse END,
                    ship_note = COALESCE(NULLIF(?2, ''), ship_note),
                    shipped_by = ?3, shipped_at = CURRENT_TIMESTAMP, ship_requested = 0
              WHERE id = ?4 AND status = 'confirmed' AND ship_requested = 1 AND trip_id IS NULL
                AND (?1 != '' OR (ship_province IS NOT NULL AND ship_province != ''))`
          ).bind(prov, noteVal, actorEmail, rid, whChk.wh)
        ));
        const shipped = results.filter((r) => r.meta && r.meta.changes).length;
        return Response.json({ shipped, failed: idList.length - shipped, province: prov });
      } catch (e) {
        console.error("/api/admin/ship-new-coolers", e);
        return Response.json({ error: "ບັນທຶກການສົ່ງອອກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຍົກເລີກການສົ່ງອອກຕ່າງແຂວງ (shipped_out => confirmed) ກໍລະນີບັນທຶກຜິດ
    if (url.pathname === "/api/admin/unship-new-cooler" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const res = await env.DB.prepare(
          `UPDATE new_coolers SET status = 'confirmed', ship_requested = 1, shipped_by = NULL, shipped_at = NULL, trip_id = NULL, trip_scanned_at = NULL, trip_scanned_by = NULL
            WHERE id = ? AND status = 'shipped_out'`
        ).bind(id).run();
        if (!res.meta || !res.meta.changes) {
          return Response.json({ error: "ຍົກເລີກບໍ່ໄດ້ (ບໍ່ພົບລາຍການ ຫຼື ບໍ່ໄດ້ຢູ່ໃນສະຖານະສົ່ງອອກຕ່າງແຂວງ)" }, { status: 400 });
        }
        return Response.json({ message: "ຍົກເລີກການສົ່ງອອກແລ້ວ (ກັບເປັນ ລໍຖ້າຢືນຢັນສົ່ງອອກ)" });
      } catch (e) {
        console.error("/api/admin/unship-new-cooler", e);
        return Response.json({ error: "ຍົກເລີກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຍົກເລີກລາຍການ "ລໍຖ້າຢືນຢັນສົ່ງອອກຕ່າງແຂວງ" (ship_requested 1 => 0) ຕູ້ຍັງເປັນ "ຢືນຢັນແລ້ວ" ລໍຖ້າຮັບເຂົ້າສາງ
    if (url.pathname === "/api/admin/cancel-ship-request-new-cooler" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const res = await env.DB.prepare(
          "UPDATE new_coolers SET ship_requested = 0, ship_province = NULL, ship_warehouse = NULL, ship_note = NULL WHERE id = ? AND status = 'confirmed' AND ship_requested = 1 AND trip_id IS NULL"
        ).bind(id).run();
        if (!res.meta || !res.meta.changes) {
          const cur = await env.DB.prepare("SELECT status, trip_id FROM new_coolers WHERE id = ?").bind(id).first();
          if (cur && cur.status === "confirmed" && cur.trip_id) {
            return Response.json({ error: "ຍົກເລີກບໍ່ໄດ້ ຕູ້ນີ້ຢູ່ໃນຖ້ຽວລົດແລ້ວ — ເອົາອອກຈາກຖ້ຽວກ່ອນ" }, { status: 409 });
          }
          return Response.json({ error: "ຍົກເລີກບໍ່ໄດ້ (ບໍ່ພົບລາຍການ ຫຼື ບໍ່ໄດ້ຢູ່ໃນສະຖານະລໍຖ້າຢືນຢັນສົ່ງອອກ)" }, { status: 400 });
        }
        return Response.json({ message: "ຍົກເລີກລາຍການສົ່ງອອກແລ້ວ (ກັບເປັນ ຢືນຢັນແລ້ວ ລໍຖ້າຮັບເຂົ້າສາງ)" });
      } catch (e) {
        console.error("/api/admin/cancel-ship-request-new-cooler", e);
        return Response.json({ error: "ຍົກເລີກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===================== ແຜນສົ່ງຕູ້ແຊ່ຕ່າງແຂວງ: ຄວາມຈຸລົດ (truck_types) + ຕູ້ທີ່ລໍຖ້າຈັດຖ້ຽວ (admin ເທົ່ານັ້ນ) =====================
    // ຕູ້ລໍຖ້າຈັດຖ້ຽວ = ຕູ້ໃໝ່ທີ່ຢືນຢັນແລ້ວ + ໝາຍສົ່ງຕ່າງແຂວງ + ຍັງບໍ່ຢູ່ໃນຖ້ຽວໃດ; ຈຳນວນປະຕູເດົາຈາກຊື່ Type/Model (inferDoorsFromCooler)
    if (url.pathname === "/api/admin/ship-plan" && request.method === "GET") {
      let trucks = [], sizes = [], tableMissing = false;
      try {
        const r = await env.DB.prepare("SELECT id, name, bed_w, bed_l, allow_rotate, note FROM truck_types ORDER BY id LIMIT 1").all();
        trucks = r.results || [];
        const z = await env.DB.prepare("SELECT id, label, doors, models, w, l, max_per_truck, is_default FROM truck_cooler_sizes ORDER BY sort_order, id").all();
        sizes = z.results || [];
      } catch (e) { tableMissing = true; } // ຍັງບໍ່ໄດ້ຮັນ migration_add_truck_types.sql
      const sizeOf = shipPlanSizeResolver(sizes);
      const { results: rows } = await env.DB.prepare(
        `SELECT TRIM(COALESCE(ship_province, '')) AS province, TRIM(COALESCE(ship_warehouse, '')) AS warehouse, TRIM(COALESCE(cooler_brand, '')) AS brand, cooler_type, cooler_model
           FROM new_coolers
          WHERE status = 'confirmed' AND ship_requested = 1 AND trip_id IS NULL AND TRIM(COALESCE(ship_province, '')) != ''`
      ).all();
      const map = {};
      for (const r of rows || []) {
        const k = r.province + "\u0001" + r.warehouse + "\u0001" + planBrandKey(r.brand);
        const g = (map[k] = map[k] || { province: r.province, warehouse: r.warehouse, brand: r.brand, counts: {}, unknown: 0 });
        const sid = sizeOf(r.cooler_model, r.cooler_type);
        if (sid) g.counts[sid] = (g.counts[sid] || 0) + 1; else g.unknown++;
      }
      // ຕູ້ທີ່ "ຈອງໄວ້" ໃນແຜນຂອງຖ້ຽວ open (ຍັງບໍ່ໄດ້ຂຶ້ນລົດ) ບໍ່ນັບເປັນຕູ້ລໍຖ້າຈັດຖ້ຽວອີກ — ກັນຄິດແຜນຊ້ຳ
      const openPlans = tableMissing ? new Map() : await loadTripPlans(env, { sizes, sizeLabel: {}, sizeOf }, null);
      for (const items of openPlans.values()) {
        for (const it of items) {
          let left = it.qty - it.loaded;
          if (left <= 0) continue;
          const groups = Object.values(map).filter((g) => g.province === it.province && (!it.warehouse || g.warehouse === it.warehouse) && (!it.brand || planBrandKey(g.brand) === planBrandKey(it.brand)));
          groups.sort((a, b) => (b.warehouse === it.warehouse ? 1 : 0) - (a.warehouse === it.warehouse ? 1 : 0));
          for (const g of groups) {
            const take = Math.min(left, g.counts[it.size_id] || 0);
            if (take > 0) { g.counts[it.size_id] -= take; left -= take; }
            if (left <= 0) break;
          }
        }
      }
      for (const g of Object.values(map)) for (const k of Object.keys(g.counts)) if (g.counts[k] <= 0) delete g.counts[k];
      const pending = Object.values(map)
        .filter((g) => g.unknown > 0 || Object.values(g.counts).some((n) => n > 0))
        .sort((a, b) => a.province.localeCompare(b.province) || a.warehouse.localeCompare(b.warehouse) || String(a.brand || "").localeCompare(String(b.brand || "")));
      return Response.json({ trucks, sizes, pending, table_missing: tableMissing });
    }

    // ກວດງົບກ່ອນສ້າງຖ້ຽວ (ໃຊ້ເຕືອນໃນ modal) body: { trucks: [{ items: [{ province, warehouse, brand, size_id, n }] }] }
    if (url.pathname === "/api/admin/ship-plan/budget-check" && request.method === "POST") {
      try {
        const b = await request.json();
        const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
        const trucks = (Array.isArray(b.trucks) ? b.trucks : []).slice(0, 20).map((t) => ({
          items: (Array.isArray(t && t.items) ? t.items : []).map((it) => ({
            province: clean(it.province, 100), warehouse: clean(it.warehouse, 100), brand: clean(it.brand, 100), size_id: Number(it.size_id), n: Number(it.n), ref: clean(it.ref, 40)
          })).filter((it) => it.province && Number.isInteger(it.size_id) && Number.isInteger(it.n) && it.n >= 1)
        }));
        const sz = await loadShipSizes(env);
        const r = await shipPlanBudgetCheck(env, sz, trucks);
        return Response.json({ ok: !r.problems.length, problems: r.problems, unchecked: r.unchecked });
      } catch (e) {
        console.error("ship-plan budget-check failed", e);
        return Response.json({ error: "ກວດງົບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ສ້າງຖ້ຽວລົດຈາກແຜນສົ່ງຕູ້: ລົດ 1 ຄັນໃນແຜນ = 1 ຖ້ຽວ. ເລືອກຕູ້ຈິງ (ລໍຖ້າຈັດຖ້ຽວ) ຕາມແຂວງ/ສາງ/ຊະນິດ ແລ້ວໃສ່ເຂົ້າຖ້ຽວ
    // ຖ້າຕູ້ບໍ່ພໍ ຈະບໍ່ສ້າງຖ້ຽວໃດເລີຍ (409 + ລາຍລະອຽດ)
    if (url.pathname === "/api/admin/ship-plan/create-trips" && request.method === "POST") {
      try {
        const b = await request.json();
        const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
        const inTrucks = Array.isArray(b.trucks) ? b.trucks : [];
        if (!inTrucks.length) return Response.json({ error: "ກະລຸນາໝາຍເລືອກລົດຢ່າງໜ້ອຍ 1 ຄັນ" }, { status: 400 });
        if (inTrucks.length > 20) return Response.json({ error: "ສ້າງໄດ້ສູງສຸດ 20 ຖ້ຽວຕໍ່ຄັ້ງ" }, { status: 400 });
        const trucks = [];
        for (let i = 0; i < inTrucks.length; i++) {
          const t = inTrucks[i] || {};
          const plate = clean(t.plate, 30); // ປ່ອຍວ່າງໄດ້ (ສ້າງແຜນລ່ວງໜ້າ ຍັງບໍ່ຮູ້ທະບຽນ) — ຕ້ອງໃສ່ກ່ອນລົດອອກ
          const items = [];
          for (const it of Array.isArray(t.items) ? t.items : []) {
            const n = Number(it.n), sid = Number(it.size_id), province = clean(it.province, 100);
            if (!province) return Response.json({ error: `ລົດຄັນທີ ${i + 1} ມີລາຍການທີ່ຍັງບໍ່ໄດ້ເລືອກແຂວງ` }, { status: 400 });
            if (!Number.isInteger(n) || n < 1 || !Number.isInteger(sid)) continue;
            items.push({ province, warehouse: clean(it.warehouse, 100), brand: clean(it.brand, 100), size_id: sid, n });
          }
          if (!items.length) return Response.json({ error: `ລົດຄັນທີ ${i + 1} ບໍ່ມີຕູ້` }, { status: 400 });
          trucks.push({ plate, driver_name: t.driver_name, driver_phone: t.driver_phone, items });
        }

        const sz = await loadShipSizes(env);
        if (!sz.sizes.length) return Response.json({ error: "ຍັງບໍ່ໄດ້ຕັ້ງຂະໜາດລົດ / ຊະນິດຕູ້" }, { status: 400 });
        const whMap = await provWhMap(env);
        // ກວດແຜນກ່ອນສ້າງ: ຊະນິດຕູ້ຕ້ອງມີ, ສາງຕ້ອງຢູ່ໃນແຂວງນັ້ນ — ຖ້າບໍ່ຜ່ານ ບໍ່ສ້າງຖ້ຽວໃດເລີຍ
        const planErrors = [];
        for (let i = 0; i < trucks.length; i++) {
          for (const it of trucks[i].items) {
            if (!sz.sizeLabel[it.size_id]) { planErrors.push(`ລົດຄັນທີ ${i + 1}: ບໍ່ພົບຊະນິດຕູ້ໃນການຕັ້ງຄ່າ (ອາດຖືກແກ້ໄຂແລ້ວ) — ກະລຸນາຄິດແຜນໃໝ່`); continue; }
            const chk = provWhResolve(whMap, it.province, it.warehouse, false);
            if (chk.error) planErrors.push(`ລົດຄັນທີ ${i + 1}: ${chk.error}`);
            else it.warehouse = chk.wh;
          }
        }
        if (planErrors.length) return Response.json({ error: "ແຜນບໍ່ຖືກຕ້ອງ — ບໍ່ໄດ້ສ້າງຖ້ຽວໃດເລີຍ", details: [...new Set(planErrors)].slice(0, 5) }, { status: 409 });

        // ກວດງົບຕູ້ແຊ່ຕ່າງແຂວງ (Brand/Type/Model ຂອງຕູ້ໃນແຜນ): ງົບບໍ່ພໍ ຫຼື ບໍ່ໄດ້ກຳນົດງົບ -> ເຕືອນ ແລະ ບໍ່ສ້າງ ເວັ້ນແຕ່ admin ຢືນຢັນເອົາໄປນອກງົບ (allow_over_budget)
        const budget = await shipPlanBudgetCheck(env, sz, trucks);
        const overBudget = budget.problems.length > 0;
        const allowOver = b.allow_over_budget === true;
        if (overBudget && !allowOver) {
          return Response.json({ code: "over_budget", error: "ງົບຕູ້ແຊ່ຕ່າງແຂວງບໍ່ພໍ ຫຼື ຍັງບໍ່ໄດ້ກຳນົດງົບ — ບໍ່ໄດ້ສ້າງຖ້ຽວໃດເລີຍ", details: budget.problems.map((p) => p.text).slice(0, 8), problems: budget.problems }, { status: 409 });
        }
        const actorEmail = (session && session.email) || null;

        // ກັນກົດຊ້ຳ: ຖ້າ admin ຄົນດຽວກັນ ສ້າງຖ້ຽວທີ່ທະບຽນລົດ + ຈຳນວນຕູ້ໃນແຜນ ຄືກັນທຸກຄັນ ພາຍໃນ 20 ວິນາທີຫຼ້າສຸດ (ກົດປຸ່ມຊ້ຳ / ເນັດຊ້າ)
        // ໃຫ້ສົ່ງຖ້ຽວທີ່ເພິ່ງສ້າງຄືນ ບໍ່ສ້າງເລກຖ້ຽວໃໝ່ຊ້ຳ
        if (actorEmail) {
          const { results: recent } = await env.DB.prepare(
            `SELECT t.id, t.trip_no, t.truck_plate,
                    (SELECT IFNULL(SUM(p.qty), 0) FROM ship_trip_plan_items p WHERE p.trip_id = t.id) AS planned
               FROM ship_trips t
              WHERE t.created_by = ? AND t.status = 'open' AND t.created_at >= datetime('now', '-20 seconds')
              ORDER BY t.id DESC LIMIT ?`
          ).bind(actorEmail, trucks.length).all();
          const rec = (recent || []).slice().reverse();
          if (rec.length === trucks.length && rec.every((r, k) =>
            String(r.truck_plate || "") === String(trucks[k].plate || "") &&
            Number(r.planned) === trucks[k].items.reduce((a, it) => a + it.n, 0))) {
            return Response.json({
              trips: rec.map((r) => ({ id: r.id, trip_no: r.trip_no, truck_plate: r.truck_plate, planned: Number(r.planned), over_budget: false })),
              duplicate: true,
            });
          }
        }

        // ສ້າງຖ້ຽວ (ລໍຖ້າຈັດຕູ້ຂຶ້ນລົດ) + ບັນທຶກແຜນ — ຍັງບໍ່ເອົາຕູ້ໃສ່ຖ້ຽວ. ຕູ້ຈະເຂົ້າຖ້ຽວຕອນສະແກນ/ເລືອກຕູ້ຂຶ້ນລົດ (ສະເພາະຕູ້ທີ່ຢູ່ໃນແຜນ)
        const created = [];
        for (let i = 0; i < trucks.length; i++) {
          const t = trucks[i];
          const trip = await createShipTripRow(env, { truck_plate: t.plate, driver_name: t.driver_name, driver_phone: t.driver_phone, trip_date: b.trip_date, note: (b.note || "ຈາກແຜນສົ່ງຕູ້") + (overBudget && allowOver ? " • ເກີນງົບ (admin ອະນຸມັດ)" : "") }, actorEmail);
          if (!trip) return Response.json({ error: "ສ້າງເລກຖ້ຽວບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່", created }, { status: 500 });
          try {
            await env.DB.batch(t.items.map((it) => env.DB.prepare(
              "INSERT INTO ship_trip_plan_items (trip_id, province, warehouse, brand, size_id, size_label, qty) VALUES (?, ?, ?, ?, ?, ?, ?)"
            ).bind(trip.id, it.province, it.warehouse || "", it.brand || "", it.size_id, sz.sizeLabel[it.size_id] || null, it.n)));
          } catch (e) {
            await env.DB.prepare("DELETE FROM ship_trips WHERE id = ? AND status = 'open'").bind(trip.id).run();
            console.error("ship-plan plan items insert failed", e);
            return Response.json({ error: "ບັນທຶກແຜນຂອງຖ້ຽວບໍ່ສຳເລັດ — ກວດວ່າຮັນ migration_add_ship_trip_plan_items.sql ແລະ migration_add_ship_trip_plan_brand.sql ແລ້ວ", created }, { status: 500 });
          }
          if (overBudget && allowOver) {
            try {
              await env.DB.prepare("UPDATE ship_trips SET budget_override = 1, budget_override_by = ? WHERE id = ?").bind(actorEmail, trip.id).run();
            } catch (e) {
              console.error("/api/admin/ship-plan/create-trips", e);
              await env.DB.batch([
                env.DB.prepare("DELETE FROM ship_trip_plan_items WHERE trip_id = ?").bind(trip.id),
                env.DB.prepare("DELETE FROM ship_trips WHERE id = ? AND status = 'open'").bind(trip.id)
              ]);
              console.error("ship-plan budget override mark failed", e);
              return Response.json({ error: "ບັນທຶກການອະນຸມັດເກີນງົບບໍ່ສຳເລັດ — ກວດວ່າຮັນ migration_add_ship_trip_budget_override.sql ແລ້ວ", created }, { status: 500 });
            }
          }
          created.push({ id: trip.id, trip_no: trip.trip_no, truck_plate: trip.truck_plate, planned: t.items.reduce((a, it) => a + it.n, 0), over_budget: overBudget && allowOver });
        }
        return Response.json({ trips: created });
      } catch (e) {
        console.error("ship-plan create-trips failed", e);
        return Response.json({ error: "ສ້າງຖ້ຽວຈາກແຜນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/truck-types/save" && request.method === "POST") {
      try {
        const b = await request.json();
        const name = String(b.name || "").trim().slice(0, 100) || "ລົດບັນທຸກ";
        const note = String(b.note || "").trim().slice(0, 300) || null;
        const bw = Number(b.bed_w), bl = Number(b.bed_l);
        if (!Number.isInteger(bw) || bw < 10 || bw > 2000 || !Number.isInteger(bl) || bl < 10 || bl > 2000) {
          return Response.json({ error: "ຂະໜາດກະບະຕ້ອງເປັນຕົວເລກເຕັມ (cm) ລະຫວ່າງ 10 - 2000" }, { status: 400 });
        }
        const rot = b.allow_rotate ? 1 : 0;
        const inSizes = Array.isArray(b.sizes) ? b.sizes : [];
        if (!inSizes.length) return Response.json({ error: "ກະລຸນາມີຊະນິດຕູ້ຢ່າງໜ້ອຍ 1 ແບບ" }, { status: 400 });
        if (inSizes.length > 30) return Response.json({ error: "ຊະນິດຕູ້ຫຼາຍເກີນໄປ (ສູງສຸດ 30)" }, { status: 400 });
        const sizes = [];
        for (const z of inSizes) {
          const doors = Number(z.doors), w = Number(z.w), l = Number(z.l), mx = Number(z.max_per_truck);
          const label = String(z.label || "").trim().slice(0, 80);
          if (!label) return Response.json({ error: "ກະລຸນາໃສ່ຊື່ຊະນິດຕູ້ທຸກແຖວ" }, { status: 400 });
          if (![1, 2, 3].includes(doors)) return Response.json({ error: "ຈຳນວນປະຕູຕ້ອງເປັນ 1, 2 ຫຼື 3" }, { status: 400 });
          if (!Number.isInteger(w) || w < 10 || w > 500 || !Number.isInteger(l) || l < 10 || l > 500) return Response.json({ error: `ຂະໜາດຕູ້ "${label}" ຕ້ອງເປັນຕົວເລກເຕັມ (cm) 10 - 500` }, { status: 400 });
          if (!Number.isInteger(mx) || mx < 1 || mx > 1000) return Response.json({ error: `ຈຳກັດຈຳນວນຕໍ່ລົດຂອງ "${label}" ຕ້ອງເປັນຈຳນວນເຕັມ 1 - 1000` }, { status: 400 });
          sizes.push({ label, doors, models: String(z.models || "").trim().slice(0, 300), w, l, mx, def: z.is_default ? 1 : 0 });
        }
        // ແຕ່ລະຈຳນວນປະຕູ ຕ້ອງມີຊະນິດ "ຄ່າເລີ່ມຕົ້ນ" ພຽງ 1 ແບບ (ຖ້າບໍ່ໄດ້ເລືອກ ໃຊ້ແບບທຳອິດ, ຖ້າເລືອກຫຼາຍ ໃຊ້ແບບທຳອິດທີ່ເລືອກ)
        for (const d of [1, 2, 3]) {
          const g = sizes.filter((z) => z.doors === d);
          if (!g.length) continue;
          const keep = g.find((z) => z.def) || g[0];
          g.forEach((z) => { z.def = z === keep ? 1 : 0; });
        }
        const actor = (session && session.email) || null;
        const stmts = [];
        const ex = await env.DB.prepare("SELECT id FROM truck_types ORDER BY id LIMIT 1").first();
        if (ex) {
          stmts.push(env.DB.prepare(
            "UPDATE truck_types SET name = ?, bed_w = ?, bed_l = ?, allow_rotate = ?, note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).bind(name, bw, bl, rot, note, actor, ex.id));
        } else {
          stmts.push(env.DB.prepare(
            "INSERT INTO truck_types (name, bed_w, bed_l, allow_rotate, note, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(name, bw, bl, rot, note, actor));
        }
        stmts.push(env.DB.prepare("DELETE FROM truck_cooler_sizes"));
        sizes.forEach((z, i) => {
          stmts.push(env.DB.prepare(
            "INSERT INTO truck_cooler_sizes (label, doors, models, w, l, max_per_truck, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(z.label, z.doors, z.models || null, z.w, z.l, z.mx, z.def, i + 1));
        });
        await env.DB.batch(stmts);
        return Response.json({ message: "ບັນທຶກຂະໜາດລົດ ແລະ ຊະນິດຕູ້ແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/truck-types/save", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_truck_types.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/truck-types/delete" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM truck_types WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບປະເພດລົດແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/truck-types/delete", e);
        return Response.json({ error: "ລຶບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===================== ງົບຕູ້ແຊ່ຕ່າງແຂວງ: Dashboard + ກຳນົດງົບ (admin ເທົ່ານັ້ນ ຜ່ານ /api/admin/*) =====================
    if (url.pathname === "/api/admin/prov-budgets" && request.method === "GET") {
      const budgets = await loadProvBudgets(env, true);
      const idx = pbIndex(budgets);
      const usage = await provBudgetUsageRows(env);
      const { used: usedMap, reserved: resMap, none } = pbUsage(idx, usage);
      // ຈອງໃນແຜນ (planned): ຕັດງົບທັນທີທີ່ສ້າງຖ້ຽວຈາກແຜນ ແຕ່ເປັນສະຖານະແຍກຕ່າງຫາກ
      let plannedMap = {}, plannedNone = [];
      try {
        const pm = await provBudgetPlannedMap(env, idx, await loadShipSizes(env));
        plannedMap = pm.planned; plannedNone = pm.none;
      } catch (e) { console.error("/api/admin/prov-budgets planned", e); }
      const rows = budgets.map((b) => {
        const k = pbKey(b.province, b.warehouse, b.cooler_brand, b.cooler_type);
        return { ...b, used: usedMap[k] || 0, reserved: resMap[k] || 0, planned: plannedMap[k] || 0 };
      });
      // ຕູ້ທີ່ບໍ່ມີງົບຄຸມ: ລວມຕາມ ແຂວງ/ສາງ/Brand/Type
      const unbudgeted = [];
      for (const r of none) {
        const k = pbKey(r.province, r.warehouse, r.brand, r.type);
        let u = unbudgeted.find((x) => x.k === k);
        if (!u) { u = { k, province: r.province, warehouse: r.warehouse, cooler_brand: r.brand, cooler_type: r.type, used: 0, reserved: 0, planned: 0 }; unbudgeted.push(u); }
        if (r.st === "used") u.used += r.c; else u.reserved += r.c;
      }
      for (const r of plannedNone) {
        const k = pbKey(r.province, r.warehouse, r.brand, r.type);
        let u = unbudgeted.find((x) => x.k === k);
        if (!u) { u = { k, province: r.province, warehouse: r.warehouse, cooler_brand: r.brand, cooler_type: r.type, used: 0, reserved: 0, planned: 0 }; unbudgeted.push(u); }
        u.planned += r.c;
      }
      unbudgeted.forEach((u) => { delete u.k; });
      const { results: pv } = await env.DB.prepare("SELECT name FROM ship_provinces ORDER BY name").all();
      const warehouses = await provWhMap(env);
      return Response.json({ budgets: rows, unbudgeted, provinces: (pv || []).map((x) => x.name), warehouses });
    }

    if (url.pathname === "/api/admin/prov-budgets/save" && request.method === "POST") {
      try {
        const b = await request.json();
        const province = String(b.province || "").trim().slice(0, 100);
        const warehouse = String(b.warehouse || "").trim().slice(0, 100);
        const brand = String(b.cooler_brand || "").trim().slice(0, 100);
        const type = String(b.cooler_type || "").trim().slice(0, 100);
        const quota = Number(b.quota);
        const note = String(b.note || "").trim().slice(0, 300) || null;
        if (!province || !brand || !type) return Response.json({ error: "ກະລຸນາເລືອກແຂວງ, Brand ແລະ Type ໃຫ້ຄົບ" }, { status: 400 });
        if (!Number.isInteger(quota) || quota < 0) return Response.json({ error: "ໂຄຕ້າຕ້ອງເປັນຈຳນວນເຕັມ ແລະ ບໍ່ຕິດລົບ" }, { status: 400 });
        const actor = (session && session.email) || null;
        // ສາງຕ້ອງເປັນສາງສະເພາະຂອງແຂວງນີ້; ແຂວງທີ່ບໍ່ມີສາງ ຫຼື ງົບເກົ່າ (ທັງແຂວງ) ປ່ອຍວ່າງໄດ້
        const whChk = provWhResolve(await provWhMap(env), province, warehouse, false);
        if (whChk.error) return Response.json({ error: whChk.error }, { status: 400 });
        if (!whChk.wh) {
          // ບໍ່ເລືອກສາງ: ອະນຸຍາດສະເພາະແຂວງທີ່ບໍ່ມີສາງ ຫຼື ແຖວງົບເກົ່າ (ທັງແຂວງ) ທີ່ກຳລັງແກ້ໄຂຢູ່
          const names = (await provWhMap(env))[province] || [];
          const editingLegacy = b.id ? !!(await env.DB.prepare("SELECT 1 AS x FROM province_budgets WHERE id = ? AND COALESCE(warehouse, '') = ''").bind(b.id).first()) : false;
          if (names.length && !editingLegacy) return Response.json({ error: `ແຂວງ "${province}" ມີສາງສະເພາະແຂວງ — ກະລຸນາເລືອກສາງ` }, { status: 400 });
        }
        try {
          if (b.id) {
            const r = await env.DB.prepare(
              "UPDATE province_budgets SET province = ?, warehouse = ?, cooler_brand = ?, cooler_type = ?, quota = ?, note = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(province, whChk.wh, brand, type, quota, note, actor, b.id).run();
            if (!r.meta || !r.meta.changes) return Response.json({ error: "ບໍ່ພົບລາຍການງົບນີ້" }, { status: 404 });
          } else {
            await env.DB.prepare(
              "INSERT INTO province_budgets (province, warehouse, cooler_brand, cooler_type, quota, note, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
            ).bind(province, whChk.wh, brand, type, quota, note, actor).run();
          }
        } catch (dbErr) {
          console.error("/api/admin/prov-budgets/save", dbErr);
          if (/UNIQUE/i.test(String(dbErr && dbErr.message))) return Response.json({ error: "ແຂວງ / ສາງ / Brand / Type ນີ້ມີງົບແລ້ວ — ໃຫ້ກົດແກ້ໄຂແຖວເດີມ" }, { status: 400 });
          throw dbErr;
        }
        return Response.json({ message: "ບັນທຶກງົບຕູ້ແຊ່ຕ່າງແຂວງແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/prov-budgets/save", e);
        return Response.json({ error: "ບັນທຶກງົບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // Import ງົບຈາກ Excel (frontend ອ່ານໄຟລ໌ແລ້ວສົ່ງມາເປັນກ້ອນລະບໍ່ເກີນ 200 ແຖວ): upsert ຕາມ ແຂວງ + ສາງ + Brand + Type
    //   ມີແລ້ວ -> ອັບເດດໂຄຕ້າ (ໝາຍເຫດວ່າງ = ຄົງໝາຍເຫດເກົ່າ); ບໍ່ມີ -> ເພີ່ມໃໝ່. ແຖວທີ່ບໍ່ຖືກຕ້ອງຖືກຂ້າມ ແລະ ລາຍງານເຫດຜົນຄືນ
    if (url.pathname === "/api/admin/prov-budgets/import" && request.method === "POST") {
      try {
        const body = await request.json();
        const items = Array.isArray(body.rows) ? body.rows : [];
        if (!items.length) return Response.json({ error: "ບໍ່ມີຂໍ້ມູນ" }, { status: 400 });
        if (items.length > 200) return Response.json({ error: "ສົ່ງໄດ້ສູງສຸດ 200 ແຖວຕໍ່ຄັ້ງ" }, { status: 400 });
        const actor = (session && session.email) || null;
        const whMap = await provWhMap(env);
        const provSet = new Set((await env.DB.prepare("SELECT name FROM ship_provinces").all()).results?.map((r) => r.name) || []);
        const brandMap = new Map(((await env.DB.prepare("SELECT name FROM cooler_brands").all()).results || []).map((r) => [String(r.name).trim().toLowerCase(), r.name]));
        const typeMap = new Map(((await env.DB.prepare("SELECT name FROM cooler_types").all()).results || []).map((r) => [String(r.name).trim().toLowerCase(), r.name]));
        const existing = new Set(((await env.DB.prepare("SELECT province, COALESCE(warehouse, '') AS warehouse, cooler_brand, cooler_type FROM province_budgets").all()).results || [])
          .map((r) => pbKey(r.province, r.warehouse, r.cooler_brand, r.cooler_type)));
        const errors = [];
        const stmts = [];
        const seen = new Set();
        let inserted = 0, updated = 0;
        for (const it of items) {
          const rowNo = Number(it.row) || 0;
          const province = String(it.province || "").trim().slice(0, 100);
          const warehouse = String(it.warehouse || "").trim().slice(0, 100);
          const brandIn = String(it.cooler_brand || "").trim();
          const typeIn = String(it.cooler_type || "").trim();
          const quotaRaw = typeof it.quota === "string" ? it.quota.replace(/,/g, "").trim() : it.quota;
          const quota = Number(quotaRaw);
          const note = String(it.note || "").trim().slice(0, 300) || null;
          const fail = (reason) => errors.push({ row: rowNo, reason });
          if (!province || !brandIn || !typeIn) { fail("ຂາດ ແຂວງ / Brand / Type"); continue; }
          if (quotaRaw === "" || quotaRaw === null || quotaRaw === undefined || !Number.isInteger(quota) || quota < 0) { fail("ໂຄຕ້າຕ້ອງເປັນຈຳນວນເຕັມ ແລະ ບໍ່ຕິດລົບ"); continue; }
          if (provSet.size && !provSet.has(province)) { fail(`ບໍ່ພົບແຂວງ "${province}" ໃນລາຍການແຂວງ`); continue; }
          const brand = brandMap.get(brandIn.toLowerCase());
          if (!brand) { fail(`Brand "${brandIn}" ບໍ່ຢູ່ໃນລະບົບ`); continue; }
          const type = typeMap.get(typeIn.toLowerCase());
          if (!type) { fail(`Type "${typeIn}" ບໍ່ຢູ່ໃນລະບົບ`); continue; }
          const chk = provWhResolve(whMap, province, warehouse, false);
          if (chk.error) { fail(chk.error); continue; }
          // ແຂວງທີ່ມີສາງ ຕ້ອງລະບຸສາງ (ງົບແບບທັງແຂວງ "ສາງວ່າງ" ໃຊ້ໄດ້ສະເພາະແຖວເກົ່າທີ່ມີຢູ່ແລ້ວ)
          const k = pbKey(province, chk.wh, brand, type);
          if (!chk.wh && (whMap[province] || []).length && !existing.has(k)) { fail(`ແຂວງ "${province}" ມີສາງສະເພາະແຂວງ — ກະລຸນາລະບຸສາງ`); continue; }
          if (seen.has(k)) { fail("ແຖວຊ້ຳໃນໄຟລ໌ (ແຂວງ/ສາງ/Brand/Type ດຽວກັນ) — ຂ້າມ, ໃຊ້ແຖວທຳອິດ"); continue; }
          seen.add(k);
          if (existing.has(k)) updated++; else inserted++;
          existing.add(k);
          stmts.push(env.DB.prepare(
            `INSERT INTO province_budgets (province, warehouse, cooler_brand, cooler_type, quota, note, updated_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (province, warehouse, cooler_brand, cooler_type) DO UPDATE SET
               quota = excluded.quota, note = COALESCE(excluded.note, province_budgets.note),
               updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
          ).bind(province, chk.wh, brand, type, quota, note, actor));
        }
        if (stmts.length) await env.DB.batch(stmts);
        return Response.json({ inserted, updated, errors });
      } catch (e) {
        console.error("/api/admin/prov-budgets/import", e);
        return Response.json({ error: "ນຳເຂົ້າງົບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/prov-budgets/delete" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM province_budgets WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບງົບແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/prov-budgets/delete", e);
        return Response.json({ error: "ລຶບງົບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===================== ຈັດການແຂວງ (ship_provinces): ເພີ່ມ / ແກ້ຊື່ / ລຶບ + ກຳນົດວ່າແຂວງນີ້ມີສາງໃດແດ່ =====================
    // ແຂວງ 1 ແຂວງ ມີຫຼາຍ "ສາງສະເພາະແຂວງ" ໄດ້ (ship_province_warehouses — ແຍກຈາກສາງຫຼັກ wh_warehouses). ງົບຄິດຕໍ່ແຂວງ
    if (url.pathname === "/api/admin/provinces" && request.method === "GET") {
      const { results: pv } = await env.DB.prepare("SELECT id, name, note FROM ship_provinces ORDER BY name").all();
      const { results: whs } = await env.DB.prepare("SELECT id, province_id, name FROM ship_province_warehouses ORDER BY name").all();
      const { results: bc } = await env.DB.prepare("SELECT province, COUNT(*) AS c FROM province_budgets GROUP BY province").all();
      const budgetCount = {};
      for (const r of bc || []) budgetCount[r.province] = r.c;
      return Response.json({
        provinces: (pv || []).map((p) => ({
          ...p,
          warehouses: (whs || []).filter((w) => w.province_id === p.id).map((w) => ({ id: w.id, name: w.name })),
          budget_rows: budgetCount[p.name] || 0
        }))
      });
    }

    // ເພີ່ມ (ບໍ່ມີ id) ຫຼື ແກ້ໄຂ (ມີ id) ແຂວງ + ກຳນົດສາງຂອງແຂວງ (warehouse_ids). ແກ້ຊື່ -> ປ່ຽນຊື່ໃນ ງົບ/ຕູ້/ຖ້ຽວ/ສາງ ໃຫ້ອັດຕະໂນມັດ
    if (url.pathname === "/api/admin/provinces/save" && request.method === "POST") {
      try {
        const b = await request.json();
        const name = String(b.name || "").trim().slice(0, 100);
        const note = String(b.note || "").trim().slice(0, 300) || null;
        // ສາງສະເພາະແຂວງ: ລາຍຊື່ (ຕັດຊ້ຳ, ສູງສຸດ 50 ສາງ). null = ບໍ່ແຕະຕ້ອງລາຍການສາງ
        const whNames = Array.isArray(b.warehouses)
          ? [...new Set(b.warehouses.map((x) => String(x || "").trim().slice(0, 100)).filter(Boolean))].slice(0, 50)
          : null;
        if (!name) return Response.json({ error: "ກະລຸນາປ້ອນຊື່ແຂວງ" }, { status: 400 });
        const actor = (session && session.email) || null;
        const dup = await env.DB.prepare("SELECT id FROM ship_provinces WHERE name = ? AND id != ?").bind(name, b.id || 0).first();
        if (dup) return Response.json({ error: "ມີແຂວງຊື່ນີ້ແລ້ວ" }, { status: 400 });

        const stmts = [];
        let provId = b.id ? Number(b.id) : null;
        if (provId) {
          const old = await env.DB.prepare("SELECT id, name FROM ship_provinces WHERE id = ?").bind(provId).first();
          if (!old) return Response.json({ error: "ບໍ່ພົບແຂວງນີ້" }, { status: 404 });
          if (old.name !== name) {
            stmts.push(
              env.DB.prepare("UPDATE province_budgets SET province = ?1 WHERE TRIM(province) = ?2").bind(name, old.name),
              env.DB.prepare("UPDATE new_coolers SET ship_province = ?1 WHERE TRIM(COALESCE(ship_province, '')) = ?2").bind(name, old.name),
              env.DB.prepare("UPDATE ship_trip_stock SET ship_province = ?1 WHERE TRIM(COALESCE(ship_province, '')) = ?2").bind(name, old.name),
              env.DB.prepare("UPDATE ship_trip_stops SET province = ?1 WHERE TRIM(province) = ?2").bind(name, old.name),
              env.DB.prepare("UPDATE ship_trip_plan_items SET province = ?1 WHERE TRIM(province) = ?2").bind(name, old.name),
              env.DB.prepare("UPDATE ship_trip_receipts SET province = ?1 WHERE TRIM(province) = ?2").bind(name, old.name)
            );
          }
          stmts.push(env.DB.prepare("UPDATE ship_provinces SET name = ?, note = ? WHERE id = ?").bind(name, note, provId));
        }
        if (provId) {
          if (whNames) {
            // ສາງທີ່ຈະຖືກເອົາອອກ ແຕ່ຍັງມີງົບ/ຕູ້ອ້າງອີງຢູ່ -> ບໍ່ອະນຸຍາດ (ງົບຕັດຕາມຊື່ສາງ)
            const { results: curWh } = await env.DB.prepare("SELECT name FROM ship_province_warehouses WHERE province_id = ?").bind(provId).all();
            const removing = (curWh || []).map((w) => w.name).filter((n) => !whNames.includes(n));
            const provNameNow = name;
            const inUse = [];
            for (const wn of removing) {
              const c = await env.DB.prepare(
                `SELECT (SELECT COUNT(*) FROM province_budgets WHERE TRIM(province) = ?1 AND TRIM(COALESCE(warehouse, '')) = ?2) AS budgets,
                        (SELECT COUNT(*) FROM new_coolers WHERE TRIM(COALESCE(ship_province, '')) = ?1 AND TRIM(COALESCE(ship_warehouse, '')) = ?2) AS coolers,
                        (SELECT COUNT(*) FROM ship_trip_stock WHERE TRIM(COALESCE(ship_province, '')) = ?1 AND TRIM(COALESCE(ship_warehouse, '')) = ?2) AS stock`
              ).bind(provNameNow, wn).first();
              const parts = [];
              if (c.budgets) parts.push(`ງົບ ${c.budgets} ແຖວ`);
              if (c.coolers || c.stock) parts.push(`ຕູ້ທີ່ສົ່ງ ${(c.coolers || 0) + (c.stock || 0)} ໜ່ວຍ`);
              if (parts.length) inUse.push(`"${wn}" (${parts.join(", ")})`);
            }
            if (inUse.length) return Response.json({ error: `ລຶບ/ປ່ຽນຊື່ສາງບໍ່ໄດ້ — ຍັງມີຂໍ້ມູນອ້າງອີງ: ${inUse.join("; ")} — ໃຫ້ລຶບງົບຂອງສາງນັ້ນກ່ອນ` }, { status: 400 });
            // ລຶບສາງທີ່ບໍ່ຢູ່ໃນລາຍການໃໝ່ ແລ້ວເພີ່ມສາງໃໝ່ (ຊື່ເກົ່າທີ່ຍັງຢູ່ ບໍ່ແຕະ)
            const ph = whNames.map(() => "?").join(",");
            stmts.push(whNames.length
              ? env.DB.prepare(`DELETE FROM ship_province_warehouses WHERE province_id = ? AND name NOT IN (${ph})`).bind(provId, ...whNames)
              : env.DB.prepare("DELETE FROM ship_province_warehouses WHERE province_id = ?").bind(provId));
            for (const n of whNames) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO ship_province_warehouses (province_id, name) VALUES (?, ?)").bind(provId, n));
          }
          await env.DB.batch(stmts);
        } else {
          // ແຂວງໃໝ່: ເພີ່ມແຂວງກ່ອນ ແລ້ວເອົາ id ມາເພີ່ມສາງ
          const r = await env.DB.prepare("INSERT INTO ship_provinces (name, note, created_by) VALUES (?, ?, ?)").bind(name, note, actor).run();
          const newId = r.meta && r.meta.last_row_id;
          if (newId && whNames && whNames.length) {
            await env.DB.batch(whNames.map((n) => env.DB.prepare("INSERT OR IGNORE INTO ship_province_warehouses (province_id, name) VALUES (?, ?)").bind(newId, n)));
          }
        }
        return Response.json({ message: provId ? "ແກ້ໄຂແຂວງແລ້ວ" : "ເພີ່ມແຂວງແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/provinces/save", e);
        return Response.json({ error: "ບັນທຶກແຂວງບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ລຶບແຂວງ: ລຶບບໍ່ໄດ້ ຖ້າຍັງມີງົບ / ຕູ້ / ຖ້ຽວ ອ້າງອີງຢູ່ (ໃຫ້ແກ້ ຫຼື ເອົາອອກກ່ອນ). ສາງສະເພາະແຂວງຂອງແຂວງນັ້ນຖືກລຶບພ້ອມກັນ
    if (url.pathname === "/api/admin/provinces/delete" && request.method === "POST") {
      try {
        const { id } = await request.json();
        const p = id ? await env.DB.prepare("SELECT id, name FROM ship_provinces WHERE id = ?").bind(id).first() : null;
        if (!p) return Response.json({ error: "ບໍ່ພົບແຂວງນີ້" }, { status: 404 });
        const c = await env.DB.prepare(
          `SELECT (SELECT COUNT(*) FROM province_budgets WHERE TRIM(province) = ?1) AS budgets,
                  (SELECT COUNT(*) FROM new_coolers WHERE TRIM(COALESCE(ship_province, '')) = ?1) AS coolers,
                  (SELECT COUNT(*) FROM ship_trip_stock WHERE TRIM(COALESCE(ship_province, '')) = ?1) AS stock,
                  (SELECT COUNT(*) FROM ship_trip_stops WHERE TRIM(province) = ?1) AS stops`
        ).bind(p.name).first();
        const used = [];
        if (c.budgets) used.push(`ງົບ ${c.budgets} ແຖວ`);
        if (c.coolers || c.stock) used.push(`ຕູ້ທີ່ສົ່ງ ${(c.coolers || 0) + (c.stock || 0)} ໜ່ວຍ`);
        if (c.stops) used.push(`ຖ້ຽວລົດ ${c.stops} ຖ້ຽວ`);
        if (used.length) return Response.json({ error: `ລຶບບໍ່ໄດ້ — ແຂວງ "${p.name}" ຍັງມີ: ${used.join(", ")}` }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare("DELETE FROM ship_province_warehouses WHERE province_id = ?").bind(p.id),
          env.DB.prepare("DELETE FROM ship_provinces WHERE id = ?").bind(p.id)
        ]);
        return Response.json({ message: "ລຶບແຂວງແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/provinces/delete", e);
        return Response.json({ error: "ລຶບແຂວງບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===================== ຖ້ຽວລົດສົ່ງອອກຕ່າງແຂວງ (ship_trips) =====================
    // ລົດ 1 ຄັນ ເອົາຕູ້ຫຼາຍແຂວງໃສ່ຖ້ຽວດຽວກັນໄດ້: ສ້າງຖ້ຽວ (open) -> ເພີ່ມຕູ້ທີ່ \"ລໍຖ້າຢືນຢັນສົ່ງອອກ\" -> ພິມໃບສົ່ງ -> ຢືນຢັນລົດອອກ (departed)
    // ເມື່ອລົດອອກ ຕູ້ທັງໝົດໃນຖ້ຽວຈະເປັນ shipped_out (ບໍ່ສ້າງແຖວໃນ warehouse_stock) ຄືກັບການສົ່ງອອກຕ່າງແຂວງແບບເດີມ
    const tripClean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
    const tripActor = (session && session.email) || null;

    if (url.pathname === "/api/admin/ship-trips" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        // ອ່ານຕູ້ຂອງທຸກຖ້ຽວ "ຄັ້ງດຽວ" (index-only ຜ່ານ idx_*_trip_cover) ແລ້ວ GROUP BY — ແທນ 5 subquery ຕໍ່ຖ້ຽວ ທີ່ອ່ານຊ້ຳ + ໄປອ່ານແຖວຕາຕະລາງຕື່ມ
        `WITH t AS MATERIALIZED (SELECT * FROM ship_trips ORDER BY id DESC LIMIT 500),
              u AS (
                SELECT trip_id, trip_scanned_at AS sc, ship_province AS p FROM new_coolers WHERE trip_id IN (SELECT id FROM t)
                UNION ALL
                SELECT trip_id, scanned_at AS sc, ship_province AS p FROM ship_trip_stock WHERE trip_id IN (SELECT id FROM t)
              ),
              agg AS (
                SELECT trip_id, COUNT(*) AS cooler_count, COUNT(sc) AS scanned_count,
                       GROUP_CONCAT(DISTINCT NULLIF(TRIM(p), '')) AS provinces
                  FROM u GROUP BY trip_id
              )
         SELECT t.*, IFNULL(agg.cooler_count, 0) AS cooler_count, IFNULL(agg.scanned_count, 0) AS scanned_count, agg.provinces AS provinces
           FROM t LEFT JOIN agg ON agg.trip_id = t.id
          ORDER BY t.id DESC`
      ).all();
      return Response.json(results || []);
    }

    // ສ້າງຖ້ຽວລົດໃໝ່ (ເລກຖ້ຽວ TRP-YYYYMMDD-NN)
    if (url.pathname === "/api/admin/ship-trips" && request.method === "POST") {
      try {
        const b = await request.json();
        const plate = tripClean(b.truck_plate, 30); // ປ່ອຍວ່າງໄດ້ — ຕ້ອງໃສ່ກ່ອນລົດອອກ
        const trip = await createShipTripRow(env, { truck_plate: plate, driver_name: b.driver_name, driver_phone: b.driver_phone, trip_date: b.trip_date, note: b.note }, tripActor);
        if (trip) return Response.json({ trip });
        return Response.json({ error: "ສ້າງເລກຖ້ຽວບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      } catch (e) {
        console.error("/api/admin/ship-trips", e);
        return Response.json({ error: "ສ້າງຖ້ຽວລົດບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ແກ້ໄຂຂໍ້ມູນຖ້ຽວ (ສະເພາະຖ້ຽວທີ່ຍັງ open)
    if (url.pathname === "/api/admin/ship-trips/update" && request.method === "POST") {
      try {
        const b = await request.json();
        const plate = tripClean(b.truck_plate, 30);
        if (!b.id) return Response.json({ error: "ບໍ່ພົບຖ້ຽວ" }, { status: 400 });
        const tripDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.trip_date || "")) ? String(b.trip_date) : null;
        const res = await env.DB.prepare(
          `UPDATE ship_trips SET truck_plate = ?, driver_name = ?, driver_phone = ?, trip_date = COALESCE(?, trip_date), note = ?
            WHERE id = ? AND status = 'open'`
        ).bind(plate, tripClean(b.driver_name, 100) || null, tripClean(b.driver_phone, 30) || null, tripDate,
          tripClean(b.note, 300) || null, b.id).run();
        if (!res.meta || !res.meta.changes) return Response.json({ error: "ແກ້ໄຂບໍ່ໄດ້ (ບໍ່ພົບຖ້ຽວ ຫຼື ລົດອອກແລ້ວ)" }, { status: 400 });
        return Response.json({ trip: await env.DB.prepare("SELECT * FROM ship_trips WHERE id = ?").bind(b.id).first() });
      } catch (e) {
        console.error("/api/admin/ship-trips/update", e);
        return Response.json({ error: "ແກ້ໄຂຖ້ຽວບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ແຜນຂອງຖ້ຽວ open ທີ່ສ້າງຈາກແຜນສົ່ງຕູ້ + ຈຳນວນທີ່ຂຶ້ນລົດແລ້ວ (loaded) ຕໍ່ແຖວແຜນ
    if (url.pathname === "/api/admin/ship-trip-plan" && request.method === "GET") {
      try {
        const sz = await loadShipSizes(env);
        const plans = await loadTripPlans(env, sz, null);
        const out = [];
        for (const items of plans.values()) for (const it of items) out.push(it);
        return Response.json(out);
      } catch (e) {
        console.error("/api/admin/ship-trip-plan", e);
        return Response.json([]);
      }
    }

    // ກວດກ່ອນເພີ່ມຕູ້ໃໝ່ເຂົ້າຖ້ຽວ (ໃຊ້ກ່ອນຢືນຢັນຕູ້) — ຖ້າຖ້ຽວມີແຜນ ຕູ້ຕ້ອງຕົງກັບແຜນ. body: { trip_id, cooler_id, province, warehouse }
    if (url.pathname === "/api/admin/ship-trips/plan-check" && request.method === "POST") {
      try {
        const b = await request.json();
        const trip = b.trip_id ? await env.DB.prepare("SELECT id, status FROM ship_trips WHERE id = ?").bind(b.trip_id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        const sz = await loadShipSizes(env);
        const items = (await loadTripPlans(env, sz, trip.id)).get(trip.id);
        if (!items) return Response.json({ ok: true, has_plan: false });
        const c = b.cooler_id ? await env.DB.prepare("SELECT cooler_brand, cooler_type, cooler_model FROM new_coolers WHERE id = ?").bind(b.cooler_id).first() : null;
        if (!c) return Response.json({ error: "ບໍ່ພົບຕູ້" }, { status: 400 });
        const chk = planCheckCooler(items, sz, tripClean(b.province, 100), tripClean(b.warehouse, 100), { brand: c.cooler_brand, type: c.cooler_type, model: c.cooler_model });
        if (chk.error) return Response.json({ error: chk.error }, { status: 409 });
        return Response.json({ ok: true, has_plan: true });
      } catch (e) {
        console.error("/api/admin/ship-trips/plan-check", e);
        return Response.json({ error: "ກວດແຜນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຕູ້ຈາກສາງທີ່ຢູ່ໃນຖ້ຽວຕ່າງໆ (ໃຊ້ສະແດງລາຍລະອຽດຖ້ຽວ + ພິມໃບສົ່ງ)
    if (url.pathname === "/api/admin/ship-trip-stock" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT l.id AS link_id, l.trip_id, l.stock_id, l.ship_province, l.ship_warehouse, l.ship_note, l.added_at, l.scanned_at, l.scanned_by,
                ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
                ws.status AS stock_status, w.name AS warehouse_name
           FROM ship_trip_stock l
           JOIN warehouse_stock ws ON ws.id = l.stock_id
           LEFT JOIN wh_warehouses w ON w.id = ws.warehouse_id
          ORDER BY l.id DESC LIMIT 5000`
      ).all();
      return Response.json(results || []);
    }

    // ເພີ່ມຕູ້ຈາກສາງ (status = in_warehouse) ເຂົ້າຖ້ຽວ: ສະຕັອກເປັນ 'reserved' + ບັນທຶກປະຫວັດ + ຜູກແຂວງປາຍທາງ
    // ແຕ່ລະຕູ້ໃຊ້ 3 ຄຳສັ່ງຕໍ່ເນື່ອງ (ແຕ່ລະຄຳສັ່ງເຮັດກໍຕໍ່ເມື່ອຄຳສັ່ງກ່ອນໜ້າປ່ຽນແຖວໄດ້ຈິງ) -> ຕູ້ທີ່ບໍ່ຢູ່ໃນສາງ ຫຼື ຢູ່ຖ້ຽວອື່ນແລ້ວ ຈະຖືກຂ້າມ
    if (url.pathname === "/api/admin/ship-trips/add-stock" && request.method === "POST") {
      try {
        const { trip_id, stock_ids, province, warehouse, note, confirm_loaded } = await request.json();
        const confirmLoaded = confirm_loaded === true || confirm_loaded === 1; // ສະແກນກ້ອງ + ຢືນຢັນ -> ເພີ່ມເຂົ້າຖ້ຽວ ແລະ ໝາຍຂຶ້ນລົດ (scanned) ພ້ອມກັນ
        const trip = trip_id ? await env.DB.prepare("SELECT id, trip_no, status FROM ship_trips WHERE id = ?").bind(trip_id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "open") return Response.json({ error: "ຖ້ຽວນີ້ລົດອອກແລ້ວ ເພີ່ມຕູ້ບໍ່ໄດ້" }, { status: 400 });
        const prov = tripClean(province, 100);
        if (!prov) return Response.json({ error: "ກະລຸນາປ້ອນແຂວງປາຍທາງ" }, { status: 400 });
        // ແຂວງທີ່ມີສາງສະເພາະແຂວງ ຕ້ອງເລືອກສາງ (ງົບຕັດຕໍ່ສາງ)
        const whChk = provWhResolve(await provWhMap(env), prov, warehouse, true);
        if (whChk.error) return Response.json({ error: whChk.error }, { status: 400 });
        const noteVal = tripClean(note, 300);
        let idList = [...new Set((Array.isArray(stock_ids) ? stock_ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!idList.length) return Response.json({ error: "ກະລຸນາເລືອກຕູ້ຈາກສາງ" }, { status: 400 });
        if (idList.length > 100) return Response.json({ error: "ເພີ່ມໄດ້ສູງສຸດ 100 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });
        const reqCount = idList.length;
        // ເພີ່ມເຂົ້າຖ້ຽວໄດ້ສະເພາະຕູ້ທີ່ມີສະຖານະ "ຢູ່ໃນສາງ" (in_warehouse) ເທົ່ານັ້ນ — ສະຖານະອື່ນ (ຈອງແລ້ວ/ອອກໄປຮ້ານ/Event/ສົ່ງຕ່າງແຂວງແລ້ວ/ສະສາງ...) ປະຕິເສດ ພ້ອມບອກສະຖານະຈິງ
        const stLabelAdd = { in_warehouse: "ຢູ່ໃນສາງ", reserved: "ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ", outlet: "ອອກໄປຮ້ານແລ້ວ", event: "ກຳລັງໃຊ້ງານ Event", shipped_out: "ສົ່ງຕ່າງແຂວງແລ້ວ", write_off: "ສະສາງ", pending_write_off: "ລໍຖ້າສະສາງ" };
        const { results: stChkRows } = await env.DB.prepare(
          `SELECT id, status, qr_code, serial_number, capex FROM warehouse_stock WHERE id IN (${idList.map(() => "?").join(",")})`
        ).bind(...idList).all();
        const stChkMap = new Map((stChkRows || []).map((r) => [r.id, r]));
        const statusSkipped = [];
        idList = idList.filter((sid) => {
          const r = stChkMap.get(sid);
          if (r && r.status === "in_warehouse") return true;
          const code = r ? (r.qr_code || r.serial_number || r.capex || ("#" + sid)) : ("#" + sid);
          statusSkipped.push(r ? `${code}: ສະຖານະ "${stLabelAdd[r.status] || r.status}"` : `${code}: ບໍ່ພົບໃນສາງ`);
          return false;
        });
        if (!idList.length) {
          return Response.json({ error: `ເພີ່ມເຂົ້າຖ້ຽວໄດ້ສະເພາະຕູ້ທີ່ "ຢູ່ໃນສາງ" ເທົ່ານັ້ນ — ${statusSkipped.slice(0, 3).join(" | ")}`, added: 0, failed: reqCount }, { status: 409 });
        }
        const histNote = `ເພີ່ມເຂົ້າຖ້ຽວ ${trip.trip_no} (ສົ່ງຕ່າງແຂວງ → ${prov}${whChk.wh ? " / " + whChk.wh : ""})`;
        // ຖ້ຽວທີ່ສ້າງຈາກແຜນ: ຮັບສະເພາະຕູ້ທີ່ຕົງກັບແຜນ (ແຂວງ/ສາງ + ຊະນິດຕູ້) ແລະ ຍັງບໍ່ເກີນຈຳນວນ
        const planSz = await loadShipSizes(env);
        const planItems = (await loadTripPlans(env, planSz, trip.id)).get(trip.id) || null;
        const planSkipped = [];
        let allowed = idList;
        if (planItems) {
          const { results: wsRows } = await env.DB.prepare(
            `SELECT id, cooler_brand, cooler_type, cooler_model FROM warehouse_stock WHERE id IN (${idList.map(() => "?").join(",")}) AND status = 'in_warehouse'`
          ).bind(...idList).all();
          const wsMap = new Map((wsRows || []).map((r) => [r.id, r]));
          allowed = [];
          for (const sid of idList) {
            const ws = wsMap.get(sid);
            if (!ws) continue; // ບໍ່ຢູ່ໃນສາງແລ້ວ -> ນັບເປັນ failed ຕາມປົກກະຕິ
            const pc = planCheckCooler(planItems, planSz, prov, whChk.wh || "", { brand: ws.cooler_brand, type: ws.cooler_type, model: ws.cooler_model });
            if (pc.error) { planSkipped.push(pc.error); continue; }
            pc.slot.loaded++;
            allowed.push(sid);
          }
          if (!allowed.length && planSkipped.length) {
            return Response.json({ error: "ບໍ່ຢູ່ໃນແຜນຂອງຖ້ຽວນີ້ — " + [...new Set(planSkipped)].slice(0, 3).join(" | ") }, { status: 409 });
          }
        }
        let added = 0;
        for (let i = 0; i < allowed.length; i += 30) {
          const chunk = allowed.slice(i, i + 30);
          const stmts = [];
          for (const sid of chunk) {
            stmts.push(
              env.DB.prepare(
                `UPDATE warehouse_stock SET status = 'reserved', updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?1 AND status = 'in_warehouse' AND NOT EXISTS (SELECT 1 FROM ship_trip_stock WHERE stock_id = ?1)`
              ).bind(sid),
              confirmLoaded
                ? env.DB.prepare(
                  `INSERT INTO ship_trip_stock (trip_id, stock_id, ship_province, ship_warehouse, ship_note, added_by, scanned_at, scanned_by)
                   SELECT ?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP, ?6 WHERE (SELECT changes()) > 0`
                ).bind(trip.id, sid, prov, whChk.wh || null, noteVal || null, tripActor)
                : env.DB.prepare(
                  `INSERT INTO ship_trip_stock (trip_id, stock_id, ship_province, ship_warehouse, ship_note, added_by)
                   SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT changes()) > 0`
                ).bind(trip.id, sid, prov, whChk.wh || null, noteVal || null, tripActor),
              env.DB.prepare(
                `INSERT INTO warehouse_stock_history (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
                 SELECT ws.id, ws.warehouse_id, NULL, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
                        'in_warehouse', 'reserved', ?1, ?2
                   FROM warehouse_stock ws WHERE ws.id = ?3 AND (SELECT changes()) > 0`
              ).bind(tripActor, histNote, sid)
            );
          }
          const results = await env.DB.batch(stmts);
          for (let j = 0; j < chunk.length; j++) {
            const r = results[j * 3 + 1];
            if (r && r.meta && r.meta.changes) added++;
          }
        }
        const stockResp = { added, failed: reqCount - added };
        const skipAll = [...statusSkipped, ...new Set(planSkipped)];
        if (skipAll.length) stockResp.error_detail = skipAll.slice(0, 3).join(" | ");
        return Response.json(stockResp);
      } catch (e) {
        console.error("/api/admin/ship-trips/add-stock", e);
        return Response.json({ error: "ເພີ່ມຕູ້ຈາກສາງເຂົ້າຖ້ຽວບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ເອົາຕູ້ຈາກສາງອອກຈາກຖ້ຽວ (ສະເພາະຖ້ຽວ open) — ສະຕັອກກັບເປັນ 'in_warehouse'
    if (url.pathname === "/api/admin/ship-trips/remove-stock" && request.method === "POST") {
      try {
        const { link_id } = await request.json();
        if (!link_id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const results = await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO warehouse_stock_history (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
             SELECT ws.id, ws.warehouse_id, NULL, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
                    'reserved', 'in_warehouse', ?1, 'ເອົາອອກຈາກຖ້ຽວ ' || t.trip_no
               FROM ship_trip_stock l JOIN ship_trips t ON t.id = l.trip_id JOIN warehouse_stock ws ON ws.id = l.stock_id
              WHERE l.id = ?2 AND t.status = 'open' AND ws.status = 'reserved'`
          ).bind(tripActor, link_id),
          env.DB.prepare(
            `UPDATE warehouse_stock SET status = 'in_warehouse', updated_at = CURRENT_TIMESTAMP
              WHERE status = 'reserved' AND id IN (SELECT l.stock_id FROM ship_trip_stock l JOIN ship_trips t ON t.id = l.trip_id WHERE l.id = ?1 AND t.status = 'open')`
          ).bind(link_id),
          env.DB.prepare(
            "DELETE FROM ship_trip_stock WHERE id = ?1 AND trip_id IN (SELECT id FROM ship_trips WHERE status = 'open')"
          ).bind(link_id)
        ]);
        const del = results[2];
        if (!del || !del.meta || !del.meta.changes) return Response.json({ error: "ເອົາອອກບໍ່ໄດ້ (ບໍ່ຢູ່ໃນຖ້ຽວ ຫຼື ລົດອອກແລ້ວ)" }, { status: 400 });
        return Response.json({ message: "ເອົາຕູ້ອອກຈາກຖ້ຽວແລ້ວ (ກັບເປັນ ຢູ່ໃນສາງ)" });
      } catch (e) {
        console.error("/api/admin/ship-trips/remove-stock", e);
        return Response.json({ error: "ເອົາຕູ້ອອກຈາກຖ້ຽວບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ເພີ່ມຕູ້ (ຫຼາຍແຂວງພ້ອມກັນໄດ້) ເຂົ້າຖ້ຽວ — ສະເພາະຕູ້ \"ລໍຖ້າຢືນຢັນສົ່ງອອກ\" ທີ່ຍັງບໍ່ຢູ່ຖ້ຽວອື່ນ ແລະ ມີແຂວງປາຍທາງ
    if (url.pathname === "/api/admin/ship-trips/add-coolers" && request.method === "POST") {
      try {
        const { trip_id, ids, province, warehouse, override_province } = await request.json();
        const overrideProv = override_province ? 1 : 0;
        const trip = trip_id ? await env.DB.prepare("SELECT id, status FROM ship_trips WHERE id = ?").bind(trip_id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "open") return Response.json({ error: "ຖ້ຽວນີ້ລົດອອກແລ້ວ ເພີ່ມຕູ້ບໍ່ໄດ້" }, { status: 400 });
        const idList = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!idList.length) return Response.json({ error: "ກະລຸນາເລືອກຕູ້ທີ່ຈະເພີ່ມເຂົ້າຖ້ຽວ" }, { status: 400 });
        if (idList.length > 100) return Response.json({ error: "ເພີ່ມໄດ້ສູງສຸດ 100 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });
        const prov = tripClean(province, 100);
        const whIn = tripClean(warehouse, 100);
        // ແຂວງ: ໃຊ້ແຂວງທີ່ບັນທຶກໄວ້ໃນຕູ້; ຖ້າຕູ້ບໍ່ມີແຂວງ ໃຊ້ແຂວງທີ່ປ້ອນມາ; ຖ້າບໍ່ມີທັງສອງ -> ບໍ່ເພີ່ມ
        // ສາງສະເພາະແຂວງ: ຕາມແຂວງທີ່ໃຊ້ຈິງຂອງແຕ່ລະຕູ້ — ແຂວງທີ່ມີສາງ ຕ້ອງມີສາງ (ຈາກຕູ້ ຫຼື ທີ່ເລືອກມາ) ບໍ່ດັ່ງນັ້ນຂ້າມຕູ້ນັ້ນ
        const whMap = await provWhMap(env);
        const { results: curRows } = await env.DB.prepare(
          `SELECT id, ship_province, ship_warehouse, cooler_brand, cooler_type, cooler_model FROM new_coolers WHERE id IN (${idList.map(() => "?").join(",")}) AND status = 'confirmed' AND ship_requested = 1 AND trip_id IS NULL`
        ).bind(...idList).all();
        const curMap = new Map((curRows || []).map((r) => [r.id, r]));
        // ຖ້ຽວທີ່ສ້າງຈາກແຜນ: ຮັບສະເພາະຕູ້ທີ່ຕົງກັບແຜນ (ແຂວງ/ສາງ + ຊະນິດຕູ້) ແລະ ຍັງບໍ່ເກີນຈຳນວນ
        const planSz = await loadShipSizes(env);
        const planItems = (await loadTripPlans(env, planSz, trip.id)).get(trip.id) || null;
        const skipped = [];
        const stmts = [];
        for (const rid of idList) {
          const cur = curMap.get(rid);
          if (!cur) continue;
          const savedProv = String(cur.ship_province || "").trim();
          const savedWh = String(cur.ship_warehouse || "").trim();
          const effProv = (overrideProv && prov) ? prov : (savedProv || prov);
          if (!effProv) continue;
          // ສາງ: ຖ້າໃຊ້ແຂວງເດີມຂອງຕູ້ ແລະ ຕູ້ມີສາງແລ້ວ -> ໃຊ້ສາງຂອງຕູ້ (ເວັ້ນແຕ່ override); ນອກນັ້ນໃຊ້ສາງທີ່ເລືອກມາ
          const keepSaved = effProv === savedProv && savedWh && !(overrideProv && prov);
          const whChk = provWhResolve(whMap, effProv, keepSaved ? savedWh : whIn, true);
          if (whChk.error) { skipped.push(whChk.error); continue; }
          if (planItems) {
            const pc = planCheckCooler(planItems, planSz, effProv, whChk.wh || "", { brand: cur.cooler_brand, type: cur.cooler_type, model: cur.cooler_model });
            if (pc.error) { skipped.push(pc.error); continue; }
            pc.slot.loaded++; // ຈອງບ່ອນໃນແຜນ ສຳລັບຕູ້ຖັດໄປໃນຄຳຂໍດຽວກັນ
          }
          stmts.push(env.DB.prepare(
            `UPDATE new_coolers SET trip_id = ?1, ship_province = ?2, ship_warehouse = ?3
              WHERE id = ?4 AND status = 'confirmed' AND ship_requested = 1 AND trip_id IS NULL`
          ).bind(trip.id, effProv, whChk.wh || null, rid));
        }
        const results = stmts.length ? await env.DB.batch(stmts) : [];
        const added = results.filter((r) => r.meta && r.meta.changes).length;
        const resp = { added, failed: idList.length - added };
        if (skipped.length) resp.error_detail = [...new Set(skipped)].slice(0, 3).join(" | ");
        if (planItems && !added && skipped.length) return Response.json({ error: "ບໍ່ຢູ່ໃນແຜນຂອງຖ້ຽວນີ້ — " + resp.error_detail, added: 0, failed: resp.failed }, { status: 409 });
        return Response.json(resp);
      } catch (e) {
        console.error("/api/admin/ship-trips/add-coolers", e);
        return Response.json({ error: "ເພີ່ມຕູ້ເຂົ້າຖ້ຽວບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ເອົາຕູ້ອອກຈາກຖ້ຽວ (ສະເພາະຖ້ຽວທີ່ຍັງ open) — ຕູ້ກັບເປັນ \"ລໍຖ້າຢືນຢັນສົ່ງອອກ\"
    if (url.pathname === "/api/admin/ship-trips/remove-cooler" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const res = await env.DB.prepare(
          `UPDATE new_coolers SET trip_id = NULL, trip_scanned_at = NULL, trip_scanned_by = NULL
            WHERE id = ? AND status = 'confirmed' AND trip_id IN (SELECT id FROM ship_trips WHERE status = 'open')`
        ).bind(id).run();
        if (!res.meta || !res.meta.changes) return Response.json({ error: "ເອົາອອກບໍ່ໄດ້ (ບໍ່ຢູ່ໃນຖ້ຽວ ຫຼື ລົດອອກແລ້ວ)" }, { status: 400 });
        return Response.json({ message: "ເອົາຕູ້ອອກຈາກຖ້ຽວແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/ship-trips/remove-cooler", e);
        return Response.json({ error: "ເອົາຕູ້ອອກຈາກຖ້ຽວບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===== ສະແກນຢືນຢັນວ່າມີຕູ້ຂຶ້ນລົດ (ຖ້ຽວ open ເທົ່ານັ້ນ) =====
    // body: { trip_id, code }  ຫຼື  { trip_id, kind: 'new'|'stock', id }  (ໝາຍດ້ວຍມື — id = new_coolers.id ຫຼື ship_trip_stock.id)
    // ຜົນ: outcome = ok | already_scanned | not_in_trip (HTTP 200) — ຄ່າອື່ນເປັນ error
    const tripLoadItems = async (tripId) => {
      const a = await env.DB.prepare(
        `SELECT id, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, ship_province, ship_warehouse, trip_scanned_at AS scanned_at
           FROM new_coolers WHERE trip_id = ?`
      ).bind(tripId).all();
      const b = await env.DB.prepare(
        `SELECT l.id AS id, ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex, l.ship_province, l.ship_warehouse, l.scanned_at AS scanned_at
           FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id WHERE l.trip_id = ?`
      ).bind(tripId).all();
      return [
        ...((a.results || []).map((x) => ({ ...x, kind: "new" }))),
        ...((b.results || []).map((x) => ({ ...x, kind: "stock" })))
      ];
    };
    const tripItemBrief = (it) => ({
      cooler_brand: it.cooler_brand, cooler_type: it.cooler_type, cooler_model: it.cooler_model,
      qr_code: it.qr_code, serial_number: it.serial_number, capex: it.capex, ship_province: it.ship_province, ship_warehouse: it.ship_warehouse
    });

    if (url.pathname === "/api/admin/ship-trips/scan" && request.method === "POST") {
      try {
        const b = await request.json();
        const trip = b.trip_id ? await env.DB.prepare("SELECT id, trip_no, status FROM ship_trips WHERE id = ?").bind(b.trip_id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "open") return Response.json({ error: "ຖ້ຽວນີ້ລົດອອກແລ້ວ ສະແກນບໍ່ໄດ້" }, { status: 400 });
        const items = await tripLoadItems(trip.id);
        const norm = (v) => String(v == null ? "" : v).trim().toUpperCase();
        const codesOf = (it) => [it.qr_code, it.serial_number, it.capex].map(norm).filter(Boolean);
        const direct = !!(b.kind && b.id);
        let hit = null;
        if (direct) {
          hit = items.find((it) => it.kind === b.kind && Number(it.id) === Number(b.id)) || null;
          if (!hit) return Response.json({ error: "ບໍ່ພົບຕູ້ນີ້ໃນຖ້ຽວ" }, { status: 400 });
        } else {
          const raw = String(b.code || "").trim();
          if (!raw) return Response.json({ error: "ກະລຸນາປ້ອນ QR, Serial ຫຼື CapEx" }, { status: 400 });
          const q = norm(raw);
          hit = items.find((it) => codesOf(it).includes(q)) || null;
          if (!hit) {
            // QR ອາດເປັນ URL / ຂໍ້ຄວາມຍາວ: ແຍກເປັນຄຳ ແລ້ວລອງທຽບທີລະຄຳ (ຄືກັບການຢືນຢັນຕູ້ໃໝ່)
            const tokens = raw.split(/[\s,;|/?&=#:]+/).map(norm).filter((t) => t.length >= 3).slice(0, 8);
            if (tokens.length > 1) {
              for (const t of tokens) {
                hit = items.find((it) => codesOf(it).includes(t)) || null;
                if (hit) break;
              }
            }
          }
        }
        let total = items.length;
        let scannedNow = items.filter((it) => it.scanned_at).length;

        // ຖ້ຽວທີ່ສ້າງຈາກແຜນ: ສະແກນຕູ້ທີ່ຍັງບໍ່ຢູ່ໃນຖ້ຽວ -> ຖ້າຕົງກັບແຜນ (ແຂວງ/ສາງ + ຊະນິດຕູ້ ແລະ ຍັງບໍ່ເກີນຈຳນວນ) ເພີ່ມເຂົ້າຖ້ຽວ + ໝາຍສະແກນໃຫ້ເລີຍ; ບໍ່ຕົງ -> ປະຕິເສດ
        let planNote = null; // ເຫດຜົນທີ່ບໍ່ຢູ່ໃນແຜນ (ຖ້າມີ)
        if (!hit && !direct) {
          const planSz = await loadShipSizes(env);
          const planItems = (await loadTripPlans(env, planSz, trip.id)).get(trip.id) || null;
          if (planItems) {
            const raw = String(b.code || "").trim();
            // (ກ) ຕູ້ໃໝ່ (new_coolers) ທີ່ຢືນຢັນ + ໝາຍສົ່ງຕ່າງແຂວງແລ້ວ ແຕ່ຍັງບໍ່ຢູ່ຖ້ຽວໃດ
            const nc = await findNewCoolerByCode(env, raw);
            if (nc && nc.status === "confirmed" && Number(nc.ship_requested) === 1 && !nc.trip_id && String(nc.ship_province || "").trim()) {
              const prov = String(nc.ship_province).trim();
              const whChk = provWhResolve(await provWhMap(env), prov, String(nc.ship_warehouse || "").trim(), true);
              const pc = whChk.error ? { error: whChk.error } : planCheckCooler(planItems, planSz, prov, whChk.wh || "", { brand: nc.cooler_brand, type: nc.cooler_type, model: nc.cooler_model });
              if (pc.error) {
                planNote = pc.error;
              } else {
                const up = await env.DB.prepare(
                  `UPDATE new_coolers SET trip_id = ?1, ship_warehouse = ?2, trip_scanned_at = CURRENT_TIMESTAMP, trip_scanned_by = ?3
                    WHERE id = ?4 AND status = 'confirmed' AND ship_requested = 1 AND trip_id IS NULL`
                ).bind(trip.id, whChk.wh || null, tripActor, nc.id).run();
                if (up.meta && up.meta.changes) {
                  const scannedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
                  return Response.json({
                    outcome: "ok", message: "ເພີ່ມເຂົ້າຖ້ຽວ + ສະແກນຢືນຢັນແລ້ວ", auto_added: true, kind: "new", id: nc.id, scanned_at: scannedAt,
                    scanned_count: scannedNow + 1, total: total + 1,
                    item: tripItemBrief({ ...nc, ship_province: prov, ship_warehouse: whChk.wh || null })
                  });
                }
                planNote = "ຕູ້ນີ້ຖືກເພີ່ມເຂົ້າຖ້ຽວອື່ນໄປແລ້ວ";
              }
            } else if (!nc) {
              // (ຂ) ຕູ້ຈາກສາງ (warehouse_stock) ທີ່ຢູ່ໃນສາງ ແລະ ຍັງບໍ່ຢູ່ຖ້ຽວໃດ — ແຂວງປາຍທາງເອົາຈາກແຖວແຜນທີ່ຍັງເຫຼືອ
              const stRow = await env.DB.prepare(
                `SELECT ws.id, ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex
                   FROM warehouse_stock ws
                  WHERE ws.status = 'in_warehouse' AND NOT EXISTS (SELECT 1 FROM ship_trip_stock WHERE stock_id = ws.id)
                    AND ((ws.qr_code COLLATE NOCASE = ?1 AND ws.qr_code != '')
                      OR (ws.serial_number COLLATE NOCASE = ?1 AND ws.serial_number != '')
                      OR (ws.capex COLLATE NOCASE = ?1 AND ws.capex != ''))
                  LIMIT 1`
              ).bind(raw).first();
              if (stRow) {
                const sid = planSz.sizeOf(stRow.cooler_model, stRow.cooler_type);
                const label = [stRow.cooler_brand, stRow.cooler_type, stRow.cooler_model].filter(Boolean).join(" / ") || "ຕູ້";
                const slot = sid ? planItems.find((it) => Number(it.size_id) === Number(sid) && it.loaded < it.qty) : null;
                if (!slot) {
                  planNote = sid
                    ? (planItems.some((it) => Number(it.size_id) === Number(sid))
                      ? `${label}: ແຜນຂອງຊະນິດຕູ້ນີ້ (${planSz.sizeLabel[sid] || ""}) ຄົບຈຳນວນແລ້ວ`
                      : `${label} (${planSz.sizeLabel[sid] || "ຊະນິດຕູ້"}) ບໍ່ຢູ່ໃນແຜນຂອງຖ້ຽວນີ້`)
                    : `${label}: ບໍ່ຮູ້ຊະນິດຕູ້ (Type/Model) ຈຶ່ງບໍ່ຢູ່ໃນແຜນຂອງຖ້ຽວນີ້`;
                } else if (!slot.warehouse && (provWhResolve(await provWhMap(env), slot.province, "", true)).error) {
                  planNote = `ແຂວງ ${slot.province} ມີສາງສະເພາະແຂວງ ແຕ່ແຜນຍັງບໍ່ໄດ້ລະບຸສາງ — ໃຊ້ປຸ່ມ "ເພີ່ມຕູ້ຈາກສາງ" ແລ້ວເລືອກສາງປາຍທາງ`;
                } else {
                  const histNote = `ເພີ່ມເຂົ້າຖ້ຽວ ${trip.trip_no} (ສົ່ງຕ່າງແຂວງ → ${slot.province}${slot.warehouse ? " / " + slot.warehouse : ""})`;
                  const rs = await env.DB.batch([
                    env.DB.prepare(
                      `UPDATE warehouse_stock SET status = 'reserved', updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?1 AND status = 'in_warehouse' AND NOT EXISTS (SELECT 1 FROM ship_trip_stock WHERE stock_id = ?1)`
                    ).bind(stRow.id),
                    env.DB.prepare(
                      `INSERT INTO ship_trip_stock (trip_id, stock_id, ship_province, ship_warehouse, ship_note, added_by, scanned_at, scanned_by)
                       SELECT ?1, ?2, ?3, ?4, NULL, ?5, CURRENT_TIMESTAMP, ?5 WHERE (SELECT changes()) > 0`
                    ).bind(trip.id, stRow.id, slot.province, slot.warehouse || null, tripActor),
                    env.DB.prepare(
                      `INSERT INTO warehouse_stock_history (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
                       SELECT ws.id, ws.warehouse_id, NULL, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
                              'in_warehouse', 'reserved', ?1, ?2
                         FROM warehouse_stock ws WHERE ws.id = ?3 AND (SELECT changes()) > 0`
                    ).bind(tripActor, histNote, stRow.id)
                  ]);
                  if (rs[1] && rs[1].meta && rs[1].meta.changes) {
                    const link = await env.DB.prepare("SELECT id FROM ship_trip_stock WHERE stock_id = ?").bind(stRow.id).first();
                    const scannedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
                    return Response.json({
                      outcome: "ok", message: "ເພີ່ມເຂົ້າຖ້ຽວ + ສະແກນຢືນຢັນແລ້ວ", auto_added: true, kind: "stock", id: link ? link.id : null, scanned_at: scannedAt,
                      scanned_count: scannedNow + 1, total: total + 1,
                      item: tripItemBrief({ ...stRow, ship_province: slot.province, ship_warehouse: slot.warehouse || null })
                    });
                  }
                  planNote = "ຕູ້ນີ້ບໍ່ຢູ່ໃນສາງແລ້ວ ຫຼືຖືກເພີ່ມເຂົ້າຖ້ຽວອື່ນໄປແລ້ວ";
                }
              }
            }
            if (planNote) {
              return Response.json({ outcome: "not_in_plan", message: planNote, scanned_count: scannedNow, total });
            }
          }
        }
        if (!hit) {
          // ບໍ່ຢູ່ໃນຖ້ຽວນີ້ — ບອກໃຫ້ຮູ້ວ່າຕູ້ນີ້ຢູ່ບ່ອນອື່ນ ຫຼື ບໍ່ມີໃນລະບົບ
          let hint = "ບໍ່ພົບຕູ້ນີ້ໃນຖ້ຽວນີ້ ແລະ ບໍ່ມີໃນລະບົບ";
          const other = await findNewCoolerByCode(env, b.code);
          if (other) {
            if (other.trip_id) {
              const ot = await env.DB.prepare("SELECT trip_no FROM ship_trips WHERE id = ?").bind(other.trip_id).first();
              hint = `ຕູ້ນີ້ຢູ່ໃນຖ້ຽວ ${ot ? ot.trip_no : "ອື່ນ"} (ບໍ່ແມ່ນຖ້ຽວນີ້)`;
            } else {
              hint = "ຕູ້ນີ້ມີໃນລະບົບ ແຕ່ຍັງບໍ່ໄດ້ເພີ່ມເຂົ້າຖ້ຽວນີ້";
            }
          } else {
            const q = String(b.code || "").trim();
            const st = await env.DB.prepare(
              `SELECT ws.status AS status, t.trip_no AS trip_no
                 FROM warehouse_stock ws
                 LEFT JOIN ship_trip_stock l ON l.stock_id = ws.id
                 LEFT JOIN ship_trips t ON t.id = l.trip_id
                WHERE (ws.qr_code COLLATE NOCASE = ?1 AND ws.qr_code != '')
                   OR (ws.serial_number COLLATE NOCASE = ?1 AND ws.serial_number != '')
                   OR (ws.capex COLLATE NOCASE = ?1 AND ws.capex != '')
                LIMIT 1`
            ).bind(q).first();
            if (st) {
              const stLabelScan = { in_warehouse: "ຢູ່ໃນສາງ", reserved: "ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ", outlet: "ອອກໄປຮ້ານແລ້ວ", event: "ກຳລັງໃຊ້ງານ Event", shipped_out: "ສົ່ງຕ່າງແຂວງແລ້ວ", write_off: "ສະສາງ", pending_write_off: "ລໍຖ້າສະສາງ" };
              hint = st.trip_no
                ? `ຕູ້ນີ້ຢູ່ໃນຖ້ຽວ ${st.trip_no} (ບໍ່ແມ່ນຖ້ຽວນີ້)`
                : (st.status === "in_warehouse" ? "ຕູ້ນີ້ຢູ່ໃນສາງ ແຕ່ຍັງບໍ່ໄດ້ເພີ່ມເຂົ້າຖ້ຽວນີ້" : `ຕູ້ນີ້ມີສະຖານະ "${stLabelScan[st.status] || st.status}" — ເພີ່ມເຂົ້າຖ້ຽວໄດ້ສະເພາະຕູ້ທີ່ "ຢູ່ໃນສາງ" ເທົ່ານັ້ນ`);
            }
          }
          return Response.json({ outcome: "not_in_trip", message: hint, scanned_count: scannedNow, total });
        }
        if (hit.scanned_at) {
          return Response.json({ outcome: "already_scanned", message: "ຕູ້ນີ້ສະແກນຢືນຢັນໄປແລ້ວ", kind: hit.kind, id: hit.id, scanned_at: hit.scanned_at, scanned_count: scannedNow, total, item: tripItemBrief(hit) });
        }
        if (hit.kind === "new") {
          await env.DB.prepare(
            "UPDATE new_coolers SET trip_scanned_at = CURRENT_TIMESTAMP, trip_scanned_by = ?1 WHERE id = ?2 AND trip_id = ?3"
          ).bind(tripActor, hit.id, trip.id).run();
        } else {
          await env.DB.prepare(
            "UPDATE ship_trip_stock SET scanned_at = CURRENT_TIMESTAMP, scanned_by = ?1 WHERE id = ?2 AND trip_id = ?3"
          ).bind(tripActor, hit.id, trip.id).run();
        }
        const scannedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
        return Response.json({ outcome: "ok", message: "ສະແກນຢືນຢັນແລ້ວ", kind: hit.kind, id: hit.id, scanned_at: scannedAt, scanned_count: scannedNow + 1, total, item: tripItemBrief(hit) });
      } catch (e) {
        console.error("/api/admin/ship-trips/scan", e);
        return Response.json({ error: "ສະແກນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ຍົກເລີກການສະແກນຂອງຕູ້ 1 ໜ່ວຍ (ກົດຜິດ)  body: { trip_id, kind, id }
    if (url.pathname === "/api/admin/ship-trips/unscan" && request.method === "POST") {
      try {
        const b = await request.json();
        const trip = b.trip_id ? await env.DB.prepare("SELECT id, status FROM ship_trips WHERE id = ?").bind(b.trip_id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "open") return Response.json({ error: "ຖ້ຽວນີ້ລົດອອກແລ້ວ ແກ້ໄຂບໍ່ໄດ້" }, { status: 400 });
        if (b.kind === "new") {
          await env.DB.prepare("UPDATE new_coolers SET trip_scanned_at = NULL, trip_scanned_by = NULL WHERE id = ?1 AND trip_id = ?2").bind(b.id, trip.id).run();
        } else if (b.kind === "stock") {
          await env.DB.prepare("UPDATE ship_trip_stock SET scanned_at = NULL, scanned_by = NULL WHERE id = ?1 AND trip_id = ?2").bind(b.id, trip.id).run();
        } else {
          return Response.json({ error: "ຂໍ້ມູນບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        }
        return Response.json({ message: "ຍົກເລີກການສະແກນແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/ship-trips/unscan", e);
        return Response.json({ error: "ຍົກເລີກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ເຊັນຊື່ກ່ອນລົດອອກ (ສະເພາະຖ້ຽວທີ່ຍັງ open): ຜູ້ຈັດສົ່ງ + ຄົນຂັບລົດ ຕ້ອງມີ, ຜູ້ອະນຸມັດບໍ່ບັງຄັບ
    // body: { id, sig_sender?, sig_driver?, sig_approver? } (PNG data URL) — ສົ່ງສະເພາະຊ່ອງທີ່ເຊັນໃໝ່ (ແທນທີ່ຂອງເກົ່າ), ຊ່ອງທີ່ບໍ່ສົ່ງຈະຄົງຄ່າເດີມ
    if (url.pathname === "/api/admin/ship-trips/sign" && request.method === "POST") {
      try {
        const { id, sig_sender, sig_driver, sig_approver } = await request.json();
        const trip = id ? await env.DB.prepare("SELECT id, status, sig_sender, sig_driver, sig_approver FROM ship_trips WHERE id = ?").bind(id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "open") return Response.json({ error: "ຖ້ຽວນີ້ລົດອອກແລ້ວ ເຊັນບໍ່ໄດ້ (ເປີດຖ້ຽວຄືນກ່ອນ)" }, { status: 400 });
        if (!sig_sender && !trip.sig_sender) return Response.json({ error: "ກະລຸນາໃຫ້ ຜູ້ຈັດສົ່ງ/ຜູ້ກວດນັບຕູ້ ເຊັນ" }, { status: 400 });
        if (!sig_driver && !trip.sig_driver) return Response.json({ error: "ກະລຸນາໃຫ້ ຄົນຂັບລົດ ເຊັນ" }, { status: 400 });
        const slots = [["sender", sig_sender], ["driver", sig_driver], ["approver", sig_approver]].filter(([, d]) => !!d);
        if (!slots.length) return Response.json({ error: "ບໍ່ມີລາຍເຊັນໃໝ່" }, { status: 400 });
        const stamp = Date.now();
        let keys;
        try {
          keys = await savePhotosToR2(env, slots.map(([n, d]) => [d, `trip/${trip.id}/sig-${n}-${stamp}.png`]));
        } catch (photoErr) {
          console.error("/api/admin/ship-trips/sign", photoErr);
          const pr = photoErrorResponse(photoErr);
          if (pr) return pr;
          throw photoErr;
        }
        const sets = slots.map(([n]) => `sig_${n} = ?`).join(", ");
        try {
          await env.DB.prepare(`UPDATE ship_trips SET ${sets} WHERE id = ? AND status = 'open'`).bind(...keys, trip.id).run();
        } catch (dbErr) {
          console.error("/api/admin/ship-trips/sign", dbErr);
          await deleteR2Photos(env, keys);
          throw dbErr;
        }
        await deleteR2Photos(env, slots.map(([n]) => trip[`sig_${n}`])); // ລຶບລາຍເຊັນເກົ່າທີ່ຖືກແທນທີ່
        return Response.json({ message: "ບັນທຶກລາຍເຊັນແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/ship-trips/sign", e);
        return Response.json({ error: "ບັນທຶກລາຍເຊັນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===================== ລິ້ງເຊັນຮັບຕູ້ປາຍທາງ (admin) =====================
    if (url.pathname === "/api/admin/ship-trip-receipts" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT id, trip_id, province, warehouse, status, expected_count, expires_at, created_at, receiver_name, receiver_phone,
                received_count, note, sig_receiver, recv_photos, signed_at,
                CASE WHEN status = 'pending' AND expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired
           FROM ship_trip_receipts ORDER BY id DESC LIMIT 3000`
      ).all();
      return Response.json(results || []);
    }

    // ສ້າງລິ້ງ ຂອງຖ້ຽວ + ແຂວງ (ສະເພາະຖ້ຽວທີ່ລົດອອກແລ້ວ). ເຊັນແລ້ວ -> ຕ້ອງ reset ກ່ອນ. ມີລິ້ງເດີມທີ່ຍັງໃຊ້ໄດ້ -> ຄືນລິ້ງເດີມ; regenerate = true -> ອອກລິ້ງໃໝ່ (ລິ້ງເກົ່າໃຊ້ບໍ່ໄດ້)
    if (url.pathname === "/api/admin/ship-trip-receipts/create" && request.method === "POST") {
      try {
        const b = await request.json();
        const province = String(b.province || "").trim();
        const warehouse = String(b.warehouse || "").trim().slice(0, 100);
        const trip = b.trip_id ? await env.DB.prepare("SELECT id, status FROM ship_trips WHERE id = ?").bind(b.trip_id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "departed") return Response.json({ error: "ສ້າງລິ້ງໄດ້ສະເພາະຖ້ຽວທີ່ລົດອອກແລ້ວ" }, { status: 400 });
        if (!province) return Response.json({ error: "ກະລຸນາລະບຸແຂວງ" }, { status: 400 });
        const items = await receiptItems(env, trip.id, province, warehouse);
        if (!items.length) return Response.json({ error: "ຖ້ຽວນີ້ບໍ່ມີຕູ້ໄປແຂວງ/ສາງນີ້" }, { status: 400 });
        const existing = await env.DB.prepare("SELECT id, status FROM ship_trip_receipts WHERE trip_id = ? AND province = ? AND warehouse = ?").bind(trip.id, province, warehouse).first();
        if (existing && existing.status === "signed") {
          return Response.json({ error: "ແຂວງ/ສາງນີ້ເຊັນຮັບແລ້ວ (ຖ້າຕ້ອງການໃຫ້ເຊັນໃໝ່ ກົດ ລ້າງ ກ່ອນ)" }, { status: 400 });
        }
        const actor = (session && session.email) || "admin";
        const scope = `receipt:${trip.id}|${province}|${warehouse}`;
        let token = null, reused = false;
        // ມີລິ້ງເດີມທີ່ຍັງໃຊ້ໄດ້ -> ໃຊ້ລິ້ງເດີມ (ອັບເດດສະເພາະຈຳນວນຕູ້ທີ່ຄາດໄວ້) ເວັ້ນແຕ່ກົດ "ສ້າງລິ້ງໃໝ່" (regenerate = true)
        if (existing && b.regenerate !== true) {
          const ex = await env.DB.prepare(
            "SELECT token_hash, nonce, (status = 'pending' AND expires_at > CURRENT_TIMESTAMP) AS live FROM ship_trip_receipts WHERE id = ?"
          ).bind(existing.id).first();
          if (ex && ex.live && ex.nonce) {
            const t = await linkHmacToken(env, scope, ex.nonce);
            if ((await sha256Hex(t)) === ex.token_hash) {
              token = t; reused = true;
              await env.DB.prepare("UPDATE ship_trip_receipts SET expected_count = ? WHERE id = ? AND status = 'pending'").bind(items.length, existing.id).run();
            }
          }
        }
        if (!token) {
          const nonce = newLinkNonce();
          token = await linkHmacToken(env, scope, nonce);
          const hash = await sha256Hex(token);
          if (existing) {
            await env.DB.prepare(
              "UPDATE ship_trip_receipts SET token_hash = ?, nonce = ?, expected_count = ?, expires_at = datetime('now','+7 day'), created_by = ?, created_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
            ).bind(hash, nonce, items.length, actor, existing.id).run();
          } else {
            await env.DB.prepare(
              "INSERT INTO ship_trip_receipts (trip_id, province, warehouse, token_hash, nonce, expected_count, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, datetime('now','+7 day'), ?)"
            ).bind(trip.id, province, warehouse, hash, nonce, items.length, actor).run();
          }
        }
        const row = await env.DB.prepare("SELECT id, expires_at FROM ship_trip_receipts WHERE trip_id = ? AND province = ? AND warehouse = ?").bind(trip.id, province, warehouse).first();
        return Response.json({ id: row.id, expires_at: row.expires_at, expected_count: items.length, reused, url: `${url.origin}/receive?t=${token}` });
      } catch (e) {
        console.error("/api/admin/ship-trip-receipts/create", e);
        return Response.json({ error: "ສ້າງລິ້ງບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_link_nonce.sql ກະລຸນາຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // ລ້າງ (ຍົກເລີກລິ້ງ ຫຼື ລຶບລາຍເຊັນທີ່ເຊັນແລ້ວ ເພື່ອໃຫ້ສ້າງລິ້ງໃໝ່ໄດ້)
    if (url.pathname === "/api/admin/ship-trip-receipts/reset" && request.method === "POST") {
      try {
        const { id } = await request.json();
        const row = id ? await env.DB.prepare("SELECT id, sig_receiver, recv_photos FROM ship_trip_receipts WHERE id = ?").bind(id).first() : null;
        if (!row) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM ship_trip_receipts WHERE id = ?").bind(row.id).run();
        await deleteR2Photos(env, [row.sig_receiver, ...parseRecvPhotoKeys(row.recv_photos)]);
        return Response.json({ message: "ລ້າງແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/ship-trip-receipts/reset", e);
        return Response.json({ error: "ລ້າງບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===================== ລຳດັບແຂວງຂອງຖ້ຽວ (ship_trip_stops) =====================
    // ເກັບສະເພາະລຳດັບ (seq). "ລົດຮອດແຂວງນີ້ແລ້ວ" = ຜູ້ຮັບເຊັນຮັບແລ້ວ (ship_trip_receipts.status = 'signed') — ຄິດໃນໜ້າເວັບ
    if (url.pathname === "/api/admin/ship-trip-stops" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, trip_id, province, seq FROM ship_trip_stops ORDER BY trip_id DESC, seq ASC LIMIT 5000"
      ).all();
      return Response.json(results || []);
    }

    // ບັນທຶກລຳດັບແຂວງທີ່ລົດຈະໄປ — body: { trip_id, provinces: ["ຫຼວງພະບາງ", "ຄຳມ່ວນ", ...] }
    if (url.pathname === "/api/admin/ship-trip-stops/order" && request.method === "POST") {
      try {
        const b = await request.json();
        const trip = b.trip_id ? await env.DB.prepare("SELECT id FROM ship_trips WHERE id = ?").bind(b.trip_id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        const provs = [];
        for (const p of Array.isArray(b.provinces) ? b.provinces : []) {
          const v = tripClean(p, 100);
          if (v && !provs.includes(v)) provs.push(v);
        }
        if (!provs.length || provs.length > 40) return Response.json({ error: "ລຳດັບແຂວງບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        await env.DB.batch(provs.map((p, i) =>
          env.DB.prepare(
            "INSERT INTO ship_trip_stops (trip_id, province, seq) VALUES (?1, ?2, ?3) ON CONFLICT(trip_id, province) DO UPDATE SET seq = excluded.seq"
          ).bind(trip.id, p, i + 1)
        ));
        return Response.json({ message: "ບັນທຶກລຳດັບແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/ship-trip-stops/order", e);
        return Response.json({ error: "ບັນທຶກລຳດັບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===================== ລິ້ງເຊັນຮັບຕູ້ປາຍທາງ (ສາທາລະນະ — ບໍ່ຕ້ອງ login, ໃຊ້ token) =====================
    if (url.pathname === "/api/public/receipt" && request.method === "GET") {
      const token = (url.searchParams.get("t") || "").trim();
      if (token.length < 20 || token.length > 100) return Response.json({ state: "invalid" }, { status: 404, headers: RECEIPT_NO_CACHE });
      const r = await env.DB.prepare(
        `SELECT r.id, r.trip_id, r.province, r.warehouse, r.status, r.expected_count, r.receiver_name, r.signed_at,
                CASE WHEN r.expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired,
                t.trip_no, t.truck_plate, t.trip_date
           FROM ship_trip_receipts r JOIN ship_trips t ON t.id = r.trip_id
          WHERE r.token_hash = ?`
      ).bind(await sha256Hex(token)).first();
      if (!r) return Response.json({ state: "invalid" }, { status: 404, headers: RECEIPT_NO_CACHE });
      const base = { trip_no: r.trip_no, truck_plate: r.truck_plate, trip_date: r.trip_date, province: r.province, warehouse: r.warehouse || "" };
      if (r.status === "signed") return Response.json({ state: "signed", ...base, receiver_name: r.receiver_name, signed_at: r.signed_at }, { headers: RECEIPT_NO_CACHE });
      if (r.expired) return Response.json({ state: "expired", ...base }, { status: 410, headers: RECEIPT_NO_CACHE });
      const items = await receiptItems(env, r.trip_id, r.province, r.warehouse);
      return Response.json({ state: "pending", ...base, expected_count: items.length, items }, { headers: RECEIPT_NO_CACHE });
    }

    // PDF ໃບສົ່ງ ສຳລັບຜູ້ຮັບ (ເປີດເບິ່ງກ່ອນເຊັນ) — ໃຊ້ token ດຽວກັບລິ້ງ, ສະເພາະລິ້ງທີ່ຍັງບໍ່ເຊັນ ແລະ ບໍ່ໝົດອາຍຸ, ສະແດງສະເພາະຕູ້ຂອງແຂວງຕົນເອງ
    if (url.pathname === "/api/public/receipt/pdf" && request.method === "GET") {
      const token = (url.searchParams.get("t") || "").trim();
      if (token.length < 20 || token.length > 100) return new Response("Not found", { status: 404, headers: RECEIPT_NO_CACHE });
      const r = await env.DB.prepare(
        `SELECT r.trip_id, r.province, r.warehouse, r.status,
                CASE WHEN r.expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired,
                t.trip_no, t.truck_plate, t.driver_name, t.driver_phone, t.trip_date, t.note,
                t.sig_sender, t.sig_driver, t.sig_approver
           FROM ship_trip_receipts r JOIN ship_trips t ON t.id = r.trip_id
          WHERE r.token_hash = ?`
      ).bind(await sha256Hex(token)).first();
      if (!r) return new Response("Not found", { status: 404, headers: RECEIPT_NO_CACHE });
      if (r.status !== "pending") return new Response("ລິ້ງນີ້ຖືກໃຊ້ເຊັນແລ້ວ", { status: 409, headers: RECEIPT_NO_CACHE });
      if (r.expired) return new Response("ລິ້ງໝົດອາຍຸແລ້ວ", { status: 410, headers: RECEIPT_NO_CACHE });
      try {
        const items = await receiptItems(env, r.trip_id, r.province, r.warehouse);
        const pdfBytes = await buildTripDocPdf(env, r, recvLabel(r.province, r.warehouse), items);
        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="trip-${String(r.trip_no || "doc").replace(/[^A-Za-z0-9_-]/g, "")}.pdf"`,
            ...RECEIPT_NO_CACHE,
          },
        });
      } catch (e) {
        console.error("ສ້າງ PDF ໃບສົ່ງ (ລິ້ງຜູ້ຮັບ) ບໍ່ສຳເລັດ:", e);
        return new Response("ບໍ່ສາມາດສ້າງ PDF ໄດ້", { status: 500, headers: RECEIPT_NO_CACHE });
      }
    }

    if (url.pathname === "/api/public/receipt/sign" && request.method === "POST") {
      try {
        const b = await request.json();
        const token = String(b.t || "").trim();
        if (token.length < 20 || token.length > 100) return Response.json({ error: "ລິ້ງບໍ່ຖືກຕ້ອງ" }, { status: 404, headers: RECEIPT_NO_CACHE });
        const r = await env.DB.prepare(
          `SELECT id, trip_id, province, warehouse, status, CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired
             FROM ship_trip_receipts WHERE token_hash = ?`
        ).bind(await sha256Hex(token)).first();
        if (!r) return Response.json({ error: "ລິ້ງບໍ່ຖືກຕ້ອງ" }, { status: 404, headers: RECEIPT_NO_CACHE });
        if (r.status !== "pending") return Response.json({ error: "ລິ້ງນີ້ຖືກໃຊ້ເຊັນແລ້ວ" }, { status: 409, headers: RECEIPT_NO_CACHE });
        if (r.expired) return Response.json({ error: "ລິ້ງໝົດອາຍຸແລ້ວ — ກະລຸນາຂໍລິ້ງໃໝ່ຈາກຜູ້ສົ່ງ" }, { status: 410, headers: RECEIPT_NO_CACHE });

        const name = String(b.receiver_name || "").trim().slice(0, 100);
        const phone = String(b.receiver_phone || "").trim().slice(0, 30);
        const note = String(b.note || "").trim().slice(0, 500);
        const expected = (await receiptItems(env, r.trip_id, r.province, r.warehouse)).length;
        const count = Number(b.received_count);
        if (!name) return Response.json({ error: "ກະລຸນາໃສ່ຊື່ຜູ້ຮັບ" }, { status: 400, headers: RECEIPT_NO_CACHE });
        if (!Number.isInteger(count) || count < 0 || count > 9999) return Response.json({ error: "ຈຳນວນຕູ້ທີ່ຮັບບໍ່ຖືກຕ້ອງ" }, { status: 400, headers: RECEIPT_NO_CACHE });
        if (count !== expected && !note) return Response.json({ error: "ຈຳນວນທີ່ຮັບບໍ່ກົງກັບໃບສົ່ງ — ກະລຸນາໃສ່ໝາຍເຫດ" }, { status: 400, headers: RECEIPT_NO_CACHE });
        if (!b.signature) return Response.json({ error: "ກະລຸນາເຊັນຊື່" }, { status: 400, headers: RECEIPT_NO_CACHE });
        // ຕ້ອງຖ່າຍຮູບຕອນຮັບຕູ້ ຢ່າງໜ້ອຍ 1 ຮູບ (ສູງສຸດ RECV_PHOTO_MAX ຮູບ)
        const photosIn = Array.isArray(b.photos) ? b.photos.filter((p) => typeof p === "string" && p) : [];
        if (photosIn.length < 1) return Response.json({ error: "ກະລຸນາຖ່າຍຮູບຕອນຮັບຕູ້ ຢ່າງໜ້ອຍ 1 ຮູບ" }, { status: 400, headers: RECEIPT_NO_CACHE });
        if (photosIn.length > RECV_PHOTO_MAX) return Response.json({ error: `ແນບຮູບໄດ້ສູງສຸດ ${RECV_PHOTO_MAX} ຮູບ` }, { status: 400, headers: RECEIPT_NO_CACHE });

        let sigKey, photoKeys;
        try {
          const ts = Date.now();
          const saved = await savePhotosToR2(env, [
            [b.signature, `trip/${r.trip_id}/recv-${r.id}-${ts}.png`],
            ...photosIn.map((p, i) => [p, `trip/${r.trip_id}/recvphoto-${r.id}-${ts}-${i + 1}.jpg`]),
          ]);
          sigKey = saved[0]; photoKeys = saved.slice(1);
        } catch (photoErr) {
          console.error("/api/public/receipt/sign", photoErr);
          const pr = photoErrorResponse(photoErr);
          if (pr) return pr;
          throw photoErr;
        }
        // ໃຊ້ໄດ້ຄັ້ງດຽວ: UPDATE ຈະສຳເລັດພຽງຄັ້ງດຽວ (ຖ້າສອງຄົນກົດພ້ອມກັນ ຄົນທີ 2 changes = 0)
        const upd = await env.DB.prepare(
          `UPDATE ship_trip_receipts
              SET status = 'signed', receiver_name = ?1, receiver_phone = ?2, received_count = ?3, note = ?4,
                  sig_receiver = ?5, signed_at = CURRENT_TIMESTAMP, expected_count = ?6, recv_photos = ?8
            WHERE id = ?7 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`
        ).bind(name, phone || null, count, note || null, sigKey, expected, r.id, JSON.stringify(photoKeys)).run();
        if (!upd.meta || upd.meta.changes !== 1) {
          await deleteR2Photos(env, [sigKey, ...photoKeys]);
          return Response.json({ error: "ລິ້ງນີ້ຖືກໃຊ້ເຊັນແລ້ວ ຫຼື ໝົດອາຍຸ" }, { status: 409, headers: RECEIPT_NO_CACHE });
        }
        return Response.json({ message: "ບັນທຶກການຮັບຕູ້ແລ້ວ ຂອບໃຈ" }, { headers: RECEIPT_NO_CACHE });
      } catch (e) {
        console.error("/api/public/receipt/sign", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500, headers: RECEIPT_NO_CACHE });
      }
    }

    // ===================== ລິ້ງເຊັນ DSM (ສາທາລະນະ — ບໍ່ຕ້ອງ login, ໃຊ້ token) =====================
    // ດຶງແຖວລິ້ງ + ເອກະສານ ຈາກ token (ໃຊ້ຮ່ວມກັນທັງ 3 endpoint) — ຄືນ null ຖ້າບໍ່ພົບ
    const dsmLinkByToken = async (token) => {
      if (token.length < 20 || token.length > 100) return null;
      const l = await env.DB.prepare(
        `SELECT id, kind, doc_id, status, signer_name, signed_at,
                CASE WHEN expires_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS expired
           FROM dsm_sign_links WHERE token_hash = ?`
      ).bind(await sha256Hex(token)).first();
      if (!l) return null;
      const cfg = DSM_DOC_KINDS[l.kind];
      if (!cfg) return null;
      const doc = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).bind(l.doc_id).first();
      if (!doc) return null;
      return { link: l, cfg, doc };
    };

    // ===================== role DSM: ເບິ່ງ/ເຊັນເອກະສານຂອງທີມຕົນເອງ (login ແລ້ວ — ບໍ່ຕ້ອງໃຊ້ລິ້ງ token) =====================
    const dsmDocInTeam = async (doc, team) => {
      if (!doc || !team || !doc.mde_code) return false;
      const ok = await env.DB.prepare(
        "SELECT 1 AS ok FROM mde_list WHERE team = ? AND UPPER(TRIM(mde_code)) = UPPER(TRIM(?)) LIMIT 1"
      ).bind(team, doc.mde_code).first();
      return !!ok;
    };
    if (url.pathname === "/api/dsm/contracts" && request.method === "GET") {
      const team = session.team || "";
      const loan = await env.DB.prepare(
        `SELECT id, doc_no, outlet_code, outlet_name, mde_code, cooler_brand, qr_cd, serial_no, status, created_at,
                (sig_mde IS NOT NULL) AS mde_signed, (sig_dsm IS NOT NULL) AS dsm_signed, sig_dsm_name, sig_dsm_at
           FROM loan_contracts WHERE ${TEAM_MDE_SQL} ORDER BY id DESC LIMIT 300`
      ).bind(team).all();
      const cancel = await env.DB.prepare(
        `SELECT id, doc_no, loan_doc_no, outlet_code, outlet_name, mde_code, cooler_brand, qr_cd, serial_no, status, created_at,
                (sig_mde IS NOT NULL) AS mde_signed, (sig_dsm IS NOT NULL) AS dsm_signed, sig_dsm_name, sig_dsm_at
           FROM cancel_contracts WHERE ${TEAM_MDE_SQL} ORDER BY id DESC LIMIT 300`
      ).bind(team).all();
      return Response.json({ team, dsm_name: await getDsmNameForTeam(env, team), loan: loan.results || [], cancel: cancel.results || [] });
    }
    if (url.pathname === "/api/dsm/contract-pdf" && request.method === "GET") {
      const cfg = DSM_DOC_KINDS[url.searchParams.get("kind")];
      if (!cfg) return Response.json({ error: "ປະເພດເອກະສານບໍ່ຖືກຕ້ອງ" }, { status: 400 });
      const doc = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).bind(url.searchParams.get("id")).first();
      if (!doc || !(await dsmDocInTeam(doc, session.team))) return Response.json({ error: "ບໍ່ພົບເອກະສານໃນທີມຂອງທ່ານ" }, { status: 404 });
      try {
        const pdfBytes = await cfg.build(env, doc, { ownerDocBytes: await ownerDocBytesFor(env, null, doc, true) });
        return new Response(pdfBytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${String(doc.doc_no || "document").replace(/[^A-Za-z0-9_-]/g, "") || "document"}.pdf"`, "Cache-Control": "no-store" } });
      } catch (e) {
        console.error("/api/dsm/contract-pdf", e);
        return Response.json({ error: "ສ້າງ PDF ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }
    if (url.pathname === "/api/dsm/sign" && request.method === "POST") {
      try {
        const b = await request.json();
        const cfg = DSM_DOC_KINDS[b.kind];
        if (!cfg) return Response.json({ error: "ປະເພດເອກະສານບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        const doc = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).bind(b.id).first();
        if (!doc || !(await dsmDocInTeam(doc, session.team))) return Response.json({ error: "ບໍ່ພົບເອກະສານໃນທີມຂອງທ່ານ" }, { status: 404 });
        if (doc.sig_dsm) return Response.json({ error: "ເອກະສານນີ້ DSM ເຊັນແລ້ວ" }, { status: 409 });
        if (!doc.sig_mde) return Response.json({ error: "MDE ຍັງບໍ່ໄດ້ເຊັນເອກະສານນີ້" }, { status: 409 });
        const name = String(b.signer_name || "").trim().slice(0, 100) || (await getDsmNameForTeam(env, session.team)) || session.email;
        if (!b.signature) return Response.json({ error: "ກະລຸນາເຊັນຊື່" }, { status: 400 });
        let sigKey;
        try {
          [sigKey] = await savePhotosToR2(env, [[b.signature, `${cfg.prefix}/${doc.id}/dsm-${Date.now()}.png`]]);
        } catch (photoErr) {
          const pr = photoErrorResponse(photoErr);
          if (pr) return pr;
          throw photoErr;
        }
        const res = await env.DB.batch([
          env.DB.prepare(`UPDATE ${cfg.table} SET sig_dsm = ?1, sig_dsm_name = ?2, sig_dsm_at = CURRENT_TIMESTAMP,
                 status = CASE WHEN sig_mde IS NOT NULL THEN 'completed' ELSE status END WHERE id = ?3 AND sig_dsm IS NULL`).bind(sigKey, name, doc.id),
          env.DB.prepare("UPDATE dsm_sign_links SET status = 'signed', signer_name = ?3, signed_at = CURRENT_TIMESTAMP WHERE kind = ?1 AND doc_id = ?2 AND status = 'pending'").bind(b.kind, doc.id, name),
        ]);
        if (!res[0].meta || res[0].meta.changes !== 1) {
          await deleteR2Photos(env, [sigKey]);
          return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ ຫຼືມີຄົນເຊັນໄປກ່ອນແລ້ວ" }, { status: 409 });
        }
        try {
          await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
            title: `DSM ເຊັນ${cfg.title}ແລ້ວ`,
            body: `${doc.doc_no || ""} · ${name}\n${doc.outlet_name || ""}`.trim(),
            url: "loanContract:docs",
          });
        } catch (e) { /* ແຈ້ງເຕືອນບໍ່ສຳເລັດບໍ່ກະທົບການເຊັນ */ }
        return Response.json({ message: "ບັນທຶກລາຍເຊັນ DSM ແລ້ວ" });
      } catch (e) {
        console.error("/api/dsm/sign", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/public/dsm-sign" && request.method === "GET") {
      try {
        const found = await dsmLinkByToken((url.searchParams.get("t") || "").trim());
        if (!found) return Response.json({ state: "invalid" }, { status: 404, headers: RECEIPT_NO_CACHE });
        const { link: l, cfg, doc } = found;
        const base = { title: cfg.title, doc_no: doc.doc_no || "", outlet_code: doc.outlet_code || "", outlet_name: doc.outlet_name || "", mde_code: doc.mde_code || "" };
        if (l.status === "signed") return Response.json({ state: "signed", ...base, signer_name: l.signer_name, signed_at: l.signed_at }, { headers: RECEIPT_NO_CACHE });
        if (l.expired) return Response.json({ state: "expired", ...base }, { status: 410, headers: RECEIPT_NO_CACHE });
        // ລາຍລະອຽດຮ້ານຄ້າ + Asset ສຳລັບສະແດງໃນໜ້າເຊັນ DSM (ເອົາສະເພາະຄໍລຳທີ່ມີຄ່າ; ໃບ loan/cancel ມີຄໍລຳບໍ່ເທົ່າກັນ)
        const detail = {};
        for (const k of ["outlet_owner", "outlet_phone", "outlet_type", "outlet_grade", "village", "district", "province", "mde_phone",
          "contract_type", "handover_type", "doors", "door_variant", "cooler_type", "capx", "tracking_no",
          "old_doc_no", "old_outlet_code", "old_outlet_name", "old_outlet_phone", "move_reason",
          "loan_doc_no", "reasons", "informer_name",
          "sales_beer", "sales_premium", "sales_csd_energy", "sales_water_soda"]) {
          if (doc[k] != null && String(doc[k]).trim() !== "") detail[k] = doc[k];
        }
        return Response.json({ state: "pending", ...base, ...detail, kind: l.kind, dsm_name: doc.sig_dsm_name || "", cooler_brand: doc.cooler_brand || "", qr_cd: doc.qr_cd || "", serial_no: doc.serial_no || "" }, { headers: RECEIPT_NO_CACHE });
      } catch (e) {
        console.error("/api/public/dsm-sign", e);
        return Response.json({ state: "invalid" }, { status: 500, headers: RECEIPT_NO_CACHE });
      }
    }

    // PDF ເອກະສານ ໃຫ້ DSM ເປີດເບິ່ງກ່ອນເຊັນ — ສະເພາະລິ້ງທີ່ຍັງບໍ່ເຊັນ ແລະ ບໍ່ໝົດອາຍຸ
    if (url.pathname === "/api/public/dsm-sign/pdf" && request.method === "GET") {
      try {
        const found = await dsmLinkByToken((url.searchParams.get("t") || "").trim());
        if (!found) return new Response("Not found", { status: 404, headers: RECEIPT_NO_CACHE });
        if (found.link.status !== "pending") return new Response("ລິ້ງນີ້ຖືກໃຊ້ເຊັນແລ້ວ", { status: 409, headers: RECEIPT_NO_CACHE });
        if (found.link.expired) return new Response("ລິ້ງໝົດອາຍຸແລ້ວ", { status: 410, headers: RECEIPT_NO_CACHE });
        // DSM ເຫັນ PDF ສັນຍາລວມເອກະສານເຈົ້າຂອງຮ້ານ (ໜ້າສຸດທ້າຍ) ຄືກັນ
        const pdfBytes = await found.cfg.build(env, found.doc, { ownerDocBytes: await ownerDocBytesFor(env, null, found.doc, true) });
        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${String(found.doc.doc_no || "document").replace(/[^A-Za-z0-9_-]/g, "") || "document"}.pdf"`,
            ...RECEIPT_NO_CACHE,
          },
        });
      } catch (e) {
        console.error("ສ້າງ PDF (ລິ້ງ DSM) ບໍ່ສຳເລັດ:", e);
        return new Response("ບໍ່ສາມາດສ້າງ PDF ໄດ້", { status: 500, headers: RECEIPT_NO_CACHE });
      }
    }

    if (url.pathname === "/api/public/dsm-sign/sign" && request.method === "POST") {
      try {
        const b = await request.json();
        const found = await dsmLinkByToken(String(b.t || "").trim());
        if (!found) return Response.json({ error: "ລິ້ງບໍ່ຖືກຕ້ອງ" }, { status: 404, headers: RECEIPT_NO_CACHE });
        const { link: l, cfg, doc } = found;
        if (l.status !== "pending") return Response.json({ error: "ລິ້ງນີ້ຖືກໃຊ້ເຊັນແລ້ວ" }, { status: 409, headers: RECEIPT_NO_CACHE });
        if (l.expired) return Response.json({ error: "ລິ້ງໝົດອາຍຸແລ້ວ — ກະລຸນາຂໍລິ້ງໃໝ່" }, { status: 410, headers: RECEIPT_NO_CACHE });
        const name = String(b.signer_name || "").trim().slice(0, 100);
        if (!name) return Response.json({ error: "ກະລຸນາໃສ່ຊື່ DSM" }, { status: 400, headers: RECEIPT_NO_CACHE });
        if (!b.signature) return Response.json({ error: "ກະລຸນາເຊັນຊື່" }, { status: 400, headers: RECEIPT_NO_CACHE });

        let sigKey;
        try {
          [sigKey] = await savePhotosToR2(env, [[b.signature, `${cfg.prefix}/${doc.id}/dsm-${Date.now()}.png`]]);
        } catch (photoErr) {
          console.error("/api/public/dsm-sign/sign", photoErr);
          const pr = photoErrorResponse(photoErr);
          if (pr) return pr;
          throw photoErr;
        }
        // ໃຊ້ໄດ້ຄັ້ງດຽວ + ອັບເດດເອກະສານ ໃນ batch (transaction) ດຽວ — ທັງສອງ UPDATE ມີເງື່ອນໄຂດຽວກັນ (ລິ້ງຍັງ pending + ບໍ່ໝົດອາຍຸ)
        // ຖ້າສອງຄົນກົດພ້ອມກັນ ຄົນທີ 2 changes = 0 (ບໍ່ຂຽນທັບ)
        const cond = "EXISTS (SELECT 1 FROM dsm_sign_links WHERE id = ?1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP)";
        const res = await env.DB.batch([
          env.DB.prepare(`UPDATE ${cfg.table} SET sig_dsm = ?2, sig_dsm_name = ?3, sig_dsm_at = CURRENT_TIMESTAMP,
                 status = CASE WHEN sig_mde IS NOT NULL THEN 'completed' ELSE status END WHERE id = ?4 AND ${cond}`)
            .bind(l.id, sigKey, name, doc.id),
          env.DB.prepare("UPDATE dsm_sign_links SET status = 'signed', signer_name = ?2, signed_at = CURRENT_TIMESTAMP WHERE id = ?1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP")
            .bind(l.id, name),
        ]);
        if (!res[0].meta || res[0].meta.changes !== 1 || !res[1].meta || res[1].meta.changes !== 1) {
          await deleteR2Photos(env, [sigKey]);
          return Response.json({ error: "ລິ້ງນີ້ຖືກໃຊ້ເຊັນແລ້ວ ຫຼື ໝົດອາຍຸ" }, { status: 409, headers: RECEIPT_NO_CACHE });
        }
        if (doc.sig_dsm) await deleteR2Photos(env, [doc.sig_dsm]); // ລາຍເຊັນເກົ່າ (ຖ້າມີ) ຖືກແທນທີ່ແລ້ວ
        try {
          await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
            title: doc.sig_mde ? `DSM ເຊັນ${cfg.title}ແລ້ວ — ເອກະສານສຳເລັດ` : `DSM ເຊັນ${cfg.title}ແລ້ວ`,
            body: `${doc.doc_no || ""} · ${name}\n${doc.outlet_name || ""}`.trim(),
            url: doc.sig_mde ? "loanContract:docs" : "loanContract:queue",
          });
        } catch (e) { /* ບໍ່ຕ້ອງເຮັດຫຍັງ */ }
        return Response.json({ message: "ບັນທຶກລາຍເຊັນ DSM ແລ້ວ ຂອບໃຈ" }, { headers: RECEIPT_NO_CACHE });
      } catch (e) {
        console.error("/api/public/dsm-sign/sign", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500, headers: RECEIPT_NO_CACHE });
      }
    }

    // ຢືນຢັນລົດອອກ: ຕູ້ທັງໝົດໃນຖ້ຽວ confirmed => shipped_out ພ້ອມກັນ (ໃນ batch ດຽວ)
    if (url.pathname === "/api/admin/ship-trips/depart" && request.method === "POST") {
      try {
        const { id, photo } = await request.json();
        const trip = id ? await env.DB.prepare("SELECT id, trip_no, status, truck_plate, sig_sender, sig_driver FROM ship_trips WHERE id = ?").bind(id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "open") return Response.json({ error: "ຖ້ຽວນີ້ລົດອອກແລ້ວ" }, { status: 400 });
        // ແຜນທີ່ສ້າງລ່ວງໜ້າອາດຍັງບໍ່ມີທະບຽນ — ຕ້ອງລະບຸກ່ອນລົດອອກ (ແກ້ໄຂຖ້ຽວ -> ເລກທະບຽນລົດ)
        if (!String(trip.truck_plate || "").trim()) return Response.json({ error: "ຖ້ຽວນີ້ຍັງບໍ່ໄດ້ລະບຸເລກທະບຽນລົດ — ກົດ ແກ້ໄຂຖ້ຽວ ເພື່ອໃສ່ທະບຽນກ່ອນຢືນຢັນລົດອອກ" }, { status: 400 });
        if (!photo) return Response.json({ error: "ກະລຸນາຖ່າຍຮູບກ່ອນຢືນຢັນລົດອອກ" }, { status: 400 });
        // ລາຍເຊັນຕ້ອງບັນທຶກໄວ້ກ່ອນແລ້ວ (ປຸ່ມ "ເຊັນຊື່" ຂ້າງປຸ່ມແກ້ໄຂຖ້ຽວ -> /api/admin/ship-trips/sign)
        if (!trip.sig_sender || !trip.sig_driver) return Response.json({ error: "ກະລຸນາເຊັນຊື່ (ຜູ້ຈັດສົ່ງ + ຄົນຂັບລົດ) ກ່ອນຢືນຢັນລົດອອກ" }, { status: 400 });
        const cntNew = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM new_coolers WHERE trip_id = ? AND status = 'confirmed' AND ship_requested = 1 AND COALESCE(TRIM(ship_province), '') != ''"
        ).bind(trip.id).first();
        const cntStock = await env.DB.prepare(
          `SELECT COUNT(*) AS c FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
            WHERE l.trip_id = ? AND ws.status = 'reserved'`
        ).bind(trip.id).first();
        const cnt = { c: ((cntNew && cntNew.c) || 0) + ((cntStock && cntStock.c) || 0) };
        if (!cnt.c) return Response.json({ error: "ຖ້ຽວນີ້ຍັງບໍ່ມີຕູ້ ກະລຸນາເພີ່ມຕູ້ກ່ອນຢືນຢັນລົດອອກ" }, { status: 400 });
        // ງົບຕູ້ແຊ່ຕ່າງແຂວງ: ກວດກ່ອນຕັດງົບ (ຕັດອັດຕະໂນມັດເມື່ອຕູ້ເປັນ shipped_out ຫຼັງລົດອອກ)
        let budgetOverride = 0; // admin ອະນຸມັດເອົາໄປນອກງົບຕອນສ້າງແຜນ -> ຂ້າມການກວດງົບ
        try { const ov = await env.DB.prepare("SELECT budget_override FROM ship_trips WHERE id = ?").bind(trip.id).first(); budgetOverride = (ov && ov.budget_override) || 0; } catch (e) { /* ຍັງບໍ່ໄດ້ຮັນ migration_add_ship_trip_budget_override.sql */ }
        const budgetErr = budgetOverride ? null : await provBudgetCheckTrip(env, trip.id);
        if (budgetErr) return Response.json({ error: budgetErr }, { status: 400 });
        // ອັບໂຫລດຮູບຂຶ້ນ R2 ກ່ອນ (ຮູບຜິດ -> ຈົບທີ່ນີ້ ບໍ່ປ່ຽນສະຖານະຕູ້)
        let departPhotoKey = null;
        try {
          [departPhotoKey] = await savePhotosToR2(env, [[photo, `trip/${trip.id}/depart-${Date.now()}.jpg`]]);
        } catch (photoErr) {
          console.error("/api/admin/ship-trips/depart", photoErr);
          const pr = photoErrorResponse(photoErr);
          if (pr) return pr;
          throw photoErr;
        }
        // ສາງ "ຕ່າງແຂວງ" (ຖ້າ Admin ສ້າງໄວ້): ຕູ້ຈາກສາງທີ່ລົດອອກແລ້ວ ຍ້າຍມາຢູ່ສາງນີ້ ແລະ ເກັບສາງເດີມໄວ້ໃນ old_warehouse_id
        const provWhId = await getProvinceWarehouseId(env);
        try {
        await env.DB.batch([
          // ຕູ້ຈາກສາງ: reserved => shipped_out (ບັນທຶກປະຫວັດກ່ອນ UPDATE ເພື່ອໃຫ້ old_status ແລະ ສາງເດີມຖືກຕ້ອງ)
          env.DB.prepare(
            `INSERT INTO warehouse_stock_history (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
             SELECT ws.id, COALESCE(?4, ws.warehouse_id), CASE WHEN ?4 IS NOT NULL AND ?4 != ws.warehouse_id THEN ws.warehouse_id ELSE NULL END, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
                    'reserved', 'shipped_out', ?1, 'ສົ່ງຕ່າງແຂວງ ຖ້ຽວ ' || ?2 || ' → ' || COALESCE(NULLIF(TRIM(l.ship_province), ''), '-') || COALESCE(NULLIF(' / ' || TRIM(l.ship_warehouse), ' / '), '')
               FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
              WHERE l.trip_id = ?3 AND ws.status = 'reserved'`
          ).bind(tripActor, trip.trip_no, trip.id, provWhId),
          env.DB.prepare(
            `UPDATE warehouse_stock SET status = 'shipped_out', warehouse_id = COALESCE(?2, warehouse_id), updated_at = CURRENT_TIMESTAMP
              WHERE status = 'reserved' AND id IN (SELECT stock_id FROM ship_trip_stock WHERE trip_id = ?1)`
          ).bind(trip.id, provWhId),
          env.DB.prepare(
            `UPDATE new_coolers SET status = 'shipped_out', ship_requested = 0, shipped_by = ?1, shipped_at = CURRENT_TIMESTAMP
              WHERE trip_id = ?2 AND status = 'confirmed' AND ship_requested = 1`
          ).bind(tripActor, trip.id),
          env.DB.prepare(
            "UPDATE ship_trips SET status = 'departed', departed_by = ?1, departed_at = CURRENT_TIMESTAMP, depart_photo = ?3 WHERE id = ?2 AND status = 'open'"
          ).bind(tripActor, trip.id, departPhotoKey)
        ]);
        } catch (dbErr) {
          console.error("/api/admin/ship-trips/depart", dbErr);
          await deleteR2Photos(env, [departPhotoKey]); // ບັນທຶກບໍ່ສຳເລັດ -> ລຶບຮູບທີ່ອັບໄປແລ້ວ ບໍ່ໃຫ້ຄ້າງໃນ R2
          throw dbErr;
        }
        return Response.json({ message: "ຢືນຢັນລົດອອກແລ້ວ", shipped: cnt.c, depart_photo: departPhotoKey });
      } catch (e) {
        console.error("/api/admin/ship-trips/depart", e);
        return Response.json({ error: "ຢືນຢັນລົດອອກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ເປີດຖ້ຽວຄືນ (departed => open) ກໍລະນີກົດລົດອອກຜິດ: ຕູ້ໃນຖ້ຽວກັບເປັນ \"ລໍຖ້າຢືນຢັນສົ່ງອອກ\"
    if (url.pathname === "/api/admin/ship-trips/reopen" && request.method === "POST") {
      try {
        const { id } = await request.json();
        const trip = id ? await env.DB.prepare("SELECT id, status, depart_photo, sig_sender, sig_driver, sig_approver FROM ship_trips WHERE id = ?").bind(id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "departed") return Response.json({ error: "ຖ້ຽວນີ້ຍັງບໍ່ໄດ້ຢືນຢັນລົດອອກ" }, { status: 400 });
        const signedRecv = await env.DB.prepare("SELECT COUNT(*) AS c FROM ship_trip_receipts WHERE trip_id = ? AND status = 'signed'").bind(trip.id).first();
        if (signedRecv && signedRecv.c > 0) return Response.json({ error: "ເປີດຖ້ຽວຄືນບໍ່ໄດ້ — ມີແຂວງທີ່ຜູ້ຮັບເຊັນຮັບຕູ້ແລ້ວ (ກົດ ລ້າງ ໃນ ລິ້ງໃຫ້ຜູ້ຮັບເຊັນ ກ່ອນ)" }, { status: 400 });
        // ຕູ້ທີ່ຖືກຍ້າຍໄປສາງ "ຕ່າງແຂວງ" ຕອນລົດອອກ -> ກັບໄປສາງເດີມ (ຫາຈາກປະຫວັດ old_warehouse_id)
        const provWhId = await getProvinceWarehouseId(env);
        const backMoves = [];
        if (provWhId) {
          const moved = await env.DB.prepare(
            `SELECT ws.id, ws.warehouse_id, ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex
               FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
              WHERE l.trip_id = ? AND ws.status = 'shipped_out' AND ws.warehouse_id = ?`
          ).bind(trip.id, provWhId).all();
          for (const st of (moved.results || [])) {
            const backWhId = await resolveReturnWarehouseId(env, st);
            if (backWhId === st.warehouse_id) continue;
            backMoves.push(
              env.DB.prepare(
                `INSERT INTO warehouse_stock_history (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
                 VALUES (?, ?, ?, 'update', ?, ?, ?, ?, ?, ?, 'shipped_out', 'shipped_out', ?, 'ເປີດຖ້ຽວຄືນ (ກັບຄືນສາງເດີມ)')`
              ).bind(st.id, backWhId, st.warehouse_id, st.cooler_brand, st.cooler_type, st.cooler_model, st.qr_code, st.serial_number, st.capex, tripActor),
              env.DB.prepare("UPDATE warehouse_stock SET warehouse_id = ? WHERE id = ?").bind(backWhId, st.id)
            );
          }
        }
        await env.DB.batch([
          env.DB.prepare("DELETE FROM ship_trip_receipts WHERE trip_id = ? AND status = 'pending'").bind(trip.id),
          ...backMoves, // ຍ້າຍກັບສາງເດີມກ່ອນ ແລ້ວຄ່ອຍບັນທຶກປະຫວັດ shipped_out -> reserved ຂ້າງລຸ່ມ
          env.DB.prepare(
            `INSERT INTO warehouse_stock_history (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
             SELECT ws.id, ws.warehouse_id, NULL, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
                    'shipped_out', 'reserved', ?1, 'ເປີດຖ້ຽວຄືນ (ຍົກເລີກການສົ່ງອອກ)'
               FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
              WHERE l.trip_id = ?2 AND ws.status = 'shipped_out'`
          ).bind(tripActor, trip.id),
          env.DB.prepare(
            `UPDATE warehouse_stock SET status = 'reserved', updated_at = CURRENT_TIMESTAMP
              WHERE status = 'shipped_out' AND id IN (SELECT stock_id FROM ship_trip_stock WHERE trip_id = ?)`
          ).bind(trip.id),
          env.DB.prepare(
            `UPDATE new_coolers SET status = 'confirmed', ship_requested = 1, shipped_by = NULL, shipped_at = NULL
              WHERE trip_id = ? AND status = 'shipped_out'`
          ).bind(trip.id),
          env.DB.prepare(
            "UPDATE ship_trips SET status = 'open', departed_by = NULL, departed_at = NULL, depart_photo = NULL, sig_sender = NULL, sig_driver = NULL, sig_approver = NULL WHERE id = ? AND status = 'departed'"
          ).bind(trip.id)
        ]);
        await deleteR2Photos(env, [trip.depart_photo, trip.sig_sender, trip.sig_driver, trip.sig_approver]); // ເປີດຖ້ຽວຄືນ -> ຕ້ອງຖ່າຍຮູບ + ເຊັນໃໝ່ຕອນຢືນຢັນລົດອອກຄັ້ງຕໍ່ໄປ
        return Response.json({ message: "ເປີດຖ້ຽວຄືນແລ້ວ (ຕູ້ກັບເປັນ ລໍຖ້າຢືນຢັນສົ່ງອອກ)" });
      } catch (e) {
        console.error("/api/admin/ship-trips/reopen", e);
        return Response.json({ error: "ເປີດຖ້ຽວຄືນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ລຶບຖ້ຽວ (ສະເພາະຖ້ຽວທີ່ຍັງ open) — ຕູ້ໃນຖ້ຽວກັບເປັນ \"ລໍຖ້າຢືນຢັນສົ່ງອອກ\"
    if (url.pathname === "/api/admin/ship-trips/delete" && request.method === "POST") {
      try {
        const { id } = await request.json();
        const trip = id ? await env.DB.prepare("SELECT id, status FROM ship_trips WHERE id = ?").bind(id).first() : null;
        if (!trip) return Response.json({ error: "ບໍ່ພົບຖ້ຽວລົດ" }, { status: 400 });
        if (trip.status !== "open") return Response.json({ error: "ລຶບບໍ່ໄດ້ ຖ້ຽວນີ້ລົດອອກແລ້ວ (ເປີດຖ້ຽວຄືນກ່ອນ)" }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO warehouse_stock_history (stock_id, warehouse_id, old_warehouse_id, action, cooler_brand, cooler_type, cooler_model, qr_code, serial_number, capex, old_status, new_status, changed_by, notes)
             SELECT ws.id, ws.warehouse_id, NULL, 'update', ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.qr_code, ws.serial_number, ws.capex,
                    'reserved', 'in_warehouse', ?1, 'ລຶບຖ້ຽວ (ກັບເປັນຢູ່ໃນສາງ)'
               FROM ship_trip_stock l JOIN warehouse_stock ws ON ws.id = l.stock_id
              WHERE l.trip_id = ?2 AND ws.status = 'reserved'`
          ).bind(tripActor, trip.id),
          env.DB.prepare(
            `UPDATE warehouse_stock SET status = 'in_warehouse', updated_at = CURRENT_TIMESTAMP
              WHERE status = 'reserved' AND id IN (SELECT stock_id FROM ship_trip_stock WHERE trip_id = ?)`
          ).bind(trip.id),
          env.DB.prepare("DELETE FROM ship_trip_stock WHERE trip_id = ?").bind(trip.id),
          env.DB.prepare("DELETE FROM ship_trip_stops WHERE trip_id = ?").bind(trip.id),
          env.DB.prepare("DELETE FROM ship_trip_plan_items WHERE trip_id = ?").bind(trip.id),
          env.DB.prepare("UPDATE new_coolers SET trip_id = NULL, trip_scanned_at = NULL, trip_scanned_by = NULL WHERE trip_id = ? AND status = 'confirmed'").bind(trip.id),
          env.DB.prepare("DELETE FROM ship_trips WHERE id = ? AND status = 'open'").bind(trip.id)
        ]);
        return Response.json({ message: "ລຶບຖ້ຽວແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/ship-trips/delete", e);
        return Response.json({ error: "ລຶບຖ້ຽວບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ລຶບລາຍການຕູ້ໃໝ່ທີ່ Import ຜິດ (ລຶບໄດ້ສະເພາະທີ່ຍັງບໍ່ໄດ້ຮັບເຂົ້າສາງ)
    if (url.pathname === "/api/admin/delete-new-cooler" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        const res = await env.DB.prepare("DELETE FROM new_coolers WHERE id = ? AND status IN ('pending', 'confirmed')").bind(id).run();
        if (!res.meta || !res.meta.changes) {
          return Response.json({ error: "ລຶບບໍ່ໄດ້ (ບໍ່ພົບລາຍການ ຫຼື ຮັບເຂົ້າສາງໄປແລ້ວ)" }, { status: 400 });
        }
        return Response.json({ message: "ລຶບລາຍການແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-new-cooler", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // ລຶບຫຼາຍລາຍການຕູ້ໃໝ່ພ້ອມກັນ (admin ເທົ່ານັ້ນ — /api/admin/* ທີ່ບໍ່ຢູ່ໃນ ROUTE_ROLES): ລົບໄດ້ສະເພາະ pending/confirmed ທີ່ຍັງບໍ່ຢູ່ໃນຖ້ຽວລົດ
    if (url.pathname === "/api/admin/delete-new-coolers-bulk" && request.method === "POST") {
      try {
        const body = await request.json();
        const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!ids.length) return Response.json({ error: "ກະລຸນາເລືອກລາຍການທີ່ຕ້ອງການລົບ" }, { status: 400 });
        if (ids.length > 1000) return Response.json({ error: "ເລືອກໄດ້ສູງສຸດ 1000 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });
        let deleted = 0;
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const ph = chunk.map(() => "?").join(",");
          let r;
          try {
            r = await env.DB.prepare(`DELETE FROM new_coolers WHERE id IN (${ph}) AND status IN ('pending', 'confirmed') AND trip_id IS NULL`).bind(...chunk).run();
          } catch (e) { // ຍັງບໍ່ໄດ້ຮັນ migration ຖ້ຽວລົດ (ບໍ່ມີຄອລຳ trip_id)
            r = await env.DB.prepare(`DELETE FROM new_coolers WHERE id IN (${ph}) AND status IN ('pending', 'confirmed')`).bind(...chunk).run();
          }
          deleted += (r && r.meta && r.meta.changes) || 0;
        }
        return Response.json({ message: `ລົບລາຍການແລ້ວ ${deleted} ໜ່ວຍ`, deleted, skipped: ids.length - deleted });
      } catch (e) {
        console.error("/api/admin/delete-new-coolers-bulk", e);
        return Response.json({ error: "ລົບຫຼາຍລາຍການບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // API ປະຫວັດການເຄື່ອນໄຫວສະຕັອກສາງ (Warehouse Stock History) - admin/warehouse/delivery ເບິ່ງໄດ້
    if (url.pathname === "/api/warehouse-stock/history" && request.method === "GET") {
      const warehouseId = url.searchParams.get("warehouse_id");
      const search = (url.searchParams.get("search") || "").trim();

      let sql = `SELECT h.*, w.code AS warehouse_code, w.name AS warehouse_name,
                 ow.code AS old_warehouse_code, ow.name AS old_warehouse_name
                 FROM warehouse_stock_history h
                 JOIN wh_warehouses w ON w.id = h.warehouse_id
                 LEFT JOIN wh_warehouses ow ON ow.id = h.old_warehouse_id
                 WHERE 1=1`;
      const binds = [];
      // warehouse_id ຮັບໄດ້ຫຼາຍຄ່າ ຄັ່ນດ້ວຍ comma (ເຊັ່ນ 1,3,5) - ໃຊ້ກັບຕົວກອງແບບເລືອກຫຼາຍສາງ
      if (warehouseId) {
        const whIds = [...new Set(String(warehouseId).split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
        if (whIds.length) {
          sql += ` AND h.warehouse_id IN (${whIds.map(() => "?").join(",")})`;
          binds.push(...whIds);
        }
      }
      if (search) {
        sql += " AND (h.qr_code LIKE ? OR h.serial_number LIKE ? OR h.capex LIKE ? OR h.cooler_model LIKE ? OR h.changed_by LIKE ?)";
        const like = `%${search}%`;
        binds.push(like, like, like, like, like);
      }
      sql += " ORDER BY h.changed_at DESC LIMIT 500";

      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      return Response.json(results || []);
    }

    // API จัดการ Cooler Brand (Master List) - ดึงรายการทั้งหมด
    if (url.pathname === "/api/admin/cooler-brands" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM cooler_brands ORDER BY name").all();
      return Response.json(results || []);
    }

    // API จัดการ Cooler Brand - เพิ่ม/แก้ไข
    if (url.pathname === "/api/admin/save-cooler-brand" && request.method === "POST") {
      try {
        const { id, name } = await request.json();
        if (!name) return Response.json({ error: "ກະລຸນາປ້ອນຊື່ Cooler Brand" }, { status: 400 });

        if (id) {
          await env.DB.prepare("UPDATE cooler_brands SET name = ? WHERE id = ?").bind(name, id).run();
          return Response.json({ message: "ແກ້ໄຂ Cooler Brand ຮຽບຮ້ອຍແລ້ວ" });
        } else {
          await env.DB.prepare("INSERT INTO cooler_brands (name) VALUES (?)").bind(name).run();
          return Response.json({ message: "ເພີ່ມ Cooler Brand ໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-cooler-brand", e);
        return Response.json({ error: "Cooler Brand ນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
      }
    }

    // API จัดการ Cooler Brand - ลบ
    if (url.pathname === "/api/admin/delete-cooler-brand" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM cooler_brands WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບ Cooler Brand ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-cooler-brand", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // API จัดการ Cooler Type (Master List) - ดึงรายการทั้งหมด
    if (url.pathname === "/api/admin/cooler-types" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM cooler_types ORDER BY name").all();
      return Response.json(results || []);
    }

    // API จัดการ Cooler Type - เพิ่ม/แก้ไข
    if (url.pathname === "/api/admin/save-cooler-type" && request.method === "POST") {
      try {
        const { id, name } = await request.json();
        if (!name) return Response.json({ error: "ກະລຸນາປ້ອນຊື່ Cooler Type" }, { status: 400 });

        if (id) {
          await env.DB.prepare("UPDATE cooler_types SET name = ? WHERE id = ?").bind(name, id).run();
          return Response.json({ message: "ແກ້ໄຂ Cooler Type ຮຽບຮ້ອຍແລ້ວ" });
        } else {
          await env.DB.prepare("INSERT INTO cooler_types (name) VALUES (?)").bind(name).run();
          return Response.json({ message: "ເພີ່ມ Cooler Type ໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-cooler-type", e);
        return Response.json({ error: "Cooler Type ນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
      }
    }

    // API จัดการ Cooler Type - ลบ
    if (url.pathname === "/api/admin/delete-cooler-type" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM cooler_types WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບ Cooler Type ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-cooler-type", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // API จัดการ Cooler Model (Master List) - ดึงรายการทั้งหมด
    if (url.pathname === "/api/admin/cooler-models" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM cooler_models ORDER BY name").all();
      return Response.json(results || []);
    }

    // API จัดการ Cooler Model - เพิ่ม/แก้ไข
    if (url.pathname === "/api/admin/save-cooler-model" && request.method === "POST") {
      try {
        const { id, name } = await request.json();
        if (!name) return Response.json({ error: "ກະລຸນາປ້ອນຊື່ Model" }, { status: 400 });

        if (id) {
          await env.DB.prepare("UPDATE cooler_models SET name = ? WHERE id = ?").bind(name, id).run();
          return Response.json({ message: "ແກ້ໄຂ Model ຮຽບຮ້ອຍແລ້ວ" });
        } else {
          await env.DB.prepare("INSERT INTO cooler_models (name) VALUES (?)").bind(name).run();
          return Response.json({ message: "ເພີ່ມ Model ໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-cooler-model", e);
        return Response.json({ error: "Model ນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
      }
    }

    // API จัดการ Cooler Model - ลบ
    if (url.pathname === "/api/admin/delete-cooler-model" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM cooler_models WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບ Model ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-cooler-model", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // API จัดการ Brand ພິເສດ (ໃຊ້ສະເພາະໜ້າ "ລາຍງານຕູ້ແຊ່ Event" - ນອກເໜືອຈາກ Cooler Brand ປົກກະຕິ) - ດຶງລາຍການທັງໝົດ
    if (url.pathname === "/api/admin/special-cooler-brands" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM special_cooler_brands ORDER BY name").all();
      return Response.json(results || []);
    }

    // API จัดการ Brand ພິເສດ - ເພີ່ມ/ແກ້ໄຂ
    if (url.pathname === "/api/admin/save-special-cooler-brand" && request.method === "POST") {
      try {
        const { id, name } = await request.json();
        if (!name) return Response.json({ error: "ກະລຸນາປ້ອນຊື່ Brand ພິເສດ" }, { status: 400 });

        if (id) {
          await env.DB.prepare("UPDATE special_cooler_brands SET name = ? WHERE id = ?").bind(name, id).run();
          return Response.json({ message: "ແກ້ໄຂ Brand ພິເສດ ຮຽບຮ້ອຍແລ້ວ" });
        } else {
          await env.DB.prepare("INSERT INTO special_cooler_brands (name) VALUES (?)").bind(name).run();
          return Response.json({ message: "ເພີ່ມ Brand ພິເສດ ໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-special-cooler-brand", e);
        return Response.json({ error: "Brand ພິເສດ ນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
      }
    }

    // API จัดการ Brand ພິເສດ - ລຶບ
    if (url.pathname === "/api/admin/delete-special-cooler-brand" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM special_cooler_brands WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບ Brand ພິເສດ ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-special-cooler-brand", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // API จัดการ Doc Type (Master List) - ดึงรายการทั้งหมด
    if (url.pathname === "/api/admin/doc-types" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM doc_types ORDER BY name").all();
      return Response.json(results || []);
    }

    // API จัดการ Doc Type - เพิ่ม/แก้ไข
    if (url.pathname === "/api/admin/save-doc-type" && request.method === "POST") {
      try {
        const { id, name } = await request.json();
        if (!name) return Response.json({ error: "ກະລຸນາປ້ອນຊື່ Doc Type" }, { status: 400 });

        if (id) {
          await env.DB.prepare("UPDATE doc_types SET name = ? WHERE id = ?").bind(name, id).run();
          return Response.json({ message: "ແກ້ໄຂ Doc Type ຮຽບຮ້ອຍແລ້ວ" });
        } else {
          await env.DB.prepare("INSERT INTO doc_types (name) VALUES (?)").bind(name).run();
          return Response.json({ message: "ເພີ່ມ Doc Type ໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-doc-type", e);
        return Response.json({ error: "Doc Type ນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
      }
    }

    // API จัดการ Doc Type - ลบ
    if (url.pathname === "/api/admin/delete-doc-type" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        await env.DB.prepare("DELETE FROM doc_types WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບ Doc Type ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-doc-type", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 0. ຂໍ OTP ຢືນຢັນອີເມວ ກ່ອນລົງທະບຽນ (ເປີດສາທາລະນະ). ສົ່ງ OTP 6 ໂຕ (ໃຊ້ຄັ້ງດຽວ, 10 ນາທີ) ໄປອີເມວທີ່ຈະໃຊ້ສະໝັກ
    // ຈຳກັດ: 10 ຄັ້ງ/15 ນາທີ ຕໍ່ IP, 3 ຄັ້ງ/ຊົ່ວໂມງ ຕໍ່ອີເມວ, ເວັ້ນຢ່າງໜ້ອຍ 60 ວິນາທີ ລະຫວ່າງການຂໍ (ກັນສະແປມ ແລະ ກັນໃຊ້ໂຄຕາ Gmail ໝົດ)
    if (url.pathname === "/api/register/send-otp" && request.method === "POST") {
      try {
        const body = await request.json();
        const cleanEmail = String(body.email || "").trim().toLowerCase();
        if (!cleanEmail) return Response.json({ error: "ກະລຸນາປ້ອນອີເມວກ່ອນ" }, { status: 400 });
        if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
          return Response.json({ error: "ຮູບແບບອີເມວບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        }
        const takenEmail = await env.DB.prepare("SELECT id FROM users WHERE UPPER(email) = UPPER(?)").bind(cleanEmail).first();
        if (takenEmail) {
          return Response.json({ error: "ອີເມວນີ້ຖືກໃຊ້ງານໃນລະບົບແລ້ວ" }, { status: 400 });
        }

        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const byIp = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM register_otps WHERE ip = ? AND created_at > datetime('now', '-15 minutes')"
        ).bind(ip).first();
        if ((byIp?.c || 0) >= 10) {
          return Response.json({ error: "ລອງຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າ 15 ນາທີ ແລ້ວລອງໃໝ່" }, { status: 429 });
        }
        const byEmail = await env.DB.prepare(
          "SELECT COUNT(*) AS c, MAX(created_at) AS last_at, (MAX(created_at) > datetime('now', '-60 seconds')) AS too_soon FROM register_otps WHERE email = ? AND created_at > datetime('now', '-1 hour')"
        ).bind(cleanEmail).first();
        if (byEmail?.too_soon) {
          return Response.json({ error: "ກະລຸນາລໍຖ້າ 1 ນາທີ ກ່ອນຂໍ OTP ໃໝ່" }, { status: 429 });
        }
        if ((byEmail?.c || 0) >= 3) {
          return Response.json({ error: "ຂໍ OTP ຫຼາຍເກີນໄປສຳລັບອີເມວນີ້ ກະລຸນາລໍຖ້າ 1 ຊົ່ວໂມງ ແລ້ວລອງໃໝ່" }, { status: 429 });
        }

        const code = generateResetCode();
        const codeHash = await hashPassword(code);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM register_otps WHERE created_at < datetime('now', '-1 day')"),
          env.DB.prepare("UPDATE register_otps SET status = 'cancelled', code_hash = NULL WHERE email = ? AND status = 'pending'").bind(cleanEmail),
          env.DB.prepare(
            "INSERT INTO register_otps (email, ip, code_hash, status, attempts, expires_at) VALUES (?, ?, ?, 'pending', 0, datetime('now', '+10 minutes'))"
          ).bind(cleanEmail, ip, codeHash),
        ]);
        try {
          await sendEmail(env, {
            to: cleanEmail,
            subject: "ລະຫັດ OTP ຢືນຢັນອີເມວ ສຳລັບລົງທະບຽນ",
            text: `ລະຫັດ OTP ຂອງທ່ານ: ${code}\n\nໃຊ້ໄດ້ 10 ນາທີ ແລະ ໃຊ້ໄດ້ຄັ້ງດຽວ.\nຖ້າທ່ານບໍ່ໄດ້ສະໝັກ ໃຫ້ບໍ່ຕ້ອງສົນໃຈອີເມວນີ້ ແລະ ຫ້າມບອກລະຫັດນີ້ກັບໃຜ.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:420px">
              <p>ລະຫັດ OTP ສຳລັບຢືນຢັນອີເມວຕອນລົງທະບຽນ:</p>
              <p style="font-size:28px;font-weight:bold;letter-spacing:8px;background:#f3f4f6;padding:12px 16px;border-radius:8px;text-align:center">${code}</p>
              <p>ໃຊ້ໄດ້ <b>10 ນາທີ</b> ແລະ ໃຊ້ໄດ້ຄັ້ງດຽວ.</p>
              <p style="color:#6b7280;font-size:13px">ຖ້າທ່ານບໍ່ໄດ້ສະໝັກ ໃຫ້ບໍ່ຕ້ອງສົນໃຈອີເມວນີ້ ແລະ ຫ້າມບອກລະຫັດນີ້ກັບໃຜ.</p></div>`,
          });
        } catch (mailErr) {
          console.error("/api/register/send-otp mail", mailErr);
          await env.DB.prepare("UPDATE register_otps SET status = 'cancelled', code_hash = NULL WHERE email = ? AND status = 'pending'").bind(cleanEmail).run();
          const notConfigured = String(mailErr && mailErr.message || "").startsWith("MAIL_NOT_CONFIGURED");
          return Response.json({
            error: notConfigured
              ? "ລະບົບສົ່ງອີເມວຍັງບໍ່ໄດ້ຕັ້ງຄ່າ ກະລຸນາແຈ້ງ Admin"
              : "ບໍ່ສາມາດສົ່ງອີເມວໄດ້ ກະລຸນາກວດສອບອີເມວ ແລ້ວລອງໃໝ່",
          }, { status: 502 });
        }
        return Response.json({ message: "ສົ່ງລະຫັດ OTP ໄປທີ່ອີເມວແລ້ວ (ໃຊ້ໄດ້ 10 ນາທີ ແລະ ໃຊ້ໄດ້ຄັ້ງດຽວ) ກະລຸນາກວດກ່ອງຈົດໝາຍ ແລະ ກ່ອງ Spam" });
      } catch (e) {
        console.error("/api/register/send-otp", e);
        return Response.json({ error: "ບໍ່ສາມາດສົ່ງ OTP ໄດ້ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // 1. Register API
    if (url.pathname === "/api/register" && request.method === "POST") {
      try {
        const body = await request.json();
        const cleanEmail = String(body.email || "").trim().toLowerCase();
        const password = typeof body.password === "string" ? body.password : "";
        const cleanCode = String(body.mde_code || "").trim();
        if (!cleanEmail || !password || !cleanCode) {
          return Response.json({ error: "ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບຖ້ວນ" }, { status: 400 });
        }
        if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
          return Response.json({ error: "ຮູບແບບອີເມວບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        }
        if (password.length < 8 || password.length > 200) {
          return Response.json({ error: "ລະຫັດຜ່ານຕ້ອງຍາວຢ່າງໜ້ອຍ 8 ຕົວອັກສອນ" }, { status: 400 });
        }

        // MDE Code ຕ້ອງມີຢູ່ໃນ Master List ແລະ Team ຖືກກຳນົດຈາກ Master List ເທົ່ານັ້ນ (ບໍ່ເຊື່ອຄ່າ team ທີ່ browser ສົ່ງມາ)
        // ເພາະ Team ຖືກໃຊ້ກຳນົດງົບປະມານທີ່ເບີກໄດ້ -> ຫ້າມໃຫ້ຜູ້ສະໝັກເລືອກ Team ຂອງຄົນອື່ນເອງ
        const mde = await env.DB.prepare(
          "SELECT mde_code, team FROM mde_list WHERE UPPER(mde_code) = UPPER(?)"
        ).bind(cleanCode).first();
        if (!mde) {
          return Response.json({ error: "ບໍ່ພົບ MDE Code ນີ້ໃນລະບົບ" }, { status: 400 });
        }

        // ກວດຊ້ຳແບບບໍ່ແຍກຕົວພິມໃຫຍ່/ນ້ອຍ (UNIQUE ຂອງ SQLite ແຍກຕົວພິມ ຈຶ່ງກັນ MDE001 / mde001 ບໍ່ໄດ້ເອງ)
        const takenMde = await env.DB.prepare("SELECT id FROM users WHERE UPPER(mde_code) = UPPER(?)").bind(mde.mde_code).first();
        if (takenMde) {
          return Response.json({ error: "MDE Code ນີ້ມີຜູ້ໃຊ້ງານສະໝັກໄປແລ້ວ ບໍ່ສາມາດສະໝັກຊ້ຳໄດ້" }, { status: 400 });
        }
        const takenEmail = await env.DB.prepare("SELECT id FROM users WHERE UPPER(email) = UPPER(?)").bind(cleanEmail).first();
        if (takenEmail) {
          return Response.json({ error: "ອີເມວນີ້ຖືກໃຊ້ງານໃນລະບົບແລ້ວ" }, { status: 400 });
        }

        // ຢືນຢັນອີເມວດ້ວຍ OTP (ຂໍຜ່ານ /api/register/send-otp): ໃຊ້ໄດ້ຄັ້ງດຽວ + ໝົດອາຍຸ 10 ນາທີ + ປ້ອນຜິດ 5 ຄັ້ງຖືກຍົກເລີກ
        const otp = normalizeResetCode(body.otp);
        if (!otp) {
          return Response.json({ error: "ກະລຸນາປ້ອນລະຫັດ OTP 6 ໂຕ ທີ່ໄດ້ຮັບທາງອີເມວ" }, { status: 400 });
        }
        const OTP_BAD = "ລະຫັດ OTP ບໍ່ຖືກຕ້ອງ ຫຼື ໝົດອາຍຸແລ້ວ ກະລຸນາກົດຂໍ OTP ໃໝ່";
        const otpRow = await env.DB.prepare(
          `SELECT id, code_hash, attempts, (expires_at > datetime('now')) AS valid
           FROM register_otps WHERE email = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
        ).bind(cleanEmail).first();
        if (!otpRow || !otpRow.valid || !otpRow.code_hash) {
          return Response.json({ error: OTP_BAD }, { status: 400 });
        }
        if (otpRow.attempts >= 5) {
          await env.DB.prepare("UPDATE register_otps SET status = 'cancelled', code_hash = NULL WHERE id = ?").bind(otpRow.id).run();
          return Response.json({ error: OTP_BAD }, { status: 400 });
        }
        const otpCheck = await verifyPassword(otp, otpRow.code_hash);
        if (!otpCheck.ok) {
          await env.DB.prepare(
            "UPDATE register_otps SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 5 THEN 'cancelled' ELSE status END WHERE id = ?"
          ).bind(otpRow.id).run();
          return Response.json({ error: OTP_BAD }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);
        // ສ້າງບັນຊີ + ໝາຍ OTP ວ່າໃຊ້ແລ້ວ ໃນ batch ດຽວ (atomic) — ຖ້າສ້າງບັນຊີບໍ່ສຳເລັດ OTP ກໍບໍ່ຖືກໃຊ້
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO users (email, password_hash, team, mde_code, role, status) VALUES (?, ?, ?, ?, 'user', 'pending')"
          ).bind(cleanEmail, passwordHash, mde.team, mde.mde_code),
          env.DB.prepare("UPDATE register_otps SET status = 'used', code_hash = NULL WHERE id = ?").bind(otpRow.id),
        ]);

        // ແຈ້ງເຕືອນ admin ວ່າມີຜູ້ສະໝັກໃໝ່ລໍຖ້າອະນຸມັດ (ບໍ່ throw error ເພື່ອບໍ່ໃຫ້ການລົງທະບຽນລົ້ມເຫລວ)
        runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin"], {
          title: "ມີຜູ້ສະໝັກໃໝ່ລໍຖ້າອະນຸມັດ",
          body: `${cleanEmail}\nMDE: ${mde.mde_code}${mde.team ? ' | ທີມ: ' + mde.team : ''}`,
          url: "dashboard",
        }));
        return Response.json({ message: "ລົງທະບຽນສຳເລັດ! ກະລຸນາລໍຖ້າ Admin ອະນຸມັດ" });
      } catch (e) {
        console.error("/api/register", e);
        const msg = e.message || "";
        if (msg.includes("users.mde_code")) {
          return Response.json({ error: "MDE Code ນີ້ມີຜູ້ໃຊ້ງານສະໝັກໄປແລ້ວ ບໍ່ສາມາດສະໝັກຊ້ຳໄດ້" }, { status: 400 });
        }
        if (msg.includes("users.email")) {
          return Response.json({ error: "ອີເມວນີ້ຖືກໃຊ້ງານໃນລະບົບແລ້ວ" }, { status: 400 });
        }
        return Response.json({ error: "ບໍ່ສາມາດລົງທະບຽນໄດ້ ກະລຸນາກວດສອບຂໍ້ມູນ" }, { status: 400 });
      }
    }

    // 2. Login API
    if (url.pathname === "/api/login" && request.method === "POST") {
      const body = await request.json();
      const password = body.password;
      // ຮັບໄດ້ທັງ MDE Code ແລະ Email: ຖ້າ frontend ສົ່ງມາເປັນ mde_code (ຂອງເດີມ) ຫຼື identifier (ໃໝ່) ກໍໃຊ້ໄດ້
      const identifier = ((body.identifier ?? body.mde_code) || "").trim();
      // ดึงมาแค่ identifier ก่อน (เทียบรหัสผ่านที่ hash แล้วในโค้ด ไม่ใช่ใน SQL WHERE)
      // ใช้ UPPER() เทียบทั้ง mde_code และ email เพื่อให้ login ได้ไม่ว่าจะพิมพ์ตัวใหญ่/ตัวเล็กแบบไหนก็ตาม
      const user = await env.DB.prepare(
        `SELECT u.*, m.mde_name FROM users u LEFT JOIN mde_list m ON m.mde_code = u.mde_code
         WHERE UPPER(u.mde_code) = UPPER(?) OR UPPER(u.email) = UPPER(?)`
      ).bind(identifier, identifier).first();
      if (!user) return Response.json({ error: "MDE Code/ອີເມວ ຫຼືລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ" }, { status: 401 });

      const { ok, needsRehash } = await verifyPassword(password, user.password_hash);
      if (!ok) return Response.json({ error: "MDE Code/ອີເມວ ຫຼືລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ" }, { status: 401 });

      // Lazy migration: ถ้ารหัสผ่านนี้ยังเป็นรูปแบบเก่า (plaintext) ให้ hash แล้วบันทึกทับทันที
      if (needsRehash) {
        const newHash = await hashPassword(password);
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, user.id).run();
        user.password_hash = newHash;
      }

      if (user.status === 'pending') return Response.json({ error: "ກຳລັງລໍຖ້າ Admin ອະນຸມັດ" }, { status: 403 });
      if (user.status === 'rejected') return Response.json({ error: "ຖືກປະຕິເສດການໃຊ້ງານ" }, { status: 403 });

      // ໂໝດປິດລະບົບ: ບໍ່ອະນຸຍາດ login ຖ້າບໍ່ແມ່ນ admin / ADMIN TEAM
      if (maint && maint.enabled && !canBypassMaintenance(user)) return maintenanceResponse(maint);

      // ບັນທຶກ Log ການເຂົ້າສູ່ລະບົບ (ສຳລັບ Admin ກວດເບິ່ງພາຍຫຼັງ) - ບໍ່ໃຫ້ error ຕົງນີ້ເຮັດໃຫ້ login ລົ້ມເຫລວ
      try {
        await env.DB.prepare(
          `INSERT INTO login_logs (user_id, email, mde_code, team, role) VALUES (?, ?, ?, ?, ?)`
        ).bind(user.id, user.email, user.mde_code, user.team, user.role).run();
      } catch (logErr) { /* ไม่ต้องทำอะไร ปล่อยให้ login สำเร็จตามปกติ */ }

      // ອອກ token ໃຫ້ browser ເກັບໄວ້ ແລ້ວແນບມາທຸກຄັ້ງທີ່ເອີ້ນ API (Authorization: Bearer ...)
      let token;
      try {
        token = await createSessionToken(env, user);
      } catch (e) {
        console.error("/api/login", e);
        if (e.message === "SESSION_SECRET_MISSING") {
          return Response.json({
            error: "ລະບົບຍັງບໍ່ໄດ້ຕັ້ງຄ່າ SESSION_SECRET (ຮັນ: npx wrangler secret put SESSION_SECRET)"
          }, { status: 500 });
        }
        throw e;
      }

      delete user.password_hash; // ไม่ส่ง hash กลับไปให้ frontend
      return Response.json({ message: "ເຂົ້າສູ່ລະບົບສຳເລັດ!", user, token });
    }

    // 2-m. ສະຖານະໂໝດປິດລະບົບ (ສາທາລະນະ): ໜ້າ login ແລະ frontend ໃຊ້ສະແດງປ້າຍ/ໜ້າ "ກຳລັງປັບປຸງ"
    if (url.pathname === "/api/maintenance-status" && request.method === "GET") {
      const m = await getMaintenance(env);
      return Response.json(
        { enabled: m.enabled, message: m.enabled ? m.message : "" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // 2-m1. Admin ເບິ່ງສະຖານະໂໝດປິດລະບົບ (/api/admin/* = admin ເທົ່ານັ້ນ ໂດຍອັດຕະໂນມັດ)
    if (url.pathname === "/api/admin/maintenance" && request.method === "GET") {
      const m = await getMaintenance(env, true);
      return Response.json({ enabled: m.enabled, message: m.message, updated_at: m.updated_at });
    }

    // 2-m2. Admin ເປີດ/ປິດໂໝດປິດລະບົບ + ຕັ້ງຂໍ້ຄວາມທີ່ສະແດງໃຫ້ຜູ້ໃຊ້
    if (url.pathname === "/api/admin/maintenance" && request.method === "POST") {
      try {
        const body = await request.json();
        const enabled = body.enabled === true || body.enabled === 1 || body.enabled === "1";
        const message = String(body.message == null ? "" : body.message).trim().slice(0, 300) || MAINTENANCE_DEFAULT_MESSAGE;
        const upsert = (key, value) => env.DB.prepare(
          `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
        ).bind(key, value, session.id);
        await env.DB.batch([upsert("maintenance_enabled", enabled ? "1" : "0"), upsert("maintenance_message", message)]);
        const m = await getMaintenance(env, true);
        return Response.json({
          message: enabled ? "ເປີດໂໝດປິດລະບົບແລ້ວ (ສະເພາະ Admin ແລະ ADMIN TEAM ເຂົ້າໄດ້)" : "ປິດໂໝດປິດລະບົບແລ້ວ ທຸກຄົນໃຊ້ງານໄດ້ປົກກະຕິ",
          enabled: m.enabled,
          maintenance_message: m.message,
          updated_at: m.updated_at,
        });
      } catch (e) {
        console.error("/api/admin/maintenance", e);
        return Response.json({ error: "ບັນທຶກບໍ່ໄດ້ - ກວດວ່າຮັນ migration_add_maintenance_mode.sql ແລ້ວ" }, { status: 500 });
      }
    }

    // 2a. ລືມລະຫັດຜ່ານ (ວິທີດຽວ): OTP ທາງອີເມວ (Gmail API). user ປ້ອນ MDE Code ຫຼື ອີເມວ -> ລະບົບສ້າງ OTP ຕົວເລກ 6 ໂຕ (ໃຊ້ຄັ້ງດຽວ, 10 ນາທີ)
    // ສົ່ງໄປອີເມວທີ່ລົງທະບຽນ -> user ເອົາ OTP ໄປຕັ້ງລະຫັດໃໝ່ທີ່ /api/reset-password-with-code (ປ້ອນຜິດ 5 ຄັ້ງ OTP ຖືກຍົກເລີກ)
    // ຕອບຂໍ້ຄວາມດຽວກັນສະເໝີ ບໍ່ວ່າຈະພົບບັນຊີຫຼືບໍ່ (ກັນເດົາວ່າມີອີເມວ/MDE Code ນີ້ໃນລະບົບ)
    if (url.pathname === "/api/forgot-password/email" && request.method === "POST") {
      const MSG = "ຖ້າບັນຊີນີ້ມີໃນລະບົບ ເຮົາໄດ້ສົ່ງລະຫັດ OTP ໄປທີ່ອີເມວທີ່ລົງທະບຽນແລ້ວ (ໃຊ້ໄດ້ 10 ນາທີ ແລະ ໃຊ້ໄດ້ຄັ້ງດຽວ)";
      try {
        const body = await request.json();
        const identifier = String(body.identifier || "").trim().slice(0, 254);
        if (!identifier) return Response.json({ error: "ກະລຸນາປ້ອນ MDE Code ຫຼື ອີເມວ" }, { status: 400 });

        // ຈຳກັດຕໍ່ IP: 10 ຄັ້ງ/15 ນາທີ (ຕາຕະລາງ forgot_attempts)
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const att = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM forgot_attempts WHERE ip = ? AND created_at > datetime('now', '-15 minutes')"
        ).bind(ip).first();
        if ((att?.c || 0) >= 10) {
          return Response.json({ error: "ລອງຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າ 15 ນາທີ ແລ້ວລອງໃໝ່" }, { status: 429 });
        }
        await env.DB.batch([
          env.DB.prepare("INSERT INTO forgot_attempts (ip) VALUES (?)").bind(ip),
          env.DB.prepare("DELETE FROM forgot_attempts WHERE created_at < datetime('now', '-1 day')"),
        ]);

        const user = await env.DB.prepare(
          "SELECT id, email, status FROM users WHERE UPPER(mde_code) = UPPER(?) OR UPPER(email) = UPPER(?)"
        ).bind(identifier, identifier).first();

        if (user && user.status === "approved" && user.email) {
          // ຈຳກັດ: ບໍ່ເກີນ 3 ຄັ້ງ/ຊົ່ວໂມງ/ຄົນ (ກັນສະແປມອີເມວ ແລະ ກັນໃຊ້ໂຄຕາ Gmail ໝົດ)
          const recent = await env.DB.prepare(
            "SELECT COUNT(*) AS c FROM password_reset_requests WHERE user_id = ? AND requested_at > datetime('now', '-1 hour')"
          ).bind(user.id).first();
          if ((recent?.c || 0) < 3) {
            const code = generateResetCode();
            const codeHash = await hashPassword(code);
            await env.DB.batch([
              env.DB.prepare("UPDATE password_reset_requests SET status = 'cancelled', code_hash = NULL WHERE user_id = ? AND status IN ('issued','pending')").bind(user.id),
              env.DB.prepare(
                `INSERT INTO password_reset_requests (user_id, status, code_hash, code_expires_at, issued_at, attempts)
                 VALUES (?, 'issued', ?, datetime('now', '+10 minutes'), CURRENT_TIMESTAMP, 0)`
              ).bind(user.id, codeHash),
            ]);
            const shown = code; // 6 ຕົວເລກ
            runInBackground(ctx, sendEmail(env, {
              to: user.email,
              subject: "ລະຫັດ OTP ສຳລັບຕັ້ງລະຫັດຜ່ານໃໝ່",
              text: `ລະຫັດ OTP ຂອງທ່ານ: ${shown}\n\nໃຊ້ໄດ້ 10 ນາທີ ແລະ ໃຊ້ໄດ້ຄັ້ງດຽວ.\nຖ້າທ່ານບໍ່ໄດ້ຂໍ ໃຫ້ບໍ່ຕ້ອງສົນໃຈອີເມວນີ້ ແລະ ຫ້າມບອກລະຫັດນີ້ກັບໃຜ.`,
              html: `<div style="font-family:Arial,sans-serif;max-width:420px">
                <p>ລະຫັດ OTP ສຳລັບຕັ້ງລະຫັດຜ່ານໃໝ່ຂອງທ່ານ:</p>
                <p style="font-size:28px;font-weight:bold;letter-spacing:8px;background:#f3f4f6;padding:12px 16px;border-radius:8px;text-align:center">${shown}</p>
                <p>ໃຊ້ໄດ້ <b>10 ນາທີ</b> ແລະ ໃຊ້ໄດ້ຄັ້ງດຽວ.</p>
                <p style="color:#6b7280;font-size:13px">ຖ້າທ່ານບໍ່ໄດ້ຂໍ ໃຫ້ບໍ່ຕ້ອງສົນໃຈອີເມວນີ້ ແລະ ຫ້າມບອກລະຫັດນີ້ກັບໃຜ.</p></div>`,
            }));
          }
        }
        return Response.json({ message: MSG });
      } catch (e) {
        console.error("/api/forgot-password/email", e);
        return Response.json({ error: "ບໍ່ສາມາດສົ່ງຄຳຂໍໄດ້ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // 2a-1. ຕັ້ງລະຫັດຜ່ານໃໝ່ດ້ວຍ OTP 6 ໂຕ ທີ່ໄດ້ຮັບທາງອີເມວ (ເປີດສາທາລະນະ)
    // OTP ໃຊ້ໄດ້ຄັ້ງດຽວ + ໝົດອາຍຸ 10 ນາທີ + ປ້ອນຜິດ 5 ຄັ້ງຖືກຍົກເລີກ. ປ່ຽນລະຫັດແລ້ວ token ເກົ່າທຸກອັນໃຊ້ບໍ່ໄດ້ (pv ປ່ຽນຕາມ password_hash)
    if (url.pathname === "/api/reset-password-with-code" && request.method === "POST") {
      const BAD = "ລະຫັດ OTP ບໍ່ຖືກຕ້ອງ ຫຼື ໝົດອາຍຸແລ້ວ ກະລຸນາຂໍ OTP ໃໝ່";
      try {
        const body = await request.json();
        const identifier = String(body.identifier || "").trim().slice(0, 254);
        const code = normalizeResetCode(body.code);
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
        if (!identifier || !code || !newPassword) {
          return Response.json({ error: "ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບຖ້ວນ" }, { status: 400 });
        }
        if (newPassword.length < 8 || newPassword.length > 200) {
          return Response.json({ error: "ລະຫັດຜ່ານໃໝ່ຕ້ອງຍາວຢ່າງໜ້ອຍ 8 ຕົວອັກສອນ" }, { status: 400 });
        }

        const user = await env.DB.prepare(
          "SELECT id, status FROM users WHERE UPPER(mde_code) = UPPER(?) OR UPPER(email) = UPPER(?)"
        ).bind(identifier, identifier).first();
        if (!user || user.status !== "approved") return Response.json({ error: BAD }, { status: 400 });

        const row = await env.DB.prepare(
          `SELECT id, code_hash, attempts, (code_expires_at > datetime('now')) AS valid
           FROM password_reset_requests WHERE user_id = ? AND status = 'issued' ORDER BY id DESC LIMIT 1`
        ).bind(user.id).first();
        if (!row || !row.valid || !row.code_hash) return Response.json({ error: BAD }, { status: 400 });

        if (row.attempts >= 5) {
          await env.DB.prepare("UPDATE password_reset_requests SET status = 'cancelled' WHERE id = ?").bind(row.id).run();
          return Response.json({ error: BAD }, { status: 400 });
        }

        const { ok } = await verifyPassword(code, row.code_hash);
        if (!ok) {
          await env.DB.prepare(
            "UPDATE password_reset_requests SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 5 THEN 'cancelled' ELSE status END WHERE id = ?"
          ).bind(row.id).run();
          return Response.json({ error: BAD }, { status: 400 });
        }

        const newHash = await hashPassword(newPassword);
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, user.id),
          env.DB.prepare("UPDATE password_reset_requests SET status = 'used', used_at = CURRENT_TIMESTAMP, code_hash = NULL WHERE id = ?").bind(row.id),
          // ຍົກເລີກຄຳຂໍທີ່ຍັງຄ້າງອື່ນໆ ຂອງ user ຄົນນີ້
          env.DB.prepare("UPDATE password_reset_requests SET status = 'cancelled', code_hash = NULL WHERE user_id = ? AND status IN ('pending','issued') AND id != ?").bind(user.id, row.id),
        ]);
        return Response.json({ message: "ຕັ້ງລະຫັດຜ່ານໃໝ່ສຳເລັດ! ກະລຸນາເຂົ້າສູ່ລະບົບດ້ວຍລະຫັດຜ່ານໃໝ່" });
      } catch (e) {
        console.error("/api/reset-password-with-code", e);
        return Response.json({ error: "ບໍ່ສາມາດຕັ້ງລະຫັດຜ່ານໃໝ່ໄດ້ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // 2b. Push Notification: ดึง VAPID Public Key ไปให้ browser ใช้ตอน subscribe
    if (url.pathname === "/api/push/vapid-public-key" && request.method === "GET") {
      if (!env.VAPID_PUBLIC_KEY) {
        return Response.json({ error: "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ VAPID_PUBLIC_KEY ໃນ Worker" }, { status: 500 });
      }
      return Response.json({ publicKey: env.VAPID_PUBLIC_KEY });
    }

    // 2c. Push Notification: บันทึก subscription ของอุปกรณ์ผู้ใช้ (กดเปิดใช้งานการแจ้งเตือน)
    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      try {
        const { userId, subscription, userAgent } = await request.json();
        if (!userId || !subscription || !subscription.endpoint || !subscription.keys) {
          return Response.json({ error: "ຂໍ້ມູນ Subscription ບໍ່ຄົບຖ້ວນ" }, { status: 400 });
        }
        const { endpoint, keys } = subscription;
        if (!keys.p256dh || !keys.auth) {
          return Response.json({ error: "ຂໍ້ມູນ Subscription ບໍ່ຄົບຖ້ວນ" }, { status: 400 });
        }

        // endpoint เป็น UNIQUE: ถ้ามีอยู่แล้ว (เช่น สมัครซ้ำจากอุปกรณ์เดิม) ให้ update เจ้าของ/คีย์ใหม่
        await env.DB.prepare(
          `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`
        ).bind(userId, endpoint, keys.p256dh, keys.auth, userAgent || null).run();

        return Response.json({ message: "ເປີດການແຈ້ງເຕືອນ (Push Notification) ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/push/subscribe", e);
        return Response.json({ error: "ບໍ່ສາມາດບັນທຶກການແຈ້ງເຕືອນໄດ້" }, { status: 500 });
      }
    }

    // 2d. Push Notification: ยกเลิก subscription (ปิดการแจ้งเตือนบนอุปกรณ์นี้)
    if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
      try {
        const { endpoint } = await request.json();
        if (!endpoint) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນ Subscription" }, { status: 400 });
        // ລຶບໄດ້ສະເພາະ subscription ຂອງຕົນເອງ
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
          .bind(endpoint, session.id).run();
        return Response.json({ message: "ປິດການແຈ້ງເຕືອນຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/push/unsubscribe", e);
        return Response.json({ error: "ບໍ່ສາມາດປິດການແຈ້ງເຕືອນໄດ້" }, { status: 500 });
      }
    }

    // 2e. Push Notification: ตรวจสอบว่า user นี้มีอุปกรณ์ที่เปิดแจ้งเตือนอยู่ไหม (สำหรับแสดงสถานะในหน้า Profile)
    if (url.pathname === "/api/push/status" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });
      const { results } = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM push_subscriptions WHERE user_id = ?"
      ).bind(userId).all();
      return Response.json({ subscriptionCount: (results && results[0] && results[0].cnt) || 0 });
    }

    // 2f. Push Notification: ปุ่ม "ທົດສອບການແຈ້ງເຕືອນ" ในหน้า Profile - ส่งแจ้งเตือนทดสอบไปทุกอุปกรณ์ของ user นี้
    if (url.pathname === "/api/push/test" && request.method === "POST") {
      try {
        const { userId } = await request.json();
        if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

        const { results } = await env.DB.prepare(
          "SELECT COUNT(*) AS cnt FROM push_subscriptions WHERE user_id = ?"
        ).bind(userId).all();
        const subCount = (results && results[0] && results[0].cnt) || 0;
        if (subCount === 0) {
          return Response.json({ error: "ຍັງບໍ່ໄດ້ເປີດການແຈ້ງເຕືອນສຳລັບບັນຊີນີ້" }, { status: 400 });
        }

        const result = await sendWebPushToUser(env, userId, {
          title: "ທົດສອບການແຈ້ງເຕືອນ",
          body: "ນີ້ແມ່ນຂໍ້ຄວາມທົດສອບ Push Notification ຈາກລະບົບ Asset Approval",
          url: "/",
        });

        if (result.sent === 0 && result.removed > 0 && result.failed === 0) {
          return Response.json({ error: "ອຸປະກອນ Subscription ຫມົດອາຍຸແລ້ວ ກະລຸນາເປີດການແຈ້ງເຕືອນໃໝ່" }, { status: 400 });
        }
        if (result.sent === 0 && result.failed > 0) {
          // ສະແດງສາເຫດຈິງ (ຕົວຢ່າງ: VAPID key ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ, key ບໍ່ຖືກຕ້ອງ, ຫຼື push service ປະຕິເສດ)
          const detail = (result.errors && result.errors[0]) || "ບໍ່ຮູ້ສາເຫດ";
          return Response.json({ error: `ສົ່ງແຈ້ງເຕືອນລົ້ມເຫລວ: ${detail}` }, { status: 500 });
        }
        return Response.json({ message: `ສົ່ງແຈ້ງເຕືອນທົດສອບແລ້ວ (ສຳເລັດ: ${result.sent}, ຫມົດອາຍຸ: ${result.removed}, ຜິດພາດ: ${result.failed})` });
      } catch (e) {
        console.error("/api/push/test", e);
        return Response.json({ error: `ບໍ່ສາມາດສົ່ງແຈ້ງເຕືອນທົດສອບໄດ້: ${e.message || e}` }, { status: 500 });
      }
    }

    // 2f-1. Badge counts ລວມ (ໃຊ້ສຳລັບ polling ທຸກ 60 ວິນາທີແທນການເອີ້ນ /api/assets, /api/asset-requests,
    // /api/cooler-event, /api/notifications, /api/announcements ແຍກກັນ - ອັນເກົ່າດຶງ SELECT * ທັງແຖວ
    // (ລວມ column ຮູບ base64) ມາທັງໝົດພຽງແຕ່ຢາກໄດ້ "ຈຳນວນ" ເຮັດໃຫ້ Rows Read ຂອງ D1 ສູງຜິດປົກກະຕິ.
    // ບ່ອນນີ້ໃຊ້ COUNT(*) ດ້ວຍ WHERE ດຽວກັນ ແລະ ຮ້ອງພ້ອມກັນຄັ້ງດຽວດ້ວຍ env.DB.batch (round-trip ດຽວ).
    if (url.pathname === "/api/badge-counts" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role, mde_code, team FROM users WHERE id = ?").bind(userId).first();
      if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

      const DELIVERED_STATUS = "ສຳເລັດ";
      const viewAll = canViewAll(requester.role);
      const mapPlaceholders = SHIPPING_NOTIFY_STATUSES.map(() => "?").join(",");

      const isDsmBc = requester.role === "dsm";
      const assetCountStmt = viewAll
        ? env.DB.prepare("SELECT COUNT(*) AS cnt FROM assets WHERE IFNULL(status,'') != ?").bind(DELIVERED_STATUS)
        : isDsmBc
        ? env.DB.prepare(`SELECT COUNT(*) AS cnt FROM assets WHERE ${TEAM_MDE_SQL} AND IFNULL(status,'') != ?`).bind(requester.team || "", DELIVERED_STATUS)
        : env.DB.prepare("SELECT COUNT(*) AS cnt FROM assets WHERE mde_code = ? AND IFNULL(status,'') != ?").bind(requester.mde_code, DELIVERED_STATUS);

      const mapCountStmt = viewAll
        ? env.DB.prepare(`SELECT COUNT(*) AS cnt FROM assets WHERE status IN (${mapPlaceholders}) AND latitude IS NOT NULL AND longitude IS NOT NULL`).bind(...SHIPPING_NOTIFY_STATUSES)
        : isDsmBc
        ? env.DB.prepare(`SELECT COUNT(*) AS cnt FROM assets WHERE ${TEAM_MDE_SQL} AND status IN (${mapPlaceholders}) AND latitude IS NOT NULL AND longitude IS NOT NULL`).bind(requester.team || "", ...SHIPPING_NOTIFY_STATUSES)
        : env.DB.prepare(`SELECT COUNT(*) AS cnt FROM assets WHERE mde_code = ? AND status IN (${mapPlaceholders}) AND latitude IS NOT NULL AND longitude IS NOT NULL`).bind(requester.mde_code, ...SHIPPING_NOTIFY_STATUSES);

      // ຂັ້ນ 1 (Admin ກວດ) / ຂັ້ນ 2 (ສາງອະນຸມັດ): badge ນັບສະເພາະຄຳຂໍທີ່ລໍຖ້າໃຫ້ role ນັ້ນດຳເນີນການ
      const requestCountStmt = viewAll
        ? env.DB.prepare(`SELECT COUNT(*) AS cnt FROM asset_requests WHERE status = 'pending' AND admin_checked_at IS ${isAdminLike(requester.role) ? "NULL" : "NOT NULL"}`)
        : isDsmBc
        ? env.DB.prepare("SELECT COUNT(*) AS cnt FROM asset_requests WHERE status = 'pending' AND UPPER(TRIM(mde_code)) IN (SELECT UPPER(TRIM(mde_code)) FROM mde_list WHERE team = ?)").bind(requester.team || "")
        : env.DB.prepare("SELECT COUNT(*) AS cnt FROM asset_requests WHERE user_id = ? AND status = 'pending'").bind(userId);

      const notifCountStmt = env.DB.prepare("SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0").bind(userId);

      const annCountStmt = env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM announcements a
         LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?
         WHERE a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > datetime('now')) AND r.id IS NULL`
      ).bind(userId);

      // ໃບສັນຍາຢືມທີ່ຍັງ "ຮ່າງ" (ຍັງບໍ່ໄດ້ເຊັນຮັບ) - admin/warehouse/delivery ເຫັນທັງໝົດ, MDE ເຫັນສະເພາະຂອງຕົນເອງ
      const loanDraftCountStmt = viewAll
        ? env.DB.prepare("SELECT COUNT(*) AS cnt FROM loan_contracts WHERE status != 'completed'")
        : env.DB.prepare("SELECT COUNT(*) AS cnt FROM loan_contracts WHERE UPPER(TRIM(mde_code)) = UPPER(TRIM(?)) AND status != 'completed'").bind(requester.mde_code);

      // ຄຳຂໍ Asset ທີ່ອະນຸມັດແລ້ວ ແຕ່ "ຍັງບໍ່ໄດ້ອອກໃບສັນຍາຢືມ" ຫຼື "ຍັງບໍ່ທັນເຊັນ" (ບໍ່ມີໃບທີ່ status = completed) - ໃຊ້ເປັນ badge ສີແດງຂອງເມນູ "ປະຫວັດການຂໍ Asset"
      // ເຊື່ອມຜ່ານ asset_requests.asset_id (ຕັ້ງຕອນອະນຸມັດ) - doc_type "ເກັບຄືນສາງ" ບໍ່ຕ້ອງມີໃບສັນຍາ ຈຶ່ງບໍ່ນັບ
      const historyLoanSql = `SELECT COUNT(*) AS cnt FROM asset_requests r
         WHERE r.status = 'approved' AND r.asset_id IS NOT NULL AND IFNULL(r.doc_type, '') != ?
           ${viewAll ? '' : 'AND r.mde_code = ?'}
           AND NOT EXISTS (SELECT 1 FROM loan_contracts lc WHERE lc.asset_id = r.asset_id AND lc.status = 'completed')`;
      const historyLoanCountStmt = viewAll
        ? env.DB.prepare(historyLoanSql).bind(RETURN_TO_WAREHOUSE_DOC_TYPE)
        : env.DB.prepare(historyLoanSql).bind(RETURN_TO_WAREHOUSE_DOC_TYPE, requester.mde_code);

      const stmts = [assetCountStmt, mapCountStmt, requestCountStmt, notifCountStmt, annCountStmt, loanDraftCountStmt, historyLoanCountStmt];
      // /api/cooler-event ເປັນ ROLE_STAFF (admin/warehouse/delivery) ເທົ່ານັ້ນ - ບໍ່ query ຖ້າບໍ່ມີສິດ ເພື່ອບໍ່ໃຫ້ເສຍ Rows Read ໂດຍບໍ່ຈຳເປັນ
      if (viewAll) {
        stmts.push(env.DB.prepare("SELECT COUNT(*) AS cnt FROM cooler_events WHERE returned = 0"));
      }

      const results = await env.DB.batch(stmts);
      const [assetRow, mapRow, requestRow, notifRow, annRow, loanDraftRow, historyLoanRow, coolerRow] = results;

      return Response.json({
        assetTracking: assetRow.results[0]?.cnt || 0,
        mapTracking: mapRow.results[0]?.cnt || 0,
        assetRequest: requestRow.results[0]?.cnt || 0,
        notifUnread: notifRow.results[0]?.cnt || 0,
        announcementUnread: annRow.results[0]?.cnt || 0,
        // role warehouse ບໍ່ມີສິດອອກໃບສັນຍາ -> ບໍ່ສະແດງຕົວເລກແຈ້ງເຕືອນກ່ຽວກັບໃບສັນຍາ
        loanContractDraft: requester.role === "warehouse" ? 0 : (loanDraftRow.results[0]?.cnt || 0),
        historyLoanPending: requester.role === "warehouse" ? 0 : (historyLoanRow.results[0]?.cnt || 0),
        coolerEvent: viewAll ? (coolerRow.results[0]?.cnt || 0) : 0,
      });
    }

    // 2g-1. ໜ້າແຈ້ງເຕືອນ (Notification Inbox) - ດຶງລາຍການແຈ້ງເຕືອນຂອງ user ນີ້ (ບັນທຶກໄວ້ໃນ DB ທຸກຄັ້ງທີ່ສົ່ງ push, ບໍ່ວ່າ push ຈະສົ່ງອອກໄປສຳເລັດຫຼືບໍ່)
    if (url.pathname === "/api/notifications" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const { results } = await env.DB.prepare(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200"
      ).bind(userId).all();
      const unreadRow = await env.DB.prepare(
        "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0"
      ).bind(userId).first();

      return Response.json({ notifications: results || [], unreadCount: (unreadRow && unreadRow.cnt) || 0 });
    }

    // 2g-2. ໝາຍລາຍການແຈ້ງເຕືອນອັນໜຶ່ງວ່າອ່ານແລ້ວ
    if (url.pathname === "/api/notifications/read" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

        await env.DB.prepare(
          "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?"
        ).bind(id, userId).run();
        return Response.json({ message: "ໝາຍວ່າອ່ານແລ້ວ" });
      } catch (e) {
        console.error("/api/notifications/read", e);
        return Response.json({ error: "ບໍ່ສາມາດອັບເດດຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 2g-3. ໝາຍແຈ້ງເຕືອນທັງໝົດຂອງ user ນີ້ວ່າອ່ານແລ້ວ
    if (url.pathname === "/api/notifications/read-all" && request.method === "POST") {
      try {
        const { userId } = await request.json();
        if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

        await env.DB.prepare(
          "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0"
        ).bind(userId).run();
        return Response.json({ message: "ໝາຍວ່າອ່ານໝົດແລ້ວ" });
      } catch (e) {
        console.error("/api/notifications/read-all", e);
        return Response.json({ error: "ບໍ່ສາມາດອັບເດດຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 2g-4. ລຶບແຈ້ງເຕືອນທັງໝົດຂອງ user ນີ້ (Clear All) - ລຶບຖາວອນອອກຈາກ D1
    if (url.pathname === "/api/notifications/clear" && request.method === "POST") {
      try {
        const { userId } = await request.json();
        if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

        await env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(userId).run();
        return Response.json({ message: "ລຶບແຈ້ງເຕືອນທັງໝົດຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/notifications/clear", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບແຈ້ງເຕືອນໄດ້" }, { status: 500 });
      }
    }

    // ==========================================================================
    // ປະກາດພາຍໃນບໍລິສັດ (Announcements) - Admin ປະກາດ, ພະນັກງານທຸກຄົນເຫັນ (ບໍ່ຜູກກັບ MDE)
    // ==========================================================================

    // 2h-1. ດຶງລາຍການປະກາດທີ່ຍັງ active + ບໍ່ໝົດອາຍຸ (ທຸກ role ເຫັນໄດ້) ພ້ອມ is_read/unreadCount ຂອງຄົນທີ່ login ຢູ່
    if (url.pathname === "/api/announcements" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const { results } = await env.DB.prepare(
        `SELECT a.*, CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS is_read
         FROM announcements a
         LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?
         WHERE a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
         ORDER BY a.is_pinned DESC, a.created_at DESC, a.id DESC
         LIMIT 200`
      ).bind(userId).all();
      const list = results || [];
      const unreadCount = list.filter((a) => !a.is_read).length;

      return Response.json({ announcements: list, unreadCount });
    }

    // 2h-2. ໝາຍປະກາດອັນໜຶ່ງວ່າອ່ານແລ້ວ (ສຳລັບຄົນທີ່ login ຢູ່)
    if (url.pathname === "/api/announcements/read" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

        await env.DB.prepare(
          "INSERT INTO announcement_reads (announcement_id, user_id) VALUES (?, ?) ON CONFLICT(announcement_id, user_id) DO NOTHING"
        ).bind(id, userId).run();
        return Response.json({ message: "ໝາຍວ່າອ່ານແລ້ວ" });
      } catch (e) {
        console.error("/api/announcements/read", e);
        return Response.json({ error: "ບໍ່ສາມາດອັບເດດຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 2h-3. ໝາຍປະກາດທັງໝົດ (ທີ່ຍັງ active ຢູ່ຕອນນີ້) ວ່າອ່ານແລ້ວ
    if (url.pathname === "/api/announcements/read-all" && request.method === "POST") {
      try {
        const { userId } = await request.json();
        if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

        await env.DB.prepare(
          `INSERT INTO announcement_reads (announcement_id, user_id)
           SELECT a.id, ? FROM announcements a
           WHERE a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
           ON CONFLICT(announcement_id, user_id) DO NOTHING`
        ).bind(userId).run();
        return Response.json({ message: "ໝາຍວ່າອ່ານໝົດແລ້ວ" });
      } catch (e) {
        console.error("/api/announcements/read-all", e);
        return Response.json({ error: "ບໍ່ສາມາດອັບເດດຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 2h-4. Admin: ດຶງລາຍການປະກາດທັງໝົດ (ລວມທີ່ປິດ/ໝົດອາຍຸແລ້ວ) ສຳລັບໜ້າຈັດການ
    if (url.pathname === "/api/admin/announcements" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count
         FROM announcements a ORDER BY a.is_pinned DESC, a.created_at DESC, a.id DESC`
      ).all();
      return Response.json(results || []);
    }

    // 2h-5. Admin: ເພີ່ມ/ແກ້ໄຂ ປະກາດ (ແນບຮູບປະກອບໄດ້ 1 ຮູບ: image = data URL ຮູບໃໝ່, removeImage = ລຶບຮູບເກົ່າອອກ)
    // ===================== ແຈ້ງເຕືອນພິເສດ (Special Alert) — ບັງຄັບ MDE ດຳເນີນການກ່ອນຈຶ່ງໃຊ້ເມນູອື່ນໄດ້ =====================
    // ຕາຕະລາງ: special_alerts / special_alert_acks (migration_add_special_alerts.sql)
    // rule ຂອງແຈ້ງເຕືອນ = ຫົວຂໍ້ທີ່ admin ເລືອກ (dropdown 3 ແບບ) — unsigned_loan / manual ເປັນຂອງເກົ່າ ຍັງໃຊ້ໄດ້ (ບໍ່ສະແດງໃນຟອມສ້າງໃໝ່)
    //   powerapp      = ເອກະສານຍັງບໍ່ຊັບມິດ PowerApp (assets.status = "ຍັງບໍ່ຊັບມິດ PowerApp") — ຫາຍເອງເມື່ອ MDE ຊັບມິດຄົບ
    //   unsigned_docs = ເອກະສານຄ້າງເຊັນ (ໃບສັນຍາຢືມ/ໃບເກັບຕູ້ ສະຖານະ draft = MDE ຍັງບໍ່ເຊັນ) — ຫາຍເອງເມື່ອເຊັນຄົບ
    //   dsm_pending   = ຄ້າງ DSM ເຊັນ (ສະຖານະ awaiting_dsm) — MDE ເຊັນແລ້ວ ລໍຖ້າ DSM; MDE ກົດ "ຮັບຊາບ" ໄດ້ (ຫຼື ຫາຍເອງເມື່ອ DSM ເຊັນ)
    const SA_RULES = ["powerapp", "unsigned_docs", "dsm_pending", "unsigned_loan", "manual"];
    // ຮັບຊາບໄດ້ສະເພາະ rule manual (ຂອງເກົ່າ)
    const saAckable = (a) => a.rule === "manual"; // ຫົວຂໍ້ທັງ 3 ແບບ ບໍ່ມີປຸ່ມຮັບຊາບ — ຕ້ອງດຳເນີນການຄົບຈຶ່ງຫາຍ (ບັງຄັບ)
    const SA_ACTION_VIEW = { powerapp: "asset", unsigned_docs: "loanContract:queue", unsigned_loan: "loanContract:queue", dsm_pending: "loanContract:queue", manual: "" };
    const SA_POWERAPP_STATUS = NOTIFY_PENDING_STATUSES[1];
    // ຈຳນວນລາຍການຄ້າງ ຕາມ rule ແຍກຕາມ MDE Code (key = MDE Code ຕົວພິມໃຫຍ່) — rule manual = ບໍ່ມີ (ບໍ່ອີງຂໍ້ມູນ)
    const saCountsByMde = async (rule) => {
      let sql = null;
      if (rule === "powerapp") sql = { q: "SELECT UPPER(TRIM(mde_code)) AS m, COUNT(*) AS c FROM assets WHERE status = ? AND IFNULL(TRIM(mde_code), '') != '' GROUP BY UPPER(TRIM(mde_code))", b: [SA_POWERAPP_STATUS] };
      else if (rule === "unsigned_docs") sql = { q: "SELECT m, SUM(c) AS c FROM (SELECT UPPER(TRIM(mde_code)) AS m, COUNT(*) AS c FROM loan_contracts WHERE status = 'draft' GROUP BY UPPER(TRIM(mde_code)) UNION ALL SELECT UPPER(TRIM(mde_code)) AS m, COUNT(*) AS c FROM cancel_contracts WHERE status = 'draft' GROUP BY UPPER(TRIM(mde_code))) WHERE IFNULL(m, '') != '' GROUP BY m", b: [] };
      else if (rule === "dsm_pending") sql = { q: "SELECT m, SUM(c) AS c FROM (SELECT UPPER(TRIM(mde_code)) AS m, COUNT(*) AS c FROM loan_contracts WHERE status = 'awaiting_dsm' GROUP BY UPPER(TRIM(mde_code)) UNION ALL SELECT UPPER(TRIM(mde_code)) AS m, COUNT(*) AS c FROM cancel_contracts WHERE status = 'awaiting_dsm' GROUP BY UPPER(TRIM(mde_code))) WHERE IFNULL(m, '') != '' GROUP BY m", b: [] };
      else if (rule === "unsigned_loan") sql = { q: "SELECT UPPER(TRIM(mde_code)) AS m, COUNT(*) AS c FROM loan_contracts WHERE status != 'completed' AND IFNULL(TRIM(mde_code), '') != '' GROUP BY UPPER(TRIM(mde_code))", b: [] };
      if (!sql) return new Map();
      const { results } = await env.DB.prepare(sql.q).bind(...sql.b).all();
      return new Map((results || []).map((r) => [r.m, Number(r.c) || 0]));
    };
    const SA_TARGETS = ["all", "team", "mde"];
    const saCodes = (v) => String(v || "").split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    // ແຈ້ງເຕືອນນີ້ ໃຊ້ກັບຜູ້ໃຊ້ (role user) ຄົນນີ້ບໍ?
    const saMatchesUser = (a, u) => {
      if (!u || u.role !== "user") return false;
      if (a.target_type === "team") return String(u.team || "").trim().toLowerCase() === String(a.target_value || "").trim().toLowerCase();
      if (a.target_type === "mde") return !!u.mde_code && saCodes(a.target_value).includes(String(u.mde_code).trim().toUpperCase());
      return true; // all
    };

    // ຜູ້ໃຊ້ເອີ້ນ: ແຈ້ງເຕືອນພິເສດທີ່ "ຍັງຄ້າງ" ຂອງຕົນເອງ (ຄຳນວນສົດທຸກຄັ້ງ — ເຊັນຄົບແລ້ວ = ຫາຍເອງ)
    if (url.pathname === "/api/my-special-alerts" && request.method === "GET") {
      try {
        const me = await env.DB.prepare("SELECT id, role, team, mde_code FROM users WHERE id = ?").bind(session.id).first();
        if (!me || me.role !== "user") return Response.json({ alerts: [] });
        const { results } = await env.DB.prepare(
          "SELECT * FROM special_alerts WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY id DESC LIMIT 50"
        ).all();
        const mine = (results || []).filter((a) => saMatchesUser(a, me));
        if (!mine.length) return Response.json({ alerts: [] });
        const countCache = new Map(); // rule -> Map(mde -> count) (ຄຳນວນເທື່ອດຽວຕໍ່ rule ຕໍ່ request)
        const myMde = String(me.mde_code || "").trim().toUpperCase();
        const out = [];
        for (const a of mine) {
          let pending = 0;
          if (a.rule === "manual") {
            const ack = await env.DB.prepare("SELECT 1 AS ok FROM special_alert_acks WHERE alert_id = ? AND user_id = ?").bind(a.id, me.id).first();
            pending = ack ? 0 : 1;
          } else {
            if (!countCache.has(a.rule)) countCache.set(a.rule, await saCountsByMde(a.rule));
            pending = myMde ? (countCache.get(a.rule).get(myMde) || 0) : 0;
            if (pending > 0 && saAckable(a)) {
              const ack = await env.DB.prepare("SELECT 1 AS ok FROM special_alert_acks WHERE alert_id = ? AND user_id = ?").bind(a.id, me.id).first();
              if (ack) pending = 0;
            }
          }
          if (pending > 0) out.push({ id: a.id, title: a.title, content: a.content, rule: a.rule, action_view: a.action_view || "", pending_count: pending, can_ack: saAckable(a) });
        }
        return Response.json({ alerts: out });
      } catch (e) {
        console.error("/api/my-special-alerts", e);
        return Response.json({ alerts: [] }); // ຖ້າຍັງບໍ່ໄດ້ຮັນ migration ຫຼື error -> ບໍ່ບລັອກຜູ້ໃຊ້
      }
    }

    // ຜູ້ໃຊ້ກົດ "ຮັບຊາບ" (ສະເພາະ rule = manual)
    if (url.pathname === "/api/special-alerts/ack" && request.method === "POST") {
      try {
        const { id } = await request.json();
        const a = id ? await env.DB.prepare("SELECT id, rule FROM special_alerts WHERE id = ?").bind(id).first() : null;
        if (!a) return Response.json({ error: "ບໍ່ພົບແຈ້ງເຕືອນນີ້" }, { status: 404 });
        if (!saAckable(a)) return Response.json({ error: "ແຈ້ງເຕືອນນີ້ຕ້ອງດຳເນີນການໃຫ້ສຳເລັດ ບໍ່ສາມາດກົດຮັບຊາບໄດ້" }, { status: 400 });
        await env.DB.prepare("INSERT INTO special_alert_acks (alert_id, user_id) VALUES (?, ?) ON CONFLICT(alert_id, user_id) DO NOTHING").bind(a.id, session.id).run();
        return Response.json({ message: "ບັນທຶກແລ້ວ" });
      } catch (e) {
        console.error("/api/special-alerts/ack", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // Admin: ລາຍການ + ຈຳນວນຄົນທີ່ຍັງຄ້າງ
    if (url.pathname === "/api/admin/special-alerts" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare("SELECT * FROM special_alerts ORDER BY id DESC LIMIT 200").all();
        const alerts = results || [];
        const users = (await env.DB.prepare("SELECT id, team, mde_code, role FROM users WHERE role = 'user' AND status = 'approved'").all()).results || [];
        const ackRows = (await env.DB.prepare("SELECT alert_id, user_id FROM special_alert_acks").all()).results || [];
        const acked = new Set(ackRows.map((r) => `${r.alert_id}:${r.user_id}`));
        const countCache = new Map();
        for (const a of alerts) {
          if (a.rule !== "manual" && !countCache.has(a.rule)) countCache.set(a.rule, await saCountsByMde(a.rule));
          const counts = countCache.get(a.rule) || new Map();
          const targets = users.filter((u) => saMatchesUser(a, u));
          a.target_users = targets.length;
          a.pending_users = a.rule === "manual"
            ? targets.filter((u) => !acked.has(`${a.id}:${u.id}`)).length
            : targets.filter((u) => (counts.get(String(u.mde_code || "").trim().toUpperCase()) || 0) > 0
                && !(saAckable(a) && acked.has(`${a.id}:${u.id}`))).length;
        }
        return Response.json(alerts);
      } catch (e) {
        console.error("/api/admin/special-alerts", e);
        return Response.json({ error: "ໂຫລດບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_special_alerts.sql ກະລຸນາຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // Admin: ລາຍຊື່ MDE Code ທີ່ "ຕົງເງື່ອນໄຂ" ຂອງຫົວຂໍ້ (rule) — ໃຊ້ເຕີມ dropdown "ສົ່ງຫາໃຜ" (ສະເພາະ MDE ທີ່ຍັງຄ້າງຢູ່ຈິງ)
    if (url.pathname === "/api/admin/special-alert-targets" && request.method === "GET") {
      try {
        const rule = url.searchParams.get("rule") || "";
        if (!SA_RULES.includes(rule) || rule === "manual") return Response.json({ error: "ຫົວຂໍ້ບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        const counts = await saCountsByMde(rule);
        const mdes = (await env.DB.prepare("SELECT mde_code, mde_name, team FROM mde_list").all()).results || [];
        const info = new Map(mdes.map((m) => [String(m.mde_code || "").trim().toUpperCase(), m]));
        const users = (await env.DB.prepare("SELECT mde_code FROM users WHERE role = 'user' AND status = 'approved' AND mde_code IS NOT NULL").all()).results || [];
        const hasUser = new Set(users.map((u) => String(u.mde_code).trim().toUpperCase()));
        const items = [...counts.entries()].filter(([, c]) => c > 0).map(([code, c]) => {
          const m = info.get(code) || {};
          return { mde_code: m.mde_code || code, mde_name: m.mde_name || "", team: m.team || "", count: c, has_user: hasUser.has(code) ? 1 : 0 };
        }).sort((a, b) => b.count - a.count || String(a.mde_code).localeCompare(String(b.mde_code)));
        return Response.json({ rule, items });
      } catch (e) {
        console.error("/api/admin/special-alert-targets", e);
        return Response.json({ error: "ໂຫລດລາຍຊື່ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // Admin: ສ້າງ/ແກ້ໄຂ
    if (url.pathname === "/api/admin/save-special-alert" && request.method === "POST") {
      try {
        const b = await request.json();
        const title = String(b.title || "").trim().slice(0, 200);
        const content = String(b.content || "").trim().slice(0, 2000);
        const rule = SA_RULES.includes(b.rule) ? b.rule : "unsigned_docs";
        const targetType = SA_TARGETS.includes(b.targetType) ? b.targetType : "all";
        const targetValue = targetType === "all" ? null : String(b.targetValue || "").trim().slice(0, 2000);
        if (!title) return Response.json({ error: "ກະລຸນາເລືອກຫົວຂໍ້" }, { status: 400 });
        if (!content) return Response.json({ error: "ກະລຸນາປ້ອນເນື້ອຫາ" }, { status: 400 });
        if (targetType !== "all" && !targetValue) return Response.json({ error: targetType === "team" ? "ກະລຸນາເລືອກທີມ" : "ກະລຸນາໃສ່ MDE Code ຢ່າງໜ້ອຍ 1 ລາຍການ" }, { status: 400 });
        const actionView = SA_ACTION_VIEW[rule] || "";
        const activeVal = b.isActive === false ? 0 : 1;
        const expiresVal = b.expiresAt || null;
        if (b.id) {
          const r = await env.DB.prepare(
            `UPDATE special_alerts SET title = ?, content = ?, rule = ?, target_type = ?, target_value = ?, action_view = ?, is_active = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(title, content, rule, targetType, targetValue, actionView, activeVal, expiresVal, b.id).run();
          if (!r.meta || !r.meta.changes) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຈະແກ້ໄຂ" }, { status: 404 });
          return Response.json({ message: "ແກ້ໄຂແຈ້ງເຕືອນພິເສດແລ້ວ" });
        }
        const ins = await env.DB.prepare(
          `INSERT INTO special_alerts (title, content, rule, target_type, target_value, action_view, is_active, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(title, content, rule, targetType, targetValue, actionView, activeVal, expiresVal, session.id).run();
        // ສົ່ງ Push ຫາ MDE ທີ່ກ່ຽວຂ້ອງ ແລະ ຍັງຕ້ອງດຳເນີນການ (ພື້ນຫຼັງ ບໍ່ໃຫ້ save ຊ້າ)
        if (activeVal) {
          const alertRow = { target_type: targetType, target_value: targetValue };
          runInBackground(ctx, (async () => {
            const us = (await env.DB.prepare("SELECT id, team, mde_code, role FROM users WHERE role = 'user' AND status = 'approved'").all()).results || [];
            const counts = rule === "manual" ? null : await saCountsByMde(rule);
            for (const u of us) {
              if (!saMatchesUser(alertRow, u)) continue;
              if (counts && !(counts.get(String(u.mde_code || "").trim().toUpperCase()) > 0)) continue;
              try {
                await sendWebPushToUser(env, u.id, { title: `⚠️ ແຈ້ງເຕືອນພິເສດ: ${title}`, body: content.slice(0, 180), url: actionView || "announcements" });
              } catch (pe) { /* ຂ້າມຄົນທີ່ສົ່ງບໍ່ໄດ້ */ }
            }
          })());
        }
        return Response.json({ message: "ສ້າງແຈ້ງເຕືອນພິເສດແລ້ວ", id: ins.meta && ins.meta.last_row_id });
      } catch (e) {
        console.error("/api/admin/save-special-alert", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_special_alerts.sql ກະລຸນາຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // Admin: ລຶບ
    if (url.pathname === "/api/admin/delete-special-alert" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare("DELETE FROM special_alert_acks WHERE alert_id = ?").bind(id),
          env.DB.prepare("DELETE FROM special_alerts WHERE id = ?").bind(id),
        ]);
        return Response.json({ message: "ລຶບແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-special-alert", e);
        return Response.json({ error: "ລຶບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ===== Playbook: ຂະໜາດ + ຮູບຕູ້ແຊ່ ແຕ່ລະປະເພດ =====
    // ທຸກ role ທີ່ login ແລ້ວເບິ່ງໄດ້ (GET), ສ່ວນເພີ່ມ/ແກ້ໄຂ/ລຶບ ແມ່ນ /api/admin/* (admin ເທົ່ານັ້ນ)
    if (url.pathname === "/api/playbook" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          `SELECT id, name, category, width_mm, depth_mm, height_mm, capacity_l, doors, description, image_key, sort_order
             FROM playbook_coolers ORDER BY sort_order, id`
        ).all();
        return Response.json({ items: results || [] });
      } catch (e) {
        console.error("/api/playbook", e);
        return Response.json({ error: "ໂຫລດຂໍ້ມູນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/save-playbook-item" && request.method === "POST") {
      let newImageKey = null;
      try {
        const b = await request.json();
        const name = String(b.name || "").trim().slice(0, 120);
        if (!name) return Response.json({ error: "ກະລຸນາປ້ອນຊື່ປະເພດຕູ້" }, { status: 400 });
        const num = (v) => {
          if (v === null || v === undefined || String(v).trim() === "") return null;
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n) : NaN;
        };
        const w = num(b.width_mm), d = num(b.depth_mm), h = num(b.height_mm), cap = num(b.capacity_l), doors = num(b.doors);
        if ([w, d, h, cap, doors].some((x) => Number.isNaN(x))) {
          return Response.json({ error: "ຂະໜາດ/ຄວາມຈຸ/ຈຳນວນປະຕູ ຕ້ອງເປັນຕົວເລກ" }, { status: 400 });
        }
        const category = String(b.category || "").trim().slice(0, 80) || null;
        const description = String(b.description || "").trim().slice(0, 2000) || null;
        const sortOrder = num(b.sort_order) || 0;

        if (b.image) {
          [newImageKey] = await savePhotosToR2(env, [[b.image, `playbook/${Date.now()}-${crypto.randomUUID()}.jpg`]]);
        }

        if (b.id) {
          const old = await env.DB.prepare("SELECT image_key FROM playbook_coolers WHERE id = ?").bind(b.id).first();
          if (!old) {
            await deleteR2Photos(env, [newImageKey]);
            return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການແກ້ໄຂ" }, { status: 404 });
          }
          const oldKey = old.image_key || null;
          const imageVal = newImageKey ? newImageKey : (b.removeImage ? null : oldKey);
          await env.DB.prepare(
            `UPDATE playbook_coolers SET name = ?, category = ?, width_mm = ?, depth_mm = ?, height_mm = ?, capacity_l = ?, doors = ?,
                    description = ?, image_key = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(name, category, w, d, h, cap, doors, description, imageVal, sortOrder, b.id).run();
          if (oldKey && imageVal !== oldKey) await deleteR2Photos(env, [oldKey]);
          return Response.json({ message: "ແກ້ໄຂຂໍ້ມູນ Playbook ຮຽບຮ້ອຍແລ້ວ" });
        }
        await env.DB.prepare(
          `INSERT INTO playbook_coolers (name, category, width_mm, depth_mm, height_mm, capacity_l, doors, description, image_key, sort_order, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(name, category, w, d, h, cap, doors, description, newImageKey, sortOrder, session ? session.id : null).run();
        return Response.json({ message: "ເພີ່ມຂໍ້ມູນ Playbook ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        await deleteR2Photos(env, [newImageKey]);
        const pe = photoErrorResponse(e);
        if (pe) return pe;
        console.error("/api/admin/save-playbook-item", e);
        return Response.json({ error: "ບັນທຶກບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/delete-playbook-item" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        const old = await env.DB.prepare("SELECT image_key FROM playbook_coolers WHERE id = ?").bind(id).first();
        if (!old) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 404 });
        await env.DB.prepare("DELETE FROM playbook_coolers WHERE id = ?").bind(id).run();
        await deleteR2Photos(env, [old.image_key]);
        return Response.json({ message: "ລຶບຂໍ້ມູນ Playbook ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-playbook-item", e);
        return Response.json({ error: "ລຶບບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/admin/save-announcement" && request.method === "POST") {
      let newImageKey = null;
      try {
        const { id, title, content, isPinned, isActive, alwaysShow, expiresAt, userId, image, removeImage } = await request.json();
        if (!title || !title.trim()) return Response.json({ error: "ກະລຸນາປ້ອນຫົວຂໍ້ປະກາດ" }, { status: 400 });
        if (!content || !content.trim()) return Response.json({ error: "ກະລຸນາປ້ອນເນື້ອຫາປະກາດ" }, { status: 400 });

        const pinnedVal = isPinned ? 1 : 0;
        const activeVal = isActive === false ? 0 : 1;
        const alwaysShowVal = alwaysShow ? 1 : 0;
        const expiresVal = expiresAt || null;

        // ອັບໂຫລດຮູບຂຶ້ນ R2 ກ່ອນ (ກວດ JPEG/PNG/WebP ≤ 5MB ຈາກ magic bytes); ຖ້າບັນທຶກ D1 ລົ້ມ ຈະລຶບຮູບທີ່ອັບແລ້ວທິ້ງ
        if (image) {
          [newImageKey] = await savePhotosToR2(env, [[image, `announcement/${Date.now()}-${crypto.randomUUID()}.jpg`]]);
        }

        if (id) {
          const old = await env.DB.prepare("SELECT image_key FROM announcements WHERE id = ?").bind(id).first();
          if (!old) {
            await deleteR2Photos(env, [newImageKey]);
            return Response.json({ error: "ບໍ່ພົບປະກາດທີ່ຕ້ອງການແກ້ໄຂ" }, { status: 404 });
          }
          const oldKey = old.image_key || null;
          const imageVal = newImageKey ? newImageKey : (removeImage ? null : oldKey);

          await env.DB.prepare(
            `UPDATE announcements SET title = ?, content = ?, is_pinned = ?, is_active = ?, always_show = ?, expires_at = ?, image_key = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          ).bind(title.trim(), content.trim(), pinnedVal, activeVal, alwaysShowVal, expiresVal, imageVal, id).run();
          if (oldKey && imageVal !== oldKey) await deleteR2Photos(env, [oldKey]); // ຮູບເກົ່າຖືກແທນ/ລຶບ
          return Response.json({ message: "ແກ້ໄຂປະກາດຮຽບຮ້ອຍແລ້ວ" });
        } else {
          // ກັນກົດຊ້ຳ/ສົ່ງຊ້ຳ: INSERT ແບບ atomic (ຄຳສັ່ງດຽວ) — ຖ້າປະກາດຫົວຂໍ້+ເນື້ອຫາດຽວກັນຈາກຄົນດຽວກັນ ຖືກບັນທຶກພາຍໃນ 30 ວິນາທີ ຈະບໍ່ສ້າງຊ້ຳ ແລະ ບໍ່ສົ່ງ Push ຊ້ຳ
          const annIns = await env.DB.prepare(
            `INSERT INTO announcements (title, content, is_pinned, is_active, always_show, expires_at, image_key, created_by)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?
              WHERE NOT EXISTS (
                SELECT 1 FROM announcements
                 WHERE title = ? AND content = ? AND IFNULL(created_by, 0) = IFNULL(?, 0)
                   AND created_at >= datetime('now', '-30 seconds'))`
          ).bind(title.trim(), content.trim(), pinnedVal, activeVal, alwaysShowVal, expiresVal, newImageKey, userId || null,
            title.trim(), content.trim(), userId || null).run();
          if (!annIns.meta || !annIns.meta.changes) {
            if (newImageKey) await deleteR2Photos(env, [newImageKey]); // ຮູບທີ່ອັບໄວ້ເພື່ອລາຍການຊ້ຳ -> ລຶບທິ້ງ
            return Response.json({ message: "ປະກາດຂ່າວໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
          }
          // ປະກາດໃໝ່ (ບໍ່ແມ່ນການແກ້ໄຂ) ແລະ ຕັ້ງໃຫ້ສະແດງຢູ່ -> ສົ່ງ Push ຫາທຸກຄົນ (ທຸກ role) ຢູ່ພື້ນຫຼັງ ບໍ່ໃຫ້ save ຊ້າ
          if (activeVal) {
            runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin", "user", "warehouse", "delivery"], {
              title: `ປະກາດ: ${title.trim()}`,
              body: content.trim().slice(0, 180),
              url: "announcements",
            }));
          }
          return Response.json({ message: "ປະກາດຂ່າວໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-announcement", e);
        if (newImageKey) await deleteR2Photos(env, [newImageKey]);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດບັນທຶກປະກາດໄດ້" }, { status: 500 });
      }
    }

    // 2h-6. Admin: ລຶບປະກາດ (ລຶບ read-status ທີ່ພົວພັນນຳ ເພື່ອບໍ່ໃຫ້ຄ້າງເປັນ orphan)
    if (url.pathname === "/api/admin/delete-announcement" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });
        const annRow = await env.DB.prepare("SELECT image_key FROM announcements WHERE id = ?").bind(id).first();
        await env.DB.batch([
          env.DB.prepare("DELETE FROM announcement_reads WHERE announcement_id = ?").bind(id),
          env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id),
        ]);
        if (annRow && annRow.image_key) await deleteR2Photos(env, [annRow.image_key]);
        return Response.json({ message: "ລຶບປະກາດຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-announcement", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 2g. Admin: ກົດທົດສອບ "ແຈ້ງເຕືອນອັດຕະໂນມັດ" (ໂດຍປົກກະຕິຈະຮັນເອງທຸກເຊົ້າຜ່ານ Cron Trigger - ເບິ່ງ scheduled() ລຸ່ມສຸດ)
    if (url.pathname === "/api/admin/run-notification-check" && request.method === "POST") {
      try {
        const { userId } = await request.json();
        const requester = userId ? await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first() : null;
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });
        }
        const result = await runAutomatedNotificationChecks(env);
        return Response.json(result);
      } catch (e) {
        console.error("/api/admin/run-notification-check", e);
        return Response.json({ error: `ກວດແຈ້ງເຕືອນລົ້ມເຫລວ: ${e.message || e}` }, { status: 500 });
      }
    }

    // 3. Admin Users API (ดึงรายชื่อผู้ใช้ทั้งหมด)
    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, email, team, mde_code, role, status, created_at FROM users ORDER BY id DESC"
      ).all();
      return Response.json(results || []);
    }

    // 3a. App Ping: ແອັບສົ່ງມາເປັນໄລຍະ (ຕອນເປີດແອັບ / ທຸກໆ ~5 ນາທີ ທີ່ເປີດຢູ່) ເພື່ອບັນທຶກ "ໃຊ້ງານລ້າສຸດ", ສະຖານະຕິດຕັ້ງແອັບ ແລະ ສິດ Notification
    // ໃຊ້ຕົວຕົນຈາກ token (session.id) ເທົ່ານັ້ນ. UPDATE ມີເງື່ອນໄຂເພື່ອບໍ່ໃຫ້ຂຽນ DB ຖີ່ເກີນຈຳເປັນ (ຂຽນເມື່ອຜ່ານ 4 ນາທີ ຫຼື ຂໍ້ມູນປ່ຽນ)
    if (url.pathname === "/api/app-ping" && request.method === "POST") {
      try {
        let body = {};
        try { body = await request.json(); } catch (_) { /* ບໍ່ມີ body ກໍໄດ້ */ }
        const standalone = body.standalone ? 1 : 0;
        const installed = (body.installed || body.standalone) ? 1 : 0;
        const perm = ["granted", "denied", "default", "unsupported"].includes(body.notif_permission) ? body.notif_permission : null;
        const platform = ["android", "ios", "desktop"].includes(body.platform) ? body.platform : null;
        const mode = standalone ? "app" : "browser";
        await env.DB.prepare(
          `UPDATE users SET
             last_active_at = CURRENT_TIMESTAMP,
             last_mode = ?,
             last_platform = COALESCE(?, last_platform),
             notif_permission = COALESCE(?, notif_permission),
             app_installed = CASE WHEN ? = 1 THEN 1 ELSE IFNULL(app_installed, 0) END,
             app_installed_at = CASE WHEN ? = 1 AND app_installed_at IS NULL THEN CURRENT_TIMESTAMP ELSE app_installed_at END
           WHERE id = ? AND (
             last_active_at IS NULL OR last_active_at <= datetime('now', '-4 minutes')
             OR IFNULL(last_mode, '') != ?
             OR (? IS NOT NULL AND IFNULL(notif_permission, '') != ?)
             OR (? = 1 AND IFNULL(app_installed, 0) = 0)
           )`
        ).bind(mode, platform, perm, installed, installed, session.id, mode, perm, perm, installed).run();
        return Response.json({ ok: true });
      } catch (e) {
        console.error("/api/app-ping", e);
        return Response.json({ ok: false }, { status: 500 });
      }
    }

    // 3a-2. Admin: ສະຖານະການໃຊ້ງານຂອງ user ທຸກຄົນ (ເປີດແຈ້ງເຕືອນ / ຕິດຕັ້ງແອັບ / ໃຊ້ງານລ້າສຸດ)
    // /api/admin/* ຖືກຈຳກັດສະເພາະ admin ໂດຍດ່ານກວດສິດດ້ານເທິງແລ້ວ
    if (url.pathname === "/api/admin/user-app-status" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          `SELECT u.id, u.email, u.team, u.mde_code, u.role, m.mde_name AS mde_name,
             u.last_active_at, u.last_mode, u.last_platform, u.app_installed, u.app_installed_at, u.notif_permission,
             (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.user_id = u.id) AS push_devices,
             (SELECT MAX(l.logged_in_at) FROM login_logs l WHERE l.user_id = u.id) AS last_login_at
           FROM users u
           LEFT JOIN mde_list m ON m.mde_code = u.mde_code
           WHERE u.status = 'approved'
           ORDER BY u.id DESC`
        ).all();
        return Response.json(results || []);
      } catch (e) {
        console.error("/api/admin/user-app-status", e);
        return Response.json({ error: `ໂຫລດຂໍ້ມູນບໍ່ສຳເລັດ: ${e.message || e}` }, { status: 500 });
      }
    }

    // 3b. Admin Login Logs API (ເບິ່ງ Log ວ່າ user ໃດເຂົ້າໃຊ້ງານ ວັນທີ ແລະ ເວລາໃດແດ່)
    if (url.pathname === "/api/admin/login-logs" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
      if (!requester || requester.role !== 'admin') {
        return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ເບິ່ງ Log ນີ້ໄດ້" }, { status: 403 });
      }

      const { results } = await env.DB.prepare(
        "SELECT * FROM login_logs ORDER BY logged_in_at DESC LIMIT 1000"
      ).all();
      return Response.json(results || []);
    }

    // 4. Update Status API (ອະນຸມັດ / ປະຕິເສດ)
    if (url.pathname === "/api/admin/update-status" && request.method === "POST") {
      const { userId, status } = await request.json();
      await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, userId).run();

      // ແຈ້ງເຕືອນຜູ້ສະໝັກ ເມື່ອບັນຊີຖືກອະນຸມັດ/ປະຕິເສດ (ຖ້າເຂົາເຈົ້າເປີດ Push ໄວ້ແລ້ວ ຫຼືເຂົ້າສູ່ລະບົບຢູ່)
      if (status === 'approved' || status === 'rejected') {
        runInBackground(ctx, sendWebPushToUser(env, userId, {
          title: status === 'approved' ? "ບັນຊີຂອງທ່ານຖືກອະນຸມັດແລ້ວ" : "ບັນຊີຂອງທ່ານຖືກປະຕິເສດ",
          body: status === 'approved' ? "ທ່ານສາມາດໃຊ້ງານລະບົບໄດ້ເຕັມຮູບແບບແລ້ວ" : "ກະລຸນາຕິດຕໍ່ Admin ເພື່ອສອບຖາມລາຍລະອຽດ",
          url: "dashboard",
        }));
      }
      return Response.json({ message: `ອັບເດດສະຖານະເປັນ ${status} ຮຽບຮ້ອຍ` });
    }

    // 4c. Admin Update User Role API (ตั้งค่า role เป็น user / warehouse - เปลี่ยน role เป็น admin ไม่ได้ผ่านช่องทางนี้)
    if (url.pathname === "/api/admin/update-user-role" && request.method === "POST") {
      try {
        const { callerId, userId, role } = await request.json();
        if (!callerId || !userId || !role) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });
        if (!['user', 'warehouse', 'delivery', 'assistant_admin', 'dsm'].includes(role)) {
          return Response.json({ error: "ສິດການໃຊ້ງານບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        }

        const caller = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(callerId).first();
        if (!caller || caller.role !== 'admin') {
          return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });
        }

        const target = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!target) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });
        if (target.role === 'admin') {
          return Response.json({ error: "ບໍ່ສາມາດປ່ຽນສິດບັນຊີ Admin ໄດ້" }, { status: 403 });
        }

        await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, userId).run();

        const ROLE_LABELS = { user: "MDE (ຜູ້ໃຊ້ທົ່ວໄປ)", warehouse: "ພະນັກງານສາງ", delivery: "ພະນັກງານຈັດສົ່ງ", assistant_admin: "ຜູ້ຊ່ວຍ Admin", dsm: "DSM (ຜູ້ຈັດການຂາຍ)" };
        runInBackground(ctx, sendWebPushToUser(env, userId, {
          title: "ສິດການໃຊ້ງານຂອງທ່ານຖືກປ່ຽນ",
          body: `ສິດໃໝ່ຂອງທ່ານ: ${ROLE_LABELS[role] || role}\nກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່ເພື່ອໃຫ້ເມນູອັບເດດ`,
          url: "dashboard",
        }));
        return Response.json({ message: "ປ່ຽນສິດການໃຊ້ງານຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/update-user-role", e);
        return Response.json({ error: "ບໍ່ສາມາດປ່ຽນສິດການໃຊ້ງານໄດ້" }, { status: 500 });
      }
    }

    // 5b. Admin Save MDE API (เพิ่ม / แก้ไข MDE)
    if (url.pathname === "/api/admin/save-mde" && request.method === "POST") {
      try {
        const { id, team, mde_code, mde_name, phone } = await request.json();
        if (!team || !mde_code || !mde_name) {
          return Response.json({ error: "ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບທຸກຊ່ອງ" }, { status: 400 });
        }

        if (id) {
          // แก้ไขข้อมูล MDE เดิม (แก้ไข Team/Name/เบอร์โทรได้, Code ถูกล็อคจากฝั่ง UI)
          const existing = await env.DB.prepare("SELECT mde_code, mde_name FROM mde_list WHERE id = ?").bind(id).first();
          if (!existing) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນ MDE ນີ້ໃນລະບົບ" }, { status: 404 });

          await env.DB.prepare(
            "UPDATE mde_list SET team = ?, mde_name = ?, phone = ? WHERE id = ?"
          ).bind(team, mde_name, phone || null, id).run();

          // ຊື່ປ່ຽນ -> ຄົນຮັບຜິດຊອບປ່ຽນໄປແລ້ວ -> ລຶບບັນຊີ user ເດີມ, ບັງຄັບໃຫ້ສະໝັກໃໝ່
          const revokedUser = (existing.mde_name !== mde_name)
            ? await revokeUserByMdeCode(env, existing.mde_code)
            : false;

          return Response.json({
            message: revokedUser
              ? "ແກ້ໄຂຂໍ້ມູນ MDE ຮຽບຮ້ອຍແລ້ວ (ຊື່ປ່ຽນ -> ບັນຊີຜູ້ໃຊ້ງານເດີມຂອງ MDE Code ນີ້ຖືກລຶບອອກແລ້ວ, ຕ້ອງສະໝັກໃໝ່)"
              : "ແກ້ໄຂຂໍ້ມູນ MDE ຮຽບຮ້ອຍແລ້ວ",
            revokedUser,
          });
        } else {
          // ເພີ່ມ MDE ໃໝ່ - ຖ້າ mde_code ນີ້ມີຢູ່ໃນລະບົບແລ້ວ (ຊ້ຳ) ໃຫ້ອັບເດດ team/mde_name/phone ແທນທີ່ຈະ error
          // (ຮອງຮັບການອັບໂຫລດເປັນຊຸດ: ແຖວທີ່ mde_code ຊ້ຳກັບຂອງເກົ່າຈະຖືກອັບເດດຂໍ້ມູນໃຫ້ ບໍ່ຖືກຂ້າມ)
          const existing = await env.DB.prepare("SELECT mde_name FROM mde_list WHERE mde_code = ?").bind(mde_code).first();

          await env.DB.prepare(
            `INSERT INTO mde_list (team, mde_code, mde_name, phone) VALUES (?, ?, ?, ?)
             ON CONFLICT(mde_code) DO UPDATE SET team = excluded.team, mde_name = excluded.mde_name, phone = excluded.phone`
          ).bind(team, mde_code, mde_name, phone || null).run();

          // ຊື່ປ່ຽນ (ທຽບກັບຂອງເດີມກ່ອນອັບເດດ) -> ລຶບບັນຊີ user ເດີມ, ບັງຄັບໃຫ້ສະໝັກໃໝ່
          const revokedUser = (existing && existing.mde_name !== mde_name)
            ? await revokeUserByMdeCode(env, mde_code)
            : false;

          return Response.json({
            message: revokedUser
              ? "ບັນທຶກຂໍ້ມູນ MDE ຮຽບຮ້ອຍແລ້ວ (ຊື່ປ່ຽນ -> ບັນຊີຜູ້ໃຊ້ງານເດີມຖືກລຶບອອກແລ້ວ, ຕ້ອງສະໝັກໃໝ່)"
              : "ບັນທຶກຂໍ້ມູນ MDE ຮຽບຮ້ອຍແລ້ວ",
            revokedUser,
          });
        }
      } catch (e) {
        console.error("/api/admin/save-mde", e);
        return Response.json({ error: "MDE Code ນີ້ມີຢູ່ໃນລະບົບແລ້ວ" }, { status: 400 });
      }
    }

    // 5b-2. Admin Save DSM API (ເພີ່ມ / ແກ້ໄຂ ຊື່ DSM ຂອງແຕ່ລະ Team) - Team ນຶ່ງມີໄດ້ DSM ດຽວ
    if (url.pathname === "/api/admin/save-dsm" && request.method === "POST") {
      try {
        const { id, team, dsm_name, phone, email } = await request.json();
        if (!team || !dsm_name) {
          return Response.json({ error: "ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບທຸກຊ່ອງ" }, { status: 400 });
        }
        const cleanDsmEmail = String(email || "").trim();
        if (cleanDsmEmail && (cleanDsmEmail.length > 254 || !EMAIL_PATTERN.test(cleanDsmEmail))) {
          return Response.json({ error: "ຮູບແບບອີເມວ DSM ບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        }

        if (id) {
          const existing = await env.DB.prepare("SELECT id FROM dsm_list WHERE id = ?").bind(id).first();
          if (!existing) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນ DSM ນີ້ໃນລະບົບ" }, { status: 404 });

          await env.DB.prepare(
            "UPDATE dsm_list SET team = ?, dsm_name = ?, phone = ?, email = ? WHERE id = ?"
          ).bind(team, dsm_name, phone || null, cleanDsmEmail || null, id).run();
        } else {
          // ເພີ່ມ DSM ໃໝ່ - ຖ້າ Team ນີ້ມີ DSM ຢູ່ແລ້ວ ໃຫ້ອັບເດດຊື່/ເບີໂທແທນທີ່ຈະ error (ອັບໂຫລດຊ້ຳ Team ເກົ່າ)
          await env.DB.prepare(
            `INSERT INTO dsm_list (team, dsm_name, phone, email) VALUES (?, ?, ?, ?)
             ON CONFLICT(team) DO UPDATE SET dsm_name = excluded.dsm_name, phone = excluded.phone, email = excluded.email`
          ).bind(team, dsm_name, phone || null, cleanDsmEmail || null).run();
        }

        return Response.json({ message: "ບັນທຶກຂໍ້ມູນ DSM ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/save-dsm", e);
        return Response.json({ error: "ບໍ່ສາມາດບັນທຶກຂໍ້ມູນ DSM ໄດ້ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_dsm_email.sql ໃຫ້ຮັນກ່ອນ)" }, { status: 400 });
      }
    }

    // 5b-3. Admin Delete DSM API (ລຶບ)
    if (url.pathname === "/api/admin/delete-dsm" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const existing = await env.DB.prepare("SELECT id FROM dsm_list WHERE id = ?").bind(id).first();
        if (!existing) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນ DSM ນີ້ໃນລະບົບ" }, { status: 404 });

        await env.DB.prepare("DELETE FROM dsm_list WHERE id = ?").bind(id).run();
        return Response.json({ message: "ລຶບລາຍການ DSM ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-dsm", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນ DSM ໄດ້" }, { status: 500 });
      }
    }

    // 5b-4. Admin ສ້າງບັນຊີ user (role = dsm) ໃຫ້ DSM ທຸກຄົນໃນ DSM List ທີ່ມີອີເມວ — DSM login ດ້ວຍອີເມວຂອງຕົນເອງ
    // - ສ້າງເປັນ role 'dsm', status 'approved', team = Team ໃນ DSM List (ບໍ່ມີ MDE Code)
    // - ບໍ່ຕັ້ງລະຫັດຜ່ານໃຫ້ (ໃສ່ລະຫັດສຸ່ມທີ່ບໍ່ມີໃຜຮູ້) -> DSM ກົດ "ລືມລະຫັດຜ່ານ" ໃສ່ອີເມວ -> ໄດ້ OTP ທາງອີເມວ -> ຕັ້ງລະຫັດຜ່ານເອງ
    // - ບໍ່ແຕະຕ້ອງບັນຊີທີ່ມີຢູ່ແລ້ວ (ບໍ່ປ່ຽນ role/ສະຖານະ ຂອງ admin/MDE/ອື່ນໆ) — ລາຍງານໃນຜົນລັບແທນ
    // body (ທາງເລືອກ): { ids: [dsm_list.id,...] } ຖ້າບໍ່ສົ່ງ = ທຸກແຖວ; { notify: false } = ບໍ່ສົ່ງອີເມວແຈ້ງ DSM
    if (url.pathname === "/api/admin/create-dsm-users" && request.method === "POST") {
      try {
        let body = {};
        try { body = await request.json(); } catch (_) { /* ບໍ່ມີ body ກໍໄດ້ */ }
        const ids = Array.isArray(body.ids) ? body.ids.map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n)) : null;
        const notify = body.notify !== false;

        let rows;
        if (ids && ids.length) {
          const ph = ids.map(() => "?").join(",");
          rows = (await env.DB.prepare(`SELECT * FROM dsm_list WHERE id IN (${ph}) ORDER BY team`).bind(...ids).all()).results || [];
        } else {
          rows = (await env.DB.prepare("SELECT * FROM dsm_list ORDER BY team").all()).results || [];
        }

        const out = { created: [], exists: [], skipped: [] };
        const seenEmails = new Set();
        for (const r of rows) {
          const label = { team: r.team, dsm_name: r.dsm_name, email: r.email || "" };
          const email = String(r.email || "").trim().toLowerCase();
          if (!email) { out.skipped.push({ ...label, reason: "ຍັງບໍ່ມີອີເມວ DSM" }); continue; }
          if (email.length > 254 || !EMAIL_PATTERN.test(email)) { out.skipped.push({ ...label, reason: "ຮູບແບບອີເມວບໍ່ຖືກຕ້ອງ" }); continue; }
          if (seenEmails.has(email)) { out.skipped.push({ ...label, reason: "ອີເມວຊ້ຳກັບ DSM ອີກ Team ໜຶ່ງໃນລາຍການ (1 ອີເມວ = 1 ບັນຊີ = 1 Team)" }); continue; }
          seenEmails.add(email);

          const ex = await env.DB.prepare("SELECT id, role, status, team FROM users WHERE UPPER(email) = UPPER(?)").bind(email).first();
          if (ex) {
            if (ex.role !== "dsm") {
              out.skipped.push({ ...label, reason: `ອີເມວນີ້ມີບັນຊີຢູ່ແລ້ວເປັນ role "${ex.role}" (ບໍ່ປ່ຽນໃຫ້ອັດຕະໂນມັດ — ຖ້າຕ້ອງການໃຫ້ປ່ຽນ role ເປັນ DSM ໃນໜ້າຜູ້ໃຊ້ງານ)` });
            } else if ((ex.team || "") !== r.team) {
              out.skipped.push({ ...label, reason: `ມີບັນຊີ DSM ນີ້ແລ້ວ ແຕ່ຜູກກັບ Team "${ex.team || '-'}" (ບໍ່ກົງກັບ DSM List)` });
            } else {
              out.exists.push({ ...label, status: ex.status });
            }
            continue;
          }

          // ລະຫັດຜ່ານສຸ່ມ 256-bit ທີ່ບໍ່ມີໃຜຮູ້ — DSM ຕ້ອງຕັ້ງເອງຜ່ານ OTP ທາງອີເມວ
          const rnd = crypto.getRandomValues(new Uint8Array(32));
          let bin = ""; for (const b of rnd) bin += String.fromCharCode(b);
          const unusable = await hashPassword(btoa(bin));
          await env.DB.prepare(
            "INSERT INTO users (email, password_hash, team, mde_code, role, status) VALUES (?, ?, ?, NULL, 'dsm', 'approved')"
          ).bind(email, unusable, r.team).run();
          out.created.push(label);

          if (notify) {
            const appUrl = url.origin;
            runInBackground(ctx, sendEmail(env, {
              to: email,
              subject: "ບັນຊີ DSM ຂອງທ່ານພ້ອມໃຊ້ງານແລ້ວ",
              text: `ສະບາຍດີ ${r.dsm_name || ""}\n\nບັນຊີ DSM (Team ${r.team}) ຂອງທ່ານຖືກສ້າງແລ້ວ ໃຊ້ອີເມວນີ້ເຂົ້າສູ່ລະບົບ: ${email}\n\nຂັ້ນຕອນຕັ້ງລະຫັດຜ່ານຄັ້ງທຳອິດ:\n1) ເປີດ ${appUrl}\n2) ກົດ "ລືມລະຫັດຜ່ານ" ແລ້ວໃສ່ອີເມວນີ້\n3) ເອົາລະຫັດ OTP 6 ໂຕທີ່ໄດ້ຮັບທາງອີເມວ ມາຕັ້ງລະຫັດຜ່ານໃໝ່\n4) ເຂົ້າສູ່ລະບົບດ້ວຍອີເມວ + ລະຫັດຜ່ານທີ່ຕັ້ງ`,
              html: `<div style="font-family:Arial,sans-serif;max-width:480px">
                <p>ສະບາຍດີ ${escMailHtml(r.dsm_name || "")}</p>
                <p>ບັນຊີ <b>DSM</b> (Team <b>${escMailHtml(r.team)}</b>) ຂອງທ່ານຖືກສ້າງແລ້ວ. ໃຊ້ອີເມວນີ້ເຂົ້າສູ່ລະບົບ: <b>${escMailHtml(email)}</b></p>
                <p><b>ຕັ້ງລະຫັດຜ່ານຄັ້ງທຳອິດ:</b></p>
                <ol><li>ເປີດ <a href="${appUrl}">${appUrl}</a></li><li>ກົດ "ລືມລະຫັດຜ່ານ" ແລ້ວໃສ່ອີເມວນີ້</li><li>ເອົາລະຫັດ OTP 6 ໂຕທີ່ໄດ້ຮັບທາງອີເມວ ມາຕັ້ງລະຫັດຜ່ານໃໝ່</li><li>ເຂົ້າສູ່ລະບົບດ້ວຍອີເມວ + ລະຫັດຜ່ານທີ່ຕັ້ງ</li></ol></div>`,
            }));
          }
        }

        const msg = `ສ້າງບັນຊີ DSM ໃໝ່ ${out.created.length} ຄົນ | ມີຢູ່ແລ້ວ ${out.exists.length} | ຂ້າມ ${out.skipped.length}`;
        return Response.json({ message: msg, ...out });
      } catch (e) {
        console.error("/api/admin/create-dsm-users", e);
        return Response.json({ error: "ສ້າງບັນຊີ DSM ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່" }, { status: 500 });
      }
    }

    // 5c. Admin Delete MDE API (ลบ)
    if (url.pathname === "/api/admin/delete-mde" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const existing = await env.DB.prepare("SELECT mde_code FROM mde_list WHERE id = ?").bind(id).first();
        if (!existing) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນ MDE ນີ້ໃນລະບົບ" }, { status: 404 });

        await env.DB.prepare("DELETE FROM mde_list WHERE id = ?").bind(id).run();

        // ລົບ MDE Code ອອກຈາກລະບົບໄປແລ້ວ -> ບັນຊີ user ເດີມທີ່ຜູກກັບ mde_code ນີ້ ຕ້ອງຖືກລຶບອອກນຳ ບັງຄັບໃຫ້ສະໝັກໃໝ່
        const revokedUser = await revokeUserByMdeCode(env, existing.mde_code);

        return Response.json({
          message: revokedUser
            ? "ລຶບລາຍການ MDE ຮຽບຮ້ອຍແລ້ວ (ບັນຊີຜູ້ໃຊ້ງານເດີມຂອງ MDE Code ນີ້ຖືກລຶບອອກແລ້ວ)"
            : "ລຶບລາຍການ MDE ຮຽບຮ້ອຍແລ້ວ",
          revokedUser,
        });
      } catch (e) {
        console.error("/api/admin/delete-mde", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 4b. Admin Delete User API (ลบผู้ใช้งาน)
    if (url.pathname === "/api/admin/delete-user" && request.method === "POST") {
      try {
        const { userId } = await request.json();
        if (!userId) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const target = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!target) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });
        if (target.role === 'admin') {
          return Response.json({ error: "ບໍ່ສາມາດລຶບບັນຊີ Admin ໄດ້" }, { status: 403 });
        }
        if (target.role === 'warehouse') {
          return Response.json({ error: "ບໍ່ສາມາດລຶບບັນຊີ Warehouse ໄດ້" }, { status: 403 });
        }

        // ລົບຂໍ້ມູນທີ່ພົວພັນກັບ user ນີ້ (child rows) ພ້ອມກັນແບບ atomic ກັນຄ້າງເປັນ orphan ໃນ D1
        // - push_subscriptions / notifications: ຜູກກັບ user_id ໂດຍກົງ, ບໍ່ມີປະໂຫຍດອີກຖ້າ user ຖືກລົບ -> ລົບອອກ
        // - asset_requests / login_logs: ຕັ້ງໃຈບໍ່ລົບ ເພາະເປັນປະຫວັດ/audit trail ທີ່ຄວນເກັບໄວ້ຫຼັງລົບ user
        //   (login_logs ບັນທຶກ email/team/role ໄວ້ໃນຕົວມັນເອງແລ້ວ ບໍ່ອີງ join ກັບ users;
        //    asset_requests ໃຊ້ LEFT JOIN users ຢູ່ແລ້ວ ຖ້າ user ຖືກລົບຈະສະແດງ requester_email ເປັນຄ່າວ່າງແທນທີ່ຈະ error)
        await env.DB.batch([
          env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(userId),
          env.DB.prepare("DELETE FROM notifications WHERE user_id = ?").bind(userId),
          env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
        ]);
        return Response.json({ message: "ລຶບຜູ້ໃຊ້ງານຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-user", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຜູ້ໃຊ້ງານໄດ້" }, { status: 500 });
      }
    }

    // 4c. Admin Reset Password API (admin ตั้งรหัสผ่านใหม่ให้ user ตัวอื่น โดยไม่ต้องรู้รหัสเดิม)
    if (url.pathname === "/api/admin/reset-password" && request.method === "POST") {
      try {
        // userId = ຜູ້ໃຊ້ງານເປົ້າໝາຍ (ຢູ່ໃນ TARGET_USER_ID_ROUTES ຈຶ່ງບໍ່ຖືກທັບດ້ວຍ session.id)
        const { userId, newPassword } = await request.json();
        if (!userId) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານທີ່ຕ້ອງການຕັ້ງລະຫັດຜ່ານໃໝ່" }, { status: 400 });
        if (!newPassword || newPassword.length < 8) {
          return Response.json({ error: "ລະຫັດຜ່ານໃໝ່ຕ້ອງຍາວຢ່າງໜ້ອຍ 8 ຕົວອັກສອນ" }, { status: 400 });
        }

        const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
        if (!target) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

        const newHash = await hashPassword(newPassword);
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
          .bind(newHash, userId)
          .run();

        // ປ່ຽນລະຫັດຜ່ານແລ້ວ -> token ເກົ່າຂອງຜູ້ໃຊ້ງານນີ້ (ທຸກອຸປະກອນ) ຈະໃຊ້ບໍ່ໄດ້ອີກຕໍ່ໄປ (pv ປ່ຽນຕາມ password_hash)
        return Response.json({ message: "ຕັ້ງລະຫັດຜ່ານໃໝ່ໃຫ້ຜູ້ໃຊ້ງານສຳເລັດແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/reset-password", e);
        return Response.json({ error: "ບໍ່ສາມາດຕັ້ງລະຫັດຜ່ານໃໝ່ໄດ້" }, { status: 500 });
      }
    }

    // 5. Change Password API (เปลี่ยนรหัสผ่าน)
    if (url.pathname === "/api/change-password" && request.method === "POST") {
      try {
        // userId ມາຈາກ token ເທົ່ານັ້ນ (ດ່ານກວດສິດທັບໃຫ້ແລ້ວ) -> ປ່ຽນລະຫັດຜ່ານຄົນອື່ນບໍ່ໄດ້
        const { currentPassword, newPassword } = await request.json();
        if (!currentPassword || !newPassword) {
          return Response.json({ error: "ກະລຸນາປ້ອນລະຫັດຜ່ານປັດຈຸບັນ ແລະ ລະຫັດຜ່ານໃໝ່" }, { status: 400 });
        }
        if (newPassword.length < 8) {
          return Response.json({ error: "ລະຫັດຜ່ານໃໝ່ຕ້ອງຍາວຢ່າງໜ້ອຍ 8 ຕົວອັກສອນ" }, { status: 400 });
        }

        const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
          .bind(session.id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

        const { ok } = await verifyPassword(currentPassword, row.password_hash);
        if (!ok) return Response.json({ error: "ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ" }, { status: 403 });

        const newHash = await hashPassword(newPassword);
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
          .bind(newHash, session.id)
          .run();

        // ປ່ຽນລະຫັດຜ່ານແລ້ວ token ເກົ່າທຸກອັນຈະໃຊ້ບໍ່ໄດ້ -> ອອກ token ໃໝ່ໃຫ້ອຸປະກອນນີ້ເລີຍ
        const token = await createSessionToken(env, { id: session.id, role: session.role, password_hash: newHash });
        return Response.json({ message: "ປ່ຽນລະຫັດຜ່ານສຳເລັດຮຽບຮ້ອຍ!", token });
      } catch (e) {
        console.error("/api/change-password", e);
        return Response.json({ error: "ບໍ່ສາມາດປ່ຽນລະຫັດຜ່ານໄດ້" }, { status: 500 });
      }
    }

    // 6. Asset Tracking API (ดึงรายการทรัพย์สิน - admin เห็นทั้งหมด, user เห็นแค่ MDE ของตัวเอง)
    if (url.pathname === "/api/assets" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role, mde_code, team FROM users WHERE id = ?").bind(userId).first();
      if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

      // ไม่รวม Asset ที่จัดส่งสำเร็จแล้ว (Status = ສຳເລັດ) เพราะย้ายไปอยู่หน้า "ປະຫວັດການຈັດສົ່ງ Asset" แทน
      const DELIVERED_STATUS = "ສຳເລັດ";
      let results;
      if (canViewAll(requester.role)) {
        ({ results } = await env.DB.prepare(
          "SELECT * FROM assets WHERE IFNULL(status,'') != ? ORDER BY id DESC"
        ).bind(DELIVERED_STATUS).all());
      } else if (requester.role === "dsm") {
        ({ results } = await env.DB.prepare(
          `SELECT * FROM assets WHERE ${TEAM_MDE_SQL} AND IFNULL(status,'') != ? ORDER BY id DESC`
        ).bind(requester.team || "", DELIVERED_STATUS).all());
      } else {
        ({ results } = await env.DB.prepare(
          "SELECT * FROM assets WHERE mde_code = ? AND IFNULL(status,'') != ? ORDER BY id DESC"
        ).bind(requester.mde_code, DELIVERED_STATUS).all());
      }
      return Response.json(await attachDocStates(env, results || []));
    }

    // 6d. Asset Delivery History API (Asset ที่ Status = ສຳເລັດ เท่านั้น - ย้ายออกมาจาก Asset Tracking)
    if (url.pathname === "/api/asset-delivery-history" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role, mde_code, team FROM users WHERE id = ?").bind(userId).first();
      if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

      const DELIVERED_STATUS = "ສຳເລັດ";
      let results;
      if (canViewAll(requester.role)) {
        ({ results } = await env.DB.prepare(
          "SELECT * FROM assets WHERE status = ? ORDER BY last_update DESC"
        ).bind(DELIVERED_STATUS).all());
      } else if (requester.role === "dsm") {
        ({ results } = await env.DB.prepare(
          `SELECT * FROM assets WHERE ${TEAM_MDE_SQL} AND status = ? ORDER BY last_update DESC`
        ).bind(requester.team || "", DELIVERED_STATUS).all());
      } else {
        ({ results } = await env.DB.prepare(
          "SELECT * FROM assets WHERE mde_code = ? AND status = ? ORDER BY last_update DESC"
        ).bind(requester.mde_code, DELIVERED_STATUS).all());
      }
      return Response.json(await attachDocStates(env, results || []));
    }

    // 6d2. Admin Verify Delivery API (Admin ກົດຢືນຢັນວ່າໄດ້ກວດສອບຄວາມຖືກຕ້ອງຂອງລາຍການທີ່ "ສຳເລັດ" ແລ້ວ)
    if (url.pathname === "/api/asset-delivery-history/verify" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ຢືນຢັນລາຍການໄດ້" }, { status: 403 });
        }

        const asset = await env.DB.prepare("SELECT status FROM assets WHERE id = ?").bind(id).first();
        if (!asset) return Response.json({ error: "ບໍ່ພົບລາຍການ Asset ນີ້" }, { status: 404 });
        if (asset.status !== "ສຳເລັດ") {
          return Response.json({ error: "ຢືນຢັນໄດ້ສະເພາະລາຍການທີ່ຈັດສົ່ງສຳເລັດແລ້ວເທົ່ານັ້ນ" }, { status: 400 });
        }

        await env.DB.prepare(
          "UPDATE assets SET admin_verified = 1, admin_verified_at = CURRENT_TIMESTAMP, admin_verified_by = ? WHERE id = ?"
        ).bind(requester.email, id).run();

        return Response.json({ message: "ຢືນຢັນຄວາມຖືກຕ້ອງຮຽບຮ້ອຍແລ້ວ" });
      } catch (err) {
        console.error("/api/asset-delivery-history/verify", err);
        return Response.json({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.message }, { status: 500 });
      }
    }

    // 6d2b. Admin Verify Delivery (ຫຼາຍລາຍການພ້ອມກັນ) - Admin ເລືອກຫຼາຍລາຍການແລ້ວກົດຢືນຢັນຄັ້ງດຽວ
    //       ຢືນຢັນສະເພາະລາຍການທີ່ "ສຳເລັດ" ແລະ ຍັງບໍ່ທັນຢືນຢັນ (ຂ້າມອັນທີ່ຢືນຢັນແລ້ວ/ບໍ່ພົບ ໂດຍບໍ່ເກີດ error)
    if (url.pathname === "/api/asset-delivery-history/verify-bulk" && request.method === "POST") {
      try {
        const { userId, ids } = await request.json();
        if (!userId || !Array.isArray(ids) || !ids.length) return Response.json({ error: "ກະລຸນາເລືອກຢ່າງໜ້ອຍ 1 ລາຍການ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ຢືນຢັນລາຍການໄດ້" }, { status: 403 });
        }

        const cleanIds = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
        if (!cleanIds.length) return Response.json({ error: "ຂໍ້ມູນບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        if (cleanIds.length > 500) return Response.json({ error: "ເລືອກໄດ້ສູງສຸດ 500 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });

        // D1 ຈຳກັດ bind parameter ~100 ຕໍ່ 1 statement -> ແບ່ງເປັນກຸ່ມລະ 80 ແລ້ວ batch
        const stmts = [];
        for (let i = 0; i < cleanIds.length; i += 80) {
          const chunk = cleanIds.slice(i, i + 80);
          const ph = chunk.map(() => "?").join(",");
          stmts.push(
            env.DB.prepare(
              `UPDATE assets SET admin_verified = 1, admin_verified_at = CURRENT_TIMESTAMP, admin_verified_by = ?
               WHERE status = 'ສຳເລັດ' AND IFNULL(admin_verified, 0) = 0 AND id IN (${ph})`
            ).bind(requester.email, ...chunk)
          );
        }
        const results = await env.DB.batch(stmts);
        const verified = results.reduce((sum, r) => sum + ((r && r.meta && r.meta.changes) || 0), 0);
        const skipped = cleanIds.length - verified;

        return Response.json({
          message: skipped > 0
            ? `ຢືນຢັນຮຽບຮ້ອຍ ${verified} ລາຍການ (ຂ້າມ ${skipped} ລາຍການທີ່ຢືນຢັນແລ້ວ ຫຼືບໍ່ພົບ)`
            : `ຢືນຢັນຄວາມຖືກຕ້ອງຮຽບຮ້ອຍ ${verified} ລາຍການ`,
          verified, skipped, ids: cleanIds, verified_by: requester.email
        });
      } catch (err) {
        console.error("/api/asset-delivery-history/verify-bulk", err);
        return Response.json({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.message }, { status: 500 });
      }
    }

    // 6d3. Toggle Flag (star) API ໃນໜ້າ Asset Tracking (ຄືກັນກັບ flag ອີເມວ) - Admin ເທົ່ານັ້ນ
    if (url.pathname === "/api/assets/toggle-flag" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ຕິດທຸງລາຍການໄດ້" }, { status: 403 });
        }

        const asset = await env.DB.prepare("SELECT flagged FROM assets WHERE id = ?").bind(id).first();
        if (!asset) return Response.json({ error: "ບໍ່ພົບລາຍການ Asset ນີ້" }, { status: 404 });

        const newFlagged = asset.flagged ? 0 : 1;
        if (newFlagged) {
          await env.DB.prepare(
            "UPDATE assets SET flagged = 1, flagged_at = CURRENT_TIMESTAMP, flagged_by = ? WHERE id = ?"
          ).bind(requester.email, id).run();
        } else {
          await env.DB.prepare(
            "UPDATE assets SET flagged = 0, flagged_at = NULL, flagged_by = NULL WHERE id = ?"
          ).bind(id).run();
        }

        return Response.json({ message: newFlagged ? "ຕິດທຸງລາຍການແລ້ວ" : "ຖອດທຸງລາຍການແລ້ວ", flagged: newFlagged });
      } catch (err) {
        console.error("/api/assets/toggle-flag", err);
        return Response.json({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.message }, { status: 500 });
      }
    }

    // 6d4. Toggle "ສັນຍາ: ມີເອກະສານ" ດ້ວຍມື (ໜ້າ Asset Tracking) - Admin ເທົ່ານັ້ນ
    //      ໃຊ້ເມື່ອມີເອກະສານສັນຍາຕົວຈິງ ແຕ່ບໍ່ມີໃບສັນຍາຢືມທີ່ເຊັນແລ້ວໃນລະບົບ (ບໍ່ແຕະ loan_contracts)
    if (url.pathname === "/api/assets/toggle-contract-doc" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ໝາຍເອກະສານສັນຍາໄດ້" }, { status: 403 });
        }

        const asset = await env.DB.prepare("SELECT contract_doc_manual FROM assets WHERE id = ?").bind(id).first();
        if (!asset) return Response.json({ error: "ບໍ່ພົບລາຍການ Asset ນີ້" }, { status: 404 });

        const newVal = asset.contract_doc_manual ? 0 : 1;
        if (newVal) {
          await env.DB.prepare(
            "UPDATE assets SET contract_doc_manual = 1, contract_doc_manual_at = CURRENT_TIMESTAMP, contract_doc_manual_by = ? WHERE id = ?"
          ).bind(requester.email, id).run();
        } else {
          await env.DB.prepare(
            "UPDATE assets SET contract_doc_manual = 0, contract_doc_manual_at = NULL, contract_doc_manual_by = NULL WHERE id = ?"
          ).bind(id).run();
        }

        return Response.json({
          message: newVal ? "ໝາຍວ່າມີເອກະສານສັນຍາແລ້ວ" : "ຍົກເລີກການໝາຍເອກະສານສັນຍາແລ້ວ",
          contract_doc_manual: newVal,
          contract_doc_manual_by: newVal ? requester.email : null,
          contract_doc_manual_at: newVal ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null
        });
      } catch (err) {
        console.error("/api/assets/toggle-contract-doc", err);
        return Response.json({ error: "ເກີດຂໍ້ຜິດພາດ: " + err.message }, { status: 500 });
      }
    }

    // 6e. Update Asset Status Only API (ອະນຸຍາດສະເພາະ admin - warehouse ຖືກຕັດສິດແກ້ໄຂແລ້ວ)
    if (url.pathname === "/api/asset-status/update" && request.method === "POST") {
      try {
        const { userId, id, status } = await request.json();
        if (!userId || !id || !status) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ແກ້ໄຂ Status Asset ໄດ້" }, { status: 403 });
        }

        const existingAsset = await env.DB.prepare("SELECT status, tracking_no, outlet_name, mde_code FROM assets WHERE id = ?").bind(id).first();

        await env.DB.prepare("UPDATE assets SET status = ?, last_update = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id).run();

        // ແຈ້ງເຕືອນ warehouse/delivery ຖ້າສະຖານະຖືກປ່ຽນເປັນ "ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ" ຫຼື "ຢູ່ລະຫວ່າງຈັດສົ່ງ" (ບໍ່ໃຫ້ error ຕົງນີ້ເຮັດໃຫ້ save ລົ້ມເຫລວ)
        if (existingAsset && existingAsset.status !== status && DISPATCH_NOTIFY_STATUSES.includes(status)) {
          try {
            const mdeName = await getMdeName(env, existingAsset.mde_code);
            const detailLine = formatMdeOutletLine(existingAsset.mde_code, mdeName, existingAsset.outlet_name);
            await sendWebPushToRoles(env, ["warehouse", "delivery"], {
              title: "ມີລາຍການຈັດສົ່ງໃໝ່",
              body: `${existingAsset.tracking_no || ''} (${status})${detailLine ? '\n' + detailLine : ''}\nກະລຸນາມາເອົາເອກະສານນຳ Admin`,
              url: "asset",
            });
          } catch (pushErr) { /* ไม่ต้องทำอะไร ปล่อยให้ save สำเร็จตามปกติ */ }
        }

        // ແຈ້ງເຕືອນ user (MDE) ຂອງລາຍການນີ້ ທຸກຄັ້ງທີ່ status ປ່ຽນ (ບໍ່ວ່າຈະປ່ຽນເປັນ status ໃດ)
        if (existingAsset && existingAsset.status !== status) {
          await notifyMdeUserOfStatusChange(env, existingAsset.mde_code, existingAsset.tracking_no, existingAsset.outlet_name, status);
        }

        return Response.json({ message: "ອັບເດດສະຖານະຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/asset-status/update", e);
        return Response.json({ error: "ບໍ່ສາມາດອັບເດດສະຖານະໄດ້" }, { status: 500 });
      }
    }

    // 6e2. Admin: ກົດແຈ້ງເຕືອນ MDE ດ້ວຍຕົນເອງ (ສະເພາະ Asset ທີ່ status ຄ້າງເອກະສານ / ຄ້າງ PowerApp)
    // ສົ່ງ Push ໄປຫາ user (role = 'user') ທີ່ mde_code ກົງກັບ Asset ນັ້ນ
    if (url.pathname === "/api/admin/notify-mde-pending" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ແຈ້ງເຕືອນລາຍການນີ້ໄດ້" }, { status: 403 });
        }

        const asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();
        if (!asset) return Response.json({ error: "ບໍ່ພົບລາຍການ Asset ນີ້" }, { status: 404 });

        if (!NOTIFY_PENDING_STATUSES.includes(asset.status)) {
          return Response.json({
            error: `ແຈ້ງເຕືອນໄດ້ສະເພາະລາຍການທີ່ Status ເປັນ "${NOTIFY_PENDING_STATUSES.join('" ຫຼື "')}" ເທົ່ານັ້ນ`
          }, { status: 400 });
        }

        const targetUser = await env.DB.prepare(
          "SELECT id FROM users WHERE mde_code = ? AND role = 'user'"
        ).bind(asset.mde_code).first();
        if (!targetUser) {
          return Response.json({ error: `ບໍ່ພົບບັນຊີຜູ້ໃຊ້ງານ (role user) ຂອງ MDE Code ${asset.mde_code}` }, { status: 404 });
        }

        const mdeName = await getMdeName(env, asset.mde_code);
        const detailLine = formatMdeOutletLine(asset.mde_code, mdeName, asset.outlet_name);
        const pushResult = await sendWebPushToUser(env, targetUser.id, {
          title: "ແຈ້ງເຕືອນ Asset Tracking",
          body: `${asset.tracking_no || ''}${detailLine ? '\n' + detailLine : ''}\nຍັງຄ້າງສະຖານະ "${asset.status}" ກະລຸນາດຳເນີນການໂດຍໄວ`,
          url: "asset",
        });

        if (pushResult.sent === 0) {
          return Response.json({
            error: `ຜູ້ໃຊ້ງານ MDE ${asset.mde_code} ຍັງບໍ່ໄດ້ເປີດການແຈ້ງເຕືອນ Push ໄວ້ (ບໍ່ພົບ Subscription ທີ່ໃຊ້ງານໄດ້)`
          }, { status: 404 });
        }

        return Response.json({ message: `ສົ່ງແຈ້ງເຕືອນຫາ MDE ${asset.mde_code} ຮຽບຮ້ອຍແລ້ວ`, ...pushResult });
      } catch (e) {
        console.error("/api/admin/notify-mde-pending", e);
        return Response.json({ error: `ແຈ້ງເຕືອນລົ້ມເຫລວ: ${e.message || e}` }, { status: 500 });
      }
    }

    // 6e3. Admin: ລາຍຊື່ MDE ທີ່ມີ Asset ຄ້າງ "ຍັງບໍ່ທັນສົ່ງເອກະສານ" / "ຍັງບໍ່ຊັບມິດ PowerApp" (ໃຫ້ Admin ຕິກເລືອກກ່ອນກົດສົ່ງແຈ້ງເຕືອນ)
    if (url.pathname === "/api/admin/pending-mde-reminders" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const requester = userId ? await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first() : null;
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ເບິ່ງລາຍການນີ້ໄດ້" }, { status: 403 });
        }
        const [docStatus, powerAppStatus] = NOTIFY_PENDING_STATUSES;
        const { results } = await env.DB.prepare(
          `SELECT a.mde_code AS mde_code, m.mde_name AS mde_name, m.team AS team, u.id AS user_id,
             (CASE WHEN IFNULL(u.email, '') != '' THEN 1 ELSE 0 END) AS has_email,
             (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.user_id = u.id) AS push_devices,
             SUM(CASE WHEN a.status = ? THEN 1 ELSE 0 END) AS doc_cnt,
             SUM(CASE WHEN a.status = ? THEN 1 ELSE 0 END) AS powerapp_cnt
           FROM assets a
           LEFT JOIN mde_list m ON m.mde_code = a.mde_code
           LEFT JOIN users u ON u.mde_code = a.mde_code AND u.role = 'user' AND u.status = 'approved'
           WHERE a.status IN (?, ?) AND IFNULL(a.mde_code, '') != ''
           GROUP BY a.mde_code
           ORDER BY (SUM(CASE WHEN a.status = ? THEN 1 ELSE 0 END) + SUM(CASE WHEN a.status = ? THEN 1 ELSE 0 END)) DESC, a.mde_code`
        ).bind(docStatus, powerAppStatus, docStatus, powerAppStatus, docStatus, powerAppStatus).all();
        return Response.json({ statuses: NOTIFY_PENDING_STATUSES, items: results || [] });
      } catch (e) {
        console.error("/api/admin/pending-mde-reminders", e);
        return Response.json({ error: `ໂຫລດລາຍການບໍ່ສຳເລັດ: ${e.message || e}` }, { status: 500 });
      }
    }

    // 6e4. Admin: ສົ່ງແຈ້ງເຕືອນຫາ MDE ຫຼາຍຄົນພ້ອມກັນ (ຕາມ MDE + ສະຖານະ ທີ່ Admin ຕິກເລືອກ)
    if (url.pathname === "/api/admin/notify-mde-pending-bulk" && request.method === "POST") {
      try {
        const { userId, mde_codes, statuses, send_email } = await request.json();
        const wantEmail = send_email === true;
        const requester = userId ? await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first() : null;
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ແຈ້ງເຕືອນໄດ້" }, { status: 403 });
        }

        const codes = Array.isArray(mde_codes)
          ? [...new Set(mde_codes.map((c) => String(c || "").trim()).filter(Boolean))]
          : [];
        const sts = Array.isArray(statuses) ? NOTIFY_PENDING_STATUSES.filter((x) => statuses.includes(x)) : [];
        if (codes.length === 0) return Response.json({ error: "ກະລຸນາເລືອກ MDE ຢ່າງໜ້ອຍ 1 ຄົນ" }, { status: 400 });
        if (sts.length === 0) return Response.json({ error: "ກະລຸນາເລືອກສະຖານະຢ່າງໜ້ອຍ 1 ຢ່າງ" }, { status: 400 });
        if (codes.length > MAX_BULK_MDE_NOTIFY) {
          return Response.json({ error: `ເລືອກໄດ້ສູງສຸດ ${MAX_BULK_MDE_NOTIFY} ຄົນຕໍ່ການສົ່ງ 1 ຄັ້ງ ກະລຸນາແບ່ງສົ່ງເປັນຫຼາຍຮອບ` }, { status: 400 });
        }

        // ຄິດໄລ່ຈາກຂໍ້ມູນຈິງ ຕອນກົດສົ່ງ (ບໍ່ເຊື່ອຈຳນວນທີ່ໜ້າເວັບສະແດງ ເພາະອາດປ່ຽນໄປແລ້ວ)
        const assetRes = await env.DB.prepare(
          `SELECT mde_code, tracking_no, status FROM assets
           WHERE status IN (${sts.map(() => "?").join(",")}) AND IFNULL(mde_code, '') != ''`
        ).bind(...sts).all();
        const codeSet = new Set(codes);
        const assetsByMde = new Map();
        for (const row of (assetRes.results || [])) {
          if (!codeSet.has(row.mde_code)) continue;
          if (!assetsByMde.has(row.mde_code)) assetsByMde.set(row.mde_code, []);
          assetsByMde.get(row.mde_code).push(row);
        }
        const userRes = await env.DB.prepare(
          "SELECT id, mde_code, email FROM users WHERE role = 'user' AND status = 'approved' AND mde_code IS NOT NULL"
        ).all();
        const userByMde = new Map((userRes.results || []).map((u) => [u.mde_code, u.id]));
        const emailByMde = new Map((userRes.results || []).map((u) => [u.mde_code, u.email]));
        const nameRes = wantEmail ? await env.DB.prepare("SELECT mde_code, mde_name FROM mde_list").all() : { results: [] };
        const nameByMde = new Map((nameRes.results || []).map((r) => [r.mde_code, r.mde_name]));
        const appUrl = new URL(request.url).origin;

        let notified = 0, pushSent = 0, emailSent = 0, mailStopped = "";
        const noPush = [], noUser = [], nothing = [], noEmail = [], emailFailed = [], emailSkipped = [];
        for (const code of codes) {
          const items = assetsByMde.get(code);
          if (!items || items.length === 0) { nothing.push(code); continue; }
          const targetId = userByMde.get(code);
          if (!targetId) { noUser.push(code); continue; }

          const lines = [];
          for (const st of sts) {
            const n = items.filter((r) => r.status === st).length;
            if (n > 0) lines.push(`• ${st}: ${n} ລາຍການ`);
          }
          const trackingList = items.map((r) => r.tracking_no).filter(Boolean);
          const trackingLine = trackingList.length
            ? `\n${trackingList.slice(0, 5).join(", ")}${trackingList.length > 5 ? ` ແລະ ອີກ ${trackingList.length - 5} ລາຍການ` : ""}`
            : "";
          const result = await sendWebPushToUser(env, targetId, {
            title: "ແຈ້ງເຕືອນ Asset Tracking",
            body: `${lines.join("\n")}${trackingLine}\nກະລຸນາດຳເນີນການໂດຍໄວ`,
            url: "asset",
          });
          notified++;
          if (result.sent > 0) pushSent++; else noPush.push(code);

          // ສົ່ງເຂົ້າອີເມວ (ຖ້າ Admin ຕິກ): ຈຳນວນຕໍ່ຄັ້ງຈຳກັດ ແລະ ຖ້າ Gmail ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ/Token ໃຊ້ບໍ່ໄດ້ ຈະຢຸດລອງສົ່ງທັນທີ
          if (wantEmail) {
            const to = String(emailByMde.get(code) || "").trim();
            if (!to || !EMAIL_PATTERN.test(to)) { noEmail.push(code); }
            else if (mailStopped) { emailSkipped.push(code); }
            else if (emailSent >= MAX_BULK_MDE_EMAIL) { emailSkipped.push(code); }
            else {
              try {
                const mdeName = nameByMde.get(code) || "";
                const mail = buildPendingMdeEmail({ mdeCode: code, mdeName, lines, trackingList, appUrl });
                await sendEmail(env, { to, subject: mail.subject, text: mail.text, html: mail.html });
                emailSent++;
              } catch (mailErr) {
                console.error("notify-mde-pending-bulk email", code, mailErr && mailErr.message);
                const em = String((mailErr && mailErr.message) || "");
                if (em.startsWith("MAIL_NOT_CONFIGURED") || em.startsWith("GMAIL_TOKEN_FAILED")) { mailStopped = em.startsWith("MAIL_NOT_CONFIGURED") ? "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Gmail (GMAIL_* secrets)" : "Gmail Token ໃຊ້ບໍ່ໄດ້ (ໝົດອາຍຸ/ຖືກຖອນ)"; emailSkipped.push(code); }
                else emailFailed.push(code);
              }
            }
          }
        }

        const parts = [`ສົ່ງແຈ້ງເຕືອນຫາ ${notified} ຄົນ (ຂຶ້ນ Push ສຳເລັດ ${pushSent} ຄົນ)`];
        if (noPush.length) parts.push(`ບໍ່ໄດ້ເປີດ Push (ເຫັນໄດ້ສະເພາະໃນໜ້າແຈ້ງເຕືອນຂອງແອັບ): ${noPush.join(", ")}`);
        if (noUser.length) parts.push(`ບໍ່ມີບັນຊີ user ທີ່ອະນຸມັດແລ້ວ: ${noUser.join(", ")}`);
        if (nothing.length) parts.push(`ບໍ່ມີລາຍການຄ້າງແລ້ວ: ${nothing.join(", ")}`);
        if (wantEmail) {
          parts.push(`ສົ່ງອີເມວສຳເລັດ ${emailSent} ຄົນ`);
          if (mailStopped) parts.push(`ສົ່ງອີເມວບໍ່ໄດ້: ${mailStopped}`);
          if (noEmail.length) parts.push(`ບໍ່ມີອີເມວທີ່ຖືກຮູບແບບ: ${noEmail.join(", ")}`);
          if (emailFailed.length) parts.push(`ສົ່ງອີເມວບໍ່ສຳເລັດ: ${emailFailed.join(", ")}`);
          if (emailSkipped.length && !mailStopped) parts.push(`ຍັງບໍ່ໄດ້ສົ່ງອີເມວ (ເກີນ ${MAX_BULK_MDE_EMAIL} ສະບັບຕໍ່ຄັ້ງ — ກົດສົ່ງອີກຮອບ): ${emailSkipped.join(", ")}`);
        }
        return Response.json({ message: parts.join("\n"), total: codes.length, notified, pushSent, noPush, noUser, nothing, emailSent, noEmail, emailFailed, emailSkipped, mailStopped });
      } catch (e) {
        console.error("/api/admin/notify-mde-pending-bulk", e);
        return Response.json({ error: `ແຈ້ງເຕືອນລົ້ມເຫລວ: ${e.message || e}` }, { status: 500 });
      }
    }

    // 6e5. Admin: ລາຍຊື່ "MDE ຄ້າງເຊັນ" (ໃບສັນຍາຢືມ DOC- / ໃບເກັບຕູ້ T- ສະຖານະ draft) ແລະ "DSM ຄ້າງເຊັນ" (ສະຖານະ awaiting_dsm ແຍກຕາມ Team)
    if (url.pathname === "/api/admin/pending-sign-reminders" && request.method === "GET") {
      try {
        const kind = url.searchParams.get("kind");
        if (kind === "mde") {
          const agg = await env.DB.prepare(
            `SELECT x.mde_code AS mde_code, m.mde_name AS mde_name, m.team AS team,
               SUM(CASE WHEN x.kind = 'loan' THEN 1 ELSE 0 END) AS loan_cnt,
               SUM(CASE WHEN x.kind = 'cancel' THEN 1 ELSE 0 END) AS cancel_cnt
             FROM (SELECT mde_code, 'loan' AS kind FROM loan_contracts WHERE status = 'draft' AND IFNULL(mde_code, '') != ''
                   UNION ALL
                   SELECT mde_code, 'cancel' AS kind FROM cancel_contracts WHERE status = 'draft' AND IFNULL(mde_code, '') != '') x
             LEFT JOIN mde_list m ON m.mde_code = x.mde_code
             GROUP BY x.mde_code
             ORDER BY (loan_cnt + cancel_cnt) DESC, x.mde_code`
          ).all();
          const users = await env.DB.prepare(
            "SELECT id, mde_code, email FROM users WHERE role = 'user' AND status = 'approved' AND mde_code IS NOT NULL ORDER BY id"
          ).all();
          const pushRes = await env.DB.prepare("SELECT user_id, COUNT(*) AS c FROM push_subscriptions GROUP BY user_id").all();
          const pushBy = new Map((pushRes.results || []).map((r) => [r.user_id, r.c]));
          const userBy = new Map();
          for (const u of (users.results || [])) if (!userBy.has(u.mde_code)) userBy.set(u.mde_code, u);
          const items = (agg.results || []).map((r) => {
            const u = userBy.get(r.mde_code);
            return { key: r.mde_code, mde_code: r.mde_code, mde_name: r.mde_name, team: r.team, loan_cnt: r.loan_cnt, cancel_cnt: r.cancel_cnt,
              user_id: u ? u.id : null, has_email: u && String(u.email || "").trim() ? 1 : 0, push_devices: u ? (pushBy.get(u.id) || 0) : 0 };
          });
          return Response.json({ kind, items });
        }
        if (kind === "dsm") {
          const agg = await env.DB.prepare(
            `SELECT m.team AS team,
               SUM(CASE WHEN x.kind = 'loan' THEN 1 ELSE 0 END) AS loan_cnt,
               SUM(CASE WHEN x.kind = 'cancel' THEN 1 ELSE 0 END) AS cancel_cnt
             FROM (SELECT mde_code, 'loan' AS kind FROM loan_contracts WHERE status = 'awaiting_dsm'
                   UNION ALL
                   SELECT mde_code, 'cancel' AS kind FROM cancel_contracts WHERE status = 'awaiting_dsm') x
             LEFT JOIN mde_list m ON m.mde_code = x.mde_code
             GROUP BY m.team
             ORDER BY (loan_cnt + cancel_cnt) DESC`
          ).all();
          const dsms = await env.DB.prepare("SELECT team, dsm_name, phone, email FROM dsm_list").all();
          const dsmBy = new Map((dsms.results || []).map((d) => [d.team, d]));
          const items = (agg.results || []).map((r) => {
            const d = r.team ? dsmBy.get(r.team) : null;
            return { key: r.team || "", team: r.team || "", loan_cnt: r.loan_cnt, cancel_cnt: r.cancel_cnt,
              dsm_name: d ? d.dsm_name : "", has_dsm: d ? 1 : 0, has_email: d && String(d.email || "").trim() ? 1 : 0 };
          });
          return Response.json({ kind, items });
        }
        return Response.json({ error: "kind ບໍ່ຖືກຕ້ອງ" }, { status: 400 });
      } catch (e) {
        console.error("/api/admin/pending-sign-reminders", e);
        return Response.json({ error: `ໂຫລດລາຍການບໍ່ສຳເລັດ: ${e.message || e} (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_dsm_email.sql ໃຫ້ຮັນກ່ອນ)` }, { status: 500 });
      }
    }

    // 6e6. Admin: ສົ່ງແຈ້ງເຕືອນເອກະສານຄ້າງເຊັນ
    //   kind = 'mde': ສົ່ງ Push ຫາ MDE (+ ອີເມວຖ້າຕິກ) ຕາມ mde_code ທີ່ເລືອກ
    //   kind = 'dsm': ໃຊ້ລິ້ງເຊັນເດີມຂອງແຕ່ລະໃບ (ຖ້າຍັງບໍ່ໝົດອາຍຸ; ບໍ່ມີ/ໝົດອາຍຸ ຈຶ່ງອອກລິ້ງໃໝ່ 7 ວັນ) ແລ້ວສົ່ງອີເມວຫາ DSM ຂອງ Team ທີ່ເລືອກ (ຕ້ອງມີອີເມວໃນໜ້າຈັດການ DSM)
    if (url.pathname === "/api/admin/pending-sign-reminders/send" && request.method === "POST") {
      try {
        const body = await request.json();
        const kind = body.kind;
        const keys = Array.isArray(body.keys) ? [...new Set(body.keys.map((c) => String(c || "").trim()).filter(Boolean))] : [];
        if (!keys.length) return Response.json({ error: "ກະລຸນາເລືອກຢ່າງໜ້ອຍ 1 ລາຍການ" }, { status: 400 });
        const appUrl = new URL(request.url).origin;

        if (kind === "mde") {
          if (keys.length > MAX_BULK_SIGN_MDE) return Response.json({ error: `ເລືອກໄດ້ສູງສຸດ ${MAX_BULK_SIGN_MDE} ຄົນຕໍ່ການສົ່ງ 1 ຄັ້ງ` }, { status: 400 });
          const wantEmail = body.send_email === true;
          const docsRes = await env.DB.prepare(
            `SELECT 'loan' AS kind, mde_code, doc_no, outlet_name FROM loan_contracts WHERE status = 'draft' AND IFNULL(mde_code, '') != ''
             UNION ALL
             SELECT 'cancel' AS kind, mde_code, doc_no, outlet_name FROM cancel_contracts WHERE status = 'draft' AND IFNULL(mde_code, '') != ''`
          ).all();
          const keySet = new Set(keys);
          const docsBy = new Map();
          for (const r of (docsRes.results || [])) {
            if (!keySet.has(r.mde_code)) continue;
            if (!docsBy.has(r.mde_code)) docsBy.set(r.mde_code, []);
            docsBy.get(r.mde_code).push(r);
          }
          const userRes = await env.DB.prepare(
            "SELECT id, mde_code, email FROM users WHERE role = 'user' AND status = 'approved' AND mde_code IS NOT NULL ORDER BY id"
          ).all();
          const userBy = new Map();
          for (const u of (userRes.results || [])) if (!userBy.has(u.mde_code)) userBy.set(u.mde_code, u);
          const nameRes = wantEmail ? await env.DB.prepare("SELECT mde_code, mde_name FROM mde_list").all() : { results: [] };
          const nameBy = new Map((nameRes.results || []).map((r) => [r.mde_code, r.mde_name]));

          let notified = 0, pushSent = 0, emailSent = 0, mailStopped = "";
          const noPush = [], noUser = [], nothing = [], noEmail = [], emailFailed = [], emailSkipped = [];
          for (const code of keys) {
            const docs = docsBy.get(code) || [];
            if (!docs.length) { nothing.push(code); continue; }
            const u = userBy.get(code);
            if (!u) { noUser.push(code); continue; }
            const loanN = docs.filter((d) => d.kind === "loan").length;
            const cancelN = docs.filter((d) => d.kind === "cancel").length;
            const lines = [];
            if (loanN) lines.push(`ໃບສັນຍາຢືມ ${loanN} ໃບ ທີ່ຍັງບໍ່ໄດ້ເຊັນ`);
            if (cancelN) lines.push(`ໃບເກັບຕູ້ເຂົ້າສາງ (T-) ${cancelN} ໃບ ທີ່ຍັງບໍ່ໄດ້ເຊັນ`);
            const result = await sendWebPushToUser(env, u.id, {
              title: "ເຕືອນ: ມີເອກະສານຄ້າງເຊັນ",
              body: lines.join("\n"),
              url: loanN > 0 ? "loanContract:queue" : "history",
            });
            notified++;
            if (result.sent > 0) pushSent++; else noPush.push(code);

            if (wantEmail) {
              const to = String(u.email || "").trim();
              if (!to || !EMAIL_PATTERN.test(to)) noEmail.push(code);
              else if (mailStopped || emailSent >= MAX_BULK_MDE_EMAIL) emailSkipped.push(code);
              else {
                try {
                  const shown = docs.slice(0, MAX_SIGN_DOCS_PER_EMAIL);
                  const mail = buildSignReminderEmail({
                    subject: "ເຕືອນ: ມີເອກະສານຄ້າງເຊັນ",
                    who: `MDE ${nameBy.get(code) ? code + " - " + nameBy.get(code) : code}`,
                    intro: `ທ່ານມີເອກະສານທີ່ຍັງບໍ່ໄດ້ເຊັນ: ${lines.join(", ")}`,
                    docs: shown.map((d) => ({ label: `${d.kind === "cancel" ? "ໃບ T-" : "ໃບສັນຍາຢືມ"} ${d.doc_no || ""}${d.outlet_name ? " — " + d.outlet_name : ""}`.trim() })),
                    moreCount: docs.length - shown.length,
                    footer: "ກະລຸນາເຂົ້າລະບົບເພື່ອເຊັນເອກະສານໂດຍໄວ.",
                    appUrl,
                  });
                  await sendEmail(env, { to, subject: mail.subject, text: mail.text, html: mail.html });
                  emailSent++;
                } catch (mailErr) {
                  console.error("pending-sign-reminders mde email", code, mailErr && mailErr.message);
                  const em = String((mailErr && mailErr.message) || "");
                  if (em.startsWith("MAIL_NOT_CONFIGURED") || em.startsWith("GMAIL_TOKEN_FAILED")) { mailStopped = em.startsWith("MAIL_NOT_CONFIGURED") ? "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Gmail (GMAIL_* secrets)" : "Gmail Token ໃຊ້ບໍ່ໄດ້ (ໝົດອາຍຸ/ຖືກຖອນ)"; emailSkipped.push(code); }
                  else emailFailed.push(code);
                }
              }
            }
          }
          const parts = [`ສົ່ງແຈ້ງເຕືອນຫາ ${notified} ຄົນ (ຂຶ້ນ Push ສຳເລັດ ${pushSent} ຄົນ)`];
          if (noPush.length) parts.push(`ບໍ່ໄດ້ເປີດ Push (ເຫັນສະເພາະໃນແອັບ): ${noPush.join(", ")}`);
          if (noUser.length) parts.push(`ບໍ່ມີບັນຊີ user ທີ່ອະນຸມັດແລ້ວ: ${noUser.join(", ")}`);
          if (nothing.length) parts.push(`ບໍ່ມີເອກະສານຄ້າງແລ້ວ: ${nothing.join(", ")}`);
          if (wantEmail) {
            parts.push(`ສົ່ງອີເມວສຳເລັດ ${emailSent} ຄົນ`);
            if (mailStopped) parts.push(`ສົ່ງອີເມວບໍ່ໄດ້: ${mailStopped}`);
            if (noEmail.length) parts.push(`ບໍ່ມີອີເມວທີ່ຖືກຮູບແບບ: ${noEmail.join(", ")}`);
            if (emailFailed.length) parts.push(`ສົ່ງອີເມວບໍ່ສຳເລັດ: ${emailFailed.join(", ")}`);
            if (emailSkipped.length && !mailStopped) parts.push(`ຍັງບໍ່ໄດ້ສົ່ງອີເມວ (ເກີນ ${MAX_BULK_MDE_EMAIL} ສະບັບຕໍ່ຄັ້ງ — ກົດສົ່ງອີກຮອບ): ${emailSkipped.join(", ")}`);
          }
          return Response.json({ message: parts.join("\n"), notified, pushSent, emailSent });
        }

        if (kind === "dsm") {
          if (keys.length > MAX_BULK_SIGN_DSM) return Response.json({ error: `ເລືອກໄດ້ສູງສຸດ ${MAX_BULK_SIGN_DSM} Team ຕໍ່ການສົ່ງ 1 ຄັ້ງ` }, { status: 400 });
          const docsRes = await env.DB.prepare(
            `SELECT 'loan' AS kind, l.id AS id, l.doc_no AS doc_no, l.outlet_name AS outlet_name, l.mde_code AS mde_code, m.team AS team
               FROM loan_contracts l LEFT JOIN mde_list m ON m.mde_code = l.mde_code WHERE l.status = 'awaiting_dsm'
             UNION ALL
             SELECT 'cancel' AS kind, c.id AS id, c.doc_no AS doc_no, c.outlet_name AS outlet_name, c.mde_code AS mde_code, m.team AS team
               FROM cancel_contracts c LEFT JOIN mde_list m ON m.mde_code = c.mde_code WHERE c.status = 'awaiting_dsm'
             ORDER BY 3`
          ).all();
          const dsmRes = await env.DB.prepare("SELECT team, dsm_name, email FROM dsm_list").all();
          const dsmBy = new Map((dsmRes.results || []).map((d) => [d.team, d]));
          const teamSet = new Set(keys);
          const docsBy = new Map();
          for (const r of (docsRes.results || [])) {
            if (!r.team || !teamSet.has(r.team)) continue;
            if (!docsBy.has(r.team)) docsBy.set(r.team, []);
            docsBy.get(r.team).push(r);
          }
          const actor = (session && session.email) || "admin";
          let emailSent = 0, linkCount = 0, mailStopped = "";
          const noDsm = [], noEmail = [], nothing = [], emailFailed = [], emailSkipped = [];
          for (const team of keys) {
            const docs = docsBy.get(team) || [];
            if (!docs.length) { nothing.push(team); continue; }
            const d = dsmBy.get(team);
            if (!d) { noDsm.push(team); continue; }
            const to = String(d.email || "").trim();
            if (!to || !EMAIL_PATTERN.test(to)) { noEmail.push(team); continue; }
            if (mailStopped || emailSent >= MAX_BULK_SIGN_DSM) { emailSkipped.push(team); continue; }
            try {
              const shown = docs.slice(0, MAX_SIGN_DOCS_PER_EMAIL);
              const prepared = [];
              for (const doc of shown) {
                // ໃຊ້ລິ້ງເດີມຂອງໃບ (ຖ້າຍັງບໍ່ໝົດອາຍຸ) ເພື່ອບໍ່ໃຫ້ລິ້ງທີ່ເຄີຍສົ່ງ/ແຊຣ໌ໄປແລ້ວໃຊ້ບໍ່ໄດ້
                const lk = await ensureDsmSignLink(env, doc.kind, doc.id, actor, false);
                prepared.push({ doc, token: lk.token, expires_at: lk.expires_at });
              }
              linkCount += prepared.length;
              const mail = buildSignReminderEmail({
                subject: `ເຕືອນ: ມີເອກະສານລໍຖ້າ DSM ເຊັນ ${docs.length} ໃບ`,
                who: `DSM ${d.dsm_name || ""} (Team ${team})`.replace(/\s+/g, " "),
                intro: `ມີເອກະສານທີ່ MDE ເຊັນແລ້ວ ແລະ ລໍຖ້າທ່ານເຊັນ ${docs.length} ໃບ — ກົດລິ້ງຂອງແຕ່ລະໃບເພື່ອເຊັນ:`,
                docs: prepared.map((p) => ({
                  label: `${p.doc.kind === "cancel" ? "ໃບ T-" : "ໃບສັນຍາຢືມ"} ${p.doc.doc_no || ""}${p.doc.outlet_name ? " — " + p.doc.outlet_name : ""}${p.doc.mde_code ? " [" + p.doc.mde_code + "]" : ""}`.trim(),
                  url: `${appUrl}/dsm-sign?t=${p.token}`,
                  note: p.expires_at ? `ໝົດອາຍຸ ${fmtLaoExpiry(p.expires_at)}` : "",
                })),
                moreCount: docs.length - shown.length,
                footer: "ລິ້ງແຕ່ລະອັນໃຊ້ເຊັນໄດ້ຄັ້ງດຽວ ແລະ ໝົດອາຍຸຕາມເວລາທີ່ລະບຸ (ເວລາລາວ). ຢ່າສົ່ງຕໍ່ລິ້ງໃຫ້ຜູ້ອື່ນ.",
              });
              await sendEmail(env, { to, subject: mail.subject, text: mail.text, html: mail.html });
              emailSent++;
            } catch (mailErr) {
              console.error("pending-sign-reminders dsm", team, mailErr && mailErr.message);
              const em = String((mailErr && mailErr.message) || "");
              if (em.startsWith("MAIL_NOT_CONFIGURED") || em.startsWith("GMAIL_TOKEN_FAILED")) { mailStopped = em.startsWith("MAIL_NOT_CONFIGURED") ? "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ Gmail (GMAIL_* secrets)" : "Gmail Token ໃຊ້ບໍ່ໄດ້ (ໝົດອາຍຸ/ຖືກຖອນ)"; emailSkipped.push(team); }
              else emailFailed.push(team);
            }
          }
          const parts = [`ສົ່ງອີເມວຫາ DSM ສຳເລັດ ${emailSent} Team`];
          if (mailStopped) parts.push(`ສົ່ງອີເມວບໍ່ໄດ້: ${mailStopped}`);
          if (noDsm.length) parts.push(`ບໍ່ພົບ DSM ຂອງ Team: ${noDsm.join(", ")}`);
          if (noEmail.length) parts.push(`DSM ຍັງບໍ່ມີອີເມວ (ເພີ່ມໃນໜ້າຈັດການ DSM): ${noEmail.join(", ")}`);
          if (emailFailed.length) parts.push(`ສົ່ງອີເມວບໍ່ສຳເລັດ: ${emailFailed.join(", ")}`);
          if (nothing.length) parts.push(`ບໍ່ມີເອກະສານລໍ DSM ເຊັນແລ້ວ: ${nothing.join(", ")}`);
          if (emailSkipped.length && !mailStopped) parts.push(`ຍັງບໍ່ໄດ້ສົ່ງ: ${emailSkipped.join(", ")}`);
          return Response.json({ message: parts.join("\n"), emailSent, linkCount });
        }
        return Response.json({ error: "kind ບໍ່ຖືກຕ້ອງ" }, { status: 400 });
      } catch (e) {
        console.error("/api/admin/pending-sign-reminders/send", e);
        return Response.json({ error: `ແຈ້ງເຕືອນລົ້ມເຫລວ: ${e.message || e}` }, { status: 500 });
      }
    }

    // 6b. Admin Save Asset API (เพิ่ม / แก้ไข)
    if (url.pathname === "/api/admin/save-asset" && request.method === "POST") {
      try {
        const { userId, id, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, status, qr_code, serial_number, capex, latitude, longitude, old_outlet_code, old_outlet_name, old_latitude, old_longitude } = await request.json();

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ແກ້ໄຂ/ເພີ່ມ Asset ໄດ້" }, { status: 403 });
        }

        if (!outlet_code || !outlet_name || !mde_code) {
          return Response.json({ error: "ກະລຸນາປ້ອນ Outlet Code, Outlet Name ແລະ MDE Code ໃຫ້ຄົບ" }, { status: 400 });
        }

        // Doc Type "ຕູ້ເຄື່ອນຍ້າຍ" ต้องระบุข้อมูลร้านเดิม (Outlet Code/Name) และ Lat/Long ของร้านเดิมด้วยเสมอ
        const RELOCATION_DOC_TYPE = "ຕູ້ເຄື່ອນຍ້າຍ";
        if (doc_type === RELOCATION_DOC_TYPE) {
          if (!old_outlet_code || !old_outlet_name || old_latitude === '' || old_latitude === undefined || old_latitude === null ||
              old_longitude === '' || old_longitude === undefined || old_longitude === null) {
            return Response.json({ error: "Doc Type ຕູ້ເຄື່ອນຍ້າຍ ຕ້ອງປ້ອນ Outlet Code, Outlet Name ແລະ Lat/Long ຂອງຮ້ານເດີມໃຫ້ຄົບ" }, { status: 400 });
          }
          if (isNaN(Number(old_latitude)) || isNaN(Number(old_longitude))) {
            return Response.json({ error: "Lat/Long ຂອງຮ້ານເດີມຕ້ອງເປັນຕົວເລກເທົ່ານັ້ນ" }, { status: 400 });
          }
        }

        const lat = (latitude === '' || latitude === undefined) ? null : Number(latitude);
        const lng = (longitude === '' || longitude === undefined) ? null : Number(longitude);
        const oldLat = (old_latitude === '' || old_latitude === undefined || old_latitude === null) ? null : Number(old_latitude);
        const oldLng = (old_longitude === '' || old_longitude === undefined || old_longitude === null) ? null : Number(old_longitude);

        // ກັນ QR/Serial/CapEx ຊໍ້າກັບ Asset ແຖວອື່ນ (ບໍ່ຈຳກັດສະເພາະຮ້ານດຽວກັນ - ກວດທົ່ວທັງລະບົບ)
        const dupError = await findQrSerialCapexDuplicate(env, "assets", { qr_code, serial_number, capex }, id || null, DELIVERED_STATUS); // ບໍ່ນັບແຖວ "ສຳເລັດ" ວ່າຊໍ້າ
        if (dupError) return Response.json({ error: dupError }, { status: 400 });

        if (id) {
          // แก้ไขข้อมูลเดิม - Tracking No ถูกล็อคไว้ไม่ให้แก้ เพื่อกันชนกัน
          const existingAsset = await env.DB.prepare("SELECT status, tracking_no FROM assets WHERE id = ?").bind(id).first();

          await env.DB.prepare(
            `UPDATE assets SET outlet_code = ?, outlet_name = ?, cooler_brand = ?, cooler_type = ?,
             mde_code = ?, doc_type = ?, qr_code = ?, serial_number = ?, capex = ?, latitude = ?, longitude = ?,
             old_outlet_code = ?, old_outlet_name = ?, old_latitude = ?, old_longitude = ?, status = ?, last_update = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code || null, serial_number || null, capex || null, lat, lng,
            old_outlet_code || null, old_outlet_name || null, oldLat, oldLng, status, id).run();

          // ແຈ້ງເຕືອນ warehouse/delivery ຖ້າສະຖານະຖືກປ່ຽນເປັນ "ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ" ຫຼື "ຢູ່ລະຫວ່າງຈັດສົ່ງ" (ບໍ່ໃຫ້ error ຕົງນີ້ເຮັດໃຫ້ save ລົ້ມເຫລວ)
          if (existingAsset && existingAsset.status !== status && DISPATCH_NOTIFY_STATUSES.includes(status)) {
            try {
              const mdeName = await getMdeName(env, mde_code);
              const detailLine = formatMdeOutletLine(mde_code, mdeName, outlet_name);
              await sendWebPushToRoles(env, ["warehouse", "delivery"], {
                title: "ມີລາຍການຈັດສົ່ງໃໝ່",
                body: `${outlet_code || ''} (${status})${detailLine ? '\n' + detailLine : ''}\nກະລຸນາມາເອົາເອກະສານນຳ Admin`,
                url: "asset",
              });
            } catch (pushErr) { /* ไม่ต้องทำอะไร ปล่อยให้ save สำเร็จตามปกติ */ }
          }

          // ແຈ້ງເຕືອນ user (MDE) ຂອງລາຍການນີ້ ທຸກຄັ້ງທີ່ status ປ່ຽນ (ໃຊ້ mde_code ປັດຈຸບັນ ເຜື່ອ admin ປ່ຽນ MDE ນຳໄປພ້ອມກັນ)
          if (existingAsset && existingAsset.status !== status) {
            await notifyMdeUserOfStatusChange(env, mde_code, existingAsset.tracking_no, outlet_name, status);
          }

          return Response.json({ message: "ແກ້ໄຂຂໍ້ມູນ Asset ຮຽບຮ້ອຍແລ້ວ" });
        } else {
          // เพิ่มรายการໃໝ່ - ใส่ placeholder ชั่วคราวเพื่อผ่าน NOT NULL/UNIQUE ก่อน แล้วสร้าง Tracking No จริงจาก id ที่ได้
          const placeholder = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const insertResult = await env.DB.prepare(
            `INSERT INTO assets (tracking_no, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code, serial_number, capex, latitude, longitude, old_outlet_code, old_outlet_name, old_latitude, old_longitude, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(placeholder, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code || null, serial_number || null, capex || null, lat, lng,
            old_outlet_code || null, old_outlet_name || null, oldLat, oldLng, status || 'Active').run();

          const newId = insertResult.meta.last_row_id;
          const trackingNo = `TRK${String(newId).padStart(4, '0')}`;
          await env.DB.prepare("UPDATE assets SET tracking_no = ? WHERE id = ?").bind(trackingNo, newId).run();

          // ແຈ້ງເຕືອນ warehouse/delivery ຖ້າສ້າງ Asset ໃໝ່ ພ້ອມຕັ້ງສະຖານະເປັນ "ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ" ຫຼື "ຢູ່ລະຫວ່າງຈັດສົ່ງ" ທັນທີ
          if (DISPATCH_NOTIFY_STATUSES.includes(status)) {
            try {
              const mdeName = await getMdeName(env, mde_code);
              const detailLine = formatMdeOutletLine(mde_code, mdeName, outlet_name);
              await sendWebPushToRoles(env, ["warehouse", "delivery"], {
                title: "ມີລາຍການຈັດສົ່ງໃໝ່",
                body: `${trackingNo} (${status})${detailLine ? '\n' + detailLine : ''}\nກະລຸນາມາເອົາເອກະສານນຳ Admin`,
                url: "asset",
              });
            } catch (pushErr) { /* ไม่ต้องทำอะไร ปล่อยให้ save สำเร็จตามปกติ */ }
          }

          // ແຈ້ງເຕືອນ user (MDE) ນັບການສ້າງລາຍການໃໝ່ນີ້ເປັນ "status ປ່ຽນ" ນຳ (ຈາກບໍ່ມີ -> ມີ status ນີ້)
          await notifyMdeUserOfStatusChange(env, mde_code, trackingNo, outlet_name, status || 'Active');

          return Response.json({ message: `ເພີ່ມລາຍການ Asset ໃໝ່ຮຽບຮ້ອຍແລ້ວ (Tracking No: ${trackingNo})`, tracking_no: trackingNo });
        }
      } catch (e) {
        console.error("/api/admin/save-asset", e);
        const msg = e.message || "";
        if (msg.includes("assets.tracking_no")) {
          return Response.json({ error: `Tracking No ນີ້ມີຢູ່ໃນລະບົບແລ້ວ` }, { status: 400 });
        }
        return Response.json({ error: "ບໍ່ສາມາດບັນທຶກຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 6c. Admin Delete Asset API (ลบ)
    if (url.pathname === "/api/admin/delete-asset" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || requester.role !== 'admin') {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລຶບ Asset ໄດ້" }, { status: 403 });
        }

        // ດຶງ key ຮູບໃນ R2 ໄວ້ກ່ອນລົບແຖວໃນ D1 (delivery_photo ຕົວເກົ່າເປັນ base64 ຝັງໃນ D1 ໂດຍກົງ ບໍ່ແມ່ນ R2 key -> ບໍ່ຕ້ອງລົບຢູ່ R2)
        // ດຶງ qr_code/serial_number ໄວ້ນຳ ເພື່ອໃຊ້ sync ສະຕັອກສາງກັບຄືນ "ຢູ່ໃນສາງ" ຫຼັງລຶບ (ຖ້າມີ)
        const assetRow = await env.DB.prepare(
          "SELECT qr_code, serial_number, delivery_photo_qr, delivery_photo_serial, delivery_photo_capex, delivery_photo_asset, delivery_photo_document, delivery_sig_outlet FROM assets WHERE id = ?"
        ).bind(id).first();

        // ຖ້າ Asset ນີ້ເຄີຍອອກ "ໃບສັນຍາຢືມ" (loan_contracts.asset_id REFERENCES assets(id)) ໄວ້ແລ້ວ
        // ການ DELETE FROM assets ຈະຖືກ D1 ບລັອກດ້ວຍ FOREIGN KEY constraint (ເກີດ error ຕອນລຶບ)
        // -> ຕັດການອ້າງອິງອອກກ່ອນ (asset_id = NULL) ໂດຍບໍ່ລຶບໃບສັນຍາຢືມ ເພາະຂໍ້ມູນຮ້ານ/tracking_no ຖືກ copy ໄວ້ໃນ loan_contracts ເອງແລ້ວ
        await env.DB.prepare("UPDATE loan_contracts SET asset_id = NULL WHERE asset_id = ?").bind(id).run();
        // ຕັດການເຊື່ອມຂອງຄຳຂໍ Asset ທີ່ອ້າງເຖິງ Asset ນີ້ນຳ (ບໍ່ໃຫ້ນັບເປັນ "ຄ້າງໃບສັນຍາ" ຫຼັງ Asset ຖືກລຶບ)
        await env.DB.prepare("UPDATE asset_requests SET asset_id = NULL WHERE asset_id = ?").bind(id).run();

        await env.DB.prepare("DELETE FROM assets WHERE id = ?").bind(id).run();
        if (assetRow) {
          await deleteR2Photos(env, [
            assetRow.delivery_photo_qr,
            assetRow.delivery_photo_serial,
            assetRow.delivery_photo_capex,
            assetRow.delivery_photo_asset,
            assetRow.delivery_photo_document,
            assetRow.delivery_sig_outlet,
          ]);
          // Asset ນີ້ຖືກລຶບອອກຈາກລະບົບແລ້ວ -> ຖ້າ QR/Serial ດຽວກັນນີ້ຍັງຄ້າງສະຖານະ "ອອກໄປຮ້ານແລ້ວ" ຢູ່ໃນສະຕັອກສາງ
          // (ຖືກ mark ຕອນອະນຸມັດຄຳຂໍ) ໃຫ້ປ່ຽນກັບຄືນເປັນ "ຢູ່ໃນສາງ" ອັດຕະໂນມັດ ບໍ່ໃຫ້ຄ້າງເປັນ used ຢູ່ຕະຫຼອດໄປ
          await restoreWarehouseStockToWarehouse(
            env,
            { qr_code: assetRow.qr_code, serial_number: assetRow.serial_number },
            (session && session.email) || null,
            `ລຶບລາຍການ Asset Tracking (id ${id}) - ຄືນສະຕັອກກັບເປັນຢູ່ໃນສາງ`
          );
          // ຄຳຂໍ (asset_requests) ທີ່ອະນຸມັດແລ້ວແລ້ວສ້າງ Asset ນີ້ຂຶ້ນມາ -> ປ່ຽນສະຖານະເປັນ "ຍົກເລີກ" (ບໍ່ຄ້າງເປັນ "ອະນຸມັດແລ້ວ" ຄືກັນກັບຄຳຂໍທີ່ຍັງມີ Asset ຢູ່ຈິງ)
          // ຈັບຄູ່ດ້ວຍ qr_code + serial_number (unique ຕໍ່ 1 ອຸປະກອນຈິງ) ເອົາລາຍການທີ່ອະນຸມັດຫຼ້າສຸດ ກັນກໍລະນີ QR/Serial ດຽວກັນເຄີຍຖືກອະນຸມັດ-ລຶບ-ອະນຸມັດໃໝ່ຫຼາຍຮອບ
          if (assetRow.qr_code || assetRow.serial_number) {
            const matchedReq = await env.DB.prepare(
              `SELECT id, team, cooler_brand, cooler_type, asset_condition FROM asset_requests
               WHERE status = 'approved'
                 AND ((qr_code = ? AND qr_code != '') OR (serial_number = ? AND serial_number != ''))
               ORDER BY updated_at DESC LIMIT 1`
            ).bind(assetRow.qr_code || '__none__', assetRow.serial_number || '__none__').first();
            if (matchedReq) {
              await env.DB.prepare(
                "UPDATE asset_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
              ).bind(matchedReq.id).run();
              // ຄຳຂໍ 'ໃໝ່' ຖືກຍົກເລີກ -> ໂຄຕ້າຄືນມາ: ຖ້າງົບປ່ຽນຈາກ ໝົດ ມາເປັນ ມີ ໃຫ້ແຈ້ງເຕືອນ user ຂອງທີມ (ຄືກັນກັບຕອນປະຕິເສດ/ລຶບຄຳຂໍ)
              if ((matchedReq.asset_condition || 'new') === 'new') {
                runInBackground(ctx, notifyBudgetFreedIfWasFull(env, matchedReq.team, matchedReq.cooler_brand, matchedReq.cooler_type));
              }
            }
          }
        }
        return Response.json({ message: "ລຶບລາຍການ Asset ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("delete-asset error:", e && e.message);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 7. Budget API (ดึงงบประมาณ/โควต้า - admin เห็นทุกทีม, user เห็นแค่ทีมตัวเอง)
    if (url.pathname === "/api/budgets" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role, team FROM users WHERE id = ?").bind(userId).first();
      if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

      const usedSubquery = `(SELECT COUNT(*) FROM asset_requests r WHERE r.status IN ('pending','approved')
        AND IFNULL(r.asset_condition, 'new') = 'new'
        AND r.team = b.team AND IFNULL(r.cooler_brand,'') = IFNULL(b.cooler_brand,'') AND IFNULL(r.cooler_type,'') = IFNULL(b.cooler_type,'')
        AND (b.period_start IS NULL OR r.requested_at >= b.period_start))`;

      // ?archived=1 -> ງົບທີ່ archive ແລ້ວ (ສະເພາະ admin/ຜູ້ເບິ່ງໄດ້ທັງໝົດ) — ຍອດ "ໃຊ້ໄປ" ໃຊ້ຄ່າທີ່ບັນທຶກຕອນ archive
      if (url.searchParams.get("archived") === "1") {
        if (!canViewAll(requester.role)) return Response.json({ error: "ບໍ່ມີສິດ" }, { status: 403 });
        const { results: ar } = await env.DB.prepare(
          `SELECT b.*, IFNULL(b.archived_used, 0) AS used FROM budgets b WHERE b.archived_at IS NOT NULL ORDER BY b.archived_at DESC, b.team, b.cooler_brand`
        ).all();
        return Response.json(ar || []);
      }

      let results;
      if (canViewAll(requester.role)) {
        ({ results } = await env.DB.prepare(
          `SELECT b.*, ${usedSubquery} AS used FROM budgets b WHERE b.archived_at IS NULL ORDER BY b.team, b.cooler_brand`
        ).all());
      } else {
        ({ results } = await env.DB.prepare(
          `SELECT b.*, ${usedSubquery} AS used FROM budgets b WHERE b.archived_at IS NULL AND b.team = ? ORDER BY b.cooler_brand`
        ).bind(requester.team).all());
      }
      return Response.json(results || []);
    }

    // 7b. Admin Save Budget API (เพิ่ม / แก้ไข)
    if (url.pathname === "/api/admin/save-budget" && request.method === "POST") {
      try {
        const { id, team, cooler_brand, cooler_type, quota, period_label } = await request.json();
        const periodLabel = String(period_label || "").trim().slice(0, 40) || null;
        if (!team || quota === undefined || quota === null || quota === '') {
          return Response.json({ error: "ກະລຸນາປ້ອນ Team ແລະ ໂຄຕ້າ (ຈຳນວນທີ່ເບີກໄດ້) ໃຫ້ຄົບ" }, { status: 400 });
        }

        // ແຈ້ງເຕືອນ user ຂອງທີມ ຖ້າງົບເພີ່ມ/ມີໃໝ່ ແລະ ຍັງເຫຼືອໃຫ້ເບີກ (ຄິດຫຼັງບັນທຶກແລ້ວ ບໍ່ໃຫ້ error ຕົງນີ້ເຮັດໃຫ້ save ລົ້ມ)
        const notifyBudgetAdded = (oldRow, newPeriod) => {
          const newQuota = Number(quota);
          if (!Number.isFinite(newQuota) || newQuota <= 0) return;
          const identityChanged = !oldRow
            || oldRow.team !== team
            || (oldRow.cooler_brand || '') !== (cooler_brand || '')
            || (oldRow.cooler_type || '') !== (cooler_type || '');
          const increased = !oldRow || identityChanged || newQuota > Number(oldRow.quota);
          if (!increased) return;
          runInBackground(ctx, (async () => {
            const used = await getBudgetUsed(env, team, cooler_brand, cooler_type);
            const remaining = newQuota - used;
            if (remaining > 0) {
              await notifyTeamBudgetAvailable(env, { team, brand: cooler_brand, type: cooler_type, quota: newQuota, remaining, freed: false, newPeriod: !!newPeriod, periodLabel });
            }
          })());
        };

        if (id) {
          const oldRow = await env.DB.prepare("SELECT team, cooler_brand, cooler_type, quota FROM budgets WHERE id = ?").bind(id).first();
          await env.DB.prepare(
            "UPDATE budgets SET team = ?, cooler_brand = ?, cooler_type = ?, quota = ?, period_label = ? WHERE id = ?"
          ).bind(team, cooler_brand, cooler_type, quota, periodLabel, id).run();
          if (oldRow) notifyBudgetAdded(oldRow);
          return Response.json({ message: "ແກ້ໄຂງົບປະມານຮຽບຮ້ອຍແລ້ວ" });
        } else {
          // ກັນກົດຊ້ຳ: ຖ້າງົບ Team/Brand/Type/ໂຄຕ້າ ດຽວກັນ ຖືກເພີ່ມພາຍໃນ 30 ວິນາທີ ຈະບໍ່ເພີ່ມແຖວຊ້ຳ ແລະ ບໍ່ແຈ້ງເຕືອນຊ້ຳ
          const budIns = await env.DB.prepare(
            // period_start = ເວລາ archive ຫຼ້າສຸດຂອງງົບເກົ່າ (Team/Brand/Type ດຽວກັນ) -> ງົບໃໝ່ເລີ່ມນັບຈາກ 0 ບໍ່ຊ້ອນກັບຍອດຮອບກ່ອນ
            `INSERT INTO budgets (team, cooler_brand, cooler_type, quota, period_label, period_start)
             SELECT ?1, ?2, ?3, ?4, ?5,
                    (SELECT MAX(archived_at) FROM budgets WHERE team = ?1 AND IFNULL(cooler_brand, '') = IFNULL(?2, '') AND IFNULL(cooler_type, '') = IFNULL(?3, '') AND archived_at IS NOT NULL)
              WHERE NOT EXISTS (
                SELECT 1 FROM budgets
                 WHERE team = ?1 AND IFNULL(cooler_brand, '') = IFNULL(?2, '') AND IFNULL(cooler_type, '') = IFNULL(?3, '')
                   AND quota = ?4 AND archived_at IS NULL AND created_at >= datetime('now', '-30 seconds'))`
          ).bind(team, cooler_brand, cooler_type, quota, periodLabel).run();
          if (budIns.meta && budIns.meta.changes) {
            // ງົບຮອບໃໝ່ = ມີງົບ archive ຂອງ Team/Brand/Type ດຽວກັນມາກ່ອນ (ຫຼື admin ໃສ່ຊື່ຮອບ) -> ແຈ້ງເຕືອນວ່າ "ງົບຮອບໃໝ່ເປີດແລ້ວ"
            const prev = await env.DB.prepare(
              "SELECT 1 AS x FROM budgets WHERE team = ? AND IFNULL(cooler_brand,'') = IFNULL(?, '') AND IFNULL(cooler_type,'') = IFNULL(?, '') AND archived_at IS NOT NULL LIMIT 1"
            ).bind(team, cooler_brand, cooler_type).first();
            notifyBudgetAdded(null, !!prev || !!periodLabel);
          }
          return Response.json({ message: "ເພີ່ມງົບປະມານໃໝ່ຮຽບຮ້ອຍແລ້ວ" });
        }
      } catch (e) {
        console.error("/api/admin/save-budget", e);
        return Response.json({ error: "ບໍ່ສາມາດບັນທຶກຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 7b-0. Admin Back up data: ສົ່ງອອກທຸກຕາຕະລາງຂອງ D1 ເປັນໄຟລ໌ JSON (stream ເທື່ອລະ 100 ແຖວ ບໍ່ໃຫ້ຫນ່ວຍຄວາມຈຳເຕັມ)
    // ໝາຍເຫດ: ບໍ່ລວມຮູບໃນ R2 (PHOTOS); ໄຟລ໌ມີຂໍ້ມູນລະອຽດອ່ອນ (ເຊັ່ນ hash ລະຫັດຜ່ານ) ຈຶ່ງໃຫ້ສະເພາະ admin (ຜູ້ຊ່ວຍ admin ຖືກຫ້າມ)
    if (url.pathname === "/api/admin/backup" && request.method === "GET") {
      try {
        const tbl = await env.DB.prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
        ).all();
        const tables = (tbl.results || []).filter(t => /^[A-Za-z0-9_]+$/.test(t.name));
        const enc = new TextEncoder();
        const { readable, writable } = new TransformStream();
        const w = writable.getWriter();
        const stamp = new Date().toISOString();
        ctx.waitUntil((async () => {
          try {
            const schema = {}; tables.forEach(t => { schema[t.name] = t.sql || null; });
            await w.write(enc.encode('{"meta":' + JSON.stringify({ app: "cloudflare-approval-app", exported_at: stamp, table_count: tables.length, schema }) + ',"tables":{'));
            let firstTable = true;
            for (const t of tables) {
              await w.write(enc.encode((firstTable ? "" : ",") + JSON.stringify(t.name) + ":["));
              firstTable = false;
              let lastRid = 0, firstRow = true, page = 100, useRowid = true, offset = 0;
              for (;;) {
                let rows;
                try {
                  rows = useRowid
                    ? (await env.DB.prepare(`SELECT rowid AS __rid, * FROM "${t.name}" WHERE rowid > ? ORDER BY rowid LIMIT ${page}`).bind(lastRid).all()).results
                    : (await env.DB.prepare(`SELECT * FROM "${t.name}" LIMIT ${page} OFFSET ${offset}`).all()).results;
                } catch (qErr) {
                  if (useRowid) { useRowid = false; continue; }      // ຕາຕະລາງ WITHOUT ROWID -> ໃຊ້ OFFSET
                  if (page > 10) { page = 10; continue; }            // ແຖວໃຫຍ່ (ເຊັ່ນ ຮູບ base64) -> ຫຼຸດຂະໜາດໜ້າ
                  throw qErr;
                }
                if (!rows || !rows.length) break;
                let chunk = "";
                for (const r of rows) {
                  if (useRowid) { lastRid = r.__rid; delete r.__rid; }
                  chunk += (firstRow ? "" : ",") + JSON.stringify(r);
                  firstRow = false;
                }
                if (!useRowid) offset += rows.length;
                await w.write(enc.encode(chunk));
                if (rows.length < page) break;
              }
              await w.write(enc.encode("]"));
            }
            await w.write(enc.encode("}}"));
          } catch (streamErr) {
            console.error("/api/admin/backup stream", streamErr);
            try { await w.abort(streamErr); } catch (e) { /* ignore */ }
            return;
          }
          try { await w.close(); } catch (e) { /* ignore */ }
        })());
        return new Response(readable, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="backup_${stamp.slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1_$2")}.json"`,
            "Cache-Control": "no-store",
          },
        });
      } catch (e) {
        console.error("/api/admin/backup", e);
        return Response.json({ error: "ສຳຮອງຂໍ້ມູນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // 7b-0b. Admin Back up (Excel): ດຶງຂໍ້ມູນ "ສະຕັອກສາງ" + "ປະຫວັດການຈັດສົ່ງ Asset" ທັງໝົດ (ບໍ່ຕິດຕົວກອງ) ໃນຄັ້ງດຽວ
    // ໜ້າເວັບຈະສ້າງໄຟລ໌ .xlsx ດຽວ (ແຍກ sheet) ຈາກຂໍ້ມູນນີ້. ບໍ່ລວມຮູບ (R2) ແລະ ບໍ່ມີ hash ລະຫັດຜ່ານ
    // ຜູ້ຊ່ວຍ admin (assistant_admin) ໃຊ້ໄດ້ (ບໍ່ຢູ່ໃນ ASSISTANT_ADMIN_DENIED_PATHS) ເພາະເປັນ Export ຂໍ້ມູນທຸລະກິດ; ສ່ວນ /api/admin/backup (JSON ທຸກຕາຕະລາງ + hash ລະຫັດຜ່ານ) ຍັງຫ້າມຢູ່
    if (url.pathname === "/api/admin/backup-excel" && request.method === "GET") {
      try {
        const { results: stock } = await env.DB.prepare(
          `SELECT ws.id, w.code AS warehouse_code, w.name AS warehouse_name,
                  ws.cooler_brand, ws.cooler_type, ws.cooler_model, ws.cooler_status,
                  ws.qr_code, ws.serial_number, ws.capex, ws.status, ws.notes,
                  ws.created_at, ws.updated_at
           FROM warehouse_stock ws
           LEFT JOIN wh_warehouses w ON w.id = ws.warehouse_id
           ORDER BY w.code, ws.id`
        ).all();

        const { results: deliveredRaw } = await env.DB.prepare(
          `SELECT a.id, a.tracking_no, a.outlet_code, a.outlet_name, a.cooler_brand, a.cooler_type,
                  a.mde_code, m.mde_name, a.doc_type, a.asset_condition, a.qr_code, a.serial_number, a.capex,
                  a.latitude, a.longitude, a.old_outlet_code, a.old_outlet_name, a.old_latitude, a.old_longitude,
                  a.status, a.delivered_at, a.delivered_by, a.self_moved,
                  a.admin_verified, a.admin_verified_by, a.admin_verified_at,
                  a.flagged, a.contract_doc_manual, a.delivery_photo_document, a.last_update
           FROM assets a
           LEFT JOIN mde_list m ON m.mde_code = a.mde_code
           WHERE a.status = ?
           ORDER BY a.last_update DESC`
        ).bind("ສຳເລັດ").all();
        const delivered = await attachDocStates(env, deliveredRaw || []);
        // ບໍ່ສົ່ງ key ຂອງຮູບໄປໜ້າເວັບ (ສົ່ງສະເພາະ delivery_doc_state ທີ່ຄຳນວນແລ້ວ)
        delivered.forEach((a) => { delete a.delivery_photo_document; });

        return Response.json({
          exported_at: new Date().toISOString(),
          warehouse_stock: stock || [],
          asset_delivery_history: delivered,
        }, { headers: { "Cache-Control": "no-store" } });
      } catch (e) {
        console.error("/api/admin/backup-excel", e);
        return Response.json({ error: "ສຳຮອງຂໍ້ມູນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // 7b-1. Admin ໂອນ Spare Cooler ໃຫ້ທີມ (ເມື່ອງົບທີມໝົດ) — ຫັກໂຄຕ້າຈາກແຖວ Spare ແລ້ວເພີ່ມໃຫ້ທີມ (Brand/Type ດຽວກັນກັບ Spare)
    if (url.pathname === "/api/admin/transfer-spare" && request.method === "POST") {
      try {
        const { spare_id, to_team, quantity, note } = await request.json();
        const qty = Number(quantity);
        const toTeam = String(to_team || "").trim();
        if (!spare_id || !toTeam || !Number.isInteger(qty) || qty <= 0) {
          return Response.json({ error: "ກະລຸນາເລືອກທີມ ແລະ ປ້ອນຈຳນວນທີ່ໂອນ (ຈຳນວນເຕັມ ຫຼາຍກວ່າ 0)" }, { status: 400 });
        }
        if (toTeam === SPARE_TEAM) return Response.json({ error: "ບໍ່ສາມາດໂອນໃຫ້ Spare ດ້ວຍກັນເອງ" }, { status: 400 });
        const spare = await env.DB.prepare(
          "SELECT id, cooler_brand, cooler_type, quota, period_label FROM budgets WHERE id = ? AND team = ? AND archived_at IS NULL"
        ).bind(spare_id, SPARE_TEAM).first();
        if (!spare) return Response.json({ error: "ບໍ່ພົບ Spare Cooler ລາຍການນີ້" }, { status: 404 });
        if (qty > Number(spare.quota)) {
          return Response.json({ error: `Spare ເຫຼືອ ${spare.quota} ຕູ້ ໂອນເກີນບໍ່ໄດ້` }, { status: 409 });
        }
        // ຫັກ Spare ກ່ອນ (ມີເງື່ອນໄຂ quota >= qty ກັນສອງຄົນກົດພ້ອມກັນຈົນຕິດລົບ)
        const ded = await env.DB.prepare(
          "UPDATE budgets SET quota = quota - ?1 WHERE id = ?2 AND quota >= ?1 AND archived_at IS NULL"
        ).bind(qty, spare.id).run();
        if (!(ded.meta && ded.meta.changes)) {
          return Response.json({ error: "Spare ບໍ່ພໍ — ກະລຸນາໂຫລດໜ້າໃໝ່ແລ້ວລອງອີກຄັ້ງ" }, { status: 409 });
        }
        let newQuota = qty;
        try {
          const tgt = await env.DB.prepare(
            "SELECT id, quota FROM budgets WHERE team = ? AND IFNULL(cooler_brand,'') = IFNULL(?, '') AND IFNULL(cooler_type,'') = IFNULL(?, '') AND archived_at IS NULL"
          ).bind(toTeam, spare.cooler_brand ?? null, spare.cooler_type ?? null).first();
          if (tgt) {
            newQuota = Number(tgt.quota) + qty;
            await env.DB.prepare("UPDATE budgets SET quota = quota + ? WHERE id = ?").bind(qty, tgt.id).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO budgets (team, cooler_brand, cooler_type, quota, period_label, period_start)
               SELECT ?1, ?2, ?3, ?4, ?5,
                      (SELECT MAX(archived_at) FROM budgets WHERE team = ?1 AND IFNULL(cooler_brand,'') = IFNULL(?2,'') AND IFNULL(cooler_type,'') = IFNULL(?3,'') AND archived_at IS NOT NULL)`
            ).bind(toTeam, spare.cooler_brand ?? null, spare.cooler_type ?? null, qty, spare.period_label ?? null).run();
          }
        } catch (addErr) {
          // ເພີ່ມໃຫ້ທີມບໍ່ສຳເລັດ -> ຄືນໂຄຕ້າໃຫ້ Spare
          await env.DB.prepare("UPDATE budgets SET quota = quota + ? WHERE id = ?").bind(qty, spare.id).run();
          throw addErr;
        }
        try { // ບັນທຶກປະຫວັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration ກໍບໍ່ກະທົບການໂອນ)
          await env.DB.prepare(
            "INSERT INTO budget_transfers (from_team, to_team, cooler_brand, cooler_type, quantity, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(SPARE_TEAM, toTeam, spare.cooler_brand ?? null, spare.cooler_type ?? null, qty, String(note || "").trim().slice(0, 200) || null, url.searchParams.get("userId") || null).run();
        } catch (logErr) { console.error("budget_transfers log", logErr); }
        runInBackground(ctx, (async () => {
          const used = await getBudgetUsed(env, toTeam, spare.cooler_brand, spare.cooler_type);
          const remaining = newQuota - used;
          if (remaining > 0) await notifyTeamBudgetAvailable(env, { team: toTeam, brand: spare.cooler_brand, type: spare.cooler_type, quota: newQuota, remaining, freed: false });
        })());
        return Response.json({ message: `ໂອນ Spare ${qty} ຕູ້ ໃຫ້ທີມ ${toTeam} ຮຽບຮ້ອຍແລ້ວ`, spare_left: Number(spare.quota) - qty });
      } catch (e) {
        console.error("/api/admin/transfer-spare", e);
        return Response.json({ error: "ໂອນ Spare ບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // 7b-2. Admin Archive Budget — ເກັບງົບທີ່ໃຊ້ໝົດ/ໝົດປີ ເຂົ້າ Archive (ບໍ່ຖືກນັບອີກ) ເພື່ອເພີ່ມງົບຮອບໃໝ່ (Team/Brand/Type ດຽວກັນ) ໂດຍບໍ່ຊ້ອນ
    if (url.pathname === "/api/admin/archive-budget" && request.method === "POST") {
      try {
        const { id, label } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການ" }, { status: 400 });
        const row = await env.DB.prepare("SELECT team, cooler_brand, cooler_type, period_start, period_label, archived_at FROM budgets WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບງົບນີ້" }, { status: 404 });
        if (row.archived_at) return Response.json({ error: "ງົບນີ້ຖືກ archive ແລ້ວ" }, { status: 409 });
        const used = await getBudgetUsed(env, row.team, row.cooler_brand, row.cooler_type);
        const lbl = String(label || "").trim().slice(0, 40) || row.period_label || String(new Date().getUTCFullYear());
        await env.DB.prepare(
          "UPDATE budgets SET archived_at = CURRENT_TIMESTAMP, archived_used = ?, period_label = ? WHERE id = ? AND archived_at IS NULL"
        ).bind(used, lbl, id).run();
        return Response.json({ message: "Archive ງົບຮຽບຮ້ອຍແລ້ວ — ເພີ່ມງົບຮອບໃໝ່ໄດ້ເລີຍ (ເລີ່ມນັບຈາກ 0)" });
      } catch (e) {
        console.error("/api/admin/archive-budget", e);
        return Response.json({ error: "Archive ບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_budget_archive.sql ກະລຸນາຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // 7c. Admin Delete Budget API (ลบ)
    if (url.pathname === "/api/admin/delete-budget" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        // ດຶງຂໍ້ມູນໄວ້ກ່ອນລຶບ ເພື່ອແຈ້ງເຕືອນທີມທີ່ກ່ຽວຂ້ອງວ່າງົບປະມານນີ້ຖືກເອົາອອກແລ້ວ
        const budgetRow = await env.DB.prepare(
          "SELECT team, cooler_brand, cooler_type, archived_at FROM budgets WHERE id = ?"
        ).bind(id).first();

        await env.DB.prepare("DELETE FROM budgets WHERE id = ?").bind(id).run();

        if (budgetRow && !budgetRow.archived_at) { // ລຶບງົບທີ່ archive ແລ້ວ ບໍ່ແຈ້ງເຕືອນທີມ
          const label = [budgetRow.cooler_brand, budgetRow.cooler_type].filter(Boolean).join(' ') || 'Asset';
          runInBackground(ctx, (async () => {
            const users = await env.DB.prepare(
              "SELECT id FROM users WHERE team = ? AND role = 'user' AND status = 'approved'"
            ).bind(budgetRow.team).all();
            const payload = {
              title: "ງົບປະມານຖືກເອົາອອກ",
              body: `${label} - ງົບປະມານນີ້ຖືກ admin ລຶບອອກແລ້ວ, ບໍ່ສາມາດເບີກປະເພດນີ້ໄດ້ອີກ`,
              url: "teamBudget",
            };
            for (const u of (users.results || [])) {
              await sendWebPushToUser(env, u.id, payload);
            }
          })());
        }

        return Response.json({ message: "ລຶບງົບປະມານຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-budget", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 7d. Delivery Confirmation - ຄົ້ນຫາ Asset จาก QR Code (สแกนก่อนยืนยันจัดส่ง)
    if (url.pathname === "/api/asset-tracking/lookup-by-qr" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const qrCode = String(url.searchParams.get("qr_code") || "").trim();
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });
      if (!qrCode) return Response.json({ error: "ບໍ່ພົບ QR Code" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role, mde_code, team FROM users WHERE id = ?").bind(userId).first();
      if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

      const DELIVERED_STATUS = "ສຳເລັດ";
      // user ທົ່ວໄປຄົ້ນຫາໄດ້ສະເພາະ Asset ຂອງ MDE ຕົນເອງ
      const scopeSql = canViewAll(requester.role) ? "" : " AND mde_code = ?";
      const scopeArgs = canViewAll(requester.role) ? [] : [requester.mde_code];

      // 1) ຈັບຄູ່ຕົງເປ໊ະກ່ອນ
      let rows = ((await env.DB.prepare(
        `SELECT * FROM assets WHERE qr_code = ?${scopeSql} LIMIT 6`
      ).bind(qrCode, ...scopeArgs).all()).results) || [];

      // 2) ບໍ່ພົບ -> ຈັບຄູ່ແບບ "ລົງທ້າຍດ້ວຍຄ່າທີ່ປ້ອນ" (ເຊັ່ນ QR ຈິງ CL-12345 ແຕ່ປ້ອນ 12345)
      //    escape ຕົວ % _ \ ທີ່ຜູ້ໃຊ້ປ້ອນ ບໍ່ໃຫ້ເປັນ wildcard
      if (rows.length === 0) {
        const escaped = qrCode.replace(/[\\%_]/g, "\\$&");
        rows = ((await env.DB.prepare(
          `SELECT * FROM assets WHERE qr_code LIKE ? ESCAPE '\\'${scopeSql} LIMIT 6`
        ).bind("%" + escaped, ...scopeArgs).all()).results) || [];
      }

      if (rows.length === 0) {
        return Response.json({ found: false, error: "ບໍ່ພົບ Asset ທີ່ມີ QR Code ນີ້ໃນລະບົບ" });
      }
      // ພົບຫຼາຍກວ່າ 1 ລາຍການ -> ບໍ່ເດົາ ໃຫ້ຜູ້ໃຊ້ປ້ອນ QR Code ໃຫ້ຄົບ (ກັນຢືນຢັນຈັດສົ່ງຜິດຕູ້)
      if (rows.length > 1) {
        const shown = rows.slice(0, 5).map((r) => r.qr_code).join(", ");
        return Response.json({
          found: false,
          ambiguous: true,
          error: `ພົບຫຼາຍກວ່າ 1 ລາຍການທີ່ກົງກັບ "${qrCode}" (${shown}${rows.length > 5 ? ", ..." : ""}) ກະລຸນາປ້ອນ QR Code ໃຫ້ຄົບຖ້ວນ`,
        });
      }

      const assetRow = rows[0];
      if (assetRow.status === DELIVERED_STATUS) {
        return Response.json({ found: true, already_delivered: true, item: assetRow, error: "Asset ນີ້ຈັດສົ່ງສຳເລັດໄປແລ້ວ" });
      }
      const loanForAsset = await findLoanContractForAsset(env, assetRow);
      return Response.json({
        found: true, already_delivered: false, item: assetRow,
        loan_contract: loanForAsset ? { id: loanForAsset.id, doc_no: loanForAsset.doc_no, status: loanForAsset.status } : null,
      });
    }

    // 7d-2. ສະແກນຕູ້ອອກຈາກສາງຂຶ້ນລົດ — ຜູ້ສະແກນກວດຮ້ານ/ຕູ້/ເອກະສານຈາກໜ້າຈໍແລ້ວກົດຢືນຢັນ:
    //   Asset "ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ" -> "ຢູ່ລະຫວ່າງຈັດສົ່ງ" (ຢູ່ເທິງລົດ ກຳລັງໄປຮ້ານ), ສະຕັອກສາງ = "ຢູ່ເທິງລົດ"
    //   outlet_code (ບໍ່ບັງຄັບ): ຖ້າສົ່ງມາ ຕ້ອງກົງກັບຮ້ານຂອງ Asset (ເກັບໄວ້ເພື່ອຄວາມເຂົ້າກັນໄດ້ກັບໜ້າຈໍເກົ່າ)
    if (url.pathname === "/api/asset-delivery/dispatch" && request.method === "POST") {
      try {
        const { userId, id, outlet_code } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });
        const checkCode = String(outlet_code || "").trim();

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !canViewAll(requester.role)) return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });

        const assetRow = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();
        if (!assetRow) return Response.json({ error: "ບໍ່ພົບ Asset ນີ້ໃນລະບົບ" }, { status: 404 });

        const DELIVERED_STATUS = "ສຳເລັດ";
        const ON_TRUCK_STATUS = "ຢູ່ລະຫວ່າງຈັດສົ່ງ";
        const MOVE_STATUS = "ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ";
        if (assetRow.status === DELIVERED_STATUS) return Response.json({ error: "Asset ນີ້ຈັດສົ່ງສຳເລັດໄປແລ້ວ" }, { status: 400 });
        if (assetRow.doc_type === RETURN_TO_WAREHOUSE_DOC_TYPE) {
          return Response.json({ error: "ເອກະສານ \"ເກັບຄືນສາງ\" ບໍ່ຕ້ອງສະແກນອອກສາງ (ຕູ້ມາຈາກຮ້ານ)" }, { status: 400 });
        }
        if (assetRow.status === ON_TRUCK_STATUS && assetRow.dispatched_at) {
          return Response.json({ error: `ຕູ້ນີ້ຢູ່ເທິງລົດແລ້ວ (ສະແກນອອກສາງເມື່ອ ${assetRow.dispatched_at})` }, { status: 400 });
        }
        // ອອກສາງໄດ້ສະເພາະຕູ້ທີ່ Admin ຕັ້ງ "ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ" ແລ້ວ (ຫຼັງ MDE ຊັບມິດ PowerApp ຜ່ານ)
        // ຍັງຍອມ "ຢູ່ລະຫວ່າງຈັດສົ່ງ"/"ຢູ່ລະຫວ່າງເຄື່ອນຍ້າຍ" ທີ່ຍັງບໍ່ເຄີຍສະແກນອອກສາງ (ຂໍ້ມູນເກົ່າກ່ອນມີຂັ້ນຕອນນີ້)
        const DISPATCHABLE = [WAITING_DISPATCH_STATUS, ON_TRUCK_STATUS, MOVE_STATUS];
        if (!DISPATCHABLE.includes(assetRow.status)) {
          return Response.json({
            code: "NOT_WAITING_DISPATCH",
            error: `ຕູ້ນີ້ຍັງອອກສາງບໍ່ໄດ້ — ສະຖານະປັດຈຸບັນ "${assetRow.status || "-"}" (ຕ້ອງເປັນ "${WAITING_DISPATCH_STATUS}" ກ່ອນ ຫຼັງຈາກ MDE ຊັບມິດ PowerApp ຜ່ານ ແລະ Admin ຢືນຢັນ)`,
          }, { status: 400 });
        }
        if (checkCode && String(assetRow.outlet_code || "").trim().toLowerCase() !== checkCode.toLowerCase()) {
          return Response.json({
            code: "WRONG_OUTLET",
            error: `ຜິດຮ້ານ! ຕູ້ນີ້ຕ້ອງສົ່ງໄປ ${assetRow.outlet_code || "-"} - ${assetRow.outlet_name || "-"} (ບໍ່ແມ່ນ ${checkCode})`,
          }, { status: 400 });
        }

        const actor = requester.email || String(userId);
        const upd = await env.DB.prepare(
          `UPDATE assets SET status = ?, dispatched_at = CURRENT_TIMESTAMP, dispatched_by = ?, last_update = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN (?, ?, ?)`
        ).bind(ON_TRUCK_STATUS, actor, id, ...DISPATCHABLE).run();
        if (!upd.meta || upd.meta.changes === 0) return Response.json({ error: "ສະຖານະ Asset ນີ້ຖືກປ່ຽນໄປແລ້ວ ກະລຸນາສະແກນໃໝ່" }, { status: 409 });

        await markWarehouseStockOnTruck(
          env, { qr_code: assetRow.qr_code, serial_number: assetRow.serial_number }, actor,
          `ສະແກນອອກສາງຂຶ້ນລົດ - Tracking No ${assetRow.tracking_no} (Outlet: ${assetRow.outlet_name || "-"})`
        );
        runInBackground(ctx, notifyMdeUserOfStatusChange(env, assetRow.mde_code, assetRow.tracking_no, assetRow.outlet_name, ON_TRUCK_STATUS));

        return Response.json({ message: "ຂຶ້ນລົດຮຽບຮ້ອຍແລ້ວ — ຕູ້ກຳລັງເດີນທາງໄປຮ້ານ" });
      } catch (e) {
        console.error("/api/asset-delivery/dispatch", e);
        return Response.json({ error: "ບໍ່ສາມາດບັນທຶກການສະແກນອອກສາງໄດ້" }, { status: 500 });
      }
    }

    // ລາຍການຕູ້ທີ່ຢູ່ເທິງລົດດຽວນີ້ (ສະແກນອອກສາງແລ້ວ ຍັງບໍ່ທັນຈັດສົ່ງສຳເລັດ)
    if (url.pathname === "/api/asset-delivery/on-truck" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT id, tracking_no, outlet_code, outlet_name, qr_code, cooler_brand, cooler_type, mde_code, dispatched_at, dispatched_by
         FROM assets WHERE status = ? AND dispatched_at IS NOT NULL ORDER BY dispatched_at DESC LIMIT 200`
      ).bind("ຢູ່ລະຫວ່າງຈັດສົ່ງ").all();
      return Response.json({ items: results || [] }, { headers: { "Cache-Control": "no-store" } });
    }

    // 7e. Delivery Confirmation - ยืนยันจัดส่ง (ถ่ายรูป 4 อย่าง: QR/Serial/CapEx/Asset -> อัปโหลดขึ้น R2 -> Status เปลี่ยนเป็น ສຳເລັດ)
    if (url.pathname === "/api/asset-delivery/confirm" && request.method === "POST") {
      try {
        const { userId, id, photo_qr, photo_serial, photo_capex, photo_asset, photo_document, sig_outlet, sig_outlet_name } = await request.json();
        if (!userId || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });
        if (!photo_qr || !photo_serial || !photo_capex || !photo_asset || !photo_document) {
          return Response.json({ error: "ກະລຸນາຖ່າຍ ຫຼື ເລືອກຮູບຢືນຢັນໃຫ້ຄົບທັງ 5 ຢ່າງ (QR Code, Serial, CapEx, Asset, ເອກະສານ)" }, { status: 400 });
        }

        const requester = await env.DB.prepare("SELECT role, mde_code, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

        // ລາຍເຊັນລູກຄ້າ: ບັງຄັບສະເພາະ role delivery (tablet ທີມຈັດສົ່ງ) — role ອື່ນບໍ່ຕ້ອງເຊັນ (ຖ້າສົ່ງມາກໍບໍ່ນຳໃຊ້)
        const isDeliveryRole = requester.role === "delivery";
        const sigData = isDeliveryRole ? sig_outlet : null;
        if (isDeliveryRole && !sigData) return Response.json({ error: "ກະລຸນາໃຫ້ລູກຄ້າເຊັນຮັບກ່ອນຢືນຢັນການຈັດສົ່ງ" }, { status: 400 });

        const assetRow = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();
        if (!assetRow) return Response.json({ error: "ບໍ່ພົບ Asset ນີ້ໃນລະບົບ" }, { status: 404 });

        if (!canViewAll(requester.role) && assetRow.mde_code !== requester.mde_code) {
          return Response.json({ error: "ບໍ່ມີສິດຢືນຢັນການຈັດສົ່ງ Asset ນີ້" }, { status: 403 });
        }

        const DELIVERED_STATUS = "ສຳເລັດ";
        if (assetRow.status === DELIVERED_STATUS) {
          return Response.json({ error: "Asset ນີ້ຈັດສົ່ງສຳເລັດໄປແລ້ວ" }, { status: 400 });
        }

        // ກວດ + ອັບໂຫລດຮູບຂຶ້ນ R2 bucket (PHOTOS) ເກັບແຕ່ "key" ໄວ້ໃນ D1 (ຖ້າຮູບໃດຜິດ ຈະບໍ່ອັບໂຫລດຮູບໃດເລີຍ)
        const stamp = Date.now();
        // ລາຍເຊັນລູກຄ້າ: ມີໃບສັນຍາຢືມ -> ເກັບໃນຊ່ອງ sig_outlet ຂອງໃບສັນຍາ (ອອກໃນ PDF ໜ້າ 2), ບໍ່ມີໃບສັນຍາ -> ເກັບໃນ assets (delivery_sig_*)
        const loanForSig = sigData ? await findLoanContractForAsset(env, assetRow) : null;
        const sigName = String(sig_outlet_name || "").trim().slice(0, 100) || null;
        const sigKey = loanForSig
          ? `loan-contract/${loanForSig.id}/outlet-${stamp}.png`
          : `delivery/${id}/customer-sig-${stamp}.png`;
        const [qrKey, serialKey, capexKey, assetKey, documentKey, sigSavedKey] = await savePhotosToR2(env, [
          [photo_qr, `delivery/${id}/qr-${stamp}.jpg`],
          [photo_serial, `delivery/${id}/serial-${stamp}.jpg`],
          [photo_capex, `delivery/${id}/capex-${stamp}.jpg`],
          [photo_asset, `delivery/${id}/asset-${stamp}.jpg`],
          [photo_document, `delivery/${id}/document-${stamp}.jpg`],
          [sigData, sigKey],
        ]);

        // ເງື່ອນໄຂ status != ສຳເລັດ ຢູ່ໃນ UPDATE ເອງ ກັນກົດຢືນຢັນຊ້ອນກັນສອງຄົນພ້ອມກັນ (ຄົນທີສອງຈະບໍ່ມີແຖວຖືກແກ້)
        const sigSetSql = (loanForSig || !sigData) ? "" : ", delivery_sig_outlet = ?, delivery_sig_name = ?, delivery_sig_at = CURRENT_TIMESTAMP";
        const sigBinds = (loanForSig || !sigData) ? [] : [sigSavedKey, sigName];
        const updateResult = await env.DB.prepare(
          `UPDATE assets SET status = ?, delivery_photo_qr = ?, delivery_photo_serial = ?, delivery_photo_capex = ?, delivery_photo_asset = ?, delivery_photo_document = ?,
                              delivered_at = CURRENT_TIMESTAMP, delivered_by = ?${sigSetSql}, last_update = CURRENT_TIMESTAMP
           WHERE id = ? AND IFNULL(status, '') != ?`
        ).bind(DELIVERED_STATUS, qrKey, serialKey, capexKey, assetKey, documentKey, requester.email || String(userId), ...sigBinds, id, DELIVERED_STATUS).run();

        if (!updateResult.meta || updateResult.meta.changes === 0) {
          await deleteR2Photos(env, [qrKey, serialKey, capexKey, assetKey, documentKey, sigSavedKey]);
          return Response.json({ error: "Asset ນີ້ຈັດສົ່ງສຳເລັດໄປແລ້ວ" }, { status: 400 });
        }

        // ມີໃບສັນຍາຢືມ -> ໃສ່ລາຍເຊັນລູກຄ້າລົງໃບສັນຍາ (ບໍ່ປ່ຽນ status ຂອງໃບ — MDE/DSM ເຊັນແຍກຕາມຂັ້ນຕອນເດີມ)
        let sigWarning = null;
        if (loanForSig) {
          try {
            await env.DB.prepare(
              "UPDATE loan_contracts SET sig_outlet = ?, sig_outlet_name = ?, sig_outlet_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(sigSavedKey, sigName, loanForSig.id).run();
            if (loanForSig.sig_outlet) await deleteR2Photos(env, [loanForSig.sig_outlet]);
          } catch (sigErr) {
            console.error("/api/asset-delivery/confirm sig->contract", sigErr);
            sigWarning = "ຈັດສົ່ງສຳເລັດ ແຕ່ບັນທຶກລາຍເຊັນລູກຄ້າລົງໃບສັນຍາບໍ່ສຳເລັດ";
          }
        }

        // ເຊື່ອມກັບສະຕ໋ອກສາງ: doc_type = "ເກັບຄືນສາງ" -> ເອົາເຂົ້າສະຕ໋ອກຄືນ (in_warehouse), doc_type ອື່ນ -> ຖືວ່າອອກໄປຮ້ານແລ້ວ (outlet)
        if (assetRow.doc_type === RETURN_TO_WAREHOUSE_DOC_TYPE) {
          await markWarehouseStockReturnedToWarehouse(
            env,
            { qr_code: assetRow.qr_code, serial_number: assetRow.serial_number, cooler_brand: assetRow.cooler_brand, cooler_type: assetRow.cooler_type, capex: assetRow.capex },
            requester.email || String(userId),
            `ເກັບຄືນສາງ - Tracking No ${assetRow.tracking_no} (Outlet: ${assetRow.outlet_name || '-'})`
          );
        } else {
          await markWarehouseStockDeliveredToOutlet(
            env,
            { qr_code: assetRow.qr_code, serial_number: assetRow.serial_number },
            requester.email || String(userId),
            `ຈັດສົ່ງສຳເລັດ - Tracking No ${assetRow.tracking_no} (Outlet: ${assetRow.outlet_name || '-'})`
          );
        }

        // ແຈ້ງເຕືອນ MDE user ຂອງ asset ນີ້ວ່າ status ປ່ຽນເປັນ "ສຳເລັດ" ແລ້ວ (ໃຫ້ຄືກັນກັບ endpoint ອື່ນທີ່ປ່ຽນ status)
        runInBackground(ctx, notifyMdeUserOfStatusChange(env, assetRow.mde_code, assetRow.tracking_no, assetRow.outlet_name, DELIVERED_STATUS));

        // ແຈ້ງເຕືອນ admin ວ່າມີລາຍງານຈັດສົ່ງໃໝ່ (ລໍຖ້າ admin ຢືນຢັນຄວາມຖືກຕ້ອງໃນໜ້າປະຫວັດການຈັດສົ່ງ)
        if (!isAdminLike(requester.role)) {
          runInBackground(ctx, (async () => {
            const mdeName = await getMdeName(env, assetRow.mde_code);
            await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
              title: "ການຈັດສົ່ງຕູ້ແຊ່ໃໝ່ສຳເລັດແລ້ວ",
              body: `${assetRow.tracking_no || ''}\n${formatMdeOutletLine(assetRow.mde_code, mdeName, assetRow.outlet_name)}\nຜູ້ລາຍງານ: ${requester.email || '-'}`.trim(),
              url: "delivery",
            });
          })());
        }

        return Response.json({ message: sigWarning || "ຢືນຢັນການຈັດສົ່ງຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/asset-delivery/confirm", e);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດຢືນຢັນການຈັດສົ່ງໄດ້" }, { status: 500 });
      }
    }

    // ເບິ່ງເອກະສານເຈົ້າຂອງຮ້ານ (ບັດປະຈຳໂຕ/Passport/ໃບທະບຽນ) ທີ່ແນບກັບໃບ DOC- ຫຼື T- — ສະເພາະ admin ແລະ MDE ເຈົ້າຂອງໃບ
    if (url.pathname === "/api/contract-owner-doc" && request.method === "GET") {
      const kind = url.searchParams.get("kind");
      const id = url.searchParams.get("id");
      const table = kind === "loan" ? "loan_contracts" : kind === "cancel" ? "cancel_contracts" : null;
      if (!table || !id) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບ" }, { status: 400 });
      const row = await env.DB.prepare(`SELECT mde_code, owner_doc_photo FROM ${table} WHERE id = ?`).bind(id).first();
      if (!row || !row.owner_doc_photo) return new Response("Not found", { status: 404 });
      const isOwner = !!row.mde_code && String(row.mde_code).toUpperCase() === String(session.mde_code || "").toUpperCase();
      if (!isAdminLike(session.role) && !isOwner) return new Response("Forbidden", { status: 403 });
      const obj = await env.PHOTOS.get(row.owner_doc_photo);
      if (!obj) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      if (!/^image\/(jpeg|png|webp)$/i.test(headers.get("content-type") || "")) headers.set("Content-Type", "image/jpeg");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      headers.set("Cache-Control", "private, no-store");
      return new Response(obj.body, { headers });
    }

    // 7f. ดึงรูปถ่ายยืนยันการจัดส่งจาก R2 ด้วย key (ใช้แสดงใน <img> ฝั่ง Admin)
    if (url.pathname === "/api/photo" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key || !(key.startsWith("delivery/") || key.startsWith("event/") || key.startsWith("announcement/") || key.startsWith("trip/") || key.startsWith("playbook/"))) {
        return new Response("Invalid key", { status: 400 });
      }

      // ສິດເບິ່ງຮູບ: admin/warehouse/delivery ເບິ່ງໄດ້ທັງໝົດ, user ທົ່ວໄປເບິ່ງໄດ້ສະເພາະຮູບຂອງ Asset ທີ່ຕົນເອງເປັນເຈົ້າຂອງ (MDE ດຽວກັນ)
      // ຮູບປະກາດ (announcement/) ທຸກ role ທີ່ login ແລ້ວເບິ່ງໄດ້ (ປະກາດຂອງບໍລິສັດເຖິງທຸກຄົນ)
      if (!key.startsWith("announcement/") && !key.startsWith("playbook/") && !canViewAll(session.role)) {
        const m = /^delivery\/(\d+)\//.exec(key);
        const owned = m
          ? await env.DB.prepare("SELECT 1 AS ok FROM assets WHERE id = ? AND mde_code = ?").bind(Number(m[1]), session.mde_code).first()
          : null;
        if (!owned) return new Response("Forbidden", { status: 403 });
      }

      const obj = await env.PHOTOS.get(key);
      if (!obj) return new Response("Not found", { status: 404 });

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      // ບັງຄັບເປັນຮູບເທົ່ານັ້ນ (ຮູບເກົ່າອາດຖືກບັນທຶກດ້ວຍ Content-Type ທີ່ client ກຳນົດເອງ) + ຫ້າມ browser ເດົາຊະນິດໄຟລ໌
      if (!/^image\/(jpeg|png|webp)$/i.test(headers.get("content-type") || "")) {
        headers.set("Content-Type", "image/jpeg");
      }
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      headers.set("etag", obj.httpEtag);
      headers.set("Cache-Control", "private, max-age=86400");
      return new Response(obj.body, { headers });
    }

    // 8. Asset Request API (ดึงคำขอ - admin เห็นทุกคำขอ, user เห็นแค่ของตัวเอง)
    // ຮູບຮ້ານຄ້າຂອງຄຳຂໍ Asset: admin/warehouse/delivery ເບິ່ງໄດ້ທັງໝົດ, DSM ເບິ່ງສະເພາະທີມຕົນ, ຜູ້ຂໍ (ເຈົ້າຂອງຄຳຂໍ) ເບິ່ງຂອງຕົນເອງ
    if (url.pathname === "/api/asset-request-photo" && request.method === "GET") {
      const rid = url.searchParams.get("id");
      const row = rid ? await env.DB.prepare("SELECT user_id, mde_code, shop_photo FROM asset_requests WHERE id = ?").bind(rid).first() : null;
      if (!row || !row.shop_photo) return new Response("Not found", { status: 404 });
      let allowed = canViewAll(session.role) || Number(row.user_id) === Number(session.id);
      if (!allowed && session.role === "dsm" && session.team && row.mde_code) {
        const ok = await env.DB.prepare("SELECT 1 AS ok FROM mde_list WHERE team = ? AND UPPER(TRIM(mde_code)) = UPPER(TRIM(?)) LIMIT 1").bind(session.team, row.mde_code).first();
        allowed = !!ok;
      }
      if (!allowed) return new Response("Forbidden", { status: 403 });
      const obj = await env.PHOTOS.get(row.shop_photo);
      if (!obj) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      if (!/^image\/(jpeg|png|webp)$/i.test(headers.get("content-type") || "")) headers.set("Content-Type", "image/jpeg");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
      headers.set("Cache-Control", "private, max-age=3600");
      return new Response(obj.body, { headers });
    }

    if (url.pathname === "/api/asset-requests" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "ບໍ່ພົບຂໍ້ມູນຜູ້ໃຊ້ງານ" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role, team FROM users WHERE id = ?").bind(userId).first();
      if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

      let results;
      if (requester.role === "dsm") {
        ({ results } = await env.DB.prepare(
          `SELECT r.*, u.email AS requester_email FROM asset_requests r
           LEFT JOIN users u ON u.id = r.user_id
           WHERE UPPER(TRIM(u.mde_code)) IN (SELECT UPPER(TRIM(mde_code)) FROM mde_list WHERE team = ?) ORDER BY r.id DESC`
        ).bind(requester.team || "").all());
      } else if (canViewAll(requester.role)) {
        ({ results } = await env.DB.prepare(
          `SELECT r.*, u.email AS requester_email FROM asset_requests r
           LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id DESC`
        ).all());
      } else {
        ({ results } = await env.DB.prepare(
          "SELECT * FROM asset_requests WHERE user_id = ? ORDER BY id DESC"
        ).bind(userId).all());
      }
      // ອະນຸມັດ 2 ຂັ້ນ: ສາງບໍ່ເຫັນຄຳຂໍທີ່ "ລໍຖ້າ Admin ກວດສອບ" (ເຫັນເມື່ອ Admin ກວດແລ້ວເທົ່ານັ້ນ)
      const rows = requester.role === "warehouse"
        ? (results || []).filter((r) => !(r.status === "pending" && !r.admin_checked_at))
        : (results || []);
      return Response.json(rows);
    }

    // 8b. Submit Asset Request API (User ສົ່ງຄຳຂໍเบิก Asset ໃໝ່)
    if (url.pathname === "/api/asset-requests" && request.method === "POST") {
      try {
        const reqBody = await request.json();
        const { userId, outlet_code: outletCodeRaw, outlet_name: outletNameRaw, cooler_brand, cooler_type, doc_type, reason, asset_condition, contract_type: contractTypeRaw } = reqBody;
        // ຮ້ານທີ່ບໍ່ມີ Outlet Code: ສົ່ງ outlet_code ວ່າງ + ພິມຊື່ຮ້ານເອງ → ເກັບ outlet_code = '' (ບໍ່ສ້າງຫຍັງໃນ Outlet Master Data)
        const outlet_code = String(outletCodeRaw || "").trim();
        let outlet_name = String(outletNameRaw || "").trim();
        // ປະເພດສັນຍາ (ຕ້ອງເປັນໜຶ່ງໃນ 3 ຄ່ານີ້) — ຖືກນຳໄປໃຊ້ຕອນອອກໃບສັນຍາຢືມອັດຕະໂນມັດຫຼັງອະນຸມັດ
        const contract_type = ["partner_club", "competitive", "none"].includes(contractTypeRaw) ? contractTypeRaw : null;
        if (!userId || !outlet_name) {
          return Response.json({ error: "ກະລຸນາປ້ອນຊື່ຮ້ານ (Outlet Name)" }, { status: 400 });
        }
        // ມີ Outlet Code → ຕ້ອງມີໃນ Master Data ແລະ ໃຊ້ຊື່ຮ້ານຈາກ Master (ແກ້ເອງບໍ່ໄດ້)
        if (outlet_code) {
          const master = await getOutletMasterByCode(env, outlet_code);
          if (!master) {
            return Response.json({ error: "ບໍ່ພົບ Outlet Code ນີ້ໃນ Master Data - ກວດລະຫັດ ຫຼືເລືອກ 'ຮ້ານນີ້ບໍ່ມີ Outlet Code' ແລ້ວພິມຊື່ຮ້ານ" }, { status: 400 });
          }
          outlet_name = master.name || outlet_name;
        }
        // ຮ້ານທີ່ບໍ່ມີ Outlet Code: ຕ້ອງມີຂໍ້ມູນຮ້ານຄົບ (ເກັບໃນຄຳຂໍເທົ່ານັ້ນ ບໍ່ເຂົ້າ Outlet Master Data)
        const mo = { owner: null, type: null, level: null, province: null, village: null, district: null, phone: null };
        if (!outlet_code) {
          const clean = (v) => String(v || "").trim() || null;
          mo.owner = clean(reqBody.outlet_owner); mo.type = clean(reqBody.outlet_type); mo.level = clean(reqBody.outlet_level);
          mo.province = clean(reqBody.outlet_province); mo.village = clean(reqBody.outlet_village);
          mo.district = clean(reqBody.outlet_district); mo.phone = clean(reqBody.outlet_phone);
          if (Object.values(mo).some((v) => !v)) {
            return Response.json({ error: "ຮ້ານທີ່ບໍ່ມີ Outlet Code ກະລຸນາຕື່ມ ຊື່ເຈົ້າຂອງຮ້ານ, ປະເພດ, ລະດັບ, ແຂວງ, ບ້ານ, ເມືອງ ແລະ ເບີໂທ ໃຫ້ຄົບ" }, { status: 400 });
          }
        }

        const condition = asset_condition === 'used' ? 'used' : 'new';
        if (!cooler_brand || !cooler_type) {
          return Response.json({ error: "ກະລຸນາເລືອກ Cooler Brand ແລະ Cooler Type ໃຫ້ຄົບ" }, { status: 400 });
        }
        // ເຫດຜົນ ແລະ ຮູບຮ້ານຄ້າ ເປັນຂໍ້ມູນບັງຄັບ (ກວດຝັ່ງ server ດ້ວຍ ເພື່ອກັນການຂ້າມ UI)
        if (!String(reason || "").trim()) {
          return Response.json({ error: "ກະລຸນາລະບຸເຫດຜົນທີ່ຕ້ອງການເບີກ Asset" }, { status: 400 });
        }
        if (!reqBody.shop_photo) {
          return Response.json({ error: "ກະລຸນາແນບຮູບຮ້ານຄ້າ" }, { status: 400 });
        }

        const requester = await env.DB.prepare("SELECT team, mde_code FROM users WHERE id = ?").bind(userId).first();
        if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

        // ກັນຄຳຂໍຊໍ້າ: ຖ້າ user ຄົນດຽວກັນ ສົ່ງຄຳຂໍທີ່ຂໍ້ມູນຄືກັນທຸກຢ່າງ ພາຍໃນ 30 ວິນາທີຫຼ້າສຸດ
        // (ກໍລະນີກົດປຸ່ມຫຼາຍເທື່ອຕິດໆ ຫຼື double-tap ໃນຈໍ mobile / ເນັດຊ້າ) ໃຫ້ຖືວ່າເປັນຄຳຂໍດຽວກັນ, ບໍ່ insert ຊໍ້າ
        const dupRow = await env.DB.prepare(
          `SELECT id FROM asset_requests
           WHERE user_id = ? AND outlet_code = ? AND outlet_name = ?
             AND IFNULL(cooler_brand,'') = ? AND IFNULL(cooler_type,'') = ?
             AND IFNULL(doc_type,'') = ? AND IFNULL(asset_condition,'new') = ? AND IFNULL(contract_type,'') = ?
             AND requested_at >= datetime('now', '-30 seconds')
           ORDER BY id DESC LIMIT 1`
        ).bind(userId, outlet_code, outlet_name, cooler_brand || '', cooler_type || '', doc_type || '', condition, contract_type || '').first();
        if (dupRow) {
          return Response.json({ message: "ສົ່ງຄຳຂໍເບີກ Asset ຮຽບຮ້ອຍແລ້ວ ກະລຸນາລໍຖ້າ Admin ອະນຸມັດ" });
        }

        // ถ้าเลือก "ໃໝ່" ต้องมีงบประมาณของทีมรองรับ Brand/Type นี้ ແລະ ຕ້ອງຍັງມີໂຄຕ້າເຫຼືອພຽງພໍ
        // (ນັບຄຳຂໍທີ່ຍັງ pending ນຳ ບໍ່ແມ່ນນັບສະເພາະ approved - ຕັດງົບທັນທີທີ່ຍື່ນຄຳຂໍ ບໍ່ຕ້ອງລໍຖ້າ admin ອະນຸມັດ)
        if (condition === 'new') {
          const budgetRow = await env.DB.prepare(
            "SELECT * FROM budgets WHERE team = ? AND cooler_brand = ? AND cooler_type = ? AND archived_at IS NULL"
          ).bind(requester.team, cooler_brand, cooler_type).first();
          if (!budgetRow) {
            return Response.json({ error: "ທີມຂອງທ່ານບໍ່ມີງົບປະມານສຳລັບ Brand/Type ນີ້ (ສຳລັບຂອງໃໝ່)" }, { status: 400 });
          }
          const usedRow = await env.DB.prepare(
            `SELECT COUNT(*) AS cnt FROM asset_requests
             WHERE status IN ('pending','approved') AND IFNULL(asset_condition,'new') = 'new'
             AND team = ? AND IFNULL(cooler_brand,'') = ? AND IFNULL(cooler_type,'') = ?
             AND (? IS NULL OR requested_at >= ?)`
          ).bind(requester.team, cooler_brand, cooler_type, budgetRow.period_start || null, budgetRow.period_start || null).first();
          const used = (usedRow && usedRow.cnt) || 0;
          if (used >= budgetRow.quota) {
            return Response.json({ error: `ງົບປະມານຂອງທີມສຳລັບ ${cooler_brand} ${cooler_type} ເຕັມແລ້ວ (ໃຊ້ໄປ ${used}/${budgetRow.quota} ນັບທັງຄຳຂໍທີ່ຍັງ pending)` }, { status: 400 });
          }
        }

        // ຮູບຮ້ານຄ້າ (ບັງຄັບ): ກວດ + ອັບຂຶ້ນ R2 ກ່ອນ INSERT (ຮູບຜິດ -> ຈົບທີ່ນີ້ ບໍ່ສ້າງຄຳຂໍຄ້າງ)
        let shopPhotoKey = null;
        {
          try {
            [shopPhotoKey] = await savePhotosToR2(env, [[reqBody.shop_photo, `request/${userId}/shop-${Date.now()}.jpg`]]);
          } catch (photoErr) {
            console.error("/api/asset-requests (shop_photo)", photoErr);
            const pr = photoErrorResponse(photoErr);
            if (pr) return pr;
            throw photoErr;
          }
        }

        // INSERT ແບບ atomic (ຄຳສັ່ງດຽວ): ກັນກໍລະນີ 2 ຄຳຂໍເຂົ້າມາພ້ອມກັນ ທີ່ຜ່ານການກວດ dupRow ດ້ານເທິງທັງຄູ່ (race condition)
        const reqIns = await env.DB.prepare(
          `INSERT INTO asset_requests (user_id, team, mde_code, outlet_code, outlet_name, cooler_brand, cooler_type, doc_type, contract_type, asset_condition, reason,
                                     outlet_owner, outlet_type, outlet_level, outlet_province, outlet_village, outlet_district, outlet_phone, shop_photo)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM asset_requests
               WHERE user_id = ? AND outlet_code = ? AND outlet_name = ?
                 AND IFNULL(cooler_brand,'') = ? AND IFNULL(cooler_type,'') = ?
                 AND IFNULL(doc_type,'') = ? AND IFNULL(asset_condition,'new') = ? AND IFNULL(contract_type,'') = ?
                 AND requested_at >= datetime('now', '-30 seconds'))`
        ).bind(userId, requester.team, requester.mde_code, outlet_code, outlet_name, cooler_brand, cooler_type, doc_type, contract_type, condition, reason,
          mo.owner, mo.type, mo.level, mo.province, mo.village, mo.district, mo.phone, shopPhotoKey,
          userId, outlet_code, outlet_name, cooler_brand || '', cooler_type || '', doc_type || '', condition, contract_type || '').run();
        if (!reqIns.meta || !reqIns.meta.changes) {
          await deleteR2Photos(env, [shopPhotoKey]); // ຄຳຂໍຊ້ຳ -> ບໍ່ເກັບຮູບທີ່ອັບໄປແລ້ວ
          return Response.json({ message: "ສົ່ງຄຳຂໍເບີກ Asset ຮຽບຮ້ອຍແລ້ວ ກະລຸນາລໍຖ້າ Admin ອະນຸມັດ" });
        }

        // แจ้งเตือน (Push Notification) ไปยัง Admin/Warehouse ว่ามีคำขอใหม่รออนุมัติ (ไม่ให้ error ตรงนี้ทำให้คำขอล้มเหลว)
        try {
          const mdeName = await getMdeName(env, requester.mde_code);
          const detailLine = formatMdeOutletLine(requester.mde_code, mdeName, outlet_name);
          // ຂັ້ນ 1: ແຈ້ງສະເພາະ Admin ໃຫ້ກວດສອບກ່ອນ (ສາງຈະຖືກແຈ້ງຕໍ່ເມື່ອ Admin ກວດສອບແລ້ວ)
          await sendWebPushToRoles(env, ["admin", "assistant_admin"], {
            title: "ມີຄຳຂໍເບີກ ຕູ້ແຊ່ເຂົ້າມາໃໝ່ - ລໍຖ້າ Admin ກວດສອບ",
            body: `${cooler_brand} ${cooler_type}${detailLine ? '\n' + detailLine : ''}`,
            url: "request",
          });
        } catch (pushErr) { /* ไม่ต้องทำอะไร ปล่อยให้คำขอสำเร็จตามปกติ */ }

        return Response.json({ message: "ສົ່ງຄຳຂໍເບີກ Asset ຮຽບຮ້ອຍແລ້ວ ກະລຸນາລໍຖ້າ Admin ອະນຸມັດ" });
      } catch (e) {
        console.error("/api/asset-requests", e);
        return Response.json({ error: "ບໍ່ສາມາດສົ່ງຄຳຂໍໄດ້" }, { status: 500 });
      }
    }

    // 8b-2. Admin Delete Asset Request API (ລຶບປະຫວັດຄຳຂໍ - ໜ້າ "ປະຫວັດ" ສະເພາະ Admin)
    if (url.pathname === "/api/admin/delete-asset-request" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || requester.role !== 'admin') {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລຶບຄຳຂໍໄດ້" }, { status: 403 });
        }

        // ດຶງຂໍ້ມູນຄຳຂໍໄວ້ກ່ອນລຶບ ເພື່ອກວດວ່າການລຶບນີ້ຄືນໂຄຕ້າໃຫ້ງົບທີ່ເຄີຍເຕັມບໍ
        const delRow = await env.DB.prepare(
          "SELECT team, cooler_brand, cooler_type, asset_condition, status, shop_photo FROM asset_requests WHERE id = ?"
        ).bind(id).first();

        const delReqRes = await env.DB.prepare("DELETE FROM asset_requests WHERE id = ?").bind(id).run();
        const reqRemoved = !delReqRes.meta || delReqRes.meta.changes > 0; // ກົດລຶບຊ້ຳ: ບໍ່ສົ່ງ Push "ງົບວ່າງ" ຊ້ຳ
        if (reqRemoved && delRow && delRow.shop_photo) await deleteR2Photos(env, [delRow.shop_photo]);

        // ນັບໂຄຕ້າສະເພາະຄຳຂໍ 'ໃໝ່' ທີ່ pending/approved ເທົ່ານັ້ນ (rejected ບໍ່ນັບຢູ່ແລ້ວ -> ລຶບບໍ່ປ່ຽນໂຄຕ້າ)
        if (reqRemoved && delRow && (delRow.asset_condition || 'new') === 'new' && ['pending', 'approved'].includes(delRow.status)) {
          runInBackground(ctx, notifyBudgetFreedIfWasFull(env, delRow.team, delRow.cooler_brand, delRow.cooler_type));
        }
        return Response.json({ message: "ລຶບຄຳຂໍຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-asset-request", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 8b-3. Admin ແກ້ Brand/Type ຂອງຄຳຂໍທີ່ຍັງ pending (ເຊັ່ນ Brand ເດີມໝົດສະຕ໋ອກ -> ປ່ຽນໄປ Brand ໃໝ່ ໂດຍໃຊ້ຄຳຂໍເກົ່າ ບໍ່ຕ້ອງໃຫ້ MDE ຂໍໃໝ່)
    if (url.pathname === "/api/admin/edit-asset-request-brand" && request.method === "POST") {
      try {
        const { userId, requestId, cooler_brand, cooler_type, allow_over_budget } = await request.json();
        const newBrand = String(cooler_brand || "").trim().slice(0, 100);
        const newType = String(cooler_type || "").trim().slice(0, 100);
        if (!requestId || !newBrand || !newType) return Response.json({ error: "ກະລຸນາເລືອກ Brand ແລະ Type ໃຫ້ຄົບ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ແກ້ Brand ຂອງຄຳຂໍໄດ້" }, { status: 403 });
        }
        const reqRow = await env.DB.prepare("SELECT * FROM asset_requests WHERE id = ?").bind(requestId).first();
        if (!reqRow) return Response.json({ error: "ບໍ່ພົບຄຳຂໍນີ້ໃນລະບົບ" }, { status: 404 });
        if (reqRow.status !== "pending") {
          return Response.json({ error: "ແກ້ໄຂໄດ້ສະເພາະຄຳຂໍທີ່ຍັງລໍຖ້າອະນຸມັດ (pending) ເທົ່ານັ້ນ — ກະລຸນາໂຫລດໜ້າຈໍໃໝ່" }, { status: 409 });
        }
        if ((reqRow.cooler_brand || "") === newBrand && (reqRow.cooler_type || "") === newType) {
          return Response.json({ error: "Brand/Type ຄືເກົ່າ ບໍ່ມີຫຍັງປ່ຽນ" }, { status: 400 });
        }

        // ຄຳຂໍ 'ໃໝ່' ຕັດງົບຂອງທີມຕາມ Brand/Type -> ກວດງົບຂອງ Brand/Type ໃໝ່ (ບໍ່ນັບຄຳຂໍນີ້ເອງ). Admin ຢືນຢັນເອົາໄປນອກງົບໄດ້
        let overBudgetNote = "";
        if ((reqRow.asset_condition || "new") === "new") {
          const budgetRow = await env.DB.prepare(
            "SELECT quota, period_start FROM budgets WHERE team = ? AND cooler_brand = ? AND cooler_type = ? AND archived_at IS NULL"
          ).bind(reqRow.team, newBrand, newType).first();
          let problem = null;
          if (!budgetRow) {
            problem = `ທີມ ${reqRow.team || "-"} ຍັງບໍ່ໄດ້ກຳນົດງົບສຳລັບ ${newBrand} ${newType}`;
          } else {
            const usedRow = await env.DB.prepare(
              `SELECT COUNT(*) AS cnt FROM asset_requests
               WHERE id != ? AND status IN ('pending','approved') AND IFNULL(asset_condition,'new') = 'new'
               AND team = ? AND IFNULL(cooler_brand,'') = ? AND IFNULL(cooler_type,'') = ?
               AND (? IS NULL OR requested_at >= ?)`
            ).bind(requestId, reqRow.team, newBrand, newType, budgetRow.period_start || null, budgetRow.period_start || null).first();
            const used = (usedRow && usedRow.cnt) || 0;
            if (used >= budgetRow.quota) problem = `ງົບຂອງທີມ ${reqRow.team || "-"} ສຳລັບ ${newBrand} ${newType} ເຕັມແລ້ວ (ໃຊ້ໄປ ${used}/${budgetRow.quota})`;
          }
          if (problem) {
            if (allow_over_budget !== true) {
              return Response.json({ code: "over_budget", error: problem }, { status: 409 });
            }
            overBudgetNote = " (ເກີນງົບ — admin ອະນຸມັດ)";
          }
        }

        const upd = await env.DB.prepare(
          `UPDATE asset_requests SET cooler_brand = ?, cooler_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`
        ).bind(newBrand, newType, requestId).run();
        if (!upd.meta || upd.meta.changes === 0) {
          return Response.json({ error: "ຄຳຂໍນີ້ຖືກດຳເນີນການໄປແລ້ວ ກະລຸນາໂຫລດໜ້າຈໍໃໝ່" }, { status: 409 });
        }

        // Brand/Type ເດີມຖືກປ່ອຍໂຄຕ້າຄືນ -> ຖ້າງົບເດີມເຄີຍເຕັມ ແຈ້ງເຕືອນທີມ
        if ((reqRow.asset_condition || "new") === "new") {
          runInBackground(ctx, notifyBudgetFreedIfWasFull(env, reqRow.team, reqRow.cooler_brand, reqRow.cooler_type));
        }
        // ແຈ້ງຜູ້ຂໍວ່າ Brand ຖືກປ່ຽນ (ບໍ່ໃຫ້ error ຕรงນີ້ເຮັດໃຫ້ການແກ້ໄຂລົ້ມ)
        try {
          const mdeName = await getMdeName(env, reqRow.mde_code);
          const detailLine = formatMdeOutletLine(reqRow.mde_code, mdeName, reqRow.outlet_name);
          await sendWebPushToUser(env, reqRow.user_id, {
            title: "Admin ປ່ຽນ Brand ຂອງຄຳຂໍທ່ານ",
            body: `${reqRow.cooler_brand} ${reqRow.cooler_type} → ${newBrand} ${newType}${detailLine ? "\n" + detailLine : ""}`,
            url: "request",
          });
        } catch (pushErr) { /* ignore */ }

        return Response.json({ message: `ປ່ຽນເປັນ ${newBrand} / ${newType} ຮຽບຮ້ອຍແລ້ວ${overBudgetNote}` });
      } catch (e) {
        console.error("edit-asset-request-brand failed", e);
        return Response.json({ error: "ບໍ່ສາມາດແກ້ໄຂຄຳຂໍໄດ້" }, { status: 500 });
      }
    }

    // 8c. Admin/Warehouse Update Asset Request Status (ອະນຸມັດ / ປະຕິເສດ)
    if (url.pathname === "/api/admin/update-asset-request-status" && request.method === "POST") {
      try {
        const { userId, requestId, status, qr_code, serial_number, capex, confirm_low_stock } = await request.json();
        if (!userId || !requestId || !status) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });
        if (!["admin_approved", "approved", "rejected"].includes(status)) {
          return Response.json({ error: "ສະຖານະບໍ່ຖືກຕ້ອງ (ອະນຸຍາດສະເພາະ admin_approved, approved ຫຼື rejected)" }, { status: 400 });
        }

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !canViewAll(requester.role)) {
          return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });
        }

        const reqRow = await env.DB.prepare("SELECT * FROM asset_requests WHERE id = ?").bind(requestId).first();
        if (!reqRow) return Response.json({ error: "ບໍ່ພົບຄຳຂໍນີ້ໃນລະບົບ" }, { status: 404 });

        // ດຳເນີນການໄດ້ສະເພາະຄຳຂໍທີ່ຍັງ "pending" - ກັນກົດອະນຸມັດຊ້ຳ (ຈະສ້າງ Asset ຊ້ຳ) ແລະ ກັນປ່ຽນຄຳຂໍທີ່ອະນຸມັດ/ປະຕິເສດໄປແລ້ວ
        const alreadyProcessed = () => Response.json(
          { error: "ຄຳຂໍນີ້ຖືກດຳເນີນການໄປແລ້ວ (ສະຖານະປັດຈຸບັນ: " + reqRow.status + ") ກະລຸນາໂຫລດໜ້າຈໍໃໝ່" },
          { status: 409 }
        );
        if (reqRow.status !== "pending") return alreadyProcessed();

        // ===== ອະນຸມັດ 2 ຂັ້ນ: (1) Admin ກວດຂໍ້ມູນ + ຮູບຮ້ານ -> (2) Warehouse ອະນຸມັດ + ໃສ່ QR/Serial/CapEx =====
        const isAdminRole = isAdminLike(requester.role);
        const isWhRole = requester.role === "warehouse";
        const adminChecked = !!reqRow.admin_checked_at;

        if (status === "admin_approved") {
          if (!isAdminRole) return Response.json({ error: "ສະເພາະ Admin ເທົ່ານັ້ນທີ່ກວດສອບຂັ້ນທຳອິດໄດ້" }, { status: 403 });
          if (adminChecked) {
            return Response.json({ error: "Admin ກວດສອບຄຳຂໍນີ້ໄປແລ້ວ ກຳລັງລໍຖ້າສາງອະນຸມັດ ກະລຸນາໂຫລດໜ້າຈໍໃໝ່" }, { status: 409 });
          }
          const chk = await env.DB.prepare(
            `UPDATE asset_requests SET admin_checked_by = ?, admin_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND status = 'pending' AND admin_checked_at IS NULL`
          ).bind((session && session.email) || null, requestId).run();
          if (!chk.meta || chk.meta.changes === 0) return alreadyProcessed();
          // ແຈ້ງເຕືອນສາງວ່າມີຄຳຂໍທີ່ Admin ກວດແລ້ວ ລໍຖ້າອະນຸມັດ + ໃສ່ລະຫັດຕູ້
          try {
            const mdeName = await getMdeName(env, reqRow.mde_code);
            const detailLine = formatMdeOutletLine(reqRow.mde_code, mdeName, reqRow.outlet_name);
            await sendWebPushToRoles(env, ["warehouse"], {
              title: "ມີຄຳຂໍທີ່ Admin ກວດສອບແລ້ວ - ລໍຖ້າສາງອະນຸມັດ",
              body: `${reqRow.cooler_brand} ${reqRow.cooler_type}${detailLine ? '\n' + detailLine : ''}`,
              url: "request",
            });
          } catch (pushErr) { /* ບໍ່ໃຫ້ການກວດສອບລົ້ມເຫລວຍ້ອນ push */ }
          return Response.json({ message: "ກວດສອບແລ້ວ — ສົ່ງຕໍ່ໃຫ້ສາງອະນຸມັດ ແລະ ໃສ່ລະຫັດຕູ້" });
        }
        if (status === "approved") {
          // Admin ກວດສອບ + ອະນຸມັດ + ໃສ່ລະຫັດຕູ້ ໄດ້ໃນຂັ້ນດຽວ (ບໍ່ຕ້ອງລໍຖ້າສາງ); ສາງຍັງອະນຸມັດໄດ້ຄືເກົ່າ ແຕ່ຕ້ອງໃຫ້ Admin ກວດກ່ອນ
          if (!isWhRole && !isAdminRole) return Response.json({ error: "ສະເພາະ Admin ຫຼື ສາງ (Warehouse) ເທົ່ານັ້ນທີ່ອະນຸມັດ ແລະ ໃສ່ລະຫັດຕູ້ໄດ້" }, { status: 403 });
          if (isWhRole && !isAdminRole && !adminChecked) return Response.json({ error: "ຕ້ອງໃຫ້ Admin ກວດສອບຄຳຂໍນີ້ກ່ອນ ສາງຈຶ່ງອະນຸມັດໄດ້" }, { status: 400 });
        }
        if (status === "rejected" && !isAdminRole && !(isWhRole && adminChecked)) {
          return Response.json({ error: isWhRole ? "ຕ້ອງໃຫ້ Admin ກວດສອບຄຳຂໍນີ້ກ່ອນ" : "ບໍ່ມີສິດປະຕິເສດຄຳຂໍນີ້" }, { status: 403 });
        }

        // ถ้าອະນຸມັດ -> บังคับกรอก QR Code, Serial Number, CapEx ก่อนเสมอ
        if (status === 'approved') {
          if (!qr_code || !serial_number || !capex) {
            return Response.json({ error: "ກະລຸນາປ້ອນ QR Code, Serial Number ແລະ CapEx ໃຫ້ຄົບກ່ອນອະນຸມັດ" }, { status: 400 });
          }
        }

        // ຖືເອົາ "ສະຕ໋ອກສາງ" (warehouse_stock) ເປັນ Master: QR/Serial ທີ່ນຳມາອະນຸມັດ ຕ້ອງກົງກັບລາຍການທີ່ມີຢູ່ຈິງ
        // ແລະ ຍັງມີສະຖານະ "ຢູ່ໃນສາງ" ເທົ່ານັ້ນ (ຖ້າຖືກໃຊ້ໄປແລ້ວ/ສະສາງແລ້ວ/ບໍ່ພົບ -> ຫ້າມອະນຸມັດ)
        let stockMaster = null;
        if (status === 'approved') {
          if (qr_code) {
            stockMaster = await env.DB.prepare(
              "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
            ).bind(qr_code).first();
          }
          if (!stockMaster && serial_number) {
            stockMaster = await env.DB.prepare(
              "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
            ).bind(serial_number).first();
          }
          if (!stockMaster) {
            return Response.json({
              error: "ບໍ່ພົບ QR Code / Serial Number ນີ້ໃນສະຕ໋ອກສາງ (Warehouse Master) - ກະລຸນາຄົ້ນຫາ ແລະ ເລືອກລາຍການຈາກສະຕ໋ອກສາງເທົ່ານັ້ນ ກ່ອນອະນຸມັດ"
            }, { status: 400 });
          }
          if (stockMaster.status !== 'in_warehouse') {
            const STATUS_LABEL_LAO = { in_warehouse: 'ຢູ່ໃນສາງ', reserved: 'ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ', outlet: 'ອອກໄປຮ້ານແລ້ວ', event: 'ກຳລັງໃຊ້ງານ Event', shipped_out: 'ສົ່ງຕ່າງແຂວງແລ້ວ', write_off: 'ສະສາງ', pending_write_off: 'ລໍຖ້າສະສາງ' };
            return Response.json({
              error: `ລາຍການນີ້ໃນສະຕ໋ອກສາງບໍ່ໄດ້ຢູ່ໃນສາງແລ້ວ (ສະຖານະປັດຈຸບັນ: ${STATUS_LABEL_LAO[stockMaster.status] || stockMaster.status}) - ຫ້າມອະນຸມັດຊ້ຳ`
            }, { status: 400 });
          }
          if ((stockMaster.cooler_brand || '') !== (reqRow.cooler_brand || '') || (stockMaster.cooler_type || '') !== (reqRow.cooler_type || '')) {
            return Response.json({
              error: `Brand/Type ຂອງລາຍການໃນສະຕ໋ອກສາງ (${stockMaster.cooler_brand || '-'} / ${stockMaster.cooler_type || '-'}) ບໍ່ກົງກັບຄຳຂໍ (${reqRow.cooler_brand || '-'} / ${reqRow.cooler_type || '-'}) - ຫ້າມອະນຸມັດ`
            }, { status: 400 });
          }

          // ເຕືອນເມື່ອສະຕ໋ອກສາງ (ໃໝ່) ຕ່ຳກວ່າງົບປະມານທີ່ຕັ້ງໄວ້: ສະຕ໋ອກ "ຢູ່ໃນສາງ + ສະພາບໃໝ່" ຂອງ Brand + Model ຕາມຈຳນວນປະຕູ
          // (1 ປະຕູ = 1D_AMD, 1 ປະຕູ Modern Small = 1D_ASM, 2 ປະຕູ = 2D_MD, 3 ປະຕູ = 3D_MD) ຕ້ອງ >= ງົບທີ່ຍັງຄ້າງເບີກ (ໂຄຕ້າທັງໝົດ - ທີ່ອະນຸມັດແລ້ວ) ຂອງທຸກທີມ
          if ((reqRow.asset_condition || 'new') === 'new') {
            const budgetModel = budgetModelFor(reqRow.cooler_type);
            if (budgetModel) {
              const q = await env.DB.prepare(
                `SELECT IFNULL(SUM(quota), 0) AS total FROM budgets
                  WHERE archived_at IS NULL AND IFNULL(cooler_brand,'') = IFNULL(?, '') AND IFNULL(cooler_type,'') = IFNULL(?, '')`
              ).bind(reqRow.cooler_brand ?? null, reqRow.cooler_type ?? null).first();
              const a = await env.DB.prepare(
                `SELECT IFNULL(SUM((SELECT COUNT(*) FROM asset_requests r WHERE r.status = 'approved' AND IFNULL(r.asset_condition,'new') = 'new'
                          AND r.team = b.team AND IFNULL(r.cooler_brand,'') = IFNULL(b.cooler_brand,'') AND IFNULL(r.cooler_type,'') = IFNULL(b.cooler_type,'')
                          AND (b.period_start IS NULL OR r.requested_at >= b.period_start))), 0) AS cnt
                   FROM budgets b
                  WHERE b.archived_at IS NULL AND IFNULL(b.cooler_brand,'') = IFNULL(?, '') AND IFNULL(b.cooler_type,'') = IFNULL(?, '')`
              ).bind(reqRow.cooler_brand ?? null, reqRow.cooler_type ?? null).first();
              const outstanding = Math.max(((q && q.total) || 0) - ((a && a.cnt) || 0), 0);
              const st = await env.DB.prepare(
                `SELECT COUNT(*) AS cnt FROM warehouse_stock
                  WHERE status = 'in_warehouse' AND IFNULL(cooler_status,'new') = 'new'
                    AND REPLACE(REPLACE(UPPER(IFNULL(cooler_model,'')), ' ', ''), '-', '_') = ?
                    AND IFNULL(cooler_brand,'') = IFNULL(?, '')`
              ).bind(budgetModel, stockMaster.cooler_brand ?? null).first();
              const inStock = (st && st.cnt) || 0;
              // ບໍ່ບລັອກ: ສະແດງເຕືອນພິເສດ ແລ້ວໃຫ້ admin ຢືນຢັນຈຶ່ງອະນຸມັດຕໍ່ (ສົ່ງ confirm_low_stock = true)
              if (outstanding > 0 && inStock < outstanding && !confirm_low_stock) {
                return Response.json({
                  code: 'low_stock',
                  error: `⚠️ ເຕືອນ: ສະຕ໋ອກສາງຕ່ຳກວ່າງົບປະມານ\n${reqRow.cooler_brand || '-'} ${budgetModel} (ໃໝ່) ມີໃນສາງ ${inStock} ໜ່ວຍ ແຕ່ງົບທີ່ຍັງຄ້າງເບີກ ${outstanding} ໜ່ວຍ (ຂາດ ${outstanding - inStock} ໜ່ວຍ)`,
                  in_stock: inStock, outstanding, model: budgetModel,
                }, { status: 422 });
              }
            }
          }
        }

        // ถ้าອະນຸມັດ -> เปลี่ยนสถานะคำขอ + สร้างรายการเข้า Asset Tracking (พร้อม Tracking No อัตโนมัติ) ใน transaction เดียวกัน (D1 batch)
        // - UPDATE ... WHERE status = 'pending' คือ "การจองสิทธิ์" ถ้าคนอื่นอนุมัติตัดหน้าไปแล้ว changes = 0
        // - INSERT ... WHERE changes() > 0 สร้าง Asset เฉพาะเมื่อการจองสิทธิ์สำเร็จ (กันสร้างซ้ำเมื่อกดพร้อมกัน)
        // - ถ้าขั้นตอนใดล้ม ทั้งชุดถูกยกเลิก (คำขอจะไม่ค้างเป็น approved โดยไม่มี Asset)
        if (status === 'approved') {
          const placeholder = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const initialStatus = "ຍັງບໍ່ທັນສົ່ງເອກະສານ";
          // ຂໍ້ມູນ Brand/Type ໃຊ້ຈາກ warehouse_stock (master) ເປັນຫຼັກ ແທນຂໍ້ມູນທີ່ຜູ້ຂໍປ້ອນຕອນສົ່ງຄຳຂໍ ເພື່ອກັນຄວາມບໍ່ກົງກັນ
          const masterBrand = stockMaster.cooler_brand || reqRow.cooler_brand;
          const masterType = stockMaster.cooler_type || reqRow.cooler_type;
          // ພິກັດຮ້ານ (Latitude/Longitude) ດຶງຈາກ Outlet Master ຕາມ Outlet Code ໃສ່ Asset Tracking ອັດຕະໂນມັດ (ຮ້ານທີ່ບໍ່ມີ Code ບໍ່ມີພິກັດ -> ປ່ອຍວ່າງ)
          const outletGeo = reqRow.outlet_code
            ? await env.DB.prepare("SELECT latitude, longitude FROM outlets WHERE code = ?").bind(reqRow.outlet_code).first()
            : null;
          const geoLat = (outletGeo && outletGeo.latitude) ?? null;
          const geoLng = (outletGeo && outletGeo.longitude) ?? null;
          const results = await env.DB.batch([
            env.DB.prepare(
              `UPDATE asset_requests SET status = 'approved', qr_code = ?, serial_number = ?, capex = ?,
                  admin_checked_by = COALESCE(admin_checked_by, ?), admin_checked_at = COALESCE(admin_checked_at, CURRENT_TIMESTAMP),
                  updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND status = 'pending' AND (admin_checked_at IS NOT NULL OR ? = 1)`
            ).bind(qr_code, serial_number, capex, (session && session.email) || null, requestId, isAdminRole ? 1 : 0),
            env.DB.prepare(
              `INSERT INTO assets (tracking_no, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, asset_condition, qr_code, serial_number, capex, status, latitude, longitude)
               SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`
            ).bind(placeholder, reqRow.outlet_code, reqRow.outlet_name, masterBrand, masterType, reqRow.mde_code, reqRow.doc_type, reqRow.asset_condition || 'new', qr_code, serial_number, capex, initialStatus, geoLat, geoLng),
            env.DB.prepare(
              `UPDATE assets SET tracking_no = 'TRK' || printf('%04d', id) WHERE tracking_no = ?`
            ).bind(placeholder),
          ]);

          if (!results[0].meta || results[0].meta.changes === 0) return alreadyProcessed();

          const newId = results[1].meta.last_row_id;
          const trackingNo = `TRK${String(newId).padStart(4, '0')}`;

          // ບັນທຶກການເຊື່ອມ ຄຳຂໍ -> Asset (ໃຊ້ໃນໜ້າ "ປະຫວັດການຂໍ Asset" ເພື່ອກວດວ່າອອກໃບສັນຍາຢືມ/ເຊັນແລ້ວຫຼືຍັງ)
          await env.DB.prepare("UPDATE asset_requests SET asset_id = ? WHERE id = ?").bind(newId, requestId).run();

          // ຈອງລາຍການໃນສະຕ໋ອກສາງ - ປ່ຽນເປັນ "ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ" (reserved) ທັນທີທີ່ອະນຸມັດ; ຈະເປັນ "ອອກໄປຮ້ານແລ້ວ" ຕອນຈັດສົ່ງສຳເລັດ ເພື່ອກັນລາຍການດຽວກັນຖືກອະນຸມັດຊ້ຳໃສ່ຄຳຂໍອື່ນ
          await markWarehouseStockReserved(
            env,
            { qr_code: stockMaster.qr_code, serial_number: stockMaster.serial_number },
            (session && session.email) || null,
            `ອະນຸມັດຄຳຂໍ - Tracking No ${trackingNo} (Outlet: ${reqRow.outlet_name || '-'}) - ລໍຖ້າຈັດສົ່ງ`
          );

          // ອອກໃບສັນຍາຢືມ (ຮ່າງ) ໃຫ້ Asset ນີ້ອັດຕະໂນມັດທັນທີທີ່ອະນຸມັດ (ຄໍລຳຮ້ານ/ຕູ້ແຊ່ ຖືກຕື່ມໄວ້ໃຫ້ຄົບ ຍັງຄ້າງແຕ່ລາຍເຊັນ)
          // ບໍ່ໃຫ້ລົ້ມເຫລວທັງໝົດຖ້າອອກໃບບໍ່ສຳເລັດ (ຄືກັນກັບ push notification) - ອະນຸມັດ Asset ຕ້ອງສຳເລັດຢູ່ສະເໝີ
          let loanDocNo = null;
          try {
            const loanRow = await createLoanContractDraftForAsset(env, newId, (session && session.email) || null, {
              contract_type: reqRow.contract_type || null, // ເອົາຈາກຄ່າທີ່ເລືອກຕອນຂໍ Asset
              manual_outlet: reqRow.outlet_code ? null : {
                owner: reqRow.outlet_owner, type: reqRow.outlet_type, level: reqRow.outlet_level, province: reqRow.outlet_province,
                village: reqRow.outlet_village, district: reqRow.outlet_district, phone: reqRow.outlet_phone,
              },
            });
            loanDocNo = loanRow && loanRow.doc_no;
          } catch (loanErr) {
            console.error("ອອກໃບສັນຍາຢືມອັດຕະໂນມັດບໍ່ສຳເລັດ (Tracking No " + trackingNo + "):", loanErr);
          }

          // แจ้งเตือน (Push Notification) ไปยังผู้ที่ยื่นคำขอว่าได้รับการอนุมัติแล้ว
          // ຖ້າອອກໃບສັນຍາຢືມ (ຮ່າງ) ອັດຕະໂນມັດສຳເລັດ - ເຕືອນໃຫ້ MDE ເຂົ້າໄປເຊັນຮັບໃບສັນຍານີ້ນຳ ແລ້ວພາໄປໜ້າ "ອອກໃບສັນຍາຢືມ" ໂດຍກົງ
          try {
            const mdeName = await getMdeName(env, reqRow.mde_code);
            const detailLine = formatMdeOutletLine(reqRow.mde_code, mdeName, reqRow.outlet_name);
            const signHint = loanDocNo ? `\nກະລຸນາເຊັນຮັບໃບສັນຍາຢືມ ${loanDocNo}` : '';
            await sendWebPushToUser(env, reqRow.user_id, {
              title: "ຂໍລະຫັດຂອງທ່ານໄດ້ຮັບການອະນຸມັດແລ້ວ",
              body: `${reqRow.cooler_brand} ${reqRow.cooler_type} - Tracking No: ${trackingNo}${detailLine ? '\n' + detailLine : ''}${signHint}`,
              url: loanDocNo ? "loanContract:queue" : "history",
            });
          } catch (pushErr) { /* ไม่ต้องทำอะไร ปล่อยให้การอนุมัติสำเร็จตามปกติ */ }

          return Response.json({
            message: `ອະນຸມັດຄຳຂໍຮຽບຮ້ອຍແລ້ວ (ສ້າງ Asset Tracking No: ${trackingNo})`
              + (loanDocNo ? ` — ອອກໃບສັນຍາຢືມ (ຮ່າງ) ອັດຕະໂນມັດແລ້ວ: ${loanDocNo}` : ""),
          });
        }

        // ປະຕິເສດ (rejected)
        const rejectResult = await env.DB.prepare(
          `UPDATE asset_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`
        ).bind(requestId).run();
        if (!rejectResult.meta || rejectResult.meta.changes === 0) return alreadyProcessed();

        // ຄຳຂໍ 'ໃໝ່' ຖືກປະຕິເສດ -> ໂຄຕ້າຄືນມາ: ຖ້າງົບປ່ຽນຈາກ ໝົດ ມາເປັນ ມີ ໃຫ້ແຈ້ງເຕືອນ user ຂອງທີມ
        if ((reqRow.asset_condition || 'new') === 'new') {
          runInBackground(ctx, notifyBudgetFreedIfWasFull(env, reqRow.team, reqRow.cooler_brand, reqRow.cooler_type));
        }

        // แจ้งเตือน (Push Notification) ไปยังผู้ที่ยื่นคำขอ เมื่อสถานะเปลี่ยน (เช่น ปฏิเสธ)
        try {
          const mdeName = await getMdeName(env, reqRow.mde_code);
          const detailLine = formatMdeOutletLine(reqRow.mde_code, mdeName, reqRow.outlet_name);
          await sendWebPushToUser(env, reqRow.user_id, {
            title: "ສະຖານະຄຳຂໍຂອງທ່ານມີການອັບເດດ",
            body: `${reqRow.cooler_brand} ${reqRow.cooler_type} - ສະຖານະ: ${status}${detailLine ? '\n' + detailLine : ''}`,
            url: "history",
          });
        } catch (pushErr) { /* ไม่ต้องทำอะไร */ }

        return Response.json({ message: `ອັບເດດສະຖານະຄຳຂໍເປັນ ${status} ຮຽບຮ້ອຍແລ້ວ` });
      } catch (e) {
        console.error("/api/admin/update-asset-request-status", e);
        return Response.json({ error: "ບໍ່ສາມາດອັບເດດສະຖານະໄດ້" }, { status: 500 });
      }
    }

    // 8e. ລາຍງານການຈັດສົ່ງບໍ່ມີເອກະສານ (ບັນທຶກເອງ - ແຍກຕ່າງຫາກຈາກ Asset Tracking)
    if (url.pathname === "/api/no-doc-delivery" && request.method === "POST") {
      try {
        let {
          userId, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, delivered_date, reason,
          qr_code, serial_number, capex, photo_qr, photo_serial, photo_capex, photo_asset,
          old_outlet_code, old_outlet_name, old_latitude, old_longitude, confirm_duplicate
        } = await request.json();

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !canViewAll(requester.role)) {
          return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });
        }
        if (!outlet_code || !outlet_name || !mde_code) {
          return Response.json({ error: "ກະລຸນາປ້ອນ Outlet Code, Outlet Name ແລະ MDE Code ໃຫ້ຄົບ" }, { status: 400 });
        }
        // Doc Type "ຕູ້ເຄື່ອນຍ້າຍ" ຕ້ອງລະບຸຂໍ້ມູນຮ້ານເດີມ (Outlet Code/Name) - Lat/Long ຂອງຮ້ານເດີມບໍ່ບັງຄັບ (ດຶງອັດຕະໂນມັດຖ້າມີໃນ Outlet Master)
        const RELOCATION_DOC_TYPE = "ຕູ້ເຄື່ອນຍ້າຍ";
        const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== "";
        if (doc_type === RELOCATION_DOC_TYPE) {
          if (!old_outlet_code || !old_outlet_name) {
            return Response.json({ error: "Doc Type \"ຕູ້ເຄື່ອນຍ້າຍ\" ຕ້ອງປ້ອນ Outlet Code ແລະ Outlet Name ຂອງຮ້ານເດີມໃຫ້ຄົບ" }, { status: 400 });
          }
          if ((hasVal(old_latitude) && isNaN(Number(old_latitude))) || (hasVal(old_longitude) && isNaN(Number(old_longitude)))) {
            return Response.json({ error: "Latitude / Longitude ຂອງຮ້ານເດີມຕ້ອງເປັນຕົວເລກເທົ່ານັ້ນ" }, { status: 400 });
          }
        }
        const oldLatVal = (doc_type === RELOCATION_DOC_TYPE && hasVal(old_latitude)) ? Number(old_latitude) : null;
        const oldLngVal = (doc_type === RELOCATION_DOC_TYPE && hasVal(old_longitude)) ? Number(old_longitude) : null;

        // Doc Type "ຕູ້ປ່ຽນແທນ" / "ມອບຕູ້ເພີ່ມ" / "ມອບຕູ້ໃຫມ່ຄັ້ງແລກ" ແມ່ນເອົາຕູ້ອອກຈາກສະຕ໋ອກສາງໄປໃຫ້ຮ້ານ
        // -> ຖືເອົາ "ສະຕ໋ອກສາງ" (warehouse_stock) ເປັນ Master: QR/Serial ຕ້ອງກົງກັບລາຍການທີ່ມີຢູ່ຈິງ ແລະ ຍັງ "ຢູ່ໃນສາງ" ເທົ່ານັ້ນ
        // ດຶງ QR/Serial/CapEx (ແລະ Brand/Type) ຈາກສະຕ໋ອກສາງມາໃຊ້ແທນຂໍ້ມູນທີ່ພິມເອງ ເພື່ອກັນຄວາມບໍ່ກົງກັນ
        const STOCK_MASTER_DOC_TYPES = new Set(["ຕູ້ປ່ຽນແທນ", "ມອບຕູ້ເພີ່ມ", "ມອບຕູ້ໃຫມ່ຄັ້ງແລກ"]);
        if (STOCK_MASTER_DOC_TYPES.has(doc_type)) {
          if (!qr_code && !serial_number) {
            return Response.json({ error: `Doc Type "${doc_type}" ຕ້ອງຄົ້ນຫາ ແລະ ເລືອກລາຍການຈາກສະຕ໋ອກສາງ (QR Code ຫຼື Serial Number)` }, { status: 400 });
          }
          let stockMaster = null;
          if (qr_code) {
            stockMaster = await env.DB.prepare(
              "SELECT * FROM warehouse_stock WHERE qr_code = ? AND qr_code != '' ORDER BY updated_at DESC LIMIT 1"
            ).bind(qr_code).first();
          }
          if (!stockMaster && serial_number) {
            stockMaster = await env.DB.prepare(
              "SELECT * FROM warehouse_stock WHERE serial_number = ? AND serial_number != '' ORDER BY updated_at DESC LIMIT 1"
            ).bind(serial_number).first();
          }
          if (!stockMaster) {
            return Response.json({
              error: "ບໍ່ພົບ QR Code / Serial Number ນີ້ໃນສະຕ໋ອກສາງ (Warehouse Master) - ກະລຸນາຄົ້ນຫາ ແລະ ເລືອກລາຍການຈາກສະຕ໋ອກສາງເທົ່ານັ້ນ"
            }, { status: 400 });
          }
          if (stockMaster.status !== 'in_warehouse') {
            const STATUS_LABEL_LAO = { in_warehouse: 'ຢູ່ໃນສາງ', reserved: 'ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ', outlet: 'ອອກໄປຮ້ານແລ້ວ', event: 'ກຳລັງໃຊ້ງານ Event', shipped_out: 'ສົ່ງຕ່າງແຂວງແລ້ວ', write_off: 'ສະສາງ', pending_write_off: 'ລໍຖ້າສະສາງ' };
            return Response.json({
              error: `ລາຍການນີ້ໃນສະຕ໋ອກສາງບໍ່ໄດ້ຢູ່ໃນສາງແລ້ວ (ສະຖານະປັດຈຸບັນ: ${STATUS_LABEL_LAO[stockMaster.status] || stockMaster.status})`
            }, { status: 400 });
          }
          // ໃຊ້ຂໍ້ມູນຈາກສະຕ໋ອກສາງ (master) ເປັນຫຼັກ ແທນຂໍ້ມູນທີ່ພິມເອງ
          qr_code = stockMaster.qr_code || qr_code;
          serial_number = stockMaster.serial_number || serial_number;
          capex = stockMaster.capex || capex;
          cooler_brand = stockMaster.cooler_brand || cooler_brand;
          cooler_type = stockMaster.cooler_type || cooler_type;
        }

        // ກັນບັນທຶກຊໍ້າ: ຖ້າ user ຄົນດຽວກັນບັນທຶກຂໍ້ມູນຄືກັນທຸກຢ່າງ ພາຍໃນ 30 ວິນາທີຫຼ້າສຸດ (ກົດປຸ່ມຫຼາຍເທື່ອຕິດໆ/double-tap) ໃຫ້ຖືວ່າສຳເລັດແລ້ວ ບໍ່ສ້າງແຖວໃໝ່
        const dupNoDoc = await env.DB.prepare(
          `SELECT id FROM no_doc_deliveries
           WHERE reported_by = ? AND outlet_code = ? AND mde_code = ?
             AND IFNULL(doc_type,'') = ? AND IFNULL(qr_code,'') = ? AND IFNULL(serial_number,'') = ? AND IFNULL(capex,'') = ?
             AND reported_at >= datetime('now', '-30 seconds')
           ORDER BY id DESC LIMIT 1`
        ).bind(requester.email, outlet_code, mde_code, doc_type || '', qr_code || '', serial_number || '', capex || '').first();
        if (dupNoDoc) {
          return Response.json({ message: "ບັນທຶກລາຍງານການຈັດສົ່ງບໍ່ມີເອກະສານຮຽບຮ້ອຍແລ້ວ" });
        }

        // ກວດຮູບທຸກໃບກ່ອນບັນທຶກຫຍັງ (ຮູບຜິດ = ຕອບ 400 ທັນທີ ບໍ່ສ້າງແຖວຄ້າງໄວ້)
        [photo_qr, photo_serial, photo_capex, photo_asset].forEach((p) => { if (p) decodeImageDataUrl(p); });

        // ===== ກວດວ່າ asset ນີ້ມີໃນ Asset Tracking ແລ້ວຫຼືບໍ່ =====
        // QR Code / Serial Number ແມ່ນ unique identifier ຂອງແຕ່ລະຕູ້ຢູ່ແລ້ວ (ບັງຄັບບໍ່ໃຫ້ຊ້ຳກັນຕອນສ້າງ/ແກ້ Asset - ເບິ່ງ findQrSerialCapexDuplicate)
        // ດັ່ງນັ້ນຖ້າມີ QR/Serial ສົ່ງມາ ໃຫ້ຈັບຄູ່ດ້ວຍ QR/Serial ຢ່າງດຽວ (ບໍ່ຈຳກັດ Outlet Code / Doc Type) ເພື່ອໃຫ້ຫາແຖວເດີມທີ່ "ລໍຖ້າ" ຢູ່ໃນ Asset Tracking ພົບສະເໝີ
        // (ກ່ອນໜ້ານີ້ຮ່ວມກັບເງື່ອນໄຂ Outlet Code + Doc Type ນຳ ເຮັດໃຫ້ຖ້າ outlet_code/doc_type ທີ່ພິມຕອນລາຍງານບໍ່ມີເອກະສານບໍ່ກົງກັບແຖວເດີມທຸກຕົວອັກສອນ
        //  ຈະຫາບໍ່ພົບ ແລະ ໄປສ້າງແຖວໃໝ່ໃນ Asset Tracking ແທນ ປະໃຫ້ແຖວເດີມທີ່ມີ QR/Serial ດຽວກັນຄ້າງຢູ່ "ລໍຈັດສົ່ງ" ຕະຫຼອດໄປ)
        // ຖ້າບໍ່ມີ QR/Serial ເລີຍ (doc type ທີ່ບໍ່ມີ QR) ຈຶ່ງໃຊ້ Outlet Code + Doc Type + MDE + Brand + Type ຄືເກົ່າ
        const conds = [];
        const binds = [];
        if (qr_code || serial_number) {
          const idConds = [];
          if (qr_code) { idConds.push("(qr_code = ? AND qr_code != '')"); binds.push(qr_code); }
          if (serial_number) { idConds.push("(serial_number = ? AND serial_number != '')"); binds.push(serial_number); }
          conds.push(`(${idConds.join(' OR ')})`);
        } else {
          conds.push("LOWER(TRIM(outlet_code)) = LOWER(?)", "IFNULL(doc_type,'') = ?", "mde_code = ?", "IFNULL(cooler_brand,'') = ?", "IFNULL(cooler_type,'') = ?");
          binds.push(String(outlet_code).trim(), doc_type || '', mde_code, cooler_brand || '', cooler_type || '');
        }
        const matchedRes = await env.DB.prepare(
          `SELECT id, tracking_no, status, delivered_at FROM assets WHERE ${conds.join(' AND ')} ORDER BY id DESC LIMIT 20`
        ).bind(...binds).all();
        const matchedAssets = matchedRes.results || [];
        const pendingAsset = matchedAssets.find((a) => (a.status || '') !== DELIVERED_STATUS);
        const deliveredAsset = matchedAssets.find((a) => a.status === DELIVERED_STATUS);

        // ພົບແຕ່ແຖວທີ່ "ສຳເລັດ" ແລ້ວ -> ເຕືອນ ແລະ ໃຫ້ພະນັກງານກົດຢືນຢັນກ່ອນຈຶ່ງບັນທຶກຊ້ຳ
        if (!pendingAsset && deliveredAsset && !confirm_duplicate) {
          return Response.json({
            code: "DUPLICATE_DELIVERED",
            tracking_no: deliveredAsset.tracking_no,
            error: `ພົບ Asset ນີ້ໃນ Asset Tracking ແລ້ວ ແລະ ຈັດສົ່ງສຳເລັດແລ້ວ (Tracking No: ${deliveredAsset.tracking_no}${deliveredAsset.delivered_at ? ', ວັນທີ ' + String(deliveredAsset.delivered_at).slice(0, 10) : ''})`
          }, { status: 409 });
        }

        const insertNoDocRecord = (qrKey, serialKey, capexKey, assetKey) => env.DB.prepare(
          `INSERT INTO no_doc_deliveries (outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code, serial_number, capex, photo_qr, photo_serial, photo_capex, photo_asset, delivered_date, reason, reported_by, old_outlet_code, old_outlet_name, old_latitude, old_longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          outlet_code, outlet_name, cooler_brand || null, cooler_type || null, mde_code, doc_type || null, qr_code || null, serial_number || null, capex || null, qrKey, serialKey, capexKey, assetKey, delivered_date || null, reason || null, requester.email,
          doc_type === RELOCATION_DOC_TYPE ? old_outlet_code : null, doc_type === RELOCATION_DOC_TYPE ? old_outlet_name : null, oldLatVal, oldLngVal
        ).run();

        const runSideEffects = async (trackingNo) => {
          // ເຊື່ອມກັບສະຕ໋ອກສາງ: doc_type = "ເກັບຄືນສາງ" -> ເອົາເຂົ້າສະຕ໋ອກຄືນ (in_warehouse), doc_type ອື່ນ -> ຖືວ່າອອກໄປຮ້ານແລ້ວ (outlet)
          if (doc_type === RETURN_TO_WAREHOUSE_DOC_TYPE) {
            await markWarehouseStockReturnedToWarehouse(
              env,
              { qr_code, serial_number, cooler_brand, cooler_type, capex },
              requester.email,
              `ລາຍງານການຈັດສົ່ງບໍ່ມີເອກະສານ - ເກັບຄືນສາງ - Tracking No ${trackingNo} (Outlet: ${outlet_name || '-'})`
            );
          } else {
            await markWarehouseStockDeliveredToOutlet(
              env,
              { qr_code, serial_number },
              requester.email,
              `ຈັດສົ່ງແບບບໍ່ມີເອກະສານ - Tracking No ${trackingNo} (Outlet: ${outlet_name || '-'})`
            );
          }
          // ແຈ້ງເຕືອນ MDE user ຂອງ asset ນີ້
          runInBackground(ctx, notifyMdeUserOfStatusChange(env, mde_code, trackingNo, outlet_name, DELIVERED_STATUS));
        };

        // ພົບແຖວທີ່ຍັງບໍ່ "ສຳເລັດ" ໃນ Asset Tracking -> ອັບເດດແຖວເດີມເປັນ "ສຳເລັດ" ແທນການສ້າງແຖວໃໝ່ (ກັນແຖວຊ້ຳ + ແຖວເກົ່າຄ້າງລໍຈັດສົ່ງ)
        if (pendingAsset) {
          const prev = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(pendingAsset.id).first();
          const deliveredAtExisting = delivered_date ? `${delivered_date} 00:00:00` : null;
          let existingKeys = [];
          try {
            const stamp = Date.now();
            existingKeys = await savePhotosToR2(env, [
              [photo_qr, `delivery/${prev.id}/qr-${stamp}.jpg`],
              [photo_serial, `delivery/${prev.id}/serial-${stamp}.jpg`],
              [photo_capex, `delivery/${prev.id}/capex-${stamp}.jpg`],
              [photo_asset, `delivery/${prev.id}/asset-${stamp}.jpg`],
            ]);
            const [qrKey, serialKey, capexKey, assetKey] = existingKeys;
            const upd = await env.DB.prepare(
              `UPDATE assets SET status = ?, qr_code = COALESCE(NULLIF(qr_code, ''), ?), serial_number = COALESCE(NULLIF(serial_number, ''), ?), capex = COALESCE(NULLIF(capex, ''), ?),
                                  delivery_photo_qr = ?, delivery_photo_serial = ?, delivery_photo_capex = ?, delivery_photo_asset = ?,
                                  delivered_at = COALESCE(?, CURRENT_TIMESTAMP), delivered_by = ?, last_update = CURRENT_TIMESTAMP
               WHERE id = ? AND IFNULL(status, '') != ?`
            ).bind(DELIVERED_STATUS, qr_code || null, serial_number || null, capex || null, qrKey, serialKey, capexKey, assetKey, deliveredAtExisting, requester.email, prev.id, DELIVERED_STATUS).run();
            if (!upd.meta || upd.meta.changes === 0) {
              await deleteR2Photos(env, existingKeys);
              return Response.json({ code: "DUPLICATE_DELIVERED", tracking_no: prev.tracking_no, error: `Asset ນີ້ (Tracking No: ${prev.tracking_no}) ຫາກໍ່ຖືກຈັດສົ່ງສຳເລັດໄປແລ້ວ` }, { status: 409 });
            }
            await insertNoDocRecord(qrKey, serialKey, capexKey, assetKey);
          } catch (stepErr) {
            console.error("/api/no-doc-delivery", stepErr);
            // ຄືນຄ່າແຖວເດີມ ຖ້າຂັ້ນຕອນໃດລົ້ມ
            await env.DB.prepare(
              `UPDATE assets SET status = ?, qr_code = ?, serial_number = ?, capex = ?, delivery_photo_qr = ?, delivery_photo_serial = ?, delivery_photo_capex = ?, delivery_photo_asset = ?, delivered_at = ?, delivered_by = ?, last_update = ? WHERE id = ?`
            ).bind(prev.status, prev.qr_code, prev.serial_number, prev.capex, prev.delivery_photo_qr, prev.delivery_photo_serial, prev.delivery_photo_capex, prev.delivery_photo_asset, prev.delivered_at, prev.delivered_by, prev.last_update, prev.id).run().catch(() => {});
            await deleteR2Photos(env, existingKeys);
            throw stepErr;
          }
          await runSideEffects(prev.tracking_no);
          return Response.json({ message: `ບັນທຶກລາຍງານຮຽບຮ້ອຍແລ້ວ - ພົບ Asset ນີ້ໃນ Asset Tracking ຢູ່ແລ້ວ (Tracking No: ${prev.tracking_no}) ຈຶ່ງອັບເດດສະຖານະເປັນ "ສຳເລັດ" ແທນການສ້າງແຖວໃໝ່` });
        }

        // ບັນທຶກເຂົ້າ Asset Tracking ດ້ວຍ ພ້ອມຕັ້ງ Status ເປັນ "ສຳເລັດ" ທັນທີ ເພື່ອໃຫ້ໂຊວ໌ຢູ່ໃນ "ປະຫວັດການຈັດສົ່ງ" ແບບດຽວກັນກັບການຢືນຢັນປົກກະຕິ
        const placeholder = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const deliveredAt = delivered_date ? `${delivered_date} 00:00:00` : null; // null = ใช้ CURRENT_TIMESTAMP
        const isRelocation = doc_type === RELOCATION_DOC_TYPE;
        const insertResult = await env.DB.prepare(
          `INSERT INTO assets (tracking_no, outlet_code, outlet_name, cooler_brand, cooler_type, mde_code, doc_type, qr_code, serial_number, capex, status, delivered_at, delivered_by, old_outlet_code, old_outlet_name, old_latitude, old_longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?)`
        ).bind(
          placeholder, outlet_code, outlet_name, cooler_brand || null, cooler_type || null, mde_code, doc_type || null, qr_code || null, serial_number || null, capex || null, DELIVERED_STATUS, deliveredAt, requester.email,
          isRelocation ? old_outlet_code : null, isRelocation ? old_outlet_name : null, oldLatVal, oldLngVal
        ).run();

        const newAssetId = insertResult.meta.last_row_id;
        const trackingNo = `TRK${String(newAssetId).padStart(4, '0')}`;

        // ຖ່າຍຮູບຢືນຢັນເປັນທາງເລືອກ (ບໍ່ບັງຄັບ ຄືກັນກັບ QR/Serial/CapEx) - ອັບໂຫລດສະເພາະຮູບທີ່ມີ
        // ຖ້າຂັ້ນຕອນໃດຫຼັງຈາກນີ້ລົ້ມ -> ລຶບແຖວ Asset ທີ່ຫາກໍ່ສ້າງ + ຮູບໃນ R2 ອອກ ບໍ່ໃຫ້ຄ້າງແຖວ "TMP-..." ໃນປະຫວັດການຈັດສົ່ງ
        let uploadedKeys = [];
        try {
          const stamp = Date.now();
          uploadedKeys = await savePhotosToR2(env, [
            [photo_qr, `delivery/${newAssetId}/qr-${stamp}.jpg`],
            [photo_serial, `delivery/${newAssetId}/serial-${stamp}.jpg`],
            [photo_capex, `delivery/${newAssetId}/capex-${stamp}.jpg`],
            [photo_asset, `delivery/${newAssetId}/asset-${stamp}.jpg`],
          ]);
          const [qrKey, serialKey, capexKey, assetKey] = uploadedKeys;

          await env.DB.prepare(
            `UPDATE assets SET tracking_no = ?, delivery_photo_qr = ?, delivery_photo_serial = ?, delivery_photo_capex = ?, delivery_photo_asset = ? WHERE id = ?`
          ).bind(trackingNo, qrKey, serialKey, capexKey, assetKey, newAssetId).run();

          await insertNoDocRecord(qrKey, serialKey, capexKey, assetKey);
        } catch (stepErr) {
          console.error("/api/no-doc-delivery", stepErr);
          await env.DB.prepare("DELETE FROM assets WHERE id = ?").bind(newAssetId).run().catch(() => {});
          await deleteR2Photos(env, uploadedKeys);
          throw stepErr;
        }

        await runSideEffects(trackingNo);

        runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin"], {
          title: "ການຈັດສົ່ງແບບບໍ່ມີເອກະສານສຳເລັດແລ້ວ",
          body: `${trackingNo}\n${formatMdeOutletLine(mde_code, '', outlet_name)}`.trim(),
          url: "noDocDeliveryList",
        }));

        return Response.json({ message: `ບັນທຶກລາຍງານການຈັດສົ່ງບໍ່ມີເອກະສານຮຽບຮ້ອຍແລ້ວ (ບັນທຶກເຂົ້າປະຫວັດການຈັດສົ່ງ Tracking No: ${trackingNo})` });
      } catch (e) {
        console.error("/api/no-doc-delivery", e);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດບັນທຶກຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/no-doc-delivery" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const requester = userId ? await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first() : null;
      if (!requester || !canViewAll(requester.role)) {
        return Response.json({ error: "ບໍ່ມີສິດເບິ່ງລາຍງານນີ້" }, { status: 403 });
      }

      const { results } = await env.DB.prepare(
        "SELECT * FROM no_doc_deliveries ORDER BY reported_at DESC LIMIT 1000"
      ).all();
      return Response.json(results || []);
    }

    if (url.pathname === "/api/admin/delete-no-doc-delivery" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || requester.role !== 'admin') {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລຶບລາຍງານນີ້ໄດ້" }, { status: 403 });
        }

        const deliveryRow = await env.DB.prepare(
          "SELECT photo_qr, photo_serial, photo_capex, photo_asset FROM no_doc_deliveries WHERE id = ?"
        ).bind(id).first();

        await env.DB.prepare("DELETE FROM no_doc_deliveries WHERE id = ?").bind(id).run();
        if (deliveryRow) {
          await deleteR2Photos(env, [
            deliveryRow.photo_qr,
            deliveryRow.photo_serial,
            deliveryRow.photo_capex,
            deliveryRow.photo_asset,
          ]);
        }
        return Response.json({ message: "ລຶບລາຍງານຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-no-doc-delivery", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 8f. ລາຍງານຕູ້ແຊ່ Event - ບັນທຶກຕອນເອົາຕູ້ແຊ່ອອກໄປໃຊ້ງານຊົ່ວຄາວ (event/ໂປໂມຊັນ) ບໍ່ຜູກກັບ Asset ໃນລະບົບ, ປ້ອນຂໍ້ມູນຕູ້ເອງ
    if (url.pathname === "/api/cooler-event" && request.method === "POST") {
      try {
        const {
          userId, cooler_brand, cooler_type, qr_code, serial_number, capex, event_name, event_location,
          taken_date, expected_return_date, notes, taken_photo
        } = await request.json();

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !canViewAll(requester.role)) {
          return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });
        }
        if (!event_location || !taken_date) {
          return Response.json({ error: "ກະລຸນາປ້ອນສະຖານທີ່ (ເອົາໄປໃສ) ແລະ ວັນທີ່ເອົາໄປ ໃຫ້ຄົບ" }, { status: 400 });
        }

        // ກັນບັນທຶກຊໍ້າ: ຖ້າ user ຄົນດຽວກັນບັນທຶກຂໍ້ມູນຄືກັນທຸກຢ່າງ ພາຍໃນ 30 ວິນາທີຫຼ້າສຸດ ໃຫ້ຖືວ່າສຳເລັດແລ້ວ ບໍ່ສ້າງແຖວໃໝ່
        const dupEvent = await env.DB.prepare(
          `SELECT id FROM cooler_events
           WHERE taken_by = ? AND event_location = ? AND taken_date = ?
             AND IFNULL(cooler_brand,'') = ? AND IFNULL(cooler_type,'') = ?
             AND created_at >= datetime('now', '-30 seconds')
           ORDER BY id DESC LIMIT 1`
        ).bind(requester.email, event_location, taken_date, cooler_brand || '', cooler_type || '').first();
        if (dupEvent) {
          return Response.json({ message: "ບັນທຶກລາຍການເອົາຕູ້ແຊ່ໄປ event ຮຽບຮ້ອຍແລ້ວ" });
        }

        if (taken_photo) decodeImageDataUrl(taken_photo); // ກວດຮູບກ່ອນບັນທຶກ ຖ້າຮູບຜິດຈະບໍ່ສ້າງແຖວຄ້າງ

        const insertResult = await env.DB.prepare(
          `INSERT INTO cooler_events (cooler_brand, cooler_type, qr_code, serial_number, capex, event_name, event_location, taken_date, taken_by, expected_return_date, notes)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
              SELECT 1 FROM cooler_events
               WHERE taken_by = ? AND event_location = ? AND taken_date = ?
                 AND IFNULL(cooler_brand,'') = ? AND IFNULL(cooler_type,'') = ?
                 AND created_at >= datetime('now', '-30 seconds'))`
        ).bind(cooler_brand || null, cooler_type || null, qr_code || null, serial_number || null, capex || null, event_name || null, event_location, taken_date, requester.email, expected_return_date || null, notes || null, requester.email, event_location, taken_date, cooler_brand || '', cooler_type || '').run();
        if (!insertResult.meta || !insertResult.meta.changes) { // ມີລາຍການດຽວກັນຖືກບັນທຶກພ້ອມກັນແລ້ວ (race) -> ບໍ່ສ້າງຊ້ຳ
          return Response.json({ message: "ບັນທຶກລາຍການເອົາຕູ້ແຊ່ໄປ event ຮຽບຮ້ອຍແລ້ວ" });
        }

        const newEventId = insertResult.meta.last_row_id;

        // ຮູບຢືນຢັນຕອນເອົາໄປເປັນທາງເລືອກ (ບໍ່ບັງຄັບ) - ອັບໂຫລດຂຶ້ນ R2 ຖ້າມີ
        if (taken_photo) {
          const [key] = await savePhotosToR2(env, [[taken_photo, `event/${newEventId}/taken-${Date.now()}.jpg`]]);
          await env.DB.prepare("UPDATE cooler_events SET taken_photo = ? WHERE id = ?").bind(key, newEventId).run();
        }

        // ປ່ຽນສະຖານະສະຕ໋ອກສາງເປັນ "ກຳລັງໃຊ້ງານ Event" (ຖ້າ QR/Serial ກົງກັບລາຍການທີ່ຢູ່ໃນສາງ)
        await syncWarehouseStockForEvent(env, { qr_code, serial_number }, "out", requester.email,
          `ເອົາໄປ Event: ${event_name || event_location}`);

        // ແຈ້ງເຕືອນ admin ວ່າມີການເອົາຕູ້ແຊ່ໄປ event ໃໝ່ (ບັນທຶກໂດຍ warehouse/delivery ເອງ admin ຈຶ່ງບໍ່ຮູ້ຖ້າບໍ່ແຈ້ງ)
        runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin"], {
          title: "ມີການເອົາຕູ້ແຊ່ໄປ Event",
          body: `${[cooler_brand, cooler_type].filter(Boolean).join(' ') || 'ຕູ້ແຊ່'} - ${event_name || event_location}${expected_return_date ? `\nກຳນົດເອົາກັບຄືນ: ${expected_return_date}` : ''}`,
          url: "coolerEventList",
        }));

        return Response.json({ message: "ບັນທຶກລາຍການເອົາຕູ້ແຊ່ໄປ event ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/cooler-event", e);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດບັນທຶກຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 8g. ດຶງລາຍການ "ຕູ້ແຊ່ Event" ທັງໝົດ (admin, warehouse, delivery ເບິ່ງໄດ້)
    if (url.pathname === "/api/cooler-event" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const requester = userId ? await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first() : null;
      if (!requester || !canViewAll(requester.role)) {
        return Response.json({ error: "ບໍ່ມີສິດເບິ່ງລາຍງານນີ້" }, { status: 403 });
      }

      const { results } = await env.DB.prepare(
        "SELECT * FROM cooler_events ORDER BY returned ASC, taken_date DESC, id DESC LIMIT 1000"
      ).all();
      return Response.json(results || []);
    }

    // 8h. ບັນທຶກ "ເອົາກັບຄືນແລ້ວ" ສຳລັບຕູ້ແຊ່ Event ລາຍການໃດໜຶ່ງ
    if (url.pathname === "/api/cooler-event/return" && request.method === "POST") {
      try {
        const { userId, id, returned_date, returned_photo } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການອັບເດດ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !canViewAll(requester.role)) {
          return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });
        }

        const evRow = await env.DB.prepare(
          "SELECT qr_code, serial_number, event_name, event_location, returned FROM cooler_events WHERE id = ?"
        ).bind(id).first();

        let returnedKey = null;
        if (returned_photo) {
          [returnedKey] = await savePhotosToR2(env, [[returned_photo, `event/${id}/returned-${Date.now()}.jpg`]]);
        }

        await env.DB.prepare(
          `UPDATE cooler_events SET returned = 1, returned_date = ?, returned_by = ?,
             returned_photo = COALESCE(?, returned_photo), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).bind(returned_date || new Date().toISOString().slice(0, 10), requester.email, returnedKey, id).run();

        // ເອົາຕູ້ກັບຄືນແລ້ວ -> ສະຕ໋ອກສາງກັບເປັນ "ຢູ່ໃນສາງ" (ສະເພາະຄັ້ງທຳອິດທີ່ບັນທຶກ ກັນກົດຊໍ້າ)
        if (evRow && !evRow.returned) {
          await syncWarehouseStockForEvent(env, evRow, "back", requester.email,
            `ກັບຄືນຈາກ Event: ${evRow.event_name || evRow.event_location || '-'}`);

          // ແຈ້ງເຕືອນ admin ວ່າຕູ້ແຊ່ event ນີ້ຖືກເອົາກັບຄືນສາງແລ້ວ
          runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin"], {
            title: "ຕູ້ແຊ່ Event ຖືກເອົາກັບຄືນແລ້ວ",
            body: `${evRow.event_name || evRow.event_location || '-'}`,
            url: "coolerEventList",
          }));
        }

        return Response.json({ message: "ບັນທຶກ ເອົາຕູ້ແຊ່ກັບຄືນ ຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/cooler-event/return", e);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດອັບເດດຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 8j. ລາຍງານຕູ້ແຊ່ສະສາງ - ບັນທຶກ (admin + warehouse)
    //     ສະຕັອກສາງທີ່ "ຢູ່ໃນສາງ" -> ປ່ຽນເປັນ "ລໍຖ້າສະສາງ" (pending_write_off) ແລ້ວ Admin ຢືນຢັນ -> "ສະສາງ" (write_off) ພ້ອມບັນທຶກປະຫວັດ
    //     ຕູ້ທີ່ຢູ່ສະຖານະອື່ນ (ຈອງແລ້ວ/ອອກໄປຮ້ານ/Event) ສະສາງບໍ່ໄດ້ - ຕ້ອງເອົາກັບເຂົ້າສາງກ່ອນ
    if (url.pathname === "/api/cooler-writeoff" && request.method === "POST") {
      try {
        const {
          userId, stock_id, cooler_brand, cooler_type, qr_code, serial_number, capex, reason, writeoff_date, notes, photo
        } = await request.json();

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !["admin", "warehouse"].includes(requester.role)) {
          return Response.json({ error: "ບໍ່ມີສິດເຮັດລາຍການນີ້" }, { status: 403 });
        }

        const note = String(notes || "").trim();
        if (!Object.prototype.hasOwnProperty.call(WRITEOFF_REASONS, reason)) {
          return Response.json({ error: "ກະລຸນາເລືອກເຫດຜົນການສະສາງ" }, { status: 400 });
        }
        if (reason === "other" && !note) {
          return Response.json({ error: "ເຫດຜົນ \"ອື່ນໆ\" ກະລຸນາລະບຸລາຍລະອຽດໃນໝາຍເຫດ" }, { status: 400 });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(writeoff_date || ""))) {
          return Response.json({ error: "ກະລຸນາປ້ອນວັນທີ່ສະສາງ" }, { status: 400 });
        }

        // ສະສາງໄດ້ສະເພາະຕູ້ທີ່ມີໃນສະຕັອກສາງ (ຄົ້ນຫາຈາກສະຕັອກສາງ QR / Serial / CapEx ຢ່າງດຽວ) - ບໍ່ຮັບການປ້ອນຂໍ້ມູນເອງ
        let stock = null;
        if (stock_id) {
          stock = await env.DB.prepare(
            "SELECT s.*, w.name AS warehouse_name FROM warehouse_stock s LEFT JOIN wh_warehouses w ON w.id = s.warehouse_id WHERE s.id = ?"
          ).bind(stock_id).first();
        }
        if (!stock) {
          return Response.json({ error: "ກະລຸນາຄົ້ນຫາ ແລະ ເລືອກຕູ້ຈາກສະຕັອກສາງ (QR / Serial / CapEx) - ບໍ່ອະນຸຍາດໃຫ້ປ້ອນເອງ" }, { status: 400 });
        }
        if (stock.status === "write_off") {
          return Response.json({ error: "ຕູ້ນີ້ຖືກສະສາງໄປແລ້ວ (ສະຖານະສະຕັອກ = ສະສາງ)" }, { status: 409 });
        }
        if (stock.status !== "in_warehouse") {
          const label = { reserved: "ຈອງແລ້ວ ລໍຖ້າຈັດສົ່ງ", outlet: "ອອກໄປຮ້ານແລ້ວ", event: "ກຳລັງໃຊ້ງານ Event", shipped_out: "ສົ່ງຕ່າງແຂວງແລ້ວ", pending_write_off: "ລໍຖ້າສະສາງ" }[stock.status] || stock.status;
          return Response.json({ error: `ຕູ້ນີ້ຢູ່ສະຖານະ "${label}" - ສະສາງໄດ້ສະເພາະຕູ້ທີ່ "ຢູ່ໃນສາງ" (ກະລຸນາເອົາຕູ້ກັບເຂົ້າສາງກ່ອນ)` }, { status: 409 });
        }
        const qr = String(stock.qr_code || "").trim();
        const serial = String(stock.serial_number || "").trim();
        const cap = String(stock.capex || "").trim();

        // ກັນບັນທຶກຊໍ້າ (ກົດສົ່ງສອງເທື່ອ) ພາຍໃນ 30 ວິນາທີ
        const dup = await env.DB.prepare(
          `SELECT id FROM cooler_writeoffs
           WHERE written_off_by = ? AND IFNULL(qr_code,'') = ? AND IFNULL(serial_number,'') = ? AND IFNULL(capex,'') = ?
             AND created_at >= datetime('now', '-30 seconds') ORDER BY id DESC LIMIT 1`
        ).bind(requester.email, qr, serial, cap).first();
        if (dup) return Response.json({ message: "ບັນທຶກລາຍງານຕູ້ແຊ່ສະສາງຮຽບຮ້ອຍແລ້ວ" });

        if (photo) decodeImageDataUrl(photo); // ກວດຮູບກ່ອນບັນທຶກ ຖ້າຮູບຜິດຈະບໍ່ສ້າງແຖວຄ້າງ

        const brand = String(cooler_brand || (stock && stock.cooler_brand) || "").trim() || null;
        const type = String(cooler_type || (stock && stock.cooler_type) || "").trim() || null;

        const ins = await env.DB.prepare(
          `INSERT INTO cooler_writeoffs
             (stock_id, prev_status, warehouse_name, cooler_brand, cooler_type, qr_code, serial_number, capex, reason, writeoff_date, written_off_by, notes, status)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
            WHERE NOT EXISTS (
              SELECT 1 FROM cooler_writeoffs
               WHERE written_off_by = ? AND IFNULL(qr_code,'') = ? AND IFNULL(serial_number,'') = ? AND IFNULL(capex,'') = ?
                 AND created_at >= datetime('now', '-30 seconds'))`
        ).bind(
          stock ? stock.id : null, stock ? stock.status : null, stock ? (stock.warehouse_name || null) : null,
          brand, type, qr || null, serial || null, cap || null, reason, writeoff_date, requester.email, note || null,
          requester.email, qr, serial, cap
        ).run();
        if (!ins.meta || !ins.meta.changes) { // ບັນທຶກພ້ອມກັນແລ້ວ (race) -> ບໍ່ສ້າງລາຍງານ/ປ່ຽນສະຖານະສະຕັອກຊ້ຳ
          return Response.json({ message: "ບັນທຶກລາຍງານຕູ້ແຊ່ສະສາງຮຽບຮ້ອຍແລ້ວ" });
        }
        const newId = ins.meta.last_row_id;

        if (photo) {
          const [key] = await savePhotosToR2(env, [[photo, `writeoff/${newId}/photo-${Date.now()}.jpg`]]);
          await env.DB.prepare("UPDATE cooler_writeoffs SET photo = ? WHERE id = ?").bind(key, newId).run();
        }

        let stockUpdated = false;
        if (stock) {
          try {
            await setWarehouseStockStatus(env, stock, "in_warehouse", "pending_write_off", requester.email,
              `ລໍຖ້າສະສາງ (ລໍຖ້າ Admin ຢືນຢັນ): ${WRITEOFF_REASONS[reason]}${note ? " - " + note : ""}`);
            stockUpdated = true;
          } catch (e) {
            console.error("/api/cooler-writeoff", e);
            // ບໍ່ໃຫ້ລົ້ມທັງລາຍງານ - ບັນທຶກລາຍງານສຳເລັດແລ້ວ (Admin ແກ້ສະຖານະສະຕັອກເອງໄດ້)
          }
        }

        runInBackground(ctx, sendWebPushToRoles(env, ["admin", "assistant_admin"], {
          title: "ມີລາຍງານຕູ້ແຊ່ສະສາງ ລໍຖ້າຢືນຢັນ",
          body: `${[brand, type].filter(Boolean).join(" ") || "ຕູ້ແຊ່"} (${qr || serial || cap}) - ${WRITEOFF_REASONS[reason]}`,
          url: "coolerWriteOffList",
        }));

        return Response.json({
          message: stockUpdated
            ? "ບັນທຶກລາຍງານຮຽບຮ້ອຍ ສະຖານະສະຕັອກສາງເປັນ \"ລໍຖ້າສະສາງ\" - ລໍຖ້າ Admin ຢືນຢັນ"
            : "ບັນທຶກລາຍງານຮຽບຮ້ອຍ ແຕ່ປ່ຽນສະຖານະສະຕັອກສາງບໍ່ສຳເລັດ - ກະລຸນາກວດສອບໜ້າສະຕັອກສາງ",
          stock_updated: stockUpdated,
        });
      } catch (e) {
        console.error("/api/cooler-writeoff", e);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດບັນທຶກຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 8k. ດຶງລາຍງານຕູ້ແຊ່ສະສາງທັງໝົດ (admin + warehouse)
    if (url.pathname === "/api/cooler-writeoff" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const requester = userId ? await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first() : null;
      if (!requester || !["admin", "warehouse"].includes(requester.role)) {
        return Response.json({ error: "ບໍ່ມີສິດເບິ່ງລາຍງານນີ້" }, { status: 403 });
      }
      const { results } = await env.DB.prepare(
        "SELECT * FROM cooler_writeoffs ORDER BY writeoff_date DESC, id DESC LIMIT 1000"
      ).all();
      return Response.json(results || []);
    }

    // 8m. Admin ຢືນຢັນການສະສາງ: ລາຍງານ pending -> confirmed ແລະ ສະຕັອກ pending_write_off -> write_off (/api/admin/* = admin ເທົ່ານັ້ນ)
    if (url.pathname === "/api/admin/confirm-cooler-writeoff" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການຢືນຢັນ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ຢືນຢັນການສະສາງໄດ້" }, { status: 403 });
        }

        const row = await env.DB.prepare("SELECT * FROM cooler_writeoffs WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບລາຍການນີ້" }, { status: 404 });
        if (row.status !== "pending") return Response.json({ error: "ລາຍການນີ້ຖືກຢືນຢັນແລ້ວ" }, { status: 409 });

        // ເງື່ອນໄຂ status = 'pending' ຢູ່ໃນ UPDATE ເອງ ກັນ Admin ສອງຄົນກົດພ້ອມກັນ
        const upd = await env.DB.prepare(
          `UPDATE cooler_writeoffs SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'pending'`
        ).bind(requester.email, id).run();
        if (!upd.meta || upd.meta.changes === 0) return Response.json({ error: "ລາຍການນີ້ຖືກຢືນຢັນແລ້ວ" }, { status: 409 });

        let stockUpdated = false;
        if (row.stock_id) {
          const stock = await env.DB.prepare("SELECT * FROM warehouse_stock WHERE id = ?").bind(row.stock_id).first();
          if (stock && stock.status === "pending_write_off") {
            try {
              await setWarehouseStockStatus(env, stock, "pending_write_off", "write_off", requester.email,
                `Admin ຢືນຢັນການສະສາງ: ${WRITEOFF_REASONS[row.reason] || row.reason || "-"}`);
              stockUpdated = true;
            } catch (e) { /* ລາຍງານຢືນຢັນແລ້ວ - ແກ້ສະຖານະສະຕັອກເອງໄດ້ໃນໜ້າສະຕັອກສາງ */ }
          }
        }
        return Response.json({
          message: stockUpdated
            ? "ຢືນຢັນການສະສາງຮຽບຮ້ອຍ ແລະ ປ່ຽນສະຖານະສະຕັອກສາງເປັນ \"ສະສາງ\" ແລ້ວ"
            : "ຢືນຢັນລາຍງານຮຽບຮ້ອຍ ແຕ່ສະຖານະສະຕັອກບໍ່ໄດ້ຖືກປ່ຽນ (ສະຕັອກບໍ່ໄດ້ຢູ່ໃນ \"ລໍຖ້າສະສາງ\") - ກະລຸນາກວດສອບໜ້າສະຕັອກສາງ",
          stock_updated: stockUpdated,
        });
      } catch (e) {
        console.error("/api/admin/confirm-cooler-writeoff", e);
        return Response.json({ error: "ບໍ່ສາມາດຢືນຢັນໄດ້" }, { status: 500 });
      }
    }

    // 8m2. Admin ຢືນຢັນການສະສາງຫຼາຍລາຍການພ້ອມກັນ (select ແລ້ວກົດຄັ້ງດຽວ) - ໃຊ້ຫຼັກການດຽວກັບ 8m ແຕ່ວົນຕາມແຕ່ລະ id
    if (url.pathname === "/api/admin/confirm-cooler-writeoff-bulk" && request.method === "POST") {
      try {
        const body = await request.json();
        const userId = body.userId;
        const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
        if (!ids.length) return Response.json({ error: "ກະລຸນາເລືອກລາຍການທີ່ຕ້ອງການຢືນຢັນ" }, { status: 400 });
        if (ids.length > 200) return Response.json({ error: "ເລືອກໄດ້ສູງສຸດ 200 ລາຍການຕໍ່ຄັ້ງ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || !isAdminLike(requester.role)) {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ຢືນຢັນການສະສາງໄດ້" }, { status: 403 });
        }

        let confirmed = 0, stockUpdated = 0, skipped = 0, failed = 0;
        for (const id of ids) {
          try {
            const row = await env.DB.prepare("SELECT * FROM cooler_writeoffs WHERE id = ?").bind(id).first();
            if (!row || row.status !== "pending") { skipped++; continue; }

            // ເງື່ອນໄຂ status = 'pending' ໃນ UPDATE ກັນ Admin ສອງຄົນກົດພ້ອມກັນ
            const upd = await env.DB.prepare(
              `UPDATE cooler_writeoffs SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND status = 'pending'`
            ).bind(requester.email, id).run();
            if (!upd.meta || upd.meta.changes === 0) { skipped++; continue; }
            confirmed++;

            if (row.stock_id) {
              const stock = await env.DB.prepare("SELECT * FROM warehouse_stock WHERE id = ?").bind(row.stock_id).first();
              if (stock && stock.status === "pending_write_off") {
                try {
                  await setWarehouseStockStatus(env, stock, "pending_write_off", "write_off", requester.email,
                    `Admin ຢືນຢັນການສະສາງ: ${WRITEOFF_REASONS[row.reason] || row.reason || "-"}`);
                  stockUpdated++;
                } catch (e) { /* ລາຍງານຢືນຢັນແລ້ວ - ແກ້ສະຖານະສະຕັອກເອງໄດ້ໃນໜ້າສະຕັອກສາງ */ }
              }
            }
          } catch (e) { failed++; }
        }

        let message = `ຢືນຢັນການສະສາງສຳເລັດ ${confirmed} ລາຍການ`;
        if (confirmed > stockUpdated) message += ` (ປ່ຽນສະຖານະສະຕັອກ ${stockUpdated} ລາຍການ - ອີກ ${confirmed - stockUpdated} ລາຍການ ກະລຸນາກວດສອບໜ້າສະຕັອກສາງ)`;
        if (skipped) message += ` | ຂ້າມ ${skipped} ລາຍການ (ຖືກຢືນຢັນແລ້ວ ຫຼື ບໍ່ພົບ)`;
        if (failed) message += ` | ຜິດພາດ ${failed} ລາຍການ`;
        return Response.json({ message, confirmed, stock_updated: stockUpdated, skipped, failed });
      } catch (e) {
        console.error("/api/admin/confirm-cooler-writeoff-bulk", e);
        return Response.json({ error: "ບໍ່ສາມາດຢືນຢັນໄດ້" }, { status: 500 });
      }
    }

    // 8l. ລຶບລາຍງານຕູ້ແຊ່ສະສາງ (ສະເພາະ Admin) - ຖ້າລາຍງານນີ້ເປັນຜູ້ປ່ຽນສະຖານະສະຕັອກເປັນ "ສະສາງ" ແລະ ຕູ້ຍັງເປັນ "ສະສາງ" ຢູ່ -> ຄືນສະຖານະເດີມ
    if (url.pathname === "/api/admin/delete-cooler-writeoff" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester || requester.role !== "admin") {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລຶບລາຍງານນີ້ໄດ້" }, { status: 403 });
        }

        const row = await env.DB.prepare("SELECT * FROM cooler_writeoffs WHERE id = ?").bind(id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບລາຍການນີ້" }, { status: 404 });

        await env.DB.prepare("DELETE FROM cooler_writeoffs WHERE id = ?").bind(id).run();

        let restored = false;
        if (row.stock_id) {
          const stock = await env.DB.prepare("SELECT * FROM warehouse_stock WHERE id = ?").bind(row.stock_id).first();
          if (stock && (stock.status === "write_off" || stock.status === "pending_write_off")) {
            try {
              await setWarehouseStockStatus(env, stock, stock.status, row.prev_status || "in_warehouse", requester.email,
                "ລຶບລາຍງານສະສາງ - ຄືນສະຖານະເດີມ");
              restored = true;
            } catch (e) { /* ບໍ່ໃຫ້ລົ້ມການລຶບ */ }
          }
        }
        await deleteR2Photos(env, [row.photo]);
        return Response.json({ message: restored ? "ລຶບລາຍງານຮຽບຮ້ອຍ ແລະ ຄືນສະຖານະສະຕັອກສາງແລ້ວ" : "ລຶບລາຍງານຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-cooler-writeoff", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 8i. ລຶບລາຍການ "ຕູ້ແຊ່ Event" (ສະເພາະ Admin)
    if (url.pathname === "/api/admin/delete-cooler-event" && request.method === "POST") {
      try {
        const { userId, id } = await request.json();
        if (!id) return Response.json({ error: "ບໍ່ພົບລາຍການທີ່ຕ້ອງການລຶບ" }, { status: 400 });

        const requester = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
        if (!requester || requester.role !== 'admin') {
          return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລຶບລາຍງານນີ້ໄດ້" }, { status: 403 });
        }

        const eventRow = await env.DB.prepare(
          "SELECT taken_photo, returned_photo, qr_code, serial_number, returned FROM cooler_events WHERE id = ?"
        ).bind(id).first();

        const delEvRes = await env.DB.prepare("DELETE FROM cooler_events WHERE id = ?").bind(id).run();
        const evRemoved = !delEvRes.meta || delEvRes.meta.changes > 0; // ກົດລຶບຊ້ຳ: ຄັ້ງທີ 2 ບໍ່ຕ້ອງຄືນສະຕັອກ/ບັນທຶກປະຫວັດຊ້ຳ
        // ລຶບລາຍງານທີ່ຍັງບໍ່ໄດ້ເອົາກັບຄືນ (ບັນທຶກຜິດ) -> ຖ້າຕູ້ນັ້ນບໍ່ມີ Event ຄ້າງອື່ນແລ້ວ ໃຫ້ສະຕັອກກັບເປັນ "ຢູ່ໃນສາງ"
        if (eventRow && !eventRow.returned && evRemoved) {
          const stillOut = await env.DB.prepare(
            `SELECT id FROM cooler_events WHERE returned = 0
               AND ((qr_code = ? AND qr_code != '') OR (serial_number = ? AND serial_number != '')) LIMIT 1`
          ).bind(eventRow.qr_code || '__none__', eventRow.serial_number || '__none__').first();
          if (!stillOut) {
            await syncWarehouseStockForEvent(env, eventRow, "back", null, "ລຶບລາຍງານ Event ທີ່ບັນທຶກຜິດ");
          }
        }
        if (eventRow) {
          await deleteR2Photos(env, [eventRow.taken_photo, eventRow.returned_photo]);
        }
        return Response.json({ message: "ລຶບລາຍງານຮຽບຮ້ອຍແລ້ວ" });
      } catch (e) {
        console.error("/api/admin/delete-cooler-event", e);
        return Response.json({ error: "ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້" }, { status: 500 });
      }
    }

    // 9. ดูປະຫວັດການຂໍ Asset ทั้งหมดของ MDE หนึ่งๆ (ทุกສະຖານະ) + Asset ที่ track อยู่ปัจจุบัน
    //    Admin ดูได้ทุก MDE / User ดูได้เฉพาะ MDE ของตัวเอง
    if (url.pathname === "/api/mde-history" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      let mdeCode = url.searchParams.get("mde_code");
      if (!userId) return Response.json({ error: "ຂໍ້ມູນບໍ່ຄົບຖ້ວນ" }, { status: 400 });

      const requester = await env.DB.prepare("SELECT role, mde_code, team FROM users WHERE id = ?").bind(userId).first();
      if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

      // DSM: ເບິ່ງປະຫວັດຂອງ MDE ໃນທີມຕົນເອງເທົ່ານັ້ນ (ບໍ່ລະບຸ/ALL = ທັງທີມ)
      const isDsmReq = requester.role === "dsm";
      if (isDsmReq) {
        if (!mdeCode || mdeCode === "ALL") mdeCode = "ALL";
        else {
          const inTeam = await env.DB.prepare("SELECT 1 AS ok FROM mde_list WHERE team = ? AND UPPER(TRIM(mde_code)) = UPPER(TRIM(?)) LIMIT 1").bind(requester.team || "", mdeCode).first();
          if (!inTeam) return Response.json({ error: "MDE ນີ້ບໍ່ຢູ່ໃນທີມຂອງທ່ານ" }, { status: 403 });
        }
      }
      if (!canViewAll(requester.role) && !isDsmReq) {
        // User ทั่วไปดูได้เฉพาะ MDE ของตัวเองเท่านั้น ไม่ว่าจะส่ง mde_code อะไรมาก็ตาม
        mdeCode = requester.mde_code;
      }
      // Admin/warehouse/delivery: ถ้าไม่ระบุ mde_code (หรือส่ง "ALL") = ดูของทุก MDE พร้อมกัน
      const wantsAll = (canViewAll(requester.role) || isDsmReq) && (!mdeCode || mdeCode === "ALL");
      if (!wantsAll && !mdeCode) return Response.json({ error: "ບໍ່ພົບ MDE Code" }, { status: 400 });

      const { results: requestsAll } = await (wantsAll && isDsmReq
        ? env.DB.prepare(
            `SELECT r.*, u.email AS requester_email FROM asset_requests r
             LEFT JOIN users u ON u.id = r.user_id
             WHERE UPPER(TRIM(r.mde_code)) IN (SELECT UPPER(TRIM(mde_code)) FROM mde_list WHERE team = ?) ORDER BY r.id DESC`
          ).bind(requester.team || "")
        : wantsAll
        ? env.DB.prepare(
            `SELECT r.*, u.email AS requester_email FROM asset_requests r
             LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id DESC`
          )
        : env.DB.prepare(
            `SELECT r.*, u.email AS requester_email FROM asset_requests r
             LEFT JOIN users u ON u.id = r.user_id WHERE r.mde_code = ? ORDER BY r.id DESC`
          ).bind(mdeCode)
      ).all();

      // ອະນຸມັດ 2 ຂັ້ນ: ສາງບໍ່ເຫັນຄຳຂໍທີ່ຍັງລໍຖ້າ Admin ກວດສອບ
      const requests = requester.role === "warehouse"
        ? (requestsAll || []).filter((r) => !(r.status === "pending" && !r.admin_checked_at))
        : (requestsAll || []);

      const { results: assets } = await (wantsAll && isDsmReq
        ? env.DB.prepare(`SELECT * FROM assets WHERE ${TEAM_MDE_SQL} ORDER BY id DESC`).bind(requester.team || "")
        : wantsAll
        ? env.DB.prepare("SELECT * FROM assets ORDER BY id DESC")
        : env.DB.prepare("SELECT * FROM assets WHERE mde_code = ? ORDER BY id DESC").bind(mdeCode)
      ).all();

      // ແນບສະຖານະ "ໃບສັນຍາຢືມ" ໃຫ້ແຕ່ລະຄຳຂໍທີ່ອະນຸມັດແລ້ວ (ເຊື່ອມຜ່ານ asset_requests.asset_id)
      //   loan_state: 'none' = ຍັງບໍ່ໄດ້ອອກໃບ | 'draft' = ອອກແລ້ວແຕ່ຍັງບໍ່ທັນເຊັນ | 'completed' = ເຊັນແລ້ວ
      const { results: loanRows } = await (wantsAll && isDsmReq
        ? env.DB.prepare(
            `SELECT id, doc_no, status, asset_id, contract_type, handover_type, doors, door_variant, old_doc_no, move_reason
             FROM loan_contracts WHERE asset_id IN (SELECT id FROM assets WHERE ${TEAM_MDE_SQL}) ORDER BY id DESC`
          ).bind(requester.team || "")
        : wantsAll
        ? env.DB.prepare(
            `SELECT id, doc_no, status, asset_id, contract_type, handover_type, doors, door_variant, old_doc_no, move_reason
             FROM loan_contracts WHERE asset_id IS NOT NULL ORDER BY id DESC`
          )
        : env.DB.prepare(
            `SELECT id, doc_no, status, asset_id, contract_type, handover_type, doors, door_variant, old_doc_no, move_reason
             FROM loan_contracts WHERE asset_id IN (SELECT id FROM assets WHERE mde_code = ?) ORDER BY id DESC`
          ).bind(mdeCode)
      ).all();
      // ຕໍ່ 1 Asset: ຖ້າມີໃບທີ່ເຊັນແລ້ວ ໃຫ້ໃຊ້ໃບນັ້ນ, ບໍ່ດັ່ງນັ້ນໃຊ້ໃບຮ່າງລ່າສຸດ (rows ຮຽງ id DESC ຢູ່ແລ້ວ)
      const loanByAsset = new Map();
      for (const c of (loanRows || [])) {
        const cur = loanByAsset.get(c.asset_id);
        const rk = (x) => (x.status === "completed" ? 2 : (x.status === "awaiting_dsm" ? 1 : 0));
        if (!cur || rk(c) > rk(cur)) loanByAsset.set(c.asset_id, c);
      }
      const assetById = new Map((assets || []).map((a) => [a.id, a]));
      const enrichedRequests = (requests || []).map((r) => {
        if (r.status !== "approved" || !r.asset_id) return r;
        const a = assetById.get(r.asset_id);
        if (!a) return r;
        const c = loanByAsset.get(r.asset_id);
        return {
          ...r,
          tracking_no: a.tracking_no,
          loan_required: (r.doc_type || "") !== RETURN_TO_WAREHOUSE_DOC_TYPE,
          loan_state: c ? contractStateOf(c.status) : "none",
          loan_contract_id: c ? c.id : null,
          loan_doc_no: c ? c.doc_no : null,
          loan_contract_type: c ? c.contract_type : null,
          loan_handover_type: c ? c.handover_type : null,
          loan_doors: c ? c.doors : null,
          loan_door_variant: c ? c.door_variant : null,
          loan_old_doc_no: c ? c.old_doc_no : null,
          loan_move_reason: c ? c.move_reason : null,
          handover_guess: handoverFromDocType(r.doc_type),
        };
      });

      return Response.json({ mde_code: wantsAll ? "ALL" : mdeCode, requests: enrichedRequests, assets: assets || [] });
    }

    // ==========================================================================
    // ອອກໃບສັນຍາຢືມ (loan_contracts) — ຕື່ມຂໍ້ມູນລົງແບບຟອມ PDF ຕົ້ນສະບັບ public/forms/loan.pdf
    // ==========================================================================

    // ຄົ້ນຫາ Asset ດ້ວຍ Tracking No / QR Code ເພື່ອອອກໃບ (ດຶງຂໍ້ມູນຮ້ານ+ຕູ້ ອັດຕະໂນມັດ)
    // ຕູ້ເຄື່ອນຍ້າຍ: ດຶງ "ຊື່ຮ້ານເກົ່າ" ຈາກ Outlet Master Data ຕາມລະຫັດຮ້ານ
    if (url.pathname === "/api/loan-contracts/old-doc-lookup" && request.method === "GET") {
      const oldCode = (url.searchParams.get("outlet") || "").trim().toUpperCase();
      const master = oldCode ? await getOutletMasterByCode(env, oldCode) : null;
      return Response.json({
        old_outlet_code: oldCode || null,
        old_outlet_name: master ? master.name : null,
        outlet_found: !!master,
      });
    }

    if (url.pathname === "/api/loan-contracts/lookup-asset" && request.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return Response.json({ error: "ກະລຸນາປ້ອນ Tracking No ຫຼື QR Code" }, { status: 400 });
      const asset = await env.DB.prepare(
        "SELECT * FROM assets WHERE tracking_no = ? OR qr_code = ? ORDER BY id DESC LIMIT 1"
      ).bind(q, q).first();
      if (!asset) return Response.json({ error: "ບໍ່ພົບ Asset ນີ້ໃນລະບົບ" }, { status: 404 });

      if (!canViewAll(session.role) && asset.mde_code !== session.mde_code) {
        return Response.json({ error: "ບໍ່ມີສິດອອກໃບສັນຍາຢືມ Asset ນີ້" }, { status: 403 });
      }

      const outlet = asset.outlet_code
        ? await env.DB.prepare("SELECT * FROM outlets WHERE code = ?").bind(asset.outlet_code).first()
        : null;
      const mde = await env.DB.prepare("SELECT mde_name, phone FROM mde_list WHERE mde_code = ?").bind(asset.mde_code).first();
      const oldOutlet = asset.old_outlet_code
        ? await env.DB.prepare("SELECT phone FROM outlets WHERE code = ?").bind(asset.old_outlet_code).first()
        : null;

      // ທີ່ຢູ່ Outlet Master Data ເກັບເປັນ "ບ້ານ, ເມືອງ" ຄັ້ນດ້ວຍຈ້ຳ (ຄຳສັ່ງ 25/09/2026)
      let village = "", district = "";
      if (outlet && outlet.address) {
        const parts = String(outlet.address).split(",");
        village = (parts[0] || "").trim();
        district = (parts[1] || "").trim();
      }

      return Response.json({
        asset_id: asset.id,
        tracking_no: asset.tracking_no,
        outlet_code: asset.outlet_code || "",
        outlet_name: (outlet && outlet.name) || asset.outlet_name || "",
        outlet_owner: (outlet && outlet.owner_name) || "",
        outlet_type: (outlet && outlet.outlet_type) || "",
        outlet_grade: (outlet && outlet.outlet_level) || "",
        outlet_phone: (outlet && outlet.phone) || "",
        province: (outlet && outlet.province) || "",
        village, district,
        cooler_brand: asset.cooler_brand || "",
        qr_cd: asset.qr_code || "",
        serial_no: asset.serial_number || "",
        capx: asset.capex || "",
        mde_code: asset.mde_code || "",
        mde_phone: (mde && mde.phone) || "",
        // ເດົາຈາກ doc_type ອັດຕະໂນມັດ — ໜ້າຟອມໃຫ້ແກ້ໄຂໄດ້ກ່ອນອອກໃບ (doc_type "ເກັບຄືນສາງ" = ບໍ່ໃຊ່ການມອບຕູ້ ຈຶ່ງບໍ່ມີຄ່າແນະນຳ)
        handover_type: handoverFromDocType(asset.doc_type) || "",
        old_outlet_code: asset.old_outlet_code || "",
        old_outlet_name: asset.old_outlet_name || "",
        old_outlet_phone: (oldOutlet && oldOutlet.phone) || "",
      });
    }

    // ປະຫວັດໃບສັນຍາຢືມ ຂອງ Asset ອັນໜຶ່ງ (ສະແດງໃນໜ້າ ອອກໃບໃໝ່ / Asset History)
    if (url.pathname === "/api/loan-contracts" && request.method === "GET") {
      const assetId = url.searchParams.get("asset_id");
      const trackingNo = url.searchParams.get("tracking_no");
      if (!assetId && !trackingNo) return Response.json({ error: "ຕ້ອງລະບຸ asset_id ຫຼື tracking_no" }, { status: 400 });

      if (!canViewAll(session.role)) {
        const owned = await env.DB.prepare(
          assetId ? "SELECT 1 AS ok FROM assets WHERE id = ? AND mde_code = ?" : "SELECT 1 AS ok FROM assets WHERE tracking_no = ? AND mde_code = ?"
        ).bind(assetId || trackingNo, session.mde_code).first();
        if (!owned) return Response.json({ error: "ບໍ່ມີສິດເບິ່ງລາຍການນີ້" }, { status: 403 });
      }

      const { results } = await (assetId
        ? env.DB.prepare("SELECT * FROM loan_contracts WHERE asset_id = ? ORDER BY id DESC").bind(assetId)
        : env.DB.prepare("SELECT * FROM loan_contracts WHERE tracking_no = ? ORDER BY id DESC").bind(trackingNo)
      ).all();
      return Response.json(results || []);
    }

    // ປະຫວັດໃບສັນຍາຢືມທີ່ເຄີຍອອກທັງໝົດ (ສະແດງໃນໜ້າ "ອອກໃບສັນຍາຢືມ" ໃຫ້ຄົ້ນຫາ/ເປີດ PDF ຢ້ອນຫລັງໄດ້)
    // mde ເຫັນສະເພາະໃບທີ່ຕົນເອງອອກ (mde_code ຂອງຕົນ), admin/warehouse/delivery ເຫັນທັງໝົດ
    if (url.pathname === "/api/loan-contracts/history" && request.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 300, 500);
      if (session.role === "dsm") {
        const rows = await env.DB.prepare(
          `SELECT id, doc_no, outlet_code, outlet_name, mde_code, cooler_brand, qr_cd, serial_no, contract_type, handover_type, status,
                  created_by, created_at, sig_dsm_name, sig_dsm_at, ${dsmLinkStatusSql('loan', 'loan_contracts')}
           FROM loan_contracts WHERE ${TEAM_MDE_SQL} ORDER BY id DESC LIMIT ?`
        ).bind(session.team || "", limit).all();
        return Response.json(rows.results || []);
      }
      const rows = canViewAll(session.role)
        ? await env.DB.prepare(
            `SELECT id, doc_no, outlet_code, outlet_name, mde_code, cooler_brand, qr_cd, serial_no,
                    contract_type, handover_type, status, created_by, created_at,
                    capx, doors, door_variant, old_doc_no, old_outlet_code, old_outlet_name, move_reason,
                    sales_beer, sales_premium, sales_csd_energy, sales_water_soda,
                    sig_dsm_name, sig_dsm_at, owner_doc_type, (owner_doc_photo IS NOT NULL) AS has_owner_doc, ${dsmLinkStatusSql('loan', 'loan_contracts')}
             FROM loan_contracts ORDER BY id DESC LIMIT ?`
          ).bind(limit).all()
        : await env.DB.prepare(
            `SELECT id, doc_no, outlet_code, outlet_name, mde_code, cooler_brand, qr_cd, serial_no,
                    contract_type, handover_type, status, created_by, created_at,
                    capx, doors, door_variant, old_doc_no, old_outlet_code, old_outlet_name, move_reason,
                    sales_beer, sales_premium, sales_csd_energy, sales_water_soda,
                    sig_dsm_name, sig_dsm_at, owner_doc_type, (owner_doc_photo IS NOT NULL) AS has_owner_doc, ${dsmLinkStatusSql('loan', 'loan_contracts')}
             FROM loan_contracts WHERE UPPER(TRIM(mde_code)) = UPPER(TRIM(?)) ORDER BY id DESC LIMIT ?`
          ).bind(session.mde_code, limit).all();
      return Response.json(rows.results || []);
    }

    // ລຶບໃບສັນຍາຢືມ (admin ເທົ່ານັ້ນ) — ລຶບຮູບລາຍເຊັນອອກຈາກ R2 ນຳ
    if (url.pathname === "/api/loan-contracts" && request.method === "DELETE") {
      if (session.role !== "admin") {
        return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລຶບໃບສັນຍາຢືມໄດ້" }, { status: 403 });
      }
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "ບໍ່ພົບໃບສັນຍາທີ່ຕ້ອງການລຶບ" }, { status: 400 });

      const row = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(id).first();
      if (!row) return Response.json({ error: "ບໍ່ພົບໃບສັນຍານີ້" }, { status: 404 });

      await env.DB.prepare("DELETE FROM loan_contracts WHERE id = ?").bind(id).run();
      await deleteDsmLinks(env, "loan", row.id);
      await deleteR2Photos(env, [row.sig_old_outlet, row.sig_mde, row.sig_dsm, row.sig_admin, row.sig_outlet, row.owner_doc_photo]);
      return Response.json({ message: "ລຶບໃບສັນຍາຢືມຮຽບຮ້ອຍແລ້ວ" });
    }

    // ສ້າງ/ແກ້ໄຂ ໃບສັນຍາຢືມ (draft) — ເອີ້ນຄັ້ງທຳອິດບໍ່ໃສ່ id ເພື່ອສ້າງ, ຄັ້ງຕໍ່ໄປໃສ່ id ເພື່ອຕື່ມລາຍເຊັນ
    if (url.pathname === "/api/loan-contracts" && request.method === "POST") {
      try {
        const body = await request.json();
        const { userId, id } = body;
        const requester = await env.DB.prepare("SELECT role, mde_code, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });
        if (requester.role === "warehouse") return Response.json({ error: "role ສາງ ບໍ່ມີສິດອອກ/ເຊັນໃບສັນຍາຢືມ" }, { status: 403 });

        let row;
        if (!id) {
          // ---- ສ້າງໃໝ່ ----
          const { asset_id, outlet_code: manualOutletCode } = body;

          // ອອກໃບແບບປ້ອນຂໍ້ມູນເອງ (manual) — ບໍ່ມີ Asset ອ້າງອີງ, ດຶງສະເພາະຂໍ້ມູນຮ້ານຈາກ Outlet Master Data
          // (ຄຳສັ່ງ 26/09/2026) — ຄໍລຳຕູ້ແຊ່ (cooler_brand/qr_cd/serial_no/capx) ໃຫ້ຜູ້ອອກໃບພິມເອງ ເພາະບໍ່ມີ Asset ໃຫ້ດຶງ
          if (!asset_id) {
            // ກັນອອກໃບຊ້ຳ (1): request_key ຕໍ່ 1 ຟອມ — ຖ້າບັນທຶກແລ້ວ ສົ່ງໃບເດີມຄືນ ບໍ່ສ້າງໃໝ່ (ກວດກ່ອນຈອງເລກ DOC)
            const requestKey = body.request_key ? String(body.request_key).trim().slice(0, 64) : null;
            const loanDupResponse = (dup) => Response.json({
              message: `ໃບນີ້ຖືກບັນທຶກແລ້ວ (${dup.doc_no || "#" + dup.id}) — ບໍ່ສ້າງຊ້ຳ`,
              contract: dup, duplicate: true, tracking_no: null, self_moved_tracking_no: null, warning: null,
            });
            if (requestKey) {
              const dupByKey = await env.DB.prepare("SELECT * FROM loan_contracts WHERE request_key = ?").bind(requestKey).first();
              if (dupByKey) return loanDupResponse(dupByKey);
            }
            const outletCode = String(manualOutletCode || "").trim().toUpperCase();
            if (!outletCode) return Response.json({ error: "ກະລຸນາເລືອກ Asset ຫຼືເລືອກຮ້ານ (ອອກໃບແບບປ້ອນຂໍ້ມູນເອງ)" }, { status: 400 });

            const outlet = await env.DB.prepare("SELECT * FROM outlets WHERE code = ?").bind(outletCode).first();
            if (!outlet) return Response.json({ error: "ບໍ່ພົບຮ້ານນີ້ໃນ Outlet Master Data" }, { status: 404 });

            // MDE Code: ຄົນທົ່ວໄປອອກໄດ້ສະເພາະໃນນາມຕົນເອງ, admin/warehouse/delivery ລະບຸແທນຄົນອື່ນໄດ້
            const requesterMde = String(requester.mde_code || "").trim().toUpperCase();
            const mdeCode = canViewAll(requester.role) && body.mde_code
              ? String(body.mde_code).trim().toUpperCase()
              : requesterMde;
            if (!mdeCode) return Response.json({ error: "ກະລຸນາລະບຸ MDE Code" }, { status: 400 });
            if (!canViewAll(requester.role) && mdeCode !== requesterMde) {
              return Response.json({ error: "ບໍ່ມີສິດອອກໃບສັນຍາຢືມແທນ MDE ອື່ນ" }, { status: 403 });
            }
            const mde = await env.DB.prepare("SELECT phone, team FROM mde_list WHERE UPPER(mde_code) = UPPER(?)").bind(mdeCode).first();
            // ຊື່ DSM ດຶງອັດຕະໂນມັດຈາກ Team ຂອງ MDE ນີ້ (ບໍ່ໃຫ້ແກ້ໄຂເອງໄດ້) - ໃສ່ໃນຊ່ອງ sig_dsm_name ຂອງໃບສັນຍາ
            const dsmName = await getDsmNameForTeam(env, mde && mde.team);

            let village = "", district = "";
            if (outlet.address) {
              const parts = String(outlet.address).split(",");
              village = (parts[0] || "").trim();
              district = (parts[1] || "").trim();
            }

            // ຮ້ານເກົ່າ (ກໍລະນີຍ້າຍຕູ້) — ຖ້າໃສ່ລະຫັດ ດຶງເບີໂທຈາກ master, ຊື່ໃຫ້ພິມເອງ (ອາດເປັນຮ້ານທີ່ບໍ່ active ແລ້ວ)
            const oldOutletCode = String(body.old_outlet_code || "").trim().toUpperCase() || null;
            const oldOutlet = oldOutletCode ? await getOutletMasterByCode(env, oldOutletCode) : null;
            // ຊື່ຮ້ານເກົ່າ: ເຊື່ອ Master Data ກ່ອນ (ຖ້າບໍ່ພົບລະຫັດ ຈຶ່ງໃຊ້ຄ່າທີ່ສົ່ງມາ)
            const oldOutletNameFinal = (oldOutlet && oldOutlet.name) || body.old_outlet_name || null;
            // ກັນອອກໃບຊ້ຳ (2): ຄົນດຽວກັນ + ຮ້ານ + MDE + ຕູ້ (QR/Serial/CapX) ດຽວກັນ ພາຍໃນ 2 ນາທີ -> ຖືວ່າກົດຊ້ຳ ສົ່ງໃບເດີມຄືນ
            // (ກັນກໍລະນີ client ບໍ່ສົ່ງ request_key ມາ ເຊັ່ນ ໜ້າເວັບເກົ່າທີ່ຍັງ cache ຢູ່)
            {
              const dupRecent = await env.DB.prepare(
                `SELECT * FROM loan_contracts
                  WHERE created_by IS ? AND outlet_code = ? AND UPPER(mde_code) = UPPER(?)
                    AND IFNULL(handover_type,'') = IFNULL(?,'') AND IFNULL(qr_cd,'') = ? AND IFNULL(serial_no,'') = ? AND IFNULL(capx,'') = ?
                    AND created_at >= datetime('now','-120 seconds')
                  ORDER BY id DESC LIMIT 1`
              ).bind(
                requester.email || null, outlet.code, mdeCode, body.handover_type || null,
                body.qr_cd ? String(body.qr_cd).trim() : "", body.serial_no ? String(body.serial_no).trim() : "", body.capx ? String(body.capx).trim() : ""
              ).first();
              if (dupRecent) return loanDupResponse(dupRecent);
            }
            // ເອກະສານເຈົ້າຂອງຮ້ານ: ຕ້ອງແນບກ່ອນ MDE ເຊັນ (ກວດກ່ອນຈອງເລກ DOC/ສ້າງແຖວ ເພື່ອບໍ່ໃຫ້ເກີດໃບຮ່າງຄ້າງ)
            if (body.sig_mde) {
              const ownerDocErr = validateOwnerDocInput(body, null);
              if (ownerDocErr) return Response.json({ error: ownerDocErr }, { status: 400 });
            }
            // ໃບເກົ່າເລກທີ (ຕູ້ເຄື່ອນຍ້າຍ): ສ້າງເລກ DOC- ໃໝ່ຖັດໄປໃນລຳດັບອັດຕະໂນມັດ (ຖ້າບໍ່ໄດ້ສົ່ງເລກມາ)
            let oldDocNoFinal = body.old_doc_no || null;
            if (!oldDocNoFinal && body.handover_type === "move") oldDocNoFinal = await allocateNextDocNo(env);

            // ຖ້າ QR/Serial + ຮ້ານ + MDE ກົງກັບ Asset ທີ່ມີຢູ່ ໃຫ້ເຊື່ອມໃບນີ້ກັບ Asset ນັ້ນ (ເພື່ອບໍ່ໃຫ້ໜ້າປະຫວັດການຂໍ Asset ຍັງເຕືອນວ່າ "ຍັງບໍ່ໄດ້ອອກໃບ")
            const qrTrim = body.qr_cd ? String(body.qr_cd).trim() : "";
            const snTrim = body.serial_no ? String(body.serial_no).trim() : "";
            const linkedAsset = (qrTrim || snTrim)
              ? await env.DB.prepare(
                  `SELECT id, tracking_no FROM assets
                   WHERE UPPER(mde_code) = UPPER(?) AND outlet_code = ?
                     AND ((? != '' AND qr_code = ?) OR (? != '' AND serial_number = ?))
                   ORDER BY id DESC LIMIT 1`
                ).bind(mdeCode, outlet.code, qrTrim, qrTrim, snTrim, snTrim).first()
              : null;

            const ins = await env.DB.prepare(
              `INSERT INTO loan_contracts (
                asset_id, tracking_no, outlet_code, outlet_name, outlet_owner, outlet_type, outlet_grade, outlet_phone,
                village, district, province, contract_type, handover_type, doors, door_variant, cooler_brand, cooler_type, qr_cd, serial_no, capx,
                old_doc_no, old_outlet_code, old_outlet_name, old_outlet_phone, move_reason,
                mde_code, mde_phone, sig_dsm_name, created_by, request_key,
                sales_beer, sales_premium, sales_csd_energy, sales_water_soda
              ) VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?)`
            ).bind(
              (linkedAsset && linkedAsset.id) || null, (linkedAsset && linkedAsset.tracking_no) || null,
              outlet.code, outlet.name || null, outlet.owner_name || null, outlet.outlet_type || null, outlet.outlet_level || null,
              outlet.phone || null, village || null, district || null, outlet.province || null,
              body.contract_type || null, body.handover_type || null, body.doors || null,
              normDoorVariant(body.doors, body.door_variant),
              body.cooler_brand ? String(body.cooler_brand).trim() : null,
              await resolveCoolerTypeFromDoors(env, body.doors, body.door_variant),
              body.qr_cd ? String(body.qr_cd).trim() : null,
              body.serial_no ? String(body.serial_no).trim() : null,
              body.capx ? String(body.capx).trim() : null,
              oldDocNoFinal, oldOutletCode, oldOutletNameFinal, (oldOutlet && oldOutlet.phone) || null,
              body.move_reason || null,
              mdeCode, (mde && mde.phone) || null, dsmName || null, requester.email || null, requestKey,
              parseSalesTotal(body.sales_beer), parseSalesTotal(body.sales_premium), parseSalesTotal(body.sales_csd_energy), parseSalesTotal(body.sales_water_soda)
            ).run().catch(async (dbErr) => {
              // 2 ຄຳຂໍມາພ້ອມກັນ (race) -> UNIQUE request_key ຊ່ວຍກັນ: ໃຊ້ໃບທີ່ຊະນະກ່ອນ
              if (requestKey && /UNIQUE/i.test(String((dbErr && dbErr.message) || dbErr))) return null;
              throw dbErr;
            });
            if (!ins) {
              const winner = await env.DB.prepare("SELECT * FROM loan_contracts WHERE request_key = ?").bind(requestKey).first();
              if (winner) return loanDupResponse(winner);
              return Response.json({ error: "ບໍ່ສາມາດບັນທຶກໃບສັນຍາໄດ້" }, { status: 500 });
            }
            const newId = ins.meta.last_row_id;
            const docNo = `DOC${String(newId).padStart(4, "0")}`;
            await env.DB.prepare("UPDATE loan_contracts SET doc_no = ? WHERE id = ?").bind(docNo, newId).run();
            row = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(newId).first();
            if (body.sig_mde || body.sig_admin || body.sig_outlet || body.sig_old_outlet) {
              row = await applyLoanContractSignatures(env, newId, row, body);
            }

            // ປະເພດ "ຕູ້ເຄື່ອນຍ້າຍ" ແລະ ຍັງບໍ່ມີ Asset ເດີມໃຫ້ເຊື່ອມ -> ສ້າງ Asset Tracking ອັດຕະໂນມັດ
            let assetWarning = null, createdTrackingNo = null, selfMovedTrackingNo = null;
            if (row && row.handover_type === "move" && body.self_moved) {
              // ຕິກ "ຍ້າຍເອງແລ້ວ" -> ບັນທຶກເຂົ້າປະຫວັດການຈັດສົ່ງ (ສຳເລັດ) ພ້ອມໄຮໄລ້ ແທນການສ້າງ Asset ລໍຈັດສົ່ງ
              const rec = await recordSelfMovedAsset(
                env, row, "loan_contracts", RELOCATION_ASSET_DOC_TYPE, requester.email,
                await resolveCoolerTypeFromDoors(env, row.doors, row.door_variant)
              );
              assetWarning = rec.warning;
              selfMovedTrackingNo = rec.trackingNo;
              if (rec.trackingNo) row = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(newId).first();
            } else if (row && row.handover_type === "move" && !row.asset_id) {
              const created = await createRelocationAssetForContract(env, row);
              assetWarning = created.warning;
              if (created.asset) {
                createdTrackingNo = created.asset.tracking_no;
                row = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(newId).first();
              }
            }

            return Response.json({
              message: createdTrackingNo
                ? `ບັນທຶກໃບສັນຍາຢືມຮຽບຮ້ອຍແລ້ວ ແລະ ສ້າງ Asset Tracking ອັດຕະໂນມັດ (Tracking No: ${createdTrackingNo})`
                : selfMovedTrackingNo
                ? `ບັນທຶກໃບສັນຍາຢືມຮຽບຮ້ອຍແລ້ວ ແລະ ບັນທຶກເຂົ້າປະຫວັດການຈັດສົ່ງ (MDE ຍ້າຍເອງ) (Tracking No: ${selfMovedTrackingNo})`
                : "ບັນທຶກໃບສັນຍາຢືມຮຽບຮ້ອຍແລ້ວ",
              contract: row,
              tracking_no: createdTrackingNo,
              self_moved_tracking_no: selfMovedTrackingNo,
              warning: assetWarning,
            });
          }

          const asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(asset_id).first();
          if (!asset) return Response.json({ error: "ບໍ່ພົບ Asset ນີ້ໃນລະບົບ" }, { status: 404 });
          if (!canViewAll(requester.role) && asset.mde_code !== requester.mde_code) {
            return Response.json({ error: "ບໍ່ມີສິດອອກໃບສັນຍາຢືມ Asset ນີ້" }, { status: 403 });
          }
          // ກັນອອກໃບຊ້ຳ: Asset ນີ້ມີໃບສັນຍາຢູ່ແລ້ວ (ຮ່າງ ຫຼື ເຊັນແລ້ວ) -> ບໍ່ສ້າງໃໝ່, ໃຫ້ຜູ້ໃຊ້ໂຫລດໜ້າໃໝ່ ແລ້ວເຊັນໃບເດີມ
          const existingLoan = await env.DB.prepare(
            "SELECT id, status, doc_no FROM loan_contracts WHERE asset_id = ? ORDER BY (status = 'completed') DESC, (status = 'awaiting_dsm') DESC, id DESC LIMIT 1"
          ).bind(asset_id).first();
          if (existingLoan) {
            return Response.json({
              error: existingLoan.status === 'completed'
                ? `Asset ນີ້ອອກໃບສັນຍາຢືມແລ້ວ (${existingLoan.doc_no || '#' + existingLoan.id})`
                : (existingLoan.status === 'awaiting_dsm'
                    ? `Asset ນີ້ມີໃບສັນຍາຢືມ ${existingLoan.doc_no || '#' + existingLoan.id} ທີ່ MDE ເຊັນແລ້ວ ລໍຖ້າ DSM ເຊັນ - ກະລຸນາສົ່ງລິ້ງໃຫ້ DSM`
                    : `Asset ນີ້ມີໃບສັນຍາຢືມ (ຮ່າງ) ${existingLoan.doc_no || '#' + existingLoan.id} ຢູ່ແລ້ວ - ກະລຸນາໂຫລດໜ້າໃໝ່ ແລ້ວກົດ ເຊັນ`),
              contract_id: existingLoan.id,
            }, { status: 409 });
          }
          if (body.sig_mde) {
            const ownerDocErr = validateOwnerDocInput(body, null);
            if (ownerDocErr) return Response.json({ error: ownerDocErr }, { status: 400 });
          }
          row = await createLoanContractDraftForAsset(env, asset_id, requester.email, {
            contract_type: body.contract_type, handover_type: body.handover_type, doors: body.doors, door_variant: body.door_variant,
            old_doc_no: body.old_doc_no, move_reason: body.move_reason,
            sales_beer: body.sales_beer, sales_premium: body.sales_premium,
            sales_csd_energy: body.sales_csd_energy, sales_water_soda: body.sales_water_soda,
          });
          // ຖ້າສົ່ງລາຍເຊັນມາພ້ອມຕອນສ້າງເລີຍ (ອອກໃບຄັ້ງດຽວຄົບ) — ອັບໂຫລດ+ບັນທຶກທັນທີ ບໍ່ຕ້ອງເອີ້ນຄືນ
          if (row && (body.sig_mde || body.sig_admin || body.sig_outlet || body.sig_old_outlet)) {
            row = await applyLoanContractSignatures(env, row.id, row, body);
          }
        } else {
          // ---- ແກ້ໄຂ/ຕື່ມລາຍເຊັນ ----
          row = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(id).first();
          if (!row) return Response.json({ error: "ບໍ່ພົບໃບສັນຍານີ້" }, { status: 404 });
          if (!canViewAll(requester.role) && row.mde_code !== requester.mde_code) {
            return Response.json({ error: "ບໍ່ມີສິດແກ້ໄຂໃບສັນຍານີ້" }, { status: 403 });
          }

          // ເອກະສານເຈົ້າຂອງຮ້ານ: ຖ້າຈະເຊັນ MDE ຕ້ອງມີເອກະສານແນບ (ສົ່ງມາໃໝ່ ຫຼື ແນບໄວ້ແລ້ວ)
          if (body.sig_mde) {
            const ownerDocErr = validateOwnerDocInput(body, row);
            if (ownerDocErr) return Response.json({ error: ownerDocErr }, { status: 400 });
          }
          // ຄໍລຳອື່ນທີ່ອາດແກ້ໄຂກ່ອນເຊັນ (ຖ້າສົ່ງມາ)
          // ຕູ້ເຄື່ອນຍ້າຍ: ຖ້າຍັງບໍ່ມີເລກ DOC- ເກົ່າ ໃຫ້ສ້າງເລກຖັດໄປອັດຕະໂນມັດ (ຄືກັບຕອນສ້າງໃບໃໝ່)
          if (body.handover_type === "move" && !body.old_doc_no && !row.old_doc_no) body.old_doc_no = await allocateNextDocNo(env);
          const sets = [];
          const vals = [];
          const editable = ["contract_type", "handover_type", "doors", "old_doc_no", "move_reason", "old_outlet_code", "old_outlet_name"];
          for (const f of editable) {
            if (body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(body[f] || null); }
          }
          // ຍອດຂາຍລວມແຕ່ລະປະເພດ (ສະເຕັບກອກຍອດຂາຍ ກ່ອນ MDE ເຊັນ) — 0 ເປັນຄ່າຖືກຕ້ອງ ຈຶ່ງບໍ່ໃຊ້ວົງຈອນ editable ຂ້າງເທິງ
          for (const f of LOAN_SALES_FIELDS) {
            if (body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(parseSalesTotal(body[f])); }
          }
          // ຕົວເລືອກເສີມ 1 ປະຕູ — ຖ້າປ່ຽນຂະໜາດຕູ້ອອກຈາກ 1 ປະຕູ ຈະລ້າງຄ່ານີ້ອັດຕະໂນມັດ
          if (body.doors !== undefined || body.door_variant !== undefined) {
            const effDoors = body.doors !== undefined ? body.doors : row.doors;
            const effVariant = body.door_variant !== undefined ? body.door_variant : row.door_variant;
            sets.push("door_variant = ?"); vals.push(normDoorVariant(effDoors, effVariant));
          }
          if (sets.length) {
            vals.push(id);
            await env.DB.prepare(`UPDATE loan_contracts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
            row = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(id).first();
          }

          row = await applyLoanContractSignatures(env, id, row, body);
        }

        return Response.json({ message: "ບັນທຶກໃບສັນຍາຢືມຮຽບຮ້ອຍແລ້ວ", contract: row });
      } catch (e) {
        console.error("/api/loan-contracts", e);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດບັນທຶກໃບສັນຍາໄດ້" }, { status: 500 });
      }
    }

    // ດາວໂຫຼດ/ພິມ PDF ໃບສັນຍາຢືມ ທີ່ຕື່ມຂໍ້ມູນແລ້ວ
    if (url.pathname === "/api/loan-contracts/pdf" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "ບໍ່ພົບເລກໃບ (id)" }, { status: 400 });
      const row = await env.DB.prepare("SELECT * FROM loan_contracts WHERE id = ?").bind(id).first();
      if (!row) return Response.json({ error: "ບໍ່ພົບໃບສັນຍານີ້ໃນລະບົບ (ອາດຖືກລຶບແລ້ວ)" }, { status: 404 });
      if (!canViewAll(session.role) && String(row.mde_code || "").trim().toUpperCase() !== String(session.mde_code || "").trim().toUpperCase()) {
        return Response.json({ error: "ທ່ານບໍ່ມີສິດເປີດ PDF ໃບນີ້ (ບໍ່ແມ່ນໃບຂອງ MDE ທ່ານ)" }, { status: 403 });
      }
      // ຍັງບໍ່ໄດ້ເຊັນຮັບ (ຮ່າງ) - ບໍ່ໃຫ້ເປີດ/ດາວໂຫຼດ PDF ຈົນກວ່າ MDE ຈະເຊັນຮັບກ່ອນ
      if (row.status !== "completed") {
        return Response.json({ error: row.status === "awaiting_dsm"
          ? "ໃບນີ້ລໍຖ້າ DSM ເຊັນ - ກະລຸນາສົ່ງລິ້ງໃຫ້ DSM ເຊັນກ່ອນ ຈຶ່ງຈະເປີດ PDF ໄດ້"
          : "ຍັງບໍ່ໄດ້ເຊັນຮັບໃບສັນຍານີ້ - ກະລຸນາເຊັນຮັບກ່ອນຈຶ່ງຈະເປີດ PDF ໄດ້" }, { status: 400 });
      }
      try {
        const pdfBytes = await buildLoanPdf(env, row, { ownerDocBytes: await ownerDocBytesFor(env, session, row, false) });
        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${row.doc_no || "loan-contract"}.pdf"`,
            "X-Save-Name": encodeURIComponent(contractSaveName(row)),
            "Cache-Control": "no-store",
          },
        });
      } catch (e) {
        console.error("ສ້າງ PDF ໃບສັນຍາຢືມບໍ່ສຳເລັດ:", e);
        return Response.json({ error: "ບໍ່ສາມາດສ້າງ PDF ໄດ້: " + String((e && e.message) || e).slice(0, 160) }, { status: 500 });
      }
    }

    // ຕົວຢ່າງ PDF ໃບສັນຍາຢືມ ກ່ອນບັນທຶກແທ້ (preview) — ໃຊ້ໃນໜ້າສະຫຼຸບຂອງ wizard ຝັ່ງໜ້າ (step 4)
    // ບໍ່ບັນທຶກຫຍັງລົງ DB ຫຼື R2 — ລາຍເຊັນເປັນ base64 (ຈາກ canvas ຝັ່ງ browser) ອ່ານກົງໆເຂົ້າ PDF ຊົ່ວຄາວ
    if (url.pathname === "/api/loan-contracts/pdf-preview" && request.method === "POST") {
      try {
        const body = await request.json();
        const outletCode = String(body.outlet_code || "").trim().toUpperCase();
        if (!outletCode) return Response.json({ error: "ກະລຸນາເລືອກຮ້ານກ່ອນ" }, { status: 400 });

        const outlet = await env.DB.prepare("SELECT * FROM outlets WHERE code = ?").bind(outletCode).first();
        if (!outlet) return Response.json({ error: "ບໍ່ພົບຮ້ານນີ້ໃນ Outlet Master Data" }, { status: 404 });

        const mdeCode = String(body.mde_code || "").trim().toUpperCase();
        const mde = mdeCode
          ? await env.DB.prepare("SELECT phone FROM mde_list WHERE UPPER(mde_code) = UPPER(?)").bind(mdeCode).first()
          : null;

        let village = "", district = "";
        if (outlet.address) {
          const parts = String(outlet.address).split(",");
          village = (parts[0] || "").trim();
          district = (parts[1] || "").trim();
        }

        const oldOutletCode = String(body.old_outlet_code || "").trim().toUpperCase() || null;
        const oldOutlet = oldOutletCode ? await getOutletMasterByCode(env, oldOutletCode) : null;

        const now = new Date().toISOString();
        const row = {
          doc_no: null,
          outlet_code: outlet.code,
          outlet_name: outlet.name || null,
          outlet_owner: outlet.owner_name || null,
          outlet_type: outlet.outlet_type || null,
          outlet_grade: outlet.outlet_level || null,
          outlet_phone: outlet.phone || null,
          village: village || null,
          district: district || null,
          province: outlet.province || null,
          contract_type: body.contract_type || null,
          handover_type: body.handover_type || null,
          doors: body.doors || null,
          door_variant: normDoorVariant(body.doors, body.door_variant),
          cooler_brand: body.cooler_brand ? String(body.cooler_brand).trim() : null,
          qr_cd: body.qr_cd ? String(body.qr_cd).trim() : null,
          serial_no: body.serial_no ? String(body.serial_no).trim() : null,
          capx: body.capx ? String(body.capx).trim() : null,
          old_doc_no: body.old_doc_no || (body.handover_type === "move" ? await peekNextDocNo(env) : null),
          old_outlet_code: oldOutletCode,
          old_outlet_name: (oldOutlet && oldOutlet.name) || body.old_outlet_name || null,
          old_outlet_phone: (oldOutlet && oldOutlet.phone) || null,
          move_reason: body.move_reason || null,
          sales_beer: parseSalesTotal(body.sales_beer),
          sales_premium: parseSalesTotal(body.sales_premium),
          sales_csd_energy: parseSalesTotal(body.sales_csd_energy),
          sales_water_soda: parseSalesTotal(body.sales_water_soda),
          mde_code: mdeCode || null,
          mde_phone: (mde && mde.phone) || null,
          created_at: now,
          sig_mde: body.sig_mde || null, sig_mde_name: body.sig_mde_name || null, sig_mde_at: body.sig_mde ? now : null,
          sig_admin: body.sig_admin || null, sig_admin_name: body.sig_admin_name || null, sig_admin_at: body.sig_admin ? now : null,
          sig_outlet: body.sig_outlet || null, sig_outlet_name: body.sig_outlet_name || null, sig_outlet_at: body.sig_outlet ? now : null,
          sig_old_outlet: body.sig_old_outlet || null, sig_old_outlet_name: body.sig_old_outlet_name || null,
        };

        const pdfBytes = await buildLoanPdf(env, row, { preview: true });
        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="loan-contract-preview.pdf"',
            "Cache-Control": "no-store",
          },
        });
      } catch (e) {
        console.error("ສ້າງ PDF ຕົວຢ່າງບໍ່ສຳເລັດ:", e);
        return Response.json({ error: "ບໍ່ສາມາດສ້າງຕົວຢ່າງ PDF ໄດ້" }, { status: 500 });
      }
    }

    // ==========================================================================
    // ຮັບຕູ້ເຂົ້າສາງ (T-) — cancel_contracts
    // ==========================================================================

    // ===================== ລິ້ງເຊັນ DSM (ຝັ່ງຜູ້ໃຊ້ທີ່ login) =====================
    // ສ້າງ/ສ້າງໃໝ່ ລິ້ງເຊັນ DSM ຂອງໃບສັນຍາຢືມ (kind=loan) ຫຼື ໃບ T- (kind=cancel) — ຄືນ URL ໃຫ້ກັອບ/ແຊຣ໌ໃຫ້ DSM
    // ສິດ: admin/warehouse/delivery ທຸກໃບ, MDE ສະເພາະໃບຂອງຕົນເອງ. ສ້າງໃໝ່ = ລິ້ງເກົ່າໃຊ້ບໍ່ໄດ້. DSM ເຊັນແລ້ວ -> ສ້າງບໍ່ໄດ້ (admin ກົດ ລ້າງລາຍເຊັນ DSM ກ່ອນ)
    if (url.pathname === "/api/dsm-sign-links/create" && request.method === "POST") {
      try {
        const b = await request.json();
        const cfg = DSM_DOC_KINDS[b.kind];
        if (!cfg) return Response.json({ error: "ປະເພດເອກະສານບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        const row = await env.DB.prepare(`SELECT id, doc_no, mde_code, sig_dsm, sig_dsm_name FROM ${cfg.table} WHERE id = ?`).bind(b.id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບເອກະສານນີ້" }, { status: 404 });
        const mine = !!session.mde_code && String(row.mde_code || "").toUpperCase() === String(session.mde_code).toUpperCase();
        if (!canViewAll(session.role) && !mine) return Response.json({ error: "ບໍ່ມີສິດສ້າງລິ້ງຂອງເອກະສານນີ້" }, { status: 403 });
        if (row.sig_dsm) return Response.json({ error: "DSM ເຊັນເອກະສານນີ້ແລ້ວ" }, { status: 409 });

        // ມີລິ້ງເດີມທີ່ຍັງໃຊ້ໄດ້ -> ສະແດງລິ້ງເດີມ (ບໍ່ອອກໃໝ່) ເວັ້ນແຕ່ຜູ້ໃຊ້ກົດ "ສ້າງລິ້ງໃໝ່" (regenerate = true)
        const link = await ensureDsmSignLink(env, b.kind, row.id, session.email || "user", b.regenerate === true);
        const token = link.token;
        let dsmPhone = "";
        try {
          const ph = await env.DB.prepare(
            "SELECT d.phone FROM dsm_list d JOIN mde_list m ON m.team = d.team WHERE m.mde_code = ?"
          ).bind(row.mde_code).first();
          dsmPhone = (ph && ph.phone) || "";
        } catch (e) { /* ບໍ່ມີເບີ DSM - ຜູ້ໃຊ້ແຊຣ໌ເອງ */ }
        return Response.json({
          dsm_phone: dsmPhone,
          url: `${url.origin}/dsm-sign?t=${token}`,
          expires_at: link && link.expires_at,
          reused: !!(link && link.reused),
          doc_no: row.doc_no || "",
          dsm_name: row.sig_dsm_name || "",
          title: cfg.title,
        });
      } catch (e) {
        console.error("/api/dsm-sign-links/create", e);
        return Response.json({ error: "ສ້າງລິ້ງບໍ່ສຳເລັດ (ຖ້າຍັງບໍ່ໄດ້ຮັນ migration_add_dsm_sign_links.sql ແລະ migration_add_link_nonce.sql ກະລຸນາຮັນກ່ອນ)" }, { status: 500 });
      }
    }

    // ລ້າງລາຍເຊັນ DSM (admin ເທົ່ານັ້ນ) — ລຶບຮູບລາຍເຊັນ + ປິດລິ້ງ ເພື່ອໃຫ້ສ້າງລິ້ງໃໝ່ໃຫ້ DSM ເຊັນໃໝ່ໄດ້
    if (url.pathname === "/api/dsm-sign-links/reset" && request.method === "POST") {
      if (session.role !== "admin") return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລ້າງລາຍເຊັນ DSM ໄດ້" }, { status: 403 });
      try {
        const b = await request.json();
        const cfg = DSM_DOC_KINDS[b.kind];
        if (!cfg) return Response.json({ error: "ປະເພດເອກະສານບໍ່ຖືກຕ້ອງ" }, { status: 400 });
        const row = await env.DB.prepare(`SELECT id, sig_dsm FROM ${cfg.table} WHERE id = ?`).bind(b.id).first();
        if (!row) return Response.json({ error: "ບໍ່ພົບເອກະສານນີ້" }, { status: 404 });
        await env.DB.batch([
          env.DB.prepare(`UPDATE ${cfg.table} SET sig_dsm = NULL, sig_dsm_at = NULL,
                 status = CASE WHEN status = 'completed' AND sig_mde IS NOT NULL THEN 'awaiting_dsm' ELSE status END WHERE id = ?`).bind(row.id),
          env.DB.prepare("DELETE FROM dsm_sign_links WHERE kind = ? AND doc_id = ?").bind(b.kind, row.id),
        ]);
        await deleteR2Photos(env, [row.sig_dsm]);
        return Response.json({ message: "ລ້າງລາຍເຊັນ DSM ແລ້ວ — ສ້າງລິ້ງໃໝ່ໄດ້" });
      } catch (e) {
        console.error("/api/dsm-sign-links/reset", e);
        return Response.json({ error: "ລ້າງລາຍເຊັນບໍ່ສຳເລັດ" }, { status: 500 });
      }
    }

    // ປະຫວັດໃບ T- ທັງໝົດ (mde ເຫັນສະເພາະຂອງຕົນ)
    if (url.pathname === "/api/cancel-contracts/history" && request.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 300, 500);
      if (session.role === "dsm") {
        const rows = await env.DB.prepare(
          `SELECT id, doc_no, loan_doc_no, outlet_code, outlet_name, mde_code, cooler_brand, qr_cd, serial_no, reasons, status,
                  created_by, created_at, sig_dsm_name, sig_dsm_at, ${dsmLinkStatusSql('cancel', 'cancel_contracts')}
           FROM cancel_contracts WHERE ${TEAM_MDE_SQL} ORDER BY id DESC LIMIT ?`
        ).bind(session.team || "", limit).all();
        return Response.json(rows.results || []);
      }
      const cols = `id, doc_no, loan_doc_no, outlet_code, outlet_name, mde_code, cooler_brand, qr_cd, serial_no,
                    reasons, status, created_by, created_at, sig_dsm_name, sig_dsm_at, owner_doc_type, (owner_doc_photo IS NOT NULL) AS has_owner_doc, ${dsmLinkStatusSql('cancel', 'cancel_contracts')}`;
      const rows = canViewAll(session.role)
        ? await env.DB.prepare(`SELECT ${cols} FROM cancel_contracts ORDER BY id DESC LIMIT ?`).bind(limit).all()
        : await env.DB.prepare(`SELECT ${cols} FROM cancel_contracts WHERE UPPER(TRIM(mde_code)) = UPPER(TRIM(?)) ORDER BY id DESC LIMIT ?`)
            .bind(session.mde_code || "", limit).all();
      return Response.json(rows.results || []);
    }

    // ດຶງໃບ T- (ໃບເກັບຕູ້ເຂົ້າສາງ) ຂອງ Asset ອັນນຶ່ງ - ໃຊ້ໃນໜ້າ Asset Tracking (doc_type ເກັບຄືນສາງ)
    // mde ເຫັນສະເພາະ Asset ຂອງຕົນ, admin/warehouse/delivery ເຫັນທັງໝົດ (ຄືກັນກັບ GET /api/loan-contracts)
    if (url.pathname === "/api/cancel-contracts" && request.method === "GET") {
      const assetId = url.searchParams.get("asset_id");
      const trackingNo = url.searchParams.get("tracking_no");
      if (!assetId && !trackingNo) return Response.json({ error: "ຕ້ອງລະບຸ asset_id ຫຼື tracking_no" }, { status: 400 });

      if (!canViewAll(session.role)) {
        const owned = await env.DB.prepare(
          assetId ? "SELECT 1 AS ok FROM assets WHERE id = ? AND mde_code = ?" : "SELECT 1 AS ok FROM assets WHERE tracking_no = ? AND mde_code = ?"
        ).bind(assetId || trackingNo, session.mde_code).first();
        if (!owned) return Response.json({ error: "ບໍ່ມີສິດເບິ່ງລາຍການນີ້" }, { status: 403 });
      }

      const cols = "id, doc_no, loan_doc_no, asset_id, tracking_no, outlet_code, outlet_name, mde_code, status, created_at";
      const { results } = await (assetId
        ? env.DB.prepare(`SELECT ${cols} FROM cancel_contracts WHERE asset_id = ? ORDER BY id DESC`).bind(assetId)
        : env.DB.prepare(`SELECT ${cols} FROM cancel_contracts WHERE tracking_no = ? ORDER BY id DESC`).bind(trackingNo)
      ).all();
      return Response.json(results || []);
    }

    // ລຶບໃບ T- (admin ເທົ່ານັ້ນ)
    if (url.pathname === "/api/cancel-contracts" && request.method === "DELETE") {
      if (session.role !== "admin") {
        return Response.json({ error: "ມີສະເພາະ Admin ເທົ່ານັ້ນທີ່ລຶບໃບນີ້ໄດ້" }, { status: 403 });
      }
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "ບໍ່ພົບໃບທີ່ຕ້ອງການລຶບ" }, { status: 400 });
      const row = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(id).first();
      if (!row) return Response.json({ error: "ບໍ່ພົບໃບນີ້" }, { status: 404 });
      await env.DB.prepare("DELETE FROM cancel_contracts WHERE id = ?").bind(id).run();
      await deleteDsmLinks(env, "cancel", row.id);
      await deleteR2Photos(env, [row.sig_mde, row.sig_dsm, row.sig_admin, row.sig_outlet, row.owner_doc_photo]);
      return Response.json({ message: "ລຶບໃບຮັບຕູ້ເຂົ້າສາງ (T-) ຮຽບຮ້ອຍແລ້ວ" });
    }

    // ສ້າງ/ແກ້ໄຂ ໃບ T- — ບໍ່ໃສ່ id = ສ້າງໃໝ່ (ຕ້ອງມີ outlet_code + mde_code), ໃສ່ id = ຕື່ມລາຍເຊັນ/ແກ້ເຫດຜົນ
    if (url.pathname === "/api/cancel-contracts" && request.method === "POST") {
      try {
        const body = await request.json();
        const { userId, id } = body;
        const requester = await env.DB.prepare("SELECT role, mde_code, email FROM users WHERE id = ?").bind(userId).first();
        if (!requester) return Response.json({ error: "ບໍ່ພົບຜູ້ໃຊ້ງານນີ້ໃນລະບົບ" }, { status: 404 });

        let row;
        let assetWarning = null, createdTrackingNo = null, selfMovedTrackingNo = null;
        if (!id) {
          // ກັນອອກໃບຊ້ຳ (1): request_key ຕໍ່ 1 ຟອມ
          const requestKey = body.request_key ? String(body.request_key).trim().slice(0, 64) : null;
          const cancelDupResponse = (dup) => Response.json({
            message: `ໃບນີ້ຖືກບັນທຶກແລ້ວ (${dup.doc_no || "#" + dup.id}) — ບໍ່ສ້າງຊ້ຳ`,
            contract: dup, duplicate: true, tracking_no: null, self_moved_tracking_no: null, warning: null,
          });
          if (requestKey) {
            const dupByKey = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE request_key = ?").bind(requestKey).first();
            if (dupByKey) return cancelDupResponse(dupByKey);
          }
          const ctx = await resolveCancelContext(env, requester, body, canViewAll);
          if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status });
          const { outlet, mde, mdeCode, village, district } = ctx;
          const reasons = normalizeCancelReasons(body.reasons);
          if (!reasons) return Response.json({ error: "ກະລຸນາເລືອກເຫດຜົນຢ່າງໜ້ອຍ 1 ຂໍ້" }, { status: 400 });
          // ເອກະສານເຈົ້າຂອງຮ້ານ: ຕ້ອງແນບກ່ອນ MDE ເຊັນ
          if (body.sig_mde) {
            const ownerDocErr = validateOwnerDocInput(body, null);
            if (ownerDocErr) return Response.json({ error: ownerDocErr }, { status: 400 });
          }
          const dsmName = await getDsmNameForTeam(env, mde && mde.team);

          // ກັນອອກໃບຊ້ຳ (2): ຄົນດຽວກັນ + ຮ້ານ + MDE + ຕູ້ (QR/Serial/CapX) ດຽວກັນ ພາຍໃນ 2 ນາທີ
          {
            const dupRecent = await env.DB.prepare(
              `SELECT * FROM cancel_contracts
                WHERE created_by IS ? AND outlet_code = ? AND UPPER(mde_code) = UPPER(?)
                  AND IFNULL(qr_cd,'') = ? AND IFNULL(serial_no,'') = ? AND IFNULL(capx,'') = ?
                  AND created_at >= datetime('now','-120 seconds')
                ORDER BY id DESC LIMIT 1`
            ).bind(
              requester.email || null, outlet.code, mdeCode,
              cleanCoolerField(body.qr_cd, null) || "", cleanCoolerField(body.serial_no, null) || "", cleanCoolerField(body.capx, null) || ""
            ).first();
            if (dupRecent) return cancelDupResponse(dupRecent);
          }

          const ins = await env.DB.prepare(
            `INSERT INTO cancel_contracts (
              outlet_code, outlet_name, outlet_owner, outlet_type, outlet_grade, outlet_phone,
              village, district, province, reasons, cooler_brand, doors, door_variant, qr_cd, serial_no, capx,
              mde_code, mde_phone, informer_name, sig_dsm_name, created_by, request_key
            ) VALUES (?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?)`
          ).bind(
            outlet.code, outlet.name || null, outlet.owner_name || null,
            outlet.outlet_type || null, outlet.outlet_level || null, outlet.phone || null,
            village || null, district || null, outlet.province || null,
            reasons, cleanCoolerField(body.cooler_brand, null), body.doors || null, normDoorVariant(body.doors, body.door_variant),
            cleanCoolerField(body.qr_cd, null), cleanCoolerField(body.serial_no, null), cleanCoolerField(body.capx, null),
            mdeCode, (mde && mde.phone) || null, (mde && mde.mde_name) || null, dsmName || null,
            requester.email || null, requestKey
          ).run().catch((dbErr) => {
            if (requestKey && /UNIQUE/i.test(String((dbErr && dbErr.message) || dbErr))) return null; // race: ໃບທີ່ຊະນະກ່ອນ
            throw dbErr;
          });
          if (!ins) {
            const winner = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE request_key = ?").bind(requestKey).first();
            if (winner) return cancelDupResponse(winner);
            return Response.json({ error: "ບໍ່ສາມາດບັນທຶກໃບ T- ໄດ້" }, { status: 500 });
          }
          const newId = ins.meta.last_row_id;
          const docNo = `T${String(newId).padStart(4, "0")}`;
          await env.DB.prepare("UPDATE cancel_contracts SET doc_no = ? WHERE id = ?").bind(docNo, newId).run();
          row = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(newId).first();
          if (body.sig_mde || body.sig_admin || body.sig_outlet || body.sig_dsm) {
            row = await applyCancelContractSignatures(env, newId, row, body);
          }
          // ສ້າງ Asset Tracking ("ເກັບຄືນສາງ") ອັດຕະໂນມັດ ຄືກັນກັບໃບ "ຕູ້ເຄື່ອນຍ້າຍ"
          if (body.self_moved) {
            // ຕິກ "ຍ້າຍເອງແລ້ວ" -> ບັນທຶກເຂົ້າປະຫວັດການຈັດສົ່ງ (ສຳເລັດ) ພ້ອມໄຮໄລ້ ແທນການສ້າງ Asset ລໍຈັດສົ່ງ
            const rec = await recordSelfMovedAsset(
              env, row, "cancel_contracts", RETURN_TO_WAREHOUSE_DOC_TYPE, requester.email,
              await resolveCoolerTypeFromDoors(env, row.doors, row.door_variant)
            );
            assetWarning = rec.warning;
            selfMovedTrackingNo = rec.trackingNo;
            if (rec.trackingNo) row = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(newId).first();
          } else {
            const created = await createReturnAssetForCancelContract(env, row);
            assetWarning = created.warning;
            if (created.asset) {
              createdTrackingNo = created.asset.tracking_no || null;
              row = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(newId).first();
            }
          }
        } else {
          row = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(id).first();
          if (!row) return Response.json({ error: "ບໍ່ພົບໃບນີ້" }, { status: 404 });
          if (!canViewAll(requester.role) && String(row.mde_code || "").toUpperCase() !== String(requester.mde_code || "").toUpperCase()) {
            return Response.json({ error: "ບໍ່ມີສິດແກ້ໄຂໃບນີ້" }, { status: 403 });
          }
          if (body.sig_mde) {
            const ownerDocErr = validateOwnerDocInput(body, row);
            if (ownerDocErr) return Response.json({ error: ownerDocErr }, { status: 400 });
          }
          const sets = [];
          const vals = [];
          if (body.reasons !== undefined) {
            const reasons = normalizeCancelReasons(body.reasons);
            if (!reasons) return Response.json({ error: "ກະລຸນາເລືອກເຫດຜົນຢ່າງໜ້ອຍ 1 ຂໍ້" }, { status: 400 });
            sets.push("reasons = ?"); vals.push(reasons);
          }
          if (body.doors !== undefined) {
            sets.push("doors = ?", "door_variant = ?");
            vals.push(body.doors || null, normDoorVariant(body.doors, body.door_variant));
          }
          for (const f of ["qr_cd", "serial_no", "capx"]) {
            if (body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(cleanCoolerField(body[f], null)); }
          }
          if (sets.length) {
            vals.push(id);
            await env.DB.prepare(`UPDATE cancel_contracts SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
            row = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(id).first();
          }
          row = await applyCancelContractSignatures(env, id, row, body);
        }
        return Response.json({
          message: createdTrackingNo
            ? `ບັນທຶກໃບຮັບຕູ້ເຂົ້າສາງ (T-) ຮຽບຮ້ອຍແລ້ວ ແລະ ສ້າງ Asset Tracking ອັດຕະໂນມັດ (Tracking No: ${createdTrackingNo})`
            : selfMovedTrackingNo
            ? `ບັນທຶກໃບຮັບຕູ້ເຂົ້າສາງ (T-) ຮຽບຮ້ອຍແລ້ວ ແລະ ບັນທຶກເຂົ້າປະຫວັດການຈັດສົ່ງ (MDE ຍ້າຍເອງ) (Tracking No: ${selfMovedTrackingNo})`
            : "ບັນທຶກໃບຮັບຕູ້ເຂົ້າສາງ (T-) ຮຽບຮ້ອຍແລ້ວ",
          contract: row,
          tracking_no: createdTrackingNo,
          self_moved_tracking_no: selfMovedTrackingNo,
          warning: assetWarning,
        });
      } catch (e) {
        console.error("/api/cancel-contracts", e);
        return photoErrorResponse(e) || Response.json({ error: "ບໍ່ສາມາດບັນທຶກໃບ T- ໄດ້" }, { status: 500 });
      }
    }

    // ເປີດ/ດາວໂຫຼດ PDF ໃບ T- (ຕ້ອງເຊັນຮັບແລ້ວ ຈຶ່ງຈະເປີດໄດ້ ຄືກັນກັບໃບ DOC-)
    if (url.pathname === "/api/cancel-contracts/pdf" && request.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "ບໍ່ພົບເລກໃບ (id)" }, { status: 400 });
      const row = await env.DB.prepare("SELECT * FROM cancel_contracts WHERE id = ?").bind(id).first();
      if (!row) return Response.json({ error: "ບໍ່ພົບໃບ T- ນີ້ໃນລະບົບ (ອາດຖືກລຶບແລ້ວ)" }, { status: 404 });
      if (!canViewAll(session.role) && String(row.mde_code || "").trim().toUpperCase() !== String(session.mde_code || "").trim().toUpperCase()) {
        return Response.json({ error: "ທ່ານບໍ່ມີສິດເປີດ PDF ໃບນີ້ (ບໍ່ແມ່ນໃບຂອງ MDE ທ່ານ)" }, { status: 403 });
      }
      if (row.status !== "completed") {
        return Response.json({ error: row.status === "awaiting_dsm"
          ? "ໃບນີ້ລໍຖ້າ DSM ເຊັນ - ກະລຸນາສົ່ງລິ້ງໃຫ້ DSM ເຊັນກ່ອນ ຈຶ່ງຈະເປີດ PDF ໄດ້"
          : "ຍັງບໍ່ໄດ້ເຊັນຮັບໃບນີ້ - ກະລຸນາເຊັນຮັບກ່ອນຈຶ່ງຈະເປີດ PDF ໄດ້" }, { status: 400 });
      }
      try {
        const pdfBytes = await buildCancelPdf(env, row, { ownerDocBytes: await ownerDocBytesFor(env, session, row, false) });
        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${row.doc_no || "cancel-contract"}.pdf"`,
            "X-Save-Name": encodeURIComponent(contractSaveName(row)),
            "Cache-Control": "no-store",
          },
        });
      } catch (e) {
        console.error("ສ້າງ PDF ໃບ T- ບໍ່ສຳເລັດ:", e);
        return Response.json({ error: "ບໍ່ສາມາດສ້າງ PDF ໄດ້: " + String((e && e.message) || e).slice(0, 160) }, { status: 500 });
      }
    }

    // ຕົວຢ່າງ PDF ກ່ອນບັນທຶກ (ລາຍເຊັນເປັນ base64) — ບໍ່ບັນທຶກລົງ DB/R2
    if (url.pathname === "/api/cancel-contracts/pdf-preview" && request.method === "POST") {
      try {
        const body = await request.json();
        const ctx = await resolveCancelContext(env, session, body, canViewAll);
        if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status });
        const { outlet, mde, mdeCode, village, district } = ctx;
        const now = new Date().toISOString();
        const row = {
          doc_no: null, loan_doc_no: null,
          outlet_code: outlet.code, outlet_name: outlet.name || null, outlet_owner: outlet.owner_name || null,
          outlet_type: outlet.outlet_type || null, outlet_grade: outlet.outlet_level || null, outlet_phone: outlet.phone || null,
          village: village || null, district: district || null, province: outlet.province || null,
          reasons: normalizeCancelReasons(body.reasons),
          cooler_brand: cleanCoolerField(body.cooler_brand, null), doors: body.doors || null, door_variant: normDoorVariant(body.doors, body.door_variant),
          qr_cd: cleanCoolerField(body.qr_cd, null), serial_no: cleanCoolerField(body.serial_no, null), capx: cleanCoolerField(body.capx, null),
          mde_code: mdeCode, mde_phone: (mde && mde.phone) || null,
          informer_name: (mde && mde.mde_name) || null,
          created_at: now,
          sig_mde: body.sig_mde || null, sig_mde_name: body.sig_mde_name || null, sig_mde_at: body.sig_mde ? now : null,
          sig_dsm: body.sig_dsm || null, sig_dsm_name: body.sig_dsm_name || null,
          sig_admin: body.sig_admin || null, sig_admin_name: body.sig_admin_name || null,
          sig_outlet: body.sig_outlet || null, sig_outlet_name: body.sig_outlet_name || null,
        };
        const pdfBytes = await buildCancelPdf(env, row, { preview: true });
        return new Response(pdfBytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="cancel-contract-preview.pdf"',
            "Cache-Control": "no-store",
          },
        });
      } catch (e) {
        console.error("ສ້າງ PDF ຕົວຢ່າງໃບ T- ບໍ່ສຳເລັດ:", e);
        return Response.json({ error: "ບໍ່ສາມາດສ້າງຕົວຢ່າງ PDF ໄດ້" }, { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // Cron Trigger (ຕັ້ງເວລາໄວ້ໃນ wrangler.toml ຊ່ອງ [triggers] crons)
  // ຮັນອັດຕະໂນມັດທຸກເຊົ້າ ເພື່ອກວດ ແລະ ສົ່ງສະຫຼຸບແຈ້ງເຕືອນຫາ admin/warehouse
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutomatedNotificationChecks(env));
  }
};