const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
const CURRENT_URL = `${API_BASE}/current`;
const HISTORY_24_URL = `${API_BASE}/history?hours=24`;
const HISTORY_7D_URL = `${API_BASE}/history?hours=168`;
const STATS_URL = `${API_BASE}/stats`;
const RAIN_SUMMARY_URL = `${API_BASE}/rain-summary`;
const LIGHTNING_URL = `${API_BASE}/lightning`;
const SOIL_STATUS_URL = `${API_BASE}/soil-status`;
const DAILY_RECENT_URL = `${API_BASE}/daily?days=2`;
const FORECAST_URL = `${API_BASE}/met/forecast`;
const WARNINGS_URL = `${API_BASE}/met/warnings`;
const MARINE_URL = `${API_BASE}/met/marine`;

const ARDAMINE_LAT = 52.6247;
const ARDAMINE_LON = -6.25;
const STATION_TIME_ZONE = "Europe/Dublin";
const STALE_AFTER_MS = 10 * 60 * 1000;
const OFFLINE_AFTER_MS = 30 * 60 * 1000;
const WH52_BASELINE_START_EPOCH = Date.parse("2026-09-26T00:00:00+01:00") / 1000;
const WH52_BASELINE_DAYS = 14;

const $ = id => document.getElementById(id);
const set = (id, value) => {
  const element = $(id);
  if (element) element.textContent = value;
};
const usable = value =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

const n = (value, digits = 1) =>
  usable(value) ? Number(value).toFixed(digits) : "--";

function batteryStatus(voltage) {
  if (!usable(voltage)) return "Unavailable";

  const v = Number(voltage);

  if (v >= 3.0) return `Normal · ${v.toFixed(2)} V`;
  if (v >= 2.7) return `Check · ${v.toFixed(2)} V`;
  return `Low · ${v.toFixed(2)} V`;
}

let history24 = [];
let history7d = [];
let stats = null;
let rainSummary = null;
let dailyRecent = [];
let charts = {};
let deferredInstallPrompt = null;
let latestObservationTime = null;
let latestCurrent = null;
let latestRainDetected = false;
let latestForecastToday = "";
let visitComparisonRendered = false;

const LOCAL_CACHE_PREFIX = "parknacross.dashboard.";
const localCacheKey = name => `${LOCAL_CACHE_PREFIX}${name}.v1`;

function writeLocalCache(name, value) {
  try {
    localStorage.setItem(localCacheKey(name), JSON.stringify({
      saved_at: new Date().toISOString(),
      value
    }));
  } catch (_) {}
}

function readLocalCache(name) {
  try {
    const wrapper = JSON.parse(localStorage.getItem(localCacheKey(name)) || "null");
    return wrapper && typeof wrapper === "object" ? wrapper : null;
  } catch (_) {
    return null;
  }
}

function markLiveMode() {
  window.PWOffline?.setLive?.();
}

function markOfflineMode(current) {
  const timestamp = current?.received_at ||
    (usable(current?.epoch) ? new Date(Number(current.epoch) * 1000).toISOString() : null);
  window.PWOffline?.setOffline?.(timestamp);
}

function shiftStationDateKey(dayKey, amount) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + Number(amount || 0),
    12
  )).toISOString().slice(0, 10);
}

function yesterdayKey(todayKey) {
  return shiftStationDateKey(todayKey, -1);
}

function comparisonText(currentValue, previousValue, unit, noun) {
  if (!usable(currentValue) || !usable(previousValue)) return "Yesterday comparison building";
  const delta = Number(currentValue) - Number(previousValue);
  if (Math.abs(delta) < 0.05) return `About the same as yesterday`;
  return `${Math.abs(delta).toFixed(1)} ${unit} ${delta > 0 ? "higher" : "lower"} than yesterday${noun ? ` ${noun}` : ""}`;
}

function rainComparisonText(currentValue, previousValue) {
  if (!usable(currentValue) || !usable(previousValue)) return "Yesterday comparison building";
  const delta = Number(currentValue) - Number(previousValue);
  if (Math.abs(delta) < 0.05) return "About the same rainfall as yesterday";
  return `${Math.abs(delta).toFixed(1)} mm ${delta > 0 ? "wetter" : "drier"} than yesterday`;
}

const RAIN_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const RAIN_RECENT_WINDOW_MS = 15 * 60 * 1000;
const RAIN_INCREMENT_EPSILON_MM = 0.05;
let lastObservedRainTotal = null;
let lastObservedRainDay = null;
let lastRainIncreaseTime = null;

const RAIN_CORRECTIONS_MM = window.PARKNACROSS_DATA_CORRECTIONS?.dailyRainMm || {};

function readingTime(reading) {
  if (reading?.received_at) {
    const time = new Date(reading.received_at).getTime();
    if (Number.isFinite(time)) return time;
  }
  return usable(reading?.epoch) ? Number(reading.epoch) * 1000 : null;
}

function stationDateKeyFromTime(time) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function localDateKey(reading) {
  const time = readingTime(reading);
  return time ? stationDateKeyFromTime(time) : null;
}

function stationCalendarDate(value = new Date()) {
  const key = stationDateKeyFromTime(value);
  if (!key) return new Date(value);
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function correctedDailyRain(reading) {
  const raw = Number(reading?.rain_daily_mm);
  if (!Number.isFinite(raw)) return null;
  const correction = Number(RAIN_CORRECTIONS_MM[localDateKey(reading)] || 0);
  return Math.round(Math.max(0, raw - correction) * 10) / 10;
}

function sameDay(time, reference = new Date()) {
  return stationDateKeyFromTime(time) === stationDateKeyFromTime(reference);
}

function compass(degrees) {
  if (!usable(degrees)) return "--";
  const labels = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW"
  ];
  const direction = ((Number(degrees) % 360) + 360) % 360;
  return labels[Math.round(direction / 22.5) % 16];
}

function comfort(dewPoint, humidity, temperature) {
  /*
   * Relative humidity on its own is a poor description of how outdoor air
   * feels. Cool coastal air can be 80–95% RH and still feel fresh. Prefer dew
   * point, then use air temperature to distinguish cool/fresh from muggy air.
   */
  if (usable(dewPoint)) {
    const dp = Number(dewPoint);
    const temp = usable(temperature) ? Number(temperature) : null;

    if (dp < 5) return temp !== null && temp <= 16 ? "Fresh & dry" : "Dry";
    if (dp < 10) return "Fresh";
    if (dp < 13) return temp !== null && temp <= 16 ? "Fresh" : "Comfortable";
    if (dp < 16) return "Comfortable";
    if (dp < 18) return temp !== null && temp <= 17 ? "Mild" : "Slightly muggy";
    if (dp < 20) return "Muggy";
    return "Very muggy";
  }

  /* Conservative fallback only when dew point is unavailable. */
  const rh = Number(humidity);
  const temp = usable(temperature) ? Number(temperature) : null;
  if (!Number.isFinite(rh)) return "--";
  if (temp !== null && temp <= 16 && rh <= 95) return "Fresh";
  if (rh < 35) return "Dry";
  if (rh <= 80) return "Comfortable";
  if (rh <= 90) return "Damp";
  return "Very damp";
}

function recordReading(rows, field, mode = "max") {
  const valid = rows.filter(row => usable(row[field]));
  if (!valid.length) return null;
  return valid.reduce((best, row) => {
    if (!best) return row;
    const a = Number(row[field]);
    const b = Number(best[field]);
    return mode === "min" ? (a < b ? row : best) : (a > b ? row : best);
  }, null);
}

const TEMP_OUTLIER_DELTA_C = 2.5;
const TEMP_OUTLIER_BASELINE_C = 1.0;
const TEMP_OUTLIER_WINDOW_MS = 30 * 60 * 1000;
const TEMP_OUTLIER_MIN_NEIGHBORS = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function temperatureOutlierRows(rows) {
  const ordered = rows
    .map(row => ({ row, time: readingTime(row), temp: Number(row?.temperature_c) }))
    .filter(item => Number.isFinite(item.time) && usable(item.row?.temperature_c))
    .sort((a, b) => a.time - b.time);

  const outliers = new Set();

  for (const candidate of ordered) {
    const neighbors = ordered.filter(item =>
      item !== candidate &&
      Math.abs(item.time - candidate.time) <= TEMP_OUTLIER_WINDOW_MS
    );

    if (neighbors.length < TEMP_OUTLIER_MIN_NEIGHBORS) continue;

    const baseline = median(neighbors.map(item => item.temp));
    if (!Number.isFinite(baseline)) continue;

    const agreeing = neighbors.filter(item =>
      Math.abs(item.temp - baseline) <= TEMP_OUTLIER_BASELINE_C
    ).length;
    const requiredAgreement = Math.max(2, Math.ceil(neighbors.length * 0.6));

    if (
      agreeing >= requiredAgreement &&
      Math.abs(candidate.temp - baseline) >= TEMP_OUTLIER_DELTA_C
    ) {
      outliers.add(candidate.row);
    }
  }

  return outliers;
}

function temperatureRecordReading(rows, mode = "max") {
  const outliers = temperatureOutlierRows(rows);
  return recordReading(rows.filter(row => !outliers.has(row)), "temperature_c", mode);
}

const GUST_SPIKE_MIN_KMH = 12;
const GUST_SPIKE_DELTA_KMH = 8;
const GUST_SPIKE_WINDOW_MS = 20 * 60 * 1000;
const GUST_CALM_NEIGHBOR_MAX_KMH = 7;
const GUST_SUSTAINED_WIND_MAX_KMH = 7;


