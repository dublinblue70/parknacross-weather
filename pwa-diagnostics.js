(() => {
  "use strict";
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  function platformLabel() {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "Apple iOS / iPadOS";
    if (/Android/i.test(ua)) return "Android";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
    return "Other platform";
  }
  function updateNetwork() { set("diagNetwork", navigator.onLine ? "Online" : "Offline"); }
  document.addEventListener("DOMContentLoaded", () => {
    set("diagCache", "v38.4.75");
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
    set("diagInstalled", standalone ? "Yes" : "No · browser mode");
    set("diagPlatform", platformLabel());
    updateNetwork();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);

    if (!("serviceWorker" in navigator)) set("diagWorker", "Unavailable");
    else {
      set("diagWorker", navigator.serviceWorker.controller ? "Active" : "Starting…");
      navigator.serviceWorker.ready.then(() => set("diagWorker", "Active")).catch(() => set("diagWorker", "Unavailable"));
    }

    if (!("Notification" in window)) {
      set("diagNotifications", "Unavailable");
      set("diagNotificationPermission", "Not supported by this browser");
    } else {
      set("diagNotifications", "Available");
      const wording = {granted:"Allowed",denied:"Blocked",default:"Not requested"};
      set("diagNotificationPermission", `Permission: ${wording[Notification.permission] || Notification.permission}`);
    }
  });
})();
