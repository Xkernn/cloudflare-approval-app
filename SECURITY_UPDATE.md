# ອັບເດດຄວາມປອດໄພ: ເພີ່ມລະບົບ Authentication ຈິງ

## ບັນຫາເກົ່າ
API ເຊື່ອ `userId` / `callerId` ທີ່ browser ສົ່ງມາໂດຍກົງ. ຜູ້ໃດກໍ (ບໍ່ຕ້ອງ login) ສາມາດ:
- ປ່ຽນລະຫັດຜ່ານ Admin (`POST /api/change-password` ດ້ວຍ `userId: 1`)
- ອະນຸມັດບັນຊີຕົນເອງ, ລຶບຜູ້ໃຊ້, ດຶງລາຍຊື່ຜູ້ໃຊ້ທັງໝົດ, ແກ້ Master List / ງົບປະມານ

## ວິທີແກ້
Token ທີ່ເຊັນດ້ວຍ **HMAC-SHA256** (`src/session.js`) + ດ່ານກວດກາງໃນ `src/index.js`
ທີ່ຮັນກ່ອນທຸກ route:

1. ທຸກ API (ຍົກເວັ້ນ `/api/login`, `/api/register`, `/api/mde-list`, `/api/catalog`,
   `/api/push/vapid-public-key`) ຕ້ອງມີ header `Authorization: Bearer <token>`
2. ຕົວຕົນມາຈາກ token ເທົ່ານັ້ນ — `userId`/`callerId` ໃນ body ແລະ query string
   ຖືກ **ທັບ** ດ້ວຍ id ຈາກ token ສະເໝີ (ຍົກເວັ້ນ 3 route ທີ່ `userId` ໝາຍເຖິງເປົ້າໝາຍ:
   `update-status`, `update-user-role`, `delete-user` — ອັນນີ້ admin-only ຢູ່ແລ້ວ)
3. `/api/admin/*` ທຸກອັນ = admin ເທົ່ານັ້ນ ໂດຍອັດຕະໂນມັດ
   (ຍົກເວັ້ນ `update-asset-request-status` ທີ່ເປີດໃຫ້ warehouse/delivery ຕາມເດີມ)
4. ດຶງ `role` / `status` ຈາກ DB ໃໝ່ທຸກ request — Admin ລະງັບບັນຊີ ຫຼື ລົດສິດ ມີຜົນທັນທີ
5. ປ່ຽນລະຫັດຜ່ານ → token ເກົ່າທຸກອັນຖືກຍົກເລີກທັນທີ (ຜ່ານຄ່າ `pv` ໃນ token)
6. `/api/change-password` ຕ້ອງປ້ອນ **ລະຫັດຜ່ານປັດຈຸບັນ** ກ່ອນ ແລະ ລະຫັດໃໝ່ຍາວ ≥ 8 ຕົວ

## ຂັ້ນຕອນ Deploy (ສຳຄັນ)

```bash
# 1. ສ້າງ secret ແບບສຸ່ມ
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 2. ຕັ້ງຄ່າໃສ່ Worker (ວາງຄ່າທີ່ໄດ້ຈາກຂໍ້ 1)
npx wrangler secret put SESSION_SECRET

# 3. Deploy
npx wrangler deploy
```

**ຖ້າບໍ່ຕັ້ງ `SESSION_SECRET` ຈະ login ບໍ່ໄດ້** (API ຈະຕອບ 500 ພ້ອມຂໍ້ຄວາມແຈ້ງເຕືອນ).

## ຜົນກະທົບຕໍ່ຜູ້ໃຊ້ງານ
- ຜູ້ໃຊ້ງານທຸກຄົນຈະຖືກເດັ້ງອອກຄັ້ງດຽວ ແລະ ຕ້ອງ login ໃໝ່ (session ເກົ່າບໍ່ມີ token)
- ບໍ່ຕ້ອງແກ້ DB / ບໍ່ຕ້ອງຮັນ migration ໃດໆ

## ໄຟລ໌ທີ່ປ່ຽນ
| ໄຟລ໌ | ການປ່ຽນແປງ |
|---|---|
| `src/session.js` | **ໃໝ່** — ສ້າງ/ກວດ token (HMAC-SHA256) |
| `src/index.js` | ດ່ານກວດສິດກາງ, login ຄືນ token, change-password ເຂັ້ມຂຶ້ນ, push unsubscribe scope |
| `public/index.html` | ດັກ `fetch` ໃສ່ header ໃຫ້ອັດຕະໂນມັດ, ເກັບ token, ຊ່ອງລະຫັດຜ່ານປັດຈຸບັນ, ເດັ້ງອອກເມື່ອ 401 |
| `wrangler.toml` | ບັນທຶກວິທີຕັ້ງ `SESSION_SECRET` |

## ຍັງເຫຼືອ (ແນະນຳເຮັດຕໍ່)
- ຈຳກັດຈຳນວນຄັ້ງ login ຜິດ (rate limit) ຢູ່ `/api/login`
- ປ່ຽນລະຫັດ admin ເລີ່ມຕົ້ນ `Admin@123` ແລະ ເອົາອອກຈາກ `schema.sql`
- ແຍກ `DROP TABLE` ອອກຈາກ `schema.sql`

