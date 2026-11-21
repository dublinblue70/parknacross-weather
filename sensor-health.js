/* Parknacross sensor batteries: read-only, independent of weather and notification preferences. */
(() => {
  const SENSOR_IDS = { rain: "sensorHealthRain", lightning: "sensorHealthLightning", soil: "sensorHealthSoil" };
  const API_BASE = (globalThis.PARKNACROSS_API_BASE || "https://parknacross-weather.dave-s-carter.workers.dev").replace(/\/$/, "");
  let inFlight = false;

  function showBattery(id, report) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("ok", "warn", "bad");
    const state = report?.state;
    const value = Number(report?.value);
    const valid = Number.isFinite(value) && report?.value !== null && report?.value !== undefined;
    if (state !== "normal" && state !== "low") {
      el.textContent = "Unavailable";
      el.title = "Ecowitt has not supplied a recent battery report";
      return;
    }
    const detail = valid && report?.unit === "V" ? ` · ${value.toFixed(2)} V`
      : valid && report?.unit === "level" ? ` · ${value}/5` : "";
    el.textContent = `${state === "low" ? "Low battery" : "Normal"}${detail}`;
    el.classList.add(state === "low" ? "bad" : "ok");
    el.title = "Battery status reported by Ecowitt; this does not independently verify sensor reception";
  }

  async function refreshSensorHealth() {
    if (inFlight || !document.getElementById("sensorHealthRain")) return;
    inFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      const response = await fetch(`${API_BASE}/sensor-health`, {
        cache: "no-store", signal: controller.signal
      });
      if (!response.ok) throw new Error(`Battery reports HTTP ${response.status}`);
      const data = await response.json();
      for (const [key, id] of Object.entries(SENSOR_IDS)) {
        showBattery(id, data?.sensors?.[key]);
      }
      const note = document.getElementById("sensorHealthNote");
      if (note) note.textContent = "Ecowitt battery reports · Unavailable means no recent reading.";
    } catch (_) {
      for (const id of Object.values(SENSOR_IDS)) showBattery(id, null);
      const note = document.getElementById("sensorHealthNote");
      if (note) note.textContent = "Battery reports unavailable · Weather readings are unaffected.";
    } finally {
      clearTimeout(timeout);
      inFlight = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshSensorHealth, { once: true });
  } else {
    refreshSensorHealth();
  }
  (globalThis.ParknacrossRefresh?.every || setInterval)(refreshSensorHealth, 5 * 60 * 1000);
  globalThis.addEventListener?.("parknacross:network-restored", refreshSensorHealth);
})();
