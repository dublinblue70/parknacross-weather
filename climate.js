(() => {
  const cfg = window.PARKNACROSS_CONFIG || {};
  const API = cfg.apiBase;
  const $ = id => document.getElementById(id);
  const set = (id, value) => { const e = $(id); if (e) e.textContent = value; };
  const usable = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  const n = (v, d = 1) => usable(v) ? Number(v).toFixed(d) : "--";

  async function get(path) {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));


  async function loadCurrentComparison() {
    const [officialR, currentR] = await Promise.allSettled([
      get("/met/johnstown"),
      get("/current")
    ]);

    const official = officialR.status === "fulfilled" && usable(officialR.value?.temperature_c)
      ? Number(officialR.value.temperature_c) : null;
    set("climateOfficialTemp", official === null ? "--" : `${official.toFixed(1)}°C`);
    const aligned = officialR.status === "fulfilled" ? await window.ParknacrossComparison?.load(officialR.value, currentR.status === "fulfilled" ? currentR.value : null, get) : null;
    if (aligned) {
      set("climateDelta", `${aligned.delta >= 0 ? "+" : ""}${aligned.delta.toFixed(1)}°C`);
      set("climateComparisonTime", `Johnstown Castle ${window.ParknacrossComparison.clock(aligned.officialEpoch)} · Parknacross ${window.ParknacrossComparison.clock(aligned.localEpoch)} Irish time. Temperature difference uses observations matched within five minutes.`);
    } else {
      set("climateDelta", "Unavailable");
      set("climateComparisonTime", "A time-matched temperature difference is unavailable. No recent local observation within five minutes of the official report could be verified.");
    }

  }

  const DUBLIN_TZ = "Europe/Dublin";
  function dublinDayKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DUBLIN_TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function frostDateLabel(day) {
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IE", {
      timeZone: DUBLIN_TZ, day: "numeric", month: "short", year: "numeric"
    });
  }
  function frostSeasonKey(day) {
    const [year, month] = day.split("-").map(Number);
    return month >= 7 ? year : year - 1;
  }
  function frostSeasonLabel(startYear) {
    return `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
  }
  function renderFrostTracker(days) {
    const validDays = (Array.isArray(days) ? days : [])
      .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row?.day || "")
        && Number(row?.temp_count) > 0
        && usable(row?.low_c))
      .map(row => ({ day: row.day, low: Number(row.low_c) }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const groups = new Map();
    for (const row of validDays) {
      const year = frostSeasonKey(row.day);
      if (!groups.has(year)) groups.set(year, { first: null, frostDays: 0, observedDays: 0 });
      const group = groups.get(year);
      group.observedDays += 1;
      if (row.low <= 0) {
        group.frostDays += 1;
        if (!group.first) group.first = row.day;
      }
    }
    if (!validDays.length) {
      set("frostCurrentDate", "No temperature lows available");
      set("frostCurrentDetail", "The archive does not currently contain usable daily minimums.");
      set("frostSeasonCount", "--");
      set("frostSeasonCoverage", "Waiting for valid archived station temperatures");
      set("frostArchiveRange", "Unavailable");
      $("frostSeasonHistory").innerHTML = '<div class="empty-state">Frost history will appear when usable temperature lows are available.</div>';
      set("frostStatus", "The temperature archive is temporarily unavailable or contains no usable daily lows.");
      return;
    }
    const today = dublinDayKey();
    const currentYear = frostSeasonKey(today);
    const current = groups.get(currentYear) || { first: null, frostDays: 0, observedDays: 0 };
    set("frostSeasonLabel", `Current frost season · ${frostSeasonLabel(currentYear)}`);
    set("frostCurrentDate", current.first ? frostDateLabel(current.first) : "No frost recorded yet");
    set("frostCurrentDetail", current.first
      ? `Earliest recorded station low at or below 0.0°C this season.`
      : "No station low at or below 0.0°C has been recorded so far this season.");
    set("frostSeasonCount", String(current.frostDays));
    set("frostSeasonCoverage", `${current.observedDays.toLocaleString("en-IE")} day${current.observedDays === 1 ? "" : "s"} with valid saved lows; gaps remain unknown`);
    set("frostArchiveRange", `${frostDateLabel(validDays[0].day)} – ${frostDateLabel(validDays[validDays.length - 1].day)}`);
    const history = [...groups.entries()].sort((a, b) => b[0] - a[0]);
    $("frostSeasonHistory").innerHTML = history.map(([year, group]) =>
      `<article class="event-item"><time>${frostSeasonLabel(year)}</time><div><strong>${group.first ? `Earliest recorded frost · ${frostDateLabel(group.first)}` : "No frost recorded in available observations"}</strong><p>${group.frostDays} frost day${group.frostDays === 1 ? "" : "s"} among ${group.observedDays.toLocaleString("en-IE")} days with valid station lows.</p></div></article>`
    ).join("");
    set("frostStatus", `Based on ${validDays.length.toLocaleString("en-IE")} archived days with usable temperature lows. A missing or unrecorded day is not treated as frost-free.`);
  }

  function solarHistoryRows(payload) {
    if (Array.isArray(payload)) return payload;
    for (const key of ["readings", "rows", "history", "data"]) {
      if (Array.isArray(payload?.[key])) return payload[key];
    }
    return [];
  }
  function solarSampleEpoch(row) {
    const value = row?.epoch ?? row?.timestamp ?? row?.recorded_at;
    if (typeof value === "string" && !/^\\d+(?:\\.\\d+)?$/.test(value)) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed / 1000 : NaN;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return NaN;
    return numeric > 1e12 ? numeric / 1000 : numeric;
  }
  function solarDateKeys() {
    const today = dublinDayKey();
    const [year, month, day] = today.split("-").map(Number);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 1, day - (6 - index), 12));
      return dublinDayKey(date);
    });
  }
  function solarDateLabel(day) {
    return new Date(day + "T12:00:00Z").toLocaleDateString("en-IE", {
      timeZone: DUBLIN_TZ, weekday: "short", day: "numeric", month: "short"
    });
  }
  function renderSolarExposure(payload) {
    const rows = solarHistoryRows(payload)
      .map(row => ({
        epoch: solarSampleEpoch(row),
        watts: Number(row?.solar_w_m2)
      }))
      .filter(row => Number.isFinite(row.epoch) && Number.isFinite(row.watts)
        && row.watts >= 0 && row.watts <= 2000)
      .sort((a, b) => a.epoch - b.epoch);
    const keys = solarDateKeys();
    const totals = new Map(keys.map(key => [key, { wh: 0, seconds: 0 }]));
    for (let index = 1; index < rows.length; index += 1) {
      const before = rows[index - 1];
      const after = rows[index];
      const seconds = after.epoch - before.epoch;
      if (seconds <= 0 || seconds > 900) continue;
      const midpoint = new Date((before.epoch + seconds / 2) * 1000);
      const key = dublinDayKey(midpoint);
      const bucket = totals.get(key);
      if (!bucket) continue;
      bucket.wh += ((before.watts + after.watts) / 2) * seconds / 3600;
      bucket.seconds += seconds;
    }
    const values = keys.map(key => totals.get(key));
    const today = values[values.length - 1];
    const weekWh = values.reduce((sum, item) => sum + item.wh, 0);
    const weekSeconds = values.reduce((sum, item) => sum + item.seconds, 0);
    set("solarTodayTotal", today.seconds ? `${(today.wh / 1000).toFixed(2)} kWh/m²` : "--");
    set("solarTodayCoverage", today.seconds
      ? `${(today.seconds / 3600).toFixed(1)} h of measured intervals today`
      : "No valid measured intervals yet today");
    set("solarWeekTotal", weekSeconds ? `${(weekWh / 1000).toFixed(2)} kWh/m²` : "--");
    set("solarWeekCoverage", weekSeconds
      ? `${(weekSeconds / 3600).toFixed(1)} h integrated across ${rows.length.toLocaleString("en-IE")} valid readings`
      : "No valid solar intervals in the available archive");
    const note = weekSeconds
      ? `Based on ${rows.length.toLocaleString("en-IE")} valid stored readings from the rolling 7-day archive. ${(weekSeconds / 3600).toFixed(1)} hours of adjacent intervals were integrated; longer gaps and dates outside the available archive are excluded.`
      : "Solar exposure is unavailable because the archive returned no valid adjacent readings.";
    set("solarExposureNote", note);
    if (window.Chart && $("solarExposureChart")) {
      if (renderSolarExposure.chart) renderSolarExposure.chart.destroy();
      renderSolarExposure.chart = new Chart($("solarExposureChart"), {
        type: "bar",
        data: {
          labels: keys.map(solarDateLabel),
          datasets: [{
            data: values.map(item => item.seconds ? Number((item.wh / 1000).toFixed(3)) : null),
            backgroundColor: "#f3bf67",
            borderRadius: 6
          }]
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: "transparent" }, ticks: { color: "#9fb3c1" } },
            y: { beginAtZero: true, grace: "10%", grid: { color: "rgba(174,210,232,.09)" }, ticks: { color: "#9fb3c1" }, title: { display: true, text: "kWh/m²", color: "#9fb3c1" } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { afterLabel: context => `${(values[context.dataIndex].seconds / 3600).toFixed(1)} h measured coverage` } }
          }
        }
      });
    }
  }
  function renderSolarUnavailable() {
    set("solarTodayTotal", "--");
    set("solarTodayCoverage", "Solar archive request failed");
    set("solarWeekTotal", "--");
    set("solarWeekCoverage", "Solar archive request failed");
    set("solarExposureNote", "The solar archive could not be reached. Please try again later.");
  }

  function events(items) {
    const e = $("eventTimeline");
    if (!items.length) {
      e.innerHTML = '<div class="empty-state">No milestones available yet.</div>';
      return;
    }
    e.innerHTML = items.map(x =>
      `<article class="event-item"><time>${new Date(x.received_at).toLocaleDateString("en-IE", {timeZone:"Europe/Dublin",day:"numeric",month:"short",year:"numeric"})}</time><div><strong>${esc(x.title==="Wet day"?"Day with at least 10 mm of rain":x.title)}</strong><p>${esc(x.detail || "")}</p></div></article>`
    ).join("");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches && window.Chart) {
      Chart.defaults.animation = false;
    }
    set("year", new Date().getFullYear());
    loadCurrentComparison();
    get("/history?hours=168").then(renderSolarExposure).catch(renderSolarUnavailable);
    (window.ParknacrossRefresh?.every || setInterval)(loadCurrentComparison, 5 * 60 * 1000);

    // /rain-summary includes the latest WS90 daily counter and is the same
    // rainfall source used by the refreshed Dashboard figures.
    const promises=[
      get("/climate-summary"),
      get("/rain-summary"),
      get("/events"),
      get("/daily?days=3660"),
      get("/stats")
    ];
    const settled=Array(5).fill({status:"pending"});
    async function renderAvailable(){const [cR,sR,eR,dR,stR]=settled;

    if (cR.status === "fulfilled") {
      const c = cR.value;
      const statsMonthRain = sR.status === "fulfilled" && usable(sR.value?.month_mm) ? Number(sR.value.month_mm) : null;
      const climateMonthRain = usable(c.station_month_rain_mm) ? Number(c.station_month_rain_mm) : null;
      const stationMonthRain = statsMonthRain !== null ? statsMonthRain : climateMonthRain;
      const ltaMonthRain = usable(c.johnstown_lta_month_rain_mm) ? Number(c.johnstown_lta_month_rain_mm) : null;
      const rainPct = stationMonthRain !== null && ltaMonthRain !== null && ltaMonthRain > 0
        ? (stationMonthRain / ltaMonthRain) * 100
        : usable(c.rain_percent_of_lta_month) ? Number(c.rain_percent_of_lta_month) : null;
      const monthName = new Intl.DateTimeFormat("en-IE", {timeZone:"Europe/Dublin",month:"long"}).format(new Date());

      set("climateRainHeading", `${monthName} rainfall`);
      set("climateRainPct", stationMonthRain !== null ? `${n(stationMonthRain)} mm` : "--");
      const archiveSince = stR.status === "fulfilled" && usable(stR.value?.first_epoch)
        ? new Date(Number(stR.value.first_epoch)*1000).toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"long",year:"numeric"})
        : null;
      set("climateRainText", ltaMonthRain !== null
        ? `At Parknacross so far this ${monthName}${rainPct !== null ? ` · ${Math.round(rainPct)}% of Johnstown Castle’s full-${monthName} average` : ""}. The 1991–2020 average for the whole month is ${n(ltaMonthRain)} mm. This compares rainfall so far with a full month, not the average expected by today.`
        : `${n(stationMonthRain)} mm at Parknacross so far. A Johnstown Castle long-term rainfall comparison is not configured for ${monthName} yet.`);
      set("climateLocalMean", `${n(c.station_month_mean_temperature_c)}°C`);
      if (c.on_this_day?.available) {
        set("onDayTitle", c.on_this_day.title);
        set("onDayText", c.on_this_day.summary);
      }
    }

    if (eR.status === "fulfilled") events(eR.value.events || []);
    else if(eR.status === "rejected")$("eventTimeline").textContent="Station milestones are temporarily unavailable.";

    if (dR.status === "fulfilled" && !renderAvailable.frostRendered) {
      renderAvailable.frostRendered = true;
      renderFrostTracker(dR.value.days || []);
    } else if (dR.status === "rejected" && !renderAvailable.frostErrorRendered) {
      renderAvailable.frostErrorRendered = true;
      set("frostCurrentDate", "Archive unavailable");
      set("frostCurrentDetail", "Saved temperature lows could not be loaded.");
      set("frostSeasonCount", "--");
      set("frostSeasonCoverage", "Archive request failed");
      set("frostArchiveRange", "Unavailable");
      $("frostSeasonHistory").innerHTML = '<div class="empty-state">Frost history is temporarily unavailable. Please try again later.</div>';
      set("frostStatus", "The Parknacross daily archive could not be reached.");
    }

    if (dR.status === "fulfilled"&&!renderAvailable.chartRendered) {
      renderAvailable.chartRendered=true;
      const m = new Map();
      (dR.value.days || []).forEach(x => {
        const k = x.day.slice(0, 7);
        if (usable(x.rain_mm)) m.set(k, (m.get(k) || 0) + Number(x.rain_mm));
      });
      const rows = [...m].sort();
      window.Chart&&new Chart($("climateMonthlyChart"), {
        type: "bar",
        data: {
          labels: rows.map(([k]) => new Date(k + "-15T12:00:00").toLocaleDateString("en-IE", {timeZone:"Europe/Dublin",month:"short",year:"2-digit"})),
          datasets: [{data: rows.map(x => Number(x[1].toFixed(1))), backgroundColor: "#7ca9ff", borderRadius: 6}]
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            x: {grid:{color:"transparent"}, ticks:{color:"#9fb3c1"}},
            y: {beginAtZero:true,grace:"10%", grid:{color:"rgba(174,210,232,.09)"}, ticks:{color:"#9fb3c1"}, title:{display:true,text:"mm",color:"#9fb3c1"}}
          },
          plugins: {legend:{display:false}}
        }
      });
    }

    }
    promises.forEach((promise,index)=>promise.then(value=>{settled[index]={status:"fulfilled",value};renderAvailable();},reason=>{settled[index]={status:"rejected",reason};renderAvailable();}));
  });
})();

