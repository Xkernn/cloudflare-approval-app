// สคริปต์นี้รันครั้งเดียวบนเครื่อง (ไม่ใช่บน Cloudflare Worker) เพื่อสร้างคีย์ VAPID
// สำหรับใช้กับฟีเจอร์ Push Notification
//
// วิธีใช้:
//   node generate-vapid-keys.js
//
// ต้องใช้ Node.js เวอร์ชัน 18 ขึ้นไป (มี crypto.webcrypto ในตัว)

const { webcrypto } = require("crypto");
const subtle = webcrypto.subtle;

function toBase64Url(uint8arr) {
  return Buffer.from(uint8arr).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  const keyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);

  const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);
  const publicRaw = new Uint8Array(await subtle.exportKey("raw", keyPair.publicKey));
  const publicKeyBase64Url = toBase64Url(publicRaw);

  console.log("\n=== VAPID Keys ที่สร้างเสร็จแล้ว ===\n");
  console.log("1) ตั้งเป็น Secret (เก็บเป็นความลับ) ด้วยคำสั่ง:");
  console.log("   npx wrangler secret put VAPID_PRIVATE_KEY_JWK");
  console.log("   -> แล้ววาง JSON ด้านล่างนี้ทั้งหมดตอนที่มันถาม (ทั้งบรรทัด ห้ามมีขึ้นบรรทัดใหม่):\n");
  console.log(JSON.stringify(privateJwk));

  console.log("\n2) ใส่ในไฟล์ wrangler.toml ช่อง [vars] (ค่านี้ไม่ลับ ส่งให้ browser ได้):");
  console.log(`   VAPID_PUBLIC_KEY = "${publicKeyBase64Url}"`);

  console.log("\n3) (ไม่บังคับ) ตั้งอีเมลผู้ดูแลระบบสำหรับ VAPID subject ใน wrangler.toml:");
  console.log('   VAPID_SUBJECT = "mailto:admin@example.com"');
  console.log("\n(สร้างครั้งเดียวพอ อย่ารันซ้ำแล้วเปลี่ยนคีย์ ไม่งั้น subscription เดิมของผู้ใช้จะใช้ไม่ได้)\n");
}

main();
