(() => {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  let registration = null;
  let waitingWorker = null;
  let banner = null;
  let refreshRequested = false;
  let hadController = Boolean(navigator.serviceWorker.controller);

  function isIOS() {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function showUpdateBanner(worker = registration?.waiting) {
    if (!navigator.serviceWorker.controller) return;
    waitingWorker = worker || waitingWorker || registration?.waiting || null;

    if (banner?.isConnected) return;

    const wrap = document.createElement("div");
    wrap.id = "pwaUpdateBanner";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    wrap.style.cssText = "position:fixed;left:50%;bottom:max(18px,calc(env(safe-area-inset-bottom) + 8px));transform:translateX(-50%);z-index:99999;width:min(92vw,540px);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid rgba(168,210,232,.28);border-radius:14px;background:#0d2231;color:#f2f7fa;box-shadow:0 12px 35px rgba(0,0,0,.38);font:14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif";

    const text = document.createElement("span");
    text.textContent = "A newer Parknacross Weather version is ready.";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Refresh app";
    button.style.cssText = "border:1px solid rgba(118,201,238,.45);border-radius:9px;padding:8px 12px;background:#153447;color:#fff;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap";

    button.addEventListener("click", () => {
      refreshRequested = true;
      button.disabled = true;
      button.textContent = "Updating…";

      const workerToActivate = waitingWorker || registration?.waiting;
      if (workerToActivate) {
        workerToActivate.postMessage({ type: "SKIP_WAITING" });
      } else {
        /* Fallback for iOS versions that report the update state late. */
        registration?.update().finally(() => {
          const lateWorker = registration?.waiting;
          if (lateWorker) lateWorker.postMessage({ type: "SKIP_WAITING" });
          else location.reload();
        });
      }
    });

    wrap.append(text, button);
    document.body.appendChild(wrap);
    banner = wrap;
  }

  function observeInstallingWorker(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateBanner(worker);
      }
    });
  }

  async function checkForUpdate() {
    if (!registration) return;
    try {
      await registration.update();
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration.waiting);
      }
    } catch (error) {
      console.warn("Service worker update check:", error);
    }
  }

  navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" })
    .then(reg => {
      registration = reg;

      /* Important for iPhone/PWA: catch an update that was already waiting
         before this page finished loading or resumed from the background. */
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(reg.waiting);
      }

      reg.addEventListener("updatefound", () => {
        observeInstallingWorker(reg.installing);
      });

      checkForUpdate();
      setInterval(checkForUpdate, 30 * 60 * 1000);
    })
    .catch(error => console.warn("Service worker registration:", error));

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshRequested) {
      location.reload();
      return;
    }

    /* Do not show an update banner for the first-ever service-worker install. */
    if (hadController && navigator.serviceWorker.controller) showUpdateBanner();
    hadController = Boolean(navigator.serviceWorker.controller);
  });

  navigator.serviceWorker.addEventListener("message", event => {
    if (event.data?.type === "PARKNACROSS_UPDATE_READY") {
      if (registration?.waiting) showUpdateBanner(registration.waiting);
    }
  });

  /* iOS can suspend the installed PWA for long periods. Re-check whenever it
     becomes visible again instead of waiting for the 30-minute timer. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  window.addEventListener("pageshow", checkForUpdate);
  window.addEventListener("online", checkForUpdate);
  if (isIOS()) window.addEventListener("focus", checkForUpdate);
})();
