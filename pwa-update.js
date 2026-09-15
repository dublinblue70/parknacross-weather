(() => {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  let hadController = Boolean(navigator.serviceWorker.controller);
  let bannerShown = false;

  function showUpdateBanner() {
    if (bannerShown) return;
    bannerShown = true;

    const wrap = document.createElement("div");
    wrap.id = "pwaUpdateBanner";
    wrap.setAttribute("role","status");
    wrap.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;width:min(92vw,520px);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid rgba(168,210,232,.28);border-radius:14px;background:#0d2231;color:#f2f7fa;box-shadow:0 12px 35px rgba(0,0,0,.38);font:14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif";
    const text = document.createElement("span");
    text.textContent = "A newer Parknacross Weather version is ready.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Refresh";
    button.style.cssText = "border:1px solid rgba(118,201,238,.45);border-radius:9px;padding:8px 12px;background:#153447;color:#fff;font:inherit;font-weight:700;cursor:pointer";
    button.addEventListener("click",()=>location.reload());
    wrap.append(text,button);
    document.body.appendChild(wrap);
  }

  navigator.serviceWorker.register("service-worker.js", {updateViaCache:"none"}).then(reg => {
    reg.update().catch(()=>{});
    setInterval(()=>reg.update().catch(()=>{}), 30*60*1000);

    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });
  }).catch(error => console.warn("Service worker update check:", error));

  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "PARKNACROSS_UPDATE_READY" && hadController) showUpdateBanner();
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) showUpdateBanner();
    hadController = true;
  });
})();