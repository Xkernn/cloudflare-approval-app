// ສົ່ງອີເມວຜ່ານ Gmail API (OAuth2 refresh token) — ໃຊ້ໄດ້ໃນ Cloudflare Workers (HTTPS ລ້ວນ ບໍ່ໃຊ້ SMTP)
// Secrets ທີ່ຕ້ອງຕັ້ງ (npx wrangler secret put ...):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
// Var ໃນ wrangler.toml: GMAIL_SENDER (ທີ່ຢູ່ Gmail ທີ່ໃຊ້ສົ່ງ), GMAIL_SENDER_NAME (ຊື່ທີ່ສະແດງ, ບໍ່ບັງຄັບ)

const enc = new TextEncoder();

function b64Bytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
const b64Utf8 = (s) => b64Bytes(enc.encode(s));
const wrap76 = (b64) => b64.replace(/(.{76})/g, "$1\r\n");
// ກັນ header injection: ຕັດ CR/LF ອອກ
const clean = (s) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();

// ຫົວເລື່ອງ/ຊື່ຜູ້ສົ່ງທີ່ມີພາສາລາວ -> RFC 2047 encoded-word (ແຍກທຸກ ~42 byte ໃຫ້ບໍ່ເກີນ 75 ຕົວ)
function encodeHeader(value) {
  const s = clean(value);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words = [];
  let cur = "", curBytes = 0;
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (curBytes + n > 42) { words.push(cur); cur = ""; curBytes = 0; }
    cur += ch; curBytes += n;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64Utf8(w)}?=`).join("\r\n ");
}

export function buildMimeMessage({ from, fromName, to, subject, text, html, attachments }) {
  const rnd = () => b64Bytes(crypto.getRandomValues(new Uint8Array(12))).replace(/[^A-Za-z0-9]/g, "");
  const boundary = "b_" + rnd();
  const fromHeader = fromName ? `${encodeHeader(fromName)} <${from}>` : from;
  const files = (attachments || []).filter((a) => a && a.bytes && a.bytes.length);
  const outer = files.length ? "m_" + rnd() : "";
  const head = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    files.length ? `Content-Type: multipart/mixed; boundary="${outer}"` : `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const part = (type, body) =>
    `--${boundary}\r\nContent-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64Utf8(body))}\r\n`;
  const alt = `${part("text/plain", text || "")}${part("text/html", html || text || "")}--${boundary}--`;
  if (!files.length) return `${head}\r\n\r\n${alt}`;
  // ມີໄຟລ໌ແນບ: multipart/mixed ຫໍ່ multipart/alternative (ຂໍ້ຄວາມ) + ໄຟລ໌ແນບ (base64)
  const fname = encodeHeader(files[0].filename || "file");
  const attParts = files.map((a) => {
    const n = encodeHeader(a.filename || "file");
    return `--${outer}\r\nContent-Type: ${a.contentType || "application/octet-stream"}; name="${n}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${n}"\r\n\r\n${wrap76(b64Bytes(a.bytes))}\r\n`;
  }).join("");
  void fname;
  return `${head}\r\n\r\n--${outer}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${alt}\r\n${attParts}--${outer}--`;
}

// access token ມີອາຍຸ ~1 ຊົ່ວໂມງ — ເກັບໄວ້ໃນ isolate ເພື່ອບໍ່ຕ້ອງຂໍໃໝ່ທຸກຄັ້ງ
let cachedToken = null; // { token, exp }

async function getAccessToken(env) {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    cachedToken = null;
    // invalid_grant = refresh token ໝົດອາຍຸ/ຖືກຖອນ (ເຊັ່ນ OAuth consent screen ຍັງເປັນ Testing ເກີນ 7 ມື້) -> ຕ້ອງສ້າງ token ໃໝ່
    throw new Error(`GMAIL_TOKEN_FAILED ${res.status}: ${data.error || ""} ${data.error_description || ""}`.trim());
  }
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

export async function sendEmail(env, { to, subject, text, html, attachments }) {
  const missing = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER"].filter((k) => !env[k]);
  if (missing.length || String(env.GMAIL_SENDER).includes("CHANGE_ME")) {
    throw new Error("MAIL_NOT_CONFIGURED: " + (missing.join(",") || "GMAIL_SENDER"));
  }
  const toAddr = clean(to);
  if (!/^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/.test(toAddr)) throw new Error("MAIL_BAD_RECIPIENT");

  const message = buildMimeMessage({
    from: clean(env.GMAIL_SENDER),
    fromName: env.GMAIL_SENDER_NAME,
    to: toAddr,
    subject,
    text,
    html,
    attachments,
  });
  // ຂໍ້ຄວາມທັງໝົດເປັນ ASCII ແລ້ວ (header + base64) -> btoa ໄດ້ໂດຍກົງ, ປ່ຽນເປັນ base64url
  const raw = btoa(message).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const token = await getAccessToken(env);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    if (res.status === 401) cachedToken = null;
    throw new Error(`GMAIL_SEND_FAILED ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const sent = await res.json().catch(() => ({}));
  console.log("[mailer] Gmail accepted message id=" + (sent.id || "?") + " labels=" + JSON.stringify(sent.labelIds || []) + " to=" + toAddr);
}

// ກວດວ່າ refresh token ຍັງໃຊ້ໄດ້ບໍ (ຂໍ access token ໃໝ່ສະເໝີ ບໍ່ໃຊ້ຄ່າ cache) — ບໍ່ສົ່ງອີເມວ
// ຖ້າໃຊ້ບໍ່ໄດ້ຈະ throw MAIL_NOT_CONFIGURED ຫຼື GMAIL_TOKEN_FAILED
export async function checkGmailToken(env) {
  const missing = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER"].filter((k) => !env[k]);
  if (missing.length) throw new Error("MAIL_NOT_CONFIGURED: " + missing.join(","));
  cachedToken = null;
  await getAccessToken(env);
  return true;
}
