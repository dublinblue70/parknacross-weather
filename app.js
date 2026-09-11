const REFRESH_MS = 60 * 1000;
const HISTORY_REFRESH_MS = 5 * 60 * 1000;

const CURRENT_API_URL =
  "https://parknacross-weather.dave-s-carter.workers.dev/current";

const HISTORY_API_URL =
  "https://parknacross-weather.dave-s-carter.workers.dev/history?hours=24";

const STALE_AFTER_MS = 10 * 60 * 1000;

const el = (id) => document.getElementById(id);

let historyCache = [];
let lastHistoryFetch = 0;

function usable(value) {
  return (
    value !== undefined &&
    value !== null &&
    value !== "" &&
    !Number.isNaN(Number(value))
  );
}

function number(value, digits = 1) {
  if (!usable(value)) return "--";
  return Number(value).toFixed(digits).replace(/\.0$/, "");
}

function first(...values) {
  return values.find(
    (v) => v !== undefined && v !== null && v !== ""
  );
}

const compassDegrees = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

function directionTextFromDegrees(deg) {
  if (!usable(deg)) return "--";

  const labels = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW"
  ];

  const normalized = ((Number(deg) % 360) + 360) % 360;
  return labels[Math.round(normalized / 22.5) % 16];
}

function inferCondition(data) {
  const rainRate = Number(first(data.rainRate, 0)) || 0;
  const solar = Number(first(data.solar, 0)) || 0;
  const wind = Number(first(data.windSpeed, 0)) || 0;

  if (rainRate >= 2.5) return "Rainy at Parknacross";
  if (rainRate > 0) return "Light rain at Parknacross";
  if (wind >= 35) return "Windy on the North Wexford coast";
  if (solar >= 500) return "Bright conditions";
  if (solar >= 150) return "Some brightness";
  return "Current local conditions";
}

