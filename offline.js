(() => {
  "use strict";

  const ID = "parknacrossOfflineBanner";

  function ensureBanner() {
    let banner = document.getElementById(ID);
    if (banner) return banner;

    banner = document.createElement("div");
    banner.id = ID;
    banner.className = "offline-banner";
    banner.hidden = true;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    document.body.prepend(banner);
    return banner;
  }

  function fmtTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-IE", {
      timeZone: "Europe/Dublin",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function setState(mode, lastObservation) {
    const banner = ensureBanner();
    if (lastObservation) banner.dataset.lastObservation = lastObservation;
    document.documentElement.classList.toggle("is-offline", mode === "offline");

    if (mode === "live") {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }

    const time = fmtTime(lastObservation);
    if (mode === "offline") {
      banner.textContent = time
        ? `Offline · showing the last saved observation from ${time}`
        : "Offline · showing the most recently saved information";
    } else {
      banner.textContent = time
        ? `Live feed unavailable · showing the last observation from ${time}`
        : "Live feed temporarily unavailable";
    }
    banner.hidden = false;
  }

  function updateNetworkState() {
    if (!navigator.onLine) setState("offline", null);
    else {
      const banner = document.getElementById(ID);
      if (banner?.dataset?.feedError !== "true") setState("live", null);
    }
  }

  window.PWOffline = {
    setLive() {
      const banner = ensureBanner();
      banner.dataset.feedError = "false";
      setState("live", null);
    },
    setOffline(lastObservation) {
      const banner = ensureBanner();
      banner.dataset.feedError = "true";
      setState(navigator.onLine ? "feed-error" : "offline", lastObservation);
    },
    refreshNetworkState: updateNetworkState
  };

  window.addEventListener("offline", () => {
    const banner = ensureBanner();
    setState("offline", banner.dataset.lastObservation || null);
  });

  window.addEventListener("online", () => {
    updateNetworkState();
  });

  document.addEventListener("DOMContentLoaded", () => {
    ensureBanner();
    updateNetworkState();
  });
})();