function gustOutlierRows(rows) {
  const ordered = (rows || [])
    .map(row => ({
      row,
      time: readingTime(row),
      gust: Number(row?.wind_gust_kmh),
      speed: usable(row?.wind_speed_kmh) ? Number(row.wind_speed_kmh) : null
    }))
    .filter(item => Number.isFinite(item.time) && usable(item.row?.wind_gust_kmh))
    .sort((a, b) => a.time - b.time);

  const outliers = new Set();

  for (const candidate of ordered) {
    if (candidate.row?.wind_gust_excluded) {
      outliers.add(candidate.row);
      continue;
    }

    if (candidate.gust < GUST_SPIKE_MIN_KMH) continue;

    const before = ordered.filter(item =>
      item !== candidate &&
      item.time < candidate.time &&
      candidate.time - item.time <= GUST_SPIKE_WINDOW_MS
    );
    const after = ordered.filter(item =>
      item !== candidate &&
      item.time > candidate.time &&
      item.time - candidate.time <= GUST_SPIKE_WINDOW_MS
    );
    const neighbors = [...before, ...after];

    /* Do not discard a real brief gust unless calm observations exist on both
       sides of it. This deliberately favours keeping genuine weather. */
    if (!before.length || !after.length || neighbors.length < 4) continue;

    const baseline = median(neighbors.map(item => item.gust));
    if (!Number.isFinite(baseline)) continue;

    const calmNeighbors = neighbors.filter(item =>
      item.gust <= GUST_CALM_NEIGHBOR_MAX_KMH
    ).length;
    const calmAgreement = calmNeighbors >= Math.ceil(neighbors.length * 0.75);
    const sustainedWindCalm =
      candidate.speed === null || candidate.speed <= GUST_SUSTAINED_WIND_MAX_KMH;

    if (
      calmAgreement &&
      sustainedWindCalm &&
      candidate.gust - baseline >= GUST_SPIKE_DELTA_KMH &&
      candidate.gust >= Math.max(GUST_SPIKE_MIN_KMH, baseline * 2.5)
    ) {
      outliers.add(candidate.row);
    }
  }

  return outliers;
}

function gustRecordReading(rows) {
  const outliers = gustOutlierRows(rows);
  return recordReading(rows.filter(row => !outliers.has(row)), "wind_gust_kmh", "max");
}

function timeLabel(reading) {
  const time = readingTime(reading);
  if (!time) return "--";
  return new Date(time).toLocaleTimeString("en-IE", {
    timeZone: STATION_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit"
  });
}

function relativeObservationAge(time) {
  if (!Number.isFinite(Number(time))) return "Connecting…";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Number(time)) / 1000)
  );

  if (seconds < 15) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes
      ? `${hours}h ${remainingMinutes}m ago`
      : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function updateRelativeObservation() {
  if (!latestObservationTime) return;
  set("lastUpdatedRelative", relativeObservationAge(latestObservationTime));
}

function dateLabel(value) {
  if (!value) return "--";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-IE", {
    timeZone: STATION_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function closestReadingTo(targetTime, maxDeltaMs = Infinity, rows = history24) {
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(Number(targetTime))) return null;

  let best = null;
  let bestDelta = Infinity;
  for (const row of rows) {
    const time = readingTime(row);
    if (!time) continue;
    const delta = Math.abs(time - Number(targetTime));
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }

  return best && bestDelta <= maxDeltaMs ? best : null;
}

function pressureStats(currentReading = null) {
  const rows = history24.filter(row => usable(row.pressure_hpa) && readingTime(row));
  if (currentReading && usable(currentReading.pressure_hpa) && readingTime(currentReading)) {
    const currentEpoch = usable(currentReading.epoch) ? Number(currentReading.epoch) : null;
    const duplicate = rows.some(row =>
      currentEpoch !== null
        ? Number(row?.epoch) === currentEpoch
        : readingTime(row) === readingTime(currentReading)
    );
    if (!duplicate) rows.push(currentReading);
  }

  rows.sort((left, right) => readingTime(left) - readingTime(right));
  if (rows.length < 2) {
    return {
      change: null,
      trend: "--",
      change_basis_hours: null,
      trend_basis_hours: null,
      trend_change_hpa: null
    };
  }

  const latest = rows.at(-1);
  const latestTime = readingTime(latest);

  /*
   * Pressure tendency and 24-hour change are intentionally independent.
   * A pressure TREND is a short-term tendency, so use a three-hour baseline.
   * The separate "24h change" figure stays strict: if there is no observation
   * close enough to 24 hours ago, show it as unavailable rather than inventing
   * a comparison from a different period.
   */
  const threeHourBaseline = closestReadingTo(
    latestTime - 3 * 60 * 60 * 1000,
    30 * 60 * 1000,
    rows
  );
  const dayBaseline = closestReadingTo(
    latestTime - 24 * 60 * 60 * 1000,
    30 * 60 * 1000,
    rows
  );

  let trend = "--";
  let trendChange = null;
  let trendBasisHours = null;
  if (threeHourBaseline) {
    const baselineTime = readingTime(threeHourBaseline);
    trendChange = Number(latest.pressure_hpa) - Number(threeHourBaseline.pressure_hpa);
    trendBasisHours = (latestTime - baselineTime) / 3600000;
    trend = trendChange > 0.5 ? "Rising" : trendChange < -0.5 ? "Falling" : "Steady";
  }

  let change = null;
  let changeBasisHours = null;
  if (dayBaseline) {
    const baselineTime = readingTime(dayBaseline);
    change = Number(latest.pressure_hpa) - Number(dayBaseline.pressure_hpa);
    changeBasisHours = (latestTime - baselineTime) / 3600000;
  }

  return {
    change,
    trend,
    change_basis_hours: changeBasisHours,
    trend_basis_hours: trendBasisHours,
    trend_change_hpa: trendChange
  };
}

function updateTrend(id, currentValue, oldValue, unit, digits = 1) {
  const element = $(id);
  if (!element || !usable(currentValue) || !usable(oldValue)) {
    set(id, "--");
    return;
  }

  const delta = Number(currentValue) - Number(oldValue);
  const arrow = delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "→";
  const sign = delta > 0 ? "+" : "";
  element.textContent = `${arrow} ${sign}${delta.toFixed(digits)} ${unit}`;
  element.classList.remove("trend-up", "trend-down", "trend-flat");
  element.classList.add(delta > 0.05 ? "trend-up" : delta < -0.05 ? "trend-down" : "trend-flat");
}

function prevailingWind() {
  // Use exactly the same 16-sector frequency distribution and calm threshold
  // as the wind rose, so its caption and prevailing direction always agree.
  const rows = [...history24];
  if (latestCurrent && usable(latestCurrent.epoch)) {
    const epoch = Number(latestCurrent.epoch);
    const index = rows.findIndex(row => Number(row?.epoch) === epoch);
    if (index >= 0) rows[index] = latestCurrent;
    else if (!rows.length || epoch > Number(rows.at(-1)?.epoch)) rows.push(latestCurrent);
  }
  const distribution = window.ParknacrossWindRose?.distribution(rows, {hours:24});
  if (!distribution) return { deg: null, text: "--" };
  if (!distribution.directional) {
    return { deg: null, text: distribution.calm ? "Calm" : "--" };
  }
  const maxCount = Math.max(...distribution.bins);
  const index = distribution.bins.indexOf(maxCount);
  return { deg: index * 22.5, text: window.ParknacrossWindRose.labels[index] };
}

function rainActivity(current) {
  const rainRate = Number(current?.rain_rate_mm_h || 0);
  const currentTime = readingTime(current) || Date.now();
  const currentDay = stationDateKeyFromTime(currentTime);
  const currentTotal = correctedDailyRain(current);

  // Track live cumulative-rain changes between /current refreshes. This catches
  // light/intermittent WS90 piezo rain even when the instantaneous rate is 0.0.
  if (usable(currentTotal)) {
    if (lastObservedRainDay !== currentDay) {
      lastObservedRainDay = currentDay;
      lastObservedRainTotal = Number(currentTotal);
      lastRainIncreaseTime = null;
    } else if (usable(lastObservedRainTotal) && Number(currentTotal) >= Number(lastObservedRainTotal) + RAIN_INCREMENT_EPSILON_MM) {
      lastRainIncreaseTime = currentTime;
      lastObservedRainTotal = Number(currentTotal);
    } else if (!usable(lastObservedRainTotal) || Number(currentTotal) > Number(lastObservedRainTotal)) {
      lastObservedRainTotal = Number(currentTotal);
    }
  }

  // Seed/refresh the detection from archived observations. Also compare the
  // latest archived total with /current because /history is intentionally cached.
  const rows = [...history24]
    .filter(row => readingTime(row) && localDateKey(row) === currentDay && usable(correctedDailyRain(row)))
    .sort((a, b) => readingTime(a) - readingTime(b));

  let previous = null;
  for (const row of rows) {
    if (previous) {
      const previousTotal = correctedDailyRain(previous);
      const rowTotal = correctedDailyRain(row);
      if (usable(previousTotal) && usable(rowTotal) && Number(rowTotal) >= Number(previousTotal) + RAIN_INCREMENT_EPSILON_MM) {
        const increaseTime = readingTime(row);
        if (!lastRainIncreaseTime || increaseTime > lastRainIncreaseTime) lastRainIncreaseTime = increaseTime;
      }
    }
    previous = row;
  }

  const latestHistory = rows.length ? rows[rows.length - 1] : null;
  if (latestHistory && usable(currentTotal)) {
    const historyTotal = correctedDailyRain(latestHistory);
    if (usable(historyTotal) && Number(currentTotal) >= Number(historyTotal) + RAIN_INCREMENT_EPSILON_MM) {
      // The increase happened after the latest cached history sample. Treat the
      // current observation as the best available detection time.
      lastRainIncreaseTime = Math.max(lastRainIncreaseTime || 0, currentTime);
    }
  }

  if (rainRate > 0) lastRainIncreaseTime = currentTime;

  const age = lastRainIncreaseTime ? Math.max(0, currentTime - lastRainIncreaseTime) : Infinity;
  return {
    rainRate,
    isRaining: rainRate > 0 || age <= RAIN_ACTIVE_WINDOW_MS,
    rainRecently: rainRate <= 0 && age > RAIN_ACTIVE_WINDOW_MS && age <= RAIN_RECENT_WINDOW_MS,
    lastIncreaseTime: Number.isFinite(age) ? lastRainIncreaseTime : null
  };
}

