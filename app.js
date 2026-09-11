const CURRENT_URL =
  "https://parknacross-weather.dave-s-carter.workers.dev/current";

const HISTORY_24_URL =
  "https://parknacross-weather.dave-s-carter.workers.dev/history?hours=24";

const HISTORY_7D_URL =
  "https://parknacross-weather.dave-s-carter.workers.dev/history?hours=168";


const $ =
  id => document.getElementById(id);


const set =
  (id, value) => {
    const element = $(id);

    if (element) {
      element.textContent = value;
    }
  };


const usable =
  value =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value));


const n =
  (value, digits = 1) =>
    usable(value)
      ? Number(value).toFixed(digits)
      : "--";


let history24 = [];
let history7d = [];
let charts = {};


/*
 * Rain correction
 *
 * 0.1 mm recorded on 11 September 2026 was generated
 * while testing the new weather station.
 *
 * It was not genuine rainfall.
 */
const RAIN_CORRECTIONS_MM = {
  "2026-09-11": 0.1
};


function readingTime(reading) {

  if (reading?.received_at) {

    const time =
      new Date(
        reading.received_at
      ).getTime();


    if (Number.isFinite(time)) {
      return time;
    }
  }


  if (usable(reading?.epoch)) {

    return (
      Number(reading.epoch) *
      1000
    );
  }


  return null;
}


function localDateKey(reading) {

  const time =
    readingTime(reading);


  if (!time) {
    return null;
  }


  const date =
    new Date(time);


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
  ].join("-");
}


function correctedDailyRain(reading) {

  const raw =
    Number(
      reading?.rain_daily_mm
    );


  if (!Number.isFinite(raw)) {
    return null;
  }


  const dateKey =
    localDateKey(reading);


  const correction =
    Number(
      RAIN_CORRECTIONS_MM[
        dateKey
      ] || 0
    );


  const corrected =
    Math.max(
      0,
      raw - correction
    );


  /*
   * Prevent tiny floating-point values such as
   * 0.00000000001 appearing instead of 0.0.
   */
  return (
    Math.round(
      corrected * 10
    ) / 10
  );
}


function sameDay(
  time,
  reference = new Date()
) {

  const date =
    new Date(time);


  return (
    date.getFullYear() ===
      reference.getFullYear() &&

    date.getMonth() ===
      reference.getMonth() &&

    date.getDate() ===
      reference.getDate()
  );
}


function maxField(
  rows,
  field
) {

  const values =
    rows
      .map(
        row =>
          Number(
            row[field]
          )
      )
      .filter(
        Number.isFinite
      );


  return values.length
    ? Math.max(...values)
    : null;
}


function minField(
  rows,
  field
) {

  const values =
    rows
      .map(
        row =>
          Number(
            row[field]
          )
      )
      .filter(
        Number.isFinite
      );


  return values.length
    ? Math.min(...values)
    : null;
}


function compass(degrees) {

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


  return labels[
    Math.round(
      direction / 22.5
    ) % 16
  ];
}


function pressureStats() {

  const rows =
    history24.filter(
      row =>
        usable(
          row.pressure_hpa
        )
    );


  if (rows.length < 2) {

    return {
      change: null,
      trend: "--"
    };
  }


  const first =
    Number(
      rows[0]
        .pressure_hpa
    );


  const last =
    Number(
      rows[
        rows.length - 1
      ]
        .pressure_hpa
    );


  const change =
    last - first;


  let trend =
    "Steady";


  if (change > 0.5) {
    trend = "Rising";
  }


  if (change < -0.5) {
    trend = "Falling";
  }


  return {
    change,
    trend
  };
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


      y +=
        Math.sin(
          radians
        ) *
        weight;
    }
  );


  const degrees =
    (
      Math.atan2(
        y,
        x
      ) *
      180 /
      Math.PI +
      360
    ) %
    360;


  return {
    deg: degrees,
    text: compass(degrees)
  };
}


function comfort(humidity) {

  const value =
    Number(humidity);


  if (!Number.isFinite(value)) {
    return "--";
  }


  if (value < 35) {
    return "Dry";
  }


  if (value <= 65) {
    return "Comfortable";
  }


  if (value <= 80) {
    return "Humid";
  }


  return "Very humid";
}


