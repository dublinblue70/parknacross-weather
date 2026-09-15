const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

const TABLE = "weather_readings_v2";
const D1_FREE_LIMIT_BYTES = 500 * 1024 * 1024;

const STATION_TIME_ZONE = "Europe/Dublin";
const DAILY_TABLE = "weather_daily_v1";
const META_TABLE = "parknacross_meta_v1";
const PAYLOAD_TABLE = "latest_payload_v1";
const TEMP_OUTLIER_DELTA_C = 2.5;
const TEMP_OUTLIER_BASELINE_C = 1.0;
const TEMP_OUTLIER_WINDOW_SECONDS = 30 * 60;
const TEMP_OUTLIER_MIN_NEIGHBORS = 3;
const EDGE_CACHE_VERSION = "v30-at-a-glance-quality";
let schemaReadyPromise = null;

/*
 * SQLite's date(epoch, 'unixepoch') groups readings by UTC day. Parknacross
 * operates on Irish civil time, so during IST (UTC+1) readings from 23:00 to
 * 23:59 UTC belong to the following local calendar day. This SQL expression
 * applies Ireland's EU daylight-saving rule (last Sunday in March at 01:00 UTC
 * to last Sunday in October at 01:00 UTC) before deriving the calendar date.
 */
const DUBLIN_DAY_SQL = `CASE
  WHEN epoch >= CAST(strftime('%s', date(strftime('%Y', epoch, 'unixepoch') || '-04-01', 'weekday 0', '-7 days') || ' 01:00:00') AS INTEGER)
   AND epoch < CAST(strftime('%s', date(strftime('%Y', epoch, 'unixepoch') || '-11-01', 'weekday 0', '-7 days') || ' 01:00:00') AS INTEGER)
  THEN date(epoch + 3600, 'unixepoch')
  ELSE date(epoch, 'unixepoch')
END`;

function stationDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
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

