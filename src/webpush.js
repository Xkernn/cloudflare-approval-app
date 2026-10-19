// ==========================================================================
// Web Push (ການແຈ້ງເຕືອນ Push Notification) - เขียนขึ้นเองด้วย Web Crypto API
// เพราะ Cloudflare Workers ไม่รองรับ npm package "web-push" (ใช้ Node net/tls)
// อ้างอิงมาตรฐาน:
//   - RFC 8291 (Message Encryption for Web Push, aes128gcm)
//   - RFC 8292 (VAPID)
// ==========================================================================

// ---------- Base64URL helpers ----------
function base64UrlToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64Url(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(str) {
  return uint8ArrayToBase64Url(new TextEncoder().encode(str));
}

function concatUint8Arrays(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ---------- HMAC / HKDF (RFC 5869, single-block expand since L <= 32) ----------
async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(sig);
}

async function hkdfExpand(prk, info, length) {
  const block = await hmacSha256(prk, concatUint8Arrays(info, new Uint8Array([0x01])));
  return block.slice(0, length);
}

function base64UrlNormalize(str) {
  return (str || "").trim().replace(/=+$/, "");
}

// ---------- VAPID (สร้าง JWT เซ็นด้วย ES256) ----------
async function importVapidPrivateKey(env) {
  if (!env.VAPID_PRIVATE_KEY_JWK) {
    throw new Error(
      "ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ VAPID_PRIVATE_KEY_JWK (Secret) ຢູ່ Worker - ກະລຸນາຮັນ: npx wrangler secret put VAPID_PRIVATE_KEY_JWK"
    );
  }
  let jwk;
  try {
    jwk = JSON.parse(env.VAPID_PRIVATE_KEY_JWK);
  } catch (e) {
    throw new Error(
      "VAPID_PRIVATE_KEY_JWK ຮູບແບບ JSON ບໍ່ຖືກຕ້ອງ - ກະລຸນາວາງຄ່າຈາກ generate-vapid-keys.js ໃຫ້ຄົບ (ແຖວດຽວ, ບໍ່ຕັດຄຳ)"
    );
  }

  // ກວດວ່າ VAPID_PUBLIC_KEY (wrangler.toml) ເປັນຄູ່ດຽວກັນກັບ Private Key ນີ້ຫຼືບໍ່
  // JWK ຂອງ EC private key ຈະມີ x,y (ພິກັດ public key) ຕິດມານຳສະເໝີ ດັ່ງນັ້ນຄຳນວນ public key ທີ່ຖືກຕ້ອງໄດ້ໂດຍກົງ
  // -- ນີ້ແມ່ນສາເຫດອັນດັບໜຶ່ງຂອງ error "BadJwtToken" ຈາກ Push Service (Mozilla/Chrome): Public/Private Key ບໍ່ແມ່ນຄູ່ດຽວກັນ
  if (jwk.x && jwk.y) {
    let derivedPublicKey = null;
    try {
      derivedPublicKey = uint8ArrayToBase64Url(
        concatUint8Arrays(new Uint8Array([0x04]), base64UrlToUint8Array(jwk.x), base64UrlToUint8Array(jwk.y))
      );
    } catch (_) {
      derivedPublicKey = null; // jwk.x/y ຜິດປົກກະຕິ - ປ່ອຍໃຫ້ importKey ດ້ານລຸ່ມຈັດການ error ເອງ
    }
    const configuredPublicKey = base64UrlNormalize(env.VAPID_PUBLIC_KEY);
    if (derivedPublicKey && configuredPublicKey && derivedPublicKey !== configuredPublicKey) {
      throw new Error(
        `VAPID_PUBLIC_KEY (wrangler.toml) ບໍ່ຕົງກັບ VAPID_PRIVATE_KEY_JWK (Secret)! ຄ່າ Public Key ທີ່ຖືກຕ້ອງຄູ່ກັບ Private Key ປັດຈຸບັນຄື: ${derivedPublicKey} ` +
        `- ກະລຸນາເອົາໄປແທນທີ່ VAPID_PUBLIC_KEY ໃນ wrangler.toml ແລ້ວ deploy ໃໝ່, ຈາກນັ້ນໃຫ້ຜູ້ໃຊ້ທຸກຄົນກົດ "ປິດ" ແລ້ວ "ເປີດ" ການແຈ້ງເຕືອນຄືນໃໝ່ (subscription ເກົ່າຜູກກັບ Public Key ເກົ່າ ໃຊ້ຕໍ່ບໍ່ໄດ້)`
      );
    }
  }

  try {
    return await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  } catch (e) {
    throw new Error(
      "VAPID_PRIVATE_KEY_JWK ບໍ່ຖືກຕ້ອງ (import key ລົ້ມເຫລວ) - ກະລຸນາສ້າງຄີย໌ຄູ່ໃໝ່ດ້ວຍ generate-vapid-keys.js ແລ້ວອັບເດດທັງ Public/Private ພ້ອມກັນ"
    );
  }
}

async function buildVapidAuthHeader(env, endpoint) {
  const origin = new URL(endpoint).origin;
  const privateKey = await importVapidPrivateKey(env);
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 ชั่วโมง
    sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
  };
  const unsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${uint8ArrayToBase64Url(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

// ---------- RFC 8291: เข้ารหัส payload แบบ aes128gcm ----------
async function encryptPayload(subscription, payloadBytes) {
  const uaPublicBytes = base64UrlToUint8Array(subscription.p256dh);
  const authSecret = base64UrlToUint8Array(subscription.auth);

  // 1) สร้าง ephemeral ECDH keypair ของฝั่ง Server (as = "application server")
  const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

  // 2) ECDH shared secret ระหว่าง Server (as) กับอุปกรณ์ผู้ใช้ (ua)
  const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicBytes, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecretBits = await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeyPair.privateKey, 256);
  const ecdhSecret = new Uint8Array(ecdhSecretBits);

  // 3) HKDF รอบแรก: รวม auth secret เข้ากับ ecdh secret -> IKM สำหรับรอบสอง
  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concatUint8Arrays(new TextEncoder().encode("WebPush: info\0"), uaPublicBytes, asPublicRaw);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // 4) HKDF รอบสอง (ตาม Content-Encoding: aes128gcm มาตรฐาน RFC 8188)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  // 5) เข้ารหัส (เติม delimiter byte 0x02 ต่อท้าย payload เพราะเป็น record สุดท้าย/record เดียว)
  const plaintext = concatUint8Arrays(payloadBytes, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext);
  const ciphertext = new Uint8Array(ciphertextBuf);

  // 6) สร้าง header ตามรูปแบบ aes128gcm: salt(16) + record_size(4, uint32BE) + idlen(1) + keyid(as_public) + ciphertext
  const recordSize = 4096;
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, recordSize, false);
  const header = concatUint8Arrays(salt, rsBytes, new Uint8Array([asPublicRaw.length]), asPublicRaw);

  return concatUint8Arrays(header, ciphertext);
}

/**
 * ส่ง Push Notification ไปยัง subscription เดียว
 * @param {object} env - Worker env (ต้องมี VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY_JWK)
 * @param {{endpoint: string, p256dh: string, auth: string}} subscription
 * @param {object} payload - object ที่จะแปลงเป็น JSON ส่งไปแสดงผลใน Service Worker
 * @param {number} ttl - อายุของ notification (วินาที) ถ้าอุปกรณ์ offline
 * @returns {Promise<Response>} response จาก Push Service (ดู status: 201=สำเร็จ, 404/410=subscription หมดอายุ)
 */
export async function sendWebPush(env, subscription, payload, ttl = 86400) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const body = await encryptPayload(subscription, payloadBytes);
  const authHeader = await buildVapidAuthHeader(env, subscription.endpoint);

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": String(ttl),
      "Authorization": authHeader,
    },
    body,
  });
}

