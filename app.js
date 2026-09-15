const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
const CURRENT_URL = `${API_BASE}/current`;
const HISTORY_24_URL = `${API_BASE}/history?hours=24`;
const HISTORY_7D_URL = `${API_BASE}/history?hours=168`;
const STATS_URL = `${API_BASE}/stats`;
const FORECAST_URL = `${API_BASE}/met/forecast`;
const WARNINGS_URL = `${API_BASE}/met/warnings`;
const MARINE_URL = `${API_BASE}/met/marine`;
const BATTERY_DEBUG_URL = `${API_BASE}/battery-debug`;

const ARDAMINE_LAT = 52.6247;
const ARDAMINE_LON = -6.25;
const STATION_TIME_ZONE = "Europe/Dublin";
const STALE_AFTER_MS = 10 * 60 * 1000;
const OFFLINE_AFTER_MS = 30 * 60 * 1000;

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
let charts = {};
let deferredInstallPrompt = null;
let latestObservationTime = null;
let latestCurrent = null;

const RAIN_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const RAIN_RECENT_WINDOW_MS = 15 * 60 * 1000;
const RAIN_INCREMENT_EPSILON_MM = 0.05;
let lastObservedRainTotal = null;
let lastObservedRainDay = null;
let lastRainIncreaseTime = null;

/* 0.1 mm on commissioning day was a test, not real rainfall. */
const RAIN_CORRECTIONS_MM = {
  "2026-09-11": 0.1
};

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