function shiftDayKey(dayKey, amount) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + Number(amount || 0),
    12, 0, 0
  )).toISOString().slice(0, 10);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function temperatureOutlierRows(rows) {
  const ordered = (rows || [])
    .map(row => ({ row, epoch: Number(row?.epoch), temp: Number(row?.temperature_c) }))
    .filter(item => Number.isFinite(item.epoch) && usableNumber(item.row?.temperature_c))
    .sort((a, b) => a.epoch - b.epoch);

  const outliers = new Set();

  for (const candidate of ordered) {
    const neighbors = ordered.filter(item =>
      item !== candidate &&
      Math.abs(item.epoch - candidate.epoch) <= TEMP_OUTLIER_WINDOW_SECONDS
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

async function validatedTemperatureForIngest(env, epoch, temperature) {
  if (!usableNumber(temperature)) return null;

  const cutoff = Number(epoch) - TEMP_OUTLIER_WINDOW_SECONDS;
  const previous = await env.DB.prepare(
    `SELECT epoch, temperature_c FROM ${TABLE}
     WHERE epoch >= ? AND epoch < ? AND temperature_c IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(cutoff, Number(epoch)).all();

  const candidate = { epoch: Number(epoch), temperature_c: Number(temperature) };
  const series = [...(previous.results || []), candidate];
  return temperatureOutlierRows(series).has(candidate) ? null : Number(temperature);
}

async function temperatureRecordIsOutlier(env, candidate) {
  if (!candidate || !usableNumber(candidate.temperature_c) || !usableNumber(candidate.epoch)) return false;

  const startEpoch = Number(candidate.epoch) - TEMP_OUTLIER_WINDOW_SECONDS;
  const endEpoch = Number(candidate.epoch) + TEMP_OUTLIER_WINDOW_SECONDS;
  const nearby = await env.DB.prepare(
    `SELECT epoch, temperature_c FROM ${TABLE}
     WHERE epoch >= ? AND epoch <= ? AND temperature_c IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(startEpoch, endEpoch).all();

  const series = (nearby.results || []).map(row =>
    Number(row.epoch) === Number(candidate.epoch) ? candidate : row
  );

  return temperatureOutlierRows(series).has(candidate);
}

async function repairRecentDailyTemperatureSummaries(env) {
  const repaired = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE}
     WHERE key = 'temperature_quality_v30'
     LIMIT 1`
  ).first();
  if (repaired) return;

  const cutoff = Math.floor(Date.now() / 1000) - 45 * 86400;
  const result = await env.DB.prepare(
    `SELECT epoch, temperature_c FROM ${TABLE}
     WHERE epoch >= ? AND temperature_c IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(cutoff).all();

  const rows = result.results || [];
  const outliers = temperatureOutlierRows(rows);
  const grouped = new Map();

  for (const row of rows) {
    if (outliers.has(row)) continue;
    const day = stationDayKey(new Date(Number(row.epoch) * 1000));
    if (!day) continue;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(Number(row.temperature_c));
  }

  for (const [day, values] of grouped.entries()) {
    if (!values.length) continue;
    const total = values.reduce((sum, value) => sum + value, 0);
    await env.DB.prepare(
      `UPDATE ${DAILY_TABLE}
       SET temp_sum_c = ?, temp_count = ?, high_c = ?, low_c = ?
       WHERE day = ?`
    ).bind(total, values.length, Math.max(...values), Math.min(...values), day).run();
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO ${META_TABLE} (key, value)
     VALUES ('temperature_quality_v30', ?)`
  ).bind(new Date().toISOString()).run();
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    try {
      await ensureSchema(env);

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
            "/storage-stats",
            "/met/forecast",
            "/met/warnings",
            "/quality", "/battery-debug", "/rain-summary", "/events", "/export.csv",
            "/met/johnstown", "/met/point", "/forecast-verification",
            "/met/marine", "/marine/tides", "/climate-summary"
          ]
        });
      }

      if (url.pathname === "/health") {
        const countRow = await env.DB.prepare(
          `SELECT COALESCE(SUM(sample_count),0) AS count
           FROM ${DAILY_TABLE}`
        ).first();

        return json({
          status: "ok",
          database: "connected",
          service: "Parknacross Weather",
          station_time_zone: STATION_TIME_ZONE,
          station_local_day: stationDayKey(new Date()),
          readings: Number(countRow?.count || 0),
          ecowitt_secrets: {
            application_key: Boolean(await readSecret(env.ECOWITT_APPLICATION_KEY)),
            api_key: Boolean(await readSecret(env.ECOWITT_API_KEY)),
            mac: Boolean(await readSecret(env.ECOWITT_MAC))
          }
        });
      }

      if (url.pathname === "/sync") {
        return json(await syncEcowitt(env));
      }

      if (url.pathname === "/current") {
        let latest = await getLatest(env);
        const nowEpoch = Math.floor(Date.now() / 1000);

        if (!latest || nowEpoch - Number(latest.epoch || 0) > 120) {
          try {
            await syncEcowitt(env);
            latest = await getLatest(env);
          } catch (error) {
            console.warn("Auto-sync failed:", error);
          }
        }

        if (!latest) return json({ error: "No weather readings available" }, 503);

        const formatted = formatRow(latest);

        /*
         * Ecowitt's main real-time payload can omit the WS90 battery field.
         * First try a recent/cloud battery reading. If Ecowitt does not return
         * one, expose the last genuine stored WS90 voltage for up to 7 days.
         * The last-known fallback is NOT written back to D1, so an old value
         * cannot keep refreshing itself forever.
         */
        if (!usableNumber(formatted.battery_v)) {
          try {
            const applicationKey = await readSecret(env.ECOWITT_APPLICATION_KEY);
            const apiKey = await readSecret(env.ECOWITT_API_KEY);
            const mac = await readSecret(env.ECOWITT_MAC);

            let recoveredBattery = null;

            if (applicationKey && apiKey && mac) {
              recoveredBattery = await getWs90BatteryVoltage(
                env,
                applicationKey,
                apiKey,
                mac
              );
            }

            if (usableNumber(recoveredBattery)) {
              formatted.battery_v = Number(recoveredBattery);

              /* A recent/live recovery is safe to attach to this observation. */
              await env.DB.prepare(
                `UPDATE ${TABLE}
                 SET battery_v = ?
                 WHERE epoch = ?`
              ).bind(
                Number(recoveredBattery),
                Number(latest.epoch)
              ).run();
            } else {
              const lastKnown = await getLastKnownStoredBattery(env);
              if (lastKnown && usableNumber(lastKnown.value)) {
                formatted.battery_v = Number(lastKnown.value);
              }
            }
          } catch (error) {
            console.warn("Battery recovery in /current failed:", error);
          }
        }

        return json(formatted);
      }

      if (url.pathname === "/history") {
        const requested = Number(url.searchParams.get("hours") || 24);
        const hours = Math.max(1, Math.min(8784, Number.isFinite(requested) ? requested : 24));
        const ttl = hours <= 24 ? 300 : hours <= 168 ? 900 : 1800;

        return cachedJson(request, ctx, ttl, async () => {
          const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
          const result = await env.DB.prepare(
            `SELECT epoch, received_at, temperature_c, feels_like_c, humidity,
                    dew_point_c, wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
                    pressure_hpa, rain_rate_mm_h, rain_daily_mm, solar_w_m2,
                    uv_index, battery_v
             FROM ${TABLE}
             WHERE epoch >= ?
             ORDER BY epoch ASC`
          ).bind(cutoff).all();

          return {
            hours,
            count: result.results?.length || 0,
            readings: (result.results || []).map(formatRow)
          };
        });
      }

      if (url.pathname === "/daily") {
        const requested = Number(url.searchParams.get("days") || 30);
        const days = Math.max(1, Math.min(3660, Number.isFinite(requested) ? requested : 30));

        const dailyTtl = days <= 2 ? 60 : 900;
        return cachedJson(request, ctx, dailyTtl, async () => {
          const today = stationDayKey(new Date());
          const cutoffDay = shiftDayKey(today, -(days - 1));

          const result = await env.DB.prepare(
            `SELECT day, high_c, low_c, peak_gust_kmh, rain_mm,
                    CASE
                      WHEN pressure_count > 0 THEN pressure_sum_hpa / pressure_count
                      ELSE NULL
                    END AS avg_pressure_hpa,
                    solar_peak_w_m2
             FROM ${DAILY_TABLE}
             WHERE day >= ?
             ORDER BY day ASC`
          ).bind(cutoffDay).all();

          const rows = (result.results || []).map(row => ({
            day: row.day,
            high_c: nullableNumber(row.high_c),
            low_c: nullableNumber(row.low_c),
            peak_gust_kmh: nullableNumber(row.peak_gust_kmh),
            rain_mm: correctedRainForDay(row.day, row.rain_mm),
            avg_pressure_hpa: nullableNumber(row.avg_pressure_hpa),
            solar_peak_w_m2: nullableNumber(row.solar_peak_w_m2)
          }));

          return { days: rows };
        });
      }

      if (url.pathname === "/stats") {
        return cachedJson(request, ctx, 120, () => buildStats(env));
      }

      if (url.pathname === "/storage-stats") {
        return cachedJson(request, ctx, 1800, () => buildStorageStats(env));
      }

      if (url.pathname === "/met/forecast") {
        return cachedJson(request, ctx, 300, () => getMetForecast());
      }

      if (url.pathname === "/met/warnings") {
        return cachedJson(request, ctx, 60, () => getMetWarnings());
      }


      if (url.pathname === "/quality") {
        return cachedJson(request, ctx, 300, () => buildQuality(env));
      }

      if (url.pathname === "/battery-debug") {
        return json(await buildBatteryDebug(env), 200, {
          "Cache-Control": "no-store"
        });
      }

      if (url.pathname === "/rain-summary") {
        return cachedJson(request, ctx, 120, () => buildRainSummary(env));
      }

      if (url.pathname === "/events") {
        return cachedJson(request, ctx, 1800, () => buildEvents(env));
      }

      if (url.pathname === "/export.csv") {
        return exportCsv(await exportRows(env, url));
      }

      if (url.pathname === "/met/johnstown") {
        return cachedJson(request, ctx, 300, () => getJohnstownObservation());
      }

      if (url.pathname === "/met/point") {
        return cachedJson(request, ctx, 900, () => getPointForecast(env));
      }

      if (url.pathname === "/forecast-verification") {
        return cachedJson(request, ctx, 1800, () => buildForecastVerification(env));
      }

      if (url.pathname === "/met/marine") {
        return cachedJson(request, ctx, 600, () => getMarineForecast());
      }

      if (url.pathname === "/marine/tides") {
        return cachedJson(request, ctx, 3600, () => getTides(url));
      }

      if (url.pathname === "/climate-summary") {
        return cachedJson(request, ctx, 900, () => buildClimateSummary(env));
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return json({
        error: error?.message || "Unexpected server error"
      }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await ensureSchema(env);
      await syncEcowitt(env);
    })());
  }
};

async function readSecret(binding) {
  if (typeof binding === "string") return binding.trim();

  if (binding && typeof binding.get === "function") {
    const value = await binding.get();
    return String(value ?? "").trim();
  }

  return "";
}

async function ensureSchema(env) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureTable(env).catch(error => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
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

  /*
   * These indexes make all-time record lookups logarithmic instead of
   * repeatedly scanning the full weather archive.
   */
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_weather_temperature
     ON ${TABLE}(temperature_c)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_weather_gust
     ON ${TABLE}(wind_gust_kmh)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_weather_pressure
     ON ${TABLE}(pressure_hpa)`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS forecast_snapshots_v2 (
      target_day TEXT PRIMARY KEY,
      captured_at TEXT NOT NULL,
      forecast_high_c REAL,
      forecast_low_c REAL,
      forecast_rain_mm REAL,
      raw_json TEXT
    )`
  ).run();

  /*
   * One compact row per Irish local calendar day. Most archive pages can read
   * this table instead of rescanning every 1–5 minute observation.
   */
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${DAILY_TABLE} (
      day TEXT PRIMARY KEY,
      first_epoch INTEGER NOT NULL,
      last_epoch INTEGER NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      temp_sum_c REAL NOT NULL DEFAULT 0,
      temp_count INTEGER NOT NULL DEFAULT 0,
      high_c REAL,
      low_c REAL,
      peak_gust_kmh REAL,
      rain_mm REAL,
      pressure_sum_hpa REAL NOT NULL DEFAULT 0,
      pressure_count INTEGER NOT NULL DEFAULT 0,
      solar_peak_w_m2 REAL,
      last_rain_epoch INTEGER
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${META_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT
    )`
  ).run();

  /*
   * Keep only the latest complete Ecowitt response for diagnostics. New
   * observation rows no longer need a duplicate copy of the full JSON payload.
   */
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${PAYLOAD_TABLE} (
      id INTEGER PRIMARY KEY,
      epoch INTEGER NOT NULL,
      raw_json TEXT
    )`
  ).run();

  const backfill = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE}
     WHERE key = 'daily_summary_backfill_v1'
     LIMIT 1`
  ).first();

  if (!backfill) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ${DAILY_TABLE} (
        day, first_epoch, last_epoch, sample_count,
        temp_sum_c, temp_count, high_c, low_c,
        peak_gust_kmh, rain_mm,
        pressure_sum_hpa, pressure_count, solar_peak_w_m2,
        last_rain_epoch
      )
      SELECT
        ${DUBLIN_DAY_SQL} AS day,
        MIN(epoch) AS first_epoch,
        MAX(epoch) AS last_epoch,
        COUNT(*) AS sample_count,
        COALESCE(SUM(CASE WHEN temperature_c IS NOT NULL THEN temperature_c ELSE 0 END),0) AS temp_sum_c,
        SUM(CASE WHEN temperature_c IS NOT NULL THEN 1 ELSE 0 END) AS temp_count,
        MAX(temperature_c) AS high_c,
        MIN(temperature_c) AS low_c,
        MAX(wind_gust_kmh) AS peak_gust_kmh,
        MAX(rain_daily_mm) AS rain_mm,
        COALESCE(SUM(CASE WHEN pressure_hpa IS NOT NULL THEN pressure_hpa ELSE 0 END),0) AS pressure_sum_hpa,
        SUM(CASE WHEN pressure_hpa IS NOT NULL THEN 1 ELSE 0 END) AS pressure_count,
        MAX(solar_w_m2) AS solar_peak_w_m2,
        MAX(CASE WHEN rain_rate_mm_h > 0 THEN epoch ELSE NULL END) AS last_rain_epoch
      FROM ${TABLE}
      GROUP BY ${DUBLIN_DAY_SQL}`
    ).run();

    await env.DB.prepare(
      `INSERT OR REPLACE INTO ${PAYLOAD_TABLE} (id, epoch, raw_json)
       SELECT 1, epoch, raw_json
       FROM ${TABLE}
       WHERE raw_json IS NOT NULL
       ORDER BY epoch DESC
       LIMIT 1`
    ).run();

    await env.DB.prepare(
      `INSERT OR REPLACE INTO ${META_TABLE} (key, value)
       VALUES ('daily_summary_backfill_v1', ?)`
    ).bind(new Date().toISOString()).run();
  }

  await repairRecentDailyTemperatureSummaries(env);
}

async function updateDailySummary(env, epoch, reading) {
  const day = stationDayKey(new Date(Number(epoch) * 1000));
  if (!day) return;

  const rawTemperature = nullableNumber(reading?.temperature_c);
  const temperature = rawTemperature === null
    ? null
    : await validatedTemperatureForIngest(env, epoch, rawTemperature);
  const gust = nullableNumber(reading?.wind_gust_kmh);
  const rain = nullableNumber(reading?.rain_daily_mm);
  const pressure = nullableNumber(reading?.pressure_hpa);
  const solar = nullableNumber(reading?.solar_w_m2);

  // The WS90 can increment its cumulative daily rain counter while the
  // instantaneous rain rate is already back at zero. Treat either signal as
  // measurable rain so the Rain Centre and Dashboard agree.
  let measurableRainEpoch = Number(reading?.rain_rate_mm_h || 0) > 0 ? Number(epoch) : null;
  if (measurableRainEpoch === null && rain !== null) {
    const previous = await env.DB.prepare(
      `SELECT epoch, rain_daily_mm FROM ${TABLE}
       WHERE epoch < ? AND rain_daily_mm IS NOT NULL
       ORDER BY epoch DESC LIMIT 1`
    ).bind(Number(epoch)).first();
    if (previous && stationDayKey(new Date(Number(previous.epoch) * 1000)) === day &&
        usableNumber(previous.rain_daily_mm) && rain >= Number(previous.rain_daily_mm) + 0.05) {
      measurableRainEpoch = Number(epoch);
    }
  }

  await env.DB.prepare(
    `INSERT INTO ${DAILY_TABLE} (
      day, first_epoch, last_epoch, sample_count,
      temp_sum_c, temp_count, high_c, low_c,
      peak_gust_kmh, rain_mm,
      pressure_sum_hpa, pressure_count, solar_peak_w_m2,
      last_rain_epoch
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET
      first_epoch = CASE
        WHEN excluded.first_epoch < ${DAILY_TABLE}.first_epoch THEN excluded.first_epoch
        ELSE ${DAILY_TABLE}.first_epoch
      END,
      last_epoch = CASE
        WHEN excluded.last_epoch > ${DAILY_TABLE}.last_epoch THEN excluded.last_epoch
        ELSE ${DAILY_TABLE}.last_epoch
      END,
      sample_count = ${DAILY_TABLE}.sample_count +
        CASE WHEN excluded.last_epoch > ${DAILY_TABLE}.last_epoch THEN 1 ELSE 0 END,
      temp_sum_c = ${DAILY_TABLE}.temp_sum_c +
        CASE
          WHEN excluded.last_epoch > ${DAILY_TABLE}.last_epoch
          THEN excluded.temp_sum_c
          ELSE 0
        END,
      temp_count = ${DAILY_TABLE}.temp_count +
        CASE
          WHEN excluded.last_epoch > ${DAILY_TABLE}.last_epoch
          THEN excluded.temp_count
          ELSE 0
        END,
      high_c = CASE
        WHEN excluded.high_c IS NULL THEN ${DAILY_TABLE}.high_c
        WHEN ${DAILY_TABLE}.high_c IS NULL OR excluded.high_c > ${DAILY_TABLE}.high_c THEN excluded.high_c
        ELSE ${DAILY_TABLE}.high_c
      END,
      low_c = CASE
        WHEN excluded.low_c IS NULL THEN ${DAILY_TABLE}.low_c
        WHEN ${DAILY_TABLE}.low_c IS NULL OR excluded.low_c < ${DAILY_TABLE}.low_c THEN excluded.low_c
        ELSE ${DAILY_TABLE}.low_c
      END,
      peak_gust_kmh = CASE
        WHEN excluded.peak_gust_kmh IS NULL THEN ${DAILY_TABLE}.peak_gust_kmh
        WHEN ${DAILY_TABLE}.peak_gust_kmh IS NULL OR excluded.peak_gust_kmh > ${DAILY_TABLE}.peak_gust_kmh THEN excluded.peak_gust_kmh
        ELSE ${DAILY_TABLE}.peak_gust_kmh
      END,
      rain_mm = CASE
        WHEN excluded.rain_mm IS NULL THEN ${DAILY_TABLE}.rain_mm
        WHEN ${DAILY_TABLE}.rain_mm IS NULL OR excluded.rain_mm > ${DAILY_TABLE}.rain_mm THEN excluded.rain_mm
        ELSE ${DAILY_TABLE}.rain_mm
      END,
      pressure_sum_hpa = ${DAILY_TABLE}.pressure_sum_hpa +
        CASE
          WHEN excluded.last_epoch > ${DAILY_TABLE}.last_epoch
          THEN excluded.pressure_sum_hpa
          ELSE 0
        END,
      pressure_count = ${DAILY_TABLE}.pressure_count +
        CASE
          WHEN excluded.last_epoch > ${DAILY_TABLE}.last_epoch
          THEN excluded.pressure_count
          ELSE 0
        END,
      solar_peak_w_m2 = CASE
        WHEN excluded.solar_peak_w_m2 IS NULL THEN ${DAILY_TABLE}.solar_peak_w_m2
        WHEN ${DAILY_TABLE}.solar_peak_w_m2 IS NULL OR excluded.solar_peak_w_m2 > ${DAILY_TABLE}.solar_peak_w_m2 THEN excluded.solar_peak_w_m2
        ELSE ${DAILY_TABLE}.solar_peak_w_m2
      END,
      last_rain_epoch = CASE
        WHEN excluded.last_rain_epoch IS NULL THEN ${DAILY_TABLE}.last_rain_epoch
        WHEN ${DAILY_TABLE}.last_rain_epoch IS NULL OR excluded.last_rain_epoch > ${DAILY_TABLE}.last_rain_epoch THEN excluded.last_rain_epoch
        ELSE ${DAILY_TABLE}.last_rain_epoch
      END`
  ).bind(
    day,
    Number(epoch),
    Number(epoch),
    temperature ?? 0,
    temperature === null ? 0 : 1,
    temperature,
    temperature,
    gust,
    rain,
    pressure ?? 0,
    pressure === null ? 0 : 1,
    solar,
    measurableRainEpoch
  ).run();
}

async function syncEcowitt(env) {
  const applicationKey = await readSecret(env.ECOWITT_APPLICATION_KEY);
  const apiKey = await readSecret(env.ECOWITT_API_KEY);
  const mac = await readSecret(env.ECOWITT_MAC);

  if (!applicationKey || !apiKey || !mac) {
    throw new Error("Ecowitt API secrets are not configured");
  }

  const api = new URL("https://api.ecowitt.net/api/v3/device/real_time");
  api.searchParams.set("application_key", applicationKey);
  api.searchParams.set("api_key", apiKey);
  api.searchParams.set("mac", mac);
  api.searchParams.set("call_back", "all");
  api.searchParams.set("temp_unitid", "1");
  api.searchParams.set("pressure_unitid", "3");
  api.searchParams.set("wind_speed_unitid", "7");
  api.searchParams.set("rainfall_unitid", "12");
  api.searchParams.set("solar_irradiance_unitid", "16");

  const response = await fetch(api.toString(), {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Ecowitt HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (Number(payload?.code ?? 0) !== 0) {
    throw new Error(payload?.msg || `Ecowitt API error ${payload?.code}`);
  }

  const data = payload?.data || {};
  const epoch = findLatestEpoch(data) || Math.floor(Date.now() / 1000);
  const receivedAt = new Date(epoch * 1000).toISOString();

  let ws90Battery = findWs90BatteryVoltage(data);

  if (!usableNumber(ws90Battery)) {
    try {
      ws90Battery = await getWs90BatteryVoltage(
        env,
        applicationKey,
        apiKey,
        mac
      );
    } catch (error) {
      console.warn("WS90 battery recovery during sync failed:", error);
    }
  }

  const reading = {
    temperature_c: valueAt(data, [
      "outdoor.temperature.value",
      "outdoor.temperature",
      "temperature.value"
    ]),
    feels_like_c: valueAt(data, [
      "outdoor.feels_like.value",
      "outdoor.feels_like",
      "outdoor.app_temp.value",
      "outdoor.app_temp"
    ]),
    humidity: valueAt(data, [
      "outdoor.humidity.value",
      "outdoor.humidity"
    ]),
    dew_point_c: valueAt(data, [
      "outdoor.dew_point.value",
      "outdoor.dew_point"
    ]),
    wind_speed_kmh: valueAt(data, [
      "wind.wind_speed.value",
      "wind.wind_speed"
    ]),
    wind_gust_kmh: valueAt(data, [
      "wind.wind_gust.value",
      "wind.wind_gust"
    ]),
    wind_direction_deg: valueAt(data, [
      "wind.wind_direction.value",
      "wind.wind_direction"
    ]),
    pressure_hpa: valueAt(data, [
      "pressure.relative.value",
      "pressure.relative",
      "pressure.absolute.value",
      "pressure.absolute"
    ]),
    rain_rate_mm_h: valueAt(data, [
      /* WS90 uses Ecowitt's piezo rainfall group. Prefer it when present. */
      "rainfall_piezo.rain_rate.value",
      "rainfall_piezo.rain_rate",
      "rainfall.rain_rate.value",
      "rainfall.rain_rate"
    ]),
    rain_daily_mm: valueAt(data, [
      /* WS90 daily rainfall is normally reported under rainfall_piezo. */
      "rainfall_piezo.daily.value",
      "rainfall_piezo.daily",
      "rainfall.daily.value",
      "rainfall.daily"
    ]),
    solar_w_m2: valueAt(data, [
      "solar_and_uvi.solar.value",
      "solar_and_uvi.solar",
      "solar_radiation.value"
    ]),
    uv_index: valueAt(data, [
      "solar_and_uvi.uvi.value",
      "solar_and_uvi.uvi",
      "uvi.value"
    ]),
    battery_v: usableNumber(ws90Battery) ? Number(ws90Battery) : null
  };

  if (reading.feels_like_c === null) {
    reading.feels_like_c = reading.temperature_c;
  }

  await env.DB.prepare(
    `INSERT INTO ${TABLE} (
      epoch, received_at, temperature_c, feels_like_c, humidity,
      dew_point_c, wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
      pressure_hpa, rain_rate_mm_h, rain_daily_mm, solar_w_m2,
      uv_index, battery_v, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(epoch) DO UPDATE SET
      received_at=excluded.received_at,
      temperature_c=excluded.temperature_c,
      feels_like_c=excluded.feels_like_c,
      humidity=excluded.humidity,
      dew_point_c=excluded.dew_point_c,
      wind_speed_kmh=excluded.wind_speed_kmh,
      wind_gust_kmh=excluded.wind_gust_kmh,
      wind_direction_deg=excluded.wind_direction_deg,
      pressure_hpa=excluded.pressure_hpa,
      rain_rate_mm_h=excluded.rain_rate_mm_h,
      rain_daily_mm=excluded.rain_daily_mm,
      solar_w_m2=excluded.solar_w_m2,
      uv_index=excluded.uv_index,
      battery_v=excluded.battery_v,
      raw_json=COALESCE(excluded.raw_json, raw_json)`
  ).bind(
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
    null
  ).run();

  await updateDailySummary(env, epoch, reading);

  await env.DB.prepare(
    `INSERT INTO ${PAYLOAD_TABLE} (id, epoch, raw_json)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       epoch=excluded.epoch,
       raw_json=excluded.raw_json`
  ).bind(epoch, JSON.stringify(payload)).run();

  return {
    status: "ok",
    synced: true,
    epoch,
    received_at: receivedAt,
    reading
  };
}

async function getLatest(env) {
  return env.DB.prepare(
    `SELECT epoch, received_at, temperature_c, feels_like_c, humidity,
            dew_point_c, wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
            pressure_hpa, rain_rate_mm_h, rain_daily_mm, solar_w_m2,
            uv_index, battery_v, raw_json
     FROM ${TABLE}
     ORDER BY epoch DESC
     LIMIT 1`
  ).first();
}


async function buildStorageStats(env) {
  /*
   * Use the compact daily table for archive counts. D1 still exposes the
   * database file size in query metadata as `size_after`.
   */
  const result = await env.DB.prepare(
    `SELECT COALESCE(SUM(sample_count),0) AS total_samples,
            MIN(first_epoch) AS first_epoch,
            MAX(last_epoch) AS latest_epoch
     FROM ${DAILY_TABLE}`
  ).all();

  const row = result.results?.[0] || {};
  const sizeBytes = Math.max(0, Number(result.meta?.size_after || 0));
  const limitBytes = D1_FREE_LIMIT_BYTES;
  const remainingBytes = Math.max(0, limitBytes - sizeBytes);
  const usedPercent = limitBytes > 0 ? Math.min(100, (sizeBytes / limitBytes) * 100) : 0;

  const totalSamples = Number(row.total_samples || 0);
  const firstEpoch = nullableNumber(row.first_epoch);
  const latestEpoch = nullableNumber(row.latest_epoch);

  let archiveSpanDays = null;
  let growthBytesPerDay = null;
  let estimatedDaysRemaining = null;
  let projected80PercentDate = null;

  if (firstEpoch !== null && latestEpoch !== null && latestEpoch > firstEpoch) {
    archiveSpanDays = (latestEpoch - firstEpoch) / 86400;

    if (archiveSpanDays >= 7 && sizeBytes > 0) {
      growthBytesPerDay = sizeBytes / archiveSpanDays;

      if (growthBytesPerDay > 0) {
        estimatedDaysRemaining = remainingBytes / growthBytesPerDay;

        const eightyPercentBytes = limitBytes * 0.8;
        if (sizeBytes < eightyPercentBytes) {
          const daysTo80 = (eightyPercentBytes - sizeBytes) / growthBytesPerDay;
          projected80PercentDate = new Date(Date.now() + daysTo80 * 86400000).toISOString();
        } else {
          projected80PercentDate = new Date().toISOString();
        }
      }
    }
  }

  return {
    database: "Cloudflare D1",
    plan_limit_label: "500 MB",
    size_bytes: sizeBytes,
    limit_bytes: limitBytes,
    remaining_bytes: remainingBytes,
    used_percent: Number(usedPercent.toFixed(3)),
    total_samples: totalSamples,
    first_epoch: firstEpoch,
    latest_epoch: latestEpoch,
    archive_span_days: archiveSpanDays === null ? null : Number(archiveSpanDays.toFixed(2)),
    growth_bytes_per_day: growthBytesPerDay === null ? null : Math.round(growthBytesPerDay),
    estimated_days_remaining: estimatedDaysRemaining === null ? null : Math.round(estimatedDaysRemaining),
    projected_80_percent_date: projected80PercentDate
  };
}

async function buildStats(env) {
  const now = new Date();
  const localToday = stationDayKey(now);
  const yearPrefix = localToday.slice(0, 4);
  const monthPrefix = localToday.slice(0, 7);

  const [
    archiveSummary,
    highTemp,
    lowTemp,
    peakGust,
    highPressure,
    lowPressure,
    dailyRainResult
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(sample_count),0) AS count,
              MIN(first_epoch) AS epoch
       FROM ${DAILY_TABLE}`
    ).first(),
    recordQuery(env, "temperature_c", "DESC"),
    recordQuery(env, "temperature_c", "ASC"),
    recordQuery(env, "wind_gust_kmh", "DESC"),
    recordQuery(env, "pressure_hpa", "DESC"),
    recordQuery(env, "pressure_hpa", "ASC"),
    env.DB.prepare(
      `SELECT day, rain_mm
       FROM ${DAILY_TABLE}
       ORDER BY day ASC`
    ).all()
  ]);

  const dailyRain = (dailyRainResult.results || []).map(row => ({
    day: row.day,
    rain_mm: correctedRainForDay(row.day, row.rain_mm)
  }));

  const monthDays = dailyRain.filter(row => String(row.day).startsWith(monthPrefix));
  const yearDays = dailyRain.filter(row => String(row.day).startsWith(yearPrefix));

  const monthRain = sum(monthDays.map(row => row.rain_mm));
  const yearRain = sum(yearDays.map(row => row.rain_mm));
  const monthRainDays = monthDays.filter(row => Number(row.rain_mm || 0) > 0).length;

  const wettest = dailyRain.reduce((best, row) => {
    if (!best || Number(row.rain_mm || 0) > Number(best.rain_mm || 0)) return row;
    return best;
  }, null);

  return {
    total_samples: Number(archiveSummary?.count || 0),
    first_epoch: nullableNumber(archiveSummary?.epoch),
    month_rain_mm: round1(monthRain),
    month_rain_days: monthRainDays,
    year_rain_mm: round1(yearRain),
    wettest_day: wettest,
    records: {
      high_temperature: recordObject(highTemp, "temperature_c"),
      low_temperature: recordObject(lowTemp, "temperature_c"),
      peak_gust: recordObject(peakGust, "wind_gust_kmh"),
      high_pressure: recordObject(highPressure, "pressure_hpa"),
      low_pressure: recordObject(lowPressure, "pressure_hpa")
    }
  };
}
async function recordQuery(env, field, direction) {
  const allowed = new Set([
    "temperature_c",
    "wind_gust_kmh",
    "pressure_hpa"
  ]);

  if (!allowed.has(field)) throw new Error("Invalid record field");

  if (field === "temperature_c") {
    const candidates = await env.DB.prepare(
      `SELECT epoch, received_at, temperature_c
       FROM ${TABLE}
       WHERE temperature_c IS NOT NULL
       ORDER BY temperature_c ${direction}
       LIMIT 25`
    ).all();

    for (const candidate of candidates.results || []) {
      if (!(await temperatureRecordIsOutlier(env, candidate))) return candidate;
    }
    return null;
  }

  return env.DB.prepare(
    `SELECT epoch, received_at, ${field}
     FROM ${TABLE}
     WHERE ${field} IS NOT NULL
     ORDER BY ${field} ${direction}
     LIMIT 1`
  ).first();
}

function recordObject(row, field) {
  if (!row || !usableNumber(row[field])) return null;
  return {
    value: Number(row[field]),
    epoch: Number(row.epoch),
    received_at: row.received_at
  };
}

async function getMetForecast() {
  const response = await fetch(
    "https://www.met.ie/Open_Data/json/Leinster.json",
    { headers: { "Accept": "application/json" } }
  );

  if (!response.ok) throw new Error(`Met Éireann forecast HTTP ${response.status}`);

  const raw = await response.json();
  const parts = raw?.forecasts?.[0]?.regions || [];
  const merged = Object.assign({}, ...parts);

  return {
    region: merged.region || "Leinster",
    issued: merged.issued || null,
    today: merged.today || "",
    tonight: merged.tonight || "",
    tomorrow: merged.tomorrow || "",
    outlook: merged.outlook || ""
  };
}

async function getMetWarnings() {
  const response = await fetch(
    "https://www.met.ie/Open_Data/json/warning_EI30.json",
    { headers: { "Accept": "application/json" } }
  );

  if (!response.ok) throw new Error(`Met Éireann warnings HTTP ${response.status}`);

  const raw = await response.json();
  const list = Array.isArray(raw) ? raw : [];

  const isEnvironmentalOrAgriculturalAdvisory = item => {
    const text = [
      item?.type,
      item?.event,
      item?.status,
      item?.headline,
      item?.description,
      item?.desc
    ].filter(Boolean).join(" ").toLowerCase();

    return /potato|blight|farming|agricultur|environmental advisory/.test(text);
  };

  return {
    county: "Wexford",
    warnings: list
      .filter(item => !isEnvironmentalOrAgriculturalAdvisory(item))
      .map(item => ({
        type: item.type || item.event || "",
        level: item.level || "",
        severity: item.severity || "",
        certainty: item.certainty || "",
        status: item.status || "",
        issued: item.issued || null,
        updated: item.updated || null,
        onset: item.onset || null,
        expires: item.expires || item.expiry || null,
        headline: item.headline || "",
        description: item.description || item.desc || ""
      }))
  };
}



async function buildQuality(env) {
  const latest = await getLatest(env);
  const count = await env.DB.prepare(
    `SELECT COALESCE(SUM(sample_count),0) AS count
     FROM ${DAILY_TABLE}`
  ).first();

  const cutoff = Math.floor(Date.now() / 1000) - 86400;
  const rows = await env.DB.prepare(
    `SELECT epoch FROM ${TABLE} WHERE epoch >= ? ORDER BY epoch ASC`
  ).bind(cutoff).all();

  const epochs = (rows.results || []).map(r => Number(r.epoch)).filter(Number.isFinite);
  const gaps = [];
  for (let i = 1; i < epochs.length; i++) gaps.push((epochs[i] - epochs[i-1]) / 60);
  const sorted = [...gaps].sort((a,b) => a-b);
  const median = sorted.length
    ? (sorted.length % 2 ? sorted[(sorted.length-1)/2] : (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2)
    : null;
  const largest = gaps.length ? Math.max(...gaps) : null;
  const age = latest ? Math.max(0, Math.floor(Date.now()/1000) - Number(latest.epoch)) : null;
  let v = batteryVoltageFromRow(latest);
  if (v === null) {
    const lastKnown = await getLastKnownStoredBattery(env);
    v = lastKnown?.value ?? null;
  }
  const battery = v === null ? "--" : v >= 3.0 ? `Normal · ${v.toFixed(2)} V` : v >= 2.7 ? `Check · ${v.toFixed(2)} V` : `Low · ${v.toFixed(2)} V`;

  return {
    feed_status: age === null ? "No data" : age < 600 ? "Live" : age < 1800 ? "Delayed" : "Offline",
    latest_age_seconds: age,
    samples_last_24h: epochs.length,
    median_interval_minutes: median,
    largest_recent_gap_minutes: largest,
    total_samples: Number(count?.count || 0),
    battery_status: battery
  };
}

async function buildRainSummary(env) {
  const latest = await getLatest(env);
  const stats = await buildStats(env);

  const daily = await env.DB.prepare(
    `SELECT day, rain_mm
     FROM ${DAILY_TABLE}
     ORDER BY day ASC`
  ).all();

  const days = (daily.results || []).map(r => ({
    day: r.day,
    rain_mm: correctedRainForDay(r.day, r.rain_mm)
  }));

  const now = new Date();
  const todayKey = stationDayKey(now);
  const yesterdayKey = shiftDayKey(todayKey, -1);

  const storedToday = days.find(x => x.day === todayKey)?.rain_mm;
  const latestToday = correctedRainForDay(todayKey, latest?.rain_daily_mm);
  const todayCandidates = [storedToday, latestToday].filter(usableNumber).map(Number);
  const today = todayCandidates.length ? Math.max(...todayCandidates) : null;
  const yesterday = days.find(x => x.day === yesterdayKey)?.rain_mm ?? null;
  const last7 = sum(days.slice(-7).map(x => x.rain_mm));

  let dry = 0;
  for (const d of [...days].reverse()) {
    if (Number(d.rain_mm || 0) <= 0) dry++;
    else break;
  }

  /*
   * Last measurable rain is maintained in the compact daily summary so dry
   * spells never trigger a backward scan through the observation archive.
   */
  const lastRain = await env.DB.prepare(
    `SELECT last_rain_epoch
     FROM ${DAILY_TABLE}
     WHERE last_rain_epoch IS NOT NULL
     ORDER BY last_rain_epoch DESC
     LIMIT 1`
  ).first();

  // Repair short-lived WS90 cases where the daily rain counter rises but the
  // sampled instantaneous rate is 0. Search only recent rows to keep this cheap.
  let recentIncreaseEpoch = null;
  const recentCutoff = Math.floor(Date.now()/1000) - 48*3600;
  const recentRainRows = await env.DB.prepare(
    `SELECT epoch, rain_daily_mm FROM ${TABLE}
     WHERE epoch >= ? AND rain_daily_mm IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(recentCutoff).all();
  let previousRainRow = null;
  for (const row of recentRainRows.results || []) {
    if (previousRainRow &&
        stationDayKey(new Date(Number(previousRainRow.epoch) * 1000)) === stationDayKey(new Date(Number(row.epoch) * 1000)) &&
        usableNumber(previousRainRow.rain_daily_mm) && usableNumber(row.rain_daily_mm) &&
        Number(row.rain_daily_mm) >= Number(previousRainRow.rain_daily_mm) + 0.05) {
      recentIncreaseEpoch = Number(row.epoch);
    }
    previousRainRow = row;
  }
  const storedLastRainEpoch = usableNumber(lastRain?.last_rain_epoch) ? Number(lastRain.last_rain_epoch) : null;
  const effectiveLastRainEpoch = [storedLastRainEpoch, recentIncreaseEpoch].filter(usableNumber).map(Number).sort((a,b)=>b-a)[0] ?? null;

  let currentEvent = null;
  const currentRate = Number(latest?.rain_rate_mm_h || 0);
  if (currentRate > 0 && latest) {
    const cutoff = Number(latest.epoch) - 12*3600;
    const wetRows = await env.DB.prepare(
      `SELECT epoch,received_at,rain_daily_mm,rain_rate_mm_h
       FROM ${TABLE}
       WHERE epoch >= ? AND rain_rate_mm_h > 0
       ORDER BY epoch ASC`
    ).bind(cutoff).all();

    const wr = wetRows.results || [];
    if (wr.length) {
      let start = wr[0];
      for (let i=1;i<wr.length;i++) {
        if (Number(wr[i].epoch)-Number(wr[i-1].epoch) > 5400) start = wr[i];
      }
      const startRain = correctedRainForDay(todayKey, start.rain_daily_mm) || 0;
      currentEvent = {
        started_at: start.received_at,
        total_mm: round1(Math.max(0, Number(today || 0)-Number(startRain || 0)))
      };
    }
  }

  return {
    current_rate_mm_h: nullableNumber(latest?.rain_rate_mm_h),
    today_mm: usableNumber(today) ? round1(today) : null,
    yesterday_mm: usableNumber(yesterday) ? round1(yesterday) : null,
    last_7_days_mm: round1(last7),
    month_mm: stats.month_rain_mm,
    month_rain_days: stats.month_rain_days,
    year_mm: stats.year_rain_mm,
    consecutive_dry_days: dry,
    wettest_day: stats.wettest_day,
    last_measurable_rain: usableNumber(effectiveLastRainEpoch)
      ? {
          received_at: new Date(Number(effectiveLastRainEpoch) * 1000).toISOString(),
          epoch: Number(effectiveLastRainEpoch)
        }
      : null,
    current_event: currentEvent
  };
}
async function buildEvents(env) {
  const stats = await buildStats(env);
  const events = [];
  const push = (title,detail,record,type) => {
    if (!record) return;
    events.push({ title, detail, received_at:record.received_at || new Date(record.epoch*1000).toISOString(), epoch:Number(record.epoch), type });
  };
  push("Warmest Parknacross reading", stats.records?.high_temperature ? `${round1(stats.records.high_temperature.value)}°C` : "", stats.records?.high_temperature, "record");
  push("Coldest Parknacross reading", stats.records?.low_temperature ? `${round1(stats.records.low_temperature.value)}°C` : "", stats.records?.low_temperature, "record");
  push("Strongest gust recorded", stats.records?.peak_gust ? `${round1(stats.records.peak_gust.value)} km/h` : "", stats.records?.peak_gust, "record");
  if (stats.wettest_day) {
    events.push({
      title: "Wettest day in the archive",
      detail: `${round1(stats.wettest_day.rain_mm)} mm on ${stats.wettest_day.day}`,
      received_at: `${stats.wettest_day.day}T12:00:00Z`,
      epoch: Date.parse(`${stats.wettest_day.day}T12:00:00Z`)/1000,
      type: "record"
    });
  }

  const first20 = await env.DB.prepare(
    `SELECT epoch,received_at,temperature_c FROM ${TABLE}
     WHERE temperature_c >= 20 ORDER BY epoch ASC LIMIT 1`
  ).first();
  if (first20) push("First 20°C reading", `${round1(first20.temperature_c)}°C`, { ...first20, value:first20.temperature_c }, "milestone");

  events.sort((a,b) => Number(b.epoch||0)-Number(a.epoch||0));
  return { events: events.slice(0,20) };
}

async function exportRows(env, url) {
  const requested = Number(url.searchParams.get("days") || 365);
  const days = Math.max(1, Math.min(3660, Number.isFinite(requested) ? requested : 365));
  const cutoff = Math.floor(Date.now()/1000) - days*86400;
  const result = await env.DB.prepare(
    `SELECT epoch,received_at,temperature_c,feels_like_c,humidity,dew_point_c,
            wind_speed_kmh,wind_gust_kmh,wind_direction_deg,pressure_hpa,
            rain_rate_mm_h,rain_daily_mm,solar_w_m2,uv_index,battery_v
     FROM ${TABLE} WHERE epoch >= ? ORDER BY epoch ASC`
  ).bind(cutoff).all();
  return (result.results || []).map(row => ({
    ...row,
    rain_daily_mm: correctedRainForDay(stationDayKey(new Date(Number(row.epoch) * 1000)), row.rain_daily_mm)
  }));
}

function exportCsv(rows) {
  const headers = ["epoch","received_at","temperature_c","feels_like_c","humidity","dew_point_c","wind_speed_kmh","wind_gust_kmh","wind_direction_deg","pressure_hpa","rain_rate_mm_h","rain_daily_mm","solar_w_m2","uv_index","battery_v"];
  const esc = v => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
  };
  const text = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
  return new Response(text, {
    status: 200,
    headers: {
      ...BASE_CORS_COMPAT(),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="parknacross-weather.csv"'
    }
  });
}

function BASE_CORS_COMPAT() {
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type"
  };
}

async function getJohnstownObservation() {
  const response = await fetch(
    "https://www.met.ie/latest-reports/observations",
    {
      headers: {
        "Accept": "text/html"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Met Éireann observations HTTP ${response.status}`
    );
  }

  const html = await response.text();

  /*
   * Parse ONE station row at a time.
   *
   * Do not use a regex that starts at an arbitrary <tr> and then searches
   * forward for "Johnstown Castle". That can span several station rows and
   * shift the column indexes, which is how values such as humidity were
   * previously displayed as the official temperature.
   */
  const rows = [
    ...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)
  ].map(match => match[0]);

  const johnstownRow = rows.find(row =>
    /Johnstown(?:\s|&nbsp;)+Castle/i.test(row)
  );

  if (!johnstownRow) {
    throw new Error("Johnstown Castle observation not found");
  }

  /*
   * Include both <td> and <th> so a harmless markup change on Met Éireann's
   * page does not break the parser. Slice from the actual station cell in case
   * a row-leading header cell is ever introduced.
   */
  const cells = [
    ...johnstownRow.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)
  ].map(match => stripHtml(match[1]));

  const stationIndex = cells.findIndex(value =>
    /^Johnstown\s+Castle$/i.test(value)
  );

  if (stationIndex < 0) {
    throw new Error("Johnstown Castle table row could not be parsed");
  }

  const data = cells.slice(stationIndex);

  if (data.length < 9) {
    throw new Error(
      `Unexpected Johnstown Castle observations format (${data.length} cells)`
    );
  }

  /*
   * Met Éireann Latest Weather Reports columns:
   * 0 Station
   * 1 Wind direction
   * 2 Wind speed Kts (Km/h)
   * 3 Gust Kts (Km/h)
   * 4 Weather
   * 5 Temperature °C
   * 6 Humidity %
   * 7 Rain mm
   * 8 Pressure hPa
   */
  const temperatureC = nullableNumber(data[5]);
  const humidity = nullableNumber(data[6]);
  const rainfallMm = nullableNumber(data[7]);
  const pressureHpa = nullableNumber(data[8]);

  /*
   * Fail closed if Met Éireann changes the table structure again. Showing
   * "unavailable" is preferable to presenting a humidity/pressure value as a
   * temperature.
   */
  if (
    temperatureC === null ||
    temperatureC < -40 ||
    temperatureC > 60
  ) {
    throw new Error(
      `Invalid Johnstown Castle temperature parsed: ${data[5]}`
    );
  }

  if (
    humidity !== null &&
    (humidity < 0 || humidity > 100)
  ) {
    throw new Error(
      `Invalid Johnstown Castle humidity parsed: ${data[6]}`
    );
  }

  if (
    pressureHpa !== null &&
    (pressureHpa < 850 || pressureHpa > 1100)
  ) {
    throw new Error(
      `Invalid Johnstown Castle pressure parsed: ${data[8]}`
    );
  }

  return {
    station: "Johnstown Castle",
    wind_direction: data[1] || null,
    wind_speed_kmh: parseParenNumber(data[2]),
    wind_gust_kmh: parseParenNumber(data[3]),
    weather: data[4] || null,
    temperature_c: temperatureC,
    humidity,
    rainfall_mm: rainfallMm,
    pressure_hpa: pressureHpa,
    source: "Met Éireann"
  };
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&deg;/g,"°")
    .replace(/&amp;/g,"&")
    .replace(/\s+/g," ")
    .trim();
}

