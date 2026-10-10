const API_BASE = globalThis.PARKNACROSS_API_BASE || "https://parknacross-weather.dave-s-carter.workers.dev";
const $ = (id) => document.getElementById(id),
  set = (id, v) => {
    const e = $(id);
    if (e) e.textContent = v;
  };
const usable = (v) =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const n = (v, d = 1) => (usable(v) ? Number(v).toFixed(d) : "--");
const avg = (values) => {
  const a = values.filter(usable).map(Number);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
};
const maxRow = (rows, f) =>
  rows.reduce(
    (b, r) => (!usable(r[f]) ? b : !b || Number(r[f]) > Number(b[f]) ? r : b),
    null,
  );
const minRow = (rows, f) =>
  rows.reduce(
    (b, r) => (!usable(r[f]) ? b : !b || Number(r[f]) < Number(b[f]) ? r : b),
    null,
  );
const dateLabel = (day) =>
  day
    ? new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IE", {
        day: "numeric",
        month: "short",
      })
    : "--";
async function get() {
  const r = await fetch(`${API_BASE}/daily?days=3660`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function getStats() {
  const r = await fetch(`${API_BASE}/stats`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
let reportCoverage = null;
let chart = null,
  allRows = [];
function dublinYear() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Dublin",
    year: "numeric",
  }).format(new Date());
}

function render(year) {
  const rows = allRows.filter((r) =>
    String(r.day || "").startsWith(`${year}-`),
  );
  set("reportCoverageNote",window.ParknacrossReportQuality?.describe(rows,String(year),reportCoverage)||"Coverage unavailable; figures use available observations.");
  const high = maxRow(rows, "high_c"),
    low = minRow(rows, "low_c"),
    gust = maxRow(rows, "peak_gust_kmh"),
    wettest = maxRow(rows, "rain_mm");
  const rainRows = rows.filter((r) => usable(r.rain_mm));
  const missingRainDays = rows.length - rainRows.length;
  const rain = rainRows.length
    ? rainRows.reduce((s, r) => s + Number(r.rain_mm), 0)
    : null;
  const wetDays = rows.filter(
    (r) => usable(r.rain_mm) && Number(r.rain_mm) >= 0.2,
  ).length;
  const avgHigh = avg(rows.map((r) => r.high_c)),
    avgLow = avg(rows.map((r) => r.low_c));
  set("annualTitle", `${year} · Parknacross Weather`);
  set("annualRainHeading", /^\d{4}$/.test(String(year)) ? `Rainfall by month · ${year}` : "Rainfall by month");
  set(
    "annualSubtitle",
    rows.length
      ? `${year === String(dublinYear()) ? "Year-to-date" : "Annual"} report based on ${rows.length} archived day${rows.length === 1 ? "" : "s"}.`
      : "No archived days are available for this year.",
  );
  set("annualRain", usable(rain) ? `${n(rain)} mm` : "Unavailable");
  set("annualWetDays", rainRows.length
    ? `${wetDays} day${wetDays === 1 ? "" : "s"} with at least 0.2 mm of rain · ${rainRows.length}/${rows.length} archived days with rainfall data`
    : "No archived rainfall values");
  set("annualHigh", usable(high?.high_c) ? `${n(high.high_c)} °C` : "--");
  set("annualHighDate", high ? dateLabel(high.day) : "--");
  set("annualLow", usable(low?.low_c) ? `${n(low.low_c)} °C` : "--");
  set("annualLowDate", low ? dateLabel(low.day) : "--");
  set(
    "annualGust",
    usable(gust?.peak_gust_kmh) ? `${n(gust.peak_gust_kmh)} km/h` : "--",
  );
  set("annualGustDate", gust ? dateLabel(gust.day) : "--");
  set(
    "annualWettest",
    usable(wettest?.rain_mm) ? `${n(wettest.rain_mm)} mm` : "--",
  );
  set("annualWettestDate", wettest ? dateLabel(wettest.day) : "--");
  set("annualAvgHigh", usable(avgHigh) ? `${n(avgHigh)} °C` : "--");
  set("annualAvgLow", usable(avgLow) ? `${n(avgLow)} °C` : "--");
  set("annualDays", String(rows.length));
  set(
    "annualPeriod",
    rows.length
      ? `${dateLabel(rows[0].day)} to ${dateLabel(rows[rows.length - 1].day)}${missingRainDays ? ` · rainfall incomplete for ${missingRainDays} day${missingRainDays === 1 ? "" : "s"}` : ""}`
      : "--",
  );
  const story = [];
  if (usable(high?.high_c) && usable(low?.low_c))
    story.push(
      `Temperatures ranged from ${n(low.low_c)}°C to ${n(high.high_c)}°C`,
    );
  if (usable(rain)) story.push(
    `${n(rain)} mm of rain was recorded across ${wetDays} day${wetDays === 1 ? "" : "s"} with at least 0.2 mm of rain${missingRainDays ? `, based on ${rainRows.length} of ${rows.length} archived days with rainfall values` : ""}`,
  );
  if (usable(gust?.peak_gust_kmh))
    story.push(`the strongest gust reached ${n(gust.peak_gust_kmh)} km/h`);
  set(
    "annualStory",
    rows.length && story.length
      ? `${story.join(", ")}.`
      : "Annual observations are still building.",
  );
  const months = Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
  );
  const totals = months.map((m) => {
    const monthRows = rows.filter((r) => String(r.day || "").startsWith(m));
    const monthRainRows = monthRows.filter((r) => usable(r.rain_mm));
    return monthRainRows.length
      ? monthRainRows.reduce((s, r) => s + Number(r.rain_mm), 0)
      : null;
  });
  const periodType=year===String(dublinYear())?"year-to-date":"annual";
  const annualCanvas=$("annualRainChart");
  annualCanvas?.setAttribute("role","img");
  annualCanvas?.setAttribute("aria-label",`Monthly rainfall totals for ${year}. This is a ${periodType} report based on ${rows.length} archived day${rows.length===1?"":"s"}. Months without rainfall data are unavailable, not zero.${missingRainDays?` ${missingRainDays} archived day${missingRainDays===1?" has":"s have"} no rainfall value.`:""}`);
  if (!window.Chart) {
    set("annualChartStatus", "The chart library could not load. Annual figures remain available; reload to restore the rainfall chart.");
    const status = $("annualChartStatus"); if(status)status.hidden=false;
    return;
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    Chart.defaults.animation = false;
  if (chart) chart.destroy();
  chart = new Chart($("annualRainChart"), {
    type: "bar",
    data: {
      labels: months.map((m) =>
        new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-IE", {
          month: "short",
          timeZone: "UTC",
        }),
      ),
      datasets: [{ label: `Rainfall ${year} (mm)`, data: totals }],
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, grace: "10%" } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => items.length ? `${items[0].label} ${year}` : "", label: (context) => context.raw === null ? "No archived data" : `${Number(context.raw).toFixed(1)} mm` } },
        },
    },
  });
}
async function load() {
  try {
    const d = await get();
    allRows = Array.isArray(d.days) ? d.days : [];
    const years = [
      ...new Set(
        allRows
          .map((r) => String(r.day || "").slice(0, 4))
          .filter((y) => /^\d{4}$/.test(y)),
      ),
    ]
      .sort()
      .reverse();
    let selected = new URL(location.href).searchParams.get("year");
    if (!years.includes(selected)) selected = years[0] || dublinYear();
    const picker = $("yearPicker");
    picker.innerHTML = "";
    years.forEach((y) => {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      o.selected = y === selected;
      picker.append(o);
    });
    picker.addEventListener("change", () => {
      const u = new URL(location.href);
      u.searchParams.set("year", picker.value);
      history.replaceState(null, "", u);
      render(picker.value);
    });
    render(selected);
  } catch (e) {
    console.error(e);
    set("annualSubtitle", "Annual archive temporarily unavailable.");
    set("annualStory", "The annual report could not be loaded.");
  }
}
async function loadVerified() {
  try {
    const statsPromise=getStats().catch(()=>null),coveragePromise=window.ParknacrossReportQuality?.load()||Promise.resolve(null);const d=await get(), stats=null;

    allRows = Array.isArray(d.days) ? d.days : [];
    const record = stats?.records?.peak_gust;
    if (usable(record?.epoch) && usable(record?.value)) {
      const day = new Date(Number(record.epoch) * 1000).toLocaleDateString(
        "en-CA",
        { timeZone: "Europe/Dublin" },
      );
      const row = allRows.find((item) => item.day === day);
      if (row) row.peak_gust_kmh = Number(record.value) + 0.0001;
    }
    const years = [
      ...new Set(
        allRows
          .map((r) => String(r.day || "").slice(0, 4))
          .filter((y) => /^\d{4}$/.test(y)),
      ),
    ]
      .sort()
      .reverse();
    let selected = new URL(location.href).searchParams.get("year");
    if (!years.includes(selected)) selected = years[0] || dublinYear();
    const picker = $("yearPicker");
    picker.innerHTML = "";
    years.forEach((y) => {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      o.selected = y === selected;
      picker.append(o);
    });
    picker.addEventListener("change", () => {
      const u = new URL(location.href);
      u.searchParams.set("year", picker.value);
      history.replaceState(null, "", u);
      render(picker.value);
    });
    render(selected);
    coveragePromise.then(value=>{reportCoverage=value;render(picker.value);});
    statsPromise.then(value=>{const rec=value?.records?.peak_gust;if(usable(rec?.epoch)&&usable(rec?.value)){const day=new Date(Number(rec.epoch)*1000).toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"});const row=allRows.find(item=>item.day===day);if(row){row.peak_gust_kmh=Number(rec.value)+0.0001;render(picker.value);}}});
  } catch (e) {
    console.error(e);
    set("annualSubtitle", "Annual archive temporarily unavailable.");
    set("annualStory", "The annual report could not be loaded.");
  }
}
document.addEventListener("DOMContentLoaded", () => {
  set("year", dublinYear());
  loadVerified();
});
