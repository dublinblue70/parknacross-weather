(() => {
  const cfg = window.PARKNACROSS_CONFIG || {};
  const API = cfg.apiBase;
  const $ = id => document.getElementById(id);
  const set = (id, value) => { const e = $(id); if (e) e.textContent = value; };
  const n = (v, d = 1) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : "--";

  async function get(path) {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  function events(items) {
    const e = $("eventTimeline");
    if (!items.length) {
      e.innerHTML = '<div class="empty-state">No milestones available yet.</div>';
      return;
    }
    e.innerHTML = items.map(x =>
      `<article class="event-item"><time>${new Date(x.received_at).toLocaleDateString("en-IE", {timeZone:"Europe/Dublin",day:"numeric",month:"short",year:"numeric"})}</time><div><strong>${esc(x.title)}</strong><p>${esc(x.detail || "")}</p></div></article>`
    ).join("");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    set("year", new Date().getFullYear());
    get("/met/point").catch(() => {});

    // /stats is the same source used by the Dashboard for the month-to-date
    // rainfall total. Using it here prevents the Climate page drifting from
    // the Dashboard if /climate-summary is cached or updated at a different time.
    const [cR, sR, eR, dR, vR] = await Promise.allSettled([
      get("/climate-summary"),
      get("/stats"),
      get("/events"),
      get("/daily?days=3660"),
      get("/forecast-verification")
    ]);

    if (cR.status === "fulfilled") {
      const c = cR.value;
      const statsMonthRain = sR.status === "fulfilled" ? Number(sR.value?.month_rain_mm) : NaN;
      const climateMonthRain = Number(c.station_month_rain_mm);
      const stationMonthRain = Number.isFinite(statsMonthRain) ? statsMonthRain : climateMonthRain;
      const ltaMonthRain = Number(c.johnstown_lta_month_rain_mm);
      const rainPct = Number.isFinite(stationMonthRain) && Number.isFinite(ltaMonthRain) && ltaMonthRain > 0
        ? (stationMonthRain / ltaMonthRain) * 100
        : Number(c.rain_percent_of_lta_month);

      set("climateRainPct", Number.isFinite(rainPct) ? `${Math.round(rainPct)}%` : "--");
      set("climateRainText", `${n(stationMonthRain)} mm at Parknacross so far; Johnstown Castle's 1991–2020 September average is ${n(ltaMonthRain)} mm.`);
      set("climateLocalMean", `${n(c.station_month_mean_temperature_c)}°C`);
      set("climateOfficialTemp", `${n(c.johnstown_temperature_c)}°C`);

      if (Number.isFinite(Number(c.current_temperature_delta_c))) {
        const d = Number(c.current_temperature_delta_c);
        set("climateDelta", `${d >= 0 ? "+" : ""}${d.toFixed(1)}°C`);
      }
      if (c.on_this_day?.available) {
        set("onDayTitle", c.on_this_day.title);
        set("onDayText", c.on_this_day.summary);
      }
    }

    if (eR.status === "fulfilled") events(eR.value.events || []);

    if (vR.status === "fulfilled" && vR.value.comparisons?.length) {
      const v = vR.value.comparisons[0];
      set("verifyTitle", `${v.target_day}: forecast vs actual`);
      set("verifyText", `High ${n(v.forecast_high_c)}° → ${n(v.actual_high_c)}° · Low ${n(v.forecast_low_c)}° → ${n(v.actual_low_c)}° · Rain ${n(v.forecast_rain_mm)} → ${n(v.actual_rain_mm)} mm`);
    }

    if (dR.status === "fulfilled") {
      const m = new Map();
      (dR.value.days || []).forEach(x => {
        const k = x.day.slice(0, 7);
        m.set(k, (m.get(k) || 0) + (Number(x.rain_mm) || 0));
      });
      const rows = [...m].sort();
      new Chart($("climateMonthlyChart"), {
        type: "bar",
        data: {
          labels: rows.map(([k]) => new Date(k + "-15T12:00:00").toLocaleDateString("en-IE", {timeZone:"Europe/Dublin",month:"short",year:"2-digit"})),
          datasets: [{data: rows.map(x => Number(x[1].toFixed(1))), backgroundColor: "#7ca9ff", borderRadius: 6}]
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            x: {grid:{color:"transparent"}, ticks:{color:"#9fb3c1"}},
            y: {beginAtZero:true, grid:{color:"rgba(174,210,232,.09)"}, ticks:{color:"#9fb3c1"}, title:{display:true,text:"mm",color:"#9fb3c1"}}
          },
          plugins: {legend:{display:false}}
        }
      });
    }

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
})();
