// ໜ້າ Office (ອ່ານຢ່າງດຽວ) — ສະຫຼຸບແຕ່ລະຝ່າຍ + ສິ່ງໃໝ່ 24 ຊົ່ວໂມງ. ບໍ່ມີການຂຽນ DB ແລະ ບໍ່ໃຊ້ AI.
const WAITING = ["ລໍຖ້າຂົນສົ່ງອອກຈາກສາງ", "ລໍຖ້າທີມງານເກັບຕູ້ຮ້ານເກົ່າ"];
const ON_TRUCK = "ຢູ່ເທິງລົດ / ກຳລັງສົ່ງ";
const DONE = "ສຳເລັດ";

const all = (env, sql, ...b) => env.DB.prepare(sql).bind(...b).all().then((r) => r.results || []);
const one = async (env, sql, ...b) => (await all(env, sql, ...b))[0] || {};
const n = (v) => Number(v) || 0;
const T = (id, title) => ({ id, title, attention: 0, new24: 0, stats: [], items: [] });

async function safe(id, title, fn) {
  const room = T(id, title);
  try { await fn(room); } catch (e) { console.error("office:" + id, e); room.error = true; }
  return room;
}

export async function officeOverview(env) {
  const rooms = await Promise.all([
    safe("requests", "ຄຳຂໍເບີກຕູ້", async (r) => {
      const c = await one(env, `SELECT SUM(status='pending') p, SUM(requested_at >= datetime('now','-1 day')) d FROM asset_requests`);
      r.attention = n(c.p); r.new24 = n(c.d);
      r.stats = [{ label: "ລໍຖ້າອະນຸມັດ", value: n(c.p) }];
      const rows = await all(env, `SELECT outlet_name, outlet_code, doc_type, status, requested_at at FROM asset_requests ORDER BY id DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: x.outlet_name || x.outlet_code || "-", sub: `${x.doc_type || ""} · ${x.status}`, at: x.at }));
    }),
    safe("contracts", "ໃບສັນຍາຢືມ", async (r) => {
      const c = await one(env, `SELECT SUM(status='draft') a, SUM(status='awaiting_dsm') b, SUM(created_at >= datetime('now','-1 day')) d FROM loan_contracts`);
      r.attention = n(c.a) + n(c.b); r.new24 = n(c.d);
      r.stats = [{ label: "MDE ຍັງບໍ່ເຊັນ", value: n(c.a) }, { label: "ລໍຖ້າ DSM", value: n(c.b) }];
      const rows = await all(env, `SELECT doc_no, outlet_name, status, created_at at FROM loan_contracts ORDER BY id DESC LIMIT 6`);
      const L = { draft: "MDE ຍັງບໍ່ເຊັນ", awaiting_dsm: "ລໍຖ້າ DSM", completed: "ເຊັນຄົບ" };
      r.items = rows.map((x) => ({ text: `${x.doc_no || "-"} ${x.outlet_name || ""}`, sub: L[x.status] || x.status, at: x.at }));
    }),
    safe("delivery", "ຈັດສົ່ງຕູ້", async (r) => {
      const ph = WAITING.map(() => "?").join(",");
      const c = await one(env, `SELECT SUM(status IN (${ph})) w, SUM(status = ?) t, SUM(status = ? AND delivered_at >= datetime('now','-1 day')) d FROM assets`, ...WAITING, ON_TRUCK, DONE);
      r.attention = n(c.w) + n(c.t); r.new24 = n(c.d);
      r.stats = [{ label: "ລໍຖ້າຂົນສົ່ງ", value: n(c.w) }, { label: "ຢູ່ເທິງລົດ", value: n(c.t) }, { label: "ສົ່ງສຳເລັດ 24 ຊມ", value: n(c.d) }];
      const rows = await all(env, `SELECT tracking_no, outlet_name, status, last_update at FROM assets ORDER BY last_update DESC LIMIT 6`);
      r.items = rows.map((x) => ({ text: `${x.tracking_no} ${x.outlet_name || ""}`, sub: x.status, at: x.at }));
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
  ]);
  return { generated_at: new Date().toISOString(), rooms };
}
