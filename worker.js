const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

const TABLE = "weather_readings_v2";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    try {
      await ensureTable(env);

      if (url.pathname === "/") {
        return json({
          service: "Parknacross Weather",
          status: "ok",
          endpoints: [
            "/health",
            "/sync",
            "/current",
            "/history?hours=24",
            "/daily?days=365",
            "/stats",
            "/met/forecast",
            "/met/warnings"
          ]
        });
      }

      if (url.pathname === "/health") {
        const countRow = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM ${TABLE}`
        ).first();

        return json({
          status: "ok",
          database: "connected",
          service: "Parknacross Weather",
          readings: Number(countRow?.count || 0),
          ecowitt_secrets: {
            application_key: Boolean(
              await readSecret(env.ECOWITT_APPLICATION_KEY)
            ),
            api_key: Boolean(
              await readSecret(env.ECOWITT_API_KEY)
            ),
            mac: Boolean(
              await readSecret(env.ECOWITT_MAC)
            )
          }
        });
      }

      if (url.pathname === "/sync") {
        return json(
          await syncEcowitt(env)
        );
      }

      if (url.pathname === "/current") {
        let latest =
          await getLatest(env);

        const nowEpoch =
          Math.floor(
            Date.now() / 1000
          );

        if (
          !latest ||
          nowEpoch -
            Number(
              latest.epoch || 0
            ) >
            120
        ) {
          try {
            await syncEcowitt(env);
            latest =
              await getLatest(env);
          } catch (error) {
            console.warn(
              "Auto-sync failed:",
              error
            );
          }
        }

        if (!latest) {
          return json(
            {
              error:
                "No weather readings available"
            },
            503
          );
        }

        return json(
          formatRow(latest)
        );
      }

      if (url.pathname === "/history") {
        const requested =
          Number(
            url.searchParams.get(
              "hours"
            ) || 24
          );

        const hours =
          Math.max(
            1,
            Math.min(
              8784,
              Number.isFinite(
                requested
              )
                ? requested
                : 24
            )
          );

        const cutoff =
          Math.floor(
            Date.now() / 1000
          ) -
          hours * 3600;

        const result =
          await env.DB.prepare(
            `SELECT
                epoch,
                received_at,
                temperature_c,
                feels_like_c,
                humidity,
                dew_point_c,
                wind_speed_kmh,
                wind_gust_kmh,
                wind_direction_deg,
                pressure_hpa,
                rain_rate_mm_h,
                rain_daily_mm,
                solar_w_m2,
                uv_index,
                battery_v
             FROM ${TABLE}
             WHERE epoch >= ?
             ORDER BY epoch ASC`
          )
          .bind(cutoff)
          .all();

        return json({
          hours,
          count:
            result.results
              ?.length || 0,

          readings:
            (
              result.results ||
              []
            ).map(
              formatRow
            )
        });
      }

      if (url.pathname === "/daily") {
        const requested =
          Number(
            url.searchParams.get(
              "days"
            ) || 30
          );

        const days =
          Math.max(
            1,
            Math.min(
              3660,
              Number.isFinite(
                requested
              )
                ? requested
                : 30
            )
          );

        const cutoff =
          Math.floor(
            Date.now() / 1000
          ) -
          days * 86400;

        const result =
          await env.DB.prepare(
            `SELECT
                date(
                  epoch,
                  'unixepoch'
                ) AS day,
                MAX(
                  temperature_c
                ) AS high_c,
                MIN(
                  temperature_c
                ) AS low_c,
                MAX(
                  wind_gust_kmh
                ) AS peak_gust_kmh,
                MAX(
                  rain_daily_mm
                ) AS rain_mm,
                AVG(
                  pressure_hpa
                ) AS avg_pressure_hpa,
                MAX(
                  solar_w_m2
                ) AS solar_peak_w_m2
             FROM ${TABLE}
             WHERE epoch >= ?
             GROUP BY
               date(
                 epoch,
                 'unixepoch'
               )
             ORDER BY day ASC`
          )
          .bind(cutoff)
          .all();

        const rows =
          (
            result.results ||
            []
          ).map(
            row => ({
              day:
                row.day,

              high_c:
                nullableNumber(
                  row.high_c
                ),

              low_c:
                nullableNumber(
                  row.low_c
                ),

              peak_gust_kmh:
                nullableNumber(
                  row.peak_gust_kmh
                ),

              rain_mm:
                correctedRainForDay(
                  row.day,
                  row.rain_mm
                ),

              avg_pressure_hpa:
                nullableNumber(
                  row.avg_pressure_hpa
                ),

              solar_peak_w_m2:
                nullableNumber(
                  row.solar_peak_w_m2
                )
            })
          );

        return json({
          days: rows
        });
      }

      if (url.pathname === "/stats") {
        return json(
          await buildStats(env)
        );
      }

      if (
        url.pathname ===
        "/met/forecast"
      ) {
        return json(
          await getMetForecast(),
          200,
          {
            "Cache-Control":
              "public, max-age=300"
          }
        );
      }

      if (
        url.pathname ===
        "/met/warnings"
      ) {
        return json(
          await getMetWarnings(),
          200,
          {
            "Cache-Control":
              "public, max-age=60"
          }
        );
      }

      return json(
        {
          error:
            "Not found"
        },
        404
      );

    } catch (error) {
      console.error(error);

      return json(
        {
          error:
            error?.message ||
            "Unexpected server error"
        },
        500
      );
    }
  },

  async scheduled(
    event,
    env,
    ctx
  ) {
    ctx.waitUntil(
      syncEcowitt(env)
    );
  }
};


async function readSecret(
  binding
) {
  if (
    typeof binding ===
    "string"
  ) {
    return binding.trim();
  }

  if (
    binding &&
    typeof binding.get ===
      "function"
  ) {
    const value =
      await binding.get();

    return String(
      value ?? ""
    ).trim();
  }

  return "";
}


async function ensureTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      epoch INTEGER NOT NULL UNIQUE,
      received_at TEXT NOT NULL,
      temperature_c REAL,
      feels_like_c REAL,
      humidity REAL,
      dew_point_c REAL,
      wind_speed_kmh REAL,
      wind_gust_kmh REAL,
      wind_direction_deg REAL,
      pressure_hpa REAL,
      rain_rate_mm_h REAL,
      rain_daily_mm REAL,
      solar_w_m2 REAL,
      uv_index REAL,
      battery_v REAL,
      raw_json TEXT
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_weather_epoch
     ON ${TABLE}(epoch)`
  ).run();
}