function parseParenNumber(text) {
  const m = String(text || "").match(/\(([-\d.]+)\)/);
  return m ? nullableNumber(m[1]) : null;
}

async function getPointForecast(env) {
  const endpoint = `https://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=52.6247;long=-6.25`;
  const response = await fetch(endpoint, { headers:{ "Accept":"application/xml,text/xml" } });
  if (!response.ok) throw new Error(`Met Éireann point forecast HTTP ${response.status}`);
  const xml = await response.text();

  const blocks = [...xml.matchAll(/<time[^>]*from="([^"]+)"[^>]*to="([^"]+)"[^>]*>([\s\S]*?)<\/time>/gi)];
  const key = shiftDayKey(stationDayKey(new Date()), 1);
  const temps = [];
  let rain = 0;

  for (const b of blocks) {
    const from = Date.parse(b[1]), to = Date.parse(b[2]), body = b[3];
    if (!Number.isFinite(from) || stationDayKey(new Date(from)) !== key) continue;
    const temp = body.match(/<temperature[^>]*value="([^"]+)"/i);
    if (temp && Number.isFinite(Number(temp[1]))) temps.push(Number(temp[1]));
    const precip = body.match(/<precipitation[^>]*value="([^"]+)"/i);
    const duration = Number.isFinite(to) ? Math.max(0,(to-from)/3600000) : 0;
    if (precip && duration > 0 && duration <= 6 && Number.isFinite(Number(precip[1]))) rain += Number(precip[1]);
  }

  const summary = {
    target_day: key,
    forecast_high_c: temps.length ? Math.max(...temps) : null,
    forecast_low_c: temps.length ? Math.min(...temps) : null,
    forecast_rain_mm: round1(rain),
    captured_at: new Date().toISOString()
  };

  if (env) {
    await env.DB.prepare(
      `INSERT INTO forecast_snapshots_v2
       (target_day,captured_at,forecast_high_c,forecast_low_c,forecast_rain_mm,raw_json)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(target_day) DO UPDATE SET
         captured_at=excluded.captured_at,
         forecast_high_c=excluded.forecast_high_c,
         forecast_low_c=excluded.forecast_low_c,
         forecast_rain_mm=excluded.forecast_rain_mm,
         raw_json=excluded.raw_json`
    ).bind(key,summary.captured_at,summary.forecast_high_c,summary.forecast_low_c,summary.forecast_rain_mm,JSON.stringify(summary)).run();
  }
  return summary;
}