function conditionInfo(current) {

  const rain =
    Number(
      current.rain_rate_mm_h ||
      0
    );


  const wind =
    Number(
      current.wind_speed_kmh ||
      0
    );


  const solar =
    Number(
      current.solar_w_m2 ||
      0
    );


  const uv =
    Number(
      current.uv_index ||
      0
    );


  if (rain >= 2.5) {

    return {
      tag: "Rainy",
      icon: "🌧️",
      story:
        `Rain is falling at ${n(rain)} mm/h.`
    };
  }


  if (rain > 0) {

    return {
      tag: "Light rain",
      icon: "🌦️",
      story:
        `Light rain is falling at ${n(rain)} mm/h.`
    };
  }


  if (wind >= 35) {

    return {
      tag: "Very windy",
      icon: "💨",
      story:
        `A lively Wexford breeze is blowing at ${n(wind)} km/h.`
    };
  }


  if (wind >= 20) {

    return {
      tag: "Breezy",
      icon: "🌬️",
      story:
        `Breezy conditions with wind around ${n(wind)} km/h.`
    };
  }


  if (uv >= 5) {

    return {
      tag: "Bright",
      icon: "☀️",
      story:
        `Bright conditions with UV index ${n(uv, 0)}.`
    };
  }


  if (solar >= 400) {

    return {
      tag: "Bright",
      icon: "🌤️",
      story:
        "Good brightness over Parknacross right now."
    };
  }


  if (solar >= 100) {

    return {
      tag: "Some brightness",
      icon: "⛅",
      story:
        "Some brightness breaking through at Parknacross."
    };
  }


  return {
    tag: "Calm & local",
    icon: "☁️",
    story:
      "Quiet local conditions at Parknacross."
  };
}


function dailyRainTotals() {

  const days =
    new Map();


  history7d.forEach(
    reading => {

      const time =
        readingTime(reading);


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


      /*
       * Ecowitt daily rain is cumulative,
       * so keep the highest value recorded
       * during each day.
       */
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
        a.time - b.time
    )
    .slice(-7);
}


function updateDashboard(current) {

  const today =
    history24.filter(
      reading => {

        const time =
          readingTime(
            reading
          );


        return (
          time &&
          sameDay(time)
        );
      }
    );


  const high =
    maxField(
      today,
      "temperature_c"
    );


  const low =
    minField(
      today,
      "temperature_c"
    );


  const peak =
    maxField(
      today,
      "wind_gust_kmh"
    );


  const solarPeak =
    maxField(
      today,
      "solar_w_m2"
    );


  const pressure =
    pressureStats();


  const direction =
    compass(
      current.wind_direction_deg
    );


  const condition =
    conditionInfo(
      current
    );


  const rainToday =
    correctedDailyRain(
      current
    );


  const time =
    readingTime(
      current
    );


  if (time) {

    const date =
      new Date(time);


    set(
      "lastUpdated",

      `Updated ${
        date.toLocaleTimeString(
          "en-IE",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )
      } · ${
        date.toLocaleDateString(
          "en-IE",
          {
            day: "2-digit",
            month: "short"
          }
        )
      }`
    );
  }


  set(
    "heroTemp",
    n(
      current.temperature_c
    )
  );


  set(
    "heroFeels",
    `${n(
      current.feels_like_c
    )}°C`
  );


  set(
    "heroHumidity",
    `${n(
      current.humidity,
      0
    )}%`
  );


  set(
    "heroDew",
    `${n(
      current.dew_point_c
    )}°C`
  );


  set(
    "heroWind",
    `${n(
      current.wind_speed_kmh
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
      current.pressure_hpa
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


  set(
    "todayLow",
    n(low)
  );


  set(
    "todayHigh",
    n(high)
  );


  set(
    "peakGust",
    n(peak)
  );


  set(
    "summaryRain",
    n(rainToday)
  );


  set(
    "solarPeak",
    n(
      solarPeak,
      0
    )
  );


  set(
    "tempVal",
    n(
      current.temperature_c
    )
  );


  set(
    "feelsVal",
    `${n(
      current.feels_like_c
    )}°C`
  );


  set(
    "tempMin",
    n(low)
  );


  set(
    "tempMax",
    n(high)
  );


  set(
    "humVal",
    n(
      current.humidity,
      0
    )
  );


  set(
    "dewVal",
    `${n(
      current.dew_point_c
    )}°C`
  );


  set(
    "comfortVal",
    comfort(
      current.humidity
    )
  );


  set(
    "windVal",
    n(
      current.wind_speed_kmh
    )
  );


  set(
    "gustVal",
    `${n(
      current.wind_gust_kmh
    )} km/h`
  );


  set(
    "dirVal",
    usable(
      current.wind_direction_deg
    )
      ? `${direction} (${Math.round(
          Number(
            current.wind_direction_deg
          )
        )}°)`
      : direction
  );


  set(
    "rainVal",
    n(rainToday)
  );


  set(
    "rainRateVal",
    `${n(
      current.rain_rate_mm_h
    )} mm/h`
  );


  set(
    "pressureVal",
    n(
      current.pressure_hpa
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
        }${n(
          pressure.change
        )} hPa`
      : "--"
  );


  set(
    "solarVal",
    n(
      current.solar_w_m2,
      0
    )
  );


  set(
    "uvVal",
    n(
      current.uv_index,
      0
    )
  );


  set(
    "battery",
    usable(
      current.battery_v
    )
      ? `${n(
          current.battery_v,
          2
        )} V`
      : "--"
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


  set(
    "sampleCount",
    history24.length
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
      current.wind_direction_deg
    )
      ? `${direction} · ${Math.round(
          Number(
            current.wind_direction_deg
          )
        )}°`
      : direction
  );


  set(
    "currentWind",
    `${n(
      current.wind_speed_kmh
    )} km/h`
  );


  set(
    "currentGust",
    `${n(
      current.wind_gust_kmh
    )} km/h`
  );


  set(
    "recordHigh",
    `${n(high)} °C`
  );


  set(
    "recordLow",
    `${n(low)} °C`
  );


  set(
    "recordGust",
    `${n(peak)} km/h`
  );


  set(
    "recordRain",
    `${n(
      rainToday
    )} mm`
  );


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
    borderColor: colour,
    backgroundColor: colour,
    borderWidth: 2.2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.3,
    fill: false,
    yAxisID: axis
  };
}