async function syncEcowitt(env) {
  const applicationKey =
    await readSecret(
      env.ECOWITT_APPLICATION_KEY
    );

  const apiKey =
    await readSecret(
      env.ECOWITT_API_KEY
    );

  const mac =
    await readSecret(
      env.ECOWITT_MAC
    );

  if (
    !applicationKey ||
    !apiKey ||
    !mac
  ) {
    throw new Error(
      "Ecowitt API secrets are not configured"
    );
  }

  const api =
    new URL(
      "https://api.ecowitt.net/api/v3/device/real_time"
    );

  api.searchParams.set(
    "application_key",
    applicationKey
  );

  api.searchParams.set(
    "api_key",
    apiKey
  );

  api.searchParams.set(
    "mac",
    mac
  );

  api.searchParams.set(
    "call_back",
    "all"
  );

  api.searchParams.set(
    "temp_unitid",
    "1"
  );

  api.searchParams.set(
    "pressure_unitid",
    "3"
  );

  api.searchParams.set(
    "wind_speed_unitid",
    "7"
  );

  api.searchParams.set(
    "rainfall_unitid",
    "12"
  );

  api.searchParams.set(
    "solar_irradiance_unitid",
    "16"
  );

  const response =
    await fetch(
      api.toString(),
      {
        headers: {
          "Accept":
            "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Ecowitt HTTP ${response.status}`
    );
  }

  const payload =
    await response.json();

  if (
    Number(
      payload?.code ?? 0
    ) !== 0
  ) {
    throw new Error(
      payload?.msg ||
      `Ecowitt API error ${payload?.code}`
    );
  }

  const data =
    payload?.data || {};

  const epoch =
    findLatestEpoch(data) ||
    Math.floor(
      Date.now() / 1000
    );

  const receivedAt =
    new Date(
      epoch * 1000
    ).toISOString();


  const reading = {

    temperature_c:
      valueAt(
        data,
        [
          "outdoor.temperature.value",
          "outdoor.temperature",
          "temperature.value"
        ]
      ),


    feels_like_c:
      valueAt(
        data,
        [
          "outdoor.feels_like.value",
          "outdoor.feels_like",
          "outdoor.app_temp.value",
          "outdoor.app_temp"
        ]
      ),


    humidity:
      valueAt(
        data,
        [
          "outdoor.humidity.value",
          "outdoor.humidity"
        ]
      ),


    dew_point_c:
      valueAt(
        data,
        [
          "outdoor.dew_point.value",
          "outdoor.dew_point"
        ]
      ),


    wind_speed_kmh:
      valueAt(
        data,
        [
          "wind.wind_speed.value",
          "wind.wind_speed"
        ]
      ),


    wind_gust_kmh:
      valueAt(
        data,
        [
          "wind.wind_gust.value",
          "wind.wind_gust"
        ]
      ),


    wind_direction_deg:
      valueAt(
        data,
        [
          "wind.wind_direction.value",
          "wind.wind_direction"
        ]
      ),


    pressure_hpa:
      valueAt(
        data,
        [
          "pressure.relative.value",
          "pressure.relative",
          "pressure.absolute.value",
          "pressure.absolute"
        ]
      ),


    /*
     * WS90 PIEZOELECTRIC RAIN
     */

    rain_rate_mm_h:
      valueAt(
        data,
        [
          "rainfall_piezo.rain_rate.value",
          "rainfall_piezo.rain_rate",
          "rainfall.rain_rate.value",
          "rainfall.rain_rate"
        ]
      ),


    rain_daily_mm:
      valueAt(
        data,
        [
          "rainfall_piezo.daily.value",
          "rainfall_piezo.daily",
          "rainfall.daily.value",
          "rainfall.daily"
        ]
      ),


    solar_w_m2:
      valueAt(
        data,
        [
          "solar_and_uvi.solar.value",
          "solar_and_uvi.solar",
          "solar_radiation.value"
        ]
      ),


    uv_index:
      valueAt(
        data,
        [
          "solar_and_uvi.uvi.value",
          "solar_and_uvi.uvi",
          "uvi.value"
        ]
      ),


    /*
     * WS90 / WH90 BATTERY
     */

    battery_v:
      valueAt(
        data,
        [
          "battery.wh90batt.value",
          "battery.wh90batt",

          "battery.ws90batt.value",
          "battery.ws90batt",

          "battery.wh90_batt.value",
          "battery.wh90_batt",

          "battery.ws90_batt.value",
          "battery.ws90_batt",

          "wh90batt.value",
          "wh90batt",

          "ws90batt.value",
          "ws90batt"
        ]
      )
  };


  if (
    reading.feels_like_c ===
    null
  ) {
    reading.feels_like_c =
      reading.temperature_c;
  }


  await env.DB.prepare(
    `INSERT INTO ${TABLE} (
      epoch,
      received_at,
      temperature_c,
      feels_like_c,
      humidity,
      dew_point_c,
      wind_speed_kmh,
      wind_gust_kmh,
      wind_direction_deg,
      pressure_hpa,
      rain_rate_mm_h,
      rain_daily_mm,
      solar_w_m2,
      uv_index,
      battery_v,
      raw_json
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )

    ON CONFLICT(epoch)
    DO UPDATE SET

      received_at =
        excluded.received_at,

      temperature_c =
        excluded.temperature_c,

      feels_like_c =
        excluded.feels_like_c,

      humidity =
        excluded.humidity,

      dew_point_c =
        excluded.dew_point_c,

      wind_speed_kmh =
        excluded.wind_speed_kmh,

      wind_gust_kmh =
        excluded.wind_gust_kmh,

      wind_direction_deg =
        excluded.wind_direction_deg,

      pressure_hpa =
        excluded.pressure_hpa,

      rain_rate_mm_h =
        excluded.rain_rate_mm_h,

      rain_daily_mm =
        excluded.rain_daily_mm,

      solar_w_m2 =
        excluded.solar_w_m2,

      uv_index =
        excluded.uv_index,

      battery_v =
        excluded.battery_v,

      raw_json =
        excluded.raw_json`
  )
  .bind(
    epoch,
    receivedAt,

    reading.temperature_c,
    reading.feels_like_c,
    reading.humidity,
    reading.dew_point_c,

    reading.wind_speed_kmh,
    reading.wind_gust_kmh,
    reading.wind_direction_deg,

    reading.pressure_hpa,

    reading.rain_rate_mm_h,
    reading.rain_daily_mm,

    reading.solar_w_m2,
    reading.uv_index,

    reading.battery_v,

    JSON.stringify(payload)
  )
  .run();


  /*
   * TEMPORARY DIAGNOSTIC OUTPUT
   *
   * This lets us see exactly what battery
   * information Ecowitt is returning.
   */

  return {
    status:
      "ok",

    synced:
      true,

    epoch,

    received_at:
      receivedAt,

    reading,

    debug_battery:
      data.battery ||
      null,

    debug_battery_keys:
      data.battery &&
      typeof data.battery ===
        "object"
        ? Object.keys(
            data.battery
          )
        : [],

    debug_top_level_keys:
      Object.keys(data)
  };
}


async function getLatest(env) {
  return env.DB.prepare(
    `SELECT
        epoch,
        received_at,
        temperature_c,
        feels_like_c,
        humidity,
        dew_point_c,
        wind_speed_kmh,
        wind_gust_kmh,
        wind_direction_deg,
        pressure_hpa,
        rain_rate_mm_h,
        rain_daily_mm,
        solar_w_m2,
        uv_index,
        battery_v

     FROM ${TABLE}

     ORDER BY epoch DESC

     LIMIT 1`
  ).first();
}


async function buildStats(env) {
  const now =
    new Date();

  const yearPrefix =
    String(
      now.getUTCFullYear()
    );

  const monthPrefix =
    `${yearPrefix}-${
      String(
        now.getUTCMonth() + 1
      ).padStart(
        2,
        "0"
      )
    }`;


  const [
    count,
    first,
    highTemp,
    lowTemp,
    peakGust,
    highPressure,
    lowPressure,
    dailyRainResult
  ] =
    await Promise.all(
      [

        env.DB.prepare(
          `SELECT COUNT(*) AS count
           FROM ${TABLE}`
        ).first(),


        env.DB.prepare(
          `SELECT MIN(epoch) AS epoch
           FROM ${TABLE}`
        ).first(),


        recordQuery(
          env,
          "temperature_c",
          "DESC"
        ),


        recordQuery(
          env,
          "temperature_c",
          "ASC"
        ),


        recordQuery(
          env,
          "wind_gust_kmh",
          "DESC"
        ),


        recordQuery(
          env,
          "pressure_hpa",
          "DESC"
        ),


        recordQuery(
          env,
          "pressure_hpa",
          "ASC"
        ),


        env.DB.prepare(
          `SELECT
              date(
                epoch,
                'unixepoch'
              ) AS day,

              MAX(
                rain_daily_mm
              ) AS rain_mm

           FROM ${TABLE}

           GROUP BY
             date(
               epoch,
               'unixepoch'
             )

           ORDER BY day ASC`
        ).all()
      ]
    );


  const dailyRain =
    (
      dailyRainResult.results ||
      []
    )
    .map(
      row => ({
        day:
          row.day,

        rain_mm:
          correctedRainForDay(
            row.day,
            row.rain_mm
          )
      })
    );


  const monthDays =
    dailyRain.filter(
      row =>
        String(
          row.day
        ).startsWith(
          monthPrefix
        )
    );


  const yearDays =
    dailyRain.filter(
      row =>
        String(
          row.day
        ).startsWith(
          yearPrefix
        )
    );


  const monthRain =
    sum(
      monthDays.map(
        row =>
          row.rain_mm
      )
    );


  const yearRain =
    sum(
      yearDays.map(
        row =>
          row.rain_mm
      )
    );


  const monthRainDays =
    monthDays.filter(
      row =>
        Number(
          row.rain_mm || 0
        ) > 0
    ).length;


  const wettest =
    dailyRain.reduce(
      (
        best,
        row
      ) => {
        if (
          !best ||
          Number(
            row.rain_mm || 0
          ) >
          Number(
            best.rain_mm || 0
          )
        ) {
          return row;
        }

        return best;
      },
      null
    );


  return {
    total_samples:
      Number(
        count?.count || 0
      ),

    first_epoch:
      nullableNumber(
        first?.epoch
      ),

    month_rain_mm:
      round1(
        monthRain
      ),

    month_rain_days:
      monthRainDays,

    year_rain_mm:
      round1(
        yearRain
      ),

    wettest_day:
      wettest,

    records: {
      high_temperature:
        recordObject(
          highTemp,
          "temperature_c"
        ),

      low_temperature:
        recordObject(
          lowTemp,
          "temperature_c"
        ),

      peak_gust:
        recordObject(
          peakGust,
          "wind_gust_kmh"
        ),

      high_pressure:
        recordObject(
          highPressure,
          "pressure_hpa"
        ),

      low_pressure:
        recordObject(
          lowPressure,
          "pressure_hpa"
        )
    }
  };
}


async function recordQuery(
  env,
  field,
  direction
) {
  const allowed =
    new Set(
      [
        "temperature_c",
        "wind_gust_kmh",
        "pressure_hpa"
      ]
    );

  if (
    !allowed.has(field)
  ) {
    throw new Error(
      "Invalid record field"
    );
  }

  return env.DB.prepare(
    `SELECT
        epoch,
        received_at,
        ${field}

     FROM ${TABLE}

     WHERE
       ${field}
       IS NOT NULL

     ORDER BY
       ${field}
       ${direction}

     LIMIT 1`
  ).first();
}


function recordObject(
  row,
  field
) {
  if (
    !row ||
    !usableNumber(
      row[field]
    )
  ) {
    return null;
  }

  return {
    value:
      Number(
        row[field]
      ),

    epoch:
      Number(
        row.epoch
      ),

    received_at:
      row.received_at
  };
}


async function getMetForecast() {
  const response =
    await fetch(
      "https://www.met.ie/Open_Data/json/Leinster.json",
      {
        headers: {
          "Accept":
            "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Met Éireann forecast HTTP ${response.status}`
    );
  }

  const raw =
    await response.json();

  const parts =
    raw?.forecasts?.[0]
      ?.regions || [];

  const merged =
    Object.assign(
      {},
      ...parts
    );

  return {
    region:
      merged.region ||
      "Leinster",

    issued:
      merged.issued ||
      null,

    today:
      merged.today ||
      "",

    tonight:
      merged.tonight ||
      "",

    tomorrow:
      merged.tomorrow ||
      "",

    outlook:
      merged.outlook ||
      ""
  };
}


async function getMetWarnings() {
  const response =
    await fetch(
      "https://www.met.ie/Open_Data/json/warning_EI30.json",
      {
        headers: {
          "Accept":
            "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Met Éireann warnings HTTP ${response.status}`
    );
  }

  const raw =
    await response.json();

  const list =
    Array.isArray(raw)
      ? raw
      : [];

  return {
    county:
      "Wexford",

    warnings:
      list.map(
        item => ({
          type:
            item.type ||
            item.event ||
            "",

          level:
            item.level ||
            "",

          severity:
            item.severity ||
            "",

          certainty:
            item.certainty ||
            "",

          issued:
            item.issued ||
            null,

          updated:
            item.updated ||
            null,

          onset:
            item.onset ||
            null,

          expires:
            item.expires ||
            item.expiry ||
            null,

          headline:
            item.headline ||
            "",

          description:
            item.description ||
            item.desc ||
            ""
        })
      )
  };
}


function correctedRainForDay(
  day,
  rawValue
) {
  if (
    !usableNumber(
      rawValue
    )
  ) {
    return null;
  }

  const correction =
    day ===
    "2026-09-11"
      ? 0.1
      : 0;

  return round1(
    Math.max(
      0,
      Number(
        rawValue
      ) -
      correction
    )
  );
}


function valueAt(
  root,
  paths
) {
  for (
    const path of paths
  ) {
    let value =
      root;

    for (
      const key of
      path.split(".")
    ) {
      if (
        value === null ||
        value === undefined
      ) {
        break;
      }

      value =
        value[key];
    }

    if (
      value &&
      typeof value ===
        "object" &&
      "value" in value
    ) {
      value =
        value.value;
    }

    const number =
      Number(value);

    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }

  return null;
}


function findLatestEpoch(node) {
  let latest =
    null;

  function walk(value) {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return;
    }

    for (
      const [
        key,
        child
      ] of
      Object.entries(value)
    ) {
      if (
        key === "time"
      ) {
        const number =
          Number(child);

        if (
          Number.isFinite(
            number
          ) &&
          number >
          1_000_000_000
        ) {
          latest =
            latest === null
              ? number
              : Math.max(
                  latest,
                  number
                );
        }
      }

      if (
        child &&
        typeof child ===
          "object"
      ) {
        walk(child);
      }
    }
  }

  walk(node);

  return latest;
}


function formatRow(row) {
  return {
    epoch:
      nullableNumber(
        row.epoch
      ),

    received_at:
      row.received_at,

    temperature_c:
      nullableNumber(
        row.temperature_c
      ),

    feels_like_c:
      nullableNumber(
        row.feels_like_c
      ),

    humidity:
      nullableNumber(
        row.humidity
      ),

    dew_point_c:
      nullableNumber(
        row.dew_point_c
      ),

    wind_speed_kmh:
      nullableNumber(
        row.wind_speed_kmh
      ),

    wind_gust_kmh:
      nullableNumber(
        row.wind_gust_kmh
      ),

    wind_direction_deg:
      nullableNumber(
        row.wind_direction_deg
      ),

    pressure_hpa:
      nullableNumber(
        row.pressure_hpa
      ),

    rain_rate_mm_h:
      nullableNumber(
        row.rain_rate_mm_h
      ),

    rain_daily_mm:
      nullableNumber(
        row.rain_daily_mm
      ),

    solar_w_m2:
      nullableNumber(
        row.solar_w_m2
      ),

    uv_index:
      nullableNumber(
        row.uv_index
      ),

    battery_v:
      nullableNumber(
        row.battery_v
      )
  };
}


function usableNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    Number.isFinite(
      Number(value)
    )
  );
}


function nullableNumber(value) {
  return usableNumber(value)
    ? Number(value)
    : null;
}


function sum(values) {
  return values.reduce(
    (
      total,
      value
    ) =>
      total +
      (
        Number.isFinite(
          Number(value)
        )
          ? Number(value)
          : 0
      ),
    0
  );
}


function round1(value) {
  return (
    Math.round(
      Number(
        value || 0
      ) *
      10
    ) /
    10
  );
}


function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        ...CORS,
        ...extraHeaders
      }
    }
  );
}