async function buildForecastVerification(env) {
  const today = stationDayKey(new Date());
  const snaps = await env.DB.prepare(
    `SELECT * FROM forecast_snapshots_v2
     WHERE target_day < ?
     ORDER BY target_day DESC
     LIMIT 7`
  ).bind(today).all();

  const comparisons = [];
  for (const s of snaps.results || []) {
    const actual = await env.DB.prepare(
      `SELECT high_c, low_c, rain_mm
       FROM ${DAILY_TABLE}
       WHERE day = ?
       LIMIT 1`
    ).bind(s.target_day).first();

    const rain = correctedRainForDay(s.target_day, actual?.rain_mm);
    comparisons.push({
      target_day:s.target_day,
      forecast_high_c:nullableNumber(s.forecast_high_c),
      forecast_low_c:nullableNumber(s.forecast_low_c),
      forecast_rain_mm:nullableNumber(s.forecast_rain_mm),
      actual_high_c:nullableNumber(actual?.high_c),
      actual_low_c:nullableNumber(actual?.low_c),
      actual_rain_mm:rain,
      high_error_c: usableNumber(actual?.high_c) && usableNumber(s.forecast_high_c) ? round1(Number(actual.high_c)-Number(s.forecast_high_c)) : null,
      low_error_c: usableNumber(actual?.low_c) && usableNumber(s.forecast_low_c) ? round1(Number(actual.low_c)-Number(s.forecast_low_c)) : null
    });
  }
  return { comparisons };
}
const LOCAL_MARINE_SECTOR = "Wicklow Head to Carnsore Point";
const LOCAL_MARINE_WARNING_CODE = "EI811";

