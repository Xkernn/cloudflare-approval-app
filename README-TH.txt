Beerlao Admin UI Fix v2
=======================

สาเหตุที่ Patch v1 ไม่แสดงหลัง Login:
- ระบบเดิมตั้ง defaultView ของ role admin เป็น "home"
- Premium Admin Control Center อยู่ใน view "dashboard" (#view-admin-dashboard)
- จึง Login แล้วเข้าหน้า Home เดิม ไม่ได้เข้าหน้าใหม่

สิ่งที่แก้ใน v2:
1) role admin เปิด view "dashboard" หลัง Login เพื่อให้เห็น Admin Control Center ทันที
2) role warehouse ยังคงเปิด view "home" เหมือนเดิม
3) role dsm/user และ role อื่นคง default route เดิม
4) Assistant Admin (บัญชีที่ระบบ normalize เป็น admin พร้อม isAssistantAdmin=true) ซ่อน Premium Admin Home เพื่อคงหน้าการทำงานเดิม
5) CSS ของ Premium Admin UI จำกัดอยู่ภายใต้ #view-admin-dashboard
6) อัปเดต public/version.json เป็น version 1.2.1 / build 15 และ APP_BUILD ให้ตรงกัน

วิธีใช้กับ GitHub:
1) สำรอง Repository หรือสร้าง branch ใหม่ก่อน
2) แตก ZIP นี้ที่ root ของ Repository โดยให้ทับไฟล์ตาม path:
   - public/index.html
   - public/version.json
3) ตรวจสอบ Git diff ว่ามีเฉพาะสองไฟล์นี้
4) Commit และ Push ไปยัง branch ที่เชื่อมกับ Cloudflare Auto Deploy
5) รอ GitHub Actions / Cloudflare deployment สำเร็จ
6) เปิดเว็บแล้วกด Ctrl+Shift+R หรือเปิด Incognito และ Login ด้วย role admin

การตรวจสอบหลัง Deploy:
- Admin: หลัง Login ต้องเห็น Admin Control Center
- Warehouse: ยังเข้า Home เดิม
- DSM/User/Delivery: เส้นทางเริ่มต้นเดิม
- Assistant Admin: คงหน้า Admin เดิม (ไม่มี Premium Admin Home)

ข้อควรทราบ:
- ZIP นี้เป็น Source Patch สำหรับนำเข้า GitHub Repository ไม่ได้ Push เข้า GitHub ให้อัตโนมัติ
- ไม่แก้ Backend, API, Database, Permission policy หรือไฟล์ Role อื่น
- HTML inline JavaScript ผ่าน node --check ทั้ง 11 script blocks ในการตรวจสอบเบื้องต้น
