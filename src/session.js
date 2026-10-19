// ==========================================================================
// Session Token - ໃຊ້ HMAC-SHA256 ເຊັນ token ດ້ວຍ secret ຂອງ Worker
// (ຮູບແບບຄ້າຍ JWT ແຕ່ຂຽນເອງ ເພື່ອບໍ່ຕ້ອງເພິ່ງ npm package ໃດໆ)
//
// ຮູບແບບ token:  <payloadBase64Url>.<signatureBase64Url>
// payload = { uid, role, pv, iat, exp }
//   uid  = users.id
//   role = ບົດບາດຕອນອອກ token (ໃຊ້ອ້າງອີງເທົ່ານັ້ນ - ຕອນກວດຈະດຶງ role ຈາກ DB ໃໝ່ສະເໝີ)
//   pv   = password version (hash ຂອງ password_hash) -> ປ່ຽນລະຫັດຜ່ານເມື່ອໃດ token ເກົ່າໃຊ້ບໍ່ໄດ້ທັນທີ
//   iat  = ອອກເມື່ອໃດ (epoch seconds)
//   exp  = ໝົດອາຍຸເມື່ອໃດ (epoch seconds)
//
// ຕ້ອງຕັ້ງ secret ກ່ອນ deploy:
//   npx wrangler secret put SESSION_SECRET
// ==========================================================================

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 ວັນ (ໃຫ້ກົງກັບຝັ່ງ frontend)

function base64UrlEncode(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getSigningKey(env) {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET_MISSING");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(env, data) {
  const key = await getSigningKey(env);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

// ປຽບທຽບແບບ constant-time (ບໍ່ໃຫ້ຮູ້ຄວາມຖືກຕ້ອງຈາກເວລາທີ່ໃຊ້)
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * ສ້າງ "ລາຍນິ້ວມື" ຂອງລະຫັດຜ່ານປັດຈຸບັນ (ບໍ່ແມ່ນລະຫັດຜ່ານ ແລະ ບໍ່ແມ່ນ hash ຕົວຈິງ)
 * ໃຊ້ໃສ່ໃນ token ເພື່ອໃຫ້ token ທຸກອັນຖືກຍົກເລີກອັດຕະໂນມັດເມື່ອປ່ຽນລະຫັດຜ່ານ
 */
export async function passwordVersion(passwordHash) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwordHash || ""));
  return base64UrlEncode(new Uint8Array(digest)).slice(0, 12);
}

/**
 * ອອກ token ໃໝ່ໃຫ້ຜູ້ໃຊ້ງານ (ເອີ້ນຕອນ login ສຳເລັດ ຫຼື ຕອນປ່ຽນລະຫັດຜ່ານ)
 */
export async function createSessionToken(env, user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    uid: user.id,
    role: user.role,
    pv: await passwordVersion(user.password_hash),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(env, encoded);
  return `${encoded}.${signature}`;
}

/**
 * ກວດ token: ລາຍເຊັນຖືກຕ້ອງບໍ + ຫມົດອາຍຸແລ້ວບໍ
 * @returns {Promise<object|null>} payload ຖ້າຜ່ານ, null ຖ້າບໍ່ຜ່ານ
 */
export async function verifySessionToken(env, token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let expected;
  try {
    expected = await sign(env, encoded);
  } catch (e) {
    if (e.message === "SESSION_SECRET_MISSING") throw e;
    return null;
  }
  if (!timingSafeEqual(signature, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch (e) {
    return null;
  }

  if (!payload || !payload.uid || !payload.exp) return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return payload;
}

/**
 * ດຶງ token ອອກຈາກ header "Authorization: Bearer <token>"
 */
export function readBearerToken(request) {
  const header = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
