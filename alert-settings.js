(() => {
  "use strict";

  const SETTINGS_KEY = "parknacross.alerts.settings.v1";
  const STATE_KEY = "parknacross.alerts.state.v1";
  const COOLDOWN_KEY = "parknacross.alerts.cooldowns.v1";

  const defaults = {
    enabled: false,
    rainStart: false,
    gust: false,
    frost: false,
    heavyRain: false,
    lightningKm: 0
  };

  const readJSON = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const writeJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  function loadSettings() {
    return { ...defaults, ...readJSON(SETTINGS_KEY, {}) };
  }

  function saveSettings(settings) {
    writeJSON(SETTINGS_KEY, { ...defaults, ...settings });
  }

  function canNotify() {
    return "Notification" in window && Notification.permission === "granted";
  }

  function permissionText() {
    if (!("Notification" in window)) return "Notifications are not supported by this browser.";
    if (Notification.permission === "granted") return "Notifications allowed";
    if (Notification.permission === "denied") return "Notifications blocked in browser settings";
    return "Permission not requested";
  }

  async function showNotification(title, body, tag) {
    if (!canNotify()) return false;
    const options = {
      body,
      tag,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: "./index.html" }
    };

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
      return true;
    } catch (error) {
      console.warn("Weather alert notification:", error);
      return false;
    }
  }

  function cooldownReady(key, milliseconds) {
    const map = readJSON(COOLDOWN_KEY, {});
    const last = Number(map[key] || 0);
    if (Date.now() - last < milliseconds) return false;
    map[key] = Date.now();
    writeJSON(COOLDOWN_KEY, map);
    return true;
  }

  function usable(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  async function evaluateCurrent(current) {
    const settings = loadSettings();
    if (!settings.enabled || !canNotify() || !current) return;

    const previous = readJSON(STATE_KEY, {});
    const rate = usable(current.rain_rate_mm_h) ? Number(current.rain_rate_mm_h) : 0;
    const total = usable(current.rain_daily_mm) ? Number(current.rain_daily_mm) : null;
    const gust = usable(current.wind_gust_kmh) ? Number(current.wind_gust_kmh) : null;
    const temp = usable(current.temperature_c) ? Number(current.temperature_c) : null;

    const previousRate = usable(previous.rain_rate_mm_h) ? Number(previous.rain_rate_mm_h) : 0;
    const previousTotal = usable(previous.rain_daily_mm) ? Number(previous.rain_daily_mm) : null;
    const previousGust = usable(previous.wind_gust_kmh) ? Number(previous.wind_gust_kmh) : null;
    const previousTemp = usable(previous.temperature_c) ? Number(previous.temperature_c) : null;

    const rainIncremented =
      total !== null && previousTotal !== null && total >= previousTotal + 0.05;
    const rainNow = rate > 0 || rainIncremented;
    const rainWasActive = previousRate > 0;

    if (
      settings.rainStart &&
      rainNow &&
      !rainWasActive &&
      cooldownReady("rain-start", 3 * 60 * 60 * 1000)
    ) {
      await showNotification(
        "Rain starting at Parknacross",
        rate > 0 ? `Current rain rate ${rate.toFixed(1)} mm/h.` : "The WS90 daily rain counter has started increasing.",
        "parknacross-rain-start"
      );
    }

    if (
      settings.gust &&
      gust !== null &&
      gust >= 50 &&
      (previousGust === null || previousGust < 50) &&
      cooldownReady("gust-50", 2 * 60 * 60 * 1000)
    ) {
      await showNotification(
        "Strong gust at Parknacross",
        `A gust of ${gust.toFixed(1)} km/h has been recorded.`,
        "parknacross-gust"
      );
    }

    if (
      settings.frost &&
      temp !== null &&
      temp <= 0 &&
      (previousTemp === null || previousTemp > 0) &&
      cooldownReady("frost", 6 * 60 * 60 * 1000)
    ) {
      await showNotification(
        "Freezing temperature at Parknacross",
        `Temperature is ${temp.toFixed(1)}°C.`,
        "parknacross-frost"
      );
    }

    if (
      settings.heavyRain &&
      rate >= 10 &&
      previousRate < 10 &&
      cooldownReady("heavy-rain", 60 * 60 * 1000)
    ) {
      await showNotification(
        "Heavy rain at Parknacross",
        `Rain rate has reached ${rate.toFixed(1)} mm/h.`,
        "parknacross-heavy-rain"
      );
    }

    writeJSON(STATE_KEY, {
      ...previous,
      epoch: current.epoch || null,
      temperature_c: temp,
      wind_gust_kmh: gust,
      rain_rate_mm_h: rate,
      rain_daily_mm: total
    });
  }

  async function evaluateLightning(lightning) {
    const settings = loadSettings();
    const threshold = Number(settings.lightningKm || 0);
    if (!settings.enabled || !canNotify() || threshold <= 0 || !lightning?.available) return;

    const distance = usable(lightning.distance_km)
      ? Number(lightning.distance_km)
      : usable(lightning.nearest_24h_km)
        ? Number(lightning.nearest_24h_km)
        : null;
    const strikeEpoch = usable(lightning.last_strike_epoch)
      ? Number(lightning.last_strike_epoch)
      : null;

    if (distance === null || strikeEpoch === null || distance > threshold) return;

    const state = readJSON(STATE_KEY, {});
    const previousStrike = usable(state.last_lightning_epoch) ? Number(state.last_lightning_epoch) : 0;
    if (strikeEpoch <= previousStrike) return;

    state.last_lightning_epoch = strikeEpoch;
    writeJSON(STATE_KEY, state);

    if (!cooldownReady("lightning", 15 * 60 * 1000)) return;

    await showNotification(
      "Lightning near Parknacross",
      `Lightning detected approximately ${Math.round(distance)} km away.`,
      "parknacross-lightning"
    );
  }

  function refreshUI() {
    const settings = loadSettings();
    const ids = {
      alertRainStart: settings.rainStart,
      alertGust: settings.gust,
      alertFrost: settings.frost,
      alertHeavyRain: settings.heavyRain
    };
    for (const [id, checked] of Object.entries(ids)) {
      const element = document.getElementById(id);
      if (element) element.checked = Boolean(checked);
    }
    const lightning = document.getElementById("alertLightningDistance");
    if (lightning) lightning.value = String(settings.lightningKm || 0);

    const status = document.getElementById("alertsPermission");
    if (status) status.textContent = permissionText();

    const button = document.getElementById("alertsEnableButton");
    if (button) {
      button.textContent = settings.enabled && canNotify()
        ? "Notifications enabled"
        : "Enable notifications";
    }
  }

  function bindUI() {
    const button = document.getElementById("alertsEnableButton");
    button?.addEventListener("click", async () => {
      if (!("Notification" in window)) {
        refreshUI();
        return;
      }
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      const settings = loadSettings();
      settings.enabled = permission === "granted";
      saveSettings(settings);
      refreshUI();
      const status = document.getElementById("alertsPermission");
      if (status && permission === "granted") {
        status.textContent = "Notifications allowed · choose the alerts you want below";
      }
    });

    const mapping = {
      alertRainStart: "rainStart",
      alertGust: "gust",
      alertFrost: "frost",
      alertHeavyRain: "heavyRain"
    };
    for (const [id, key] of Object.entries(mapping)) {
      document.getElementById(id)?.addEventListener("change", event => {
        const settings = loadSettings();
        settings[key] = Boolean(event.target.checked);
        saveSettings(settings);
      });
    }
    document.getElementById("alertLightningDistance")?.addEventListener("change", event => {
      const settings = loadSettings();
      settings.lightningKm = Number(event.target.value || 0);
      saveSettings(settings);
    });

    refreshUI();
  }

  window.PWAlerts = {
    loadSettings,
    saveSettings,
    evaluateCurrent,
    evaluateLightning,
    refreshUI
  };

  document.addEventListener("DOMContentLoaded", bindUI);
})();