function comfort(humidity) {
  const value = Number(humidity);
  if (!Number.isFinite(value)) return "--";
  if (value < 35) return "Dry";
  if (value <= 65) return "Comfortable";
  if (value <= 80) return "Humid";
  return "Very humid";
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

function pressureStats() {
  const rows = history24.filter(row => usable(row.pressure_hpa));
  if (rows.length < 2) return { change: null, trend: "--" };
  const change =
    Number(rows.at(-1).pressure_hpa) -
    Number(rows[0].pressure_hpa);
  return {
    change,
    trend: change > 0.5 ? "Rising" : change < -0.5 ? "Falling" : "Steady"
  };
}

function closestReadingTo(targetTime) {
  if (!history24.length) return null;
  return history24.reduce((best, row) => {
    const t = readingTime(row);
    if (!t) return best;
    if (!best) return row;
    return Math.abs(t - targetTime) < Math.abs(readingTime(best) - targetTime)
      ? row
      : best;
  }, null);
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
  const directionalRows = history24.filter(row => usable(row.wind_direction_deg));
  if (!directionalRows.length) return { deg: null, text: "--" };

  // Very light winds can make direction readings wander and distort the
  // 24-hour prevailing direction. Only include readings at 2 km/h or above.
  const rows = directionalRows.filter(row =>
    usable(row.wind_speed_kmh) && Number(row.wind_speed_kmh) >= 2
  );

  if (!rows.length) {
    const hasWindSpeeds = directionalRows.some(row => usable(row.wind_speed_kmh));
    return { deg: null, text: hasWindSpeeds ? "Calm" : "--" };
  }

  let x = 0;
  let y = 0;

  rows.forEach(row => {
    const weight = Number(row.wind_speed_kmh);
    const radians = Number(row.wind_direction_deg) * Math.PI / 180;
    x += Math.cos(radians) * weight;
    y += Math.sin(radians) * weight;
  });

  const degrees = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { deg: degrees, text: compass(degrees) };
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
  // latest archived total with /current because /history is cached for 5 min.
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
  return { tag: "Calm & local", icon: "☁️", story: "Quiet local conditions at Parknacross.", className: "weather-neutral" };
}

/* NOAA-style sunrise/sunset calculation using the public Ardamine area centre. */
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function normalize360(value) {
  return ((value % 360) + 360) % 360;
}

function sunEvent(date, latitude, longitude, sunrise) {
  const zenith = 90.833;
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

function updateSunInfo() {
  const now = new Date();
  const stationDate = stationCalendarDate(now);
  const rise = sunEvent(stationDate, ARDAMINE_LAT, ARDAMINE_LON, true);
  const setTime = sunEvent(stationDate, ARDAMINE_LAT, ARDAMINE_LON, false);

  const fmt = date => date
    ? date.toLocaleTimeString("en-IE", { timeZone: STATION_TIME_ZONE, hour: "2-digit", minute: "2-digit" })
    : "--";

  set("sunrise", fmt(rise));
  set("sunset", fmt(setTime));

  const isNight = !!(rise && setTime && (now < rise || now >= setTime));

  if (rise && setTime) {
    if (now >= rise && now < setTime) {
      const mins = Math.max(0, Math.floor((setTime - now) / 60000));
      set("daylightRemaining", `${Math.floor(mins / 60)}h ${mins % 60}m`);
    } else {
      set("daylightRemaining", "Night");
    }
  }

  document.body.classList.toggle("is-night", isNight);
  return isNight;
}

function dailyRainTotals() {
  const days = new Map();

  history7d.forEach(reading => {
    const time = readingTime(reading);
    const correctedRain = correctedDailyRain(reading);
    if (!time || !usable(correctedRain)) return;

    const key = stationDateKeyFromTime(time);

    const rain = Number(correctedRain);
    const existing = days.get(key);
    if (!existing || rain > existing.rain) {
      days.set(key, { time, rain });
    }
  });

  return [...days.values()].sort((a, b) => a.time - b.time).slice(-7);
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

  set("monthRain", `${n(stats.month_rain_mm)} mm`);
  set("monthRainDays", `${stats.month_rain_days ?? 0} rain day${stats.month_rain_days === 1 ? "" : "s"} this month`);
  set("yearRain", `${n(stats.year_rain_mm)} mm`);
  set("stationSince", dateLabel(stats.first_epoch));

  if (stats.wettest_day) {
    set("wettestDay", `${n(stats.wettest_day.rain_mm)} mm`);
    set("wettestDate", dateLabel(`${stats.wettest_day.day}T12:00:00Z`));
  }

  const records = stats.records || {};
  if (records.high_temperature) {
    set("allHigh", `${n(records.high_temperature.value)} °C`);
    set("allHighDate", dateLabel(records.high_temperature.epoch));
  }
  if (records.low_temperature) {
    set("allLow", `${n(records.low_temperature.value)} °C`);
    set("allLowDate", dateLabel(records.low_temperature.epoch));
  }
  if (records.peak_gust) {
    set("allGust", `${n(records.peak_gust.value)} km/h`);
    set("allGustDate", dateLabel(records.peak_gust.epoch));
  }
  if (records.high_pressure) {
    set("allPressure", `${n(records.high_pressure.value)} hPa`);
    set("allPressureDate", dateLabel(records.high_pressure.epoch));
  }
}

function updateDashboard(current) {
  const now = new Date();
  const today = history24.filter(reading => {
    const time = readingTime(reading);
    return time && sameDay(time, now);
  });

  const highReading = recordReading(today, "temperature_c", "max");
  const lowReading = recordReading(today, "temperature_c", "min");
  const gustReading = recordReading(today, "wind_gust_kmh", "max");
  const solarReading = recordReading(today, "solar_w_m2", "max");
  // The live reading can arrive before the newest observation is present in history24.
  // Include it in today's peak so Solar peak can never be lower than Solar / UV.
  const solarPeakCandidates = [solarReading?.solar_w_m2, current.solar_w_m2]
    .filter(usable)
    .map(Number);
  const solarPeak = solarPeakCandidates.length ? Math.max(...solarPeakCandidates) : null;

  const pressure = pressureStats();
  const direction = compass(current.wind_direction_deg);
  const rainToday = correctedDailyRain(current);
  const currentTime = readingTime(current);
  const isNight = updateSunInfo();
  const condition = conditionInfo(current, isNight);

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

  set("todayLow", n(lowReading?.temperature_c));
  set("todayHigh", n(highReading?.temperature_c));
  set("peakGust", n(gustReading?.wind_gust_kmh));
  set("summaryRain", n(rainToday));
  set("solarPeak", n(solarPeak, 0));

  set("tempVal", n(current.temperature_c));
  set("feelsVal", `${n(current.feels_like_c)}°C`);
  set("tempMin", n(lowReading?.temperature_c));
  set("tempMax", n(highReading?.temperature_c));
  set("humVal", n(current.humidity, 0));
  set("dewVal", `${n(current.dew_point_c)}°C`);
  set("comfortVal", comfort(current.humidity));
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

  const threeHoursAgo = closestReadingTo(Date.now() - 3 * 60 * 60 * 1000);
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

  set("recordHigh", `${n(highReading?.temperature_c)} °C`);
  set("recordHighTime", highReading ? `at ${timeLabel(highReading)}` : "--");
  set("recordLow", `${n(lowReading?.temperature_c)} °C`);
  set("recordLowTime", lowReading ? `at ${timeLabel(lowReading)}` : "--");
  set("recordGust", `${n(gustReading?.wind_gust_kmh)} km/h`);
  set("recordGustTime", gustReading ? `at ${timeLabel(gustReading)}` : "--");
  set("recordRain", `${n(rainToday)} mm`);

  updateFreshness(current);
  updateStatsPanel();
  set("year", stationDateKeyFromTime(new Date())?.slice(0,4) || new Date().getFullYear());
}

function scales(title) {
  return {
    x: {
      grid: { color: "transparent" },
      ticks: { color: "#a8bfd4", maxTicksLimit: 8 }
    },
    y: {
      grid: { color: "rgba(163,209,255,.10)" },
      ticks: { color: "#a8bfd4" },
      title: { display: true, text: title, color: "#a8bfd4" }
    }
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
      scales: scales("°C"),
      plugins: { legend: { position: "bottom" } }
    }
  });

  charts.wind = new Chart($("windChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        line("Wind km/h", "#74ddff"),
        line("Gust km/h", "#ffad66")
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: scales("km/h"),
      plugins: { legend: { position: "bottom" } }
    }
  });

  charts.pressure = new Chart($("pressureChart"), {
    type: "line",
    data: { labels: [], datasets: [line("Pressure hPa", "#b594ff")] },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: scales("hPa"),
      plugins: { legend: { display: false } }
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
      scales: scales("mm"),
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
          grid: { color: "transparent" },
          ticks: { color: "#a8bfd4", maxTicksLimit: 8 }
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
      plugins: { legend: { position: "bottom" } }
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
  // Never draw a continuous weather line across a substantial D1 archive gap.
  // A null data point makes Chart.js visibly break the line instead.
  const rows = chartRowsWithGaps(history24, 20);
  const timeForChartRow = row => row?._archiveGap ? row._gapTime : readingTime(row);
  const valueForChartRow = (row, field) => row?._archiveGap ? null : row?.[field];

  const labels = rows.map(reading => {
    if (reading?._archiveGap) return "";
    return new Date(timeForChartRow(reading)).toLocaleTimeString("en-IE", {
      timeZone: STATION_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit"
    });
  });

  charts.temperature.data.labels = labels;
  charts.temperature.data.datasets[0].data = rows.map(row => valueForChartRow(row, "temperature_c"));
  charts.temperature.data.datasets[1].data = rows.map(row => valueForChartRow(row, "dew_point_c"));
  charts.temperature.update();

  charts.wind.data.labels = labels;
  charts.wind.data.datasets[0].data = rows.map(row => valueForChartRow(row, "wind_speed_kmh"));
  charts.wind.data.datasets[1].data = rows.map(row => valueForChartRow(row, "wind_gust_kmh"));
  charts.wind.update();

  charts.pressure.data.labels = labels;
  charts.pressure.data.datasets[0].data = rows.map(row => valueForChartRow(row, "pressure_hpa"));
  charts.pressure.update();

  charts.solar.data.labels = labels;
  charts.solar.data.datasets[0].data = rows.map(row => valueForChartRow(row, "solar_w_m2"));
  charts.solar.data.datasets[1].data = rows.map(row => valueForChartRow(row, "uv_index"));
  charts.solar.update();

  const rainfall = dailyRainTotals();
  charts.rain.data.labels = rainfall.map(day =>
    new Date(day.time).toLocaleDateString("en-IE", { timeZone: STATION_TIME_ZONE, weekday: "short" })
  );
  charts.rain.data.datasets[0].data = rainfall.map(day => day.rain);
  charts.rain.update();
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
    set("forecastToday", forecast.today || "Forecast unavailable.");
    set("forecastTonight", forecast.tonight || "--");
    set("forecastTomorrow", forecast.tomorrow || "--");
  } catch (error) {
    console.warn("Met Éireann forecast:", error);
    set("forecastToday", "Official forecast temporarily unavailable.");
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
  if (!current || usable(current.battery_v)) return current;

  try {
    const debug = await getJSON(BATTERY_DEBUG_URL, "no-store");
    const fallback =
      debug?.effective_battery_v ??
      debug?.explicit_realtime_battery_v ??
      debug?.history_battery_v ??
      debug?.recovered_from_saved_raw_json ??
      debug?.stored_battery_v;

    if (usable(fallback)) {
      current.battery_v = Number(fallback);
    }
  } catch (error) {
    console.warn("Battery fallback:", error);
  }

  return current;
}

async function loadEverything() {
  let current = null;

  try {
    current = await getJSON(CURRENT_URL, "no-store");
    current = await restoreBatteryIfMissing(current);
    latestCurrent = current;
    updateDashboard(current);
  } catch (error) {
    console.error("Current conditions:", error);
    set("cloudStatus", "Error");
    $("cloudStatus")?.classList.remove("ok", "warn");
    $("cloudStatus")?.classList.add("bad");
    set("conditionsTag", "Feed unavailable");
    set("lastUpdated", "Unable to load live weather");
    $("livePill")?.classList.add("offline");
    set("liveText", "STATION DATA UNAVAILABLE");
    return;
  }

  const results = await Promise.allSettled([
    getJSON(HISTORY_24_URL),
    getJSON(HISTORY_7D_URL),
    getJSON(STATS_URL)
  ]);

  history24 = results[0].status === "fulfilled" && Array.isArray(results[0].value.readings)
    ? results[0].value.readings : [];
  history7d = results[1].status === "fulfilled" && Array.isArray(results[1].value.readings)
    ? results[1].value.readings : [];
  stats = results[2].status === "fulfilled" ? results[2].value : null;

  updateDashboard(current);
  updateCharts();
}

async function refreshCurrent() {
  try {
    let current = await getJSON(CURRENT_URL, "no-store");
    current = await restoreBatteryIfMissing(current);
    latestCurrent = current;
    updateDashboard(current);
  } catch (error) {
    console.error("Current refresh:", error);
  }
}

async function refreshHistory24() {
  try {
    const data = await getJSON(HISTORY_24_URL);
    history24 = Array.isArray(data.readings) ? data.readings : history24;
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
    stats = await getJSON(STATS_URL);
    if (latestCurrent) updateDashboard(latestCurrent);
  } catch (error) {
    console.warn("Stats refresh:", error);
  }
}

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(error =>
      console.warn("Service worker:", error)
    );
  }

  const button = $("installButton");
  const userAgent = navigator.userAgent || "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Android/i.test(userAgent);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;

  /*
   * Apple Safari does not provide the Chromium beforeinstallprompt event.
   * On iPhone/iPad Safari, keep the same Install app button available and
   * guide the user through Safari's native Add to Home Screen flow.
   */
  if (button && isIOS && isSafari && !isStandalone) {
    button.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (button && !isStandalone) button.hidden = false;
  });

  button?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      button.hidden = true;
      return;
    }

    if (isIOS && isSafari && !isStandalone) {
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
    if (button) button.hidden = true;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  createCharts();
  updateSunInfo();
  loadEverything();
  loadForecast();
  loadWarnings();
  setupPWA();

  setInterval(updateRelativeObservation, 15 * 1000);
  setInterval(refreshCurrent, 60 * 1000);
  setInterval(refreshHistory24, 10 * 60 * 1000);
  setInterval(refreshHistory7d, 30 * 60 * 1000);
  setInterval(refreshStats, 30 * 60 * 1000);
  setInterval(updateSunInfo, 60 * 1000);
  setInterval(loadWarnings, 5 * 60 * 1000);
  setInterval(loadForecast, 30 * 60 * 1000);
});