function decodeBasicHtml(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&deg;/gi, "°");
}

function htmlToPlainText(html) {
  return decodeBasicHtml(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|h1|h2|h3|li|div|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractNamedTextSection(text, heading, followingHeadings = []) {
  const source = String(text || "");
  const start = source.toLowerCase().indexOf(String(heading).toLowerCase());
  if (start < 0) return null;

  let section = source.slice(start + String(heading).length);
  const ends = followingHeadings
    .map(next => section.toLowerCase().indexOf(String(next).toLowerCase()))
    .filter(index => index >= 0);

  if (ends.length) section = section.slice(0, Math.min(...ends));
  return section.trim();
}

function parseMarineWarningSection(section, dayScope, url) {
  if (!section) return { parsed: false, warnings: [] };

  // A green section can legitimately have no active marine warning.
  if (
    /Currently no warnings in operation/i.test(section) &&
    !/(Small Craft|Strong Gale|Gale|Storm|Violent Storm|Hurricane Force)\s+warning/i.test(section)
  ) {
    return { parsed: true, warnings: [] };
  }

  const warningPattern =
    /\b(Small Craft|Strong Gale|Gale|Violent Storm|Storm|Hurricane Force)\s+warning\b([^\n]*)/ig;

  const warnings = [];
  let match;

  while ((match = warningPattern.exec(section))) {
    const label = String(match[1] || "").toLowerCase();
    let type = "gale";
    if (label === "small craft") type = "small_craft";
    else if (label === "storm") type = "storm";
    else if (label === "violent storm") type = "violent_storm";
    else if (label === "hurricane force") type = "hurricane";

    const fromHere = section.slice(match.index);
    const validMatch = fromHere.match(/\bValid:\s*([^\n]+)/i);
    const issuedMatch = fromHere.match(/\bIssued:\s*([^\n]+)/i);

    warnings.push({
      type,
      headline: `${match[1]} warning${String(match[2] || "").trim() ? String(match[2]).trim() : ""}`.trim(),
      valid_text: validMatch ? validMatch[1].trim() : null,
      issued_text: issuedMatch ? issuedMatch[1].trim() : null,
      day_scope: dayScope,
      url
    });
  }

  return {
    parsed: true,
    warnings
  };
}

function parseLocalMarineWarningPage(html, dayScope, url) {
  const text = htmlToPlainText(html);

  /*
   * Met Éireann repeats the active warning in two places on a local marine
   * warning page. Prefer the explicit "Marine Warnings" section and stop
   * before Environmental Advisories so a potato-blight advisory can never
   * be mistaken for the local marine warning.
   */
  const marineSection = extractNamedTextSection(
    text,
    "Marine Warnings",
    ["Environmental Advisories"]
  );

  const marineParsed = parseMarineWarningSection(
    marineSection,
    dayScope,
    url
  );

  if (marineParsed.parsed && marineParsed.warnings.length) {
    return {
      parsed: true,
      day_scope: dayScope,
      url,
      warnings: marineParsed.warnings
    };
  }

  /*
   * Fallback within the same EI811 page: the sector-specific warning block
   * appears above "Weather Warnings".
   */
  const localSection = extractNamedTextSection(
    text,
    `${LOCAL_MARINE_SECTOR} Warnings`,
    ["Weather Warnings", "Environmental Advisories"]
  );

  const localParsed = parseMarineWarningSection(
    localSection,
    dayScope,
    url
  );

  if (localParsed.parsed) {
    return {
      parsed: true,
      day_scope: dayScope,
      url,
      warnings: localParsed.warnings
    };
  }

  if (marineParsed.parsed) {
    return {
      parsed: true,
      day_scope: dayScope,
      url,
      warnings: marineParsed.warnings
    };
  }

  return {
    parsed: false,
    day_scope: dayScope,
    url,
    warnings: []
  };
}


function maxBeaufortForce(text) {
  const source = String(text || "");
  let maximum = null;
  const re = /\bforce\s+(\d{1,2})(?:\s*(?:to|or|[-–])\s*(\d{1,2}))?/gi;
  let match;

  while ((match = re.exec(source))) {
    const values = [Number(match[1]), Number(match[2])].filter(Number.isFinite);
    for (const value of values) {
      maximum = maximum === null ? value : Math.max(maximum, value);
    }
  }

  return maximum;
}

function findEastCoastMarineArea(areas) {
  const candidates = (areas || []).map(area => {
    const name = String(area?.area || "");
    const normal = name.toLowerCase();
    let score = 0;

    if (/irish sea/i.test(name)) score += 100;
    if (/wicklow head.*roches point/i.test(name)) score += 95;
    if (/howth head.*roches point/i.test(name)) score += 90;
    if (/malin head.*howth head.*roches point/i.test(name)) score += 80;
    if (/roches point.*slyne head/i.test(name) && !/howth head/i.test(name)) score -= 120;

    return { area, score, normal };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length && candidates[0].score > 0
    ? candidates[0].area
    : null;
}

async function fetchLocalMarineWarningPage(dayScope) {
  const url = `https://www.met.ie/warnings/${dayScope}/marine/${LOCAL_MARINE_WARNING_CODE}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "ParknacrossWeather/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Met Éireann local marine warning HTTP ${response.status}`);
  }

  return parseLocalMarineWarningPage(
    await response.text(),
    dayScope,
    url
  );
}

async function getMarineForecast() {
  const seaRequest = fetch(
    "https://www.met.ie/Open_Data/json/Met-Sea-area.json",
    { headers:{ "Accept":"application/json" } }
  );

  const [seaResponse, todayResult, tomorrowResult] = await Promise.all([
    seaRequest,
    fetchLocalMarineWarningPage("today").catch(error => ({
      parsed: false,
      day_scope: "today",
      url: `https://www.met.ie/warnings/today/marine/${LOCAL_MARINE_WARNING_CODE}`,
      warnings: [],
      error: error?.message || String(error)
    })),
    fetchLocalMarineWarningPage("tomorrow").catch(error => ({
      parsed: false,
      day_scope: "tomorrow",
      url: `https://www.met.ie/warnings/tomorrow/marine/${LOCAL_MARINE_WARNING_CODE}`,
      warnings: [],
      error: error?.message || String(error)
    }))
  ]);

  if (!seaResponse.ok) {
    throw new Error(`Met Éireann marine HTTP ${seaResponse.status}`);
  }

  const raw = await seaResponse.json();
  const sea = raw?.["sea-area-forecast"] || {};
  const areas = Array.isArray(sea.areas) ? sea.areas : [];
  const local = findEastCoastMarineArea(areas);

  const nationalGale = String(sea["gale-warning"] || "").toLowerCase();
  const nationalSmallCraft = String(sea["small-craft-warning"] || "").toLowerCase();

  const parsedPages = [todayResult, tomorrowResult].filter(result => result?.parsed);
  const localWarnings = [];
  const seen = new Set();

  for (const result of parsedPages) {
    for (const warning of result.warnings || []) {
      const key = [
        warning.type,
        warning.headline || "",
        warning.valid_text || ""
      ].join("|").toLowerCase();

      if (seen.has(key)) continue;
      seen.add(key);
      localWarnings.push(warning);
    }
  }

  const localPagesAuthoritative =
    Boolean(todayResult?.parsed) &&
    Boolean(tomorrowResult?.parsed);
  const localPagesAvailable = parsedPages.length > 0;
  const localMaxForce = maxBeaufortForce(local?.wind);

  /*
   * Primary relevance test:
   * use Met Éireann's exact Wicklow Head → Carnsore Point marine-warning page
   * (EI811), which is the coastal sector containing Ardamine/Parknacross.
   *
   * Fallback:
   * only if those pages cannot be parsed, use the east-coast Sea Area
   * Forecast wind strength together with the national warning flag.
   */
  const pageSmallCraft = localWarnings.some(warning => warning.type === "small_craft");
  const pageGale = localWarnings.some(warning =>
    ["gale", "storm", "violent_storm", "hurricane"].includes(warning.type)
  );

  const fallbackSmallCraft =
    !localPagesAuthoritative &&
    /^(yes|true|1|in force)$/i.test(nationalSmallCraft) &&
    Number.isFinite(localMaxForce) &&
    localMaxForce >= 6;

  const fallbackGale =
    !localPagesAuthoritative &&
    /^(yes|true|1|in force)$/i.test(nationalGale) &&
    Number.isFinite(localMaxForce) &&
    localMaxForce >= 8;

  const localSmallCraft = pageSmallCraft || fallbackSmallCraft;
  const localGale = pageGale || fallbackGale;
  const primaryWarning = localWarnings[0] || null;

  return {
    issued: sea.issued || null,
    until: sea.until || null,

    // National Sea Area Forecast flags retained for the coast/marine pages.
    gale_warning: nationalGale,
    small_craft_warning: nationalSmallCraft,

    // Dashboard must use these geographically filtered fields.
    local_warning_relevant: localSmallCraft || localGale,
    local_small_craft_warning: localSmallCraft,
    local_gale_warning: localGale,
    local_warning_sector: LOCAL_MARINE_SECTOR,
    local_warning_code: LOCAL_MARINE_WARNING_CODE,
    local_warning_headline: primaryWarning?.headline || null,
    local_warning_valid_text: primaryWarning?.valid_text || null,
    local_warning_issued_text: primaryWarning?.issued_text || null,
    local_warning_url:
      primaryWarning?.url ||
      `https://www.met.ie/warnings/today/marine/${LOCAL_MARINE_WARNING_CODE}`,
    local_warning_source:
      localPagesAvailable
        ? "Met Éireann local marine warning page"
        : "Sea Area Forecast fallback",
    local_warning_pages_available: localPagesAvailable,
    local_warning_pages_authoritative: localPagesAuthoritative,
    local_max_beaufort_force: localMaxForce,

    local_area: local,
    outlook: sea.outlook || null
  };
}

async function getTides(url) {
  const station = url.searchParams.get("station") || "Arklow";
  const start = new Date();
  start.setUTCHours(0,0,0,0);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(start.getTime()+6*86400000);

  const q = new URL("https://erddap.marine.ie/erddap/tabledap/IMI_TidePrediction_HighLow.csv");
  q.search = `?stationID,time,tide_time_category,Water_Level_ODMalin&stationID="${encodeURIComponent(station)}"&time>=${start.toISOString()}&time<=${end.toISOString()}`;

  const response = await fetch(q.toString(), { headers:{ "Accept":"text/csv" } });
  if (!response.ok) throw new Error(`Marine Institute tides HTTP ${response.status}`);
  const csv = await response.text();
  const lines = csv.trim().split(/\r?\n/);
  const events = [];

  for (const line of lines.slice(2)) {
    const cols = parseCsvLine(line);
    if (cols.length < 4) continue;
    const time = cols[1];
    const d = new Date(time);
    if (Number.isNaN(d.getTime())) continue;
    events.push({
      station: cols[0],
      time,
      type: String(cols[2]).toUpperCase() === "HIGH" ? "high" : "low",
      height_m: nullableNumber(cols[3])
    });
  }
  events.sort((a,b) => new Date(a.time)-new Date(b.time));
  return { station, events };
}

function parseCsvLine(line) {
  const out=[]; let cur=""; let quoted=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if (ch === '"') {
      if (quoted && line[i+1] === '"') { cur+='"'; i++; }
      else quoted=!quoted;
    } else if (ch === "," && !quoted) { out.push(cur); cur=""; }
    else cur+=ch;
  }
  out.push(cur);
  return out;
}

async function buildClimateSummary(env) {
  const now = new Date();
  const todayKey = stationDayKey(now);
  const prefix = todayKey.slice(0, 7);

  const month = await env.DB.prepare(
    `SELECT CASE
              WHEN SUM(temp_count) > 0 THEN SUM(temp_sum_c) / SUM(temp_count)
              ELSE NULL
            END AS mean_temp
     FROM ${DAILY_TABLE}
     WHERE substr(day,1,7)=?`
  ).bind(prefix).first();

  const stats = await buildStats(env);
  const latest = await getLatest(env);

  let official = null;
  try { official = await getJohnstownObservation(); } catch (_) {}

  // September 1991–2020 Johnstown Castle LTA:
  // 2025 total 161.3 mm was 191% of LTA => ~84.5 mm.
  const septemberLta = 84.5;
  const currentMonthLta = Number(todayKey.slice(5, 7)) === 9 ? septemberLta : null;
  const stationRain = nullableNumber(stats.month_rain_mm);

  const md = todayKey.slice(5,10);
  const currentYear = todayKey.slice(0,4);
  const previousYears = await env.DB.prepare(
    `SELECT day, high_c, low_c, rain_mm
     FROM ${DAILY_TABLE}
     WHERE substr(day,6,5)=?
       AND substr(day,1,4) < ?
     ORDER BY day DESC`
  ).bind(md,currentYear).all();

  const hist = previousYears.results || [];
  return {
    station_month_mean_temperature_c: nullableNumber(month?.mean_temp),
    station_month_rain_mm: stationRain,
    johnstown_temperature_c: nullableNumber(official?.temperature_c),
    current_temperature_delta_c:
      usableNumber(official?.temperature_c) && usableNumber(latest?.temperature_c)
        ? round1(Number(latest.temperature_c)-Number(official.temperature_c))
        : null,
    johnstown_lta_month_rain_mm: currentMonthLta,
    rain_percent_of_lta_month:
      currentMonthLta && usableNumber(stationRain)
        ? (Number(stationRain)/currentMonthLta)*100
        : null,
    on_this_day: hist.length ? {
      available:true,
      title:`Previous ${now.toLocaleDateString("en-IE",{timeZone:STATION_TIME_ZONE,day:"numeric",month:"long"})} observations`,
      summary:`Archive contains ${hist.length} earlier year${hist.length===1?"":"s"} for this calendar date.`
    } : {
      available:false,
      message:"On-this-day comparisons will populate once the archive spans more than one year."
    }
  };
}


function correctedRainForDay(day, rawValue) {
  if (!usableNumber(rawValue)) return null;
  const correction = day === "2026-09-11" ? 0.1 : 0;
  return round1(Math.max(0, Number(rawValue) - correction));
}

function valueAt(root, paths) {
  for (const path of paths) {
    let value = root;
    for (const key of path.split(".")) {
      if (value === null || value === undefined) break;
      value = value[key];
    }

    if (value && typeof value === "object" && "value" in value) {
      value = value.value;
    }

    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}


function normalizeSensorKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function numericSensorValue(value) {
  if (value && typeof value === "object") {
    if ("value" in value) return numericSensorValue(value.value);
    if ("voltage" in value) return numericSensorValue(value.voltage);
  }

  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const number = Number(match[0]);
      return Number.isFinite(number) ? number : null;
    }
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function collectBatteryCandidates(root) {
  const candidates = [];

  function walk(node, path = "") {
    if (!node || typeof node !== "object") return;

    for (const [key, child] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      const normal = normalizeSensorKey(key);

      const looksLikeWs90Battery =
        normal === "wh90batt" ||
        normal === "ws90batt" ||
        normal === "battwh90" ||
        normal === "battws90" ||
        normal === "batterywh90" ||
        normal === "batteryws90" ||
        (normal.includes("wh90") && normal.includes("batt")) ||
        (normal.includes("ws90") && normal.includes("batt"));

      if (looksLikeWs90Battery) {
        const value = numericSensorValue(child);
        if (value !== null) {
          candidates.push({
            path: here,
            value
          });
        }
      }

      if (child && typeof child === "object") {
        walk(child, here);
      }
    }
  }

  walk(root);
  return candidates;
}

function findWs90BatteryVoltage(root) {
  /*
   * Known Ecowitt cloud/local naming variants first.
   * The recursive scan below then handles gateway/API nesting changes.
   */
  const direct = valueAt(root, [
    "battery.wh90batt.value",
    "battery.wh90batt",
    "battery.ws90batt.value",
    "battery.ws90batt",
    "battery.battWh90.value",
    "battery.battWh90",
    "wh90batt.value",
    "wh90batt",
    "ws90batt.value",
    "ws90batt",
    "battWh90.value",
    "battWh90"
  ]);

  if (direct !== null) return direct;

  const candidates = collectBatteryCandidates(root);

  /*
   * A WS90 AA battery is normally roughly 2–3.3 V.
   * Prefer plausible voltages and deliberately ignore ws90cap_volt,
   * which is the solar capacitor rather than the AA battery.
   */
  const plausible = candidates.find(
    item => item.value >= 1.5 && item.value <= 4.0
  );

  if (plausible) return plausible.value;
  return candidates.length ? candidates[0].value : null;
}

function batteryVoltageFromRawJson(rawJson) {
  if (!rawJson) return null;

  try {
    const payload =
      typeof rawJson === "string"
        ? JSON.parse(rawJson)
        : rawJson;

    return findWs90BatteryVoltage(payload?.data || payload);
  } catch (_) {
    return null;
  }
}

function batteryVoltageFromRow(row) {
  const stored = nullableNumber(row?.battery_v);
  if (stored !== null) return stored;
  return batteryVoltageFromRawJson(row?.raw_json);
}


function formatApiDate(date) {
  const pad = value => String(value).padStart(2, "0");

  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    " ",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes()),
    ":",
    pad(date.getUTCSeconds())
  ].join("");
}