/**
 * ບັນທຶກແຈ້ງເຕືອນລົງ DB (ຕາຕະລາງ notifications) ໃຫ້ user ຄົນໜຶ່ງ - ບໍ່ວ່າ Push Notification
 * ຈະສົ່ງອອກໄປສຳເລັດຫຼືບໍ່ (ເຊັ່ນ ອຸປະກອນບໍ່ໄດ້ເປີດ/ອະນຸຍາດ Push) ເພື່ອໃຫ້ user ເຂົ້າມາເບິ່ງຄືນໄດ້
 * ພາຍໃນແອັບ (ໜ້າ "ແຈ້ງເຕືອນ") - ບໍ່ throw error ອອກໄປ ເພື່ອບໍ່ໃຫ້ການສົ່ງ push ລົ້ມເຫລວໄປນຳ
 */
async function recordNotification(env, userId, payload) {
  try {
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, body, url) VALUES (?, ?, ?, ?)"
    ).bind(userId, payload.title || "ແຈ້ງເຕືອນ", payload.body || "", payload.url || "/").run();
  } catch (e) { /* ไม่ throw - ไม่ต้องการให้กระทบการส่ง push */ }
}

/**
 * ບັນທຶກແຈ້ງເຕືອນລົງ DB ໃຫ້ທຸກ user ທີ່ມີ role ຢູ່ໃນ rolesList (ບໍ່ວ່າຈະເປີດ Push ຫຼືບໍ່ກໍຕາມ)
 */
