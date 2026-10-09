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
    const local = currentR.status === "fulfilled" && usable(currentR.value?.temperature_c)
      ? Number(currentR.value.temperature_c) : null;

    const stamp=(data,officialFeed)=>{const raw=officialFeed?data?.report_time:(data?.received_at||(usable(data?.epoch)?Number(data.epoch)*1000:null));const date=new Date(raw||NaN);if(!Number.isFinite(date.getTime()))return "reading time unavailable";const age=(Date.now()-date.getTime())/60000;return `${date.toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}${age>(officialFeed?120:15)?" · stale reading":""}`;};
    set("climateComparisonTime",`Johnstown Castle: ${officialR.status==="fulfilled"?stamp(officialR.value,true):"unavailable"} · Parknacross: ${currentR.status==="fulfilled"?stamp(currentR.value,false):"unavailable"}. Readings may be from different times.`);
    set("climateOfficialTemp", official === null ? "--" : `${official.toFixed(1)}°C`);
    if (official !== null && local !== null) {
      const d = local - official;
      set("climateDelta", `${d >= 0 ? "+" : ""}${d.toFixed(1)}°C`);
    } else {
      set("climateDelta", "--");
    }
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
      set("climateRainPct", rainPct !== null ? `${Math.round(rainPct)}%` : "--");
      const archiveSince = stR.status === "fulfilled" && usable(stR.value?.first_epoch)
        ? new Date(Number(stR.value.first_epoch)*1000).toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"long",year:"numeric"})
        : null;
      set("climateRainText", ltaMonthRain !== null
        ? `${n(stationMonthRain)} mm at Parknacross so far this ${monthName}; Johnstown Castle's 1991–2020 ${monthName} average is ${n(ltaMonthRain)} mm. This is a partial-period comparison until the local archive covers the full month.`
        : `${n(stationMonthRain)} mm at Parknacross so far. A Johnstown Castle long-term rainfall comparison is not configured for ${monthName} yet.`);
      set("climateLocalMean", `${n(c.station_month_mean_temperature_c)}°C`);
      if (c.on_this_day?.available) {
        set("onDayTitle", c.on_this_day.title);
        set("onDayText", c.on_this_day.summary);
      }
    }

    if (eR.status === "fulfilled") events(eR.value.events || []);
    else if(eR.status === "rejected")$("eventTimeline").textContent="Station milestones are temporarily unavailable.";

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