---

# ອັບເດດຄັ້ງທີ 2: ປິດຊ່ອງ XSS, ແກ້ຮູບ R2, ເຂັ້ມການລົງທະບຽນ

## ແກ້ຫຍັງແດ່
1. **XSS (`public/index.html`)** - ເພີ່ມ `esc()` / `jsq()` / `raw()` ແລ້ວໃຊ້ກັບທຸກຈຸດທີ່ເອົາຂໍ້ມູນຜູ້ໃຊ້ໃສ່ `innerHTML`
   ແລະ argument ຂອງ `onclick` (ຊື່ຮ້ານທີ່ມີເຄື່ອງໝາຍ `'` ຈະບໍ່ເຮັດໃຫ້ປຸ່ມແກ້ໄຂພັງອີກ). ກົດເກນ: ຂໍ້ມູນຈາກ API ຕ້ອງຜ່ານ `esc()` ສະເໝີ
   ເມື່ອໃສ່ໃນ template ທີ່ຈະເປັນ HTML; ຖ້າສົ່ງເຂົ້າ `openDetailModal` ເປັນ HTML ໃຫ້ຫໍ່ດ້ວຍ `raw(...)`.
2. **ຮູບຈັດສົ່ງ** - `<img src="/api/photo">` ບໍ່ສົ່ງ token ຈຶ່ງໄດ້ 401. ຕອນນີ້ໂຫລດຜ່ານ `fetch` (ມີ token) ແລ້ວສະແດງເປັນ blob URL (`setPhotoSrc`).
   ຝັ່ງ server: ຮັບສະເພາະ JPEG/PNG/WebP ≤ 5MB ຕັດສິນຊະນິດຈາກ magic bytes, `/api/photo` ບັງຄັບເປັນຮູບ + `nosniff`,
   ແລະ user ທົ່ວໄປເບິ່ງໄດ້ສະເພາະຮູບຂອງ Asset ໃນ MDE ຕົນເອງ. ຖ້າອັບໂຫລດບໍ່ຄົບ ຈະລຶບຮູບທີ່ອັບໄປແລ້ວ ແລະ ບໍ່ຄ້າງແຖວ `TMP-...`.
3. **ລົງທະບຽນ** - ຕ້ອງເປັນ MDE Code ທີ່ມີໃນ `mde_list`, Team ດຶງຈາກ `mde_list` (ບໍ່ເຊື່ອຄ່າຈາກ browser), ອີເມວຕ້ອງຖືກຮູບແບບ ແລະ ເກັບເປັນຕົວພິມນ້ອຍ,
   ກວດຊ້ຳແບບບໍ່ແຍກຕົວພິມໃຫຍ່/ນ້ອຍ, ລະຫັດຜ່ານ ≥ 8 ຕົວ.

## ໝາຍເຫດຫຼັງ deploy
- Deploy ຄືເດີມ (`npx wrangler deploy`) ບໍ່ຕ້ອງຮັນ migration.
- ຮູບທີ່ເກັບໄວ້ກ່ອນນີ້ຍັງເບິ່ງໄດ້ (ຖ້າ Content-Type ເກົ່າບໍ່ແມ່ນຮູບ ຈະຖືກສົ່ງເປັນ `image/jpeg`).
- ບັນຊີເກົ່າທີ່ email ເກັບເປັນຕົວພິມໃຫຍ່ຍັງ login ໄດ້ຕາມປົກກະຕິ.

---

# ອັບເດດຄັ້ງທີ 3: ຄຳຂໍເບີກ Asset + ຄົ້ນຫາ QR

- **ອະນຸມັດ/ປະຕິເສດຄຳຂໍ** (`/api/admin/update-asset-request-status`): ອະນຸຍາດສະເພາະ `approved` / `rejected`, ດຳເນີນການໄດ້ສະເພາະຄຳຂໍທີ່ຍັງ `pending`
  (ກົດຊ້ຳ ຫຼື ສອງຄົນກົດພ້ອມກັນ = ຕອບ 409 ບໍ່ສ້າງ Asset ຊ້ຳ). ອັບເດດຄຳຂໍ + ສ້າງ Asset + ໃສ່ Tracking No ເຮັດໃນ D1 batch (transaction) ດຽວກັນ
  ຖ້າຂັ້ນຕອນໃດລົ້ມ ທັງຊຸດຖືກຍົກເລີກ ຄຳຂໍຈະບໍ່ຄ້າງເປັນ `approved` ທັງທີ່ບໍ່ມີ Asset.
- **ຄົ້ນຫາດ້ວຍ QR** (`/api/asset-tracking/lookup-by-qr`): ຈັບຄູ່ຕົງເປ໊ະກ່ອນ ແລ້ວຄ່ອຍຈັບແບບລົງທ້າຍ; ຖ້າພົບຫຼາຍກວ່າ 1 ລາຍການຈະບໍ່ເດົາ ແຕ່ບອກໃຫ້ປ້ອນ QR ໃຫ້ຄົບ;
  ຕົວ `%` `_` ທີ່ຜູ້ໃຊ້ພິມບໍ່ເປັນ wildcard ອີກຕໍ່ໄປ.