function latestNumericFromBatteryNode(node) {
  if (node === null || node === undefined) return null;

  const direct = numericSensorValue(node);
  if (
    direct !== null &&
    typeof node !== "object"
  ) {
    return direct;
  }

  if (typeof node !== "object") return direct;

  if ("value" in node) {
    const value = numericSensorValue(node.value);
    if (value !== null) return value;
  }

  if ("voltage" in node) {
    const value = numericSensorValue(node.voltage);
    if (value !== null) return value;
  }

  /*
   * Ecowitt history responses store observations in a "list" object
   * keyed by unix timestamp. Use the newest entry.
   */
  if (node.list && typeof node.list === "object") {
    const entries = Object.entries(node.list)
      .sort((a, b) => Number(b[0]) - Number(a[0]));

    for (const [, value] of entries) {
      const number = numericSensorValue(value);
      if (number !== null) return number;
    }
  }

  for (const child of Object.values(node)) {
    if (child && typeof child === "object") {
      const value = latestNumericFromBatteryNode(child);
      if (
        value !== null &&
        value >= 1.5 &&
        value <= 4.0
      ) {
        return value;
      }
    }
  }

  return null;
}

function findWs90BatteryVoltageDeep(root) {
  const direct = findWs90BatteryVoltage(root);
  if (direct !== null) return direct;

  let found = null;

  function walk(node) {
    if (!node || typeof node !== "object" || found !== null) return;

    for (const [key, child] of Object.entries(node)) {
      const normal = normalizeSensorKey(key);

      const looksLikeWs90Battery =
        normal === "wh90batt" ||
        normal === "ws90batt" ||
        normal === "battwh90" ||
        normal === "battws90" ||
        normal === "batterywh90" ||
        normal === "batteryws90" ||
        (normal.includes("wh90") && normal.includes("batt")) ||
        (normal.includes("ws90") && normal.includes("batt"));

      if (looksLikeWs90Battery) {
        const value = latestNumericFromBatteryNode(child);
        if (
          value !== null &&
          value >= 1.5 &&
          value <= 4.0
        ) {
          found = value;
          return;
        }
      }

      if (child && typeof child === "object") walk(child);
      if (found !== null) return;
    }
  }

  walk(root);
  return found;
}

