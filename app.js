
const set = (id, value) => {
const element = $(id);

if (element) {
element.textContent = value;
}
@@ -40,101 +39,62 @@ let charts = {};
let deferredInstallPrompt = null;


/* ---------------------------------------------------------
   Rain correction
--------------------------------------------------------- */

/*
 * 0.1 mm on commissioning day was a test,
 * not genuine rainfall.
 */
/* =========================================================
   RAIN CORRECTION
========================================================= */

const RAIN_CORRECTIONS_MM = {
"2026-09-11": 0.1
};


/* ---------------------------------------------------------
   General helpers
--------------------------------------------------------- */
/* =========================================================
   GENERAL HELPERS
========================================================= */

function readingTime(reading) {

if (reading?.received_at) {
    const time = new Date(reading.received_at).getTime();

    const time =
      new Date(
        reading.received_at
      ).getTime();

    if (
      Number.isFinite(time)
    ) {
    if (Number.isFinite(time)) {
return time;
}
}

  return usable(
    reading?.epoch
  )
    ? Number(
        reading.epoch
      ) * 1000
  return usable(reading?.epoch)
    ? Number(reading.epoch) * 1000
: null;
}


function localDateKey(reading) {

  const time =
    readingTime(
      reading
    );
  const time = readingTime(reading);

if (!time) {
return null;
}

  const date =
    new Date(time);
  const date = new Date(time);

return [
date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    )
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
].join("-");
}


function correctedDailyRain(reading) {
  const raw = Number(reading?.rain_daily_mm);

  const raw =
    Number(
      reading?.rain_daily_mm
    );

  if (
    !Number.isFinite(raw)
  ) {
  if (!Number.isFinite(raw)) {
return null;
}

const correction =
Number(
RAIN_CORRECTIONS_MM[
        localDateKey(
          reading
        )
        localDateKey(reading)
] || 0
);

@@ -149,371 +109,200 @@ function correctedDailyRain(reading) {
}


function sameDay(
  time,
  reference = new Date()
) {

  const date =
    new Date(time);
function sameDay(time, reference = new Date()) {
  const date = new Date(time);

return (
    date.getFullYear() ===
      reference.getFullYear() &&

    date.getMonth() ===
      reference.getMonth() &&

    date.getDate() ===
      reference.getDate()
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
);
}


function compass(degrees) {

  if (
    !usable(degrees)
  ) {
  if (!usable(degrees)) {
return "--";
}

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
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW"
];

const direction =
    (
      (
        Number(degrees) %
        360
      ) +
      360
    ) %
    360;
    ((Number(degrees) % 360) + 360) % 360;

return labels[
    Math.round(
      direction / 22.5
    ) % 16
    Math.round(direction / 22.5) % 16
];
}


function comfort(humidity) {
  const value = Number(humidity);

  const value =
    Number(humidity);

  if (
    !Number.isFinite(value)
  ) {
  if (!Number.isFinite(value)) {
return "--";
}

  if (
    value < 35
  ) {
  if (value < 35) {
return "Dry";
}

  if (
    value <= 65
  ) {
  if (value <= 65) {
return "Comfortable";
}

  if (
    value <= 80
  ) {
  if (value <= 80) {
return "Humid";
}

return "Very humid";
}


/* ---------------------------------------------------------
   WS90 battery
--------------------------------------------------------- */

/*
 * The Ecowitt WS90 battery value currently arriving
 * through the feed behaves as a status flag:
 *
 * 0 = battery OK
 * 1 = battery low
 *
 * If Ecowitt supplies an actual voltage instead,
 * the fallback voltage logic below will handle it.
 */

function batteryStatus(value) {

  if (
    !usable(value)
  ) {
    return "--";
  }

  const battery =
    Number(value);

  if (
    battery === 0
  ) {
    return "OK";
  }
/* =========================================================
   WS90 BATTERY STATUS

  if (
    battery === 1
  ) {
    return "Low";
  }
   Ecowitt WS90 battery status:
   0 = OK
   1 = LOW
========================================================= */

function batteryDisplay(value) {
if (
    battery >= 3.0
    value === null ||
    value === undefined ||
    value === ""
) {
    return "Excellent";
    return "Status unavailable";
}

  if (
    battery >= 2.8
  ) {
    return "Good";
  }
  const battery = Number(value);

  if (
    battery >= 2.5
  ) {
    return "Fair";
  if (!Number.isFinite(battery)) {
    return "Status unavailable";
}

  if (
    battery >= 2.3
  ) {
    return "Low";
  if (battery === 0) {
    return "OK";
}

  return "Check";
}


function batteryDisplay(value) {

  if (
    !usable(value)
  ) {
    return "--";
  if (battery === 1) {
    return "LOW";
}

  const battery =
    Number(value);

/*
   * Ecowitt status flag
   * Fallback in case a future feed supplies
   * an actual voltage instead of a status flag.
  */

  if (
    battery === 0
  ) {
  if (battery >= 2.3) {
return "OK";
}

  if (
    battery === 1
  ) {
    return "Low";
  }

  /*
   * Actual voltage fallback
   */

  return (
    `${battery.toFixed(2)} V · ${batteryStatus(battery)}`
  );
  return "Check";
}


/* ---------------------------------------------------------
   Records
--------------------------------------------------------- */

function recordReading(
  rows,
  field,
  mode = "max"
) {
/* =========================================================
   RECORD HELPERS
========================================================= */

function recordReading(rows, field, mode = "max") {
const valid =
rows.filter(
      row =>
        usable(
          row[field]
        )
      row => usable(row[field])
);

  if (
    !valid.length
  ) {
  if (!valid.length) {
return null;
}

return valid.reduce(
    (
      best,
      row
    ) => {

    (best, row) => {
if (!best) {
return row;
}

      const a =
        Number(
          row[field]
        );
      const a = Number(row[field]);
      const b = Number(best[field]);

      const b =
        Number(
          best[field]
        );

      return (
        mode === "min"
          ? (
              a < b
                ? row
                : best
            )
          : (
              a > b
                ? row
                : best
            )
      );
      return mode === "min"
        ? (a < b ? row : best)
        : (a > b ? row : best);
},
null
);
}


function timeLabel(reading) {

  const time =
    readingTime(
      reading
    );
  const time = readingTime(reading);

if (!time) {
return "--";
}

  return new Date(
    time
  ).toLocaleTimeString(
    "en-IE",
    {
      hour:
        "2-digit",

      minute:
        "2-digit"
    }
  );
  return new Date(time)
    .toLocaleTimeString(
      "en-IE",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );
}


function dateLabel(value) {

if (!value) {
return "--";
}

const date =
typeof value === "number"
      ? new Date(
          value * 1000
        )
      : new Date(
          value
        );
      ? new Date(value * 1000)
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
  if (Number.isNaN(date.getTime())) {
return "--";
}

return date.toLocaleDateString(
"en-IE",
{
      day:
        "numeric",

      month:
        "short",

      year:
        "numeric"
      day: "numeric",
      month: "short",
      year: "numeric"
}
);
}


/* ---------------------------------------------------------
   Pressure
--------------------------------------------------------- */
/* =========================================================
   PRESSURE
========================================================= */

function pressureStats() {

const rows =
history24.filter(
      row =>
        usable(
          row.pressure_hpa
        )
      row => usable(row.pressure_hpa)
);

  if (
    rows.length < 2
  ) {
  if (rows.length < 2) {
return {
      change:
        null,

      trend:
        "--"
      change: null,
      trend: "--"
};
}

const change =
    Number(
      rows.at(-1)
        .pressure_hpa
    ) -
    Number(
      rows[0]
        .pressure_hpa
    );
    Number(rows.at(-1).pressure_hpa) -
    Number(rows[0].pressure_hpa);

return {
change,
@@ -528,26 +317,15 @@ function pressureStats() {
}


function closestReadingTo(
  targetTime
) {

  if (
    !history24.length
  ) {
function closestReadingTo(targetTime) {
  if (!history24.length) {
return null;
}

return history24.reduce(
    (
      best,
      row
    ) => {

    (best, row) => {
const t =
        readingTime(
          row
        );
        readingTime(row);

if (!t) {
return best;
@@ -559,13 +337,10 @@ function closestReadingTo(

return (
Math.abs(
          t -
          targetTime
          t - targetTime
) <
Math.abs(
          readingTime(
            best
          ) -
          readingTime(best) -
targetTime
)
? row
@@ -584,35 +359,20 @@ function updateTrend(
unit,
digits = 1
) {

  const element =
    $(id);
  const element = $(id);

if (
!element ||
    !usable(
      currentValue
    ) ||
    !usable(
      oldValue
    )
    !usable(currentValue) ||
    !usable(oldValue)
) {

    set(
      id,
      "--"
    );

    set(id, "--");
return;
}

const delta =
    Number(
      currentValue
    ) -
    Number(
      oldValue
    );
    Number(currentValue) -
    Number(oldValue);

const arrow =
delta > 0.05
@@ -645,12 +405,11 @@ function updateTrend(
}


/* ---------------------------------------------------------
   Wind
--------------------------------------------------------- */
/* =========================================================
   WIND
========================================================= */

function prevailingWind() {

const rows =
history24.filter(
row =>
@@ -659,205 +418,132 @@ function prevailingWind() {
)
);

  if (
    !rows.length
  ) {

  if (!rows.length) {
return {
      deg:
        null,

      text:
        "--"
      deg: null,
      text: "--"
};
}

let x = 0;
let y = 0;

  rows.forEach(
    row => {

      const weight =
        usable(
          row.wind_speed_kmh
        )
          ? Math.max(
              Number(
                row.wind_speed_kmh
              ),
              1
            )
          : 1;
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
    const radians =
      Number(
        row.wind_direction_deg
      ) *
      Math.PI /
      180;

      x +=
        Math.cos(
          radians
        ) *
        weight;
    x +=
      Math.cos(radians) *
      weight;

      y +=
        Math.sin(
          radians
        ) *
        weight;
    }
  );
    y +=
      Math.sin(radians) *
      weight;
  });

const degrees =
(
      Math.atan2(
        y,
        x
      ) *
      Math.atan2(y, x) *
180 /
Math.PI +
360
) %
360;

return {
    deg:
      degrees,

    text:
      compass(
        degrees
      )
    deg: degrees,
    text: compass(degrees)
};
}


/* ---------------------------------------------------------
   Current weather description
--------------------------------------------------------- */

function conditionInfo(
  current,
  isNight
) {
/* =========================================================
   CONDITION DESCRIPTION
========================================================= */

function conditionInfo(current, isNight) {
const rain =
Number(
      current.rain_rate_mm_h ||
      0
      current.rain_rate_mm_h || 0
);

const wind =
Number(
      current.wind_speed_kmh ||
      0
      current.wind_speed_kmh || 0
);

const solar =
Number(
      current.solar_w_m2 ||
      0
      current.solar_w_m2 || 0
);

const uv =
Number(
      current.uv_index ||
      0
      current.uv_index || 0
);

  if (
    rain >= 2.5
  ) {

  if (rain >= 2.5) {
return {
      tag:
        "Rainy",

      icon:
        "🌧️",

      tag: "Rainy",
      icon: "🌧️",
story:
`Rain is falling at ${n(rain)} mm/h.`,

className:
"weather-rain"
};
}

  if (
    rain > 0
  ) {

  if (rain > 0) {
return {
      tag:
        "Light rain",

      icon:
        "🌦️",

      tag: "Light rain",
      icon: "🌦️",
story:
`Light rain is falling at ${n(rain)} mm/h.`,

className:
"weather-rain"
};
}

  if (
    wind >= 35
  ) {

  if (wind >= 35) {
return {
      tag:
        "Very windy",

      icon:
        "💨",

      tag: "Very windy",
      icon: "💨",
story:
`A lively Wexford breeze is blowing at ${n(wind)} km/h.`,

className:
"weather-windy"
};
}

  if (
    wind >= 20
  ) {

  if (wind >= 20) {
return {
      tag:
        "Breezy",

      icon:
        "🌬️",

      tag: "Breezy",
      icon: "🌬️",
story:
`Breezy conditions with wind around ${n(wind)} km/h.`,

className:
"weather-windy"
};
}

  if (
    isNight
  ) {

  if (isNight) {
return {
      tag:
        "Night",

      icon:
        "🌙",

      tag: "Night",
      icon: "🌙",
story:
"Night-time conditions at Parknacross.",

className:
"weather-neutral"
};
@@ -867,63 +553,43 @@ function conditionInfo(
uv >= 5 ||
solar >= 400
) {

return {
      tag:
        "Bright",

      icon:
        "☀️",

      tag: "Bright",
      icon: "☀️",
story:
"Bright conditions over Parknacross right now.",

className:
"weather-bright"
};
}

  if (
    solar >= 100
  ) {

  if (solar >= 100) {
return {
      tag:
        "Some brightness",

      icon:
        "⛅",

      tag: "Some brightness",
      icon: "⛅",
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

    tag: "Calm & local",
    icon: "☁️",
story:
"Quiet local conditions at Parknacross.",

className:
"weather-neutral"
};
}


/* ---------------------------------------------------------
   Sunrise / sunset
--------------------------------------------------------- */
/* =========================================================
   SUNRISE / SUNSET
========================================================= */

function dayOfYear(date) {

const start =
new Date(
date.getFullYear(),
@@ -932,25 +598,17 @@ function dayOfYear(date) {
);

return Math.floor(
    (
      date -
      start
    ) /
    (date - start) /
86400000
);
}


function normalize360(value) {

return (
    (
      value %
      360
    ) +
    (value % 360) +
360
  ) %
  360;
  ) % 360;
}


@@ -960,36 +618,24 @@ function sunEvent(
longitude,
sunrise
) {

  const zenith =
    90.833;
  const zenith = 90.833;

const N =
    dayOfYear(
      date
    );
    dayOfYear(date);

const lngHour =
    longitude /
    15;
    longitude / 15;

const t =
N +
(
      (
        sunrise
          ? 6
          : 18
      ) -
      (sunrise ? 6 : 18) -
lngHour
) /
24;

const M =
    (
      0.9856 *
      t
    ) -
    (0.9856 * t) -
3.289;

let L =
@@ -1010,9 +656,7 @@ function sunEvent(
282.634;

L =
    normalize360(
      L
    );
    normalize360(L);

let RA =
Math.atan(
@@ -1027,21 +671,17 @@ function sunEvent(
Math.PI;

RA =
    normalize360(
      RA
    );
    normalize360(RA);

const Lquadrant =
Math.floor(
      L /
      90
      L / 90
) *
90;

const RAquadrant =
Math.floor(
      RA /
      90
      RA / 90
) *
90;

@@ -1116,16 +756,12 @@ function sunEvent(
180 /
Math.PI;

  H /=
    15;
  H /= 15;

const T =
H +
RA -
    (
      0.06571 *
      t
    ) -
    (0.06571 * t) -
6.622;

const UT =
@@ -1154,7 +790,6 @@ function sunEvent(


function updateSunInfo() {

const now =
new Date();

@@ -1182,7 +817,6 @@ function updateSunInfo() {
{
hour:
"2-digit",

minute:
"2-digit"
}
@@ -1191,16 +825,12 @@ function updateSunInfo() {

set(
"sunrise",
    fmt(
      rise
    )
    fmt(rise)
);

set(
"sunset",
    fmt(
      setTime
    )
    fmt(setTime)
);

const isNight =
@@ -1217,12 +847,10 @@ function updateSunInfo() {
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
@@ -1238,13 +866,11 @@ function updateSunInfo() {
set(
"daylightRemaining",
`${Math.floor(
          mins /
          60
          mins / 60
       )}h ${mins % 60}m`
);

} else {

set(
"daylightRemaining",
"Night"
@@ -1261,22 +887,18 @@ function updateSunInfo() {
}


/* ---------------------------------------------------------
   Rainfall chart
--------------------------------------------------------- */
/* =========================================================
   RAINFALL HISTORY
========================================================= */

function dailyRainTotals() {

const days =
new Map();

history7d.forEach(
reading => {

const time =
        readingTime(
          reading
        );
        readingTime(reading);

const correctedRain =
correctedDailyRain(
@@ -1293,9 +915,7 @@ function dailyRainTotals() {
}

const date =
        new Date(
          time
        );
        new Date(time);

const key =
[
@@ -1310,16 +930,13 @@ function dailyRainTotals() {
);

const existing =
        days.get(
          key
        );
        days.get(key);

if (
!existing ||
rain >
existing.rain
) {

days.set(
key,
{
@@ -1335,27 +952,21 @@ function dailyRainTotals() {
...days.values()
]
.sort(
      (
        a,
        b
      ) =>
      (a, b) =>
a.time -
b.time
)
.slice(-7);
}


/* ---------------------------------------------------------
   Live feed status
--------------------------------------------------------- */
/* =========================================================
   DATA FRESHNESS
========================================================= */

function updateFreshness(current) {

const time =
    readingTime(
      current
    );
    readingTime(current);

const pill =
$("livePill");
@@ -1380,7 +991,6 @@ function updateFreshness(current) {
age >=
OFFLINE_AFTER_MS
) {

pill.classList.add(
"offline"
);
@@ -1404,15 +1014,12 @@ function updateFreshness(current) {

$("cloudStatus")
?.classList
      .add(
        "bad"
      );
      .add("bad");

} else if (
age >=
STALE_AFTER_MS
) {

pill.classList.add(
"delayed"
);
@@ -1436,12 +1043,9 @@ function updateFreshness(current) {

$("cloudStatus")
?.classList
      .add(
        "warn"
      );
      .add("warn");

} else {

set(
"liveText",
"LIVE FROM PARKNACROSS"
@@ -1461,19 +1065,16 @@ function updateFreshness(current) {

$("cloudStatus")
?.classList
      .add(
        "ok"
      );
      .add("ok");
}
}


/* ---------------------------------------------------------
   Station stats
--------------------------------------------------------- */
/* =========================================================
   STATISTICS
========================================================= */

function updateStatsPanel() {

if (!stats) {
return;
}
@@ -1514,7 +1115,6 @@ function updateStatsPanel() {
if (
stats.wettest_day
) {

set(
"wettestDay",
`${n(
@@ -1533,13 +1133,11 @@ function updateStatsPanel() {
}

const records =
    stats.records ||
    {};
    stats.records || {};

if (
records.high_temperature
) {

set(
"allHigh",
`${n(
@@ -1558,7 +1156,6 @@ function updateStatsPanel() {
if (
records.low_temperature
) {

set(
"allLow",
`${n(
@@ -1577,7 +1174,6 @@ function updateStatsPanel() {
if (
records.peak_gust
) {

set(
"allGust",
`${n(
@@ -1596,7 +1192,6 @@ function updateStatsPanel() {
if (
records.high_pressure
) {

set(
"allPressure",
`${n(
@@ -1614,19 +1209,17 @@ function updateStatsPanel() {
}


/* ---------------------------------------------------------
   Main dashboard
--------------------------------------------------------- */
/* =========================================================
   MAIN DASHBOARD
========================================================= */

function updateDashboard(current) {

const now =
new Date();

const today =
history24.filter(
reading => {

const time =
readingTime(
reading
@@ -1698,12 +1291,7 @@ function updateDashboard(current) {
);


  /* Last updated */

  if (
    currentTime
  ) {

  if (currentTime) {
const date =
new Date(
currentTime
@@ -1717,7 +1305,6 @@ function updateDashboard(current) {
         {
           hour:
             "2-digit",

           minute:
             "2-digit"
         }
@@ -1728,7 +1315,6 @@ function updateDashboard(current) {
         {
           day:
             "2-digit",

           month:
             "short"
         }
@@ -1813,8 +1399,6 @@ function updateDashboard(current) {
);


  /* Weather theme */

document.body.classList.remove(
"weather-neutral",
"weather-rain",
@@ -1943,11 +1527,15 @@ function updateDashboard(current) {
usable(
current.wind_direction_deg
)
      ? `${direction} (${Math.round(
          Number(
            current.wind_direction_deg
      ? `${
          direction
        } (${
          Math.round(
            Number(
              current.wind_direction_deg
            )
         )
        )}°)`
        }°)`
: direction
);

@@ -2070,21 +1658,26 @@ function updateDashboard(current) {
) &&
$("needle")
) {

    $("needle").style.transform =
      `rotate(${prevailing.deg}deg)`;
    $("needle")
      .style
      .transform =
        `rotate(${prevailing.deg}deg)`;
}

set(
"currentDirection",
usable(
current.wind_direction_deg
)
      ? `${direction} · ${Math.round(
          Number(
            current.wind_direction_deg
      ? `${
          direction
        } · ${
          Math.round(
            Number(
              current.wind_direction_deg
            )
         )
        )}°`
        }°`
: direction
);

@@ -2175,16 +1768,13 @@ function updateDashboard(current) {
}


/* ---------------------------------------------------------
   Charts
--------------------------------------------------------- */
/* =========================================================
   CHART HELPERS
========================================================= */

function scales(title) {

return {

x: {

grid: {
color:
"transparent"
@@ -2200,7 +1790,6 @@ function scales(title) {
},

y: {

grid: {
color:
"rgba(163,209,255,.10)"
@@ -2212,7 +1801,6 @@ function scales(title) {
},

title: {

display:
true,

@@ -2232,9 +1820,7 @@ function line(
colour,
axis = "y"
) {

return {

label,

data:
@@ -2267,32 +1853,30 @@ function line(
}


function createCharts() {
/* =========================================================
   CREATE CHARTS
========================================================= */

function createCharts() {
Chart.defaults.color =
"#bfd0e3";

Chart.defaults.font.family =
"Inter,system-ui,sans-serif";


  /* Temperature */

charts.temperature =
new Chart(
$("temperatureChart"),
{

type:
"line",

data: {

labels:
[],

datasets: [

line(
"Temperature °C",
"#ff8d8d"
@@ -2306,12 +1890,10 @@ function createCharts() {
},

options: {

maintainAspectRatio:
false,

interaction: {

mode:
"index",

@@ -2320,14 +1902,10 @@ function createCharts() {
},

scales:
            scales(
              "°C"
            ),
            scales("°C"),

plugins: {

legend: {

position:
"bottom"
}
@@ -2337,23 +1915,18 @@ function createCharts() {
);


  /* Wind */

charts.wind =
new Chart(
$("windChart"),
{

type:
"line",

data: {

labels:
[],

datasets: [

line(
"Wind km/h",
"#74ddff"
@@ -2367,12 +1940,10 @@ function createCharts() {
},

options: {

maintainAspectRatio:
false,

interaction: {

mode:
"index",

@@ -2381,14 +1952,10 @@ function createCharts() {
},

scales:
            scales(
              "km/h"
            ),
            scales("km/h"),

plugins: {

legend: {

position:
"bottom"
}
@@ -2398,23 +1965,18 @@ function createCharts() {
);


  /* Pressure */

charts.pressure =
new Chart(
$("pressureChart"),
{

type:
"line",

data: {

labels:
[],

datasets: [

line(
"Pressure hPa",
"#b594ff"
@@ -2423,12 +1985,10 @@ function createCharts() {
},

options: {

maintainAspectRatio:
false,

interaction: {

mode:
"index",

@@ -2437,14 +1997,10 @@ function createCharts() {
},

scales:
            scales(
              "hPa"
            ),
            scales("hPa"),

plugins: {

legend: {

display:
false
}
@@ -2454,23 +2010,18 @@ function createCharts() {
);


  /* Rain */

charts.rain =
new Chart(
$("rainChart"),
{

type:
"bar",

data: {

labels:
[],

datasets: [

{
label:
"Rainfall mm",
@@ -2488,19 +2039,14 @@ function createCharts() {
},

options: {

maintainAspectRatio:
false,

scales:
            scales(
              "mm"
            ),
            scales("mm"),

plugins: {

legend: {

display:
false
}
@@ -2510,23 +2056,18 @@ function createCharts() {
);


  /* Solar */

charts.solar =
new Chart(
$("solarChart"),
{

type:
"line",

data: {

labels:
[],

datasets: [

line(
"Solar W/m²",
"#ffd77a",
@@ -2542,12 +2083,10 @@ function createCharts() {
},

options: {

maintainAspectRatio:
false,

interaction: {

mode:
"index",

@@ -2556,16 +2095,13 @@ function createCharts() {
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

@@ -2575,27 +2111,23 @@ function createCharts() {
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

@@ -2608,27 +2140,23 @@ function createCharts() {
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

@@ -2642,9 +2170,7 @@ function createCharts() {
},

plugins: {

legend: {

position:
"bottom"
}
@@ -2655,8 +2181,11 @@ function createCharts() {
}


function updateCharts() {
/* =========================================================
   UPDATE CHARTS
========================================================= */

function updateCharts() {
const rows =
history24.filter(
reading =>
@@ -2669,9 +2198,7 @@ function updateCharts() {
rows.map(
reading =>
new Date(
          readingTime(
            reading
          )
          readingTime(reading)
).toLocaleTimeString(
"en-IE",
{
@@ -2685,8 +2212,6 @@ function updateCharts() {
);


  /* Temperature */

charts.temperature
.data
.labels =
@@ -2714,8 +2239,6 @@ function updateCharts() {
.update();


  /* Wind */

charts.wind
.data
.labels =
@@ -2743,8 +2266,6 @@ function updateCharts() {
.update();


  /* Pressure */

charts.pressure
.data
.labels =
@@ -2763,8 +2284,6 @@ function updateCharts() {
.update();


  /* Solar */

charts.solar
.data
.labels =
@@ -2792,8 +2311,6 @@ function updateCharts() {
.update();


  /* Rain */

const rainfall =
dailyRainTotals();

@@ -2827,12 +2344,11 @@ function updateCharts() {
}


/* ---------------------------------------------------------
   Fetch JSON
--------------------------------------------------------- */
/* =========================================================
   JSON FETCH
========================================================= */

async function getJSON(url) {

const response =
await fetch(
url,
@@ -2842,10 +2358,7 @@ async function getJSON(url) {
}
);

  if (
    !response.ok
  ) {

  if (!response.ok) {
throw new Error(
`HTTP ${response.status}`
);
@@ -2854,10 +2367,7 @@ async function getJSON(url) {
const data =
await response.json();

  if (
    data?.error
  ) {

  if (data?.error) {
throw new Error(
data.error
);
@@ -2867,14 +2377,12 @@ async function getJSON(url) {
}


/* ---------------------------------------------------------
   Met Éireann forecast
--------------------------------------------------------- */
/* =========================================================
   FORECAST
========================================================= */

async function loadForecast() {

try {

const forecast =
await getJSON(
FORECAST_URL
@@ -2899,7 +2407,6 @@ async function loadForecast() {
);

} catch (error) {

console.warn(
"Met Éireann forecast:",
error
@@ -2913,14 +2420,12 @@ async function loadForecast() {
}


/* ---------------------------------------------------------
   Met Éireann warnings
--------------------------------------------------------- */
/* =========================================================
   WARNINGS
========================================================= */

async function loadWarnings() {

try {

const warnings =
await getJSON(
WARNINGS_URL
@@ -2940,7 +2445,6 @@ async function loadWarnings() {
!banner ||
!list.length
) {

if (banner) {
banner.hidden =
true;
@@ -2966,7 +2470,6 @@ async function loadWarnings() {
).toLowerCase() ===
"orange"
) {

banner.classList.add(
"level-orange"
);
@@ -2978,7 +2481,6 @@ async function loadWarnings() {
).toLowerCase() ===
"red"
) {

banner.classList.add(
"level-red"
);
@@ -3060,7 +2562,6 @@ async function loadWarnings() {
);

} catch (error) {

console.warn(
"Met Éireann warnings:",
error
@@ -3069,19 +2570,12 @@ async function loadWarnings() {
}


/* ---------------------------------------------------------
   Load dashboard
--------------------------------------------------------- */
/* =========================================================
   LOAD EVERYTHING
========================================================= */

async function loadEverything() {

try {

    /*
     * Current conditions and 24-hour history
     * are the essential feeds.
     */

const [
current,
history24Response
@@ -3098,6 +2592,7 @@ async function loadEverything() {
]
);


history24 =
Array.isArray(
history24Response.readings
@@ -3106,12 +2601,7 @@ async function loadEverything() {
: [];


    /*
     * 7-day history is optional.
     */

try {

const history7Response =
await getJSON(
HISTORY_7D_URL
@@ -3125,7 +2615,6 @@ async function loadEverything() {
: [];

} catch (error) {

console.warn(
"7-day history unavailable:",
error
@@ -3136,19 +2625,13 @@ async function loadEverything() {
}


    /*
     * Extended stats are optional.
     */

try {

stats =
await getJSON(
STATS_URL
);

} catch (error) {

console.warn(
"Extended station stats unavailable:",
error
@@ -3166,7 +2649,6 @@ async function loadEverything() {
updateCharts();

} catch (error) {

console.error(
"Parknacross Weather:",
error
@@ -3186,9 +2668,7 @@ async function loadEverything() {

$("cloudStatus")
?.classList
      .add(
        "bad"
      );
      .add("bad");

set(
"conditionsTag",
@@ -3214,14 +2694,12 @@ async function loadEverything() {
}


/* ---------------------------------------------------------
   Refresh current reading
--------------------------------------------------------- */
/* =========================================================
   CURRENT REFRESH
========================================================= */

async function refreshCurrent() {

try {

const current =
await getJSON(
CURRENT_URL
@@ -3232,7 +2710,6 @@ async function refreshCurrent() {
);

} catch (error) {

console.error(
"Current refresh:",
error
@@ -3241,17 +2718,15 @@ async function refreshCurrent() {
}


/* ---------------------------------------------------------
/* =========================================================
  PWA
--------------------------------------------------------- */
========================================================= */

function setupPWA() {

if (
"serviceWorker" in
navigator
) {

navigator
.serviceWorker
.register(
@@ -3266,10 +2741,10 @@ function setupPWA() {
);
}


window.addEventListener(
"beforeinstallprompt",
event => {

event.preventDefault();

deferredInstallPrompt =
@@ -3279,18 +2754,17 @@ function setupPWA() {
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
@@ -3306,21 +2780,21 @@ function setupPWA() {
deferredInstallPrompt =
null;

        $("installButton").hidden =
          true;
        $("installButton")
          .hidden =
            true;
}
);
}


/* ---------------------------------------------------------
   Start
--------------------------------------------------------- */
/* =========================================================
   START
========================================================= */

document.addEventListener(
"DOMContentLoaded",
() => {

createCharts();

updateSunInfo();
@@ -3334,22 +2808,12 @@ document.addEventListener(
setupPWA();


    /*
     * Current conditions:
     * every 60 seconds.
     */

setInterval(
refreshCurrent,
60 * 1000
);


    /*
     * Full charts/stats:
     * every 5 minutes.
     */

setInterval(
loadEverything,
5 *
@@ -3358,22 +2822,12 @@ document.addEventListener(
);


    /*
     * Sunrise / daylight:
     * every minute.
     */

setInterval(
updateSunInfo,
60 * 1000
);


    /*
     * Warnings:
     * every 5 minutes.
     */

setInterval(
loadWarnings,
5 *
@@ -3382,11 +2836,6 @@ document.addEventListener(
);


    /*
     * Forecast:
     * every 30 minutes.
     */

setInterval(
loadForecast,
30 *
