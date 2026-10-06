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
  async function updateSiteVersion() {
    const output = document.getElementById("diagCache");
    if (!output) return;
    if (!("serviceWorker" in navigator)) {
      set("diagCache", "Unavailable");
      return;
    }
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("App cache is not ready")), 4000))
      ]);
      const worker = navigator.serviceWorker.controller || registration.active;
      if (!worker) throw new Error("No active app cache");
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => {
        channel.port1.close();
        set("diagCache", "Unavailable");
      }, 4000);
      channel.port1.onmessage = event => {
        window.clearTimeout(timeout);
        channel.port1.close();
        const version = event.data?.type === "SITE_VERSION" ? event.data.version : null;
        set("diagCache", version && version !== "unknown" ? `v${version}` : "Unavailable");
      };
      worker.postMessage({ type: "GET_SITE_VERSION" }, [channel.port2]);
    } catch (_) {
      set("diagCache", "Unavailable");
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    updateSiteVersion();
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