function parseTimestamp(data) {
  const raw = first(
    data.timestamp,
    data.received_at,
    data.updated,
    data.time
  );

  if (usable(data.epoch) && !raw) {
    const fromEpoch = new Date(Number(data.epoch) * 1000);
    if (!Number.isNaN(fromEpoch.getTime())) return fromEpoch;
  }

  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function updateStatus(timestamp, hasData) {
  const pill = el("statusPill");
  pill.className = "status-pill";

  if (!hasData) {
    pill.classList.add("delayed");
    el("statusText").textContent =
      "Station connected · awaiting readings";
    return;
  }

  const age = Date.now() - timestamp.getTime();

  if (age > STALE_AFTER_MS) {
    pill.classList.add("delayed");
    el("statusText").textContent = "Station data delayed";
  } else {
    pill.classList.add("live");
    const mins = Math.max(0, Math.round(age / 60000));

    el("statusText").textContent =
      mins < 1
        ? "LIVE · updated just now"
        : `LIVE · updated ${mins} min ago`;
  }
}

function setWind(direction, degrees) {
  const deg = usable(degrees)
    ? Number(degrees)
    : compassDegrees[String(direction || "").toUpperCase()];

  const dir = direction || directionTextFromDegrees(deg);

  el("windDirection").textContent = dir || "--";
  el("windDegrees").textContent =
    usable(deg) ? `${Math.round(deg)}°` : "";

  el("windArrow").style.transform =
    `rotate(${usable(deg) ? deg : 0}deg)`;
}

function normaliseCurrent(raw) {
  return {
    timestamp: first(
      raw.received_at,
      raw.timestamp,
      raw.updated,
      raw.time
    ),

    epoch: raw.epoch,

    temperature: first(
      raw.temperature_c,
      raw.temperature,
      raw.temp
    ),

    feelsLike: first(
      raw.feels_like_c,
      raw.feelsLike,
      raw.feels_like,
      raw.apparentTemperature
    ),

    humidity: first(
      raw.humidity,
      raw.outdoorHumidity
    ),

    dewPoint: first(
      raw.dew_point_c,
      raw.dewPoint
    ),

    pressure: first(
      raw.pressure_hpa,
      raw.pressure,
      raw.relativePressure,
      raw.pressureRelative
    ),

    windSpeed: first(
      raw.wind_speed_kmh,
      raw.windSpeed,
      raw.wind_speed
    ),

    windGust: first(
      raw.wind_gust_kmh,
      raw.windGust,
      raw.wind_gust,
      raw.gust
    ),

    windDirection: first(
      raw.windDirection,
      raw.wind_direction
    ),

    windDegrees: first(
      raw.wind_direction_deg,
      raw.windDegrees,
      raw.wind_degree,
      raw.windDirectionDegrees
    ),

    rainfall: first(
      raw.rain_daily_mm,
      raw.rainfall,
      raw.rain,
      raw.dailyRain
    ),

    rainRate: first(
      raw.rain_rate_mm_h,
      raw.rainRate,
      raw.rain_rate
    ),

    solar: first(
      raw.solar_w_m2,
      raw.solar,
      raw.solarRadiation
    ),

    uv: first(
      raw.uv_index,
      raw.uv,
      raw.uvIndex
    ),

    battery: first(
      raw.battery_v,
      raw.battery
    )
  };
}

function normaliseHistoryReading(raw) {
  let time = null;

  if (raw.received_at) {
    time = new Date(raw.received_at).getTime();
  } else if (usable(raw.epoch)) {
    time = Number(raw.epoch) * 1000;
  }

  return {
    time,
    temperature: first(raw.temperature_c, raw.temperature),
    windSpeed: first(raw.wind_speed_kmh, raw.windSpeed),
    windGust: first(raw.wind_gust_kmh, raw.windGust),
    rainfall: first(raw.rain_daily_mm, raw.rainfall),
    rainRate: first(raw.rain_rate_mm_h, raw.rainRate),
    pressure: first(raw.pressure_hpa, raw.pressure),
    humidity: raw.humidity
  };
}

function sameLocalDay(timestamp, reference = new Date()) {
  const d = new Date(timestamp);

  return (
    d.getFullYear() === reference.getFullYear() &&
    d.getMonth() === reference.getMonth() &&
    d.getDate() === reference.getDate()
  );
}

function todayStats(history) {
  const today = history.filter(
    (p) =>
      p.time &&
      !Number.isNaN(Number(p.time)) &&
      sameLocalDay(p.time)
  );

  const temperatures = today
    .map((p) => Number(p.temperature))
    .filter(Number.isFinite);

  const gusts = today
    .map((p) => Number(p.windGust))
    .filter(Number.isFinite);

  return {
    tempHigh:
      temperatures.length ? Math.max(...temperatures) : null,

    tempLow:
      temperatures.length ? Math.min(...temperatures) : null,

    maxGust:
      gusts.length ? Math.max(...gusts) : null
  };
}

function render(data) {
  const temperature = data.temperature;
  const feelsLike = data.feelsLike;
  const humidity = data.humidity;
  const pressure = data.pressure;
  const windSpeed = data.windSpeed;
  const windGust = data.windGust;
  const windDirection = data.windDirection;
  const windDegrees = data.windDegrees;
  const rainfall = data.rainfall;
  const rainRate = data.rainRate;
  const solar = data.solar;
  const uv = data.uv;

  const stats = todayStats(historyCache);

  const tempHigh = first(stats.tempHigh, temperature);
  const tempLow = first(stats.tempLow, temperature);
  const maxGust = first(stats.maxGust, windGust);

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

  const timeText = timestamp.toLocaleTimeString(
    "en-IE",
    { hour: "2-digit", minute: "2-digit" }
  );

  const dateText = timestamp.toLocaleDateString(
    "en-IE",
    { day: "2-digit", month: "short" }
  );

  el("updatedCompact").textContent =
    `Updated ${timeText}`;

  el("lastUpdated").textContent =
    `${timeText} · ${dateText}`;

  el("conditionSummary").textContent =
    inferCondition(data);

  const hasData = [
    temperature,
    humidity,
    windSpeed,
    pressure,
    rainfall,
    solar
  ].some(usable);

  updateStatus(timestamp, hasData);
  drawHistory();
}

function drawLineChart(canvasId, emptyId, history, field) {
  const canvas = el(canvasId);
  const empty = el(emptyId);

  const points = history.filter(
    (p) => p.time && usable(p[field])
  );

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

  const values = points.map(
    (p) => Number(p[field])
  );

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(159, 211, 220, .12)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y =
      pad.t +
      i * ((h - pad.t - pad.b) / 3);

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

  ctx.strokeStyle =
    field === "temperature"
      ? "#69d4d0"
      : "#a2e6dd";

  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  points.forEach((p, i) => {
    const x =
      pad.l +
      ((p.time - start) / span) *
        (w - pad.l - pad.r);

    const y =
      pad.t +
      (1 -
        (Number(p[field]) - min) /
          (max - min)) *
        (h - pad.t - pad.b);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  const fmt = (t) =>
    new Date(t).toLocaleTimeString(
      "en-IE",
      { hour: "2-digit", minute: "2-digit" }
    );

  ctx.fillStyle = "#718c98";
  ctx.fillText(fmt(start), pad.l, h - 5);

  const endLabel = fmt(end);
  const endWidth = ctx.measureText(endLabel).width;

  ctx.fillText(
    endLabel,
    w - pad.r - endWidth,
    h - 5
  );
}

function drawHistory() {
  drawLineChart(
    "temperatureChart",
    "temperatureChartEmpty",
    historyCache,
    "temperature"
  );

  drawLineChart(
    "windChart",
    "windChartEmpty",
    historyCache,
    "windSpeed"
  );
}

async function fetchCurrent() {
  const response = await fetch(
    CURRENT_API_URL,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(
      `Current weather HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return normaliseCurrent(data);
}

async function fetchHistory(force = false) {
  const now = Date.now();

  if (
    !force &&
    historyCache.length &&
    now - lastHistoryFetch < HISTORY_REFRESH_MS
  ) {
    return historyCache;
  }

  const response = await fetch(
    HISTORY_API_URL,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(
      `History HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const readings =
    Array.isArray(data.readings)
      ? data.readings
      : [];

  historyCache = readings
    .map(normaliseHistoryReading)
    .filter(
      (p) =>
        p.time &&
        !Number.isNaN(Number(p.time))
    )
    .sort(
      (a, b) => a.time - b.time
    );

  lastHistoryFetch = now;

  return historyCache;
}

async function loadWeather() {
  try {
    try {
      await fetchHistory(false);
    } catch (historyError) {
      console.warn(
        "Parknacross history error:",
        historyError
      );
    }

    const current = await fetchCurrent();
    render(current);
  } catch (error) {
    console.error(
      "Parknacross weather data error:",
      error
    );

    el("statusPill").className =
      "status-pill error";

    el("statusText").textContent =
      "Unable to load station data";

    el("conditionSummary").textContent =
      "The weather feed is temporarily unavailable";

    drawHistory();
  }
}

(async () => {
  try {
    await fetchHistory(true);
  } catch (error) {
    console.warn(
      "Initial history load failed:",
      error
    );
  }

  await loadWeather();
})();

setInterval(
  loadWeather,
  REFRESH_MS
);

window.addEventListener(
  "resize",
  drawHistory
);