async function getStoredBatteryRecord(env, maxAgeSeconds) {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;

  const row = await env.DB.prepare(
    `SELECT epoch, received_at, battery_v
     FROM ${TABLE}
     WHERE battery_v IS NOT NULL
       AND epoch >= ?
     ORDER BY epoch DESC
     LIMIT 1`
  ).bind(cutoff).first();

  if (!row || !usableNumber(row.battery_v)) return null;

  return {
    value: Number(row.battery_v),
    epoch: Number(row.epoch),
    received_at: row.received_at || null
  };
}

async function getRecentStoredBattery(env) {
  const row = await getStoredBatteryRecord(env, 6 * 3600);
  return row ? row.value : null;
}

async function getLastKnownStoredBattery(env) {
  /*
   * The WS90 battery changes very slowly and Ecowitt may omit it from cloud
   * responses for long periods. Keep a real measured value usable for 7 days,
   * after which "Unavailable" is safer than presenting stale power data.
   */
  return getStoredBatteryRecord(env, 7 * 24 * 3600);
}

async function fetchEcowittBatteryRealTime(
  applicationKey,
  apiKey,
  mac
) {
  const api = new URL(
    "https://api.ecowitt.net/api/v3/device/real_time"
  );

  api.searchParams.set("application_key", applicationKey);
  api.searchParams.set("api_key", apiKey);
  api.searchParams.set("mac", mac);
  api.searchParams.set("call_back", "battery");

  const response = await fetch(api.toString(), {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) return null;

  const payload = await response.json();

  if (Number(payload?.code ?? 0) !== 0) return null;

  return findWs90BatteryVoltageDeep(
    payload?.data || payload
  );
}

async function fetchEcowittBatteryHistory(
  applicationKey,
  apiKey,
  mac
) {
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 3600 * 1000);

  const api = new URL(
    "https://api.ecowitt.net/api/v3/device/history"
  );

  api.searchParams.set("application_key", applicationKey);
  api.searchParams.set("api_key", apiKey);
  api.searchParams.set("mac", mac);
  api.searchParams.set("start_date", formatApiDate(start));
  api.searchParams.set("end_date", formatApiDate(end));
  api.searchParams.set("cycle_type", "5min");
  api.searchParams.set("call_back", "battery");

  const response = await fetch(api.toString(), {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) return null;

  const payload = await response.json();

  if (Number(payload?.code ?? 0) !== 0) return null;

  return findWs90BatteryVoltageDeep(
    payload?.data || payload
  );
}

async function getWs90BatteryVoltage(
  env,
  applicationKey,
  apiKey,
  mac
) {
  /*
   * Battery voltage changes slowly. Reuse a value saved in the last 6 hours
   * to reduce Ecowitt API traffic.
   */
  const stored = await getRecentStoredBattery(env);
  if (stored !== null) return stored;

  try {
    const live = await fetchEcowittBatteryRealTime(
      applicationKey,
      apiKey,
      mac
    );

    if (live !== null) return live;
  } catch (error) {
    console.warn("Ecowitt battery real-time request failed:", error);
  }

  try {
    const history = await fetchEcowittBatteryHistory(
      applicationKey,
      apiKey,
      mac
    );

    if (history !== null) return history;
  } catch (error) {
    console.warn("Ecowitt battery history request failed:", error);
  }

  return null;
}

async function buildBatteryDebug(env) {
  const [latest, payloadRow] = await Promise.all([
    env.DB.prepare(
      `SELECT epoch, received_at, battery_v
       FROM ${TABLE}
       ORDER BY epoch DESC
       LIMIT 1`
    ).first(),
    env.DB.prepare(
      `SELECT epoch, raw_json
       FROM ${PAYLOAD_TABLE}
       WHERE id = 1`
    ).first()
  ]);

  const applicationKey =
    await readSecret(env.ECOWITT_APPLICATION_KEY);
  const apiKey =
    await readSecret(env.ECOWITT_API_KEY);
  const mac =
    await readSecret(env.ECOWITT_MAC);

  let payload = null;

  try {
    payload = payloadRow?.raw_json
      ? JSON.parse(payloadRow.raw_json)
      : null;
  } catch (_) {}

  const source = payload?.data || payload || {};
  const rawFields = collectBatteryCandidates(source);
  const recoveredFromSavedRaw =
    batteryVoltageFromRawJson(payloadRow?.raw_json);
  const lastKnown = await getLastKnownStoredBattery(env);

  let explicitRealtime = null;
  let historyBattery = null;

  if (applicationKey && apiKey && mac) {
    try {
      explicitRealtime =
        await fetchEcowittBatteryRealTime(
          applicationKey,
          apiKey,
          mac
        );
    } catch (_) {}

    if (explicitRealtime === null) {
      try {
        historyBattery =
          await fetchEcowittBatteryHistory(
            applicationKey,
            apiKey,
            mac
          );
      } catch (_) {}
    }
  }

  return {
    status: "ok",
    received_at: latest?.received_at || null,
    stored_battery_v: nullableNumber(latest?.battery_v),
    recovered_from_saved_raw_json:
      recoveredFromSavedRaw,
    explicit_realtime_battery_v:
      explicitRealtime,
    history_battery_v:
      historyBattery,
    last_known_battery_v:
      lastKnown?.value ?? null,
    last_known_received_at:
      lastKnown?.received_at ?? null,
    last_known_age_hours:
      lastKnown?.epoch
        ? Math.round(((Date.now() / 1000) - lastKnown.epoch) / 36) / 100
        : null,
    effective_battery_v:
      explicitRealtime ??
      historyBattery ??
      recoveredFromSavedRaw ??
      nullableNumber(latest?.battery_v) ??
      lastKnown?.value ??
      null,
    battery_fields_in_main_realtime_payload:
      rawFields
  };
}

function findLatestEpoch(node) {
  let latest = null;

  function walk(value) {
    if (!value || typeof value !== "object") return;

    for (const [key, child] of Object.entries(value)) {
      if (key === "time") {
        const number = Number(child);
        if (Number.isFinite(number) && number > 1_000_000_000) {
          latest = latest === null ? number : Math.max(latest, number);
        }
      }

      if (child && typeof child === "object") walk(child);
    }
  }

  walk(node);
  return latest;
}

function formatRow(row) {
  return {
    epoch: nullableNumber(row.epoch),
    received_at: row.received_at,
    temperature_c: nullableNumber(row.temperature_c),
    feels_like_c: nullableNumber(row.feels_like_c),
    humidity: nullableNumber(row.humidity),
    dew_point_c: nullableNumber(row.dew_point_c),
    wind_speed_kmh: nullableNumber(row.wind_speed_kmh),
    wind_gust_kmh: nullableNumber(row.wind_gust_kmh),
    wind_direction_deg: nullableNumber(row.wind_direction_deg),
    pressure_hpa: nullableNumber(row.pressure_hpa),
    rain_rate_mm_h: nullableNumber(row.rain_rate_mm_h),
    rain_daily_mm: nullableNumber(row.rain_daily_mm),
    solar_w_m2: nullableNumber(row.solar_w_m2),
    uv_index: nullableNumber(row.uv_index),
    battery_v: batteryVoltageFromRow(row)
  };
}

function usableNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function nullableNumber(value) {
  return usableNumber(value) ? Number(value) : null;
}

function sum(values) {
  return values.reduce((total, value) =>
    total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0
  );
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

async function cachedJson(request, ctx, ttlSeconds, producer) {
  const ttl = Math.max(1, Number(ttlSeconds) || 60);
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("__cache_version", EDGE_CACHE_VERSION);
  const cacheKey = new Request(cacheUrl.toString(), {
    method: "GET"
  });

  let cache = null;

  /*
   * Build a clean cache key so a browser's `cache: no-store` request cannot
   * force every visitor back through D1. Query parameters remain part of the
   * key, so /history?hours=24 and /history?hours=168 stay separate.
   */
  try {
    cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  } catch (error) {
    console.warn("Edge cache read unavailable:", error);
  }

  const data = await producer();
  const response = json(data, 200, {
    "Cache-Control": `public, max-age=${ttl}`,
    "X-Parknacross-Cache": "MISS"
  });

  if (cache) {
    try {
      const put = cache.put(cacheKey, response.clone());
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(put);
      } else {
        await put;
      }
    } catch (error) {
      console.warn("Edge cache write unavailable:", error);
    }
  }

  return response;
}


function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      ...extraHeaders
    }
  });
}
