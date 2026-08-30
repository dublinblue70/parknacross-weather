const REFRESH_MS = 60 * 1000;
const STALE_AFTER_MS = 10 * 60 * 1000;
const HISTORY_KEY = "parknacrossWeatherHistoryV2";
const MAX_HISTORY_AGE_MS = 24 * 60 * 60 * 1000;

const el = (id) => document.getElementById(id);

function usable(value) {
  return value !== undefined && value !== null && value !== "" && !Number.isNaN(Number(value));
}

function number(value, digits = 1) {
  if (!usable(value)) return "--";
  return Number(value).toFixed(digits).replace(/\.0$/, "");
}

function first(...values) {
  return values.find(v => v !== undefined && v !== null && v !== "");
}

const compassDegrees = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

function directionTextFromDegrees(deg) {
  if (!usable(deg)) return "--";
  const labels = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return labels[Math.round((Number(deg) % 360) / 22.5) % 16];
}

function inferCondition(data) {
  const rainRate = Number(first(data.rainRate, data.rain_rate, 0)) || 0;
  const solar = Number(first(data.solar, data.solarRadiation, 0)) || 0;
  const wind = Number(first(data.windSpeed, data.wind_speed, 0)) || 0;

  if (rainRate >= 2.5) return "Rainy at Parknacross";
  if (rainRate > 0) return "Light rain at Parknacross";
  if (wind >= 35) return "Windy on the North Wexford coast";
  if (solar >= 500) return "Bright conditions";
  if (solar >= 150) return "Some brightness";
  return "Current local conditions";
}

function parseTimestamp(data) {
  const raw = first(data.timestamp, data.updated, data.time);
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function updateStatus(timestamp, hasData) {
  const pill = el("statusPill");
  pill.className = "status-pill";

  if (!hasData) {
    pill.classList.add("delayed");
    el("statusText").textContent = "Station connected · awaiting mapped readings";
    return;
  }

  const age = Date.now() - timestamp.getTime();
  if (age > STALE_AFTER_MS) {
    pill.classList.add("delayed");
    el("statusText").textContent = "Station data delayed";
  } else {
    pill.classList.add("live");
    const mins = Math.max(0, Math.round(age / 60000));
    el("statusText").textContent = mins < 1 ? "LIVE · updated just now" : `LIVE · updated ${mins} min ago`;
  }
}

function setWind(direction, degrees) {
  let deg = usable(degrees) ? Number(degrees) : compassDegrees[String(direction || "").toUpperCase()];
  let dir = direction || directionTextFromDegrees(deg);

  el("windDirection").textContent = dir || "--";
  el("windDegrees").textContent = usable(deg) ? `${Math.round(deg)}°` : "";
  el("windArrow").style.transform = `rotate(${usable(deg) ? deg : 0}deg)`;
}

function render(data) {
  const temperature = first(data.temperature, data.temp);
  const feelsLike = first(data.feelsLike, data.feels_like, data.apparentTemperature);
  const humidity = first(data.humidity, data.outdoorHumidity);
  const pressure = first(data.pressure, data.relativePressure, data.pressureRelative);
  const windSpeed = first(data.windSpeed, data.wind_speed);
  const windGust = first(data.windGust, data.wind_gust, data.gust);
  const windDirection = first(data.windDirection, data.wind_direction);
  const windDegrees = first(data.windDegrees, data.wind_degree, data.windDirectionDegrees);
  const rainfall = first(data.rainfall, data.rain, data.dailyRain);
  const rainRate = first(data.rainRate, data.rain_rate);
  const solar = first(data.solar, data.solarRadiation);
  const uv = first(data.uv, data.uvIndex);
  const tempHigh = first(data.tempHigh, data.highTemperature, data.dailyHigh);
  const tempLow = first(data.tempLow, data.lowTemperature, data.dailyLow);
  const maxGust = first(data.maxGust, data.dailyMaxGust, windGust);

  el("temperature").textContent = number(temperature);
  el("feelsLike").textContent = number(feelsLike);
  el("humidity").textContent = number(humidity, 0);
  el("pressure").textContent = number(pressure);
  el("windSpeed").textContent = number(windSpeed);
  el("windGust").textContent = number(windGust);
  el("gustDuplicate").textContent = number(windGust);
  el("maxGust").textContent = number(maxGust);
  el("rainfall").textContent = number(rainfall);
  el("rainRate").textContent = number(rainRate);
  el("solar").textContent = number(solar, 0);
  el("uv").textContent = number(uv);
  el("tempHigh").textContent = number(tempHigh);
  el("tempLow").textContent = number(tempLow);
  setWind(windDirection, windDegrees);

  const timestamp = parseTimestamp(data);
  const timeText = timestamp.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
  const dateText = timestamp.toLocaleDateString("en-IE", { day: "2-digit", month: "short" });
  el("updatedCompact").textContent = `Updated ${timeText}`;
  el("lastUpdated").textContent = `${timeText} · ${dateText}`;
  el("conditionSummary").textContent = inferCondition(data);

  const hasData = [temperature, humidity, windSpeed, pressure, rainfall, solar].some(usable);
  updateStatus(timestamp, hasData);

  if (hasData) {
    saveHistory({ time: timestamp.getTime(), temperature, windSpeed });
    drawHistory();
  }
}

function saveHistory(point) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (_) {}

  const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
  history = history.filter(p => p.time >= cutoff);

  const last = history[history.length - 1];
  if (!last || point.time - last.time >= 5 * 60 * 1000) {
    history.push(point);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-300)));
  }
}

