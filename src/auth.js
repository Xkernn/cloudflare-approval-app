// ==========================================================================
// Password Hashing - เขียนขึ้นเองด้วย Web Crypto API (PBKDF2 + SHA-256)
// เพราะ Cloudflare Workers ไม่รองรับ npm package "bcrypt" (ใช้ native binding ของ Node)
// รูปแบบที่เก็บใน DB (คอลัมน์ users.password_hash):
//   pbkdf2$<iterations>$<saltBase64>$<hashBase64>
// ==========================================================================

const PBKDF2_ITERATIONS = 100000;

function bufferToBase64(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function base64ToBuffer(base64) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function deriveHash(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(derivedBits);
}

/**
 * สร้าง password hash ใหม่ (ใช้ตอน register / เปลี่ยนรหัสผ่าน)
 * @param {string} password - รหัสผ่านตัวจริง (plaintext)
 * @returns {Promise<string>} ค่าที่จะเก็บลงคอลัมน์ password_hash
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bufferToBase64(salt)}$${bufferToBase64(hash)}`;
}

/**
 * ตรวจสอบรหัสผ่านที่ผู้ใช้กรอก เทียบกับค่าที่เก็บไว้ในคอลัมน์ password_hash
 * รองรับ 2 รูปแบบ:
 *   1. "pbkdf2$..." (รูปแบบใหม่ - ผ่านการ hash แล้ว)
 *   2. ข้อความธรรมดา (ของเดิมที่เก็บเป็น plaintext ก่อนแก้ไขระบบนี้) - เทียบตรงๆ
 * คืนค่า needsRehash = true ถ้ารหัสผ่านที่ตรวจสอบผ่าน เป็นแบบเก่า (plaintext)
 * เพื่อให้ผู้เรียกใช้ (login handler) บันทึก hash ใหม่ทับของเก่าอัตโนมัติ (lazy migration)
 * @param {string} password - รหัสผ่านตัวจริง (plaintext) ที่ผู้ใช้กรอกเข้ามา
 * @param {string} stored - ค่าที่อยู่ในคอลัมน์ password_hash
 * @returns {Promise<{ ok: boolean, needsRehash: boolean }>}
 */
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, needsRehash: false };

  if (!stored.startsWith("pbkdf2$")) {
    // ຮູບແບບເກົ່າ: password_hash ຄື plaintext ໂດຍກົງ
    return { ok: password === stored, needsRehash: password === stored };
  }

  const parts = stored.split("$");
  if (parts.length !== 4) return { ok: false, needsRehash: false };

  const iterations = parseInt(parts[1], 10);
  const salt = base64ToBuffer(parts[2]);
  const expectedHash = parts[3];

  const hash = await deriveHash(password, salt, iterations);
  return { ok: bufferToBase64(hash) === expectedHash, needsRehash: false };
}
