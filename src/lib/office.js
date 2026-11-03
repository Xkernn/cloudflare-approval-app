// ໜ້າ Office (ອ່ານຢ່າງດຽວ) — ສະຫຼຸບແຕ່ລະຝ່າຍ + ສິ່ງໃໝ່ 24 ຊົ່ວໂມງ. ບໍ່ມີການຂຽນ DB ແລະ ບໍ່ໃຊ້ AI.
const WAITING = ["ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ", "ລໍຖ້າທີມງານເກັບຕູ້ຮ້ານເກົ່າ"];
const ON_TRUCK = "ຢູ່ເທິງລົດ / ກຳລັງສົ່ງ";
const DONE = "ສຳເລັດ";
// ຄ່າສະຖານະ Asset ທີ່ຕ້ອງຕາມງານ — ຕ້ອງຕົງກັບ NOTIFY_PENDING_STATUSES ໃນ src/index.js
const PENDING_DOC = "ຍັງບໍ່ທັນເຊັນເອກະສານ";
const PENDING_POWERAPP = "ຍັງບໍ່ຊັບມິດ PowerApp";

const all = (env, sql, ...b) => env.DB.prepare(sql).bind(...b).all().then((r) => r.results || []);
const one = async (env, sql, ...b) => (await all(env, sql, ...b))[0] || {};
const n = (v) => Number(v) || 0;
const T = (id, title) => ({ id, title, attention: 0, new24: 0, stats: [], items: [] });

async function safe(id, title, fn) {
  const room = T(id, title);
  try { await fn(room); } catch (e) { console.error("office:" + id, e); room.error = true; }
  return room;
}