function conditionInfo(current, isNight) {
  const rainState = rainActivity(current);
  const rain = rainState.rainRate;
  const wind = Number(current.wind_speed_kmh || 0);
  const solar = Number(current.solar_w_m2 || 0);
  const uv = Number(current.uv_index || 0);

  if (rain >= 2.5) {
    return { tag: "Rainy", icon: "🌧️", story: `Rain is falling at ${n(rain)} mm/h.`, className: "weather-rain", rainState };
  }
  if (rain > 0) {
    return { tag: "Light rain", icon: "🌦️", story: `Light rain is falling at ${n(rain)} mm/h.`, className: "weather-rain", rainState };
  }
  if (rainState.isRaining) {
    return { tag: "Raining", icon: "🌧️", story: "Rain has been detected within the last few minutes.", className: "weather-rain", rainState };
  }
  if (rainState.rainRecently) {
    return { tag: "Rain recently", icon: "🌦️", story: "Rain was detected recently at Parknacross.", className: "weather-rain", rainState };
  }
  if (wind >= 35) {
    return { tag: "Very windy", icon: "💨", story: `A lively Wexford breeze is blowing at ${n(wind)} km/h.`, className: "weather-windy" };
  }
  if (wind >= 20) {
    return { tag: "Breezy", icon: "🌬️", story: `Breezy conditions with wind around ${n(wind)} km/h.`, className: "weather-windy" };
  }
  if (isNight) {
    return { tag: "Night", icon: "🌙", story: "Night-time conditions at Parknacross.", className: "weather-neutral" };
  }
  if (uv >= 5 || solar >= 400) {
    return { tag: "Bright", icon: "☀️", story: "Bright conditions over Parknacross right now.", className: "weather-bright" };
  }
  if (solar >= 100) {
    return { tag: "Some brightness", icon: "⛅", story: "Some brightness breaking through at Parknacross.", className: "weather-bright" };
  }
  return { tag: "Calm", icon: "☁️", story: "Calm conditions at Parknacross.", className: "weather-neutral" };
}

/* NOAA-style sunrise/sunset calculation using the public Ardamine area centre. */
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function normalize360(value) {
  return ((value % 360) + 360) % 360;
}

function sunEvent(date, latitude, longitude, sunrise, zenith = 90.833) {
  const N = dayOfYear(date);
  const lngHour = longitude / 15;
  const t = N + ((sunrise ? 6 : 18) - lngHour) / 24;
  const M = (0.9856 * t) - 3.289;
  let L = M + 1.916 * Math.sin(M * Math.PI / 180) +
    0.020 * Math.sin(2 * M * Math.PI / 180) + 282.634;
  L = normalize360(L);

  let RA = Math.atan(0.91764 * Math.tan(L * Math.PI / 180)) * 180 / Math.PI;
  RA = normalize360(RA);
  const Lquadrant = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquadrant - RAquadrant)) / 15;

  const sinDec = 0.39782 * Math.sin(L * Math.PI / 180);
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosH =
    (Math.cos(zenith * Math.PI / 180) -
      (sinDec * Math.sin(latitude * Math.PI / 180))) /
    (cosDec * Math.cos(latitude * Math.PI / 180));

  if (cosH > 1 || cosH < -1) return null;

  let H = sunrise
    ? 360 - Math.acos(cosH) * 180 / Math.PI
    : Math.acos(cosH) * 180 / Math.PI;
  H /= 15;

  const T = H + RA - (0.06571 * t) - 6.622;
  const UT = normalize360((T - lngHour) * 15) / 15;

  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0, 0, 0
  ) + UT * 3600000);
}

function updateSunInfo(current = latestCurrent) {
  const now = new Date();
  const stationDate = stationCalendarDate(now);

  /* Official sunrise/sunset remain the values displayed in the astronomy strip. */
  const rise = sunEvent(stationDate, ARDAMINE_LAT, ARDAMINE_LON, true, 90.833);
  const setTime = sunEvent(stationDate, ARDAMINE_LAT, ARDAMINE_LON, false, 90.833);

  /*
   * Use civil twilight (Sun 6° below horizon) for the human-facing day/night
   * condition. It is normally visibly light before official sunrise and after
   * official sunset, so calling those periods "Night" is misleading.
   */
  const civilDawn = sunEvent(stationDate, ARDAMINE_LAT, ARDAMINE_LON, true, 96);
  const civilDusk = sunEvent(stationDate, ARDAMINE_LAT, ARDAMINE_LON, false, 96);

  const fmt = date => date
    ? date.toLocaleTimeString("en-IE", { timeZone: STATION_TIME_ZONE, hour: "2-digit", minute: "2-digit" })
    : "--";

  set("sunrise", fmt(rise));
  set("sunset", fmt(setTime));

  let isNight = !!(civilDawn && civilDusk && (now < civilDawn || now >= civilDusk));

  /* A genuine WS90 solar reading is an additional real-world daylight check. */
  if (usable(current?.solar_w_m2) && Number(current.solar_w_m2) >= 3) {
    isNight = false;
  }

  if (rise && setTime) {
    if (now >= rise && now < setTime) {
      const mins = Math.max(0, Math.floor((setTime - now) / 60000));
      set("daylightRemaining", `${Math.floor(mins / 60)}h ${mins % 60}m`);
    } else if (civilDawn && now >= civilDawn && now < rise) {
      set("daylightRemaining", "Dawn");
    } else if (civilDusk && now >= setTime && now < civilDusk) {
      set("daylightRemaining", "Dusk");
    } else {
      set("daylightRemaining", "Night");
    }
  }

  document.body.classList.toggle("is-night", isNight);
  return isNight;
}

function dailyRainTotals() {
  const days = new Map();
  const source = [...history7d];

  if (latestCurrent && usable(latestCurrent.epoch)) {
    const currentEpoch = Number(latestCurrent.epoch);
    const lastEpoch = source.length && usable(source.at(-1)?.epoch) ? Number(source.at(-1).epoch) : null;
    if (lastEpoch === null || currentEpoch > lastEpoch) source.push(latestCurrent);
    else if (currentEpoch === lastEpoch) source[source.length - 1] = latestCurrent;
  }

  source.forEach(reading => {
    const time = readingTime(reading);
    const correctedRain = correctedDailyRain(reading);
    if (!time || !usable(correctedRain)) return;

    const key = stationDateKeyFromTime(time);
    const rain = Number(correctedRain);
    const existing = days.get(key);
    if (!existing || rain > existing.rain) {
      days.set(key, { time, rain, key });
    }
  });

  const todayKey = stationDateKeyFromTime(new Date());
  if (!todayKey) return [];

  /*
   * Always represent the last seven CALENDAR dates. Missing archive days are
   * null gaps, never zero rain and never replaced by an older stored day.
   */
  return Array.from({ length: 7 }, (_, index) => {
    const key = shiftStationDateKey(todayKey, index - 6);
    const observed = days.get(key);
    const [year, month, day] = key.split("-").map(Number);
    const labelTime = new Date(year, month - 1, day, 12, 0, 0).getTime();
    return observed
      ? { ...observed, key }
      : { key, time: labelTime, rain: null, missing: true };
  });
}

function updateFreshness(current) {
  const time = readingTime(current);
  const pill = $("livePill");
  if (!time || !pill) return;

  const age = Date.now() - time;
  pill.classList.remove("delayed", "offline");

  if (age >= OFFLINE_AFTER_MS) {
    pill.classList.add("offline");
    set("liveText", "STATION DATA OFFLINE");
    set("cloudStatus", "Offline");
    $("cloudStatus")?.classList.add("bad");
  } else if (age >= STALE_AFTER_MS) {
    pill.classList.add("delayed");
    set("liveText", "STATION DATA DELAYED");
    set("cloudStatus", "Delayed");
    $("cloudStatus")?.classList.add("warn");
  } else {
    set("liveText", "LIVE FROM PARKNACROSS");
    set("cloudStatus", "Connected");
    $("cloudStatus")?.classList.remove("bad", "warn");
    $("cloudStatus")?.classList.add("ok");
  }
}

function updateStatsPanel() {
  if (!stats) return;

  const monthRain = usable(rainSummary?.month_mm) ? Number(rainSummary.month_mm) : stats.month_rain_mm;
  const yearRain = usable(rainSummary?.year_mm) ? Number(rainSummary.year_mm) : stats.year_rain_mm;
  const rainDays = usable(rainSummary?.month_rain_days) ? Number(rainSummary.month_rain_days) : (usable(stats.month_rain_days) ? Number(stats.month_rain_days) : null);

  set("monthRain", `${n(monthRain)} mm`);
  set("monthRainDays", rainDays === null ? "Rain days unavailable" : `${rainDays} rain day${rainDays === 1 ? "" : "s"} this month`);
  set("yearRain", `${n(yearRain)} mm`);
  set("stationSince", dateLabel(stats.first_epoch));

  if (stats.wettest_day) {
    set("wettestDay", `${n(stats.wettest_day.rain_mm)} mm`);
    set("wettestDate", dateLabel(`${stats.wettest_day.day}T12:00:00Z`));
  }

  // All-time records are authoritative only after Worker-side quality control.
  // Do not let an unvalidated live sample temporarily override a validated
  // archive record on the public dashboard.
  const records = stats.records || {};
  const high = records.high_temperature || null;
  const low = records.low_temperature || null;
  const gust = records.peak_gust || null;
  const pressure = records.high_pressure || null;

  if (high) {
    set("allHigh", `${n(high.value)} °C`);
    set("allHighDate", dateLabel(high.epoch));
  }
  if (low) {
    set("allLow", `${n(low.value)} °C`);
    set("allLowDate", dateLabel(low.epoch));
  }
  if (gust) {
    set("allGust", `${n(gust.value)} km/h`);
    set("allGustDate", dateLabel(gust.epoch));
  }
  if (pressure) {
    set("allPressure", `${n(pressure.value)} hPa`);
    set("allPressureDate", `Verified record · ${dateLabel(pressure.epoch)}`);
  } else {
    set("allPressure", "Building…");
    set("allPressureDate", "Awaiting verified sea-level reading");
  }
}