function getHistory() {
  try {
    const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").filter(p => p.time >= cutoff);
  } catch (_) {
    return [];
  }
}

function drawLineChart(canvasId, emptyId, history, field) {
  const canvas = el(canvasId);
  const empty = el(emptyId);
  const points = history.filter(p => usable(p[field]));

  if (points.length < 2) {
    canvas.style.visibility = "hidden";
    empty.style.display = "grid";
    return;
  }

  canvas.style.visibility = "visible";
  empty.style.display = "none";

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = 180 * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = 180;
  const pad = { l: 34, r: 10, t: 15, b: 25 };
  const values = points.map(p => Number(p[field]));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(159, 211, 220, .12)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = pad.t + i * ((h - pad.t - pad.b) / 3);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#718c98";
  ctx.font = "11px system-ui";
  ctx.fillText(max.toFixed(0), 4, pad.t + 4);
  ctx.fillText(min.toFixed(0), 4, h - pad.b + 4);

  const start = points[0].time;
  const end = points[points.length - 1].time;
  const span = Math.max(1, end - start);

  ctx.strokeStyle = field === "temperature" ? "#69d4d0" : "#a2e6dd";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  points.forEach((p, i) => {
    const x = pad.l + ((p.time - start) / span) * (w - pad.l - pad.r);
    const y = pad.t + (1 - (Number(p[field]) - min) / (max - min)) * (h - pad.t - pad.b);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const fmt = t => new Date(t).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
  ctx.fillStyle = "#718c98";
  ctx.fillText(fmt(start), pad.l, h - 5);
  const endLabel = fmt(end);
  const endWidth = ctx.measureText(endLabel).width;
  ctx.fillText(endLabel, w - pad.r - endWidth, h - 5);
}

function drawHistory() {
  const history = getHistory();
  drawLineChart("temperatureChart", "temperatureChartEmpty", history, "temperature");
  drawLineChart("windChart", "windChartEmpty", history, "windSpeed");
}

async function loadWeather() {
  if (!window.WEATHER_API_URL) {
    el("statusPill").className = "status-pill delayed";
    el("statusText").textContent = "Live feed not configured";
    el("conditionSummary").textContent = "Add your Cloudflare Worker URL in config.js";
    drawHistory();
    return;
  }

  try {
    const response = await fetch(window.WEATHER_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    render(data);
  } catch (error) {
    console.error("Parknacross weather data error:", error);
    el("statusPill").className = "status-pill error";
    el("statusText").textContent = "Unable to load station data";
    el("conditionSummary").textContent = "The weather feed is temporarily unavailable";
  }
}

loadWeather();
setInterval(loadWeather, REFRESH_MS);
window.addEventListener("resize", drawHistory);