async function recordNotificationForRoles(env, rolesList, payload) {
  try {
    const placeholders = rolesList.map(() => "?").join(",");
    await env.DB.prepare(
      `INSERT INTO notifications (user_id, title, body, url)
       SELECT id, ?, ?, ? FROM users WHERE role IN (${placeholders}) AND status = 'approved'`
    ).bind(payload.title || "ແຈ້ງເຕືອນ", payload.body || "", payload.url || "/", ...rolesList).run();
  } catch (e) { /* ไม่ throw - ไม่ต้องการให้กระทบการส่ง push */ }
}

/**
 * ນັບຈຳນວນແຈ້ງເຕືອນທີ່ຍັງບໍ່ໄດ້ອ່ານຂອງ user ຄົນໜຶ່ງ - ໃຊ້ເປັນຕົວເລກ badge ສີແດງເທິງໄອຄອນແອັບ
 */
async function countUnread(env, userId) {
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0"
    ).bind(userId).first();
    return (row && row.cnt) || 0;
  } catch (e) { return 0; }
}

/**
 * ນັບແຈ້ງເຕືອນທີ່ຍັງບໍ່ໄດ້ອ່ານຂອງຫຼາຍ user ພ້ອມກັນ (query ດຽວ) -> { [userId]: count }
 */
async function countUnreadForUsers(env, userIds) {
  const map = {};
  if (!userIds.length) return map;
  try {
    const placeholders = userIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT user_id, COUNT(*) AS cnt FROM notifications
       WHERE is_read = 0 AND user_id IN (${placeholders}) GROUP BY user_id`
    ).bind(...userIds).all();
    for (const r of results || []) map[r.user_id] = r.cnt;
  } catch (e) { /* ignore */ }
  return map;
}

/**
 * ส่ง Push Notification ไปยังทุก subscription ของ user คนหนึ่ง (ดึงจาก D1 เอง)
 * ลบ subscription ที่หมดอายุ (404/410) ออกจาก DB ให้อัตโนมัติ
 * @returns {Promise<{sent: number, removed: number, failed: number}>}
 */
export async function sendWebPushToUser(env, userId, payload) {
  await recordNotification(env, userId, payload);

  const { results } = await env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE user_id = ?"
  ).bind(userId).all();

  const badge = await countUnread(env, userId);
  const payloadWithBadge = { ...payload, badge };

  let sent = 0, removed = 0, failed = 0;
  const errors = [];
  for (const sub of results || []) {
    try {
      const res = await sendWebPush(env, sub, payloadWithBadge);
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
        removed++;
      } else if (res.ok || res.status === 201) {
        sent++;
      } else {
        failed++;
        let detail = "";
        try { detail = await res.text(); } catch (_) { /* ignore */ }
        errors.push(`HTTP ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
      }
    } catch (e) {
      failed++;
      errors.push(e.message || String(e));
    }
  }
  return { sent, removed, failed, errors };
}

/**
 * ส่ง Push Notification ไปยังทุก user ที่มี role อยู่ใน rolesList (เช่น แจ้ง admin/warehouse ตอนมีคำขอใหม่)
 */
export async function sendWebPushToRoles(env, rolesList, payload) {
  await recordNotificationForRoles(env, rolesList, payload);

  const placeholders = rolesList.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT ps.* FROM push_subscriptions ps
     JOIN users u ON u.id = ps.user_id
     WHERE u.role IN (${placeholders}) AND u.status = 'approved'`
  ).bind(...rolesList).all();

  const unreadMap = await countUnreadForUsers(env, [...new Set((results || []).map((r) => r.user_id))]);

  let sent = 0, removed = 0, failed = 0;
  const errors = [];
  for (const sub of results || []) {
    try {
      const res = await sendWebPush(env, sub, { ...payload, badge: unreadMap[sub.user_id] || 0 });
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
        removed++;
      } else if (res.ok || res.status === 201) {
        sent++;
      } else {
        failed++;
        let detail = "";
        try { detail = await res.text(); } catch (_) { /* ignore */ }
        errors.push(`HTTP ${res.status}${detail ? ": " + detail.slice(0, 200) : ""}`);
      }
    } catch (e) {
      failed++;
      errors.push(e.message || String(e));
    }
  }
  return { sent, removed, failed, errors };
}