function updateWhatToWear(current, rainDetected = false) {
  const air=usable(current?.temperature_c)?Number(current.temperature_c):null;
  const feels=usable(current?.feels_like_c)?Number(current.feels_like_c):null;
  const effective=feels!==null?feels:air;
  const wind=usable(current?.wind_speed_kmh)?Number(current.wind_speed_kmh):null;
  const gust=usable(current?.wind_gust_kmh)?Number(current.wind_gust_kmh):null;
  const rain=usable(current?.rain_rate_mm_h)?Number(current.rain_rate_mm_h):null;
  const uv=usable(current?.uv_index)?Number(current.uv_index):null;
  let clothing="Waiting for the latest temperature…";
  if(effective!==null){
    if(effective>=22)clothing="Light clothing should be comfortable: a T-shirt with shorts or light trousers.";
    else if(effective>=17)clothing="Light layers should work well: a T-shirt or light top with trousers, plus a thin layer to carry.";
    else if(effective>=13)clothing="Wear a light jumper or fleece with trousers and bring a light jacket.";
    else if(effective>=9)clothing="Choose warm layers, long trousers and a medium-weight jacket.";
    else if(effective>=5)clothing="A warm coat with layered clothing is advisable.";
    else clothing="Dress for cold conditions with an insulated coat, warm layers, a hat and gloves.";
  }
  const extras=[];
  if((wind!==null&&wind>=20)||(gust!==null&&gust>=30))extras.push("add a windproof outer layer");
  if(rainDetected||(rain!==null&&rain>0))extras.push(`take a waterproof jacket${wind!==null&&wind<20?" or umbrella":""}`);
  if(uv!==null&&uv>=3)extras.push("use sun protection if you will be outside for long");
  if(!extras.length)extras.push("No additional wind, rain or UV protection is indicated by the latest reading");
  set("wearClothing",clothing);
  const extrasText=extras.join("; ");
  set("wearExtras",`${extrasText.charAt(0).toUpperCase()}${extrasText.slice(1)}.`);
  const details=[];
  if(air!==null)details.push(`${n(air)}°C`);
  if(feels!==null&&air!==null&&Math.abs(feels-air)>=.2)details.push(`feels like ${n(feels)}°C`);
  if(wind!==null)details.push(`wind ${n(wind)} km/h`);
  if(gust!==null)details.push(`gusts ${n(gust)} km/h`);
  set("wearContext",details.length?`Based on ${details.join(", ")} at Parknacross.`:"Recommendations will update when the latest observation is available.");
  const forecastNote=$("wearForecast");
  if(forecastNote){
    const text=String(latestForecastToday||"");
    const wet=/\brain\b|drizzl|shower|thunder|hail/i.test(text);
    const windy=/\bwindy\b|\bgust|strong wind|fresh wind|gale/i.test(text);
    const notes=[];
    if(wet)notes.push("rain or showers are mentioned, so consider taking a waterproof");
    if(windy)notes.push("stronger winds are mentioned, so a windproof layer may be useful");
    forecastNote.hidden=!notes.length;
    forecastNote.textContent=notes.length?`Later today · Official Leinster forecast: ${notes.join("; ")}.`:"";
  }
}

function updateSoilPanel(current) {
  const panel = $("soilPanel");
  if (!panel) return;
  const moisture = usable(current?.soil_moisture_pct) ? Number(current.soil_moisture_pct) : null;
  const temperature = usable(current?.soil_temperature_c) ? Number(current.soil_temperature_c) : null;
  const ec = usable(current?.soil_ec_us_cm) ? Number(current.soil_ec_us_cm) : null;
  if (moisture === null && temperature === null && ec === null) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const nowEpoch = usable(current?.epoch) ? Number(current.epoch) : Date.now() / 1000;
  const baselineDay=Math.max(1,Math.floor((nowEpoch-WH52_BASELINE_START_EPOCH)/86400)+1),baselineBuilding=baselineDay<=WH52_BASELINE_DAYS;
  const baselineBadge=$("soilBaselineBadge"),baselineNote=$("soilBaselineNote");
  if(baselineBadge){baselineBadge.hidden=!baselineBuilding;baselineBadge.textContent=baselineBuilding?`Early data · day ${baselineDay} of ${WH52_BASELINE_DAYS}`:"";}
  if(baselineNote){baselineNote.hidden=!baselineBuilding;baselineNote.textContent=baselineBuilding?"The WH52 is still building its local baseline. Trend descriptions and event detection are provisional during this period.":"";}
  set("soilMoisture", moisture === null ? "Unavailable" : `${moisture.toFixed(0)}%`);
  set("soilTemperature", temperature === null ? "Unavailable" : `${temperature.toFixed(1)}°C`);
  set("soilEc", ec === null ? "Unavailable" : `${Math.round(ec).toLocaleString("en-IE")} µS/cm`);

  const candidates = history24
    .filter(row => usable(row?.soil_moisture_pct) && usable(row?.epoch))
    .sort((a, b) => Number(a.epoch) - Number(b.epoch));
  const baseline = candidates
    .filter(row => Number(row.epoch) <= nowEpoch - 2 * 3600)
    .sort((a, b) => Math.abs(Number(a.epoch) - (nowEpoch - 6 * 3600)) - Math.abs(Number(b.epoch) - (nowEpoch - 6 * 3600)))[0];
  if (moisture !== null && baseline) {
    const change = moisture - Number(baseline.soil_moisture_pct);
    const direction = change >= 2 ? "Wetter" : change <= -2 ? "Drying" : "Steady";
    set("soilMoistureTrend", `${direction} · ${change > 0 ? "+" : ""}${change.toFixed(0)} points since earlier`);
  } else {
    set("soilMoistureTrend", "Trend building from saved readings");
  }
  let eventText = "No distinct watering or rain response is identifiable yet.";
  for (let i = candidates.length - 1; i > 0; i--) {
    const newer=candidates[i],older=candidates[i-1],minutes=(Number(newer.epoch)-Number(older.epoch))/60;
    const rise=Number(newer.soil_moisture_pct)-Number(older.soil_moisture_pct);
    if(minutes>0&&minutes<=90&&rise>=3){
      const rainResponse=usable(newer.rain_rate_mm_h)&&Number(newer.rain_rate_mm_h)>0 || usable(newer.rain_daily_mm)&&usable(older.rain_daily_mm)&&Number(newer.rain_daily_mm)>Number(older.rain_daily_mm);
      eventText=`${rainResponse?"Rain response":"Possible watering response"}: moisture rose ${rise.toFixed(0)} points over ${Math.round(minutes)} minutes.`;
      break;
    }
  }
  if(candidates.length<3)eventText="Trend building—more saved WH52 readings are needed to identify watering or rain responses.";
  set("soilEvent",eventText);
  const channel = usable(current?.soil_channel) ? ` · WH52 channel ${Number(current.soil_channel)}` : "";
  set("soilSummary", `Live root-zone observation${channel}. Open Graphs to see how moisture, temperature and conductivity change over time.`);
}

function stationDayKey(epoch){return new Date(Number(epoch)*1000).toLocaleDateString("en-CA",{timeZone:STATION_TIME_ZONE});}
function renderSinceLastVisit(current){
  if(visitComparisonRendered||!usable(current?.epoch))return;visitComparisonRendered=true;
  const key="parknacross.lastVisitSnapshot.v1";let previous=null;try{previous=JSON.parse(localStorage.getItem(key)||"null");}catch(_){}
  const snapshot={epoch:Number(current.epoch),temperature_c:current.temperature_c,pressure_hpa:current.pressure_hpa,rain_daily_mm:current.rain_daily_mm,soil_moisture_pct:current.soil_moisture_pct,lightning_strikes:current.lightning_strikes};
  try{localStorage.setItem(key,JSON.stringify(snapshot));}catch(_){}
  if(!previous||!usable(previous.epoch)||snapshot.epoch-Number(previous.epoch)<5*60)return;
  const changes=[];
  const delta=(field,threshold,digits,unit,label)=>{if(!usable(snapshot[field])||!usable(previous[field]))return;const d=Number(snapshot[field])-Number(previous[field]);if(Math.abs(d)<threshold)changes.push(`${label} stayed steady`);else changes.push(`${label} ${d>0?"rose":"fell"} ${Math.abs(d).toFixed(digits)}${unit}`);};
  delta("temperature_c",.3,1,"°C","temperature");delta("pressure_hpa",.5,1," hPa","pressure");
  if(stationDayKey(snapshot.epoch)===stationDayKey(previous.epoch)){const rain=Math.max(0,Number(snapshot.rain_daily_mm||0)-Number(previous.rain_daily_mm||0));changes.push(rain>=.1?`${rain.toFixed(1)} mm of rain was recorded`:"no additional rain was recorded");delta("soil_moisture_pct",1,0," points","soil moisture");}
  if(!changes.length)return;const panel=$("sinceVisitPanel");if(panel)panel.hidden=false;set("sinceVisitText",`${changes.slice(0,4).join("; ")}. Compared with your visit ${lightningRelative(previous.epoch)}.`);
}

async function refreshSoilFreshness(){
  try{const data=await getJSON(SOIL_STATUS_URL,"no-store");if(!data?.wh52_detected||!usable(data.received_epoch)){set("soilFreshness","No recent WH52 upload detected");return;}set("soilFreshness",`Sensor upload received ${lightningRelative(data.received_epoch)} · channel ${data.channel||"--"}`);}catch(_){set("soilFreshness","Sensor freshness temporarily unavailable");}
}