function createCharts() {

  Chart.defaults.color =
    "#bfd0e3";


  Chart.defaults.font.family =
    "Inter,system-ui,sans-serif";


  charts.temperature =
    new Chart(
      $("temperatureChart"),
      {
        type: "line",

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
            scales("km/h"),

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
            scales("hPa"),

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
        ).toLocaleTimeString(
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
        reading =>
          reading.temperature_c
      );


  charts.temperature
    .data
    .datasets[1]
    .data =
      rows.map(
        reading =>
          reading.dew_point_c
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
        reading =>
          reading.wind_speed_kmh
      );


  charts.wind
    .data
    .datasets[1]
    .data =
      rows.map(
        reading =>
          reading.wind_gust_kmh
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
        reading =>
          reading.pressure_hpa
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
        reading =>
          reading.solar_w_m2
      );


  charts.solar
    .data
    .datasets[1]
    .data =
      rows.map(
        reading =>
          reading.uv_index
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
          ).toLocaleDateString(
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


  if (data.error) {

    throw new Error(
      data.error
    );
  }


  return data;
}


async function loadEverything() {

  try {

    const [
      current,
      history24Response,
      history7Response
    ] =
      await Promise.all(
        [
          getJSON(
            CURRENT_URL
          ),

          getJSON(
            HISTORY_24_URL
          ),

          getJSON(
            HISTORY_7D_URL
          )
        ]
      );


    history24 =
      Array.isArray(
        history24Response.readings
      )
        ? history24Response.readings
        : [];


    history7d =
      Array.isArray(
        history7Response.readings
      )
        ? history7Response.readings
        : [];


    updateDashboard(
      current
    );


    updateCharts();

  }
  catch (error) {

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
      .add(
        "bad"
      );


    set(
      "conditionsTag",
      "Feed unavailable"
    );


    set(
      "lastUpdated",
      "Unable to load live weather"
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

  }
  catch (error) {

    console.error(
      "Current refresh:",
      error
    );


    set(
      "cloudStatus",
      "Delayed"
    );


    $("cloudStatus")
      ?.classList
      .remove(
        "ok",
        "bad"
      );


    $("cloudStatus")
      ?.classList
      .add(
        "warn"
      );
  }
}


document.addEventListener(
  "DOMContentLoaded",
  () => {

    createCharts();


    loadEverything();


    /*
     * Refresh the latest weather reading
     * every 60 seconds.
     */
    setInterval(
      refreshCurrent,
      60 * 1000
    );


    /*
     * Reload history and charts
     * every 5 minutes.
     */
    setInterval(
      loadEverything,
      5 * 60 * 1000
    );
  }
);