- ຄຳຂໍ SQL ໃຊ້ `changes()` ແລະ `printf()` ຂອງ SQLite - ຄວນທົດສອບອະນຸມັດ 1 ຄຳຂໍດ້ວຍ `npx wrangler dev` (D1 local) ກ່ອນ deploy.

---

# ອັບເດດຄັ້ງທີ 4: ປິດ 3 ຂໍ້ "ຍັງເຫຼືອ" + security headers

1. **Rate limit login** (`/api/login`): ຜິດ 5 ຄັ້ງ/ບັນຊີ ຫຼື 20 ຄັ້ງ/IP ໃນ 15 ນາທີ -> 429 (ຕາຕະລາງໃໝ່ `login_attempts`). ບັນຊີທີ່ບໍ່ມີໃນລະບົບກໍນັບ ແລະ ໃຊ້ເວລາຕອບໃກ້ກັນ (ກັນເດົາວ່າບັນຊີມີຢູ່ບໍ). ລ້າງຕົວນັບເມື່ອ login ສຳເລັດ.
2. **ປຽບທຽບລະຫັດຜ່ານແບບ constant-time** ໃນ `src/auth.js` (ທັງ hash ແລະ plaintext ເກົ່າ).
3. **ເອົາ admin ລະຫັດ `Admin@123` ອອກຈາກ `schema.sql`** -> ສ້າງ admin ດ້ວຍ `node create-admin.js <email> <ລະຫັດ>` (ພິມ SQL ມີ hash PBKDF2).
4. **ແຍກ `DROP TABLE` ອອກຈາກ `schema.sql`** ໄປເປັນ `SQL/DANGEROUS_reset_database_drop_all.sql`.
5. **Security headers** ຜ່ານ `public/_headers`: nosniff, X-Frame-Options DENY, HSTS, Referrer-Policy, Permissions-Policy (ກ້ອງ/GPS ສະເພາະ self), CSP ແບບເບົາ (frame-ancestors/base-uri/object-src/form-action). ບໍ່ໄດ້ໃສ່ `script-src` ເພາະ `index.html` ໃຊ້ inline script/onclick ຈຳນວນຫຼາຍ.

## ຕ້ອງເຮັດຕອນ deploy
```bash
npx wrangler d1 execute user-approval-db --remote --file=SQL/migration_add_login_attempts.sql
npx wrangler deploy
```
**DB ທີ່ໃຊ້ຢູ່:** ຖ້າຍັງມີ `admin@example.com` / `Admin@123` ໃຫ້ປ່ຽນລະຫັດຜ່ານ ຫຼື ລຶບທັນທີ.

## ເພີ່ມ (ຄັ້ງທີ 4b): CSP `script-src`
ຈຳກັດ script ໃຫ້ໂຫລດໄດ້ສະເພາະ origin ຕົນເອງ + unpkg / cdnjs / jsdelivr (ທີ່ແອັບໃຊ້ຢູ່) ແຕ່ຍັງເປີດ `'unsafe-inline'` ຢູ່ ເພາະ `index.html` ມີ inline `onclick` ~919 ຈຸດ.
ຜົນ: script ຈາກໂດເມນອື່ນທີ່ຖືກແຊກເຂົ້າມາຈະຖືກບລັອກ. ແຕ່ inline script ທີ່ຖືກແຊກຍັງບໍ່ຖືກກັນ — ປ້ອງກັນດ້ວຍ `esc()` ຕາມເດີມ.
ຖ້າຢາກເຮັດ CSP ເຂັ້ມເຕັມ (ບໍ່ມີ unsafe-inline) ຕ້ອງຍ້າຍ onclick ທັງໝົດເປັນ addEventListener ກ່ອນ.
ບັນທຶກ: ລິ້ງ `/api/public/*` ປອດໄພດ້ວຍ token ສຸ່ມ 256-bit ຈຶ່ງບໍ່ໄດ້ເພີ່ມ rate limit.

## ຄັ້ງທີ 4c: `/api/mde-list` ບໍ່ເປີດຂໍ້ມູນເຕັມໃຫ້ຄົນນອກ
ຄົນທີ່ບໍ່ໄດ້ login ໄດ້ສະເພາະ `team`, `mde_code`, `mde_name` ຂອງ MDE ທີ່ຍັງບໍ່ມີ user (ເບີໂທ ແລະ ຂໍ້ມູນອື່ນບໍ່ສົ່ງ) ແລະ ຈຳກັດ 30 ຄັ້ງ/15 ນາທີ/IP. ຄົນທີ່ login ແລ້ວໄດ້ຂໍ້ມູນເຕັມຄືເກົ່າ. ບໍ່ຕ້ອງ migration ເພີ່ມ.