function updateDashboard(current) {
  const now = new Date();
  const today = history24.filter(reading => {
    const time = readingTime(reading);
    return time && sameDay(time, now);
  });

  const currentTime = readingTime(current);
  const currentIsToday = currentTime && sameDay(currentTime, now);
  const temperatureRows = [...today];

  if (currentIsToday) {
    const currentEpoch = usable(current?.epoch) ? Number(current.epoch) : null;
    const duplicate = temperatureRows.some(row =>
      currentEpoch !== null
        ? Number(row?.epoch) === currentEpoch
        : readingTime(row) === currentTime
    );
    if (!duplicate) temperatureRows.push(current);
  }

  const highReading = temperatureRecordReading(temperatureRows, "max");
  const lowReading = temperatureRecordReading(temperatureRows, "min");

  const gustRows = [...today];
  if (currentIsToday) {
    const currentEpoch = usable(current?.epoch) ? Number(current.epoch) : null;
    const duplicate = gustRows.some(row =>
      currentEpoch !== null
        ? Number(row?.epoch) === currentEpoch
        : readingTime(row) === currentTime
    );
    if (!duplicate) gustRows.push(current);
  }
  const gustReading = gustRecordReading(gustRows);
  const gustOutliers = gustOutlierRows(gustRows);
  const hasRawGustHistory = gustRows.some(row => usable(row?.wind_gust_kmh));
  const solarReading = recordReading(today, "solar_w_m2", "max");

  /*
   * At a Glance should use the Worker's compact today-only daily summary as
   * the authoritative source. This avoids stale rolling-history extrema and
   * keeps Dashboard, Daily Summary and Archive figures aligned.
   */
  const todayKey = stationDateKeyFromTime(now);
  const dailyToday = dailyRecent.find(row => row?.day === todayKey) || null;
  const extrema = (dailyValue, historyValue, currentValue, mode) => {
    const candidates = [dailyValue, historyValue, currentIsToday ? currentValue : null]
      .filter(usable)
      .map(Number);
    if (!candidates.length) return null;
    return mode === "min" ? Math.min(...candidates) : Math.max(...candidates);
  };

  /*
   * Prefer the validated raw observations for today's temperature extrema.
   * The daily summary is only a fallback if today's history is unavailable.
   * This prevents a previously stored bad daily maximum from overriding the
   * corrected observation stream.
   */
  const todayHigh = usable(highReading?.temperature_c)
    ? Number(highReading.temperature_c)
    : usable(dailyToday?.high_c) ? Number(dailyToday.high_c) : null;
  const todayLow = usable(lowReading?.temperature_c)
    ? Number(lowReading.temperature_c)
    : usable(dailyToday?.low_c) ? Number(dailyToday.low_c) : null;
  /*
   * Peak gust uses quality-checked raw observations. Known bad readings and
   * strongly isolated ultrasonic spikes surrounded by calm samples are kept
   * in the raw archive but excluded from derived peak-gust statistics.
   */
  const peakGustReading = gustReading;
  const peakGust = peakGustReading && usable(peakGustReading.wind_gust_kmh)
    ? Number(peakGustReading.wind_gust_kmh)
    : !hasRawGustHistory && usable(dailyToday?.peak_gust_kmh)
      ? Number(dailyToday.peak_gust_kmh)
      : null;
  const solarPeak = extrema(dailyToday?.solar_peak_w_m2, solarReading?.solar_w_m2, current.solar_w_m2, "max");
  const todayHighReading = highReading && usable(todayHigh) && Math.abs(Number(highReading.temperature_c) - todayHigh) < 0.05 ? highReading : null;
  const todayLowReading = lowReading && usable(todayLow) && Math.abs(Number(lowReading.temperature_c) - todayLow) < 0.05 ? lowReading : null;
  const pressure = pressureStats(current);
  const direction = compass(current.wind_direction_deg);
  const rainToday = usable(rainSummary?.today_mm) ? Number(rainSummary.today_mm) : correctedDailyRain(current);
  const isNight = updateSunInfo(current);
  const condition = conditionInfo(current, isNight);
  latestRainDetected=Boolean(condition.rainState?.isRaining);
  updateWhatToWear(current, latestRainDetected);
  updateSoilPanel(current);

  if (currentTime) {
    latestObservationTime = currentTime;
    const date = new Date(currentTime);

    set("lastUpdatedRelative", relativeObservationAge(currentTime));

    set(
      "lastUpdated",
      `Updated ${date.toLocaleTimeString("en-IE", {
        timeZone: STATION_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit"
      })} · ${date.toLocaleDateString("en-IE", {
        timeZone: STATION_TIME_ZONE,
        day: "2-digit",
        month: "short"
      })}`
    );
  } else {
    set("lastUpdatedRelative", "Unavailable");
    set("lastUpdated", "No observation timestamp");
  }

  set("heroTemp", n(current.temperature_c));
  set("heroFeels", `${n(current.feels_like_c)}°C`);
  set("heroHumidity", `${n(current.humidity, 0)}%`);
  set("heroDew", `${n(current.dew_point_c)}°C`);
  set("heroWind", `${n(current.wind_speed_kmh)} km/h`);
  set("heroRain", `${n(rainToday)} mm`);
  set("heroPressure", `${n(current.pressure_hpa)} hPa`);
  set("heroTrend", pressure.trend === "--" ? "--" : `${pressure.trend} pressure`);
  set("weatherStory", condition.story);
  set("conditionsTag", condition.tag);
  /*
   * The visual weather icon is supplied by CSS via .weather-orb::before.
   * Do not inject an emoji here as well; on mobile that created two icons.
   */
  set("weatherIcon", "");

  document.body.classList.remove(
    "weather-neutral",
    "weather-rain",
    "weather-bright",
    "weather-windy"
  );
  document.body.classList.add(condition.className);

  set("todayLow", n(todayLow));
  set("todayHigh", n(todayHigh));
  set("peakGust", n(peakGust));
  if (peakGustReading) {
    const gustTime = readingTime(peakGustReading);
    const qualityNote = gustOutliers.size
      ? ` · ${gustOutliers.size} suspect spike${gustOutliers.size === 1 ? "" : "s"} excluded`
      : "";
    set(
      "peakGustTime",
      gustTime
        ? `Recorded at ${new Date(gustTime).toLocaleTimeString("en-IE", {
            timeZone: STATION_TIME_ZONE,
            hour: "2-digit",
            minute: "2-digit"
          })}${qualityNote}`
        : `Since local midnight${qualityNote}`
    );
  } else {
    set(
      "peakGustTime",
      gustOutliers.size
        ? `${gustOutliers.size} suspect spike${gustOutliers.size === 1 ? "" : "s"} excluded`
        : usable(peakGust) ? "Since local midnight" : "Awaiting observations"
    );
  }
  set("summaryRain", n(rainToday));
  set("solarPeak", n(solarPeak, 0));

  const priorDay = dailyRecent.find(row => row?.day === yesterdayKey(todayKey)) || null;
  set(
    "todayTempCompare",
    usable(todayHigh) && usable(priorDay?.high_c)
      ? comparisonText(todayHigh, priorDay.high_c, "°C", "")
      : "Yesterday comparison building"
  );
  set(
    "todayRainCompare",
    usable(rainToday) && usable(priorDay?.rain_mm)
      ? rainComparisonText(rainToday, priorDay.rain_mm)
      : "Yesterday comparison building"
  );

  set("tempVal", n(current.temperature_c));
  set("feelsVal", `${n(current.feels_like_c)}°C`);
  set("tempMin", n(todayLow));
  set("tempMax", n(todayHigh));
  set("humVal", n(current.humidity, 0));
  set("dewVal", `${n(current.dew_point_c)}°C`);
  set("comfortVal", comfort(current.dew_point_c, current.humidity, current.temperature_c));
  set("windVal", n(current.wind_speed_kmh));
  set("gustVal", `${n(current.wind_gust_kmh)} km/h`);
  set(
    "dirVal",
    usable(current.wind_direction_deg)
      ? `${direction} (${Math.round(Number(current.wind_direction_deg))}°)`
      : direction
  );
  set("rainVal", n(rainToday));
  set(
    "rainRateVal",
    condition.rainState?.isRaining && Number(current.rain_rate_mm_h || 0) <= 0
      ? `${n(current.rain_rate_mm_h)} mm/h · rain detected`
      : `${n(current.rain_rate_mm_h)} mm/h`
  );
  set("pressureVal", n(current.pressure_hpa));
  set("pressureTrend", pressure.trend);
  set(
    "pressureChange",
    usable(pressure.change)
      ? `${pressure.change >= 0 ? "+" : ""}${n(pressure.change)} hPa`
      : "--"
  );
  set("solarVal", n(current.solar_w_m2, 0));
  set("uvVal", n(current.uv_index, 0));
  set("battery", batteryStatus(current.battery_v));
  const batteryElement = $("battery");
  if (batteryElement) {
    batteryElement.classList.remove("ok", "warn", "bad");
    if (usable(current.battery_v)) {
      const batteryV = Number(current.battery_v);
      batteryElement.classList.add(
        batteryV >= 3.0 ? "ok" : batteryV >= 2.7 ? "warn" : "bad"
      );
    }
  }

  const threeHourTarget = currentTime
    ? currentTime - 3 * 60 * 60 * 1000
    : null;
  const threeHoursAgo = threeHourTarget === null
    ? null
    : closestReadingTo(threeHourTarget, 20 * 60 * 1000);
  updateTrend("temp3h", current.temperature_c, threeHoursAgo?.temperature_c, "°C");
  updateTrend("pressure3h", current.pressure_hpa, threeHoursAgo?.pressure_hpa, "hPa");

  const prevailing = prevailingWind();
  set("prevailing", prevailing.text);
  if (usable(prevailing.deg) && $("needle")) {
    $("needle").style.transform = `rotate(${prevailing.deg}deg)`;
  }
  set(
    "currentDirection",
    usable(current.wind_direction_deg)
      ? `${direction} · ${Math.round(Number(current.wind_direction_deg))}°`
      : direction
  );
  set("currentWind", `${n(current.wind_speed_kmh)} km/h`);
  set("currentGust", `${n(current.wind_gust_kmh)} km/h`);

  set("recordHigh", `${n(todayHigh)} °C`);
  set("recordHighTime", todayHighReading ? `at ${timeLabel(todayHighReading)}` : "--");
  set("recordLow", `${n(todayLow)} °C`);
  set("recordLowTime", todayLowReading ? `at ${timeLabel(todayLowReading)}` : "--");
  set("recordGust", `${n(peakGust)} km/h`);
  set("recordGustTime", peakGustReading ? `at ${timeLabel(peakGustReading)}` : "--");
  set("recordRain", `${n(rainToday)} mm`);

  updateFreshness(current);
  updateStatsPanel();
  renderSinceLastVisit(current);
  set("year", stationDateKeyFromTime(new Date())?.slice(0,4) || new Date().getFullYear());
}