async function buildOverview(env) {
  const all11 = await Promise.all([
    safe("requests", "ຄຳຂໍເບີກຕູ້", async (r) => {
      const c = await one(env, `SELECT SUM(status='pending') p, SUM(requested_at >= datetime('now','-1 day')) d FROM asset_requests`);
      r.attention = n(c.p); r.new24 = n(c.d);
      r.stats = [{ label: "ລໍຖ້າອະນຸມັດ", value: n(c.p) }];
      const rows = await all(env, `SELECT outlet_name, outlet_code, doc_type, status, requested_at at FROM asset_requests ORDER BY id DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: x.outlet_name || x.outlet_code || "-", sub: `${x.doc_type || ""} · ${x.status}`, at: x.at, state: x.status === "pending" ? "pending" : "completed" }));
    }),
    safe("contracts", "ໃບສັນຍາຢືມ", async (r) => {
      const c = await one(env, `SELECT SUM(status='draft') a, SUM(status='awaiting_dsm') b, SUM(created_at >= datetime('now','-1 day')) d FROM loan_contracts`);
      r.attention = n(c.a) + n(c.b); r.new24 = n(c.d);
      r.stats = [{ label: "MDE ຍັງບໍ່ເຊັນ", value: n(c.a) }, { label: "ລໍຖ້າ DSM", value: n(c.b) }];
      const rows = await all(env, `SELECT doc_no, outlet_name, status, created_at at FROM loan_contracts ORDER BY id DESC LIMIT 6`);
      const L = { draft: "MDE ຍັງບໍ່ເຊັນ", awaiting_dsm: "ລໍຖ້າ DSM", completed: "ເຊັນຄົບ" };
      const S = { draft: "pending", awaiting_dsm: "working", completed: "completed" };
      r.items = rows.map((x) => ({ text: `${x.doc_no || "-"} ${x.outlet_name || ""}`, sub: L[x.status] || x.status, at: x.at, state: S[x.status] || "working" }));
    }),
    safe("delivery", "ຈັດສົ່ງຕູ້", async (r) => {
      const ph = WAITING.map(() => "?").join(",");
      const c = await one(env, `SELECT SUM(status IN (${ph})) w, SUM(status = ?) t, SUM(status = ? AND delivered_at >= datetime('now','-1 day')) d FROM assets`, ...WAITING, ON_TRUCK, DONE);
      r.attention = n(c.w) + n(c.t); r.new24 = n(c.d);
      r.stats = [{ label: "ລໍຖ້າຂົນສົ່ງ", value: n(c.w) }, { label: "ຢູ່ເທິງລົດ", value: n(c.t) }, { label: "ສົ່ງສຳເລັດ 24 ຊມ", value: n(c.d) }];
      const rows = await all(env, `SELECT tracking_no, outlet_name, status, last_update at FROM assets ORDER BY last_update DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: `${x.tracking_no} ${x.outlet_name || ""}`, sub: x.status, at: x.at, state: WAITING.includes(x.status) ? "pending" : x.status === DONE ? "completed" : "working" }));
    }),
    safe("stock", "ສະຕັອກສາງ", async (r) => {
      const c = await one(env, `SELECT SUM(status='in_warehouse') a, SUM(status='reserved') b, SUM(updated_at >= datetime('now','-1 day')) d FROM warehouse_stock`);
      r.attention = n(c.b); r.new24 = n(c.d);
      r.stats = [{ label: "ຢູ່ໃນສາງ", value: n(c.a) }, { label: "ຈອງແລ້ວ", value: n(c.b) }];
      const rows = await all(env, `SELECT cooler_brand, cooler_type, serial_number, status, updated_at at FROM warehouse_stock ORDER BY updated_at DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: `${x.cooler_brand} ${x.cooler_type}`, sub: `${x.serial_number || "-"} · ${x.status}`, at: x.at }));
    }),
    safe("newcoolers", "ຕູ້ແຊ່ເຂົ້າໃໝ່", async (r) => {
      const c = await one(env, `SELECT SUM(status='pending') p, SUM(status='confirmed') f, SUM(status='received' AND received_at >= datetime('now','-1 day')) d FROM new_coolers`);
      r.attention = n(c.f); r.new24 = n(c.d);
      r.stats = [{ label: "ຍັງບໍ່ສະແກນ", value: n(c.p) }, { label: "ລໍຖ້າຮັບເຂົ້າສາງ", value: n(c.f) }, { label: "ຮັບເຂົ້າ 24 ຊມ", value: n(c.d) }];
      const rows = await all(env, `SELECT cooler_brand, serial_number, status, COALESCE(received_at, confirmed_at, created_at) at FROM new_coolers ORDER BY id DESC LIMIT 6`);
      const L = { pending: "ຍັງບໍ່ສະແກນ", confirmed: "ລໍຖ້າຮັບເຂົ້າສາງ", received: "ຮັບເຂົ້າສາງແລ້ວ", shipped_out: "ສົ່ງຕ່າງແຂວງ" };
      r.items = rows.map((x) => ({ text: `${x.cooler_brand || ""} ${x.serial_number || "-"}`, sub: L[x.status] || x.status, at: x.at }));
    }),
    safe("trips", "ຖ້ຽວລົດຕ່າງແຂວງ", async (r) => {
      const c = await one(env, `SELECT SUM(status='open') o, SUM(status='departed' AND departed_at >= datetime('now','-1 day')) d FROM ship_trips`);
      r.attention = n(c.o); r.new24 = n(c.d);
      r.stats = [{ label: "ກຳລັງຈັດຂຶ້ນລົດ", value: n(c.o) }, { label: "ລົດອອກ 24 ຊມ", value: n(c.d) }];
      const rows = await all(env, `SELECT trip_no, truck_plate, status, COALESCE(departed_at, created_at) at FROM ship_trips ORDER BY id DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: x.trip_no, sub: `${x.truck_plate || "-"} · ${x.status === "open" ? "ກຳລັງຈັດ" : "ລົດອອກແລ້ວ"}`, at: x.at }));
    }),
    safe("checks", "ກວດນັບ · ສະສາງ · ຕູ້ຫາຍ", async (r) => {
      const a = await one(env, `SELECT COUNT(*) c FROM stock_counts WHERE status='open'`);
      const w = await one(env, `SELECT SUM(status='pending') p, SUM(created_at >= datetime('now','-1 day')) d FROM cooler_writeoffs`);
      const l = await one(env, `SELECT SUM(status IN ('suspected','verifying')) p, SUM(created_at >= datetime('now','-1 day')) d FROM lost_coolers`);
      r.attention = n(w.p) + n(l.p); r.new24 = n(w.d) + n(l.d);
      r.stats = [{ label: "ຮອບນັບທີ່ເປີດ", value: n(a.c) }, { label: "ລໍຖ້າຢືນຢັນສະສາງ", value: n(w.p) }, { label: "ຕູ້ສົງໄສ/ກຳລັງກວດ", value: n(l.p) }];
      const rows = await all(env, `SELECT cooler_brand, cooler_type, serial_number, status, created_at at FROM cooler_writeoffs ORDER BY id DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: `ສະສາງ ${x.cooler_brand || ""} ${x.serial_number || "-"}`, sub: x.status === "pending" ? "ລໍຖ້າຢືນຢັນ" : "ຢືນຢັນແລ້ວ", at: x.at }));
    }),
    // ---- ຫ້ອງເພີ່ມສຳລັບ 3D (Asset Tracking · Admin · Budget · Announcements) ----
    safe("assets", "ຕິດຕາມ Asset", async (r) => {
      const c = await one(env, `SELECT COUNT(*) t, SUM(status = ?) a, SUM(status = ?) b, SUM(IFNULL(flagged, 0) = 1) f, SUM(last_update >= datetime('now','-1 day')) d FROM assets`, PENDING_DOC, PENDING_POWERAPP);
      r.attention = n(c.a) + n(c.b); r.new24 = n(c.d);
      r.stats = [{ label: "Asset ທັງໝົດ", value: n(c.t) }, { label: "ຍັງບໍ່ເຊັນເອກະສານ", value: n(c.a) }, { label: "ຍັງບໍ່ຊັບມິດ PowerApp", value: n(c.b) }, { label: "ຕິດທຸງ", value: n(c.f) }];
      const rows = await all(env, `SELECT tracking_no, outlet_name, status, last_update at FROM assets ORDER BY last_update DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: `${x.tracking_no} ${x.outlet_name || ""}`, sub: x.status, at: x.at, state: x.status === PENDING_DOC || x.status === PENDING_POWERAPP ? "pending" : x.status === DONE ? "completed" : "working" }));
    }),
    safe("admin", "Admin", async (r) => {
      const u = await one(env, `SELECT COUNT(*) t, SUM(status = 'pending') p, SUM(created_at >= datetime('now','-1 day')) d FROM users`);
      const w = await one(env, `SELECT SUM(status = 'pending') p, SUM(requested_at >= datetime('now','-1 day')) d FROM password_reset_requests`);
      r.attention = n(u.p) + n(w.p); r.new24 = n(u.d) + n(w.d);
      r.stats = [{ label: "ຜູ້ໃຊ້ລໍຖ້າອະນຸມັດ", value: n(u.p) }, { label: "ຂໍ Reset ລະຫັດລໍຖ້າ", value: n(w.p) }, { label: "ຜູ້ໃຊ້ທັງໝົດ", value: n(u.t) }];
      // ບໍ່ສົ່ງ email — ສະແດງ MDE Code / Team ເທົ່ານັ້ນ
      const rows = await all(env, `SELECT team, mde_code, status, created_at at FROM users ORDER BY id DESC LIMIT 6`);
      const L = { pending: "ລໍຖ້າອະນຸມັດ", approved: "ອະນຸມັດແລ້ວ" };
      r.items = rows.map((x) => ({ text: x.mde_code || x.team || "-", sub: `${x.team || "-"} · ${L[x.status] || x.status}`, at: x.at, state: x.status === "pending" ? "pending" : x.status === "approved" ? "completed" : "working" }));
    }),
    safe("budget", "ງົບປະມານ", async (r) => {
      // ງົບ = ໂຄຕ້າຕູ້ຕໍ່ທີມ/Brand/Type (ບໍ່ແມ່ນເງິນ ₭) — ນັບ 'ເບີກແລ້ວ' ດ້ວຍສູດດຽວກັບ computeStockBudgetAlerts (ຄຳຂໍ 'ໃໝ່' ທີ່ອະນຸມັດແລ້ວ ນັບແຕ່ period_start)
      // ອ່ານ asset_requests ຮອບດຽວແລ້ວນັບໃນ JS — ບໍ່ໃຊ້ correlated subquery ຕໍ່ແຖວງົບ ເພື່ອບໍ່ໃຫ້ D1 rows read ເພີ່ມ
      const lines = await all(env, `SELECT team, IFNULL(cooler_brand,'') b, IFNULL(cooler_type,'') t, quota, period_start ps FROM budgets WHERE archived_at IS NULL`);
      let total = 0, used = 0, full = 0;
      if (lines.length) {
        const noStart = lines.some((l) => !l.ps);
        const minPs = noStart ? null : lines.reduce((m, l) => (!m || l.ps < m ? l.ps : m), null);
        const reqs = await all(env, `SELECT IFNULL(team,'') team, IFNULL(cooler_brand,'') b, IFNULL(cooler_type,'') t, requested_at at FROM asset_requests WHERE status = 'approved' AND IFNULL(asset_condition,'new') = 'new'${minPs ? " AND requested_at >= ?" : ""}`, ...(minPs ? [minPs] : []));
        const by = new Map();
        for (const q of reqs) { const k = `${q.team}\u0001${q.b}\u0001${q.t}`; (by.get(k) || by.set(k, []).get(k)).push(q.at); }
        for (const l of lines) {
          const got = (by.get(`${l.team}\u0001${l.b}\u0001${l.t}`) || []).filter((at) => !l.ps || at >= l.ps).length;
          total += n(l.quota); used += got;
          if (n(l.quota) > 0 && got >= n(l.quota)) full++;
        }
      }
      const t = await one(env, `SELECT SUM(created_at >= datetime('now','-1 day')) d FROM budget_transfers`);
      r.attention = full; r.new24 = n(t.d);
      r.stats = [{ label: "ໂຄຕ້າລວມ", value: total }, { label: "ເບີກແລ້ວ", value: used }, { label: "ຄົງເຫຼືອ", value: Math.max(total - used, 0) }, { label: "ລາຍການງົບທີ່ເຕັມແລ້ວ", value: full }];
      const rows = await all(env, `SELECT from_team, to_team, cooler_brand, cooler_type, quantity, created_at at FROM budget_transfers ORDER BY id DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: `${x.from_team} → ${x.to_team}`, sub: `${x.cooler_brand || ""} ${x.cooler_type || ""} × ${x.quantity}`.trim(), at: x.at, state: "completed" }));
    }),
    safe("announce", "ປະກາດ", async (r) => {
      const live = `is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`;
      const a = await one(env, `SELECT SUM(${live}) a, SUM(is_pinned = 1 AND ${live}) p, SUM(created_at >= datetime('now','-1 day')) d FROM announcements`);
      const rd = await one(env, `SELECT COUNT(*) c FROM announcement_reads WHERE read_at >= datetime('now','-1 day')`);
      r.attention = 0; r.new24 = n(a.d);
      r.stats = [{ label: "ປະກາດທີ່ເປີດຢູ່", value: n(a.a) }, { label: "ປັກໝຸດ", value: n(a.p) }, { label: "ອ່ານ 24 ຊມ", value: n(rd.c) }];
      const rows = await all(env, `SELECT title, is_pinned, (${live}) live, (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = announcements.id) rc, created_at at FROM announcements ORDER BY id DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: x.title, sub: `${x.is_pinned ? "ປັກໝຸດ · " : ""}${x.live ? "ເປີດຢູ່" : "ປິດ/ໝົດອາຍຸ"} · ອ່ານ ${n(x.rc)}`, at: x.at, state: x.live ? "working" : "completed" }));
    }),
  ]);

  // status ສຳລັບ 3D: ມີຂອງໃໝ່ 24 ຊມ = working · ມີງານຄ້າງແຕ່ບໍ່ມີຄວາມເຄື່ອນໄຫວ = pending · ບໍ່ມີທັງສອງ = available
  for (const r of all11) r.status = r.error ? "pending" : r.new24 > 0 ? "working" : r.attention > 0 ? "pending" : "available";
  const byId = Object.fromEntries(all11.map((r) => [r.id, r]));
  // office.html ໃຊ້ rooms ເດີມ 7 ຫ້ອງ (ບໍ່ປ່ຽນ) · rooms3d = 7 ຫ້ອງຂອງສາກ 3D ໃຊ້ id ຕາມ virtual-office/data.js
  const rooms = OFFICE_ROOMS.map((id) => byId[id]);
  const rooms3d = Object.entries(ROOMS_3D).map(([id, key]) => ({ ...byId[key], id }));
  return { generated_at: new Date().toISOString(), rooms, rooms3d };
}

const OFFICE_ROOMS = ["requests", "contracts", "delivery", "stock", "newcoolers", "trips", "checks"];
const ROOMS_3D = { asset_request: "requests", contract: "contracts", delivery: "delivery", asset_tracking: "assets", budget: "budget", announce: "announce", admin: "admin" };

// cache ໃນ isolate 60 ວິ — ກັນ D1 rows read ເພີ່ມເມື່ອຫຼາຍໜ້າ/ຫຼາຍແທັບ poll ພ້ອມກັນ (ເກັບສະເພາະຜົນຮວມຂອງ admin, ບໍ່ມີຂໍ້ມູນສ່ວນຕົວ)
const TTL_MS = 60000;
let cached = { at: 0, data: null };
export async function officeOverview(env) {
  const now = Date.now();
  if (cached.data && now - cached.at < TTL_MS) return cached.data;
  const data = await buildOverview(env);
  cached = { at: Date.now(), data };
  return data;
}
