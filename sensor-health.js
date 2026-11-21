/* Sensor health lives on the Station page. Dashboard only shows confirmed low-battery alerts.
 * This read-only module never reads or modifies notification preferences.
 */
(() => {
  const SENSOR_IDS = {
    rain: "sensorHealthRain",
    lightning: "sensorHealthLightning",
    soil: "sensorHealthSoil"
  };
  const SENSOR_NAMES = {
    rain: "Rain gauge",
    lightning: "Lightning detector",
    soil: "Garden soil"
  };
  const API_BASE = (globalThis.PARKNACROSS_API_BASE ||
    "https://parknacross-weather.dave-s-carter.workers.dev").replace(/\/$/, "");
  let inFlight = false;

  async function fetchReport(path, signal) {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store", signal
    });
    if (!response.ok) throw new Error(`Sensor health HTTP ${response.status}`);
    return response.json();
  }

  function showSensorBattery(id, report) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("ok", "warn", "bad");
    const value = report?.value;
    if ((report?.state !== "normal" && report?.state !== "low") ||
        (value !== undefined && value !== null && !Number.isFinite(Number(value)))) {
      el.textContent = "Unavailable";
      el.title = "No recent battery report from Ecowitt";
      return;
    }
    const numeric = value !== null && value !== undefined ? Number(value) : null;
    const detail = numeric !== null && report.unit === "V"
      ? ` · ${numeric.toFixed(2)} V`
      : numeric !== null && report.unit === "level" ? ` · ${numeric}/5` : "";
    el.textContent = `${report.state === "low" ? "Low battery" : "Normal"}${detail}`;
    el.classList.add(report.state === "low" ? "bad" : "ok");
    el.title = "Battery indicator reported by Ecowitt; not a separate radio-health check";
  }

  function mainBatteryLow(current) {
    // Weather freshness is not the actual battery measurement timestamp.
    // This is a cautious, current-observation-only warning, not a voltage
    // inferred from old offline dashboard storage.
    const voltage = current?.battery_v;
    const epoch = Number(current?.epoch);
    const age = Date.now() / 1000 - epoch;
    if (voltage === null || voltage === undefined || voltage === "" ||
        !Number.isFinite(Number(voltage)) ||
        !Number.isFinite(epoch) || epoch <= 0 || age < -120 || age > 900) {
      return false;
    }
    const v = Number(voltage);
    return v >= 1.5 && v < 2.7;
  }

  function showDashboardWarning(sensorReport, current) {
    const warning = document.getElementById("sensorBatteryWarning");
    const warningText = document.getElementById("sensorBatteryWarningText");
    if (!warning || !warningText) return;
    const low = [];
    if (mainBatteryLow(current)) low.push("Main weather sensor");
    for (const [key, name] of Object.entries(SENSOR_NAMES)) {
      if (sensorReport?.sensors?.[key]?.state === "low") low.push(name);
    }
    warning.hidden = low.length === 0;
    if (!low.length) return;
    warningText.textContent = low.length === 1
      ? `${low[0]} battery low.`
      : `Low batteries: ${low.join(", ")}.`;
  }

  async function refreshSensorHealth() {
    const station = !!document.getElementById("stationSensorHealth");
    const dashboard = !!document.getElementById("sensorBatteryWarning");
    if ((!station && !dashboard) || inFlight) return;
    inFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      const results = await Promise.allSettled([
        fetchReport("/sensor-health", controller.signal),
        dashboard ? fetchReport("/current", controller.signal) : Promise.resolve(null)
      ]);
      const report = results[0].status === "fulfilled" ? results[0].value : null;
      const current = results[1].status === "fulfilled" ? results[1].value : null;
      if (station) {
        for (const [key, id] of Object.entries(SENSOR_IDS)) {
          showSensorBattery(id, report?.sensors?.[key]);
        }
        const note = document.getElementById("sensorHealthNote");
        if (note) {
          note.textContent = report
            ? "Ecowitt battery reports · Unavailable means no recent battery reading."
            : "Battery reports temporarily unavailable · Weather readings are unaffected.";
        }
      }
      if (dashboard) showDashboardWarning(report, current);
    } catch (_) {
      // Keep the dashboard clear if source validation itself fails.
      if (dashboard) showDashboardWarning(null, null);
      if (station) {
        for (const id of Object.values(SENSOR_IDS)) showSensorBattery(id, null);
        const note = document.getElementById("sensorHealthNote");
        if (note) note.textContent = "Battery reports temporarily unavailable.";
      }
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