function roundedRect(ctx,x,y,w,h,r){const q=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath();ctx.fill();}
async function weatherCardSkyImage(){
  const source=$("todaySkyMedia")?.querySelector("img")?.src;if(!source)return null;
  try{const response=await fetch(source,{cache:"no-store"});if(!response.ok)throw new Error();return await createImageBitmap(await response.blob());}catch(_){return null;}
}
function downloadWeatherCard(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function createWeatherCard(){
  const button=$("shareTodayButton");if(!latestCurrent){set("shareTodayStatus","Current conditions are not available yet.");return;}
  if(button){button.disabled=true;button.textContent="Creating…";}set("shareTodayStatus","Preparing your weather card…");
  try{
    const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=630;const ctx=canvas.getContext("2d",{alpha:false});
    const sky=await weatherCardSkyImage();
    if(sky){const scale=Math.max(canvas.width/sky.width,canvas.height/sky.height),w=sky.width*scale,h=sky.height*scale;ctx.drawImage(sky,(canvas.width-w)/2,(canvas.height-h)/2,w,h);sky.close?.();const shade=ctx.createLinearGradient(0,0,700,0);shade.addColorStop(0,"rgba(4,15,25,.94)");shade.addColorStop(.72,"rgba(4,15,25,.62)");shade.addColorStop(1,"rgba(4,15,25,.30)");ctx.fillStyle=shade;ctx.fillRect(0,0,canvas.width,canvas.height);}else{const bg=ctx.createLinearGradient(0,0,1200,630);bg.addColorStop(0,"#07131f");bg.addColorStop(.55,"#123149");bg.addColorStop(1,"#17617b");ctx.fillStyle=bg;ctx.fillRect(0,0,1200,630);}
    ctx.fillStyle="#8fe4ff";ctx.font="700 24px system-ui";ctx.letterSpacing="3px";ctx.fillText("PARKNACROSS WEATHER",64,70);ctx.letterSpacing="0px";
    ctx.fillStyle="#f4f8fb";ctx.font="800 74px system-ui";ctx.fillText(`${n(latestCurrent.temperature_c)}°C`,64,178);ctx.font="700 34px system-ui";ctx.fillText($("conditionsTag")?.textContent||"Live local conditions",64,226);
    const cardRain=usable(rainSummary?.today_mm)?rainSummary.today_mm:latestCurrent.rain_daily_mm;
    const items=[`Feels like ${n(latestCurrent.feels_like_c)}°C`,`Wind ${n(latestCurrent.wind_speed_kmh)} km/h · gust ${n(latestCurrent.wind_gust_kmh)} km/h`,`Rain today ${n(cardRain)} mm`,`Pressure ${n(latestCurrent.pressure_hpa)} hPa`];
    if(usable(latestCurrent.soil_moisture_pct))items.push(`Garden soil ${n(latestCurrent.soil_moisture_pct,0)}% · ${n(latestCurrent.soil_temperature_c)}°C`);
    ctx.font="500 25px system-ui";let y=292;for(const item of items){ctx.fillStyle="rgba(244,248,251,.92)";ctx.fillText(item,68,y);y+=43;}
    ctx.fillStyle="rgba(7,19,31,.78)";roundedRect(ctx,56,548,1088,50,15);ctx.fillStyle="#c9e7f4";ctx.font="600 20px system-ui";const stamp=new Date(Number(latestCurrent.epoch)*1000).toLocaleString("en-IE",{timeZone:STATION_TIME_ZONE,day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});ctx.fillText(`${stamp} · Ardamine, Co. Wexford`,78,580);ctx.textAlign="right";ctx.fillText("parknacrossweather.ie",1120,580);ctx.textAlign="left";
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("Image creation failed");const file=new File([blob],`parknacross-weather-${stationDayKey(latestCurrent.epoch)}.png`,{type:"image/png"});
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({title:"Parknacross Weather",text:"Live weather from Parknacross, Ardamine",files:[file]});set("shareTodayStatus","Weather card shared.");}
      catch(shareError){
        if(shareError?.name==="AbortError"){set("shareTodayStatus","Sharing cancelled—the weather card was created.");}
        else{console.warn("Native weather-card share:",shareError);downloadWeatherCard(blob,file.name);set("shareTodayStatus","Sharing was unavailable, so the weather card was downloaded instead.");}
      }
    }else{downloadWeatherCard(blob,file.name);set("shareTodayStatus","Weather card downloaded—ready to share.");}
  }catch(error){if(error?.name!=="AbortError"){console.warn("Weather card:",error);set("shareTodayStatus","The weather card could not be created. Please try again.");}}
  finally{if(button){button.disabled=false;button.textContent="Create weather card";}}
}

function scales(title, beginAtZero = false, timeBased = false) {
  return {
    x: {
      ...(timeBased ? { type: "linear" } : {}),
      grid: { color: "transparent" },
      ticks: { color: "#a8bfd4", maxTicksLimit: 8, ...(timeBased ? { callback: value => new Date(Number(value)).toLocaleTimeString("en-IE", { timeZone: STATION_TIME_ZONE, hour: "2-digit", minute: "2-digit" }) } : {}) }
    },
    y: {
      beginAtZero,
      grid: { color: "rgba(163,209,255,.10)" },
      ticks: { color: "#a8bfd4" },
      title: { display: true, text: title, color: "#a8bfd4" }
    }
  };
}

function dashboardTooltipTime(items) {
  const value = items?.[0]?.parsed?.x;
  return Number.isFinite(value)
    ? new Date(value).toLocaleString("en-IE", {
        timeZone: STATION_TIME_ZONE,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";
}

function timeChartPlugins(legend) {
  return {
    tooltip: { callbacks: { title: dashboardTooltipTime } },
    legend
  };
}

function line(label, colour, axis = "y") {
  return {
    label,
    data: [],
    borderColor: colour,
    backgroundColor: colour,
    borderWidth: 2.2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.3,
    fill: false,
    spanGaps: false,
    yAxisID: axis
  };
}

function createCharts() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    Chart.defaults.animation = false;
  }
  Chart.defaults.color = "#bfd0e3";
  Chart.defaults.font.family = "Inter,system-ui,sans-serif";

  charts.temperature = new Chart($("temperatureChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        line("Temperature °C", "#ff8d8d"),
        line("Dew point °C", "#6ef1cb")
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: scales("°C", false, true),
      plugins: timeChartPlugins({ position: "bottom" })
    }
  });

  charts.wind = new Chart($("windChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        line("Wind km/h", "#74ddff"),
        line("Gust km/h", "#ffad66"),
        { label: "Suspect gust excluded from line", data: [], borderColor: "#8797a5", backgroundColor: "#8797a5", showLine: false, pointRadius: 3, pointHoverRadius: 6, yAxisID: "y" }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: scales("km/h", true, true),
      plugins: timeChartPlugins({ position: "bottom" })
    }
  });

  charts.windRose = window.ParknacrossWindRose?.create($("windRose")) || null;

  charts.pressure = new Chart($("pressureChart"), {
    type: "line",
    data: { labels: [], datasets: [line("Pressure hPa", "#b594ff")] },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: scales("hPa", false, true),
      plugins: timeChartPlugins({ display: false })
    }
  });

  charts.rain = new Chart($("rainChart"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [{
        label: "Rainfall mm",
        data: [],
        backgroundColor: "#7ca9ff",
        borderRadius: 8
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: scales("mm", true),
      plugins: { legend: { display: false } }
    }
  });

  charts.solar = new Chart($("solarChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        line("Solar W/m²", "#ffd77a", "y"),
        line("UV index", "#b594ff", "y1")
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          type: "linear",
          grid: { color: "transparent" },
          ticks: { color: "#a8bfd4", maxTicksLimit: 8, callback: value => new Date(Number(value)).toLocaleTimeString("en-IE", { timeZone: STATION_TIME_ZONE, hour: "2-digit", minute: "2-digit" }) }
        },
        y: {
          position: "left",
          beginAtZero: true,
          grid: { color: "rgba(163,209,255,.10)" },
          ticks: { color: "#a8bfd4" },
          title: { display: true, text: "W/m²", color: "#a8bfd4" }
        },
        y1: {
          position: "right",
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: "#a8bfd4" },
          title: { display: true, text: "UV", color: "#a8bfd4" }
        }
      },
      plugins: timeChartPlugins({ position: "bottom" })
    }
  });
}

function chartRowsWithGaps(rows, gapMinutes = 20) {
  const clean = rows.filter(reading => readingTime(reading));
  if (clean.length < 2) return clean;

  const out = [clean[0]];
  const maxGapMs = gapMinutes * 60 * 1000;

  for (let i = 1; i < clean.length; i++) {
    const previousTime = readingTime(clean[i - 1]);
    const currentTime = readingTime(clean[i]);

    if (currentTime - previousTime > maxGapMs) {
      out.push({
        _archiveGap: true,
        _gapTime: previousTime + (currentTime - previousTime) / 2
      });
    }

    out.push(clean[i]);
  }

  return out;
}

