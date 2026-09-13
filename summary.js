const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
const $ = id => document.getElementById(id);
const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const usable = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const num = (value, digits = 1) => usable(value) ? Number(value).toFixed(digits) : "--";
const TIME_ZONE = "Europe/Dublin";

function readingDate(row) {
  if (row?.received_at) {
    const d = new Date(row.received_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (usable(row?.epoch)) {
    const d = new Date(Number(row.epoch) * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function localDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = type => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function longDate(date) {
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function shortTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

function maxReading(rows, field) {
  return rows.reduce((best, row) => {
    if (!usable(row[field])) return best;
    return !best || Number(row[field]) > Number(best[field]) ? row : best;
  }, null);
}

function minReading(rows, field) {
  return rows.reduce((best, row) => {
    if (!usable(row[field])) return best;
    return !best || Number(row[field]) < Number(best[field]) ? row : best;
  }, null);
}

function average(rows, field) {
  const values = rows.map(row => Number(row[field])).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rainTotal(rows) {
  const values = rows.map(row => Number(row.rain_daily_mm)).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.max(...values);
}

function metrics(rows) {
  const high = maxReading(rows, "temperature_c");
  const low = minReading(rows, "temperature_c");
  const gust = maxReading(rows, "wind_gust_kmh");
  const uv = maxReading(rows, "uv_index");
  const solar = maxReading(rows, "solar_w_m2");
  const pressureHigh = maxReading(rows, "pressure_hpa");
  const pressureLow = minReading(rows, "pressure_hpa");

  return {
    high,
    low,
    gust,
    uv,
    solar,
    pressureHigh,
    pressureLow,
    rain: rainTotal(rows),
    avgHumidity: average(rows, "humidity"),
    avgWind: average(rows, "wind_speed_kmh"),
    avgPressure: average(rows, "pressure_hpa"),
    count: rows.length,
    latest: rows.length ? readingDate(rows[rows.length - 1]) : null
  };
}

function temperatureWord(high) {
  if (!usable(high)) return "mixed";
  const value = Number(high);
  if (value >= 23) return "warm";
  if (value >= 17) return "mild";
  if (value >= 11) return "cool";
  return "cold";
}

function rainPhrase(rain) {
  if (!usable(rain)) return "with rainfall data still building";
  const value = Number(rain);
  if (value < 0.1) return "and dry so far";
  if (value < 1) return `with just ${value.toFixed(1)} mm of rain`;
  if (value < 5) return `with ${value.toFixed(1)} mm of rain`;
  if (value < 15) return `with a fairly wet ${value.toFixed(1)} mm recorded`;
  return `with a wet ${value.toFixed(1)} mm recorded`;
}

function windPhrase(gust) {
  if (!usable(gust)) return "";
  const value = Number(gust);
  if (value < 20) return "Winds have generally been light";
  if (value < 35) return "There has been a noticeable breeze";
  if (value < 50) return "It has been breezy at times";
  if (value < 70) return "It has been windy, with some strong gusts";
  return "It has been very windy, with strong gusts";
}

function buildStory(m) {
  const high = m.high?.temperature_c;
  const low = m.low?.temperature_c;
  const gust = m.gust?.wind_gust_kmh;
  const first = `A ${temperatureWord(high)} day so far ${rainPhrase(m.rain)}.`;

  const tempSentence = usable(high) && usable(low)
    ? `Temperatures have ranged from ${Number(low).toFixed(1)}°C to ${Number(high).toFixed(1)}°C.`
    : "Temperature observations are still building.";

  const wind = windPhrase(gust);
  const windSentence = wind ? `${wind}${usable(gust) ? `, reaching ${Number(gust).toFixed(1)} km/h` : ""}.` : "";

  const uvSentence = usable(m.uv?.uv_index)
    ? `The highest UV index recorded so far is ${Number(m.uv.uv_index).toFixed(1)}.`
    : "";

  return [first, tempSentence, windSentence, uvSentence].filter(Boolean).join(" ");
}

function renderToday(m) {
  set("dayStory", buildStory(m));

  set("todayHigh", usable(m.high?.temperature_c) ? `${num(m.high.temperature_c)} °C` : "--");
  set("todayHighTime", m.high ? shortTime(readingDate(m.high)) : "--");
  set("todayLow", usable(m.low?.temperature_c) ? `${num(m.low.temperature_c)} °C` : "--");
  set("todayLowTime", m.low ? shortTime(readingDate(m.low)) : "--");
  set("todayRain", usable(m.rain) ? `${num(m.rain)} mm` : "--");
  set("todayGust", usable(m.gust?.wind_gust_kmh) ? `${num(m.gust.wind_gust_kmh)} km/h` : "--");
  set("todayGustTime", m.gust ? shortTime(readingDate(m.gust)) : "--");
  set("todayHumidity", usable(m.avgHumidity) ? `${Math.round(m.avgHumidity)}%` : "--");
  set("todayUv", usable(m.uv?.uv_index) ? num(m.uv.uv_index) : "--");
  set("todayUvTime", m.uv ? shortTime(readingDate(m.uv)) : "--");
  set("todayWind", usable(m.avgWind) ? `${num(m.avgWind)} km/h` : "--");
  set("todayPressureAvg", usable(m.avgPressure) ? `${num(m.avgPressure)} hPa` : "--");

  if (usable(m.pressureLow?.pressure_hpa) && usable(m.pressureHigh?.pressure_hpa)) {
    set("todayPressureRange", `${num(m.pressureLow.pressure_hpa)}–${num(m.pressureHigh.pressure_hpa)} hPa`);
  } else {
    set("todayPressureRange", "--");
  }

  set("todaySolar", usable(m.solar?.solar_w_m2) ? `${Math.round(Number(m.solar.solar_w_m2))} W/m²` : "--");
  set("todaySamples", m.count ? m.count.toLocaleString("en-IE") : "--");
  set("latestObservation", m.latest ? shortTime(m.latest) : "--");
}

function renderYesterday(rows, key) {
  if (!rows.length) return;
  const m = metrics(rows);
  const date = readingDate(rows[0]);
  if (date) set("yesterdayLabel", `${longDate(date)} · completed station observations.`);
  set("yesterdayHigh", usable(m.high?.temperature_c) ? `${num(m.high.temperature_c)} °C` : "--");
  set("yesterdayLow", usable(m.low?.temperature_c) ? `${num(m.low.temperature_c)} °C` : "--");
  set("yesterdayRain", usable(m.rain) ? `${num(m.rain)} mm` : "--");
  set("yesterdayGust", usable(m.gust?.wind_gust_kmh) ? `${num(m.gust.wind_gust_kmh)} km/h` : "--");
}

async function loadSummary() {
  try {
    const history = await getJSON("/history?hours=48");
    const rows = Array.isArray(history.readings) ? history.readings.filter(row => readingDate(row)) : [];
    const now = new Date();
    const todayKey = localDayKey(now);
    const grouped = new Map();

    rows.forEach(row => {
      const key = localDayKey(readingDate(row));
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    const todayRows = grouped.get(todayKey) || [];
    const olderKeys = [...grouped.keys()].filter(key => key < todayKey).sort();
    const yesterdayKey = olderKeys.at(-1);
    const yesterdayRows = yesterdayKey ? grouped.get(yesterdayKey) || [] : [];

    set("summaryTitle", `Today in Parknacross · ${longDate(now)}`);
    set("summarySubtitle", todayRows.length
      ? `Live day-so-far summary from ${todayRows.length.toLocaleString("en-IE")} stored observations.`
      : "Waiting for today's stored station observations.");

    renderToday(metrics(todayRows));
    renderYesterday(yesterdayRows, yesterdayKey);
  } catch (error) {
    console.error("Daily summary:", error);
    set("summarySubtitle", "The daily summary is temporarily unavailable.");
    set("dayStory", "Live station observations could not be loaded. Please try again shortly.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  set("year", new Date().getFullYear());
  loadSummary();
  setInterval(loadSummary, 5 * 60 * 1000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});
