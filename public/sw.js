// Service Worker สำหรับรับ Push Notification
// ไฟล์นี้ต้องอยู่ที่ root ("/sw.js") เพื่อให้ scope ครอบคลุมทั้งเว็บ

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// เมื่อมี Push Notification เข้ามาจาก Server
self.addEventListener("push", (event) => {
  let data = { title: "ແຈ້ງເຕືອນ", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // ถ้า parse JSON ไม่ได้ ใช้ค่า default ด้านบน
  }

  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png?v=2",
    data: { url: data.url || "/" },
    tag: data.tag || ("notif-" + Date.now()),
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || "ແຈ້ງເຕືອນ", options);
    // badge ຕົວເລກສີແດງເທິງໄອຄອນແອັບ (Server ສົ່ງຈຳນວນແຈ້ງເຕືອນທີ່ຍັງບໍ່ໄດ້ອ່ານມາໃນ payload.badge)
    if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
      try {
        if (data.badge > 0) await self.navigator.setAppBadge(data.badge);
        else await self.navigator.clearAppBadge();
      } catch (err) { /* ອຸປະກອນບໍ່ຮອງຮັບ - ບໍ່ຕ້ອງເຮັດຫຍັງ */ }
    }
  })());
});

// ຊື່ view ທີ່ Server ສົ່ງມາໃນ payload.url (ຕ້ອງກົງກັບ KNOWN_VIEWS ໃນ public/index.html)
// Server ສົ່ງ url ເປັນ "ຊື່ view" (ເຊັ່ນ "asset", "request") ບໍ່ແມ່ນ path ຈິງ ຈຶ່ງຫ້າມ navigate ໄປຫາໂດຍກົງ (ຈະໄດ້ /asset -> 404)
const KNOWN_VIEWS = [
  "dashboard", "asset", "map", "request", "history", "delivery",
  "deliverConfirm", "noDocDelivery", "coolerEvent", "coolerWriteOff", "coolerWriteOffList", "noDocDeliveryList", "coolerEventList", "warehouseStock", "stockCount",
  "profile", "loanContract", "announcements", "notifications",
];

// ແປງ url ຈາກ payload -> { view, target }: ຊື່ view ທີ່ຮູ້ຈັກ = "/?view=<ຊື່>", ຢ່າງອື່ນ = "/"
function resolveTarget(rawUrl) {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  // ຮອງຮັບ "view:tab" (ເຊັ່ນ loanContract:queue / loanContract:docs) — ກວດຊື່ view ຈາກສ່ວນໜ້າ, ສົ່ງຄ່າເຕັມໃຫ້ໜ້າເວັບ
  if (KNOWN_VIEWS.includes(value.split(":")[0])) {
    return { view: value, target: "/?view=" + encodeURIComponent(value) };
  }
  return { view: null, target: "/" };
}

// ບອກໜ້າເວັບທີ່ເປີດຢູ່ໃຫ້ສະຫຼັບໄປ view ນັ້ນ (ບໍ່ reload ໜ້າ ເພື່ອບໍ່ໃຫ້ຟອມທີ່ກຳລັງກອກ/ຖ່າຍຮູບຢູ່ຫາຍ)
// ຄືນ true ຖ້າໜ້າເວັບຕອບຮັບ (ໜ້າເກົ່າທີ່ຍັງບໍ່ມີຕົວຮັບ message ຈະບໍ່ຕອບ -> ໝົດເວລາ -> ໃຊ້ navigate ແທນ)
function askClientToOpenView(client, view) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    const timer = setTimeout(() => finish(false), 800);
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => { clearTimeout(timer); finish(!!(e.data && e.data.ok)); };
      client.postMessage({ type: "OPEN_VIEW", view }, [channel.port2]);
    } catch (err) {
      clearTimeout(timer);
      finish(false);
    }
  });
}

// เมื่อผู้ใช้กดที่ตัว Notification -> เปิด/โฟกัสหน้าเว็บ แล้วพาไปหน้าที่เกี่ยวข้อง
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { view, target } = resolveTarget(event.notification.data && event.notification.data.url);

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appClient = clientsList.find((c) => c.url.startsWith(self.location.origin) && "focus" in c);

    if (appClient) {
      if (view) {
        const handled = await askClientToOpenView(appClient, view);
        if (!handled && "navigate" in appClient) {
          try { await appClient.navigate(target); } catch (err) { /* ignore */ }
        }
      }
      return appClient.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
