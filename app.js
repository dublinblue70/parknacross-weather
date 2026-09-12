const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
const CURRENT_URL = `${API_BASE}/current`;
const HISTORY_24_URL = `${API_BASE}/history?hours=24`;
const HISTORY_7D_URL = `${API_BASE}/history?hours=168`;
const STATS_URL = `${API_BASE}/stats`;
const FORECAST_URL = `${API_BASE}/met/forecast`;
const WARNINGS_URL = `${API_BASE}/met/warnings`;

const ARDAMINE_LAT = 52.6247;
const ARDAMINE_LON = -6.25;
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

let history24 = [];
let history7d = [];
let stats = null;
let charts = {};
let deferredInstallPrompt = null;

/* 0.1 mm on commissioning day was a test, not real rainfall. */
const RAIN_CORRECTIONS_MM = {
  "2026-09-11": 0.1
};

function readingTime(reading) {
  if (reading?.received_at) {
    const time = new Date(reading.received_at).getTime();
    if (Number.isFinite(time)) return time;
  }

  return usable(reading?.epoch)
    ? Number(reading.epoch) * 1000
    : null;
}

function localDateKey(reading) {
  const time = readingTime(reading);

  if (!time) return null;

  const date = new Date(time);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function correctedDailyRain(reading) {
  const raw = Number(reading?.rain_daily_mm);

  if (!Number.isFinite(raw)) return null;

  const correction =
    Number(RAIN_CORRECTIONS_MM[localDateKey(reading)] || 0);

  return Math.round(
    Math.max(0, raw - correction) * 10
  ) / 10;
}

function sameDay(time, reference = new Date()) {
  const date = new Date(time);

  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function compass(degrees) {
  if (!usable(degrees)) return "--";

  const labels = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW"
  ];

  const direction =
    ((Number(degrees) % 360) + 360) % 360;

  return labels[
    Math.round(direction / 22.5) % 16
  ];
}

function comfort(humidity) {
  const value = Number(humidity);

  if (!Number.isFinite(value)) return "--";

  if (value < 35) return "Dry";
  if (value <= 65) return "Comfortable";
  if (value <= 80) return "Humid";

  return "Very humid";
}

function batteryStatus(voltage) {
  if (!usable(voltage)) return "--";

  const v = Number(voltage);

  if (v >= 3.0) return "Excellent";
  if (v >= 2.8) return "Good";
  if (v >= 2.5) return "Fair";
  if (v >= 2.3) return "Low";

  return "Replace";
}

function recordReading(rows, field, mode = "max") {
  const valid =
    rows.filter(row => usable(row[field]));

  if (!valid.length) return null;

  return valid.reduce((best, row) => {
    if (!best) return row;

    const a = Number(row[field]);
    const b = Number(best[field]);

    return mode === "min"
      ? (a < b ? row : best)
      : (a > b ? row : best);
  }, null);
}

function timeLabel(reading) {
  const time = readingTime(reading);

  if (!time) return "--";

  return new Date(time).toLocaleTimeString(
    "en-IE",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function dateLabel(value) {
  if (!value) return "--";

  const date =
    typeof value === "number"
      ? new Date(value * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleDateString(
    "en-IE",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );
}

function pressureStats() {
  const rows =
    history24.filter(
      row => usable(row.pressure_hpa)
    );

  if (rows.length < 2) {
    return {
      change: null,
      trend: "--"
    };
  }

  const change =
    Number(rows.at(-1).pressure_hpa) -
    Number(rows[0].pressure_hpa);

  return {
    change,
    trend:
      change > 0.5
        ? "Rising"
        : change < -0.5
          ? "Falling"
          : "Steady"
  };
}

function closestReadingTo(targetTime) {
  if (!history24.length) return null;

  return history24.reduce(
    (best, row) => {
      const t = readingTime(row);

      if (!t) return best;
      if (!best) return row;

      return Math.abs(t - targetTime) <
        Math.abs(
          readingTime(best) - targetTime
        )
        ? row
        : best;
    },
    null
  );
}

function updateTrend(
  id,
  currentValue,
  oldValue,
  unit,
  digits = 1
) {
  const element = $(id);

  if (
    !element ||
    !usable(currentValue) ||
    !usable(oldValue)
  ) {
    set(id, "--");
    return;
  }

  const delta =
    Number(currentValue) -
    Number(oldValue);

  const arrow =
    delta > 0.05
      ? "↑"
      : delta < -0.05
        ? "↓"
        : "→";

  const sign =
    delta > 0 ? "+" : "";

  element.textContent =
    `${arrow} ${sign}${delta.toFixed(digits)} ${unit}`;

  element.classList.remove(
    "trend-up",
    "trend-down",
    "trend-flat"
  );

  element.classList.add(
    delta > 0.05
      ? "trend-up"
      : delta < -0.05
        ? "trend-down"
        : "trend-flat"
  );
}

function prevailingWind() {
  const rows =
    history24.filter(
      row =>
        usable(
          row.wind_direction_deg
        )
    );

  if (!rows.length) {
    return {
      deg: null,
      text: "--"
    };
  }

  let x = 0;
  let y = 0;

  rows.forEach(row => {
    const weight =
      usable(row.wind_speed_kmh)
        ? Math.max(
            Number(row.wind_speed_kmh),
            1
          )
        : 1;

    const radians =
      Number(
        row.wind_direction_deg
      ) *
      Math.PI /
      180;

    x +=
      Math.cos(radians) *
      weight;

    y +=
      Math.sin(radians) *
      weight;
  });

  const degrees =
    (
      Math.atan2(y, x) *
      180 /
      Math.PI +
      360
    ) % 360;

  return {
    deg: degrees,
    text: compass(degrees)
  };
}

function conditionInfo(
  current,
  isNight
) {
  const rain =
    Number(
      current.rain_rate_mm_h || 0
    );

  const wind =
    Number(
      current.wind_speed_kmh || 0
    );

  const solar =
    Number(
      current.solar_w_m2 || 0
    );

  const uv =
    Number(
      current.uv_index || 0
    );

  if (rain >= 2.5) {
    return {
      tag: "Rainy",
      icon: "🌧️",
      story:
        `Rain is falling at ${n(rain)} mm/h.`,
      className:
        "weather-rain"
    };
  }

  if (rain > 0) {
    return {
      tag: "Light rain",
      icon: "🌦️",
      story:
        `Light rain is falling at ${n(rain)} mm/h.`,
      className:
        "weather-rain"
    };
  }

  if (wind >= 35) {
    return {
      tag: "Very windy",
      icon: "💨",
      story:
        `A lively Wexford breeze is blowing at ${n(wind)} km/h.`,
      className:
        "weather-windy"
    };
  }

  if (wind >= 20) {
    return {
      tag: "Breezy",
      icon: "🌬️",
      story:
        `Breezy conditions with wind around ${n(wind)} km/h.`,
      className:
        "weather-windy"
    };
  }

  if (isNight) {
    return {
      tag: "Night",
      icon: "🌙",
      story:
        "Night-time conditions at Parknacross.",
      className:
        "weather-neutral"
    };
  }

  if (
    uv >= 5 ||
    solar >= 400
  ) {
    return {
      tag: "Bright",
      icon: "☀️",
      story:
        "Bright conditions over Parknacross right now.",
      className:
        "weather-bright"
    };
  }

  if (solar >= 100) {
    return {
      tag:
        "Some brightness",
      icon:
        "⛅",
      story:
        "Some brightness breaking through at Parknacross.",
      className:
        "weather-bright"
    };
  }

  return {
    tag:
      "Calm & local",
    icon:
      "☁️",
    story:
      "Quiet local conditions at Parknacross.",
    className:
      "weather-neutral"
  };
}

/*
 * NOAA-style sunrise/sunset calculation
 * using the public Ardamine area centre.
 */

function dayOfYear(date) {
  const start =
    new Date(
      date.getFullYear(),
      0,
      0
    );

  return Math.floor(
    (date - start) /
    86400000
  );
}

function normalize360(value) {
  return (
    (value % 360) +
    360
  ) % 360;
}

function sunEvent(
  date,
  latitude,
  longitude,
  sunrise
) {
  const zenith = 90.833;

  const N =
    dayOfYear(date);

  const lngHour =
    longitude / 15;

  const t =
    N +
    (
      (sunrise ? 6 : 18) -
      lngHour
    ) /
    24;

  const M =
    (0.9856 * t) -
    3.289;

  let L =
    M +
    1.916 *
      Math.sin(
        M *
        Math.PI /
        180
      ) +
    0.020 *
      Math.sin(
        2 *
        M *
        Math.PI /
        180
      ) +
    282.634;

  L =
    normalize360(L);

  let RA =
    Math.atan(
      0.91764 *
      Math.tan(
        L *
        Math.PI /
        180
      )
    ) *
    180 /
    Math.PI;

  RA =
    normalize360(RA);

  const Lquadrant =
    Math.floor(
      L / 90
    ) *
    90;

  const RAquadrant =
    Math.floor(
      RA / 90
    ) *
    90;

  RA =
    (
      RA +
      (
        Lquadrant -
        RAquadrant
      )
    ) /
    15;

  const sinDec =
    0.39782 *
    Math.sin(
      L *
      Math.PI /
      180
    );

  const cosDec =
    Math.cos(
      Math.asin(
        sinDec
      )
    );

  const cosH =
    (
      Math.cos(
        zenith *
        Math.PI /
        180
      ) -
      (
        sinDec *
        Math.sin(
          latitude *
          Math.PI /
          180
        )
      )
    ) /
    (
      cosDec *
      Math.cos(
        latitude *
        Math.PI /
        180
      )
    );

  if (
    cosH > 1 ||
    cosH < -1
  ) {
    return null;
  }

  let H =
    sunrise
      ? 360 -
        Math.acos(
          cosH
        ) *
        180 /
        Math.PI
      : Math.acos(
          cosH
        ) *
        180 /
        Math.PI;

  H /= 15;

  const T =
    H +
    RA -
    (0.06571 * t) -
    6.622;

  const UT =
    normalize360(
      (
        T -
        lngHour
      ) *
      15
    ) /
    15;

  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0
    ) +
    UT *
    3600000
  );
}

function updateSunInfo() {
  const now =
    new Date();

  const rise =
    sunEvent(
      now,
      ARDAMINE_LAT,
      ARDAMINE_LON,
      true
    );

  const setTime =
    sunEvent(
      now,
      ARDAMINE_LAT,
      ARDAMINE_LON,
      false
    );

  const fmt =
    date =>
      date
        ? date.toLocaleTimeString(
            "en-IE",
            {
              hour:
                "2-digit",
              minute:
                "2-digit"
            }
          )
        : "--";

  set(
    "sunrise",
    fmt(rise)
  );

  set(
    "sunset",
    fmt(setTime)
  );

  const isNight =
    !!(
      rise &&
      setTime &&
      (
        now < rise ||
        now >= setTime
      )
    );

  if (
    rise &&
    setTime
  ) {
    if (
      now >= rise &&
      now < setTime
    ) {
      const mins =
        Math.max(
          0,
          Math.floor(
            (
              setTime -
              now
            ) /
            60000
          )
        );

      set(
        "daylightRemaining",
        `${Math.floor(
          mins / 60
        )}h ${mins % 60}m`
      );
    } else {
      set(
        "daylightRemaining",
        "Night"
      );
    }
  }

  document.body.classList.toggle(
    "is-night",
    isNight
  );

  return isNight;
}

function dailyRainTotals() {
  const days =
    new Map();

  history7d.forEach(
    reading => {
      const time =
        readingTime(
          reading
        );

      const correctedRain =
        correctedDailyRain(
          reading
        );

      if (
        !time ||
        !usable(
          correctedRain
        )
      ) {
        return;
      }

      const date =
        new Date(time);

      const key =
        [
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        ].join("-");

      const rain =
        Number(
          correctedRain
        );

      const existing =
        days.get(key);

      if (
        !existing ||
        rain >
          existing.rain
      ) {
        days.set(
          key,
          {
            time,
            rain
          }
        );
      }
    }
  );

  return [
    ...days.values()
  ]
    .sort(
      (a, b) =>
        a.time -
        b.time
    )
    .slice(-7);
}

function updateFreshness(
  current
) {
  const time =
    readingTime(current);

  const pill =
    $("livePill");

  if (
    !time ||
    !pill
  ) {
    return;
  }

  const age =
    Date.now() -
    time;

  pill.classList.remove(
    "delayed",
    "offline"
  );

  if (
    age >=
    OFFLINE_AFTER_MS
  ) {
    pill.classList.add(
      "offline"
    );

    set(
      "liveText",
      "STATION DATA OFFLINE"
    );

    set(
      "cloudStatus",
      "Offline"
    );

    $("cloudStatus")
      ?.classList
      .add("bad");

  } else if (
    age >=
    STALE_AFTER_MS
  ) {
    pill.classList.add(
      "delayed"
    );

    set(
      "liveText",
      "STATION DATA DELAYED"
    );

    set(
      "cloudStatus",
      "Delayed"
    );

    $("cloudStatus")
      ?.classList
      .add("warn");

  } else {
    set(
      "liveText",
      "LIVE FROM PARKNACROSS"
    );

    set(
      "cloudStatus",
      "Connected"
    );

    $("cloudStatus")
      ?.classList
      .remove(
        "bad",
        "warn"
      );

    $("cloudStatus")
      ?.classList
      .add("ok");
  }
}

function updateStatsPanel() {
  if (!stats) return;

  set(
    "monthRain",
    `${n(
      stats.month_rain_mm
    )} mm`
  );

  set(
    "monthRainDays",
    `${
      stats.month_rain_days ??
      0
    } rain day${
      stats.month_rain_days === 1
        ? ""
        : "s"
    } this month`
  );

  set(
    "yearRain",
    `${n(
      stats.year_rain_mm
    )} mm`
  );

  set(
    "stationSince",
    dateLabel(
      stats.first_epoch
    )
  );

  if (
    stats.wettest_day
  ) {
    set(
      "wettestDay",
      `${n(
        stats
          .wettest_day
          .rain_mm
      )} mm`
    );

    set(
      "wettestDate",
      dateLabel(
        `${
          stats
            .wettest_day
            .day
        }T12:00:00`
      )
    );
  }

  const records =
    stats.records || {};

  if (
    records
      .high_temperature
  ) {
    set(
      "allHigh",
      `${n(
        records
          .high_temperature
          .value
      )} °C`
    );

    set(
      "allHighDate",
      dateLabel(
        records
          .high_temperature
          .epoch
      )
    );
  }

  if (
    records
      .low_temperature
  ) {
    set(
      "allLow",
      `${n(
        records
          .low_temperature
          .value
      )} °C`
    );

    set(
      "allLowDate",
      dateLabel(
        records
          .low_temperature
          .epoch
      )
    );
  }

  if (
    records
      .peak_gust
  ) {
    set(
      "allGust",
      `${n(
        records
          .peak_gust
          .value
      )} km/h`
    );

    set(
      "allGustDate",
      dateLabel(
        records
          .peak_gust
          .epoch
      )
    );
  }

  if (
    records
      .high_pressure
  ) {
    set(
      "allPressure",
      `${n(
        records
          .high_pressure
          .value
      )} hPa`
    );

    set(
      "allPressureDate",
      dateLabel(
        records
          .high_pressure
          .epoch
      )
    );
  }
}

function updateDashboard(
  current
) {
  const now =
    new Date();

  const today =
    history24.filter(
      reading => {
        const time =
          readingTime(
            reading
          );

        return (
          time &&
          sameDay(
            time,
            now
          )
        );
      }
    );

  const highReading =
    recordReading(
      today,
      "temperature_c",
      "max"
    );

  const lowReading =
    recordReading(
      today,
      "temperature_c",
      "min"
    );

  const gustReading =
    recordReading(
      today,
      "wind_gust_kmh",
      "max"
    );

  const solarReading =
    recordReading(
      today,
      "solar_w_m2",
      "max"
    );

  const pressure =
    pressureStats();

  const direction =
    compass(
      current
        .wind_direction_deg
    );

  const rainToday =
    correctedDailyRain(
      current
    );

  const currentTime =
    readingTime(
      current
    );

  const isNight =
    updateSunInfo();

  const condition =
    conditionInfo(
      current,
      isNight
    );

  if (currentTime) {
    const date =
      new Date(
        currentTime
      );

    set(
      "lastUpdated",
      `Updated ${
        date.toLocaleTimeString(
          "en-IE",
          {
            hour:
              "2-digit",
            minute:
              "2-digit"
          }
        )
      } · ${
        date.toLocaleDateString(
          "en-IE",
          {
            day:
              "2-digit",
            month:
              "short"
          }
        )
      }`
    );
  }

  set(
    "heroTemp",
    n(
      current
        .temperature_c
    )
  );

  set(
    "heroFeels",
    `${n(
      current
        .feels_like_c
    )}°C`
  );

  set(
    "heroHumidity",
    `${n(
      current
        .humidity,
      0
    )}%`
  );

  set(
    "heroDew",
    `${n(
      current
        .dew_point_c
    )}°C`
  );

  set(
    "heroWind",
    `${n(
      current
        .wind_speed_kmh
    )} km/h`
  );

  set(
    "heroRain",
    `${n(
      rainToday
    )} mm`
  );

  set(
    "heroPressure",
    `${n(
      current
        .pressure_hpa
    )} hPa`
  );

  set(
    "heroTrend",
    pressure.trend === "--"
      ? "--"
      : `${pressure.trend} pressure`
  );

  set(
    "weatherStory",
    condition.story
  );

  set(
    "conditionsTag",
    condition.tag
  );

  set(
    "weatherIcon",
    condition.icon
  );

  document.body
    .classList
    .remove(
      "weather-neutral",
      "weather-rain",
      "weather-bright",
      "weather-windy"
    );

  document.body
    .classList
    .add(
      condition
        .className
    );

  set(
    "todayLow",
    n(
      lowReading
        ?.temperature_c
    )
  );

  set(
    "todayHigh",
    n(
      highReading
        ?.temperature_c
    )
  );

  set(
    "peakGust",
    n(
      gustReading
        ?.wind_gust_kmh
    )
  );

  set(
    "summaryRain",
    n(
      rainToday
    )
  );

  set(
    "solarPeak",
    n(
      solarReading
        ?.solar_w_m2,
      0
    )
  );

  set(
    "tempVal",
    n(
      current
        .temperature_c
    )
  );

  set(
    "feelsVal",
    `${n(
      current
        .feels_like_c
    )}°C`
  );

  set(
    "tempMin",
    n(
      lowReading
        ?.temperature_c
    )
  );

  set(
    "tempMax",
    n(
      highReading
        ?.temperature_c
    )
  );

  set(
    "humVal",
    n(
      current
        .humidity,
      0
    )
  );

  set(
    "dewVal",
    `${n(
      current
        .dew_point_c
    )}°C`
  );

  set(
    "comfortVal",
    comfort(
      current
        .humidity
    )
  );

  set(
    "windVal",
    n(
      current
        .wind_speed_kmh
    )
  );

  set(
    "gustVal",
    `${n(
      current
        .wind_gust_kmh
    )} km/h`
  );

  set(
    "dirVal",
    usable(
      current
        .wind_direction_deg
    )
      ? `${
          direction
        } (${
          Math.round(
            Number(
              current
                .wind_direction_deg
            )
          )
        }°)`
      : direction
  );

  set(
    "rainVal",
    n(
      rainToday
    )
  );

  set(
    "rainRateVal",
    `${n(
      current
        .rain_rate_mm_h
    )} mm/h`
  );

  set(
    "pressureVal",
    n(
      current
        .pressure_hpa
    )
  );

  set(
    "pressureTrend",
    pressure.trend
  );

  set(
    "pressureChange",
    usable(
      pressure.change
    )
      ? `${
          pressure.change >= 0
            ? "+"
            : ""
        }${
          n(
            pressure.change
          )
        } hPa`
      : "--"
  );

  set(
    "solarVal",
    n(
      current
        .solar_w_m2,
      0
    )
  );

  set(
    "uvVal",
    n(
      current
        .uv_index,
      0
    )
  );

  set(
    "battery",
    usable(
      current
        .battery_v
    )
      ? `${n(
          current
            .battery_v,
          2
        )} V · ${
          batteryStatus(
            current
              .battery_v
          )
        }`
      : "--"
  );

  const threeHoursAgo =
    closestReadingTo(
      Date.now() -
      3 *
      60 *
      60 *
      1000
    );

  updateTrend(
    "temp3h",
    current
      .temperature_c,
    threeHoursAgo
      ?.temperature_c,
    "°C"
  );

  updateTrend(
    "pressure3h",
    current
      .pressure_hpa,
    threeHoursAgo
      ?.pressure_hpa,
    "hPa"
  );

  const prevailing =
    prevailingWind();

  set(
    "prevailing",
    prevailing.text
  );

  if (
    usable(
      prevailing.deg
    ) &&
    $("needle")
  ) {
    $("needle")
      .style
      .transform =
        `rotate(${prevailing.deg}deg)`;
  }

  set(
    "currentDirection",
    usable(
      current
        .wind_direction_deg
    )
      ? `${
          direction
        } · ${
          Math.round(
            Number(
              current
                .wind_direction_deg
            )
          )
        }°`
      : direction
  );

  set(
    "currentWind",
    `${n(
      current
        .wind_speed_kmh
    )} km/h`
  );

  set(
    "currentGust",
    `${n(
      current
        .wind_gust_kmh
    )} km/h`
  );

  set(
    "recordHigh",
    `${n(
      highReading
        ?.temperature_c
    )} °C`
  );

  set(
    "recordHighTime",
    highReading
      ? `at ${
          timeLabel(
            highReading
          )
        }`
      : "--"
  );

  set(
    "recordLow",
    `${n(
      lowReading
        ?.temperature_c
    )} °C`
  );

  set(
    "recordLowTime",
    lowReading
      ? `at ${
          timeLabel(
            lowReading
          )
        }`
      : "--"
  );

  set(
    "recordGust",
    `${n(
      gustReading
        ?.wind_gust_kmh
    )} km/h`
  );

  set(
    "recordGustTime",
    gustReading
      ? `at ${
          timeLabel(
            gustReading
          )
        }`
      : "--"
  );

  set(
    "recordRain",
    `${n(
      rainToday
    )} mm`
  );

  updateFreshness(
    current
  );

  updateStatsPanel();

  set(
    "year",
    new Date()
      .getFullYear()
  );
}

function scales(title) {
  return {
    x: {
      grid: {
        color:
          "transparent"
      },
      ticks: {
        color:
          "#a8bfd4",
        maxTicksLimit:
          8
      }
    },
    y: {
      grid: {
        color:
          "rgba(163,209,255,.10)"
      },
      ticks: {
        color:
          "#a8bfd4"
      },
      title: {
        display:
          true,
        text:
          title,
        color:
          "#a8bfd4"
      }
    }
  };
}

function line(
  label,
  colour,
  axis = "y"
) {
  return {
    label,
    data: [],
    borderColor:
      colour,
    backgroundColor:
      colour,
    borderWidth:
      2.2,
    pointRadius:
      0,
    pointHoverRadius:
      4,
    tension:
      0.3,
    fill:
      false,
    yAxisID:
      axis
  };
}

function createCharts() {
  Chart.defaults.color =
    "#bfd0e3";

  Chart.defaults
    .font
    .family =
      "Inter,system-ui,sans-serif";

  charts.temperature =
    new Chart(
      $("temperatureChart"),
      {
        type:
          "line",

        data: {
          labels: [],
          datasets: [
            line(
              "Temperature °C",
              "#ff8d8d"
            ),
            line(
              "Dew point °C",
              "#6ef1cb"
            )
          ]
        },

        options: {
          maintainAspectRatio:
            false,

          interaction: {
            mode:
              "index",
            intersect:
              false
          },

          scales:
            scales("°C"),

          plugins: {
            legend: {
              position:
                "bottom"
            }
          }
        }
      }
    );

  charts.wind =
    new Chart(
      $("windChart"),
      {
        type:
          "line",

        data: {
          labels: [],
          datasets: [
            line(
              "Wind km/h",
              "#74ddff"
            ),
            line(
              "Gust km/h",
              "#ffad66"
            )
          ]
        },

        options: {
          maintainAspectRatio:
            false,

          interaction: {
            mode:
              "index",
            intersect:
              false
          },

          scales:
            scales(
              "km/h"
            ),

          plugins: {
            legend: {
              position:
                "bottom"
            }
          }
        }
      }
    );

  charts.pressure =
    new Chart(
      $("pressureChart"),
      {
        type:
          "line",

        data: {
          labels: [],
          datasets: [
            line(
              "Pressure hPa",
              "#b594ff"
            )
          ]
        },

        options: {
          maintainAspectRatio:
            false,

          interaction: {
            mode:
              "index",
            intersect:
              false
          },

          scales:
            scales(
              "hPa"
            ),

          plugins: {
            legend: {
              display:
                false
            }
          }
        }
      }
    );

  charts.rain =
    new Chart(
      $("rainChart"),
      {
        type:
          "bar",

        data: {
          labels: [],

          datasets: [
            {
              label:
                "Rainfall mm",

              data:
                [],

              backgroundColor:
                "#7ca9ff",

              borderRadius:
                8
            }
          ]
        },

        options: {
          maintainAspectRatio:
            false,

          scales:
            scales("mm"),

          plugins: {
            legend: {
              display:
                false
            }
          }
        }
      }
    );

  charts.solar =
    new Chart(
      $("solarChart"),
      {
        type:
          "line",

        data: {
          labels: [],

          datasets: [
            line(
              "Solar W/m²",
              "#ffd77a",
              "y"
            ),

            line(
              "UV index",
              "#b594ff",
              "y1"
            )
          ]
        },

        options: {
          maintainAspectRatio:
            false,

          interaction: {
            mode:
              "index",
            intersect:
              false
          },

          scales: {
            x: {
              grid: {
                color:
                  "transparent"
              },

              ticks: {
                color:
                  "#a8bfd4",

                maxTicksLimit:
                  8
              }
            },

            y: {
              position:
                "left",

              beginAtZero:
                true,

              grid: {
                color:
                  "rgba(163,209,255,.10)"
              },

              ticks: {
                color:
                  "#a8bfd4"
              },

              title: {
                display:
                  true,

                text:
                  "W/m²",

                color:
                  "#a8bfd4"
              }
            },

            y1: {
              position:
                "right",

              beginAtZero:
                true,

              grid: {
                drawOnChartArea:
                  false
              },

              ticks: {
                color:
                  "#a8bfd4"
              },

              title: {
                display:
                  true,

                text:
                  "UV",

                color:
                  "#a8bfd4"
              }
            }
          },

          plugins: {
            legend: {
              position:
                "bottom"
            }
          }
        }
      }
    );
}

function updateCharts() {
  const rows =
    history24.filter(
      reading =>
        readingTime(
          reading
        )
    );

  const labels =
    rows.map(
      reading =>
        new Date(
          readingTime(
            reading
          )
        )
          .toLocaleTimeString(
            "en-IE",
            {
              hour:
                "2-digit",

              minute:
                "2-digit"
            }
          )
    );

  charts.temperature
    .data
    .labels =
      labels;

  charts.temperature
    .data
    .datasets[0]
    .data =
      rows.map(
        row =>
          row.temperature_c
      );

  charts.temperature
    .data
    .datasets[1]
    .data =
      rows.map(
        row =>
          row.dew_point_c
      );

  charts.temperature
    .update();

  charts.wind
    .data
    .labels =
      labels;

  charts.wind
    .data
    .datasets[0]
    .data =
      rows.map(
        row =>
          row.wind_speed_kmh
      );

  charts.wind
    .data
    .datasets[1]
    .data =
      rows.map(
        row =>
          row.wind_gust_kmh
      );

  charts.wind
    .update();

  charts.pressure
    .data
    .labels =
      labels;

  charts.pressure
    .data
    .datasets[0]
    .data =
      rows.map(
        row =>
          row.pressure_hpa
      );

  charts.pressure
    .update();

  charts.solar
    .data
    .labels =
      labels;

  charts.solar
    .data
    .datasets[0]
    .data =
      rows.map(
        row =>
          row.solar_w_m2
      );

  charts.solar
    .data
    .datasets[1]
    .data =
      rows.map(
        row =>
          row.uv_index
      );

  charts.solar
    .update();

  const rainfall =
    dailyRainTotals();

  charts.rain
    .data
    .labels =
      rainfall.map(
        day =>
          new Date(
            day.time
          )
            .toLocaleDateString(
              "en-IE",
              {
                weekday:
                  "short"
              }
            )
      );

  charts.rain
    .data
    .datasets[0]
    .data =
      rainfall.map(
        day =>
          day.rain
      );

  charts.rain
    .update();
}

async function getJSON(url) {
  const response =
    await fetch(
      url,
      {
        cache:
          "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (data?.error) {
    throw new Error(
      data.error
    );
  }

  return data;
}

async function loadForecast() {
  try {
    const forecast =
      await getJSON(
        FORECAST_URL
      );

    set(
      "forecastToday",
      forecast.today ||
        "Forecast unavailable."
    );

    set(
      "forecastTonight",
      forecast.tonight ||
        "--"
    );

    set(
      "forecastTomorrow",
      forecast.tomorrow ||
        "--"
    );

  } catch (error) {
    console.warn(
      "Met Éireann forecast:",
      error
    );

    set(
      "forecastToday",
      "Official forecast temporarily unavailable."
    );
  }
}

async function loadWarnings() {
  try {
    const warnings =
      await getJSON(
        WARNINGS_URL
      );

    const list =
      Array.isArray(
        warnings.warnings
      )
        ? warnings.warnings
        : [];

    const banner =
      $("warningBanner");

    if (
      !banner ||
      !list.length
    ) {
      if (banner) {
        banner.hidden =
          true;
      }

      return;
    }

    const warning =
      list[0];

    banner.hidden =
      false;

    banner.classList.remove(
      "level-orange",
      "level-red"
    );

    if (
      String(
        warning.level
      ).toLowerCase() ===
      "orange"
    ) {
      banner.classList.add(
        "level-orange"
      );
    }

    if (
      String(
        warning.level
      ).toLowerCase() ===
      "red"
    ) {
      banner.classList.add(
        "level-red"
      );
    }

    set(
      "warningTitle",
      `${String(
        warning.level ||
        "Weather"
      ).toUpperCase()} warning for Wexford${
        warning.type
          ? ` · ${warning.type}`
          : ""
      }`
    );

    const onset =
      warning.onset
        ? new Date(
            warning.onset
          )
        : null;

    const expires =
      warning.expires
        ? new Date(
            warning.expires
          )
        : null;

    const timing =
      onset &&
      expires
        ? `Valid ${
            onset
              .toLocaleString(
                "en-IE",
                {
                  day:
                    "numeric",
                  month:
                    "short",
                  hour:
                    "2-digit",
                  minute:
                    "2-digit"
                }
              )
          } to ${
            expires
              .toLocaleString(
                "en-IE",
                {
                  day:
                    "numeric",
                  month:
                    "short",
                  hour:
                    "2-digit",
                  minute:
                    "2-digit"
                }
              )
          }. `
        : "";

    set(
      "warningText",
      `${timing}${
        warning.description ||
        warning.headline ||
        ""
      }`
    );

  } catch (error) {
    console.warn(
      "Met Éireann warnings:",
      error
    );
  }
}

async function loadEverything() {
  try {
    /*
     * Current conditions and 24h history
     * are the essential feeds.
     *
     * The longer-range history and
     * stats endpoint are optional.
     */

    const [
      current,
      history24Response
    ] =
      await Promise.all(
        [
          getJSON(
            CURRENT_URL
          ),
          getJSON(
            HISTORY_24_URL
          )
        ]
      );

    history24 =
      Array.isArray(
        history24Response
          .readings
      )
        ? history24Response
            .readings
        : [];

    try {
      const history7Response =
        await getJSON(
          HISTORY_7D_URL
        );

      history7d =
        Array.isArray(
          history7Response
            .readings
        )
          ? history7Response
              .readings
          : [];

    } catch (error) {
      console.warn(
        "7-day history unavailable:",
        error
      );

      history7d =
        [];
    }

    try {
      stats =
        await getJSON(
          STATS_URL
        );

    } catch (error) {
      console.warn(
        "Extended station stats unavailable:",
        error
      );

      stats =
        null;
    }

    updateDashboard(
      current
    );

    updateCharts();

  } catch (error) {
    console.error(
      "Parknacross Weather:",
      error
    );

    set(
      "cloudStatus",
      "Error"
    );

    $("cloudStatus")
      ?.classList
      .remove(
        "ok",
        "warn"
      );

    $("cloudStatus")
      ?.classList
      .add("bad");

    set(
      "conditionsTag",
      "Feed unavailable"
    );

    set(
      "lastUpdated",
      "Unable to load live weather"
    );

    $("livePill")
      ?.classList
      .add(
        "offline"
      );

    set(
      "liveText",
      "STATION DATA UNAVAILABLE"
    );
  }
}

async function refreshCurrent() {
  try {
    const current =
      await getJSON(
        CURRENT_URL
      );

    updateDashboard(
      current
    );

  } catch (error) {
    console.error(
      "Current refresh:",
      error
    );
  }
}

function setupPWA() {
  if (
    "serviceWorker" in
    navigator
  ) {
    navigator
      .serviceWorker
      .register(
        "service-worker.js"
      )
      .catch(
        error =>
          console.warn(
            "Service worker:",
            error
          )
      );
  }

  window.addEventListener(
    "beforeinstallprompt",
    event => {
      event.preventDefault();

      deferredInstallPrompt =
        event;

      const button =
        $("installButton");

      if (button) {
        button.hidden =
          false;
      }
    }
  );

  $("installButton")
    ?.addEventListener(
      "click",
      async () => {
        if (
          !deferredInstallPrompt
        ) {
          return;
        }

        deferredInstallPrompt
          .prompt();

        await deferredInstallPrompt
          .userChoice;

        deferredInstallPrompt =
          null;

        $("installButton")
          .hidden =
            true;
      }
    );
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    createCharts();

    updateSunInfo();

    loadEverything();

    loadForecast();

    loadWarnings();

    setupPWA();

    setInterval(
      refreshCurrent,
      60 * 1000
    );

    setInterval(
      loadEverything,
      5 *
      60 *
      1000
    );

    setInterval(
      updateSunInfo,
      60 * 1000
    );

    setInterval(
      loadWarnings,
      5 *
      60 *
      1000
    );

    setInterval(
      loadForecast,
      30 *
      60 *
      1000
    );
  }
);