function updateCharts() {
  // Merge the latest live observation into cached history so chart endpoints
  // cannot visibly lag behind the live cards while the history cache catches up.
  const source = [...history24];
  if (latestCurrent && usable(latestCurrent.epoch)) {
    const currentEpoch = Number(latestCurrent.epoch);
    const lastEpoch = source.length && usable(source.at(-1)?.epoch) ? Number(source.at(-1).epoch) : null;
    if (lastEpoch === null || currentEpoch > lastEpoch) source.push(latestCurrent);
    else if (currentEpoch === lastEpoch) source[source.length - 1] = latestCurrent;
  }

  // Do not plot isolated temperature spikes as genuine weather observations.
  // The raw observation remains in D1; only the temperature series is filtered.
  const temperatureOutliers = temperatureOutlierRows(source);

  // Never draw a continuous weather line across a substantial D1 archive gap.
  // A null data point makes Chart.js visibly break the line instead.
  const rows = chartRowsWithGaps(source, 20);
  const timeForChartRow = row => row?._archiveGap ? row._gapTime : readingTime(row);
  const valueForChartRow = (row, field) => row?._archiveGap ? null : row?.[field];

  const point = (row, field, excluded = null) => ({
    x: timeForChartRow(row),
    y: row?._archiveGap || excluded?.has(row) ? null : valueForChartRow(row, field)
  });
  charts.temperature.data.labels = [];
  charts.temperature.data.datasets[0].data = rows.map(row => point(row, "temperature_c", temperatureOutliers));
  charts.temperature.data.datasets[1].data = rows.map(row => point(row, "dew_point_c"));
  charts.temperature.update();

  charts.wind.data.labels = [];
  const windGustOutliers = gustOutlierRows(rows);
  charts.wind.data.datasets[0].data = rows.map(row => point(row, "wind_speed_kmh"));
  charts.wind.data.datasets[1].data = rows.map(row => point(row, "wind_gust_kmh", windGustOutliers));
  charts.wind.data.datasets[2].data = rows.map(row => ({ x: timeForChartRow(row), y: windGustOutliers.has(row) ? valueForChartRow(row, "wind_gust_kmh") : null }));
  charts.wind.update();

  window.ParknacrossWindRose?.update(
    charts.windRose,
    source,
    $("dashboardWindRoseMeta"),
    {hours:24}
  );
  const prevailing = prevailingWind();
  set("prevailing", prevailing.text);
  if (usable(prevailing.deg) && $("needle")) {
    $("needle").style.transform = `rotate(${prevailing.deg}deg)`;
  }

  charts.pressure.data.labels = [];
  charts.pressure.data.datasets[0].data = rows.map(row => point(row, "pressure_hpa"));
  charts.pressure.update();

  charts.solar.data.labels = [];
  charts.solar.data.datasets[0].data = rows.map(row => point(row, "solar_w_m2"));
  charts.solar.data.datasets[1].data = rows.map(row => point(row, "uv_index"));
  charts.solar.update();

  const rainfall = dailyRainTotals();
  charts.rain.data.labels = rainfall.map(day =>
    new Date(day.time).toLocaleDateString("en-IE", { timeZone: STATION_TIME_ZONE, weekday: "short" })
  );
  charts.rain.data.datasets[0].data = rainfall.map(day => day.rain);
  charts.rain.update();

  const usableRows = rows.filter(row => !row?._archiveGap);
  const firstTime = usableRows.length ? timeForChartRow(usableRows[0]) : null;
  const lastTime = usableRows.length ? timeForChartRow(usableRows.at(-1)) : null;
  const period = firstTime && lastTime
    ? `${new Date(firstTime).toLocaleString("en-IE", { timeZone: STATION_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} to ${new Date(lastTime).toLocaleString("en-IE", { timeZone: STATION_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : "the latest available period";
  set("dashboardChartSummary", `Dashboard weather charts cover ${period} using ${usableRows.length.toLocaleString("en-IE")} observations. Large archive gaps are shown as breaks; isolated suspect readings are not joined into the valid trend lines.`);
}

async function getJSON(url, cacheMode = "default") {
  const response = await fetch(url, { cache: cacheMode });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadForecast() {
  try {
    const forecast = await getJSON(FORECAST_URL);
    latestForecastToday=forecast.today || "";
    set("forecastToday", latestForecastToday || "Forecast unavailable.");
    set("forecastTonight", forecast.tonight || "--");
    set("forecastTomorrow", forecast.tomorrow || "--");
    if(latestCurrent)updateWhatToWear(latestCurrent,latestRainDetected);
  } catch (error) {
    console.warn("Met Éireann forecast:", error);
    latestForecastToday="";
    set("forecastToday", "Official forecast temporarily unavailable.");
    if(latestCurrent)updateWhatToWear(latestCurrent,latestRainDetected);
  }
}

function warningDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWarningTime(date) {
  return date.toLocaleString("en-IE", {
    timeZone: STATION_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function marineFlagIsActive(value) {
  const flag = String(value ?? "").trim().toLowerCase();
  return flag === "yes" || flag === "true" || flag === "1" || flag === "in force";
}

function isDashboardWeatherWarning(warning) {
  const text = [
    warning?.type,
    warning?.event,
    warning?.status,
    warning?.headline,
    warning?.description
  ].filter(Boolean).join(" ").toLowerCase();

  // Environmental/agricultural advisories (for example potato blight)
  // are not local public weather warnings for Parknacross.
  if (/potato|blight|farming|agricultur|environmental advisory/.test(text)) {
    return false;
  }

  return true;
}

function renderWeatherWarning(list) {
  const banner = $("warningBanner");
  const relevant = Array.isArray(list)
    ? list.filter(isDashboardWeatherWarning)
    : [];

  if (!banner || !relevant.length) {
    if (banner) banner.hidden = true;
    return false;
  }

  const warning = relevant[0];
  const rawLevel = String(
    warning.level ||
    warning.severity ||
    "yellow"
  ).trim();

  const level = rawLevel.toLowerCase();

  banner.hidden = false;
  banner.classList.remove(
    "level-yellow",
    "level-orange",
    "level-red"
  );

  if (level.includes("red")) {
    banner.classList.add("level-red");
  } else if (level.includes("orange")) {
    banner.classList.add("level-orange");
  } else {
    banner.classList.add("level-yellow");
  }

  const displayLevel =
    level.includes("red")
      ? "Red"
      : level.includes("orange")
        ? "Orange"
        : "Yellow";

  set("warningLevel", `${displayLevel} warning`);

  const warningType =
    String(
      warning.type ||
      warning.event ||
      "Weather"
    ).trim();

  set("warningTitle", `${warningType} warning for Wexford`);

  const onset = warningDate(warning.onset);
  const expires = warningDate(warning.expires);

  let timing = "";

  if (onset && expires) {
    timing = `Valid ${formatWarningTime(onset)} – ${formatWarningTime(expires)}`;
  } else if (expires) {
    timing = `Valid until ${formatWarningTime(expires)}`;
  }

  set("warningTiming", timing);

  set(
    "warningText",
    warning.description ||
    warning.headline ||
    "See Met Éireann for full warning details."
  );

  return true;
}

function renderMarineWarning(marine, weatherWarningVisible) {
  const banner = $("marineWarningBanner");
  if (!banner) return false;

  /*
   * IMPORTANT:
   * Do not use the national Sea Area Forecast flags here.
   * The Worker filters marine warnings to EI811:
   * Wicklow Head → Carnsore Point, the sector containing Parknacross/Ardamine.
   */
  const gale = marineFlagIsActive(marine?.local_gale_warning);
  const smallCraft = marineFlagIsActive(marine?.local_small_craft_warning);

  if (!gale && !smallCraft) {
    banner.hidden = true;
    banner.classList.remove("stacked-warning");
    return false;
  }

  banner.hidden = false;
  banner.classList.toggle("stacked-warning", weatherWarningVisible);
  banner.classList.remove("level-orange", "level-red");
  banner.classList.add("level-yellow");

  set("marineWarningLevel", "North Wexford marine warning");

  let title = "Marine warning — North Wexford coast";
  if (gale && smallCraft) {
    title = "Gale and Small Craft Warnings — North Wexford coast";
  } else if (gale) {
    title = "Gale Warning — North Wexford coast";
  } else if (smallCraft) {
    title = "Small Craft Warning — North Wexford coast";
  }

  set("marineWarningTitle", title);

  let timing = "";
  if (marine?.local_warning_valid_text) {
    timing = `Valid ${marine.local_warning_valid_text}`;
  } else {
    const issued = warningDate(marine?.issued);
    const until = warningDate(marine?.until);

    if (issued && until) {
      timing = `Issued ${formatWarningTime(issued)} · valid until ${formatWarningTime(until)}`;
    } else if (until) {
      timing = `Valid until ${formatWarningTime(until)}`;
    } else if (issued) {
      timing = `Issued ${formatWarningTime(issued)}`;
    }
  }

  set("marineWarningTiming", timing);

  const sector = marine?.local_warning_sector || "Wicklow Head to Carnsore Point";
  const localWind = String(marine?.local_area?.wind || "").trim();
  const detail = localWind ? ` Current sector forecast: ${localWind}` : "";

  set(
    "marineWarningText",
    `Met Éireann has a marine warning affecting ${sector}, which includes the coast off Ardamine/Parknacross.${detail}`
  );

  const link = $("marineWarningLink");
  if (link && marine?.local_warning_url) {
    link.href = marine.local_warning_url;
  }

  return true;
}

async function loadWarnings() {
  const [weatherResult, marineResult] = await Promise.allSettled([
    getJSON(WARNINGS_URL),
    getJSON(MARINE_URL)
  ]);

  let weatherWarningVisible = false;

  if (weatherResult.status === "fulfilled") {
    const list = Array.isArray(weatherResult.value?.warnings)
      ? weatherResult.value.warnings
      : [];
    weatherWarningVisible = renderWeatherWarning(list);
  } else {
    console.warn("Met Éireann weather warnings:", weatherResult.reason);
    const banner = $("warningBanner");
    if (banner) banner.hidden = true;
  }

  if (marineResult.status === "fulfilled") {
    renderMarineWarning(marineResult.value, weatherWarningVisible);
  } else {
    console.warn("Met Éireann marine warnings:", marineResult.reason);
    const banner = $("marineWarningBanner");
    if (banner) banner.hidden = true;
  }
}


async function restoreBatteryIfMissing(current) {
  // /current already performs server-side WS90 battery recovery. Keep public
  // clients away from the admin-only diagnostic endpoint.
  return current;
}


function lightningRelative(epoch) {
  if (!usable(epoch)) return "--";
  const ms = Date.now() - Number(epoch) * 1000;
  if (!Number.isFinite(ms) || ms < 0) return "--";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function lightningDistance(value) {
  return usable(value) && Number(value) >= 0 && Number(value) <= 40 ? Number(value) : null;
}

async function refreshLightning() {
  const panel = $("lightningPanel");
  if (!panel) return;
  try {
    const data = await getJSON(LIGHTNING_URL, "no-store");
    if (!data?.available) {
      panel.hidden = true;
      panel.style.display = "none";
      return;
    }
    panel.hidden = false;
    panel.style.display = "";
    set("lightningHeadline", "WH57 lightning detector");
    set("lightningStrikes", usable(data.strikes_today) ? Math.round(Number(data.strikes_today)).toLocaleString("en-IE") : "--");
    const strikesToday=usable(data.strikes_today)?Math.round(Number(data.strikes_today)):null;
    const nearestDistance=lightningDistance(data.nearest_24h_km),latestDistance=lightningDistance(data.distance_km);
    set("lightningNearest", strikesToday===0?"None today":nearestDistance!==null?`${nearestDistance.toFixed(0)} km`:"Unavailable");
    set("lightningLast", strikesToday===0?"None today":usable(data.last_strike_epoch)?lightningRelative(data.last_strike_epoch):"Unavailable");
    set(
      "lightningDetail",
      latestDistance!==null
        ? `Latest detected lightning approximately ${latestDistance.toFixed(0)} km away`
        : "Lightning sensor is online"
    );
    set("lightningFreshness",`Sensor status checked ${new Date().toLocaleTimeString("en-IE",{timeZone:STATION_TIME_ZONE,hour:"2-digit",minute:"2-digit"})} Irish time`);
    window.PWAlerts?.evaluateLightning?.(data);
  } catch (error) {
    console.warn("Lightning refresh:", error);
    panel.hidden = true;
    panel.style.display = "none";
  }
}

async function loadEverything() {
  let current = null;
  let liveCurrent = false;

  try {
    current = await getJSON(CURRENT_URL, "no-store");
    current = await restoreBatteryIfMissing(current);
    latestCurrent = current;
    writeLocalCache("current", current);
    liveCurrent = true;
    markLiveMode();
    // Do not hold the primary conditions behind slower archive/stat requests.
    // The supporting panels update again as soon as those requests complete.
    updateDashboard(current);
  } catch (error) {
    console.error("Current conditions:", error);
    const cached = readLocalCache("current");
    current = cached?.value || null;
    if (!current) {
      set("cloudStatus", "Error");
      $("cloudStatus")?.classList.remove("ok", "warn");
      $("cloudStatus")?.classList.add("bad");
      set("conditionsTag", "Feed unavailable");
      set("lastUpdated", "Unable to load live weather");
      $("livePill")?.classList.add("offline");
      set("liveText", "STATION DATA UNAVAILABLE");
      markOfflineMode(null);
      return;
    }
    latestCurrent = current;
    markOfflineMode(current);
    updateDashboard(current);
  }

  const results = await Promise.allSettled([
    getJSON(HISTORY_24_URL),
    getJSON(HISTORY_7D_URL),
    getJSON(STATS_URL, "no-store"),
    getJSON(RAIN_SUMMARY_URL, "no-store"),
    getJSON(DAILY_RECENT_URL, "no-store")
  ]);

  if (results[0].status === "fulfilled" && Array.isArray(results[0].value.readings)) {
    history24 = results[0].value.readings;
    writeLocalCache("history24", history24);
  } else {
    history24 = readLocalCache("history24")?.value || [];
  }

  history7d = results[1].status === "fulfilled" && Array.isArray(results[1].value.readings)
    ? results[1].value.readings : [];

  if (results[2].status === "fulfilled") {
    stats = results[2].value;
    writeLocalCache("stats", stats);
  } else {
    stats = readLocalCache("stats")?.value || null;
  }

  if (results[3].status === "fulfilled") {
    rainSummary = results[3].value;
    writeLocalCache("rain", rainSummary);
  } else {
    rainSummary = readLocalCache("rain")?.value || null;
  }

  if (results[4].status === "fulfilled" && Array.isArray(results[4].value.days)) {
    dailyRecent = results[4].value.days;
    writeLocalCache("daily", dailyRecent);
  } else {
    dailyRecent = readLocalCache("daily")?.value || [];
  }

  updateDashboard(current);
  updateCharts();

  if (!liveCurrent) {
    $("livePill")?.classList.add("offline");
    set("liveText", navigator.onLine ? "LAST SAVED OBSERVATION" : "OFFLINE · LAST SAVED OBSERVATION");
    set("cloudStatus", "Cached");
    $("cloudStatus")?.classList.remove("ok", "bad");
    $("cloudStatus")?.classList.add("warn");
  } else {
    window.PWAlerts?.evaluateCurrent?.(current);
  }
}

async function refreshCurrent() {
  try {
    let current = await getJSON(CURRENT_URL, "no-store");
    current = await restoreBatteryIfMissing(current);
    latestCurrent = current;
    writeLocalCache("current", current);
    markLiveMode();
    updateDashboard(current);
    window.PWAlerts?.evaluateCurrent?.(current);
  } catch (error) {
    console.error("Current refresh:", error);
    if (latestCurrent) {
      markOfflineMode(latestCurrent);
      $("livePill")?.classList.add("offline");
      set("liveText", navigator.onLine ? "LIVE FEED UNAVAILABLE · LAST SAVED DATA" : "OFFLINE · LAST SAVED DATA");
    }
  }
}

async function refreshHistory24() {
  try {
    const data = await getJSON(HISTORY_24_URL);
    history24 = Array.isArray(data.readings) ? data.readings : history24;
    writeLocalCache("history24", history24);
    if (latestCurrent) updateDashboard(latestCurrent);
    updateCharts();
  } catch (error) {
    console.warn("24-hour history refresh:", error);
  }
}

async function refreshHistory7d() {
  try {
    const data = await getJSON(HISTORY_7D_URL);
    history7d = Array.isArray(data.readings) ? data.readings : history7d;
    updateCharts();
  } catch (error) {
    console.warn("7-day history refresh:", error);
  }
}

async function refreshStats() {
  try {
    const [statsResult, rainResult, dailyResult] = await Promise.allSettled([
      getJSON(STATS_URL, "no-store"),
      getJSON(RAIN_SUMMARY_URL, "no-store"),
      getJSON(DAILY_RECENT_URL, "no-store")
    ]);
    if (statsResult.status === "fulfilled") { stats = statsResult.value; writeLocalCache("stats", stats); }
    if (rainResult.status === "fulfilled") { rainSummary = rainResult.value; writeLocalCache("rain", rainSummary); }
    if (dailyResult.status === "fulfilled" && Array.isArray(dailyResult.value.days)) {
      dailyRecent = dailyResult.value.days;
      writeLocalCache("daily", dailyRecent);
    }
    if (latestCurrent) updateDashboard(latestCurrent);
  } catch (error) {
    console.warn("Stats refresh:", error);
  }
}

function setupPWA() {
  const button = $("installButton");
  const installStrip = button?.closest(".install-strip");
  const userAgent = navigator.userAgent || "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Android/i.test(userAgent);
  const isChromiumInstallBrowser =
    /Chrome|Chromium|EdgA|Edg\/|OPR|SamsungBrowser/i.test(userAgent);

  const isRunningInstalled = () =>
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;

  const setInstallPanelVisible = visible => {
    if (installStrip) {
      installStrip.hidden = !visible;
      /*
       * .install-strip uses display:flex in the site stylesheet. Setting an
       * inline display value as well makes the hidden state unambiguous and
       * prevents that layout rule from keeping the panel visible.
       */
      installStrip.style.display = visible ? "" : "none";
    }
    if (!visible && button) button.hidden = true;
  };

  /*
   * If the dashboard is already running as the installed PWA, the Quick
   * Access panel has served its purpose and should not take up space.
   * No persistent "installed" flag is stored: after an uninstall, Chromium
   * can make the site installable again and beforeinstallprompt will restore
   * the panel automatically.
   */
  if (isRunningInstalled()) {
    setInstallPanelVisible(false);
  } else if (isChromiumInstallBrowser) {
    /*
     * Chromium does not expose a dependable "is this PWA already installed?"
     * query to the page. Instead, keep the panel hidden until Chromium tells
     * us installation is currently available via beforeinstallprompt.
     *
     * Result:
     * - installed app -> no prompt event -> panel stays hidden
     * - app later uninstalled -> prompt event becomes available -> panel returns
     */
    setInstallPanelVisible(false);
  }

  /*
   * Apple Safari does not provide the Chromium beforeinstallprompt event.
   * On iPhone/iPad Safari, keep the same Install app button available and
   * guide the user through Safari's native Add to Home Screen flow.
   */
  if (button && isIOS && isSafari && !isRunningInstalled()) {
    setInstallPanelVisible(true);
    button.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;

    if (!isRunningInstalled()) {
      setInstallPanelVisible(true);
      if (button) button.hidden = false;
    }
  });

  button?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;

      if (choice?.outcome === "accepted") {
        setInstallPanelVisible(false);
      } else {
        setInstallPanelVisible(true);
        button.hidden = false;
      }
      return;
    }

    if (isIOS && isSafari && !isRunningInstalled()) {
      alert(
        "To install Parknacross Weather on your iPhone or iPad:\n\n" +
        "1. Tap the Share button in Safari (the square with the upward arrow).\n" +
        "2. Scroll down and tap Add to Home Screen.\n" +
        "3. Tap Add.\n\n" +
        "Parknacross Weather will then open from your Home Screen like an app."
      );
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    setInstallPanelVisible(false);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  createCharts();
  updateSunInfo();
  loadEverything();
  loadForecast();
  loadWarnings();
  refreshLightning();
  refreshSoilFreshness();
  $("shareTodayButton")?.addEventListener("click",createWeatherCard);
  setupPWA();

  setInterval(updateRelativeObservation, 15 * 1000);
  setInterval(refreshCurrent, 60 * 1000);
  setInterval(refreshHistory24, 10 * 60 * 1000);
  setInterval(refreshHistory7d, 30 * 60 * 1000);
  setInterval(refreshStats, 15 * 60 * 1000);
  setInterval(() => updateSunInfo(latestCurrent), 60 * 1000);
  setInterval(loadWarnings, 5 * 60 * 1000);
  setInterval(loadForecast, 30 * 60 * 1000);
  setInterval(refreshLightning, 60 * 1000);
  setInterval(refreshSoilFreshness, 60 * 1000);
});
