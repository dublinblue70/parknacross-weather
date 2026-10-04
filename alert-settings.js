(() => {
  "use strict";

  const SETTINGS_KEY = "parknacross.alerts.settings.v1";
  const STATE_KEY = "parknacross.alerts.state.v1";
  const COOLDOWN_KEY = "parknacross.alerts.cooldowns.v1";
  const LIGHTNING_DISTANCES = new Set([0, 10, 15, 25, 40]);
  // Keep rain-start alerts aligned with the dashboard's rainActivity thresholds.
  const RAIN_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
  const RAIN_CONFIRM_WINDOW_MS = 20 * 60 * 1000;
  const RAIN_INCREMENT_EPSILON_MM = 0.05;
  const RAIN_CONFIRM_INCREMENT_MM = 0.2;
  const RAIN_CONFIRMED_RATE_MM_H = 2.5;
  const RAIN_MAX_OBSERVATION_AGE_SECONDS = 10 * 60;

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
    const settings = { ...defaults, ...readJSON(SETTINGS_KEY, {}) };
    const lightningKm = Number(settings.lightningKm || 0);
    settings.lightningKm = LIGHTNING_DISTANCES.has(lightningKm) ? lightningKm : 0;
    return settings;
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

  function statusText(settings = loadSettings()) {
    if (!settings.enabled) {
      return canNotify()
        ? "Alerts are off on this device · browser permission remains allowed"
        : permissionText();
    }
    return canNotify()
      ? "Alerts are on · choose the observations you want below"
      : permissionText();
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

  function stationDayKey(epochSeconds) {
    if (!Number.isFinite(epochSeconds)) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Dublin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date(epochSeconds * 1000));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function rainEvidence(current, previous, rate, total) {
    const epoch = usable(current.epoch)
      ? Number(current.epoch)
      : (current.received_at ? Date.parse(current.received_at) / 1000 : NaN);
    const ageSeconds = Date.now() / 1000 - epoch;
    const previousEpoch = usable(previous.epoch) ? Number(previous.epoch) : NaN;
    const chronological = !Number.isFinite(previousEpoch) || epoch >= previousEpoch;
    const fresh = Number.isFinite(epoch) && chronological && ageSeconds >= -90 && ageSeconds <= RAIN_MAX_OBSERVATION_AGE_SECONDS;
    const day = stationDayKey(epoch);
    const saved = Array.isArray(previous.rain_samples) ? previous.rain_samples : [];
    const samples = fresh && day
      ? saved.filter(sample => sample && sample.day === day && Number.isFinite(Number(sample.epoch)) &&
          Number(sample.epoch) <= epoch && epoch - Number(sample.epoch) <= RAIN_CONFIRM_WINDOW_MS / 1000)
      : [];

    if (fresh && day) {
      const last = samples[samples.length - 1];
      if (!last || Number(last.epoch) < epoch) {
        samples.push({ epoch, day, total, rate });
      } else if (Number(last.epoch) === epoch) {
        samples[samples.length - 1] = { epoch, day, total, rate };
      }
    }

    const totalSamples = samples.filter(sample => usable(sample.total));
    const increaseSince = (windowMs) => {
      const baseline = totalSamples.find(sample => epoch - Number(sample.epoch) <= windowMs / 1000);
      if (!baseline || total === null) return 0;
      return Math.max(0, total - Number(baseline.total));
    };
    const recentIncreaseMm = fresh ? increaseSince(RAIN_CONFIRM_WINDOW_MS) : 0;
    const activeIncreaseMm = fresh ? increaseSince(RAIN_ACTIVE_WINDOW_MS) : 0;
    const active = fresh && (rate > 0 || activeIncreaseMm >= RAIN_INCREMENT_EPSILON_MM);
    const confirmed = active && (
      rate >= RAIN_CONFIRMED_RATE_MM_H ||
      recentIncreaseMm >= RAIN_CONFIRM_INCREMENT_MM - 1e-6
    );

    return { epoch, day, fresh, samples, recentIncreaseMm, active, confirmed };
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
    const previousGust = usable(previous.wind_gust_kmh) ? Number(previous.wind_gust_kmh) : null;
    const previousTemp = usable(previous.temperature_c) ? Number(previous.temperature_c) : null;
    const rain = rainEvidence(current, previous, rate, total);

    if (
      settings.rainStart &&
      rain.confirmed &&
      !Boolean(previous.rain_confirmed) &&
      cooldownReady("rain-start", 3 * 60 * 60 * 1000)
    ) {
      const body = rate >= RAIN_CONFIRMED_RATE_MM_H
        ? `Confirmed rain is falling at ${rate.toFixed(1)} mm/h.`
        : `Confirmed rainfall has increased by at least ${RAIN_CONFIRM_INCREMENT_MM.toFixed(1)} mm in the last 20 minutes.`;
      await showNotification(
        "Rain starting at Parknacross",
        body,
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
      rain_daily_mm: total,
      rain_day: rain.day,
      rain_samples: rain.samples,
      rain_confirmed: rain.confirmed
    });
  }

  async function evaluateLightning(lightning) {
    const settings = loadSettings();
    const threshold = Math.min(40, Math.max(0, Number(settings.lightningKm || 0)));
    if (!settings.enabled || !canNotify() || threshold <= 0 || !lightning?.available) return;

    const reportedDistance = usable(lightning.distance_km)
      ? Number(lightning.distance_km)
      : usable(lightning.nearest_24h_km)
        ? Number(lightning.nearest_24h_km)
        : null;
    const distance = reportedDistance !== null && reportedDistance >= 0 && reportedDistance <= 40
      ? reportedDistance
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
    if (status) status.textContent = statusText(settings);

    const button = document.getElementById("alertsEnableButton");
    if (button) {
      const enabled = settings.enabled && canNotify();
      button.textContent = enabled ? "Turn off notifications" : "Enable notifications";
      button.setAttribute("aria-pressed", String(enabled));
    }
  }

  function bindUI() {
    const button = document.getElementById("alertsEnableButton");
    button?.addEventListener("click", async () => {
      if (!("Notification" in window)) {
        refreshUI();
        return;
      }
      const settings = loadSettings();
      if (settings.enabled && canNotify()) {
        settings.enabled = false;
        saveSettings(settings);
        refreshUI();
        return;
      }

      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      settings.enabled = permission === "granted";
      saveSettings(settings);
      refreshUI();
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
      const requested = Number(event.target.value || 0);
      settings.lightningKm = LIGHTNING_DISTANCES.has(requested) ? requested : 0;
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
