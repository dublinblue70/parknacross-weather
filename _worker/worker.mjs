// v38.4.95 — bounded calendar work, encrypted background alerts and outdoor outlook.
// Parknacross v38.4.94 — fast admin authentication and live readings before schema work; background cloud recovery.
// Visitor photo calendar exposes dates and counts only; admin archives stay private.
// Parknacross v38.4.91 — bounded event history, public date-matched sky photos and export previews; retains earlier sky, social and archive features.
// Parknacross v38.4.84 — shared daily Weather Window sky override; social enhancements retained.
// Parknacross v38.4.83 — concise platform-specific social posts and optional current-day sky photo.
// Parknacross v38.4.82 — live Met Éireann marine JSON/HTML failover.
// Parknacross v38.4.81 — custom Irish-calendar CSV export ranges.
// Parknacross v38.4.80 — marine health, climate normals and matching daily extrema.
// Parknacross v38.4.74 — bounded complete CSV pagination retained.
// Parknacross v38.4.65 — companion release for dashboard sun/moon phases; ingestion and APIs remain unchanged.
// Parknacross v38.4.64 — preserves the highest valid gateway gust received inside each five-minute archive slot.
// Parknacross v38.4.63 — archive/data integrity hardening retained.
// Parknacross v38.4.62 — exact GW3001/WS90 piezo-rain field mapping; v38.4.61 cloud repair retained.
// Parknacross v38.4.61 — WS90 piezo-rain aliases and missing-rain cloud slot repair.
// Parknacross v38.4.60 — triple-path archive: direct GW3001 five-minute writes, cron sync and cloud recovery.
// Parknacross v38.4.59 — archive resilience: scheduled-sync telemetry and a throttled GW3001 recovery trigger.
// Parknacross v38.4.58 — WH52 gateway delivery diagnostics and query-free short path; existing behaviour retained.
// Parknacross v38.4.57 — short GW3001 upload URL for the gateway's path-length limit; v38.4.56 behaviour retained.
// Parknacross v38.4.56 — secure GW3001 WH52 direct-upload fallback; cloud ingestion and all existing behaviour retained.
// Parknacross v38.4.55 — broader WH52 cloud-payload path recognition; WH52 archive/API/UI support retained.
// Parknacross v38.4.54 — Ecowitt WH52 ingestion, D1 archive, public API/history and CSV export; existing weather behaviour retained.
// Parknacross v38.4.53 — historical sky-photo import endpoint retained for the admin dashboard; permanent R2 archive retained.
// Parknacross v38.4.50 — opt-in visitor display names and admin-only sky photo like list.
// Parknacross v38.4.49 — consistent visitor likes (unique-vote count and server-confirmed status).
// Parknacross v38.4.47 — visitor likes for Today’s Sky photo; weather/lightning/social behaviour preserved.
// A lightning timestamp is only accepted when the WH57 reports one or more strikes, preventing observation/update times being shown as a false 'Just now' strike.
// Parknacross v38.4.45 — Today's sky photo upload/display via Cloudflare R2.
// Built on the v38.4.41 WH57 timestamp hotfix; weather/archive/social behaviour preserved.
// Parknacross v38.4.40 — WS90 battery provenance and fresh cloud check; original archive/social/cron behaviour preserved.
/* v38.4.32 — Buffer-only social publishing cleanup.
 * Removes the unused legacy social credentials, publishing path and diagnostics.
 * Buffer remains primary for Facebook and X; direct Facebook Graph publishing
 * remains available as the existing Facebook-only fallback.
 */

/* v38.4.31 — apparent-temperature correction.
 * Calculates feels_like_c from temperature, humidity and sustained wind when
 * all three inputs are available, avoiding Ecowitt's unchanged-temperature
 * value while retaining safe fallbacks for incomplete readings.
 */

/* v38.4.28 — dual-network social recovery.
 * Buffer is now the primary free publisher for BOTH Facebook Pages and X/Twitter.
 * Direct Facebook Graph publishing remains a Facebook-only fallback.
 * Adds a safe current-day recovery endpoint that respects per-network day markers.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Parknacross-Admin-Key",
  "Content-Type": "application/json; charset=utf-8"
};

const TABLE = "weather_readings_v2";
const D1_FREE_LIMIT_BYTES = 500 * 1024 * 1024;
const D1_FREE_DAILY_ROWS_READ = 5_000_000;
const D1_FREE_DAILY_ROWS_WRITTEN = 100_000;
const FORECAST_VERIFY_CAPTURE_BASIS = "morning Europe/Dublin daily snapshot";

const STATION_TIME_ZONE = "Europe/Dublin";
const DAILY_TABLE = "weather_daily_v1";
const META_TABLE = "parknacross_meta_v1";
const WH52_UPLOAD_META_KEY = "wh52_gateway_latest_v1";
const WH52_UPLOAD_STATUS_META_KEY = "wh52_gateway_status_v1";
const WH52_UPLOAD_MAX_AGE_SECONDS = 12 * 60;
const ARCHIVE_EXPECTED_INTERVAL_SECONDS = 5 * 60;
const ARCHIVE_STALE_AFTER_SECONDS = 10 * 60;
const ARCHIVE_RECOVERY_COOLDOWN_SECONDS = 4 * 60;
const SCHEDULED_SYNC_ATTEMPT_META_KEY = "archive_scheduled_attempt_epoch_v1";
const SCHEDULED_SYNC_SUCCESS_META_KEY = "archive_scheduled_success_epoch_v1";
const SCHEDULED_SYNC_ERROR_META_KEY = "archive_scheduled_error_v1";
const GATEWAY_RECOVERY_ATTEMPT_META_KEY = "archive_gateway_recovery_attempt_epoch_v1";
const GATEWAY_RECOVERY_SUCCESS_META_KEY = "archive_gateway_recovery_success_epoch_v1";
const GATEWAY_RECOVERY_ERROR_META_KEY = "archive_gateway_recovery_error_v1";
const GATEWAY_DIRECT_SUCCESS_META_KEY = "archive_gateway_direct_success_epoch_v1";
const GATEWAY_DIRECT_ERROR_META_KEY = "archive_gateway_direct_error_v1";
const PAYLOAD_TABLE = "latest_payload_v1";
const VERIFIED_PRESSURE_RECORDS_KEY = "verified_pressure_records_v2";
const GUST_EXCLUSION_PREFIX = "gust_exclusion:";
const TEMP_OUTLIER_DELTA_C = 2.5;
const TEMP_OUTLIER_BASELINE_C = 1.0;
const TEMP_OUTLIER_WINDOW_SECONDS = 30 * 60;
const TEMP_OUTLIER_MIN_NEIGHBORS = 3;
const EDGE_CACHE_VERSION = "v38-4-95-efficient-archive";
const SKY_PHOTO_KEY = "today/current";
const SKY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const SKY_PHOTO_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SKY_PHOTO_LIKES_TABLE = "sky_photo_likes_v1"; // legacy table retained for compatibility
const SKY_PHOTO_VOTERS_TABLE = "sky_photo_voters_v1";
const SKY_PHOTO_ARCHIVE_TABLE = "sky_photo_archive_v1";
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

function isValidStationDayKey(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.toISOString().slice(0, 10) === dayKey;
}

const STATION_DAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {timeZone:STATION_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"});
function stationDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = STATION_DAY_FORMATTER.formatToParts(date);
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

function lastSundayDayKey(year, monthIndex) {
  const date = new Date(Date.UTC(Number(year), Number(monthIndex) + 1, 0, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function dublinLocalMidnightEpoch(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const springChangeDay = lastSundayDayKey(year, 2);
  const autumnChangeDay = lastSundayDayKey(year, 9);

  /*
   * Irish Summer Time starts at 01:00 UTC on the last Sunday in March and
   * ends at 01:00 UTC on the last Sunday in October. At local midnight the
   * spring-change Sunday is still GMT, while the autumn-change Sunday is
   * still IST. This lets hot D1 queries use the indexed epoch column instead
   * of applying a date expression to every row in the archive.
   */
  const offsetHours = dayKey > springChangeDay && dayKey <= autumnChangeDay ? 1 : 0;
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000) - offsetHours * 3600;
}

function stationDayEpochRange(dayKey) {
  const startEpoch = dublinLocalMidnightEpoch(dayKey);
  const nextDay = shiftDayKey(dayKey, 1);
  const endEpoch = nextDay ? dublinLocalMidnightEpoch(nextDay) : null;

  if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch)) return null;
  return { startEpoch, endEpoch };
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
     WHERE key = 'temperature_quality_v31'
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
     VALUES ('temperature_quality_v31', ?)`
  ).bind(new Date().toISOString()).run();
}

async function validatedTemperatureExtremaForDay(env, day) {
  const range = stationDayEpochRange(day);
  if (!range) return { high_c: null, low_c: null, valid_count: 0, rejected_count: 0 };

  const result = await env.DB.prepare(
    `SELECT epoch, temperature_c
     FROM ${TABLE}
     WHERE epoch >= ? AND epoch < ?
       AND temperature_c IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(range.startEpoch, range.endEpoch).all();

  const rows = result.results || [];
  const outliers = temperatureOutlierRows(rows);
  const valid = rows
    .filter(row => !outliers.has(row) && usableNumber(row.temperature_c))
    .map(row => Number(row.temperature_c));

  return {
    high_c: valid.length ? Math.max(...valid) : null,
    low_c: valid.length ? Math.min(...valid) : null,
    valid_count: valid.length,
    rejected_count: outliers.size
  };
}


const GUST_SPIKE_MIN_KMH = 12;
const GUST_SPIKE_DELTA_KMH = 8;
const GUST_SPIKE_WINDOW_SECONDS = 20 * 60;
const GUST_CALM_NEIGHBOR_MAX_KMH = 7;
const GUST_SUSTAINED_WIND_MAX_KMH = 7;


function gustOutlierRows(rows) {
  const ordered = (rows || [])
    .map(row => ({
      row,
      epoch: Number(row?.epoch),
      gust: Number(row?.wind_gust_kmh),
      speed: usableNumber(row?.wind_speed_kmh) ? Number(row.wind_speed_kmh) : null
    }))
    .filter(item => Number.isFinite(item.epoch) && usableNumber(item.row?.wind_gust_kmh))
    .sort((a, b) => a.epoch - b.epoch);

  const outliers = new Set();

  for (const candidate of ordered) {
    if (candidate.gust < GUST_SPIKE_MIN_KMH) continue;

    const before = ordered.filter(item =>
      item !== candidate &&
      item.epoch < candidate.epoch &&
      candidate.epoch - item.epoch <= GUST_SPIKE_WINDOW_SECONDS
    );
    const after = ordered.filter(item =>
      item !== candidate &&
      item.epoch > candidate.epoch &&
      item.epoch - candidate.epoch <= GUST_SPIKE_WINDOW_SECONDS
    );
    const neighbors = [...before, ...after];

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

function validatedPeakGustFromRows(rows, persistedExcludedEpochs = new Set()) {
  const automaticOutliers = gustOutlierRows(rows);
  const valid = (rows || [])
    .filter(row =>
      !automaticOutliers.has(row) &&
      !persistedExcludedEpochs.has(Number(row.epoch)) &&
      usableNumber(row.wind_gust_kmh)
    );

  const peakRow = valid.reduce((best, row) =>
    !best || Number(row.wind_gust_kmh) > Number(best.wind_gust_kmh) ? row : best
  , null);

  const rejectedEpochs = new Set([
    ...[...automaticOutliers].map(row => Number(row.epoch)),
    ...persistedExcludedEpochs
  ]);

  return {
    peak_gust_kmh: peakRow ? Number(peakRow.wind_gust_kmh) : null,
    peak_epoch: peakRow ? Number(peakRow.epoch) : null,
    valid_count: valid.length,
    rejected_count: rejectedEpochs.size,
    automatic_outliers: automaticOutliers,
    rejected_epochs: rejectedEpochs
  };
}

async function allGustExclusions(env) {
  const result = await env.DB.prepare(
    `SELECT key, value
     FROM ${META_TABLE}
     WHERE key LIKE ?
     ORDER BY key ASC`
  ).bind(`${GUST_EXCLUSION_PREFIX}%`).all();

  const exclusions = [];
  for (const row of result.results || []) {
    try {
      const value = JSON.parse(row.value || "{}");
      if (!usableNumber(value.epoch)) continue;
      exclusions.push({
        epoch: Number(value.epoch),
        reason: String(value.reason || "Excluded by gust quality control"),
        source: String(value.source || "automatic"),
        created_at: value.created_at || null
      });
    } catch (_) {}
  }
  return exclusions;
}

async function gustExclusionsForDay(env, day) {
  const rows = await allGustExclusions(env);
  return rows.filter(row =>
    stationDayKey(new Date(Number(row.epoch) * 1000)) === day
  );
}

async function gustExclusionsSince(env, cutoffEpoch) {
  const rows = await allGustExclusions(env);
  return rows
    .filter(row => Number(row.epoch) >= Number(cutoffEpoch))
    .sort((a, b) => Number(a.epoch) - Number(b.epoch));
}

async function syncAutomaticGustExclusionsForDay(env, day, automaticOutliers) {
  const existing = await gustExclusionsForDay(env, day);
  const statements = [];

  for (const row of existing.filter(row => row.source === "automatic")) {
    statements.push(
      env.DB.prepare(`DELETE FROM ${META_TABLE} WHERE key = ?`)
        .bind(`${GUST_EXCLUSION_PREFIX}${Number(row.epoch)}`)
    );
  }

  for (const row of automaticOutliers) {
    const key = `${GUST_EXCLUSION_PREFIX}${Number(row.epoch)}`;

    const existingRow = await env.DB.prepare(
      `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
    ).bind(key).first();

    let existingValue = null;
    try {
      existingValue = existingRow?.value ? JSON.parse(existingRow.value) : null;
    } catch (_) {}

    if (existingValue?.source === "manual") continue;

    const payload = JSON.stringify({
      epoch: Number(row.epoch),
      reason: `Isolated gust spike (${round1(row.wind_gust_kmh)} km/h) surrounded by calm observations`,
      source: "automatic",
      created_at: new Date().toISOString()
    });

    statements.push(
      env.DB.prepare(
        `INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`
      ).bind(key, payload)
    );
  }

  if (statements.length) await env.DB.batch(statements);
}

async function seedConfirmedGustExclusion(env) {
  const markerKey = "gust_quality_seed_2026_09_16_0812";
  const marker = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
  ).bind(markerKey).first();

  if (marker) return;

  const seedRange = stationDayEpochRange("2026-09-16");
  const result = seedRange
    ? await env.DB.prepare(
        `SELECT epoch, wind_gust_kmh
         FROM ${TABLE}
         WHERE epoch >= ? AND epoch < ?
           AND wind_gust_kmh IS NOT NULL
         ORDER BY epoch ASC`
      ).bind(seedRange.startEpoch, seedRange.endEpoch).all()
    : { results: [] };

  for (const row of result.results || []) {
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: STATION_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(new Date(Number(row.epoch) * 1000));

    if (
      localTime === "08:12" &&
      Math.abs(Number(row.wind_gust_kmh) - 15.5) <= 0.3
    ) {
      const payload = JSON.stringify({
        epoch: Number(row.epoch),
        reason: "Confirmed suspect gust at 08:12 on 16 September 2026",
        source: "manual",
        created_at: new Date().toISOString()
      });

      await env.DB.prepare(
        `INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`
      ).bind(`${GUST_EXCLUSION_PREFIX}${Number(row.epoch)}`, payload).run();
      break;
    }
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`
  ).bind(markerKey, new Date().toISOString()).run();
}

async function revalidateDailyGustQuality(env, day) {
  // v38.4.16: READ-ONLY quality calculation.
  // Previous versions deleted/reinserted automatic exclusions and updated the
  // daily row whenever a public endpoint or cron revalidated gusts. That made
  // ordinary reads capable of consuming D1's daily rows-written allowance.
  if (!day) {
    return { peak_gust_kmh: null, peak_epoch: null, valid_count: 0, rejected_count: 0 };
  }

  const range = stationDayEpochRange(day);
  if (!range) {
    return { peak_gust_kmh: null, peak_epoch: null, valid_count: 0, rejected_count: 0 };
  }

  const result = await env.DB.prepare(
    `SELECT epoch, wind_speed_kmh, wind_gust_kmh
     FROM ${TABLE}
     WHERE epoch >= ? AND epoch < ?
       AND wind_gust_kmh IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(range.startEpoch, range.endEpoch).all();

  const rows = result.results || [];
  const persisted = await gustExclusionsForDay(env, day);
  const persistedEpochs = new Set(persisted.map(row => Number(row.epoch)));
  return validatedPeakGustFromRows(rows, persistedEpochs);
}

async function validatedPeakGustForDay(env, day) {
  return revalidateDailyGustQuality(env, day);
}

async function gustRecordIsOutlier(env, candidate) {
  if (!candidate || !usableNumber(candidate.epoch) || !usableNumber(candidate.wind_gust_kmh)) return false;

  const stored = await env.DB.prepare(
    `SELECT value
     FROM ${META_TABLE}
     WHERE key = ?
     LIMIT 1`
  ).bind(`${GUST_EXCLUSION_PREFIX}${Number(candidate.epoch)}`).first();

  if (stored) return true;

  const start = Number(candidate.epoch) - GUST_SPIKE_WINDOW_SECONDS;
  const end = Number(candidate.epoch) + GUST_SPIKE_WINDOW_SECONDS;
  const nearby = await env.DB.prepare(
    `SELECT epoch, wind_speed_kmh, wind_gust_kmh
     FROM ${TABLE}
     WHERE epoch >= ? AND epoch <= ? AND wind_gust_kmh IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(start, end).all();

  const rows = (nearby.results || []).map(row =>
    Number(row.epoch) === Number(candidate.epoch) ? candidate : row
  );

  return gustOutlierRows(rows).has(candidate);
}



/* v38.4.20 — Met Éireann dashboard forecast resilience.
 * /met/forecast now falls back JSON -> XML -> live Leinster webpage.
 * No change to Facebook/X publishing, D1 protection, station data or other endpoints.
 */

/* v38.4.30 — final reliability hardening.
 * Facebook AND X are only marked complete after Buffer reports sent.
 * Cron jobs are isolated so unrelated archive/QC failures cannot block the
 * 07:30 social run. Public social diagnostics no longer call Buffer live and
 * manual recovery is admin-only. Raw CSV exports use fixed cacheable windows.
 *
 * v38.4.29 — Facebook delivery verification.
 * Buffer Facebook posts include explicit metadata.facebook.type=post.
 * A Buffer createPost acceptance is no longer treated as a successful Facebook
 * publication: shareNow is tracked until Buffer reports sent/error. Pending
 * Facebook post IDs are reused across retries to prevent duplicates.
 */
const SOCIAL_LAST_DAY_KEY = "social_last_observation_day";
const SOCIAL_LAST_SUCCESS_KEY = "social_last_success";
const SOCIAL_LAST_ERROR_KEY = "social_last_error";
const SOCIAL_LAST_PROVIDER_KEY = "social_last_provider";
const SOCIAL_LAST_POST_ID_KEY = "social_last_post_id";
const SOCIAL_TEST_LAST_SUCCESS_KEY = "social_test_last_success";
const SOCIAL_FB_LAST_DAY_KEY = "social_facebook_last_day";
const SOCIAL_FB_VERIFIED_DAY_KEY = "social_facebook_verified_day_v2";
const SOCIAL_FB_PENDING_POST_KEY = "social_facebook_pending_post_v2";
const SOCIAL_FB_LAST_ERROR_KEY = "social_facebook_last_error";
const SOCIAL_X_LAST_DAY_KEY = "social_x_last_day";
const SOCIAL_X_VERIFIED_DAY_KEY = "social_x_verified_day_v2";
const SOCIAL_X_PENDING_POST_KEY = "social_x_pending_post_v2";
const SOCIAL_X_LAST_ERROR_KEY = "social_x_last_error";
const SOCIAL_RUN_START_MINUTE = 7 * 60 + 30;
const SOCIAL_RUN_END_MINUTE = 12 * 60;
const SOCIAL_LOCK_STALE_MS = 90 * 1000;
const FACEBOOK_GRAPH_DEFAULT_VERSION = "v26.0";

function stationClockParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STATION_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second)
  };
}

function stationLocalIso(value = new Date()) {
  const p = stationClockParts(value);
  const pad = n => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

function inDailySocialWindow(value = new Date()) {
  const p = stationClockParts(value);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= SOCIAL_RUN_START_MINUTE && minutes < SOCIAL_RUN_END_MINUTE;
}

function friendlyDayLabel(day) {
  const match = String(day || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  }).format(date);
}

function firstSentence(text, maxLength = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const match = clean.match(/^(.+?[.!?])(?:\s|$)/);
  const sentence = match ? match[1] : clean;
  return sentence.length <= maxLength ? sentence : `${sentence.slice(0, maxLength - 1).trim()}…`;
}

function compass16(deg) {
  if (!usableNumber(deg)) return null;
  const labels = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const normalized = ((Number(deg) % 360) + 360) % 360;
  return labels[Math.round(normalized / 22.5) % 16];
}

async function readMetaMap(env, keys) {
  if (!keys.length) return {};
  const placeholders = keys.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT key, value FROM ${META_TABLE} WHERE key IN (${placeholders})`
  ).bind(...keys).all();
  return Object.fromEntries((result.results || []).map(row => [row.key, row.value]));
}

async function writeMeta(env, entries) {
  const statements = Object.entries(entries).map(([key, value]) =>
    env.DB.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`).bind(key, String(value ?? ""))
  );
  if (statements.length) await env.DB.batch(statements);
}

function safeErrorMessage(error) {
  return String(error?.message || error || "Unknown error").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function archiveIngestStatus(env) {
  const now = Math.floor(Date.now() / 1000);
  const [latest, meta] = await Promise.all([
    env.DB.prepare(
      `SELECT epoch, received_at, temperature_c, humidity, wind_speed_kmh,
              wind_gust_kmh, wind_direction_deg, pressure_hpa,
              rain_rate_mm_h, rain_daily_mm, solar_w_m2, uv_index,
              soil_moisture_pct, soil_temperature_c, soil_ec_us_cm,
              lightning_strikes, lightning_distance_km
       FROM ${TABLE} ORDER BY epoch DESC LIMIT 1`
    ).first(),
    readMetaMap(env, [
      SCHEDULED_SYNC_ATTEMPT_META_KEY,
      SCHEDULED_SYNC_SUCCESS_META_KEY,
      SCHEDULED_SYNC_ERROR_META_KEY,
      GATEWAY_RECOVERY_ATTEMPT_META_KEY,
      GATEWAY_RECOVERY_SUCCESS_META_KEY,
      GATEWAY_RECOVERY_ERROR_META_KEY,
      GATEWAY_DIRECT_SUCCESS_META_KEY,
      GATEWAY_DIRECT_ERROR_META_KEY
    ])
  ]);
  const epochValue = key => {
    const value = Number(meta[key]);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const iso = epoch => epoch === null ? null : new Date(epoch * 1000).toISOString();
  const latestEpoch = usableNumber(latest?.epoch) ? Number(latest.epoch) : null;
  const latestAge = latestEpoch === null ? null : Math.max(0, now - latestEpoch);
  const scheduledAttempt = epochValue(SCHEDULED_SYNC_ATTEMPT_META_KEY);
  const scheduledSuccess = epochValue(SCHEDULED_SYNC_SUCCESS_META_KEY);
  const recoveryAttempt = epochValue(GATEWAY_RECOVERY_ATTEMPT_META_KEY);
  const recoverySuccess = epochValue(GATEWAY_RECOVERY_SUCCESS_META_KEY);
  const directSuccess = epochValue(GATEWAY_DIRECT_SUCCESS_META_KEY);
  const coreFieldNames = [
    "temperature_c", "humidity", "wind_speed_kmh", "wind_gust_kmh",
    "wind_direction_deg", "pressure_hpa", "solar_w_m2", "uv_index"
  ];
  const missingCoreFields = latest
    ? coreFieldNames.filter(field => !usableNumber(latest[field]))
    : coreFieldNames;
  return {
    expected_interval_seconds: ARCHIVE_EXPECTED_INTERVAL_SECONDS,
    stale_after_seconds: ARCHIVE_STALE_AFTER_SECONDS,
    archive_status: latestAge === null ? "no_data" : latestAge <= ARCHIVE_STALE_AFTER_SECONDS ? "current" : "delayed",
    latest_epoch: latestEpoch,
    latest_received_at: latest?.received_at || iso(latestEpoch),
    latest_age_seconds: latestAge,
    latest_field_status: {
      core_complete: missingCoreFields.length === 0,
      missing_core_fields: missingCoreFields,
      rain_rate_available: usableNumber(latest?.rain_rate_mm_h),
      rain_total_available: usableNumber(latest?.rain_daily_mm),
      soil_complete: ["soil_moisture_pct", "soil_temperature_c", "soil_ec_us_cm"]
        .every(field => usableNumber(latest?.[field])),
      lightning_counter_available: usableNumber(latest?.lightning_strikes),
      lightning_event_distance_available: usableNumber(latest?.lightning_distance_km)
    },
    scheduled: {
      last_attempt_at: iso(scheduledAttempt),
      last_success_at: iso(scheduledSuccess),
      last_error: meta[SCHEDULED_SYNC_ERROR_META_KEY] || null
    },
    gateway_recovery: {
      last_attempt_at: iso(recoveryAttempt),
      last_success_at: iso(recoverySuccess),
      last_error: meta[GATEWAY_RECOVERY_ERROR_META_KEY] || null
    },
    gateway_direct: {
      last_success_at: iso(directSuccess),
      last_error: meta[GATEWAY_DIRECT_ERROR_META_KEY] || null
    }
  };
}

async function recoverArchiveFromGateway(env, receivedEpoch) {
  const now = Number(receivedEpoch) || Math.floor(Date.now() / 1000);
  const [latest, meta] = await Promise.all([
    env.DB.prepare(`SELECT epoch FROM ${TABLE} ORDER BY epoch DESC LIMIT 1`).first(),
    readMetaMap(env, [GATEWAY_RECOVERY_ATTEMPT_META_KEY])
  ]);
  const latestEpoch = usableNumber(latest?.epoch) ? Number(latest.epoch) : null;
  if (latestEpoch !== null && now - latestEpoch <= ARCHIVE_STALE_AFTER_SECONDS) {
    return { attempted: false, reason: "archive_current", latest_epoch: latestEpoch };
  }
  const lastAttempt = Number(meta[GATEWAY_RECOVERY_ATTEMPT_META_KEY]);
  if (Number.isFinite(lastAttempt) && now - lastAttempt < ARCHIVE_RECOVERY_COOLDOWN_SECONDS) {
    return { attempted: false, reason: "cooldown", latest_epoch: latestEpoch };
  }

  await writeMeta(env, {
    [GATEWAY_RECOVERY_ATTEMPT_META_KEY]: now,
    [GATEWAY_RECOVERY_ERROR_META_KEY]: ""
  });
  try {
    const result = await syncEcowitt(env);
    await writeMeta(env, {
      [GATEWAY_RECOVERY_SUCCESS_META_KEY]: Math.floor(Date.now() / 1000),
      [GATEWAY_RECOVERY_ERROR_META_KEY]: ""
    });
    return { attempted: true, recovered: true, epoch: result?.epoch ?? null };
  } catch (error) {
    await writeMeta(env, {
      [GATEWAY_RECOVERY_ERROR_META_KEY]: safeErrorMessage(error)
    });
    console.warn("GW3001 archive recovery failed:", error);
    return { attempted: true, recovered: false, error: safeErrorMessage(error) };
  }
}

function parseVerifiedPressureRecords(value) {
  if (!value) return { high: null, low: null };
  try {
    const parsed = JSON.parse(value);
    const clean = record => {
      if (!record || !usableNumber(record.value) || !usableNumber(record.epoch)) return null;
      const pressure = Number(record.value);
      if (pressure < 850 || pressure > 1100) return null;
      return {
        value: pressure,
        epoch: Number(record.epoch),
        received_at: record.received_at || new Date(Number(record.epoch) * 1000).toISOString()
      };
    };
    return { high: clean(parsed?.high), low: clean(parsed?.low) };
  } catch (_) {
    return { high: null, low: null };
  }
}

async function readVerifiedPressureRecords(env) {
  const meta = await readMetaMap(env, [VERIFIED_PRESSURE_RECORDS_KEY]);
  return parseVerifiedPressureRecords(meta[VERIFIED_PRESSURE_RECORDS_KEY]);
}

async function pressureCandidateIsOutlier(env, pressureValue, epoch) {
  if (!usableNumber(pressureValue) || !usableNumber(epoch)) return true;
  const pressure = Number(pressureValue);
  const when = Number(epoch);
  if (pressure < 850 || pressure > 1100) return true;

  /*
   * Sea-level pressure changes smoothly. Compare every prospective record
   * with recent verified archive context before allowing it to become an
   * all-time high/low. If there is no recent context (for example the first
   * reading after a long outage), use a deliberately broad meteorological
   * seed range rather than accepting any syntactically valid 850–1100 hPa.
   */
  const recent = await env.DB.prepare(
    `SELECT epoch, pressure_hpa FROM ${TABLE}
     WHERE epoch >= ? AND epoch < ? AND pressure_hpa IS NOT NULL
     ORDER BY epoch DESC LIMIT 12`
  ).bind(when - 45 * 60, when).all();

  const rows = recent.results || [];
  const values = rows.map(row => Number(row.pressure_hpa)).filter(Number.isFinite);
  if (!values.length) return pressure < 930 || pressure > 1060;

  const baseline = median(values);
  if (Number.isFinite(baseline) && values.length >= 2 && Math.abs(pressure - baseline) > 4.0) {
    return true;
  }

  const nearest = rows[0];
  if (nearest && usableNumber(nearest.pressure_hpa) && usableNumber(nearest.epoch)) {
    const gapMinutes = Math.max(0, (when - Number(nearest.epoch)) / 60);
    const delta = Math.abs(pressure - Number(nearest.pressure_hpa));
    if (gapMinutes <= 15 && delta > 3.0) return true;
    if (gapMinutes <= 120 && gapMinutes > 0 && (delta / (gapMinutes / 60)) > 8.0) return true;
  }
  return false;
}

async function pressureRecordIsOutlier(env, candidate) {
  if (!candidate || !usableNumber(candidate.pressure_hpa) || !usableNumber(candidate.epoch)) return true;
  const pressure = Number(candidate.pressure_hpa);
  const epoch = Number(candidate.epoch);
  if (pressure < 850 || pressure > 1100) return true;

  const nearby = await env.DB.prepare(
    `SELECT epoch, pressure_hpa FROM ${TABLE}
     WHERE epoch >= ? AND epoch <= ? AND epoch != ? AND pressure_hpa IS NOT NULL
     ORDER BY epoch ASC`
  ).bind(epoch - 30 * 60, epoch + 30 * 60, epoch).all();
  const values = (nearby.results || []).map(row => Number(row.pressure_hpa)).filter(Number.isFinite);
  if (!values.length) return pressure < 930 || pressure > 1060;
  const baseline = median(values);
  return values.length >= 2 && Number.isFinite(baseline) && Math.abs(pressure - baseline) > 4.0;
}

async function updateVerifiedPressureRecords(env, pressureValue, epoch, receivedAt) {
  if (!usableNumber(pressureValue) || !usableNumber(epoch)) return { high: null, low: null };
  const pressure = Number(pressureValue);
  if (pressure < 850 || pressure > 1100) return { high: null, low: null };
  if (await pressureCandidateIsOutlier(env, pressure, epoch)) {
    console.warn("Rejected implausible sea-level pressure record candidate", { pressure, epoch });
    return readVerifiedPressureRecords(env);
  }

  const records = await readVerifiedPressureRecords(env);
  const candidate = {
    value: pressure,
    epoch: Number(epoch),
    received_at: receivedAt || new Date(Number(epoch) * 1000).toISOString()
  };

  let changed = false;
  if (!records.high || pressure > Number(records.high.value)) {
    records.high = candidate;
    changed = true;
  }
  if (!records.low || pressure < Number(records.low.value)) {
    records.low = candidate;
    changed = true;
  }

  if (changed) {
    await writeMeta(env, {
      [VERIFIED_PRESSURE_RECORDS_KEY]: JSON.stringify(records)
    });
  }
  return records;
}

function stationWallClockEpoch(dayKey, hour, minute = 0) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetHour = Number(hour);
  const targetMinute = Number(minute);
  const wallAsUtcMs = Date.UTC(year, month - 1, day, targetHour, targetMinute, 0);

  // Dublin is UTC or UTC+1. Test both possible UTC instants and keep the one
  // that formats back to the requested local wall-clock time. This remains
  // correct on the March/October DST transition days.
  for (const offsetHours of [0, 1]) {
    const candidate = new Date(wallAsUtcMs - offsetHours * 3600_000);
    const p = stationClockParts(candidate);
    if (
      p.year === year && p.month === month && p.day === day &&
      p.hour === targetHour && p.minute === targetMinute
    ) {
      return Math.floor(candidate.getTime() / 1000);
    }
  }
  return null;
}

function socialObservationTimeLabel(epoch) {
  if (!usableNumber(epoch)) return "07:30";
  const p = stationClockParts(new Date(Number(epoch) * 1000));
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

async function getSocialObservationAt0730(env, day) {
  const targetEpoch = stationWallClockEpoch(day, 7, 30);
  if (!usableNumber(targetEpoch)) return null;
  const toleranceSeconds = 35 * 60;
  const row = await env.DB.prepare(
    `SELECT epoch, received_at, temperature_c, feels_like_c, humidity, dew_point_c,
            wind_speed_kmh, wind_gust_kmh, wind_direction_deg, pressure_hpa,
            rain_rate_mm_h, rain_daily_mm, solar_w_m2, uv_index
     FROM ${TABLE}
     WHERE epoch >= ? AND epoch <= ?
     ORDER BY ABS(epoch - ?) ASC
     LIMIT 1`
  ).bind(
    Number(targetEpoch) - toleranceSeconds,
    Math.min(Number(targetEpoch) + toleranceSeconds, Math.floor(Date.now() / 1000)),
    Number(targetEpoch)
  ).first();

  if (!row) return null;

  // Reuse the station's existing QC before socialising an isolated reading.
  // If a temperature or gust candidate is rejected, omit just that field;
  // do not abort the whole daily post.
  let temperature = nullableNumber(row.temperature_c);
  let gust = nullableNumber(row.wind_gust_kmh);
  try {
    if (temperature !== null && await temperatureRecordIsOutlier(env, row)) temperature = null;
  } catch (_) {}
  try {
    if (gust !== null && await gustRecordIsOutlier(env, row)) gust = null;
  } catch (_) {}

  return {
    day,
    target_epoch: Number(targetEpoch),
    epoch: Number(row.epoch),
    received_at: row.received_at || null,
    observed_time: socialObservationTimeLabel(row.epoch),
    minutes_from_target: Math.round(Math.abs(Number(row.epoch) - Number(targetEpoch)) / 60),
    temperature_c: temperature,
    feels_like_c: nullableNumber(row.feels_like_c),
    humidity: nullableNumber(row.humidity),
    dew_point_c: nullableNumber(row.dew_point_c),
    wind_speed_kmh: nullableNumber(row.wind_speed_kmh),
    wind_gust_kmh: gust,
    wind_direction_deg: nullableNumber(row.wind_direction_deg),
    pressure_hpa: nullableNumber(row.pressure_hpa),
    rain_rate_mm_h: nullableNumber(row.rain_rate_mm_h),
    rain_daily_mm: correctedRainForDay(day, row.rain_daily_mm),
    solar_w_m2: nullableNumber(row.solar_w_m2),
    uv_index: nullableNumber(row.uv_index)
  };
}

async function validatedDailySummaryForSocial(env, day) {
  const row = await env.DB.prepare(
    `SELECT day, sample_count, high_c, low_c, peak_gust_kmh, rain_mm
     FROM ${DAILY_TABLE}
     WHERE day = ?
     LIMIT 1`
  ).bind(day).first();

  if (!row) return { available: false, day };
  const [tempQuality, gustQuality] = await Promise.all([
    validatedTemperatureExtremaForDay(env, day),
    validatedPeakGustForDay(env, day)
  ]);
  return {
    available: true,
    day,
    sample_count: Number(row.sample_count || 0),
    high_c: usableNumber(tempQuality.high_c) ? Number(tempQuality.high_c) : nullableNumber(row.high_c),
    low_c: usableNumber(tempQuality.low_c) ? Number(tempQuality.low_c) : nullableNumber(row.low_c),
    rain_mm: correctedRainForDay(day, row.rain_mm),
    peak_gust_kmh: usableNumber(gustQuality.peak_gust_kmh) ? Number(gustQuality.peak_gust_kmh) : nullableNumber(row.peak_gust_kmh)
  };
}

async function fetchMetEireannPointForecastXml() {
  const endpoints = [
    "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=52.6247;long=-6.25",
    "https://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=52.6247;long=-6.25"
  ];
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { "Accept": "application/xml,text/xml", "User-Agent": "ParknacrossWeather/1.0 parknacrossweather.ie" },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        errors.push(`${endpoint.startsWith("https:") ? "https" : "http"} HTTP ${response.status}`);
        continue;
      }
      const xml = await response.text();
      if (/<time\b/i.test(xml) && /<temperature\b/i.test(xml)) return xml;
      errors.push(`${endpoint.startsWith("https:") ? "https" : "http"} returned no forecast data`);
    } catch (error) {
      errors.push(`${endpoint.startsWith("https:") ? "https" : "http"}: ${error?.message || String(error)}`);
    }
  }
  throw new Error(`Met Éireann point forecast unavailable: ${errors.join(" | ")}`);
}

function parseHourlySkyForecast(xml, nowEpoch = Math.floor(Date.now() / 1000)) {
  const points = new Map();
  for (const block of String(xml || "").matchAll(/<time\b[^>]*from="([^"]+)"[^>]*to="([^"]+)"[^>]*>([\s\S]*?)<\/time>/gi)) {
    const from = Date.parse(block[1]) / 1000, to = Date.parse(block[2]) / 1000;
    // Cloud cover is instantaneous; accumulated forecast periods are not samples.
    if (!Number.isFinite(from) || from !== to || from < nowEpoch - 3 * 3600 || from > nowEpoch + 30 * 3600) continue;
    const tag = block[3].match(/<cloudiness\b[^>]*(?:percent|value)="([^"]+)"/i);
    const percent = tag ? socialBoundedNumber(tag[1], 0, 100) : null;
    if (percent !== null) points.set(from, {epoch:from,cloud_percent:percent});
  }
  return [...points.values()].sort((a,b) => a.epoch-b.epoch);
}

async function getOutdoorOutlook() {
 const xml=await fetchMetEireannPointForecastXml(),now=Math.floor(Date.now()/1000),rows=new Map();
 const rowAt=epoch=>{if(!rows.has(epoch))rows.set(epoch,{epoch,temperature_c:null,wind_kmh:null,rain_mm:null,daylight:null});return rows.get(epoch);};
 for(const b of xml.matchAll(/<time\b[^>]*from="([^"]+)"[^>]*to="([^"]+)"[^>]*>([\s\S]*?)<\/time>/gi)){
  const from=Date.parse(b[1])/1000,to=Date.parse(b[2])/1000,body=b[3];if(!Number.isFinite(from)||!Number.isFinite(to)||from<now-3600||from>now+25*3600)continue;
  if(from===to){const row=rowAt(from),temp=body.match(/<temperature[^>]*value="([^"]+)"/i),wind=body.match(/<windSpeed[^>]*(?:mps|value)="([^"]+)"/i);row.temperature_c=temp?socialBoundedNumber(temp[1],-40,50):null;row.wind_kmh=wind?socialBoundedNumber(Number(wind[1])*3.6,0,200):null;}
  else if(to-from===3600){const precip=body.match(/<precipitation[^>]*value="([^"]+)"/i);if(precip)rowAt(from).rain_mm=socialBoundedNumber(precip[1],0,100);}
 }
 const points=[...rows.values()].sort((a,b)=>a.epoch-b.epoch);for(const row of points){const sun=solarAltitude(row.epoch+1800,52.6247,-6.25);row.daylight=sun>0;}
 return {source:"Met Éireann point forecast",fetched_at:new Date().toISOString(),forecast:true,points};
}
// Solar altitude at the middle of each forecast hour; no fixed daylight-hour assumption.
function solarAltitude(epoch,latitude,longitude){const d=epoch/86400-10957.5,rad=Math.PI/180,g=(357.529+.98560028*d)*rad,q=(280.459+.98564736*d)*rad,L=q+(1.915*Math.sin(g)+.020*Math.sin(2*g))*rad,e=(23.439-.00000036*d)*rad,ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dec=Math.asin(Math.sin(e)*Math.sin(L)),sidereal=(280.16+360.9856235*d+longitude)*rad,h=sidereal-ra,lat=latitude*rad;return Math.asin(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(h))/rad;}

async function getHourlySkyForecast() {
  const xml = await fetchMetEireannPointForecastXml();
  const points = parseHourlySkyForecast(xml);
  if (!points.length) throw new Error("Hourly forecast cloud cover is temporarily unavailable");
  return {source:"Met Éireann point forecast",latitude:52.6247,longitude:-6.25,
    forecast:true,fetched_at:new Date().toISOString(),points};
}

async function getNext24HourPointForecast() {
  const xml = await fetchMetEireannPointForecastXml();
  const blocks = [...xml.matchAll(/<time[^>]*from="([^"]+)"[^>]*to="([^"]+)"[^>]*>([\s\S]*?)<\/time>/gi)];
  const startMs = Date.now();
  const endMs = startMs + 24 * 3600 * 1000;
  const temperatures = [], winds = [], gusts = [];
  const precipitationPeriods = [];

  for (const block of blocks) {
    const fromMs = Date.parse(block[1]), toMs = Date.parse(block[2]), body = block[3];
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) continue;
    if (toMs <= startMs || fromMs >= endMs) continue;
    const temp = body.match(/<temperature[^>]*value="([^"]+)"/i);
    if (temp && Number.isFinite(Number(temp[1])) && fromMs >= startMs - 3600_000 && fromMs < endMs) temperatures.push(Number(temp[1]));
    const windSpeed = body.match(/<windSpeed[^>]*(?:mps|value)="([^"]+)"/i);
    const windDirection = body.match(/<windDirection[^>]*deg="([^"]+)"/i);
    if (windSpeed && Number.isFinite(Number(windSpeed[1]))) {
      winds.push({ kmh: Number(windSpeed[1]) * 3.6, deg: windDirection && Number.isFinite(Number(windDirection[1])) ? Number(windDirection[1]) : null });
    }
    const windGust = body.match(/<windGust[^>]*(?:mps|value)="([^"]+)"/i);
    if (windGust && Number.isFinite(Number(windGust[1]))) gusts.push(Number(windGust[1]) * 3.6);
    const precipitation = body.match(/<precipitation[^>]*value="([^"]+)"/i);
    const durationHours = Math.max(0, (toMs - fromMs) / 3600_000);
    if (precipitation && durationHours > 0 && durationHours <= 6 && Number.isFinite(Number(precipitation[1]))) {
      precipitationPeriods.push({
        from: fromMs,
        to: toMs,
        value: Math.max(0, Number(precipitation[1]))
      });
    }
  }

  let windDirectionDeg = null;
  if (winds.length) {
    let x = 0, y = 0;
    for (const wind of winds) {
      if (!usableNumber(wind.deg)) continue;
      const radians = Number(wind.deg) * Math.PI / 180;
      const weight = Math.max(Number(wind.kmh) || 0, 1);
      x += Math.cos(radians) * weight; y += Math.sin(radians) * weight;
    }
    if (x !== 0 || y !== 0) windDirectionDeg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  const rainSummary = pointForecastRainTotal(precipitationPeriods, {
    startEpoch: Math.floor(startMs / 1000),
    endEpoch: Math.floor(endMs / 1000)
  });

  return {
    high_c: temperatures.length ? Math.max(...temperatures) : null,
    low_c: temperatures.length ? Math.min(...temperatures) : null,
    rain_mm: rainSummary.total_mm,
    max_wind_kmh: winds.length ? round1(Math.max(...winds.map(item => item.kmh))) : null,
    max_gust_kmh: gusts.length ? round1(Math.max(...gusts)) : null,
    prevailing_wind_text: compass16(windDirectionDeg)
  };
}

function buildObservationSentence(summary) {
  const range = usableNumber(summary.low_c) && usableNumber(summary.high_c) ? `${round1(summary.low_c)}–${round1(summary.high_c)}°C` : null;
  const rain = usableNumber(summary.rain_mm) ? Number(summary.rain_mm) : null;
  const gust = usableNumber(summary.peak_gust_kmh) ? round1(summary.peak_gust_kmh) : null;
  let opening = "Recorded conditions";
  if (rain !== null && rain === 0) opening = "A dry day";
  else if (rain !== null && rain < 2) opening = "A mainly dry day";
  else if (rain !== null && rain < 10) opening = "A day with some rain";
  else if (rain !== null) opening = "A wet day";
  const details = [];
  if (range) details.push(`temperatures ${range}`);
  if (rain !== null) details.push(`${round1(rain)} mm of rain`);
  if (gust !== null) details.push(`a peak gust of ${gust} km/h`);
  return `${opening}${details.length ? `, with ${details.join(", ")}` : ""}.`;
}

// Social observations are measurements, not a prediction of the day's weather.
function socialBoundedNumber(value, low, high) {
  return usableNumber(value) && Number(value) >= low && Number(value) <= high ? Number(value) : null;
}

function sanitizeSocialObservation(observation) {
  const o = { ...observation };
  const bounds = {
    temperature_c: [-40, 50], feels_like_c: [-60, 60], humidity: [0, 100],
    dew_point_c: [-60, 50], wind_speed_kmh: [0, 200], wind_gust_kmh: [0, 250],
    wind_direction_deg: [0, 360], pressure_hpa: [870, 1085],
    rain_daily_mm: [0, 500], rain_rate_mm_h: [0, 500], solar_w_m2: [0, 1500], uv_index: [0, 16]
  };
  for (const [field, [low, high]] of Object.entries(bounds)) o[field] = socialBoundedNumber(o[field], low, high);
  return o;
}

function socialHeadline(o) {
  if (o.wind_gust_kmh !== null && o.wind_gust_kmh >= 40) return "A gusty start in Ardamine";
  if (o.rain_daily_mm !== null && o.rain_daily_mm >= 5) return "Rain has been adding up in Parknacross";
  if (o.temperature_c !== null && o.temperature_c <= 3) return "A chilly start in Ardamine";
  if (o.wind_speed_kmh !== null && o.wind_speed_kmh >= 20) return "A breezy start on the North Wexford coast";
  // Rotate quiet-day wording without inventing cloud cover or comparisons.
  const choices = ["This morning in Ardamine", "A morning check from Parknacross", "North Wexford weather this morning"];
  return choices[Math.floor(o.target_epoch / 86400) % choices.length];
}

function socialTrackedLink(service) {
  return `https://parknacrossweather.ie/?utm_source=${service}&utm_medium=social&utm_campaign=daily_weather`;
}

function socialObservationDetails(o, compact = false) {
  const bits = [];
  if (o.temperature_c !== null) bits.push(`${round1(o.temperature_c)}°C`);
  if (o.wind_speed_kmh !== null) {
    const direction = o.wind_speed_kmh >= 1 ? compass16(o.wind_direction_deg) : null;
    bits.push(`${direction ? direction + " " : ""}wind ${round1(o.wind_speed_kmh)}${compact ? "km/h" : " km/h"}`);
  }
  if (o.rain_daily_mm !== null) bits.push(`${round1(o.rain_daily_mm)}${compact ? "mm" : " mm"} rain since midnight`);
  return bits;
}

function socialForecastSummary(point, regional, compact = false) {
  const bits = [];
  const low = socialBoundedNumber(point?.low_c, -40, 50), high = socialBoundedNumber(point?.high_c, -40, 50);
  if (low !== null && high !== null && low <= high) bits.push(`${round1(low)}–${round1(high)}°C`);
  const rain = socialBoundedNumber(point?.rain_mm, 0, 500);
  if (rain !== null) bits.push(rain > 0 ? `around ${round1(rain)} mm rain` : "little or no rain forecast");
  if (bits.length) return `Met Éireann · next 24h: ${bits.join(" · ")}`;
  const narrative = firstSentence(regional?.today || "", compact ? 70 : 160);
  return narrative ? `Met Éireann · Leinster today: ${narrative}` : "";
}

// X counts URLs as 23 characters and most emoji as two. Budget conservatively.
function socialXLength(text) {
  return Array.from(String(text).replace(/https?:\/\/[^\s]+/g, "x".repeat(23)))
    .reduce((total, char) => total + (char.codePointAt(0) > 0x10ff ? 2 : 1), 0);
}

function buildX0730Text(observation, pointForecast, regionalForecast, test = false) {
  const o = sanitizeSocialObservation(observation);
  const header = `${test ? "TEST · " : ""}${socialHeadline(o)}`;
  const measured = `Observed ${o.observed_time}: ${socialObservationDetails(o, true).join(" · ")}`;
  const forecast = socialForecastSummary(pointForecast, regionalForecast, true);
  const link = socialTrackedLink("x");
  let lines = [header, measured, forecast, link].filter(Boolean);
  if (socialXLength(lines.join("\n")) > 280) lines = [header, measured, link];
  if (socialXLength(lines.join("\n")) > 280) lines = ["Ardamine morning weather", measured, link];
  return lines.join("\n");
}

async function getSocialWeeklyRecap(env, day) {
  const date = new Date(`${day}T12:00:00Z`);
  if (date.getUTCDay() !== 0) return "";
  const days = Array.from({ length: 7 }, (_, i) => shiftDayKey(day, -7 + i));
  const rows = await Promise.all(days.map(d => validatedDailySummaryForSocial(env, d)));
  if (!rows.every(r => r.available && r.sample_count >= 240 && socialBoundedNumber(r.high_c, -40, 50) !== null && socialBoundedNumber(r.low_c, -40, 50) !== null && r.low_c <= r.high_c && socialBoundedNumber(r.rain_mm, 0, 500) !== null)) return "";
  return `Past 7 complete days (${friendlyDayLabel(days[0])}–${friendlyDayLabel(days[6])}): ${round1(Math.min(...rows.map(r => r.low_c)))}–${round1(Math.max(...rows.map(r => r.high_c)))}°C · ${round1(rows.reduce((sum, r) => sum + r.rain_mm, 0))} mm recorded rain.`;
}

async function getDailySocialSkyPhoto(env, day) {
  // Use only today's uploaded photograph; never recycle yesterday's image.
  if (day !== stationDayKey(new Date()) || !env.SKY_PHOTOS?.head || !env.SKY_PHOTOS?.get || !env.SKY_PHOTOS?.put) return null;
  const head = await env.SKY_PHOTOS.head(SKY_PHOTO_KEY);
  if (!head) return null;
  const uploadedAt = String(head.customMetadata?.uploadedAt || "");
  const time = new Date(uploadedAt);
  if (!Number.isFinite(time.getTime()) || time.getTime() > Date.now() + 60_000 || stationDayKey(time) !== day) return null;
  const type = String(head.httpMetadata?.contentType || "image/jpeg").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(type) || !head.size || head.size > 5 * 1024 * 1024) return null;
  const id = `${time.toISOString().replace(/[-:.]/g, "")}.${skyPhotoExtension(type)}`;
  const key = `social/${id}`;
  if (!await env.SKY_PHOTOS.head(key)) {
    const object = await env.SKY_PHOTOS.get(SKY_PHOTO_KEY);
    if (!object || String(object.customMetadata?.uploadedAt || "") !== uploadedAt) return null;
    // Stable snapshot: a subsequent dashboard upload cannot swap Buffer's image.
    await env.SKY_PHOTOS.put(key, object.body, { httpMetadata: { contentType: type } });
  }
  const base = (await readSecret(env.SOCIAL_PUBLIC_API_URL)) || "https://parknacross-weather.dave-s-carter.workers.dev";
  const url = new URL("/social-sky-photo", base);
  url.searchParams.set("id", id);
  // An inaccessible image must not block an otherwise normal text post.
  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
  const available = response.ok && /^image\//i.test(response.headers.get("Content-Type") || "");
  if (response.body) await response.body.cancel();
  return available ? { url: url.toString(), uploaded_at: uploadedAt, day } : null;
}

async function buildDailySocialPost(env, observationDay, { test = false, preview = false } = {}) {
  let raw = await getSocialObservationAt0730(env, observationDay);
  if (!raw && preview) {
    const row = await getLatest(env);
    if (row) raw = { ...formatRow(row), day:observationDay, target_epoch:stationWallClockEpoch(observationDay,7,30), observed_time:socialObservationTimeLabel(row.epoch) };
  }
  if (!raw) throw new Error(`No Parknacross observation is available near 07:30 for ${observationDay}`);
  const observation = sanitizeSocialObservation(raw);
  const age = Date.now() / 1000 - observation.epoch;
  if (!test && !preview && (observationDay !== stationDayKey(new Date()) || age > 45 * 60 || age < -60)) {
    throw new Error("Morning observation is stale or future-dated; social post held for valid data");
  }
  if (!socialObservationDetails(observation).length) throw new Error("No valid temperature, wind or rainfall readings for social post");
  const [pointForecast, regionalForecast, photo, weekly] = await Promise.all([
    getNext24HourPointForecast().catch(() => null),
    getMetForecast().catch(() => null),
    test ? null : getDailySocialSkyPhoto(env, observationDay).catch(() => null),
    getSocialWeeklyRecap(env, observationDay).catch(() => "")
  ]);
  const lines = [
    `${test ? "TEST · " : ""}${socialHeadline(observation)}`, "",
    `${friendlyDayLabel(observationDay)} · recorded in Parknacross at ${observation.observed_time}`,
    socialObservationDetails(observation).join(" · ")
  ];
  if (observation.wind_gust_kmh !== null && observation.wind_gust_kmh >= 40) lines.push(`Gust at this observation: ${round1(observation.wind_gust_kmh)} km/h.`);
  const outlook = socialForecastSummary(pointForecast, regionalForecast);
  if (outlook) lines.push("", outlook);
  if (weekly) lines.push("", weekly);
  if (Number(observationDay.slice(-2)) % 5 === 0) lines.push("", "What’s the sky looking like where you are in North Wexford?");
  lines.push("", `Live readings, radar and today’s sky: ${socialTrackedLink("facebook")}`);
  const facebookText = lines.join("\n");
  const xText = buildX0730Text(observation, pointForecast, regionalForecast, test);
  return { text: facebookText, facebookText, xText, observation, forecast: pointForecast, regional_forecast_available: Boolean(regionalForecast), photo, preview, observation_age_minutes: Math.max(0,Math.round(age / 60)) };
}

async function publishViaFacebookGraph(env, text, photo = null) {
  const pageId = await readSecret(env.FACEBOOK_PAGE_ID);
  const accessToken = await readSecret(env.FACEBOOK_PAGE_ACCESS_TOKEN);
  const graphVersion = (await readSecret(env.FACEBOOK_GRAPH_VERSION)) || FACEBOOK_GRAPH_DEFAULT_VERSION;
  if (!pageId || !accessToken) throw new Error("Facebook Page publishing credentials are incomplete");
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(pageId)}/${photo?.url ? "photos" : "feed"}`;
  const form = new URLSearchParams(); form.set(photo?.url ? "caption" : "message", text); form.set("access_token", accessToken);
  if (photo?.url) form.set("url", photo.url);
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Facebook publish HTTP ${response.status}: ${raw.slice(0, 240)}`);
  let parsed = null; try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { provider: "facebook_graph", status: "published", post_id: parsed?.id || null, photo_url:photo?.url || null, public_url:parsed?.post_id || parsed?.id ? `https://www.facebook.com/${parsed.post_id || parsed.id}` : null };
}

async function publishFacebookPost(env, text, photo = null) {
  const errors = [];

  // Buffer is intentionally first. Its current API is available on the Free
  // plan and supports Facebook Pages as well as X, which makes it the most
  // reliable no-cost automation path for Parknacross Weather.
  if (await readSecret(env.BUFFER_API_KEY)) {
    try { return await publishViaBufferFacebook(env, text, photo); }
    catch (error) { errors.push(`Buffer: ${error?.message || String(error)}`); }
  }

  // Keep direct Meta publishing as a fallback if Page credentials exist.
  if (await readSecret(env.FACEBOOK_PAGE_ID) && await readSecret(env.FACEBOOK_PAGE_ACCESS_TOKEN)) {
    try { return await publishViaFacebookGraph(env, text, photo); }
    catch (error) { errors.push(`Facebook Graph: ${error?.message || String(error)}`); }
  }

  throw new Error(errors.join(" | ") || "Facebook publishing is not configured");
}

async function bufferApiRequest(env, query, variables = {}) {
  const token = await readSecret(env.BUFFER_API_KEY);
  if (!token) throw new Error("BUFFER_API_KEY is not configured");

  const response = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Buffer API HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }

  let payload;
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch (_) { throw new Error(`Buffer API returned invalid JSON: ${raw.slice(0, 180)}`); }

  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error(`Buffer API: ${payload.errors.map(item => item?.message || "Unknown GraphQL error").join(" | ")}`);
  }
  return payload?.data || {};
}

function normalizeBufferChannelName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function getBufferChannel(env, service, preferredHints = []) {
  const wantedService = String(service || "").toLowerCase();
  const accountData = await bufferApiRequest(env, `
    query ParknacrossOrganizations {
      account {
        organizations { id name }
      }
    }
  `);
  const organizations = accountData?.account?.organizations || [];
  if (!organizations.length) throw new Error("No Buffer organization is available for this API key");

  const candidates = [];
  for (const organization of organizations) {
    const channelData = await bufferApiRequest(env, `
      query ParknacrossChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) {
          id
          name
          displayName
          service
          externalLink
          isDisconnected
          isLocked
          isQueuePaused
        }
      }
    `, { organizationId: organization.id });

    for (const channel of channelData?.channels || []) {
      if (String(channel?.service || "").toLowerCase() !== wantedService) continue;
      if (channel?.isDisconnected || channel?.isLocked) continue;
      candidates.push({ ...channel, organizationId: organization.id, organizationName: organization.name });
    }
  }

  if (!candidates.length) {
    throw new Error(`No active ${wantedService} channel is connected to Buffer`);
  }

  const hints = preferredHints.map(normalizeBufferChannelName).filter(Boolean);
  const preferred = candidates.find(channel => {
    const values = [channel.name, channel.displayName, channel.externalLink].map(normalizeBufferChannelName);
    return hints.some(hint => values.some(value => value.includes(hint)));
  });

  if (preferred) return preferred;
  if (candidates.length === 1) return candidates[0];

  throw new Error(`Multiple Buffer ${wantedService} channels are connected and Parknacross could not be identified (${candidates.map(c => c.name || c.displayName || c.id).join(", ")})`);
}

async function publishViaBufferChannel(env, text, service, photo = null) {
  const wantedService = String(service || "").toLowerCase();
  const hints = wantedService === "twitter"
    ? ["parknacrosswx", "ParknacrossWx"]
    : wantedService === "facebook"
      ? ["parknacrossweather", "Parknacross Weather", "1361994206992789"]
      : [];
  const channel = await getBufferChannel(env, wantedService, hints);
  const mutation = `
    mutation ParknacrossCreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id text dueAt status externalLink }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const input = {
    text,
    channelId: channel.id,
    schedulingType: "automatic",
    mode: "shareNow"
  };

  // Buffer's Facebook metadata has an explicit non-null post type. Supplying
  // it removes ambiguity between a normal Page post, Reel and Story. Keep an
  // explicit empty assets array / approval flag for the current GraphQL schema.
  if (wantedService === "facebook") {
    input.assets = [];
    input.needsApproval = false;
    input.saveToDraft = false;
    input.metadata = { facebook: { type: "post" } };
  }

  if (photo?.url) input.assets = [{ image: { url: photo.url } }];

  let data = await bufferApiRequest(env, mutation, { input });
  // Retry without the optional image only after an explicit rejection with no
  // accepted post ID. Never retry a timeout/ambiguous acceptance here.
  const rejected = data?.createPost;
  if (photo?.url && !rejected?.post?.id && /image|asset|media|photo/i.test(rejected?.message || "")) {
    input.assets = [];
    data = await bufferApiRequest(env, mutation, { input });
  }

  const result = data?.createPost;
  if (!result) throw new Error(`Buffer ${wantedService} did not return a createPost result`);
  if (result?.message && !result?.post) throw new Error(`Buffer ${wantedService} publish: ${result.message}`);
  if (!result?.post?.id) throw new Error(`Buffer ${wantedService} publish did not return a post ID`);

  return {
    provider: `buffer_${wantedService}`,
    status: result.post.status || "submitted",
    post_id: result.post.id,
    public_url: result.post.externalLink || null,
    channel_id: channel.id,
    channel_name: channel.name || channel.displayName || wantedService,
    channel_url: channel.externalLink || null,
    photo_url:input.assets?.[0]?.image?.url || null
  };
}

async function publishViaBufferX(env, text, photo = null) {
  // Track the exact Buffer X post until Buffer reports sent/error. A successful
  // createPost response only means Buffer accepted the request; it does not
  // prove X published it. Reusing the pending post prevents duplicates.
  const pendingMeta = await readMetaMap(env, [SOCIAL_X_PENDING_POST_KEY]);
  const pendingId = String(pendingMeta[SOCIAL_X_PENDING_POST_KEY] || "").trim();
  if (pendingId) {
    const pending = await getBufferPostDelivery(env, pendingId);
    if (pending?.status === "sent") {
      await writeMeta(env, { [SOCIAL_X_PENDING_POST_KEY]: "" });
      return { provider: "buffer_twitter", ...pending, verified: true };
    }
    if (pending?.status === "error") {
      await writeMeta(env, { [SOCIAL_X_PENDING_POST_KEY]: "" });
      if (photo?.url && /image|asset|media|photo/i.test(pending.error || "")) {
        return await publishViaBufferX(env, text, null);
      }
      throw new Error(`Buffer X publishing error: ${pending.error || "unknown X delivery error"}${pending.support_url ? ` · ${pending.support_url}` : ""}`);
    }
    if (pending && ["scheduled", "sending"].includes(pending.status)) {
      return { provider: "buffer_twitter", ...pending, verified: false, pending: true };
    }
    await writeMeta(env, { [SOCIAL_X_PENDING_POST_KEY]: "" });
  }

  const created = await publishViaBufferChannel(env, text, "twitter", photo);
  await writeMeta(env, { [SOCIAL_X_PENDING_POST_KEY]: created.post_id || "" });

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 1500));
    const delivery = await getBufferPostDelivery(env, created.post_id);
    if (delivery?.status === "sent") {
      await writeMeta(env, { [SOCIAL_X_PENDING_POST_KEY]: "" });
      return { ...created, ...delivery, provider: "buffer_twitter", verified: true };
    }
    if (delivery?.status === "error") {
      await writeMeta(env, { [SOCIAL_X_PENDING_POST_KEY]: "" });
      if (photo?.url && /image|asset|media|photo/i.test(delivery.error || "")) {
        return await publishViaBufferX(env, text, null);
      }
      throw new Error(`Buffer X publishing error: ${delivery.error || "unknown X delivery error"}${delivery.support_url ? ` · ${delivery.support_url}` : ""}`);
    }
  }

  const latest = await getBufferPostDelivery(env, created.post_id);
  return { ...created, ...(latest || {}), provider: "buffer_twitter", verified: false, pending: true };
}

async function ensureLegacyXVerifiedMarker(env) {
  // v38.4.29 already produced a confirmed visible X post for the current setup,
  // but only stored the legacy day marker. Seed the new verified marker once so
  // upgrading does not duplicate that already-published post. Future days use
  // SOCIAL_X_VERIFIED_DAY_KEY exclusively.
  const meta = await readMetaMap(env, [SOCIAL_X_VERIFIED_DAY_KEY, SOCIAL_X_LAST_DAY_KEY]);
  if (!meta[SOCIAL_X_VERIFIED_DAY_KEY] && meta[SOCIAL_X_LAST_DAY_KEY]) {
    await writeMeta(env, { [SOCIAL_X_VERIFIED_DAY_KEY]: meta[SOCIAL_X_LAST_DAY_KEY] });
    return meta[SOCIAL_X_LAST_DAY_KEY];
  }
  return meta[SOCIAL_X_VERIFIED_DAY_KEY] || null;
}

async function getBufferPostDelivery(env, postId) {
  if (!postId) return null;
  const data = await bufferApiRequest(env, `
    query ParknacrossPostDelivery($id: PostId!) {
      post(input: { id: $id }) {
        id
        status
        sentAt
        externalLink
        error { message rawError supportUrl }
      }
    }
  `, { id: postId });
  const post = data?.post || null;
  if (!post) return null;
  return {
    post_id: post.id,
    status: String(post.status || "").toLowerCase(),
    sent_at: post.sentAt || null,
    public_url: post.externalLink || null,
    error: post.error?.message || post.error?.rawError || null,
    support_url: post.error?.supportUrl || null
  };
}

async function publishViaBufferFacebook(env, text, photo = null) {
  // If Buffer already accepted a Facebook shareNow post, track that exact post
  // until it reaches sent/error instead of creating duplicates on each retry.
  const pendingMeta = await readMetaMap(env, [SOCIAL_FB_PENDING_POST_KEY]);
  const pendingId = String(pendingMeta[SOCIAL_FB_PENDING_POST_KEY] || "").trim();
  if (pendingId) {
    const pending = await getBufferPostDelivery(env, pendingId);
    if (pending?.status === "sent") {
      await writeMeta(env, { [SOCIAL_FB_PENDING_POST_KEY]: "" });
      return { provider: "buffer_facebook", ...pending, verified: true };
    }
    if (pending?.status === "error") {
      await writeMeta(env, { [SOCIAL_FB_PENDING_POST_KEY]: "" });
      if (photo?.url && /image|asset|media|photo/i.test(pending.error || "")) {
        return await publishViaBufferFacebook(env, text, null);
      }
      throw new Error(`Buffer Facebook publishing error: ${pending.error || "unknown Facebook delivery error"}${pending.support_url ? ` · ${pending.support_url}` : ""}`);
    }
    if (pending && ["scheduled", "sending"].includes(pending.status)) {
      return { provider: "buffer_facebook", ...pending, verified: false, pending: true };
    }
    // Missing/unknown old pending IDs should not block recovery forever.
    await writeMeta(env, { [SOCIAL_FB_PENDING_POST_KEY]: "" });
  }

  const created = await publishViaBufferChannel(env, text, "facebook", photo);
  await writeMeta(env, { [SOCIAL_FB_PENDING_POST_KEY]: created.post_id || "" });

  // shareNow is asynchronous. Buffer accepting createPost is not the same as
  // Meta publishing it. Poll briefly so only a genuinely sent Facebook post
  // becomes today's verified success marker.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 1500));
    const delivery = await getBufferPostDelivery(env, created.post_id);
    if (delivery?.status === "sent") {
      await writeMeta(env, { [SOCIAL_FB_PENDING_POST_KEY]: "" });
      return { ...created, ...delivery, provider: "buffer_facebook", verified: true };
    }
    if (delivery?.status === "error") {
      await writeMeta(env, { [SOCIAL_FB_PENDING_POST_KEY]: "" });
      if (photo?.url && /image|asset|media|photo/i.test(delivery.error || "")) {
        return await publishViaBufferFacebook(env, text, null);
      }
      throw new Error(`Buffer Facebook publishing error: ${delivery.error || "unknown Facebook delivery error"}${delivery.support_url ? ` · ${delivery.support_url}` : ""}`);
    }
  }

  const latest = await getBufferPostDelivery(env, created.post_id);
  return { ...created, ...(latest || {}), provider: "buffer_facebook", verified: false, pending: true };
}

async function socialXEnabled(env) {
  return Boolean(await readSecret(env.BUFFER_API_KEY));
}

async function getBufferConnectionDiagnostic(env) {
  if (!(await readSecret(env.BUFFER_API_KEY))) {
    return { configured: false, status: "not_configured", channels: [] };
  }

  try {
    const accountData = await bufferApiRequest(env, `
      query ParknacrossOrganizationsDiagnostic {
        account { organizations { id name } }
      }
    `);
    const organizations = accountData?.account?.organizations || [];
    const channels = [];

    for (const organization of organizations) {
      const channelData = await bufferApiRequest(env, `
        query ParknacrossChannelsDiagnostic($organizationId: OrganizationId!) {
          channels(input: { organizationId: $organizationId }) {
            id
            name
            displayName
            service
            externalLink
            isDisconnected
            isLocked
            isQueuePaused
          }
        }
      `, { organizationId: organization.id });

      for (const channel of channelData?.channels || []) {
        channels.push({
          organization: organization.name || null,
          id: channel.id,
          service: channel.service || null,
          name: channel.name || channel.displayName || null,
          display_name: channel.displayName || null,
          url: channel.externalLink || null,
          disconnected: Boolean(channel.isDisconnected),
          locked: Boolean(channel.isLocked),
          queue_paused: Boolean(channel.isQueuePaused)
        });
      }
    }

    return { configured: true, status: "ok", channels };
  } catch (error) {
    return {
      configured: true,
      status: "error",
      error: error?.message || String(error),
      channels: []
    };
  }
}

async function getSocialStatus(env) {
  await ensureLegacyXVerifiedMarker(env);
  const meta = await readMetaMap(env, [SOCIAL_LAST_DAY_KEY,SOCIAL_LAST_SUCCESS_KEY,SOCIAL_LAST_ERROR_KEY,SOCIAL_LAST_PROVIDER_KEY,SOCIAL_LAST_POST_ID_KEY,SOCIAL_TEST_LAST_SUCCESS_KEY,SOCIAL_FB_LAST_DAY_KEY,SOCIAL_FB_VERIFIED_DAY_KEY,SOCIAL_FB_PENDING_POST_KEY,SOCIAL_FB_LAST_ERROR_KEY,SOCIAL_X_LAST_DAY_KEY,SOCIAL_X_VERIFIED_DAY_KEY,SOCIAL_X_PENDING_POST_KEY,SOCIAL_X_LAST_ERROR_KEY]);
  const buffer = await getBufferConnectionDiagnostic(env);
  return {
    status: "ok",
    schedule: "07:30 Europe/Dublin · retries/catch-up until 12:00",
    facebook_graph_configured: Boolean(await readSecret(env.FACEBOOK_PAGE_ID) && await readSecret(env.FACEBOOK_PAGE_ACCESS_TOKEN)),
    buffer_api_configured: Boolean(await readSecret(env.BUFFER_API_KEY)),
    buffer_connection: buffer,
    facebook_provider_order: "Buffer → Facebook Graph",
    x_provider: "Buffer",
    x_enabled: await socialXEnabled(env),
    facebook_last_day: meta[SOCIAL_FB_LAST_DAY_KEY] || meta[SOCIAL_LAST_DAY_KEY] || null,
    facebook_verified_day: meta[SOCIAL_FB_VERIFIED_DAY_KEY] || null,
    facebook_pending_post_id: meta[SOCIAL_FB_PENDING_POST_KEY] || null,
    facebook_last_error: meta[SOCIAL_FB_LAST_ERROR_KEY] || null,
    x_last_day: meta[SOCIAL_X_LAST_DAY_KEY] || null,
    x_verified_day: meta[SOCIAL_X_VERIFIED_DAY_KEY] || null,
    x_pending_post_id: meta[SOCIAL_X_PENDING_POST_KEY] || null,
    x_last_error: meta[SOCIAL_X_LAST_ERROR_KEY] || null,
    last_success: meta[SOCIAL_LAST_SUCCESS_KEY] || null,
    last_error: meta[SOCIAL_LAST_ERROR_KEY] || null,
    last_test_success: meta[SOCIAL_TEST_LAST_SUCCESS_KEY] || null
  };
}

function socialDashboardState({day, nowEpoch, targetEpoch, verifiedDay, details, delivery, pendingId, error, enabled}) {
  if (!enabled) return {state:"disabled",label:"Not configured",alert:false};
  const record = details?.day === day ? details : null;
  const errorDate = new Date(String(error || "").split(" · ")[0]);
  const currentError = error && Number.isFinite(errorDate.getTime()) && stationDayKey(errorDate) === day ? error : null;
  const sent = verifiedDay === day || (record && (delivery?.status === "sent" || record.status === "sent" || record.status === "published"));
  if (sent) return {state:"published",label:"Published",alert:false,public_url:delivery?.public_url || record?.public_url || null,text:record?.text || null,photo_url:record?.photo_url || null};
  if (record && delivery?.status === "error") return {state:"failed",label:"Publishing failed",alert:true,error:delivery.error || currentError || "The publisher reported an error"};
  if (record && pendingId && (!delivery || ["scheduled","sending","submitted"].includes(delivery.status))) {
    const overdue = nowEpoch > targetEpoch + 45 * 60;
    return {state:"pending",label:overdue ? "Pending longer than expected" : "Awaiting publisher confirmation",alert:overdue};
  }
  if (currentError) return {state:"failed",label:"Publishing needs attention",alert:true,error:currentError};
  if (nowEpoch > targetEpoch + 45 * 60) return {state:"missed",label:"Today’s post is not confirmed",alert:true,error:"Check the morning observation and publisher connection."};
  return {state:"scheduled",label:nowEpoch < targetEpoch ? "Scheduled for 07:30" : "Waiting for the scheduled post",alert:false};
}

async function getSocialDashboardStatus(env) {
  const day = stationDayKey(new Date()), nowEpoch = Math.floor(Date.now()/1000);
  const meta = await readMetaMap(env,[SOCIAL_FB_VERIFIED_DAY_KEY,SOCIAL_FB_PENDING_POST_KEY,SOCIAL_FB_LAST_ERROR_KEY,
    SOCIAL_X_VERIFIED_DAY_KEY,SOCIAL_X_PENDING_POST_KEY,SOCIAL_X_LAST_ERROR_KEY,
    "social_facebook_delivery_details_v1","social_x_delivery_details_v1"]);
  const configured = Boolean(await readSecret(env.BUFFER_API_KEY));
  const networks = {};
  for (const [name,verifiedKey,pendingKey,errorKey] of [
    ["facebook",SOCIAL_FB_VERIFIED_DAY_KEY,SOCIAL_FB_PENDING_POST_KEY,SOCIAL_FB_LAST_ERROR_KEY],
    ["x",SOCIAL_X_VERIFIED_DAY_KEY,SOCIAL_X_PENDING_POST_KEY,SOCIAL_X_LAST_ERROR_KEY]]) {
    let details = null;
    try { details = JSON.parse(meta[`social_${name}_delivery_details_v1`] || "null"); } catch (_) {}
    let delivery = null;
    if (configured && details?.day === day && details?.provider?.startsWith("buffer_") && details.post_id) {
      try { delivery = await getBufferPostDelivery(env,details.post_id); } catch (_) {}
    }
    const enabled = name === "x" ? configured : configured || Boolean(await readSecret(env.FACEBOOK_PAGE_ID) && await readSecret(env.FACEBOOK_PAGE_ACCESS_TOKEN));
    networks[name] = socialDashboardState({day,nowEpoch,targetEpoch:stationWallClockEpoch(day,7,30),
      verifiedDay:meta[verifiedKey],details,delivery,pendingId:meta[pendingKey],error:meta[errorKey],enabled});
    if (details?.day === day) await safelySaveSocialHistory(env,name,{...details,
      status:networks[name].state,public_url:networks[name].public_url||details.public_url||null,
      error:networks[name].error||null});
  }
  const attention = Object.entries(networks).filter(([,value])=>value.alert).map(([name])=>name === "x" ? "X" : "Facebook");
  return {day,schedule:"07:30 Europe/Dublin",checked_at:new Date().toISOString(),networks,
    notice:attention.length ? {key:`${day}:${attention.join(",")}`,message:`${attention.join(" and ")} ${attention.length === 1 ? "needs" : "need"} attention. Today’s daily post has not been confirmed.`} : null};
}

async function getPublicSocialStatus(env) {
  await ensureLegacyXVerifiedMarker(env);
  const meta = await readMetaMap(env, [
    SOCIAL_LAST_SUCCESS_KEY, SOCIAL_LAST_ERROR_KEY,
    SOCIAL_FB_VERIFIED_DAY_KEY, SOCIAL_FB_LAST_ERROR_KEY,
    SOCIAL_X_VERIFIED_DAY_KEY, SOCIAL_X_LAST_ERROR_KEY
  ]);
  return {
    status: "ok",
    schedule: "07:30 Europe/Dublin · retries/catch-up until 12:00",
    facebook_verified_day: meta[SOCIAL_FB_VERIFIED_DAY_KEY] || null,
    x_verified_day: meta[SOCIAL_X_VERIFIED_DAY_KEY] || null,
    facebook_status: meta[SOCIAL_FB_LAST_ERROR_KEY] ? "attention" : "ok",
    x_status: meta[SOCIAL_X_LAST_ERROR_KEY] ? "attention" : "ok",
    last_success: meta[SOCIAL_LAST_SUCCESS_KEY] || null,
    note: "Live channel discovery, detailed errors and manual recovery are restricted to authenticated diagnostics."
  };
}

async function claimDailySocialRun(env, localDay) {
  const key = `social_daily_mutex_v2:${localDay}`;
  const nowIso = new Date().toISOString();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO ${META_TABLE} (key, value) VALUES (?, ?)`
  ).bind(key, nowIso).run();

  if (Number(inserted?.meta?.changes || 0) > 0) {
    return { key, claimed: true, reclaimed: false };
  }

  // A previous version could leave this lock behind if post construction
  // failed before either network was called. Reclaim an old lock atomically
  // so the next five-minute cron (or dashboard recovery call) can retry.
  const existing = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
  ).bind(key).first();
  const existingValue = String(existing?.value || "");
  const existingMs = Date.parse(existingValue);
  const stale = !Number.isFinite(existingMs) || Date.now() - existingMs >= SOCIAL_LOCK_STALE_MS;

  if (stale) {
    const reclaimed = await env.DB.prepare(
      `UPDATE ${META_TABLE} SET value = ? WHERE key = ? AND value = ?`
    ).bind(nowIso, key, existingValue).run();
    if (Number(reclaimed?.meta?.changes || 0) > 0) {
      return { key, claimed: true, reclaimed: true };
    }
  }

  return { key, claimed: false, reclaimed: false };
}
async function releaseDailySocialRun(env, key) { if (key) await env.DB.prepare(`DELETE FROM ${META_TABLE} WHERE key = ?`).bind(key).run(); }

async function ensureSocialHistory(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS social_post_history_v1 (
    day TEXT NOT NULL, network TEXT NOT NULL, details_json TEXT NOT NULL,
    updated_at TEXT NOT NULL, PRIMARY KEY(day, network))`).run();
}
async function saveSocialHistory(env,name,details) {
  if (!details?.day || !["facebook","x"].includes(name)) return;
  await ensureSocialHistory(env);
  await env.DB.prepare(`INSERT INTO social_post_history_v1 (day,network,details_json,updated_at)
    VALUES (?,?,?,?) ON CONFLICT(day,network) DO UPDATE SET
    details_json=excluded.details_json,updated_at=excluded.updated_at`)
    .bind(details.day,name,JSON.stringify(details),new Date().toISOString()).run();
}
async function safelySaveSocialHistory(env,name,details) {
  try { await saveSocialHistory(env,name,details); }
  catch (error) { console.warn("Social history save failed",error?.message); }
}
async function getSocialHistory(env) {
  await ensureSocialHistory(env);
  // Seed only saved originals; never fabricate historic wording.
  const meta=await readMetaMap(env,["social_facebook_delivery_details_v1","social_x_delivery_details_v1"]);
  for (const name of ["facebook","x"]) {
    try {
      const details=JSON.parse(meta[`social_${name}_delivery_details_v1`]||"null");
      if(details?.day) await env.DB.prepare(`INSERT OR IGNORE INTO social_post_history_v1
        (day,network,details_json,updated_at) VALUES (?,?,?,?)`)
        .bind(details.day,name,JSON.stringify(details),new Date().toISOString()).run();
    } catch (_) {}
  }
  const rows=await env.DB.prepare(`SELECT day,network,details_json,updated_at FROM
    social_post_history_v1 ORDER BY day DESC,network LIMIT 120`).all();
  return {items:(rows.results||[]).flatMap(row=>{
    try{return [{...JSON.parse(row.details_json),network:row.network,updated_at:row.updated_at}];}catch(_){return [];}
  }),note:"History starts when recording is enabled. Older unsaved post wording is unavailable."};
}

async function recordSocialDelivery(env, name, day, result, text, photo) {
  const key = `social_${name}_delivery_details_v1`;
  const meta = await readMetaMap(env,[key]);
  let previous = null;
  try { previous = JSON.parse(meta[key] || "null"); } catch (_) {}
  const same = previous?.post_id && previous.post_id === result.post_id;
  const details = {day,...(same ? previous : {text,photo_url:photo?.url || null,photo_id:result.photo_url===null?null:photo?.uploaded_at||null}),...result,
    submitted_at:same ? previous.submitted_at : new Date().toISOString()};
  await writeMeta(env,{[key]:JSON.stringify(details)});
  await safelySaveSocialHistory(env,name,details);
}

async function runDailySocialPost(env, { forceDay = null, test = false, force = false, recovery = false } = {}) {
  const now = new Date(), localDay = stationDayKey(now), observationDay = forceDay || localDay;
  if (!force && !recovery && !inDailySocialWindow(now)) {
    return { skipped: true, reason: "outside_0730_recovery_window", local_day: localDay };
  }

  const xEnabled = await socialXEnabled(env);
  await ensureLegacyXVerifiedMarker(env);
  const meta = await readMetaMap(env, [SOCIAL_FB_VERIFIED_DAY_KEY, SOCIAL_X_VERIFIED_DAY_KEY]);
  const facebookNeeded = force || meta[SOCIAL_FB_VERIFIED_DAY_KEY] !== observationDay;
  const xNeeded = xEnabled && (force || meta[SOCIAL_X_VERIFIED_DAY_KEY] !== observationDay);
  if (!facebookNeeded && !xNeeded) {
    return { skipped: true, reason: "already_posted", observation_day: observationDay };
  }

  let lock = null;
  if (!force) {
    lock = await claimDailySocialRun(env, localDay);
    if (!lock.claimed) {
      return { skipped: true, reason: "run_already_claimed", local_day: localDay };
    }
  }

  try {
    let built;
    try {
      built = await buildDailySocialPost(env, observationDay, { test });
    } catch (error) {
      const message = error?.message || String(error);
      await writeMeta(env, { [SOCIAL_LAST_ERROR_KEY]: `${new Date().toISOString()} · ${message}` });
      throw error;
    }

    const results = {}, errors = {};

    if (facebookNeeded) {
      try {
        results.facebook = await publishFacebookPost(env, built.facebookText, built.photo);
        await recordSocialDelivery(env,"facebook",observationDay,results.facebook,built.facebookText,built.photo);
        const facebookVerified = results.facebook?.provider !== "buffer_facebook" || results.facebook?.verified === true || results.facebook?.status === "sent";
        if (facebookVerified) {
          await writeMeta(env, {
            [SOCIAL_FB_LAST_DAY_KEY]: observationDay,
            [SOCIAL_FB_VERIFIED_DAY_KEY]: observationDay,
            [SOCIAL_FB_LAST_ERROR_KEY]: ""
          });
        } else {
          await writeMeta(env, {
            [SOCIAL_FB_LAST_ERROR_KEY]: `${new Date().toISOString()} · Facebook accepted by Buffer; awaiting confirmed delivery`
          });
        }
      } catch (error) {
        errors.facebook = error?.message || String(error);
        await safelySaveSocialHistory(env,"facebook",{day:observationDay,text:built.facebookText,photo_url:built.photo?.url||null,status:"failed",error:errors.facebook});
        await writeMeta(env, {
          [SOCIAL_FB_LAST_ERROR_KEY]: `${new Date().toISOString()} · ${errors.facebook}`
        });
      }
    }

    if (xNeeded) {
      try {
        results.x = await publishViaBufferX(env, built.xText, built.photo);
        await recordSocialDelivery(env,"x",observationDay,results.x,built.xText,built.photo);
        const xVerified = results.x?.verified === true || results.x?.status === "sent";
        if (xVerified) {
          await writeMeta(env, {
            [SOCIAL_X_LAST_DAY_KEY]: observationDay,
            [SOCIAL_X_VERIFIED_DAY_KEY]: observationDay,
            [SOCIAL_X_LAST_ERROR_KEY]: ""
          });
        } else {
          await writeMeta(env, {
            [SOCIAL_X_LAST_ERROR_KEY]: `${new Date().toISOString()} · X accepted by Buffer; awaiting confirmed delivery`
          });
        }
      } catch (error) {
        errors.x = error?.message || String(error);
        await safelySaveSocialHistory(env,"x",{day:observationDay,text:built.xText,photo_url:built.photo?.url||null,status:"failed",error:errors.x});
        await writeMeta(env, {
          [SOCIAL_X_LAST_ERROR_KEY]: `${new Date().toISOString()} · ${errors.x}`
        });
      }
    }

    const nowIso = new Date().toISOString();
    if (results.facebook || results.x) {
      const providers = [results.facebook?.provider, results.x?.provider].filter(Boolean).join("+");
      const postIds = [results.facebook?.post_id, results.x?.post_id].filter(Boolean).join(",");
      const facebookVerifiedForDay = Boolean(results.facebook) &&
        (results.facebook.provider !== "buffer_facebook" || results.facebook.verified === true || results.facebook.status === "sent");
      const xVerifiedForDay = Boolean(results.x) &&
        (results.x.verified === true || results.x.status === "sent");
      const anyVerified = facebookVerifiedForDay || xVerifiedForDay;
      const anyPending = Boolean(results.facebook?.pending || results.x?.pending);

      const entries = {
        [SOCIAL_LAST_ERROR_KEY]: Object.values(errors).join(" | "),
        [SOCIAL_LAST_PROVIDER_KEY]: providers,
        [SOCIAL_LAST_POST_ID_KEY]: postIds
      };
      if (anyVerified) entries[SOCIAL_LAST_SUCCESS_KEY] = nowIso;
      if (facebookVerifiedForDay && !test) entries[SOCIAL_LAST_DAY_KEY] = observationDay;
      if (test && anyVerified) entries[SOCIAL_TEST_LAST_SUCCESS_KEY] = nowIso;
      await writeMeta(env, entries);

      return {
        status: Object.keys(errors).length ? "partial" : anyPending ? "pending" : "ok",
        observation_day: observationDay,
        results,
        errors,
        facebook_text: built.facebookText,
        x_text: built.xText
      };
    }

    const failure = Object.values(errors).join(" | ") || "Social publishing failed";
    await writeMeta(env, { [SOCIAL_LAST_ERROR_KEY]: `${nowIso} · ${failure}` });
    throw new Error(failure);
  } finally {
    // The lock is a short-lived concurrency mutex only. Per-network day
    // markers are the durable idempotency protection. Always release the
    // mutex, even after a fully successful run or an unexpected exception.
    if (!force && lock?.key) {
      try {
        await releaseDailySocialRun(env, lock.key);
      } catch (error) {
        console.warn("Social mutex release failed:", error);
      }
    }
  }
}

async function recoverTodaySocialPost(env) {
  const today = stationDayKey(new Date());
  await ensureLegacyXVerifiedMarker(env);
  const meta = await readMetaMap(env, [SOCIAL_FB_VERIFIED_DAY_KEY, SOCIAL_X_VERIFIED_DAY_KEY]);
  const xEnabled = await socialXEnabled(env);
  const facebookDone = meta[SOCIAL_FB_VERIFIED_DAY_KEY] === today;
  const xDone = !xEnabled || meta[SOCIAL_X_VERIFIED_DAY_KEY] === today;
  if (facebookDone && xDone) {
    return {
      status: "already_complete",
      observation_day: today,
      facebook_done: facebookDone,
      x_done: xDone
    };
  }

  // Current-day recovery bypasses only the clock window. It still honours
  // per-network success markers, so an already-successful platform is never
  // posted twice. The v2 mutex avoids stale locks left by older Worker builds.
  let result = await runDailySocialPost(env, { forceDay: today, recovery: true });
  if (result?.skipped && result?.reason === "run_already_claimed") {
    // A scheduled/background run may genuinely be in flight. Give it a short
    // chance to finish and release the mutex, then retry once.
    await new Promise(resolve => setTimeout(resolve, 3000));
    result = await runDailySocialPost(env, { forceDay: today, recovery: true });
  }
  return result;
}

async function adminDiagnosticAuthorized(request, env) {
  const expected = await readSecret(env.ADMIN_KEY) || await readSecret(env.SOCIAL_ADMIN_KEY);
  if (!expected) return false;
  const bearer = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const header = String(request.headers.get("X-Parknacross-Admin-Key") || "");
  return bearer === expected || header === expected;
}

async function manualSocialPublishAuthorized(request, env) {
  const expected = await readSecret(env.SOCIAL_ADMIN_KEY);
  if (!expected) return false;
  const header = request.headers.get("X-Parknacross-Admin-Key") || "";
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return header === expected || bearer === expected;
}

function skyPhotoExtension(contentType) {
  const type = String(contentType || "").toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function skyPhotoArchiveKey(uploadedAt, contentType) {
  const date = new Date(uploadedAt);
  const stationDay = stationDayKey(date) || String(uploadedAt || "").slice(0, 10) || "unknown-date";
  const [year = "unknown", month = "00", day = "00"] = stationDay.split("-");
  const stamp = Number.isNaN(date.getTime())
    ? String(uploadedAt || Date.now()).replace(/[^0-9A-Za-z_-]/g, "-")
    : date.toISOString().replace(/[-:.]/g, "");
  return `archive/${year}/${month}/${day}/${stamp}.${skyPhotoExtension(contentType)}`;
}

function skyPhotoHistoricalImportKey(capturedAt, contentType, photoId) {
  const date = new Date(capturedAt);
  const stationDay = stationDayKey(date) || String(capturedAt || "").slice(0, 10) || "unknown-date";
  const [year = "unknown", month = "00", day = "00"] = stationDay.split("-");
  const stamp = Number.isNaN(date.getTime())
    ? String(capturedAt || Date.now()).replace(/[^0-9A-Za-z_-]/g, "-")
    : date.toISOString().replace(/[-:.]/g, "");
  const suffix = String(photoId || "import").replace(/[^0-9A-Za-z_-]/g, "").slice(-12) || "import";
  return `archive/${year}/${month}/${day}/${stamp}-import-${suffix}.${skyPhotoExtension(contentType)}`;
}

async function insertSkyPhotoArchiveRow(env, record) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO ${SKY_PHOTO_ARCHIVE_TABLE}
      (photo_id, uploaded_at, station_day, r2_key, caption, content_type, size_bytes, archived_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    record.photo_id,
    record.uploaded_at,
    record.station_day,
    record.r2_key,
    record.caption || "",
    record.content_type || "image/jpeg",
    Math.max(0, Number(record.size_bytes || 0)),
    record.archived_at || new Date().toISOString(),
    record.source || "upload"
  ).run();
}

/*
 * Preserve the photo that was current before archival support was deployed.
 * This is also called before every replacement, so the current image can never
 * be overwritten without first having an archive copy and D1 catalogue row.
 */
async function archiveCurrentSkyPhotoIfNeeded(env) {
  if (!env.SKY_PHOTOS || typeof env.SKY_PHOTOS.head !== "function" || typeof env.SKY_PHOTOS.get !== "function" || typeof env.SKY_PHOTOS.put !== "function") {
    return null;
  }

  const head = await env.SKY_PHOTOS.head(SKY_PHOTO_KEY);
  if (!head) return null;

  const rawUploaded = head.customMetadata?.uploadedAt || (head.uploaded instanceof Date ? head.uploaded.toISOString() : head.uploaded);
  const uploadedAt = String(rawUploaded || "").trim();
  if (!uploadedAt) return null;

  const existing = await env.DB.prepare(
    `SELECT photo_id, r2_key FROM ${SKY_PHOTO_ARCHIVE_TABLE} WHERE photo_id = ? LIMIT 1`
  ).bind(uploadedAt).first();
  if (existing) return { photo_id: uploadedAt, r2_key: existing.r2_key, already_archived: true };

  const object = await env.SKY_PHOTOS.get(SKY_PHOTO_KEY);
  if (!object) return null;

  const contentType = String(object.httpMetadata?.contentType || head.httpMetadata?.contentType || "image/jpeg").toLowerCase();
  const caption = String(object.customMetadata?.caption || head.customMetadata?.caption || "").trim().slice(0, 140);
  const stationDay = stationDayKey(new Date(uploadedAt)) || uploadedAt.slice(0, 10);
  const r2Key = skyPhotoArchiveKey(uploadedAt, contentType);
  const archivedAt = new Date().toISOString();

  await env.SKY_PHOTOS.put(r2Key, object.body, {
    httpMetadata: { contentType },
    customMetadata: { uploadedAt, caption, photoId: uploadedAt }
  });
  await insertSkyPhotoArchiveRow(env, {
    photo_id: uploadedAt, uploaded_at: uploadedAt, station_day: stationDay, r2_key: r2Key,
    caption, content_type: contentType, size_bytes: Number(object.size || head.size || 0),
    archived_at: archivedAt, source: "pre_archive_current"
  });

  return { photo_id: uploadedAt, r2_key: r2Key, already_archived: false };
}


// Conservative per-instance throttles complement account-level edge controls.
// Successful admin authentication is never counted or locked out.
const SECURITY_WINDOWS = new Map();
function requestRateLimited(request, bucket, limit, now=Date.now()) {
  const ip=request.headers.get("CF-Connecting-IP");
  if(!ip)return false; // Local fixtures and non-Cloudflare transports have no trusted client address.
  if(SECURITY_WINDOWS.size>=2048){for(const [key,value] of SECURITY_WINDOWS){if(value.until<=now)SECURITY_WINDOWS.delete(key);}if(SECURITY_WINDOWS.size>=2048)SECURITY_WINDOWS.delete(SECURITY_WINDOWS.keys().next().value);}
  const key=bucket+":"+ip;let window=SECURITY_WINDOWS.get(key);
  if(!window||window.until<=now){window={count:0,until:now+60000};SECURITY_WINDOWS.set(key,window);}
  return ++window.count>limit;
}
function rateLimitedResponse(){return json({error:"Too many requests. Please wait a minute and try again."},429,{"Cache-Control":"no-store","Retry-After":"60"});}
function unauthorizedResponse(request){return requestRateLimited(request,"failed-admin",30)?rateLimitedResponse():json({error:"Unauthorized"},401,{"Cache-Control":"no-store"});}

// Web Push uses separate ephemeral encryption keys and a persistent VAPID signing key.
const PUSH_TABLE='weather_push_subscriptions_v1';
const PUSH_VAPID_KEY='weather_push_vapid_v1';
const pushBytes=s=>Uint8Array.from(atob(String(s).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const pushBase64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const pushConcat=(...items)=>{const out=new Uint8Array(items.reduce((n,x)=>n+x.length,0));let p=0;for(const x of items){out.set(x,p);p+=x.length;}return out;};
const pushText=s=>new TextEncoder().encode(s);
async function pushHash(value){return pushBase64(await crypto.subtle.digest('SHA-256',pushText(value)));}
function pushEndpointAllowed(endpoint){try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.href.length<=2048&&u.pathname.length>1&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
function pushPreferences(value={}){const bounded=(v,lo,hi,fallback)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Number(v))):fallback;return {rainStart:value.rainStart===true,gust:value.gust===true,frost:value.frost===true,heavyRain:value.heavyRain===true,lightningKm:[0,10,15,25,40].includes(Number(value.lightningKm))?Number(value.lightningKm):0,gustKmh:bounded(value.gustKmh,20,100,50),heavyRainRate:bounded(value.heavyRainRate,2,50,10),freezingC:bounded(value.freezingC,-5,5,0),quietEnabled:value.quietEnabled===true,quietStart:bounded(value.quietStart,0,23,22),quietEnd:bounded(value.quietEnd,0,23,7)};}
let pushSchemaDb=null;
async function ensurePushSchema(env){if(pushSchemaDb===env.DB)return;await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${PUSH_TABLE} (id TEXT PRIMARY KEY,endpoint TEXT NOT NULL,p256dh TEXT NOT NULL,auth TEXT NOT NULL,token_hash TEXT NOT NULL,preferences TEXT NOT NULL,state TEXT NOT NULL DEFAULT '{}',updated_epoch INTEGER NOT NULL)`).run();pushSchemaDb=env.DB;}
async function pushVapid(env){let row=await env.DB.prepare(`SELECT value FROM ${META_TABLE} WHERE key=?`).bind(PUSH_VAPID_KEY).first();if(!row?.value){const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),privateJwk=await crypto.subtle.exportKey('jwk',keys.privateKey),publicKey=pushBase64(await crypto.subtle.exportKey('raw',keys.publicKey));await env.DB.prepare(`INSERT OR IGNORE INTO ${META_TABLE}(key,value) VALUES (?,?)`).bind(PUSH_VAPID_KEY,JSON.stringify({privateJwk,publicKey})).run();row=await env.DB.prepare(`SELECT value FROM ${META_TABLE} WHERE key=?`).bind(PUSH_VAPID_KEY).first();}if(!row?.value)throw Error('Background signing key unavailable');return JSON.parse(row.value);}
async function pushHmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data));}
async function pushEncrypt(subscription,payload){
 const ua=pushBytes(subscription.p256dh),auth=pushBytes(subscription.auth),ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),publicKey=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey)),userKey=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]),shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:userKey},ephemeral.privateKey,256)),salt=crypto.getRandomValues(new Uint8Array(16));
 const prkKey=await pushHmac(auth,shared),ikm=await pushHmac(prkKey,pushConcat(pushText('WebPush: info\0'),ua,publicKey,new Uint8Array([1]))),prk=await pushHmac(salt,ikm),cek=(await pushHmac(prk,pushConcat(pushText('Content-Encoding: aes128gcm\0'),new Uint8Array([1])))).slice(0,16),nonce=(await pushHmac(prk,pushConcat(pushText('Content-Encoding: nonce\0'),new Uint8Array([1])))).slice(0,12),key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const plain=pushText(JSON.stringify(payload));if(plain.length>3000)throw Error('Push message too large');const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,pushConcat(plain,new Uint8Array([2]))));const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096);header[20]=publicKey.length;return pushConcat(header,publicKey,cipher);
}
async function sendWeatherPush(subscription,message,vapid){const endpoint=new URL(subscription.endpoint),header=pushBase64(pushText(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=pushBase64(pushText(JSON.stringify({aud:endpoint.origin,exp:Math.floor(Date.now()/1000)+3600,sub:'mailto:info@parknacrossweather.ie'}))),input=header+'.'+claims,key=await crypto.subtle.importKey('jwk',vapid.privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']),signature=pushBase64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,pushText(input)));return fetch(endpoint.href,{method:'POST',headers:{Authorization:`vapid t=${input}.${signature}, k=${vapid.publicKey}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'300',Urgency:'normal'},body:await pushEncrypt(subscription,message),redirect:'error',signal:AbortSignal.timeout(10000)});}
async function handlePushRequest(request,env,url){
 const noStore={'Cache-Control':'no-store'};
 if(url.pathname==='/push/public-key'){if(request.method!=='GET')return json({error:'Method not allowed'},405,noStore);const v=await pushVapid(env);return json({available:true,public_key:v.publicKey,worker_version:'38.4.95'},200,noStore);}
 if(request.method!=='POST')return json({error:'Method not allowed'},405,noStore);
 if(request.headers.get('Origin')!=='https://parknacrossweather.ie'&&request.headers.get('Origin')!=='https://www.parknacrossweather.ie')return json({error:'Origin not allowed'},403,noStore);
 if(requestRateLimited(request,'push-settings',10))return rateLimitedResponse();
 if(Number(request.headers.get('Content-Length')||0)>8192)return json({error:'Request too large'},413,noStore);const text=await request.text();if(text.length>8192)return json({error:'Request too large'},413,noStore);let body;try{body=JSON.parse(text);}catch{return json({error:'Invalid request'},400,noStore);}
 const sub=body.subscription||{},endpoint=String(sub.endpoint||'');if(!pushEndpointAllowed(endpoint))return json({error:'Unsupported push service'},400,noStore);const id=await pushHash(endpoint);await ensurePushSchema(env);
 const existing=await env.DB.prepare(`SELECT * FROM ${PUSH_TABLE} WHERE id=?`).bind(id).first(),token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'',authorised=existing&&token&&await pushHash(token)===existing.token_hash;
 if(existing&&!authorised)return json({error:'Subscription ownership could not be verified'},401,noStore);
 if(body.action==='status'){if(!authorised)return json({error:'Subscription not found'},404,noStore);let state={};try{state=JSON.parse(existing.state);}catch{}return json({active:true,preferences:JSON.parse(existing.preferences),history:(state.history||[]).slice(-20)},200,noStore);}
 if(body.action==='remove'){if(authorised)await env.DB.prepare(`DELETE FROM ${PUSH_TABLE} WHERE id=?`).bind(id).run();return json({active:false},200,noStore);}
 if(body.action!=='save')return json({error:'Unknown action'},400,noStore);
 try{if(pushBytes(sub.keys?.p256dh).length!==65||pushBytes(sub.keys?.auth).length!==16)throw Error('keys');await crypto.subtle.importKey('raw',pushBytes(sub.keys.p256dh),{name:'ECDH',namedCurve:'P-256'},false,[]);}catch{return json({error:'Invalid subscription keys'},400,noStore);}
 if(!existing){const count=await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${PUSH_TABLE}`).first();if(Number(count?.n)>=200)return json({error:'Background alert capacity reached'},503,noStore);}
 const managementToken=existing?token:pushBase64(crypto.getRandomValues(new Uint8Array(32))),prefs=pushPreferences(body.preferences);
 await env.DB.prepare(`INSERT INTO ${PUSH_TABLE}(id,endpoint,p256dh,auth,token_hash,preferences,state,updated_epoch) VALUES (?,?,?,?,?,?,'{}',?) ON CONFLICT(id) DO UPDATE SET preferences=excluded.preferences,updated_epoch=excluded.updated_epoch`).bind(id,endpoint,sub.keys.p256dh,sub.keys.auth,await pushHash(managementToken),JSON.stringify(prefs),Math.floor(Date.now()/1000)).run();return json({active:true,management_token:managementToken},200,noStore);
}
function backgroundWeatherEvents(current,previous,prefs,now=Math.floor(Date.now()/1000)){
 const value=(row,k)=>usableNumber(row?.[k])?Number(row[k]):null,at=value(current,'epoch');if(at===null||now-at>600||at-now>90||at<=Number(previous.epoch||0))return {events:[],state:previous};
 const day=stationDayKey(new Date(at*1000)),total=value(current,'rain_daily_mm'),rate=value(current,'rain_rate_mm_h'),gust=value(current,'wind_gust_kmh'),temp=value(current,'temperature_c'),samples=(previous.samples||[]).filter(s=>s.day===day&&at-s.epoch<=1200&&s.epoch<at);samples.push({epoch:at,day,total});
 const baseline=samples.find(s=>s.total!==null),increment=baseline&&total!==null?Math.max(0,total-baseline.total):0,oldTotal=value(previous,'rain_daily_mm'),activeIncrease=previous.day===day&&at-Number(previous.epoch)<=300&&total!==null&&oldTotal!==null?Math.max(0,total-oldTotal):0,confirmed=(rate>0||activeIncrease>=.05)&&(rate>=2.5||increment>=.2-1e-6);
 const events=[];if(previous.epoch){if(prefs.rainStart&&confirmed&&!previous.confirmed)events.push({kind:'rain-start',title:'Rain starting at Parknacross',body:`Confirmed rainfall · ${rate===null?'rate unavailable':rate.toFixed(1)+' mm/h'}.`,cooldown:10800});if(prefs.gust&&gust!==null&&gust>=prefs.gustKmh&&(value(previous,'wind_gust_kmh')===null||value(previous,'wind_gust_kmh')<prefs.gustKmh))events.push({kind:'gust',title:'Strong gust at Parknacross',body:`A ${gust.toFixed(1)} km/h gust was recorded.`,cooldown:7200});if(prefs.frost&&temp!==null&&temp<=prefs.freezingC&&(value(previous,'temperature_c')===null||value(previous,'temperature_c')>prefs.freezingC))events.push({kind:'temperature',title:'Low temperature at Parknacross',body:`Temperature reached ${temp.toFixed(1)}°C.`,cooldown:21600});if(prefs.heavyRain&&rate!==null&&rate>=prefs.heavyRainRate&&(value(previous,'rain_rate_mm_h')===null||value(previous,'rain_rate_mm_h')<prefs.heavyRainRate))events.push({kind:'heavy-rain',title:'Heavy rain at Parknacross',body:`Rain rate reached ${rate.toFixed(1)} mm/h.`,cooldown:3600});const strike=value(current,'lightning_time_epoch'),distance=value(current,'lightning_distance_km');if(prefs.lightningKm>0&&value(current,'lightning_strikes')>0&&strike!==null&&now-strike>=-90&&now-strike<=600&&strike>Number(previous.lightning_time_epoch||0)&&distance!==null&&distance>=0&&distance<=prefs.lightningKm)events.push({kind:'lightning',title:'Lightning near Parknacross',body:`A detection was reported approximately ${Math.round(distance)} km away.`,cooldown:900});}
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:STATION_TIME_ZONE,hour:'numeric',hourCycle:'h23'}).format(new Date(now*1000))),quiet=prefs.quietEnabled&&(prefs.quietStart===prefs.quietEnd||(prefs.quietStart<prefs.quietEnd?(hour>=prefs.quietStart&&hour<prefs.quietEnd):hour>=prefs.quietStart||hour<prefs.quietEnd));
 return {events:quiet?[]:events.filter(e=>now-Number(previous.cooldowns?.[e.kind]||0)>=e.cooldown),state:{...previous,epoch:at,day,samples,confirmed,rain_daily_mm:total,rain_rate_mm_h:rate,wind_gust_kmh:gust,temperature_c:temp,lightning_time_epoch:value(current,'lightning_time_epoch')}};
}
async function runBackgroundAlerts(env,current=null){
 // A schema absent on older installations means nobody has subscribed yet.
 let result;try{result=await env.DB.prepare(`SELECT * FROM ${PUSH_TABLE} ORDER BY updated_epoch ASC LIMIT 200`).all();}catch{return;}if(!result.results?.length)return;
 const now=Math.floor(Date.now()/1000),lease=await env.DB.prepare(`INSERT INTO ${META_TABLE}(key,value) VALUES ('weather_push_run_lock_v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(value AS INTEGER) < ?`).bind(String(now+55),now).run();if(Number(lease.meta?.changes)===0)return;
 current=current||await readGatewayLiveReading(env,now)||await getLatest(env);if(!current)return;const vapid=await pushVapid(env);
 // Work in bounded batches. Rotate attempted subscriptions to avoid starvation.
 for(const sub of result.results.slice(0,30)){let previous={};try{previous=JSON.parse(sub.state);}catch{}const prefs=pushPreferences(JSON.parse(sub.preferences)),review=backgroundWeatherEvents(current,previous,prefs,now);let failed=false;for(const event of review.events){try{const sent=await sendWeatherPush(sub,{title:event.title,body:event.body,tag:'parknacross-'+event.kind,url:'https://parknacrossweather.ie/index.html',sent_at:new Date(now*1000).toISOString()},vapid);if(sent.status===404||sent.status===410){await env.DB.prepare(`DELETE FROM ${PUSH_TABLE} WHERE id=?`).bind(sub.id).run();failed=true;break;}if(!sent.ok){failed=true;break;}review.state.cooldowns={...review.state.cooldowns,[event.kind]:now};review.state.history=[...(review.state.history||[]),{at:new Date(now*1000).toISOString(),title:event.title,body:event.body,status:'Accepted by push service'}].slice(-20);}catch{failed=true;break;}}
 if(!failed)await env.DB.prepare(`UPDATE ${PUSH_TABLE} SET state=?,updated_epoch=? WHERE id=?`).bind(JSON.stringify(review.state),now,sub.id).run();else await env.DB.prepare(`UPDATE ${PUSH_TABLE} SET updated_epoch=? WHERE id=?`).bind(now,sub.id).run();
 }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    if(request.method==="POST"&&["/sky-photo/likes","/sky-photo/likes/name"].includes(url.pathname)&&requestRateLimited(request,"photo-writes",30))return rateLimitedResponse();

    if(url.pathname.startsWith("/push/")){try{return await handlePushRequest(request,env,url);}catch(error){console.warn("Background alert settings unavailable");return json({error:"Background alert service temporarily unavailable"},503,{"Cache-Control":"no-store"});}}

    // Admin sign-in is a secret check, not an archive query. Never wait for
    // D1 migrations before accepting or rejecting the key.
    if (url.pathname === "/admin/capabilities") {
      try {
        if (request.method !== "GET") return json({error:"Method not allowed"},405,{"Cache-Control":"no-store"});
        if (!(await adminDiagnosticAuthorized(request, env))) return unauthorizedResponse(request);
        return json({worker_version:"38.4.95",features:{rain_override:true,sky_override:true,photo_calendar:true,social_history:true,archive_coverage:true,history_photos:true,export_preview:true,history_range:true,public_photo_calendar:true}},200,{"Cache-Control":"no-store"});
      } catch (_) {
        return json({error:"Admin authentication is temporarily unavailable. Please retry."},503,{"Cache-Control":"no-store"});
      }
    }


    // Reading the established archive does not require running migrations.
    if (url.pathname === "/current") {
      if (request.method !== "GET") return json({error:"Method not allowed"},405,{"Cache-Control":"no-store"});
      try {
        const nowEpoch = Math.floor(Date.now() / 1000);
        let latest = null;

        /* Prefer the authenticated GW3001 packet received roughly once per
         * minute. The archive deliberately retains one row per five-minute
         * slot, but headline conditions should not be held back by that
         * storage interval. If the live metadata is unavailable, fall back to
         * the durable archive without making the endpoint fail needlessly. */
        try {
          latest = await readGatewayLiveReading(env, nowEpoch);
        } catch (error) {
          console.warn("Live gateway reading unavailable:", error);
        }
        if (!latest) latest = await getLatest(env);

        if (!latest || nowEpoch - Number(latest.epoch || 0) > 120) {
          // Keep an upstream outage out of the live-response path. The next
          // refresh can use the recovered reading; the current timestamp is
          // never rewritten to make an older observation appear fresh.
          if (ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(syncEcowitt(env).catch(error => console.warn("Background auto-sync failed:", error)));
          }
        }

        if (!latest) return json({ error: "No weather readings available" }, 503, {"Cache-Control":"no-store"});

        const formatted = formatRow(latest);

        // Optional battery cloud recovery must never delay live weather.
        try {
          const batteryRecord = await readWs90BatteryRecord(env);
          formatted.battery_v = batteryRecord?.value ?? (batteryRecord ? null : batteryVoltageFromRow(latest));
          const checkDue = !batteryRecord || !Number.isFinite(batteryRecord.last_checked_epoch) ||
            nowEpoch - batteryRecord.last_checked_epoch >= WS90_BATTERY_CHECK_INTERVAL_SECONDS;
          if (checkDue && ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil((async () => {
              const applicationKey = await readSecret(env.ECOWITT_APPLICATION_KEY);
              const apiKey = await readSecret(env.ECOWITT_API_KEY);
              const mac = await readSecret(env.ECOWITT_MAC);
              if (applicationKey && apiKey && mac) await getWs90BatteryVoltage(env, applicationKey, apiKey, mac, {directVoltage:formatted.battery_v});
            })().catch(error => console.warn("Background WS90 battery recovery failed:",error)));
          }
        } catch (error) {
          console.warn("Stored battery provenance unavailable:",error);
          formatted.battery_v = null;
        }

        // Morning resilience: the normal 5-minute cron remains the primary
        // publisher. While the 07:30 recovery window is open, a dashboard
        // /current request may also trigger the same lock-protected job in
        // the background. This repairs a missed cron/upstream failure without
        // ever duplicating a platform that already succeeded.
        if (inDailySocialWindow(new Date()) && ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(
            runDailySocialPost(env).catch(error =>
              console.warn("Dashboard social catch-up failed:", error)
            )
          );
        }

        return json(formatted, 200, {"Cache-Control":"no-store"});
      } catch (error) {
        console.error("Live weather unavailable:", error);
        return json({error:"Weather readings are temporarily unavailable. Please retry."},503,{"Cache-Control":"no-store"});
      }
    }


    /*
     * Keep health independent of schema migrations. Even if a future migration
     * fails, the monitor still receives a JSON response showing D1 state.
     */
    if (url.pathname === "/health") {
      try {
        const probe = await env.DB.prepare(`SELECT 1 AS ok`).first();
        const connected = Number(probe?.ok) === 1;
        const ingest = connected ? await archiveIngestStatus(env) : null;
        const healthyArchive = ingest?.archive_status === "current";

        return json({
          status: connected ? (healthyArchive ? "ok" : "warning") : "error",
          database: connected ? "connected" : "error",
          service: "Parknacross Weather",
          release: "v38.4.94-WHOLE-SITE-RELIABILITY",
          station_time_zone: STATION_TIME_ZONE,
          station_local_day: stationDayKey(new Date()),
          archive_ingest: ingest
        }, connected ? 200 : 503, {
          "Cache-Control": "no-store"
        });
      } catch (error) {
        return json({
          status: "error",
          database: "error",
          service: "Parknacross Weather",
          release: "v38.4.94-WHOLE-SITE-RELIABILITY",
          error: error?.message || "D1 health check failed"
        }, 503, {
          "Cache-Control": "no-store"
        });
      }
    }

    /*
     * Today's sky photo is intentionally independent of D1. The image is kept
     * in an R2 bucket bound as SKY_PHOTOS, while the existing ADMIN_KEY protects
     * uploads. Public visitors can only read the current photo and metadata.
     */
    if (url.pathname === "/sky-photo/meta" && request.method === "GET") {
      if (!env.SKY_PHOTOS || typeof env.SKY_PHOTOS.head !== "function") {
        return json({ available: false, configured: false }, 200, { "Cache-Control": "no-store" });
      }
      try {
        const object = await env.SKY_PHOTOS.head(SKY_PHOTO_KEY);
        if (!object) return json({ available: false, configured: true }, 200, { "Cache-Control": "no-store" });
        return json({
          available: true,
          configured: true,
          uploaded_at: object.customMetadata?.uploadedAt || null,
          caption: object.customMetadata?.caption || "",
          content_type: object.httpMetadata?.contentType || "application/octet-stream",
          size_bytes: Number(object.size || 0),
          etag: object.httpEtag || object.etag || null
        }, 200, { "Cache-Control": "no-store" });
      } catch (error) {
        return json({ available: false, configured: true, error: error?.message || "Sky photo metadata unavailable" }, 503, { "Cache-Control": "no-store" });
      }
    }

    if (url.pathname === "/social-sky-photo" && request.method === "GET") {
      const id = String(url.searchParams.get("id") || "");
      if (!/^\d{8}T\d{9}Z\.(jpg|png|webp)$/.test(id)) return json({ error: "Invalid social photo ID" }, 400);
      if (!env.SKY_PHOTOS?.get) return json({ error: "Photo unavailable" }, 404);
      const object = await env.SKY_PHOTOS.get(`social/${id}`);
      if (!object) return json({ error: "Photo unavailable" }, 404);
      return new Response(object.body, { headers: {
        "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff"
      } });
    }

    if (url.pathname === "/sky-photo" && request.method === "GET") {
      if (!env.SKY_PHOTOS || typeof env.SKY_PHOTOS.get !== "function") {
        return json({ error: "Sky photo storage is not configured" }, 503, { "Cache-Control": "no-store" });
      }
      try {
        const object = await env.SKY_PHOTOS.get(SKY_PHOTO_KEY);
        if (!object) return json({ error: "No sky photo is available" }, 404, { "Cache-Control": "no-store" });
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Content-Type", object.httpMetadata?.contentType || "image/jpeg");
        headers.set("Cache-Control", "public, max-age=60, must-revalidate");
        const etag = object.httpEtag || object.etag;
        if (etag) headers.set("ETag", etag);
        return new Response(object.body, { status: 200, headers });
      } catch (error) {
        return json({ error: error?.message || "Sky photo unavailable" }, 503, { "Cache-Control": "no-store" });
      }
    }

    if (url.pathname === "/sky-photo" && request.method === "POST") {
      if (!(await adminDiagnosticAuthorized(request, env))) {
        return unauthorizedResponse(request);
      }
      if (!env.SKY_PHOTOS || typeof env.SKY_PHOTOS.put !== "function") {
        return json({
          error: "Sky photo storage is not configured",
          setup_required: "Bind an R2 bucket to this Worker using the variable name SKY_PHOTOS."
        }, 503, { "Cache-Control": "no-store" });
      }

      try {
        const contentType = String(request.headers.get("Content-Type") || "");
        if (!contentType.toLowerCase().includes("multipart/form-data")) {
          return json({ error: "Upload must use multipart/form-data" }, 415, { "Cache-Control": "no-store" });
        }
        const form = await request.formData();
        const photo = form.get("photo");
        const caption = String(form.get("caption") || "").trim().slice(0, 140);
        if (!photo || typeof photo.arrayBuffer !== "function") {
          return json({ error: "No photo was supplied" }, 400, { "Cache-Control": "no-store" });
        }
        const photoType = String(photo.type || "").toLowerCase();
        if (!SKY_PHOTO_ALLOWED_TYPES.has(photoType)) {
          return json({ error: "Use a JPEG, PNG or WebP image" }, 415, { "Cache-Control": "no-store" });
        }
        const size = Number(photo.size || 0);
        if (!size || size > SKY_PHOTO_MAX_BYTES) {
          return json({ error: "Photo must be between 1 byte and 10 MB" }, 413, { "Cache-Control": "no-store" });
        }

        // Read the upload once so the exact same bytes can be written to the
        // permanent archive and to the stable today/current key.
        const bytes = await photo.arrayBuffer();
        await ensureSchema(env);

        // Before replacing today/current, protect the previous current image.
        // If this preservation step fails, abort the replacement rather than
        // silently losing a photo that had not yet been catalogued.
        await archiveCurrentSkyPhotoIfNeeded(env);

        const uploadedAt = new Date().toISOString();
        const stationDay = stationDayKey(new Date(uploadedAt)) || uploadedAt.slice(0, 10);
        const archiveKey = skyPhotoArchiveKey(uploadedAt, photoType);

        // Archive first, catalogue second, current pointer last. This ordering
        // ensures a new current photo is never published before it has a durable
        // archive object and D1 log entry.
        await env.SKY_PHOTOS.put(archiveKey, bytes, {
          httpMetadata: { contentType: photoType },
          customMetadata: { uploadedAt, caption, photoId: uploadedAt }
        });
        await insertSkyPhotoArchiveRow(env, {
          photo_id: uploadedAt, uploaded_at: uploadedAt, station_day: stationDay, r2_key: archiveKey,
          caption, content_type: photoType, size_bytes: size, archived_at: uploadedAt, source: "upload"
        });
        try {
          await env.SKY_PHOTOS.put(SKY_PHOTO_KEY, bytes, {
            httpMetadata: { contentType: photoType },
            customMetadata: { uploadedAt, caption, archiveKey }
          });
        } catch (error) {
          // Best-effort rollback: do not catalogue a photo as an upload if it
          // could not become the current image. The previous current photo is
          // untouched because replacement is the final operation.
          try {
            await env.DB.prepare(`DELETE FROM ${SKY_PHOTO_ARCHIVE_TABLE} WHERE photo_id = ?`).bind(uploadedAt).run();
          } catch (_) {}
          try {
            if (typeof env.SKY_PHOTOS.delete === "function") await env.SKY_PHOTOS.delete(archiveKey);
          } catch (_) {}
          throw error;
        }

        return json({
          status: "ok",
          available: true,
          archived: true,
          photo_id: uploadedAt,
          uploaded_at: uploadedAt,
          caption,
          size_bytes: size,
          content_type: photoType
        }, 200, { "Cache-Control": "no-store" });
      } catch (error) {
        return json({ error: error?.message || "Sky photo upload failed" }, 500, { "Cache-Control": "no-store" });
      }
    }

    if(url.pathname==="/met/warnings"){
      if(request.method!=="GET")return json({error:"Method not allowed"},405,{"Cache-Control":"no-store"});
      try{return await cachedJson(request,ctx,60,()=>getMetWarnings());}catch(error){return json({error:"Official warnings are temporarily unavailable. Check Met Éireann directly."},503,{"Cache-Control":"no-store"});}
    }

    try {
      await ensureSchema(env);

      if (url.pathname === "/export-preview") {
        if (request.method !== "GET") return json({error:"Method not allowed"},405);
        return await previewWeatherExport(env,url);
      }
      if (url.pathname === "/sky-photo/history/dates") {
        if (request.method !== "GET") return json({error:"Method not allowed"},405);
        const month = String(url.searchParams.get("month") || stationDayKey(new Date()).slice(0,7));
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > stationDayKey(new Date()).slice(0,7)) return json({error:"Valid past or current calendar month required"},400);
        const result = await env.DB.prepare(`SELECT station_day AS day, COUNT(*) AS count FROM ${SKY_PHOTO_ARCHIVE_TABLE} WHERE station_day >= ? AND station_day <= ? AND station_day <= ? GROUP BY station_day ORDER BY station_day`).bind(month+"-01",month+"-31",stationDayKey(new Date())).all();
        return json({month,days:(result.results||[]).map(row=>({day:row.day,count:Number(row.count)||0}))},200,{"Cache-Control":"public, max-age=300"});
      }
      if (url.pathname === "/sky-photo/history" || url.pathname === "/sky-photo/history/image") {
        if (request.method !== "GET") return json({error:"Method not allowed"},405);
        const day = String(url.searchParams.get("day") || "");
        if (!isValidStationDayKey(day) || day > stationDayKey(new Date())) return json({error:"Valid past or current day required"},400);
        const photoId = String(url.searchParams.get("photo_id") || "");
        if (photoId.length > 80) return json({error:"Invalid photo identifier"},400);
        const row = await env.DB.prepare(`SELECT photo_id,caption,uploaded_at,r2_key,content_type FROM ${SKY_PHOTO_ARCHIVE_TABLE} WHERE station_day = ? AND (? = '' OR photo_id = ?) ORDER BY uploaded_at DESC LIMIT 1`).bind(day,photoId,photoId).first();
        if (url.pathname === "/sky-photo/history") return json({day,photo:row?{photo_id:row.photo_id,caption:row.caption||"",captured_at:row.uploaded_at}:null},200,{"Cache-Control":"public, max-age=300"});
        if (!photoId || !row?.r2_key) return json({error:"Photograph not found for this date"},404);
        if (!env.SKY_PHOTOS?.get) return json({error:"Photo storage unavailable"},503);
        const object = await env.SKY_PHOTOS.get(String(row.r2_key));
        if (!object) return json({error:"Photo unavailable"},404);
        return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType||row.content_type||"image/jpeg","Access-Control-Allow-Origin":"*","Cache-Control":"public, max-age=3600"}});
      }
      if (url.pathname === "/sky-photo/archive/dates") {
        if (!(await adminDiagnosticAuthorized(request, env))) return unauthorizedResponse(request);
        if (request.method !== "GET") return json({error:"Method not allowed"},405);
        const month = String(url.searchParams.get("month") || stationDayKey(new Date()).slice(0,7));
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({error:"Valid calendar month required"},400);
        await archiveCurrentSkyPhotoIfNeeded(env);
        const result = await env.DB.prepare(`SELECT station_day AS day, COUNT(*) AS count FROM ${SKY_PHOTO_ARCHIVE_TABLE} WHERE station_day >= ? AND station_day <= ? GROUP BY station_day ORDER BY station_day`).bind(month+"-01",month+"-31").all();
        return json({month,days:result.results || []},200,{"Cache-Control":"no-store"});
      }
      if (url.pathname === "/weather-window/sky") {
        const key = "weather_window_sky_override_v1";
        const choices = ["auto", "clear", "mostly-clear", "partly-cloudy", "cloudy", "overcast"];
        const rainChoices = ["auto","none","light","rain","heavy","thunderstorm"];
        const day = stationDayKey(new Date());
        if (request.method === "POST") {
          if (!(await adminDiagnosticAuthorized(request, env))) return unauthorizedResponse(request);
          let body;
          try { body = await request.json(); } catch (_) { return json({error:"Invalid JSON"},400); }
          if (!choices.includes(body?.sky)) return json({error:"Invalid sky setting"},400);
          const rain = body.rain ?? "auto";
          if (!rainChoices.includes(rain)) return json({error:"Invalid rain setting"},400);
          const duration = body.duration || "today";
          if (!["1h","3h","today"].includes(duration)) return json({error:"Invalid override duration"},400);
          const expiresEpoch = duration === "today" ? stationDayEpochRange(day).endEpoch : Math.floor(Date.now()/1000) + (duration === "1h" ? 3600 : 10800);
          const override = body.sky === "auto" && rain === "auto" ? null : {sky:body.sky,rain,day,updated_at:new Date().toISOString(),expires_at:new Date(expiresEpoch*1000).toISOString()};
          await writeMeta(env,{[key]:override ? JSON.stringify(override) : ""});
          return json({override},200,{"Cache-Control":"no-store"});
        }
        if (request.method !== "GET") return json({error:"Method not allowed"},405);
        const meta = await readMetaMap(env,[key]);
        let saved = null;
        try { saved = JSON.parse(meta[key] || "null"); } catch (_) {}
        const active = saved?.expires_at ? Number.isFinite(Date.parse(saved.expires_at)) && Date.parse(saved.expires_at) > Date.now() : saved?.day === day;
        const rain = saved?.rain ?? "auto";
        const override = active && choices.includes(saved.sky) && rainChoices.includes(rain) && (saved.sky !== "auto" || rain !== "auto") ? {...saved,rain} : null;
        return json({override},200,{"Cache-Control":"no-store"});
      }

      /*
       * Ecowitt's public cloud API does not currently return WH52 readings for
       * every account. The GW3001 custom-upload service can therefore send the
       * soil-only fields here. A separate secret prevents public spoofing; the
       * upload never replaces the existing WS90/cloud observation pipeline.
       */
      const shortWh52Path = url.pathname.startsWith("/w/") ? url.pathname.slice(3) : "";
      if ((url.pathname === "/ecowitt-upload" || url.pathname === "/w" || shortWh52Path) && request.method === "POST") {
        const configuredToken = await readSecret(env.ECOWITT_UPLOAD_TOKEN);
        const suppliedToken = String(shortWh52Path || url.searchParams.get("t") || url.searchParams.get("token") || request.headers.get("X-Ecowitt-Upload-Token") || "").trim();
        if (!configuredToken || suppliedToken !== configuredToken) {
          return new Response("unauthorized", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }

        const contentType = String(request.headers.get("content-type") || "").toLowerCase();
        let payload;
        if (contentType.includes("application/json")) {
          payload = await request.json();
        } else {
          payload = Object.fromEntries(new URLSearchParams(await request.text()));
        }

        const receivedEpoch = Math.floor(Date.now() / 1000);
        const fieldNames = Object.keys(payload || {})
          .filter(key => !/pass|key|token|password|secret/i.test(key))
          .slice(0, 100);

        // Ecowitt custom-server temperature fields use Fahrenheit; the cloud
        // API used elsewhere in this Worker is explicitly requested in Celsius.
        const soil = extractWh52(payload, "f");
        const liveReading = gatewayLiveReading(payload, soil, receivedEpoch);
        if (![soil.moisture_pct, soil.temperature_c, soil.ec_us_cm].some(usableNumber)) {
          await env.DB.prepare(
            `INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`
          ).bind(WH52_UPLOAD_STATUS_META_KEY, JSON.stringify({
            received_epoch: receivedEpoch,
            wh52_detected: false,
            field_names: fieldNames,
            live_reading: liveReading
          })).run();
          try {
            // Do not acknowledge the gateway until its weather observation is
            // durably in D1. A temporary failure returns 503 so the sender can
            // retry instead of silently losing the packet.
            await archiveGatewayObservation(env, payload, null, receivedEpoch);
          } catch (error) {
            await writeMeta(env, {
              [GATEWAY_DIRECT_ERROR_META_KEY]: safeErrorMessage(error)
            }).catch(() => {});
            console.warn("Direct GW3001 archive write failed:", error);
            return new Response("temporary archive failure", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30" }
            });
          }
          if(ctx?.waitUntil)ctx.waitUntil(runBackgroundAlerts(env,liveReading).catch(()=>console.warn("Background alert evaluation failed")));
          const recovery = recoverArchiveFromGateway(env, receivedEpoch);
          if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(recovery);
          else await recovery;
          // Acknowledge the packet so the gateway continues uploading; the
          // public status endpoint makes an unmatched payload diagnosable.
          return new Response("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
        }

        const record = {
          ...soil,
          received_epoch: receivedEpoch,
          source: "gw3001_custom_upload"
        };
        await env.DB.prepare(
          `INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).bind(WH52_UPLOAD_META_KEY, JSON.stringify(record)).run();
        await env.DB.prepare(
          `INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).bind(WH52_UPLOAD_STATUS_META_KEY, JSON.stringify({
          received_epoch: receivedEpoch,
          wh52_detected: true,
          channel: soil.channel,
          field_names: fieldNames,
          live_reading: liveReading,
          fields_received: {
            moisture: usableNumber(soil.moisture_pct),
            temperature: usableNumber(soil.temperature_c),
            conductivity: usableNumber(soil.ec_us_cm)
          }
        })).run();

        /*
         * Primary path: archive one authenticated GW3001 observation per
         * five-minute slot directly from the gateway packet. Secondary path:
         * retain the Cloudflare cron. Tertiary path: if the direct packet was
         * incomplete and the archive becomes stale, wake the existing
         * authoritative Ecowitt cloud sync. Each path is independently
         * guarded, so one failure cannot prevent the other two from running.
         */
        try {
          await archiveGatewayObservation(env, payload, soil, receivedEpoch);
        } catch (error) {
          await writeMeta(env, {
            [GATEWAY_DIRECT_ERROR_META_KEY]: safeErrorMessage(error)
          }).catch(() => {});
          console.warn("Direct GW3001 archive write failed:", error);
          return new Response("temporary archive failure", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30" }
          });
        }
        if(ctx?.waitUntil)ctx.waitUntil(runBackgroundAlerts(env,liveReading).catch(()=>console.warn("Background alert evaluation failed")));
        const recovery = recoverArchiveFromGateway(env, receivedEpoch);
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(recovery);
        else await recovery;

        return new Response("success", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }

      if (url.pathname === "/soil-status" && request.method === "GET") {
        const row = await env.DB.prepare(
          `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
        ).bind(WH52_UPLOAD_STATUS_META_KEY).first();
        if (!row?.value) return json({ gateway_upload_received: false }, 200, { "Cache-Control": "no-store" });
        try {
          const status = JSON.parse(row.value);
          const now = Math.floor(Date.now() / 1000);
          const { live_reading: _privateLiveReading, ...publicStatus } = status;
          return json({
            gateway_upload_received: true,
            ...publicStatus,
            age_seconds: Math.max(0, now - Number(status.received_epoch || now))
          }, 200, { "Cache-Control": "no-store" });
        } catch (_) {
          return json({ gateway_upload_received: false, status_error: true }, 200, { "Cache-Control": "no-store" });
        }
      }

      if (url.pathname === "/") {
        return json({
          service: "Parknacross Weather",
          status: "ok",
          endpoints: [
            "/health",
            "/sky-photo", "/sky-photo/meta", "/sky-photo/likes", "/sky-photo (admin POST)",
            "/sky-photo/archive/admin (admin)", "/sky-photo/archive/image (admin)", "/sky-photo/archive/import (admin POST)",
            "/sync (admin)",
            "/w/{token} (secured GW3001 POST)",
            "/soil-status",
            "/current",
            "/history?hours=24",
            "/daily?days=365",
            "/stats",
            "/storage-stats",
            "/met/forecast",
            "/met/warnings",
            "/quality", "/battery-debug (admin)", "/rain-summary", "/rain-events?days=30", "/events", "/reliability", "/lightning", "/day?date=YYYY-MM-DD", "/backup-status", "/export.csv",
            "/met/johnstown", "/met/point", "/forecast-verification",
            "/met/marine", "/marine/tides", "/marine/sea-temperature", "/climate-summary",
            "/social-status", "/social-status-admin (admin)", "/social-recover-today (admin POST)", "/social-preview?date=YYYY-MM-DD (admin)"
          ]
        });
      }

      // Permanent sky-photo archive. Metadata and image bytes are admin-only;
      // the public Today’s Sky feature continues to expose only today/current.
      if (url.pathname === "/sky-photo/archive/admin" && request.method === "GET") {
        const expected = await readSecret(env.ADMIN_KEY);
        const supplied = String(request.headers.get("X-Parknacross-Admin-Key") || "");
        if (!expected || supplied !== expected) return unauthorizedResponse(request);

        // Capture the currently displayed pre-archive photo on first use.
        await archiveCurrentSkyPhotoIfNeeded(env);

        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 12)));
        const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset") || 0)));
        const day=String(url.searchParams.get("day")||"");
        if(day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day+"T00:00:00Z")))) return json({error:"Valid calendar day required"},400);
        const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${SKY_PHOTO_ARCHIVE_TABLE} WHERE (? = '' OR station_day = ?)`).bind(day,day).first();
        const rows = await env.DB.prepare(
          `SELECT a.photo_id, a.uploaded_at, a.station_day, a.caption, a.content_type, a.size_bytes,
                  COUNT(v.visitor_id) AS likes
           FROM ${SKY_PHOTO_ARCHIVE_TABLE} a
           LEFT JOIN ${SKY_PHOTO_VOTERS_TABLE} v ON v.photo_id = a.photo_id
           WHERE (? = '' OR a.station_day = ?)
           GROUP BY a.photo_id, a.uploaded_at, a.station_day, a.caption, a.content_type, a.size_bytes
           ORDER BY a.uploaded_at DESC
           LIMIT ? OFFSET ?`
        ).bind(day, day, limit, offset).all();
        const total = Math.max(0, Number(totalRow?.count || 0));
        const items = (rows.results || []).map(row => ({
          photo_id: row.photo_id,
          uploaded_at: row.uploaded_at,
          day: row.station_day,
          caption: row.caption || "",
          content_type: row.content_type || "image/jpeg",
          size_bytes: Math.max(0, Number(row.size_bytes || 0)),
          likes: Math.max(0, Number(row.likes || 0))
        }));
        return json({ total, offset, limit, day: day || null, has_more: offset + items.length < total, items }, 200, { "Cache-Control": "no-store" });
      }

      // Import an older photo directly into the permanent archive without
      // changing today's current photo. This is admin-only and preserves the
      // supplied capture time so the archive is ordered by the real photo date.
      if (url.pathname === "/sky-photo/archive/import" && request.method === "POST") {
        if (!(await adminDiagnosticAuthorized(request, env))) {
          return unauthorizedResponse(request);
        }
        if (!env.SKY_PHOTOS || typeof env.SKY_PHOTOS.put !== "function") {
          return json({ error: "Sky photo storage is not configured" }, 503, { "Cache-Control": "no-store" });
        }
        try {
          const contentType = String(request.headers.get("Content-Type") || "");
          if (!contentType.toLowerCase().includes("multipart/form-data")) {
            return json({ error: "Import must use multipart/form-data" }, 415, { "Cache-Control": "no-store" });
          }
          const form = await request.formData();
          const photo = form.get("photo");
          const caption = String(form.get("caption") || "").trim().slice(0, 140);
          const capturedRaw = String(form.get("captured_at") || "").trim();
          if (!photo || typeof photo.arrayBuffer !== "function") {
            return json({ error: "No photo was supplied" }, 400, { "Cache-Control": "no-store" });
          }
          const photoType = String(photo.type || "").toLowerCase();
          if (!SKY_PHOTO_ALLOWED_TYPES.has(photoType)) {
            return json({ error: "Use a JPEG, PNG or WebP image" }, 415, { "Cache-Control": "no-store" });
          }
          const size = Number(photo.size || 0);
          if (!size || size > SKY_PHOTO_MAX_BYTES) {
            return json({ error: "Photo must be between 1 byte and 10 MB" }, 413, { "Cache-Control": "no-store" });
          }
          const capturedDate = new Date(capturedRaw);
          if (!capturedRaw || Number.isNaN(capturedDate.getTime())) {
            return json({ error: "A valid captured_at date/time is required" }, 400, { "Cache-Control": "no-store" });
          }
          if (capturedDate.getTime() > Date.now() + 5 * 60 * 1000) {
            return json({ error: "Historical photo time cannot be in the future" }, 400, { "Cache-Control": "no-store" });
          }

          const capturedAt = capturedDate.toISOString();
          const stationDay = stationDayKey(capturedDate) || capturedAt.slice(0, 10);
          const photoId = `historical-${crypto.randomUUID()}`;
          const archiveKey = skyPhotoHistoricalImportKey(capturedAt, photoType, photoId);
          const importedAt = new Date().toISOString();
          const bytes = await photo.arrayBuffer();

          await env.SKY_PHOTOS.put(archiveKey, bytes, {
            httpMetadata: { contentType: photoType },
            customMetadata: { capturedAt, caption, photoId, importedAt, source: "historical_import" }
          });
          try {
            await insertSkyPhotoArchiveRow(env, {
              photo_id: photoId,
              uploaded_at: capturedAt,
              station_day: stationDay,
              r2_key: archiveKey,
              caption,
              content_type: photoType,
              size_bytes: size,
              archived_at: importedAt,
              source: "historical_import"
            });
          } catch (error) {
            try {
              if (typeof env.SKY_PHOTOS.delete === "function") await env.SKY_PHOTOS.delete(archiveKey);
            } catch (_) {}
            throw error;
          }

          return json({
            status: "ok",
            imported: true,
            photo_id: photoId,
            captured_at: capturedAt,
            station_day: stationDay,
            caption,
            size_bytes: size,
            content_type: photoType
          }, 200, { "Cache-Control": "no-store" });
        } catch (error) {
          return json({ error: error?.message || "Historical photo import failed" }, 500, { "Cache-Control": "no-store" });
        }
      }

      if (url.pathname === "/sky-photo/archive/image" && request.method === "GET") {
        const expected = await readSecret(env.ADMIN_KEY);
        const supplied = String(request.headers.get("X-Parknacross-Admin-Key") || "");
        if (!expected || supplied !== expected) return unauthorizedResponse(request);
        if (!env.SKY_PHOTOS || typeof env.SKY_PHOTOS.get !== "function") {
          return json({ error: "Sky photo storage is not configured" }, 503, { "Cache-Control": "no-store" });
        }
        const photoId = String(url.searchParams.get("photo_id") || "").trim();
        if (!photoId || photoId.length > 80) return json({ error: "Valid photo_id is required" }, 400, { "Cache-Control": "no-store" });
        const row = await env.DB.prepare(
          `SELECT r2_key, uploaded_at, content_type FROM ${SKY_PHOTO_ARCHIVE_TABLE} WHERE photo_id = ? LIMIT 1`
        ).bind(photoId).first();
        if (!row?.r2_key) return json({ error: "Archived photo not found" }, 404, { "Cache-Control": "no-store" });
        const object = await env.SKY_PHOTOS.get(String(row.r2_key));
        if (!object) return json({ error: "Archived photo object is missing" }, 404, { "Cache-Control": "no-store" });
        const contentType = String(object.httpMetadata?.contentType || row.content_type || "image/jpeg");
        const headers = new Headers();
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Content-Type", contentType);
        headers.set("Cache-Control", "private, no-store");
        const etag = object.httpEtag || object.etag;
        if (etag) headers.set("ETag", etag);
        if (url.searchParams.get("download") === "1") {
          const day = String(row.uploaded_at || "photo").slice(0, 10);
          headers.set("Content-Disposition", `attachment; filename="parknacross-sky-${day}-${photoId.replace(/[^0-9A-Za-z_-]/g, "-")}.${skyPhotoExtension(contentType)}"`);
        }
        return new Response(object.body, { status: 200, headers });
      }

      // Display names are voluntarily supplied by visitors and never exposed in public responses.
      if (url.pathname === "/sky-photo/likes/admin" && request.method === "GET") {
        const expected = await readSecret(env.ADMIN_KEY);
        const supplied = String(request.headers.get("X-Parknacross-Admin-Key") || "");
        if (!expected || supplied !== expected) return unauthorizedResponse(request);
        const photoId = String(url.searchParams.get("photo_id") || "").trim();
        if (!photoId || photoId.length > 80) return json({ error: "Valid photo_id is required" }, 400, { "Cache-Control": "no-store" });
        const [totalRow, namedRow, entries] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) AS count FROM ${SKY_PHOTO_VOTERS_TABLE} WHERE photo_id = ?`).bind(photoId).first(),
          env.DB.prepare(`SELECT COUNT(*) AS count FROM ${SKY_PHOTO_VOTERS_TABLE} WHERE photo_id = ? AND display_name IS NOT NULL AND TRIM(display_name) <> ''`).bind(photoId).first(),
          env.DB.prepare(`SELECT display_name, created_at FROM ${SKY_PHOTO_VOTERS_TABLE} WHERE photo_id = ? ORDER BY created_at DESC LIMIT 200`).bind(photoId).all()
        ]);
        return json({ photo_id: photoId, total: Number(totalRow?.count || 0), named: Number(namedRow?.count || 0),
          visitors: (entries.results || []).map(row => ({ name: row.display_name || null, liked_at: row.created_at }))
        }, 200, { "Cache-Control": "no-store" });
      }

      // Visitors may add a voluntary display name to an existing like from the same browser.
      if (url.pathname === "/sky-photo/likes/name" && request.method === "POST") {
        let body = {}; try { body = await request.json(); } catch (_) {}
        const photoId = String(body?.photo_id || "").trim();
        const visitorId = String(body?.visitor_id || "").trim();
        const displayName = String(body?.display_name || "").replace(/\s+/g, " ").trim();
        if (!photoId || photoId.length > 80 || !/^[0-9a-f]{32}$/i.test(visitorId) || displayName.length < 2 || displayName.length > 50 || /[<>\x00-\x1f]/.test(displayName)) {
          return json({ error: "Enter a display name of 2–50 characters" }, 400, { "Cache-Control": "no-store" });
        }
        const updated = await env.DB.prepare(
          `UPDATE ${SKY_PHOTO_VOTERS_TABLE} SET display_name = ? WHERE photo_id = ? AND visitor_id = ?`
        ).bind(displayName, photoId, visitorId).run();
        if (!Number(updated?.meta?.changes || 0)) return json({ error: "Like not found for this browser" }, 404, { "Cache-Control": "no-store" });
        return json({ status: "ok", named: true }, 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/sky-photo/likes" && request.method === "GET") {
        const photoId = String(url.searchParams.get("photo_id") || "").trim();
        if (!photoId) return json({ error: "photo_id is required" }, 400, { "Cache-Control": "no-store" });
        const visitorId = String(url.searchParams.get("visitor_id") || "").trim();
        const validVisitor = /^[0-9a-f]{32}$/i.test(visitorId);
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS likes FROM ${SKY_PHOTO_VOTERS_TABLE} WHERE photo_id = ?`
        ).bind(photoId).first();
        const likedRow = validVisitor ? await env.DB.prepare(
          `SELECT 1 AS liked FROM ${SKY_PHOTO_VOTERS_TABLE} WHERE photo_id = ? AND visitor_id = ? LIMIT 1`
        ).bind(photoId, visitorId).first() : null;
        return json({ photo_id: photoId, likes: Number(row?.likes || 0), liked: Boolean(likedRow) }, 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/sky-photo/likes" && request.method === "POST") {
        if (!env.SKY_PHOTOS || typeof env.SKY_PHOTOS.head !== "function") {
          return json({ error: "Sky photo storage is not configured" }, 503, { "Cache-Control": "no-store" });
        }
        let body = {};
        try { body = await request.json(); } catch (_) {}
        const photoId = String(body?.photo_id || "").trim();
        const visitorId = String(body?.visitor_id || "").trim();
        if (!photoId || photoId.length > 80 || !/^[0-9a-f]{32}$/i.test(visitorId)) {
          return json({ error: "A valid photo and visitor ID are required" }, 400, { "Cache-Control": "no-store" });
        }
        const object = await env.SKY_PHOTOS.head(SKY_PHOTO_KEY);
        const currentPhotoId = String(object?.customMetadata?.uploadedAt || "").trim();
        if (!object || !currentPhotoId || currentPhotoId !== photoId) {
          return json({ error: "This photo is no longer current" }, 409, { "Cache-Control": "no-store" });
        }
        const now = new Date().toISOString();
        const displayName = String(body?.display_name || "").replace(/\s+/g, " ").trim();
        if (displayName && (displayName.length < 2 || displayName.length > 50 || /[<>\x00-\x1f]/.test(displayName))) {
          return json({ error: "Enter a display name of 2–50 characters" }, 400, { "Cache-Control": "no-store" });
        }
        // The unique (photo_id, visitor_id) constraint prevents repeat likes,
        // including simultaneous requests and browser refreshes.
        const inserted = await env.DB.prepare(
          `INSERT OR IGNORE INTO ${SKY_PHOTO_VOTERS_TABLE} (photo_id, visitor_id, created_at, display_name) VALUES (?, ?, ?, ?)`
        ).bind(photoId, visitorId, now, displayName || null).run();
        const alreadyLiked = Number(inserted?.meta?.changes || 0) === 0;
        // Count the unique votes directly: no separate counter write can drift
        // if a request fails between recording the vote and returning a response.
        const row = await env.DB.prepare(
          `SELECT COUNT(*) AS likes FROM ${SKY_PHOTO_VOTERS_TABLE} WHERE photo_id = ?`
        ).bind(photoId).first();
        return json({ photo_id: photoId, likes: Math.max(0, Number(row?.likes || 0)), liked: true, already_liked: alreadyLiked }, 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/social-history" && request.method === "GET") {
        if (!(await adminDiagnosticAuthorized(request, env))) return unauthorizedResponse(request);
        return json(await getSocialHistory(env),200,{"Cache-Control":"no-store"});
      }

      if (url.pathname === "/social-dashboard" && request.method === "GET") {
        if (!(await adminDiagnosticAuthorized(request, env))) return unauthorizedResponse(request);
        return json(await getSocialDashboardStatus(env),200,{"Cache-Control":"no-store"});
      }

      if (url.pathname === "/social-preview-today" && request.method === "GET") {
        if (!(await adminDiagnosticAuthorized(request, env))) return unauthorizedResponse(request);
        return json(await buildDailySocialPost(env,stationDayKey(new Date()),{preview:true}),200,{"Cache-Control":"no-store"});
      }

      if (url.pathname === "/social-status" && request.method === "GET") {
        return json(await getPublicSocialStatus(env), 200, { "Cache-Control": "public, max-age=60" });
      }

      if (url.pathname === "/social-status-admin" && request.method === "GET") {
        if (!(await adminDiagnosticAuthorized(request, env))) {
          return unauthorizedResponse(request);
        }
        return json(await getSocialStatus(env), 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/social-recover-today") {
        if (request.method !== "POST") {
          return json({ error: "Method not allowed", required_method: "POST" }, 405, {
            "Cache-Control": "no-store",
            "Allow": "POST"
          });
        }
        if (!(await adminDiagnosticAuthorized(request, env))) {
          return unauthorizedResponse(request);
        }
        try {
          const result = await recoverTodaySocialPost(env);
          return json(result, 200, { "Cache-Control": "no-store" });
        } catch (error) {
          let preview = null;
          try {
            preview = await buildDailySocialPost(env, stationDayKey(new Date()));
          } catch (_) {}
          return json({
            status: "error",
            error: error?.message || String(error),
            social_status: await getSocialStatus(env),
            facebook_text: preview?.facebookText || null,
            x_text: preview?.xText || null
          }, 500, { "Cache-Control": "no-store" });
        }
      }

      if (url.pathname === "/social-preview" && request.method === "GET") {
        if (!(await adminDiagnosticAuthorized(request, env))) {
          return unauthorizedResponse(request);
        }
        const date = String(url.searchParams.get("date") || shiftDayKey(stationDayKey(new Date()), -1));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);
        return json(await buildDailySocialPost(env, date, { test: true }), 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/social-publish" && request.method === "POST") {
        if (!(await manualSocialPublishAuthorized(request, env))) return unauthorizedResponse(request);
        let payload = {}; try { payload = await request.json(); } catch (_) {}
        const date = String(payload?.date || stationDayKey(new Date()));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);
        return json(await runDailySocialPost(env, { forceDay: date, test: payload?.test === true, force: true }), 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/sync") {
        if (!(await adminDiagnosticAuthorized(request, env))) {
          return unauthorizedResponse(request);
        }
        return json(await syncEcowitt(env), 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/history") {
        const requested = Number(url.searchParams.get("hours") || 24);
        const hours = Math.max(1, Math.min(720, Number.isFinite(requested) ? requested : 24));
        const fromRaw = url.searchParams.get("from_epoch"), toRaw = url.searchParams.get("to_epoch");
        const fixed = fromRaw !== null || toRaw !== null;
        const fromEpoch = Number(fromRaw), toEpoch = Number(toRaw);
        if (fixed && (fromRaw === null || toRaw === null || !Number.isSafeInteger(fromEpoch) || !Number.isSafeInteger(toEpoch) || fromEpoch <= 0 || toEpoch <= fromEpoch || toEpoch-fromEpoch > 31*86400 || toEpoch > Math.floor(Date.now()/1000)+120)) return json({error:"Valid bounded history interval required"},400);
        const ttl = hours <= 24 ? 300 : hours <= 168 ? 900 : 1800;

        return await cachedJson(request, ctx, ttl, async () => {
          const cutoff = fixed ? fromEpoch : Math.floor(Date.now() / 1000) - hours * 3600;
          const endEpoch = fixed ? toEpoch : Number.MAX_SAFE_INTEGER;
          const result = await env.DB.prepare(
            `SELECT epoch, received_at, temperature_c, feels_like_c, humidity,
                    dew_point_c, wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
                    pressure_hpa, rain_rate_mm_h, rain_daily_mm, solar_w_m2,
                    uv_index, battery_v, lightning_distance_km,
                    lightning_strikes, lightning_time_epoch,
                    soil_channel, soil_moisture_pct, soil_temperature_c,
                    soil_ec_us_cm
             FROM ${TABLE}
             WHERE epoch >= ? AND epoch <= ?
             ORDER BY epoch ASC`
          ).bind(cutoff,endEpoch).all();

          const exclusions = await gustExclusionsSince(env, cutoff);
          const exclusionMap = new Map(
            exclusions.map(item => [Number(item.epoch), item])
          );

          return {
            hours: fixed ? (toEpoch-fromEpoch)/3600 : hours,
            from_epoch: fixed ? fromEpoch : null,
            to_epoch: fixed ? toEpoch : null,
            count: result.results?.length || 0,
            readings: (result.results || []).map(row => {
              const formatted = formatRow(row);
              const exclusion = exclusionMap.get(Number(row.epoch));

              return {
                ...formatted,
                wind_gust_excluded: Boolean(exclusion),
                wind_gust_exclusion_reason: exclusion?.reason || null,
                wind_gust_exclusion_source: exclusion?.source || null
              };
            })
          };
        });
      }

      if (url.pathname === "/coverage") {
        const requested = Number(url.searchParams.get("days") || 371);
        const days = Math.max(1, Math.min(371, Number.isFinite(requested) ? requested : 371));
        return await cachedJson(request, ctx, 300, () => buildArchiveCoverage(env, days));
      }

      if (url.pathname === "/daily") {
        const requested = Number(url.searchParams.get("days") || 30);
        const days = Math.max(1, Math.min(3660, Number.isFinite(requested) ? requested : 30));

        const dailyTtl = days <= 2 ? 300 : 900;
        return await cachedJson(request, ctx, dailyTtl, async () => {
          await seedConfirmedGustExclusion(env);
          const today = stationDayKey(new Date());
          const cutoffDay = shiftDayKey(today, -(days - 1));

          const result = await env.DB.prepare(
            `SELECT day, sample_count, temp_sum_c, temp_count, high_c, low_c, peak_gust_kmh, rain_mm,
                    CASE
                      WHEN temp_count > 0 THEN temp_sum_c / temp_count
                      ELSE NULL
                    END AS mean_temperature_c,
                    CASE
                      WHEN pressure_count > 0 THEN pressure_sum_hpa / pressure_count
                      ELSE NULL
                    END AS avg_pressure_hpa,
                    solar_peak_w_m2,
                    lightning_strikes, lightning_nearest_km, lightning_last_epoch
             FROM ${DAILY_TABLE}
             WHERE day >= ?
             ORDER BY day ASC`
          ).bind(cutoffDay).all();

          const rows = (result.results || []).map(row => ({
            day: row.day,
            sample_count: Number(row.sample_count || 0),
            temp_sum_c: nullableNumber(row.temp_sum_c),
            temp_count: Number(row.temp_count || 0),
            mean_temperature_c: nullableNumber(row.mean_temperature_c),
            high_c: nullableNumber(row.high_c),
            low_c: nullableNumber(row.low_c),
            peak_gust_kmh: nullableNumber(row.peak_gust_kmh),
            rain_mm: correctedRainForDay(row.day, row.rain_mm),
            avg_pressure_hpa: nullableNumber(row.avg_pressure_hpa),
            solar_peak_w_m2: nullableNumber(row.solar_peak_w_m2),
            lightning_strikes: nullableNumber(row.lightning_strikes),
            lightning_nearest_km: nullableNumber(row.lightning_nearest_km),
            lightning_last_epoch: nullableNumber(row.lightning_last_epoch)
          }));

          /*
           * Recalculate today's temperature extrema from the raw observation
           * stream every time the short daily feed is requested. This makes
           * the current-day API self-healing even if a bad maximum/minimum was
           * previously persisted in the compact daily summary table.
           */
          const todayRow = rows.find(row => row.day === today);
          if (todayRow) {
            const validated = await validatedTemperatureExtremaForDay(env, today);
            if (usableNumber(validated.high_c)) todayRow.high_c = Number(validated.high_c);
            if (usableNumber(validated.low_c)) todayRow.low_c = Number(validated.low_c);
            todayRow.temperature_quality = {
              valid_count: validated.valid_count,
              rejected_count: validated.rejected_count
            };

            const gustQuality = await validatedPeakGustForDay(env, today);
            todayRow.peak_gust_kmh = usableNumber(gustQuality.peak_gust_kmh)
              ? Number(gustQuality.peak_gust_kmh)
              : null;
            todayRow.gust_quality = {
              valid_count: gustQuality.valid_count,
              rejected_count: gustQuality.rejected_count
            };

          }

          return { days: rows };
        });
      }

      if (url.pathname === "/stats") {
        return await cachedJson(request, ctx, 300, () => buildStats(env));
      }

      if (url.pathname === "/storage-stats") {
        return await cachedJson(request, ctx, 1800, () => buildStorageStats(env));
      }

      if (url.pathname === "/met/point-sky" && request.method === "GET") {
        return await cachedJson(request,ctx,900,() => getHourlySkyForecast());
      }

      if (url.pathname === "/met/forecast") {
        return await cachedJson(request, ctx, 300, () => getMetForecast());
      }

      if (url.pathname === "/met/warnings") {
        return await cachedJson(request, ctx, 60, () => getMetWarnings());
      }


      if (url.pathname === "/quality") {
        return await cachedJson(request, ctx, 300, () => buildQuality(env));
      }

      if (url.pathname === "/battery-debug") {
        if (!(await adminDiagnosticAuthorized(request, env))) {
          return unauthorizedResponse(request);
        }
        return json(await buildBatteryDebug(env), 200, {
          "Cache-Control": "no-store"
        });
      }

      if (url.pathname === "/rain-summary") {
        return await cachedJson(request, ctx, 300, () => buildRainSummary(env));
      }

      if (url.pathname === "/rain-events") {
        return await cachedJson(request, ctx, 300, () => buildRainEvents(env, url));
      }

      if (url.pathname === "/events") {
        return await cachedJson(request, ctx, 900, () => buildEvents(env));
      }

      if (url.pathname === "/reliability") {
        return await cachedJson(request, ctx, 300, () => buildReliability(env));
      }

      if (url.pathname === "/lightning") {
        return await cachedJson(request, ctx, 60, () => buildLightning(env));
      }

      if (url.pathname === "/day") {
        return await cachedJson(request, ctx, 900, () => buildDayDetail(env, url));
      }

      if (url.pathname === "/backup-status") {
        return json(await buildBackupStatus(env), 200, { "Cache-Control": "no-store" });
      }

      if (url.pathname === "/export.csv") {
        const from = url.searchParams.get("from"), to = url.searchParams.get("to");
        const hasDateRange = from !== null || to !== null;
        let range = null, days;
        if (hasDateRange) {
          if (!from || !to || !isValidStationDayKey(from) || !isValidStationDayKey(to) || from > to) {
            return json({ error: "Invalid date range", detail: "Provide valid from and to dates in YYYY-MM-DD format." }, 400, { "Cache-Control": "no-store" });
          }
          const daysInclusive = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;
          if (daysInclusive > 365) return json({ error: "Date range exceeds 365 days" }, 400, { "Cache-Control": "no-store" });
          if (to > stationDayKey(new Date())) return json({ error: "End date is in the future" }, 400, { "Cache-Control": "no-store" });
          const endDay = shiftDayKey(to, 1), startEpoch = dublinLocalMidnightEpoch(from), endExclusiveEpoch = endDay && dublinLocalMidnightEpoch(endDay);
          if (!Number.isFinite(startEpoch) || !Number.isFinite(endExclusiveEpoch) || endExclusiveEpoch <= startEpoch) {
            return json({ error: "Invalid date range" }, 400, { "Cache-Control": "no-store" });
          }
          days = daysInclusive;
          range = { from, to, startEpoch, endExclusiveEpoch };
        } else {
          const requested = Number(url.searchParams.get("days") || 365);
          days = Number.isFinite(requested) ? Math.floor(requested) : 365;
          const allowedDays = new Set([7, 30, 90, 365]);
          if (!allowedDays.has(days)) {
            return json({ error: "Unsupported export window", allowed_days: [7, 30, 90, 365] }, 400, { "Cache-Control": "public, max-age=300" });
          }
        }
        const cacheUrl = new URL(request.url);
        cacheUrl.search = "";
        if (range) { cacheUrl.searchParams.set("from", range.from); cacheUrl.searchParams.set("to", range.to); }
        else cacheUrl.searchParams.set("days", String(days));
        cacheUrl.searchParams.set("__cache_version", EDGE_CACHE_VERSION);
        const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
        const forceFresh = url.searchParams.get("fresh") === "1";
        let cache = null;
        if (!forceFresh) try {
          cache = caches.default;
          const cached = await cache.match(cacheKey);
          if (cached) return cached;
        } catch (error) {
          console.warn("CSV edge-cache read unavailable:", error);
        }
        const response = exportCsv(await exportRows(env, days, range), days, forceFresh, range);
        if (cache && !forceFresh) {
          try {
            const put = cache.put(cacheKey, response.clone());
            if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put); else await put;
          } catch (error) {
            console.warn("CSV edge-cache write unavailable:", error);
          }
        }
        return response;
      }

      if (url.pathname === "/met/johnstown") {
        return await cachedJson(request, ctx, 300, () => getJohnstownObservation());
      }

      if (url.pathname === "/outdoor-outlook") {return await cachedJson(request,ctx,900,()=>getOutdoorOutlook());}

      if (url.pathname === "/met/point") {
        return await cachedJson(request, ctx, 900, () => getPointForecast(env, { persist: false }));
      }

      if (url.pathname === "/forecast-verification") {
        return await cachedJson(request, ctx, 1800, () => buildForecastVerification(env));
      }

      if (url.pathname === "/met/marine") {
        return await cachedJson(request, ctx, 300, () => getMarineForecast());
      }

      if (url.pathname === "/marine/tides") {
        return await cachedJson(request, ctx, 3600, () => getTides(url));
      }

      if (url.pathname === "/marine/sea-temperature") {
        return await cachedJson(request, ctx, 1800, () => getSeaSurfaceTemperature());
      }

      if (url.pathname === "/climate-summary") {
        return await cachedJson(request, ctx, 900, () => buildClimateSummary(env));
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
      try {
        await ensureSchema(env);
      } catch (error) {
        console.error("Scheduled schema check failed; DB-backed jobs cannot continue:", error);
        return;
      }

      const scheduledAttemptEpoch = Math.floor(Date.now() / 1000);
      try {
        await writeMeta(env, {
          [SCHEDULED_SYNC_ATTEMPT_META_KEY]: scheduledAttemptEpoch,
          [SCHEDULED_SYNC_ERROR_META_KEY]: ""
        });
      } catch (error) {
        console.warn("Scheduled sync telemetry could not record the attempt:", error);
      }

      // Social posting is deliberately first and independently guarded. The
      // 07:30 update must not be skipped because an unrelated ingest, QC,
      // forecast or backup task fails on the same cron tick.
      try {
        await runDailySocialPost(env);
      } catch (error) {
        console.warn("Automatic social weather post failed:", error);
      }

      try {
        await syncEcowitt(env);
        await writeMeta(env, {
          [SCHEDULED_SYNC_SUCCESS_META_KEY]: Math.floor(Date.now() / 1000),
          [SCHEDULED_SYNC_ERROR_META_KEY]: ""
        });
      } catch (error) {
        try {
          await writeMeta(env, {
            [SCHEDULED_SYNC_ERROR_META_KEY]: safeErrorMessage(error)
          });
        } catch (_) {}
        console.warn("Scheduled Ecowitt sync failed:", error);
      }

      try {await runBackgroundAlerts(env);}catch(error){console.warn("Scheduled background alerts failed");}

      try {
        await seedConfirmedGustExclusion(env);
        const today = stationDayKey(new Date());
        await revalidateDailyGustQuality(env, today);
        await revalidateDailyGustQuality(env, shiftDayKey(today, -1));
      } catch (error) {
        console.warn("Scheduled gust quality processing failed:", error);
      }

      try {
        await maybeCaptureDailyForecastSnapshot(env);
      } catch (error) {
        console.warn("Daily forecast verification snapshot failed:", error);
      }

      try {
        await runDailyBackup(env);
      } catch (error) {
        console.warn("Automatic archive backup failed:", error);
      }
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

async function ensureColumn(env, table, column, definition) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  const exists = (info.results || []).some(row => String(row.name) === column);
  if (!exists) {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
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
      lightning_distance_km REAL,
      lightning_strikes INTEGER,
      lightning_time_epoch INTEGER,
      soil_channel INTEGER,
      soil_moisture_pct REAL,
      soil_temperature_c REAL,
      soil_ec_us_cm REAL,
      raw_json TEXT
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${SKY_PHOTO_LIKES_TABLE} (
      photo_id TEXT PRIMARY KEY,
      likes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${SKY_PHOTO_VOTERS_TABLE} (
      photo_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (photo_id, visitor_id)
    )`
  ).run();

  await ensureColumn(env, SKY_PHOTO_VOTERS_TABLE, "display_name", "TEXT");

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ${SKY_PHOTO_ARCHIVE_TABLE} (
      photo_id TEXT PRIMARY KEY,
      uploaded_at TEXT NOT NULL,
      station_day TEXT NOT NULL,
      r2_key TEXT NOT NULL UNIQUE,
      caption TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'upload'
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_sky_photo_archive_uploaded
     ON ${SKY_PHOTO_ARCHIVE_TABLE}(uploaded_at DESC)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_weather_epoch
     ON ${TABLE}(epoch)`
  ).run();

  /*
   * Safe additive migration for sites created before WH57 support.
   * Existing observations remain untouched; fields simply stay NULL until
   * Ecowitt begins supplying lightning data.
   */
  await ensureColumn(env, TABLE, "lightning_distance_km", "REAL");
  await ensureColumn(env, TABLE, "lightning_strikes", "INTEGER");
  await ensureColumn(env, TABLE, "lightning_time_epoch", "INTEGER");

  /*
   * Safe additive migration for the Ecowitt WH52. A single station may use
   * any WH52 channel, so the selected channel is archived with each sample.
   * NULL means that the gateway did not supply a WH52 reading at that time.
   */
  await ensureColumn(env, TABLE, "soil_channel", "INTEGER");
  await ensureColumn(env, TABLE, "soil_moisture_pct", "REAL");
  await ensureColumn(env, TABLE, "soil_temperature_c", "REAL");
  await ensureColumn(env, TABLE, "soil_ec_us_cm", "REAL");

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
      last_rain_epoch INTEGER,
      lightning_strikes INTEGER,
      lightning_nearest_km REAL,
      lightning_last_epoch INTEGER
    )`
  ).run();

  await ensureColumn(env, DAILY_TABLE, "lightning_strikes", "INTEGER");
  await ensureColumn(env, DAILY_TABLE, "lightning_nearest_km", "REAL");
  await ensureColumn(env, DAILY_TABLE, "lightning_last_epoch", "INTEGER");

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
  await normalizeHistoricalDailySummariesOnce(env);
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

  const strikeCount = nullableNumber(reading?.lightning_strikes);
  const rawDistanceKm = nullableNumber(reading?.lightning_distance_km);
  const distanceKm = strikeCount !== null && strikeCount > 0 && rawDistanceKm !== null && rawDistanceKm > 0
    ? rawDistanceKm
    : null;
  const lastStrikeEpoch = nullableNumber(reading?.lightning_time_epoch);

  if (strikeCount !== null || distanceKm !== null || lastStrikeEpoch !== null) {
    await env.DB.prepare(
      `UPDATE ${DAILY_TABLE}
       SET lightning_strikes = CASE
             WHEN ? IS NULL THEN lightning_strikes
             WHEN lightning_strikes IS NULL OR ? > lightning_strikes THEN ?
             ELSE lightning_strikes
           END,
           lightning_nearest_km = CASE
             WHEN ? IS NULL THEN lightning_nearest_km
             WHEN lightning_nearest_km IS NULL OR ? < lightning_nearest_km THEN ?
             ELSE lightning_nearest_km
           END,
           lightning_last_epoch = CASE
             WHEN ? IS NULL THEN lightning_last_epoch
             WHEN lightning_last_epoch IS NULL OR ? > lightning_last_epoch THEN ?
             ELSE lightning_last_epoch
           END
       WHERE day = ?`
    ).bind(
      strikeCount, strikeCount, strikeCount,
      distanceKm, distanceKm, distanceKm,
      lastStrikeEpoch, lastStrikeEpoch, lastStrikeEpoch,
      day
    ).run();
  }
}

async function rebuildDailySummaryForDay(env, day) {
  const range = stationDayEpochRange(day);
  if (!range) return { day, rebuilt: false, reason: "invalid_day" };

  const result = await env.DB.prepare(
    `SELECT epoch, temperature_c, wind_speed_kmh, wind_gust_kmh,
            rain_rate_mm_h, rain_daily_mm, pressure_hpa, solar_w_m2,
            lightning_distance_km, lightning_strikes, lightning_time_epoch
     FROM ${TABLE}
     WHERE epoch >= ? AND epoch < ?
     ORDER BY epoch ASC`
  ).bind(range.startEpoch, range.endEpoch).all();

  const rawRows = result.results || [];
  if (!rawRows.length) return { day, rebuilt: false, reason: "no_rows" };

  // Historical versions sometimes archived more than one observation in a
  // five-minute interval. Use the final observation in each intended slot so
  // means and sample counts are time-weighted rather than upload-frequency-
  // weighted. Raw observations remain untouched and downloadable.
  const bySlot = new Map();
  for (const row of rawRows) {
    const epoch = Number(row.epoch);
    if (!Number.isFinite(epoch)) continue;
    bySlot.set(Math.floor((epoch - range.startEpoch) / ARCHIVE_EXPECTED_INTERVAL_SECONDS), row);
  }
  const rows = [...bySlot.values()].sort((a, b) => Number(a.epoch) - Number(b.epoch));
  if (!rows.length) return { day, rebuilt: false, reason: "no_valid_rows" };

  const temperatureOutliers = temperatureOutlierRows(rows);
  const temperatureRows = rows.filter(row =>
    !temperatureOutliers.has(row) && usableNumber(row.temperature_c)
  );
  const persisted = await gustExclusionsForDay(env, day);
  const gustQuality = validatedPeakGustFromRows(
    rows,
    new Set(persisted.map(row => Number(row.epoch)))
  );
  const pressureRows = rows.filter(row => usableNumber(row.pressure_hpa));
  const solarValues = rows.map(row => nullableNumber(row.solar_w_m2)).filter(usableNumber).map(Number);
  const rainValues = rows.map(row => nullableNumber(row.rain_daily_mm)).filter(usableNumber).map(Number);

  let lastRainEpoch = null;
  let previousRainTotal = null;
  for (const row of rows) {
    const epoch = Number(row.epoch);
    const rate = nullableNumber(row.rain_rate_mm_h);
    const total = nullableNumber(row.rain_daily_mm);
    const increased = total !== null && previousRainTotal !== null && total >= previousRainTotal + 0.05;
    if ((rate !== null && rate > 0) || increased) lastRainEpoch = epoch;
    if (total !== null) previousRainTotal = total;
  }

  const strikeRows = rows.filter(row => Number(row.lightning_strikes || 0) > 0);
  const strikeCounts = strikeRows.map(row => Number(row.lightning_strikes)).filter(Number.isFinite);
  const lightningDistances = strikeRows
    .map(row => nullableNumber(row.lightning_distance_km))
    .filter(value => value !== null && value > 0 && value <= 40)
    .map(Number);
  const strikeTimes = strikeRows
    .map(row => nullableNumber(row.lightning_time_epoch))
    .filter(usableNumber)
    .map(Number);

  const temperatures = temperatureRows.map(row => Number(row.temperature_c));
  const pressures = pressureRows.map(row => Number(row.pressure_hpa));
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ${DAILY_TABLE} (
       day, first_epoch, last_epoch, sample_count,
       temp_sum_c, temp_count, high_c, low_c,
       peak_gust_kmh, rain_mm,
       pressure_sum_hpa, pressure_count, solar_peak_w_m2,
       last_rain_epoch, lightning_strikes, lightning_nearest_km,
       lightning_last_epoch
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    day,
    Number(rows[0].epoch),
    Number(rows[rows.length - 1].epoch),
    rows.length,
    temperatures.reduce((sum, value) => sum + value, 0),
    temperatures.length,
    temperatures.length ? Math.max(...temperatures) : null,
    temperatures.length ? Math.min(...temperatures) : null,
    nullableNumber(gustQuality.peak_gust_kmh),
    rainValues.length ? Math.max(...rainValues) : null,
    pressures.reduce((sum, value) => sum + value, 0),
    pressures.length,
    solarValues.length ? Math.max(...solarValues) : null,
    lastRainEpoch,
    strikeCounts.length ? Math.max(...strikeCounts) : 0,
    lightningDistances.length ? Math.min(...lightningDistances) : null,
    strikeTimes.length ? Math.max(...strikeTimes) : null
  ).run();

  return { day, rebuilt: true, raw_rows: rawRows.length, unique_slots: rows.length };
}

async function normalizeHistoricalDailySummariesOnce(env) {
  const markerKey = "daily_slot_normalization_v1";
  const marker = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
  ).bind(markerKey).first();
  if (marker) return;

  const days = await env.DB.prepare(
    `SELECT day FROM ${DAILY_TABLE} ORDER BY day ASC`
  ).all();
  for (const row of days.results || []) {
    await rebuildDailySummaryForDay(env, row.day);
  }
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ${META_TABLE} (key, value) VALUES (?, ?)`
  ).bind(markerKey, new Date().toISOString()).run();
}

function gatewayNumber(payload, ...names) {
  const wanted = new Set(names.map(normalizeSensorKey));
  for (const [key, value] of Object.entries(payload || {})) {
    if (!wanted.has(normalizeSensorKey(key))) continue;
    const number = numericSensorValue(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function gatewayDewPointC(temperatureC, humidity) {
  if (!usableNumber(temperatureC) || !usableNumber(humidity)) return null;
  const t = Number(temperatureC), rh = Math.max(1, Math.min(100, Number(humidity)));
  const alpha = Math.log(rh / 100) + (17.625 * t) / (243.04 + t);
  const dew = (243.04 * alpha) / (17.625 - alpha);
  return Number.isFinite(dew) ? round1(Math.min(t, dew)) : null;
}

function boundedSensorNumber(value, minimum, maximum) {
  if (!usableNumber(value)) return null;
  const number = Number(value);
  return number >= minimum && number <= maximum ? number : null;
}

/*
 * Reject impossible sensor values before they can reach D1, records, charts
 * or public summaries. These are deliberately broad physical/equipment
 * limits—not weather-alert thresholds—so genuine North Wexford extremes are
 * retained while corrupted payloads become explicit nulls.
 */
function validateWeatherReading(reading) {
  const clean = { ...reading };
  clean.temperature_c = boundedSensorNumber(clean.temperature_c, -30, 50);
  clean.humidity = boundedSensorNumber(clean.humidity, 0, 100);
  clean.wind_speed_kmh = boundedSensorNumber(clean.wind_speed_kmh, 0, 250);
  clean.wind_gust_kmh = boundedSensorNumber(clean.wind_gust_kmh, 0, 300);
  clean.wind_direction_deg = boundedSensorNumber(clean.wind_direction_deg, 0, 360);
  clean.pressure_hpa = boundedSensorNumber(clean.pressure_hpa, 850, 1100);
  clean.rain_rate_mm_h = boundedSensorNumber(clean.rain_rate_mm_h, 0, 500);
  clean.rain_daily_mm = boundedSensorNumber(clean.rain_daily_mm, 0, 1000);
  clean.solar_w_m2 = boundedSensorNumber(clean.solar_w_m2, 0, 1800);
  clean.uv_index = boundedSensorNumber(clean.uv_index, 0, 25);
  clean.battery_v = boundedSensorNumber(clean.battery_v, 0, 5);
  clean.soil_channel = boundedSensorNumber(clean.soil_channel, 1, 8);
  clean.soil_moisture_pct = boundedSensorNumber(clean.soil_moisture_pct, 0, 100);
  clean.soil_temperature_c = boundedSensorNumber(clean.soil_temperature_c, -20, 60);
  clean.soil_ec_us_cm = boundedSensorNumber(clean.soil_ec_us_cm, 0, 20000);

  const strikes = boundedSensorNumber(clean.lightning_strikes, 0, 1000000);
  clean.lightning_strikes = strikes === null ? null : Math.round(strikes);
  const distance = boundedSensorNumber(clean.lightning_distance_km, 0, 40);
  // WH57 reports zero as its idle/no-event value. It is not a strike at 0 km.
  clean.lightning_distance_km = clean.lightning_strikes > 0 && distance > 0 ? distance : null;
  clean.lightning_time_epoch = clean.lightning_strikes > 0
    ? nullableNumber(clean.lightning_time_epoch)
    : null;

  const dew = boundedSensorNumber(clean.dew_point_c, -40, 50);
  clean.dew_point_c = dew !== null && clean.temperature_c !== null && dew <= clean.temperature_c + 0.2
    ? dew
    : null;
  clean.feels_like_c = boundedSensorNumber(clean.feels_like_c, -50, 60);
  return clean;
}

function gatewayWeatherReading(payload, soil) {
  const fToC = value => usableNumber(value) ? round1((Number(value) - 32) * 5 / 9) : null;
  const mphToKmh = value => usableNumber(value) ? round1(Number(value) * 1.609344) : null;
  const inchesToMm = value => usableNumber(value) ? round1(Number(value) * 25.4) : null;
  const inHgToHpa = value => usableNumber(value) ? round1(Number(value) * 33.8638866667) : null;
  const temperature = fToC(gatewayNumber(payload, "tempf", "outtempf"));
  const humidity = gatewayNumber(payload, "humidity", "outhumidity");
  const wind = mphToKmh(gatewayNumber(payload, "windspeedmph", "windavgmph"));
  const gust = mphToKmh(gatewayNumber(payload, "windgustmph", "windgustmph10m"));
  const pressure = inHgToHpa(gatewayNumber(payload, "baromrelin", "baromrel"));
  const lightningStrikes = gatewayNumber(payload, "lightning_num", "lightningnum", "lightningcount");
  let reading = {
    temperature_c: temperature,
    feels_like_c: apparentTemperatureC(temperature, humidity, wind),
    humidity: usableNumber(humidity) ? Number(humidity) : null,
    dew_point_c: gatewayDewPointC(temperature, humidity),
    wind_speed_kmh: wind,
    wind_gust_kmh: gust,
    wind_direction_deg: gatewayNumber(payload, "winddir"),
    pressure_hpa: pressure,
    rain_rate_mm_h: inchesToMm(gatewayNumber(payload,
      "rrain_piezo", "rainratein_piezo", "rainrate_piezo", "piezo_rainratein", "piezo_rainrate",
      "rainratein", "rainrate")),
    rain_daily_mm: inchesToMm(gatewayNumber(payload,
      "drain_piezo", "dailyrainin_piezo", "dailyrain_piezo", "piezo_dailyrainin", "piezo_dailyrain",
      "dailyrainin", "dailyrain")),
    solar_w_m2: gatewayNumber(payload, "solarradiation", "solarradiationwpm2"),
    uv_index: gatewayNumber(payload, "uv"),
    battery_v: null,
    lightning_distance_km: gatewayNumber(payload, "lightning", "lightningdistancekm"),
    lightning_strikes: lightningStrikes,
    lightning_time_epoch: usableNumber(lightningStrikes) && Number(lightningStrikes) > 0
      ? normalizeLightningEpoch(gatewayNumber(payload, "lightning_time", "lightningtime"))
      : null,
    soil_channel: nullableNumber(soil?.channel),
    soil_moisture_pct: nullableNumber(soil?.moisture_pct),
    soil_temperature_c: nullableNumber(soil?.temperature_c),
    soil_ec_us_cm: nullableNumber(soil?.ec_us_cm)
  };
  const validated = validateWeatherReading(reading);
  if (!usableNumber(validated.feels_like_c)) validated.feels_like_c = validated.temperature_c;
  return validated;
}

function gatewayLiveReading(payload, soil, receivedEpoch) {
  const reading = gatewayWeatherReading(payload, soil);
  const coreFields = [
    reading.temperature_c, reading.humidity, reading.wind_speed_kmh,
    reading.wind_gust_kmh, reading.wind_direction_deg, reading.pressure_hpa,
    reading.rain_rate_mm_h, reading.rain_daily_mm, reading.solar_w_m2,
    reading.uv_index
  ].filter(usableNumber).length;
  if (!usableNumber(reading.temperature_c) || coreFields < 6) return null;
  const epoch = Math.floor(Number(receivedEpoch));
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  return {
    epoch,
    received_at: new Date(epoch * 1000).toISOString(),
    ...reading,
    source: "gw3001_direct_live"
  };
}

async function readGatewayLiveReading(env, nowEpoch = Math.floor(Date.now() / 1000)) {
  const row = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
  ).bind(WH52_UPLOAD_STATUS_META_KEY).first();
  if (!row?.value) return null;
  let status;
  try { status = JSON.parse(row.value); } catch (_) { return null; }
  const live = status?.live_reading;
  const epoch = nullableNumber(live?.epoch);
  if (!live || epoch === null || epoch <= 0 || Number(nowEpoch) - epoch > 3 * 60) return null;
  return validateWeatherReading({
    ...live,
    epoch,
    received_at: live.received_at || new Date(epoch * 1000).toISOString()
  });
}

async function archiveGatewayObservation(env, payload, soil, receivedEpoch) {
  const slotEpoch = Math.floor(Number(receivedEpoch) / ARCHIVE_EXPECTED_INTERVAL_SECONDS) * ARCHIVE_EXPECTED_INTERVAL_SECONDS;
  const slotEnd = slotEpoch + ARCHIVE_EXPECTED_INTERVAL_SECONDS;
  const reading = gatewayWeatherReading(payload, soil);
  const coreFields = [
    reading.temperature_c, reading.humidity, reading.wind_speed_kmh,
    reading.wind_gust_kmh, reading.wind_direction_deg, reading.pressure_hpa,
    reading.rain_rate_mm_h, reading.rain_daily_mm, reading.solar_w_m2, reading.uv_index
  ].filter(usableNumber).length;
  if (!usableNumber(reading.temperature_c) || coreFields < 6) {
    throw new Error(`GW3001 weather payload incomplete (${coreFields}/10 core fields)`);
  }

  const receivedAt = new Date(slotEpoch * 1000).toISOString();
  const provenance = JSON.stringify({
    source: "gw3001_direct",
    pressure: usableNumber(reading.pressure_hpa) ? { relative: { value: Number(reading.pressure_hpa) } } : null
  });
  const existing = await env.DB.prepare(
    `SELECT epoch FROM ${TABLE} WHERE epoch >= ? AND epoch < ? ORDER BY epoch DESC LIMIT 1`
  ).bind(slotEpoch, slotEnd).first();

  if (existing) {
    /*
     * A later packet in the same five-minute slot may contain WH52, rain or
     * lightning fields that the first packet lacked. Fill nulls in-place;
     * never overwrite an already archived value and never create a duplicate
     * slot merely to repair one field.
     */
    await env.DB.prepare(
      `UPDATE ${TABLE} SET
         temperature_c=COALESCE(temperature_c, ?), feels_like_c=COALESCE(feels_like_c, ?),
         humidity=COALESCE(humidity, ?), dew_point_c=COALESCE(dew_point_c, ?),
         wind_speed_kmh=COALESCE(wind_speed_kmh, ?),
         wind_gust_kmh=COALESCE(MAX(wind_gust_kmh, ?), wind_gust_kmh, ?),
         wind_direction_deg=COALESCE(wind_direction_deg, ?), pressure_hpa=COALESCE(pressure_hpa, ?),
         rain_rate_mm_h=COALESCE(rain_rate_mm_h, ?), rain_daily_mm=COALESCE(rain_daily_mm, ?),
         solar_w_m2=COALESCE(solar_w_m2, ?), uv_index=COALESCE(uv_index, ?),
         lightning_distance_km=COALESCE(lightning_distance_km, ?),
         lightning_strikes=COALESCE(lightning_strikes, ?),
         lightning_time_epoch=COALESCE(lightning_time_epoch, ?),
         soil_channel=COALESCE(soil_channel, ?), soil_moisture_pct=COALESCE(soil_moisture_pct, ?),
         soil_temperature_c=COALESCE(soil_temperature_c, ?), soil_ec_us_cm=COALESCE(soil_ec_us_cm, ?),
         raw_json=COALESCE(raw_json, ?)
       WHERE epoch = ?`
    ).bind(
      reading.temperature_c, reading.feels_like_c, reading.humidity, reading.dew_point_c,
      reading.wind_speed_kmh, reading.wind_gust_kmh, reading.wind_gust_kmh,
      reading.wind_direction_deg, reading.pressure_hpa,
      reading.rain_rate_mm_h, reading.rain_daily_mm, reading.solar_w_m2, reading.uv_index,
      reading.lightning_distance_km, reading.lightning_strikes, reading.lightning_time_epoch,
      reading.soil_channel, reading.soil_moisture_pct, reading.soil_temperature_c,
      reading.soil_ec_us_cm, provenance, Number(existing.epoch)
    ).run();
    await rebuildDailySummaryForDay(env, stationDayKey(new Date(Number(existing.epoch) * 1000)));
    await writeMeta(env, {
      [GATEWAY_DIRECT_SUCCESS_META_KEY]: Math.floor(Date.now() / 1000),
      [GATEWAY_DIRECT_ERROR_META_KEY]: ""
    });
    return { archived: false, repaired: true, reason: "slot_merged", epoch: Number(existing.epoch) };
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO ${TABLE} (
      epoch, received_at, temperature_c, feels_like_c, humidity,
      dew_point_c, wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
      pressure_hpa, rain_rate_mm_h, rain_daily_mm, solar_w_m2,
      uv_index, battery_v, lightning_distance_km, lightning_strikes,
      lightning_time_epoch, soil_channel, soil_moisture_pct,
      soil_temperature_c, soil_ec_us_cm, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    slotEpoch, receivedAt, reading.temperature_c, reading.feels_like_c,
    reading.humidity, reading.dew_point_c, reading.wind_speed_kmh,
    reading.wind_gust_kmh, reading.wind_direction_deg, reading.pressure_hpa,
    reading.rain_rate_mm_h, reading.rain_daily_mm, reading.solar_w_m2,
    reading.uv_index, null, nullableNumber(reading.lightning_distance_km),
    nullableNumber(reading.lightning_strikes), null, reading.soil_channel,
    reading.soil_moisture_pct, reading.soil_temperature_c,
    reading.soil_ec_us_cm, provenance
  ).run();
  await updateVerifiedPressureRecords(env, reading.pressure_hpa, slotEpoch, receivedAt);
  await updateDailySummary(env, slotEpoch, reading);
  await writeMeta(env, {
    [GATEWAY_DIRECT_SUCCESS_META_KEY]: Math.floor(Date.now() / 1000),
    [GATEWAY_DIRECT_ERROR_META_KEY]: ""
  });
  return { archived: true, source: "gw3001_direct", epoch: slotEpoch };
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

  let ws90Battery = null;
  try {
    ws90Battery = await getWs90BatteryVoltage(
      env, applicationKey, apiKey, mac, {
        directVoltage: findWs90BatteryVoltage(data),
        observationEpoch: epoch
      }
    );
  } catch (error) {
    console.warn("WS90 battery recovery during sync failed:", error);
  }

  const lightning = extractLightning(data);
  const cloudSoil = extractWh52(data, "c");
  const uploadedSoil = await readFreshWh52Upload(env);
  const soil = [cloudSoil.moisture_pct, cloudSoil.temperature_c, cloudSoil.ec_us_cm].some(usableNumber)
    ? cloudSoil
    : uploadedSoil || cloudSoil;

  let reading = {
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
    // pressure_hpa is intentionally sea-level/relative pressure only.
    // Never fall back to absolute station pressure: mixing the two creates
    // false steps in trends, charts and records. Missing relative pressure is
    // represented as null instead of substituting a different quantity.
    pressure_hpa: valueAt(data, [
      "pressure.relative.value",
      "pressure.relative"
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
    battery_v: findWs90BatteryVoltage(data), // From this payload only, not a saved fallback.
    lightning_distance_km: lightning.distance_km,
    lightning_strikes: lightning.strikes,
    lightning_time_epoch: lightning.last_epoch,
    soil_channel: soil.channel,
    soil_moisture_pct: soil.moisture_pct,
    soil_temperature_c: soil.temperature_c,
    soil_ec_us_cm: soil.ec_us_cm
  };

  /*
   * Ecowitt's WS90 real-time response commonly omits apparent temperature or
   * returns the air temperature unchanged. Calculate a continuous Steadman
   * apparent temperature from the actual outdoor temperature, humidity and
   * sustained wind so "feels like" remains meaningful in normal Irish
   * conditions—not only during heat-index or wind-chill extremes.
   */
  reading = validateWeatherReading(reading);

  const calculatedFeelsLike = apparentTemperatureC(
    reading.temperature_c,
    reading.humidity,
    reading.wind_speed_kmh
  );
  if (calculatedFeelsLike !== null) {
    reading.feels_like_c = calculatedFeelsLike;
  } else if (!usableNumber(reading.feels_like_c)) {
    reading.feels_like_c = reading.temperature_c;
  }

  // v38.4.25: maintain QC-validated sea-level pressure records from the
  // live Ecowitt relative-pressure field. This runs even when the observation
  // epoch is a duplicate, so a newly deployed Worker can seed the record
  // immediately without waiting for a new archive row. Writes only occur when
  // a high/low is first created or genuinely exceeded.
  await updateVerifiedPressureRecords(env, reading.pressure_hpa, epoch, receivedAt);

  // Store only the tiny piece of provenance needed to prove that archived
  // pressure is Ecowitt relative/sea-level pressure. The full Ecowitt payload
  // remains in latest_payload_v1 only, keeping D1 growth small.
  const archiveProvenanceJson = usableNumber(reading.pressure_hpa)
    ? JSON.stringify({ pressure: { relative: { value: Number(reading.pressure_hpa) } } })
    : null;

  // All collection paths share the same five-minute slot guard. The gateway
  // normally wins because it arrives directly; cron/current recovery fills
  // the slot only when the gateway did not. This prevents duplicate rows and
  // keeps daily sample counts aligned with the intended archive cadence.
  const slotStart = Math.floor(epoch / ARCHIVE_EXPECTED_INTERVAL_SECONDS) * ARCHIVE_EXPECTED_INTERVAL_SECONDS;
  const slotExisting = await env.DB.prepare(
    `SELECT epoch, rain_rate_mm_h, rain_daily_mm
     FROM ${TABLE} WHERE epoch >= ? AND epoch < ? LIMIT 1`
  ).bind(slotStart, slotStart + ARCHIVE_EXPECTED_INTERVAL_SECONDS).first();
  if (slotExisting) {
    // Merge authoritative cloud fields into null columns in the gateway row.
    // This repairs an incomplete slot without creating a second observation
    // in the same five-minute period or biasing daily means/sample counts.
    await env.DB.prepare(
      `UPDATE ${TABLE} SET
         temperature_c=COALESCE(temperature_c, ?), feels_like_c=COALESCE(feels_like_c, ?),
         humidity=COALESCE(humidity, ?), dew_point_c=COALESCE(dew_point_c, ?),
         wind_speed_kmh=COALESCE(wind_speed_kmh, ?), wind_gust_kmh=COALESCE(wind_gust_kmh, ?),
         wind_direction_deg=COALESCE(wind_direction_deg, ?), pressure_hpa=COALESCE(pressure_hpa, ?),
         rain_rate_mm_h=COALESCE(rain_rate_mm_h, ?), rain_daily_mm=COALESCE(rain_daily_mm, ?),
         solar_w_m2=COALESCE(solar_w_m2, ?), uv_index=COALESCE(uv_index, ?),
         lightning_distance_km=COALESCE(lightning_distance_km, ?),
         lightning_strikes=COALESCE(lightning_strikes, ?),
         lightning_time_epoch=COALESCE(lightning_time_epoch, ?),
         soil_channel=COALESCE(soil_channel, ?), soil_moisture_pct=COALESCE(soil_moisture_pct, ?),
         soil_temperature_c=COALESCE(soil_temperature_c, ?), soil_ec_us_cm=COALESCE(soil_ec_us_cm, ?),
         raw_json=COALESCE(raw_json, ?)
       WHERE epoch = ?`
    ).bind(
      reading.temperature_c, reading.feels_like_c, reading.humidity, reading.dew_point_c,
      reading.wind_speed_kmh, reading.wind_gust_kmh, reading.wind_direction_deg, reading.pressure_hpa,
      reading.rain_rate_mm_h, reading.rain_daily_mm, reading.solar_w_m2, reading.uv_index,
      reading.lightning_distance_km, reading.lightning_strikes, reading.lightning_time_epoch,
      reading.soil_channel, reading.soil_moisture_pct, reading.soil_temperature_c,
      reading.soil_ec_us_cm, archiveProvenanceJson, Number(slotExisting.epoch)
    ).run();
    await rebuildDailySummaryForDay(env, stationDayKey(new Date(Number(slotExisting.epoch) * 1000)));
    await env.DB.prepare(
      `INSERT INTO ${PAYLOAD_TABLE} (id, epoch, raw_json)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET epoch=excluded.epoch, raw_json=excluded.raw_json`
    ).bind(epoch, JSON.stringify(payload)).run();
    return {
      status: "ok",
      synced: true,
      duplicate_slot: true,
      slot_merged: true,
      writes_skipped: false,
      epoch: Number(slotExisting.epoch),
      received_at: new Date(Number(slotExisting.epoch) * 1000).toISOString(),
      reading
    };
  }

  // v38.4.16 D1 WRITE GUARD: Ecowitt often returns the same observation to
  // multiple /sync, /current and scheduled requests. Never rewrite an epoch
  // already archived. v38.4.25 retains the one-off provenance backfill for the
  // current duplicate row so the verified pressure record becomes available
  // immediately after deployment; subsequent duplicate requests remain read-only.
  const alreadyStored = await env.DB.prepare(
    `SELECT raw_json, pressure_hpa FROM ${TABLE} WHERE epoch = ? LIMIT 1`
  ).bind(epoch).first();

  if (alreadyStored) {
    let provenanceBackfilled = false;
    if (
      archiveProvenanceJson &&
      !alreadyStored.raw_json &&
      usableNumber(alreadyStored.pressure_hpa) &&
      Math.abs(Number(alreadyStored.pressure_hpa) - Number(reading.pressure_hpa)) <= 0.3
    ) {
      await env.DB.prepare(
        `UPDATE ${TABLE} SET raw_json = ? WHERE epoch = ? AND raw_json IS NULL`
      ).bind(archiveProvenanceJson, epoch).run();
      provenanceBackfilled = true;
    }

    return {
      status: "ok",
      synced: true,
      duplicate: true,
      writes_skipped: !provenanceBackfilled,
      provenance_backfilled: provenanceBackfilled,
      epoch,
      received_at: receivedAt,
      reading
    };
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO ${TABLE} (
      epoch, received_at, temperature_c, feels_like_c, humidity,
      dew_point_c, wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
      pressure_hpa, rain_rate_mm_h, rain_daily_mm, solar_w_m2,
      uv_index, battery_v, lightning_distance_km, lightning_strikes,
      lightning_time_epoch, soil_channel, soil_moisture_pct,
      soil_temperature_c, soil_ec_us_cm, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    nullableNumber(reading.lightning_distance_km),
    nullableNumber(reading.lightning_strikes),
    nullableNumber(reading.lightning_time_epoch),
    nullableNumber(reading.soil_channel),
    nullableNumber(reading.soil_moisture_pct),
    nullableNumber(reading.soil_temperature_c),
    nullableNumber(reading.soil_ec_us_cm),
    archiveProvenanceJson
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
            uv_index, battery_v, lightning_distance_km,
            lightning_strikes, lightning_time_epoch, soil_channel,
            soil_moisture_pct, soil_temperature_c, soil_ec_us_cm, raw_json
     FROM ${TABLE}
     ORDER BY epoch DESC
     LIMIT 1`
  ).first();
}


async function buildStorageStats(env) {
  /*
   * Use the compact daily table for archive counts. D1 exposes the current
   * database file size in query metadata as `size_after`.
   *
   * D1 does not expose the account-wide daily rows-read / rows-written usage
   * to SQL inside a Worker, so the quota figures below deliberately distinguish
   * Cloudflare's published limits from a conservative estimate of this
   * Worker's core archive writes.
   */
  const today = stationDayKey(new Date());
  const result = await env.DB.prepare(
    `SELECT COALESCE(SUM(sample_count),0) AS total_samples,
            MIN(first_epoch) AS first_epoch,
            MAX(last_epoch) AS latest_epoch,
            COALESCE(SUM(CASE WHEN day = ? THEN sample_count ELSE 0 END),0) AS today_samples
     FROM ${DAILY_TABLE}`
  ).bind(today).all();

  const row = result.results?.[0] || {};
  const sizeBytes = Math.max(0, Number(result.meta?.size_after || 0));
  const limitBytes = D1_FREE_LIMIT_BYTES;
  const remainingBytes = Math.max(0, limitBytes - sizeBytes);
  const usedPercent = limitBytes > 0 ? Math.min(100, (sizeBytes / limitBytes) * 100) : 0;

  const totalSamples = Number(row.total_samples || 0);
  const todaySamples = Number(row.today_samples || 0);
  const firstEpoch = nullableNumber(row.first_epoch);
  const latestEpoch = nullableNumber(row.latest_epoch);

  /*
   * A newly archived observation normally writes the observation row, the
   * compact daily summary row and the single latest-payload row. Allow a fourth
   * row as a conservative cushion for optional per-observation auxiliary
   * updates (for example lightning summary data). This is intentionally an
   * estimate, not a claim about Cloudflare's account-level billing counter.
   */
  const estimatedCoreRowsWrittenToday = todaySamples * 4;
  const estimatedWritePercent = Math.min(
    100,
    (estimatedCoreRowsWrittenToday / D1_FREE_DAILY_ROWS_WRITTEN) * 100
  );

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
    today_samples: todaySamples,
    first_epoch: firstEpoch,
    latest_epoch: latestEpoch,
    archive_span_days: archiveSpanDays === null ? null : Number(archiveSpanDays.toFixed(2)),
    growth_bytes_per_day: growthBytesPerDay === null ? null : Math.round(growthBytesPerDay),
    estimated_days_remaining: estimatedDaysRemaining === null ? null : Math.round(estimatedDaysRemaining),
    projected_80_percent_date: projected80PercentDate,
    daily_row_limits: {
      rows_read: D1_FREE_DAILY_ROWS_READ,
      rows_written: D1_FREE_DAILY_ROWS_WRITTEN
    },
    estimated_core_rows_written_today: estimatedCoreRowsWrittenToday,
    estimated_core_write_percent: Number(estimatedWritePercent.toFixed(3)),
    quota_measurement: "core_write_estimate_only",
    quota_note: "Account-wide D1 daily read/write usage is authoritative in Cloudflare; the Worker can only estimate its own core archive writes."
  };
}

async function buildStats(env) {
  const now = new Date();
  const localToday = stationDayKey(now);
  const yearPrefix = localToday.slice(0, 4);
  const monthPrefix = localToday.slice(0, 7);

  // If this release is being deployed over an archive created by an older
  // Worker, there may be no verified pressure-record metadata yet. Seed it
  // once from a live Ecowitt relative-pressure reading so the dashboard does
  // not remain stuck on “Building…”. Any failure is non-fatal to other stats.
  const pressureMetaBefore = await readVerifiedPressureRecords(env);
  if (!pressureMetaBefore.high || !pressureMetaBefore.low) {
    try {
      await syncEcowitt(env);
    } catch (error) {
      console.warn("Verified sea-level pressure record seed failed:", error);
    }
  }

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
       LIMIT 250`
    ).all();

    for (const candidate of candidates.results || []) {
      if (!(await temperatureRecordIsOutlier(env, candidate))) return candidate;
    }
    return null;
  }

  if (field === "pressure_hpa") {
    /*
     * v38.4.25: the primary source for pressure records is dedicated metadata
     * written only from Ecowitt's live pressure.relative field. This prevents
     * the record card depending on whether historical raw_json was retained.
     */
    const verified = await readVerifiedPressureRecords(env);
    const metaRecord = direction === "DESC" ? verified.high : verified.low;
    let best = metaRecord ? {
      epoch: Number(metaRecord.epoch),
      received_at: metaRecord.received_at,
      pressure_hpa: Number(metaRecord.value)
    } : null;

    // Preserve any older archive record that can still be independently
    // proven to be relative pressure from retained provenance.
    const candidates = await env.DB.prepare(
      `SELECT epoch, received_at, pressure_hpa, raw_json
       FROM ${TABLE}
       WHERE pressure_hpa IS NOT NULL AND raw_json IS NOT NULL
       ORDER BY pressure_hpa ${direction}
       LIMIT 100`
    ).all();

    for (const candidate of candidates.results || []) {
      try {
        const raw = JSON.parse(candidate.raw_json);
        const relative = valueAt(raw, ["pressure.relative.value", "pressure.relative"]);
        if (
          usableNumber(relative) &&
          Math.abs(Number(relative) - Number(candidate.pressure_hpa)) <= 0.3 &&
          !(await pressureRecordIsOutlier(env, candidate))
        ) {
          if (!best) {
            best = candidate;
          } else if (
            (direction === "DESC" && Number(candidate.pressure_hpa) > Number(best.pressure_hpa)) ||
            (direction === "ASC" && Number(candidate.pressure_hpa) < Number(best.pressure_hpa))
          ) {
            best = candidate;
          }
          break;
        }
      } catch (_) {}
    }

    return best;
  }

  if (field === "wind_gust_kmh") {
    const candidates = await env.DB.prepare(
      `SELECT epoch, received_at, wind_speed_kmh, wind_gust_kmh
       FROM ${TABLE}
       WHERE wind_gust_kmh IS NOT NULL
       ORDER BY wind_gust_kmh ${direction}
       LIMIT 250`
    ).all();

    for (const candidate of candidates.results || []) {
      if (!(await gustRecordIsOutlier(env, candidate))) return candidate;
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

function decodeMetTextEntities(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanMetText(value) {
  return decodeMetTextEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function localPartsMatchEpoch(epochMs, year, month, day, hour, minute) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STATION_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(epochMs));
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(map.year) === year && Number(map.month) === month &&
    Number(map.day) === day && Number(map.hour) === hour && Number(map.minute) === minute;
}

function dublinLocalDateTimeToEpoch(year, month, day, hour, minute) {
  const base = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Ireland is UTC or UTC+1. Try both offsets and verify by formatting back
  // through Intl so DST transition dates are handled correctly as well.
  for (const offsetMinutes of [0, 60]) {
    const candidate = base - offsetMinutes * 60_000;
    if (localPartsMatchEpoch(candidate, year, month, day, hour, minute)) return candidate;
  }
  return null;
}

function parseMetIssuedTime(value) {
  const text = cleanMetText(value);
  if (!text) return null;

  let stripped = text
    .replace(/^Issued(?:\s+at)?\s*:?\s*/i, "")
    .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b,?\s*/i, "")
    .trim();

  const timeFirst = stripped.match(/^(\d{1,2}:\d{2})\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})$/);
  if (timeFirst) stripped = `${timeFirst[2]} ${timeFirst[1]}`;

  const match = stripped.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+at)?\s+(\d{1,2}):(\d{2})$/i);
  if (match) {
    const months = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
    const month = months[String(match[2]).toLowerCase()];
    if (month) {
      const parsed = dublinLocalDateTimeToEpoch(
        Number(match[3]), month, Number(match[1]), Number(match[4]), Number(match[5])
      );
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  // Fallback only for an explicitly offset/UTC timestamp; do not let the
  // Worker's UTC runtime reinterpret an unzoned Irish civil-time string.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(stripped)) {
    const parsed = Date.parse(stripped);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normaliseMetForecast(forecast, source) {
  const issued = cleanMetText(forecast?.issued) || null;
  const issuedMs = parseMetIssuedTime(issued);
  const nowMs = Date.now();

  /*
   * Forecast text can remain syntactically valid while an upstream feed has
   * stopped updating. Reject a parseable issue time older than 36 hours, or
   * more than six hours in the future, so getMetForecast() can try the next
   * official Met Éireann representation instead of serving stale text.
   */
  if (issuedMs !== null) {
    const ageHours = (nowMs - issuedMs) / 3600000;
    if (ageHours > 36) {
      throw new Error(`${source} forecast is stale (${ageHours.toFixed(1)} hours old)`);
    }
    if (ageHours < -6) {
      throw new Error(`${source} forecast issue time is unexpectedly in the future`);
    }
  }

  const result = {
    region: cleanMetText(forecast?.region) || "Leinster",
    issued,
    issued_at: issuedMs === null ? null : new Date(issuedMs).toISOString(),
    age_hours: issuedMs === null ? null : Number(((nowMs - issuedMs) / 3600000).toFixed(2)),
    freshness_checked: issuedMs !== null,
    today: cleanMetText(forecast?.today),
    tonight: cleanMetText(forecast?.tonight),
    tomorrow: cleanMetText(forecast?.tomorrow),
    outlook: cleanMetText(forecast?.outlook),
    source
  };

  if (!result.today && !result.tonight && !result.tomorrow) {
    throw new Error(`${source} returned no forecast text`);
  }

  return result;
}

async function getMetForecastJson() {
  const response = await fetch(
    "https://www.met.ie/Open_Data/json/Leinster.json",
    {
      headers: {
        "Accept": "application/json",
        "User-Agent": "ParknacrossWeather/1.0 (+https://parknacrossweather.ie)"
      },
      cf: { cacheTtl: 0, cacheEverything: false }
    }
  );

  if (!response.ok) throw new Error(`JSON HTTP ${response.status}`);

  const raw = await response.json();
  const parts = raw?.forecasts?.[0]?.regions || [];
  const merged = Object.assign({}, ...parts);

  return normaliseMetForecast({
    region: merged.region,
    issued: merged.issued,
    today: merged.today,
    tonight: merged.tonight,
    tomorrow: merged.tomorrow,
    outlook: merged.outlook
  }, "Met Éireann Leinster JSON");
}

function metXmlField(xml, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml || "").match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i")
  );
  return match ? cleanMetText(match[1]) : "";
}

async function getMetForecastXml() {
  const response = await fetch(
    "https://www.met.ie/Open_Data/xml/xLeinster.xml",
    {
      headers: {
        "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "ParknacrossWeather/1.0 (+https://parknacrossweather.ie)"
      },
      cf: { cacheTtl: 0, cacheEverything: false }
    }
  );

  if (!response.ok) throw new Error(`XML HTTP ${response.status}`);
  const xml = await response.text();

  return normaliseMetForecast({
    region: metXmlField(xml, "region") || "Leinster",
    issued: metXmlField(xml, "issued"),
    today: metXmlField(xml, "today"),
    tonight: metXmlField(xml, "tonight"),
    tomorrow: metXmlField(xml, "tomorrow"),
    outlook: metXmlField(xml, "outlook")
  }, "Met Éireann Leinster XML");
}

function metHtmlLines(html) {
  return decodeMetTextEntities(
    String(html || "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|h[1-6]|li|div|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function metHtmlSection(lines, startPattern, stopPatterns) {
  const start = lines.findIndex(line => startPattern.test(line));
  if (start < 0) return "";

  const collected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (stopPatterns.some(pattern => pattern.test(line))) break;
    collected.push(line);
  }
  return cleanMetText(collected.join(" "));
}

async function getMetForecastHtml() {
  const response = await fetch(
    "https://www.met.ie/forecasts/leinster",
    {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "ParknacrossWeather/1.0 (+https://parknacrossweather.ie)"
      },
      cf: { cacheTtl: 0, cacheEverything: false }
    }
  );

  if (!response.ok) throw new Error(`HTML HTTP ${response.status}`);
  const lines = metHtmlLines(await response.text());

  const issuedLine = lines.find(line => /^Issued at:/i.test(line)) || "";
  const issued = issuedLine.replace(/^Issued at:\s*/i, "").trim();
  const today = metHtmlSection(
    lines,
    /^TODAY\b/i,
    [/^TONIGHT\b/i, /^Pollen Forecast\b/i, /^Solar UV Index\b/i, /^TOMORROW\b/i, /^National Outlook\b/i]
  );
  const tonight = metHtmlSection(
    lines,
    /^TONIGHT\b/i,
    [/^Pollen Forecast\b/i, /^Solar UV Index\b/i, /^TOMORROW\b/i, /^National Outlook\b/i]
  );
  const tomorrow = metHtmlSection(
    lines,
    /^TOMORROW\b/i,
    [/^Pollen Forecast\b/i, /^Solar UV Index\b/i, /^National Outlook\b/i, /^Further Outlook\b/i]
  );

  return normaliseMetForecast({
    region: "Leinster",
    issued,
    today,
    tonight,
    tomorrow,
    outlook: ""
  }, "Met Éireann Leinster webpage");
}

async function getMetForecast() {
  /*
   * v38.4.20: do not let a temporary dropout in one Met Éireann feed blank
   * the dashboard. Met Éireann notes that its live text feeds can have
   * temporary interruptions, so try three official representations in order.
   * Prefer the confirmed live Leinster webpage, then official JSON/XML fallbacks.
   */
  const attempts = [
    getMetForecastHtml,
    getMetForecastJson,
    getMetForecastXml
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error?.message || String(error));
      console.warn("Met Éireann forecast source failed:", error);
    }
  }

  throw new Error(`Met Éireann forecast unavailable: ${errors.join("; ")}`);
}

function parseWarningValidity(text){
  const matches=[...String(text||"").matchAll(/(\d{1,2}):(\d{2})\s+(?:[A-Za-z]+\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
  const dates=matches.map(m=>dublinLocalDateTimeToEpoch(Number(m[5]),Number(m[4]),Number(m[3]),Number(m[1]),Number(m[2]))).filter(Number.isFinite);
  return {onset:dates[0]?new Date(dates[0]).toISOString():null,expires:dates[1]?new Date(dates[1]).toISOString():null};
}
function parseWeatherWarningFallback(html){
  const text=htmlToPlainText(html),section=extractNamedTextSection(text,"Weather Warnings",["Marine Warnings","Environmental Advisories"]);
  if(!section)throw new Error("Official weather warning section missing");
  if(/currently no warnings in operation|no weather warnings|no warnings in force/i.test(section))return [];
  const headings=[...section.matchAll(/Status\s+(Yellow|Orange|Red)\s*[-–]\s*([^\n]+)/gi)];
  if(!headings.length)throw new Error("Official warning bulletin could not be verified");
  return headings.flatMap((m,i)=>{
    const block=section.slice(m.index,headings[i+1]?.index||section.length);
    if(!/\b(Wexford|Leinster|Ireland|nationwide|all counties)\b/i.test(m[2]))return [];
    const valid=block.match(/Valid\s*:?\s*([^\n]+)/i)?.[1];
    const times=parseWarningValidity(valid);if(!times.onset||!times.expires)throw new Error("Warning validity unavailable");
    return [{level:m[1],headline:`Status ${m[1]} - ${m[2].trim()}`,description:block.split(/Valid\s*:/i)[0].slice(m[0].length).trim(),...times,issued:block.match(/Issued\s*:?\s*([^\n]+)/i)?.[1]||null}];
  });
}
async function getMetWarnings(){
  const primary="https://www.met.ie/Open_Data/json/warning_EI30.json",fallback="https://www.met.ie/warnings-today.html";
  let list,source=primary;
  try{const response=await fetchTextWithTimeout(primary,{headers:{Accept:"application/json"}},4500);if(!response.response.ok)throw new Error(`Warnings HTTP ${response.response.status}`);list=JSON.parse(response.text);if(!Array.isArray(list))throw new Error("Unexpected warnings response");if(list.some(item=>!item||typeof item!=="object"))throw new Error("Invalid warning entry");}
  catch(error){source=fallback;const response=await fetchTextWithTimeout(fallback,{headers:{Accept:"text/html"}},4500);if(!response.response.ok)throw new Error(`Warning fallback HTTP ${response.response.status}`);list=parseWeatherWarningFallback(response.text);}
  const warnings=list.filter(item=>! /potato|blight|farming|agricultur|environmental advisory/i.test([item.type,item.event,item.status,item.headline,item.description,item.desc].join(" "))).map(item=>({type:item.type||item.event||"",level:item.level||"",severity:item.severity||"",certainty:item.certainty||"",status:item.status||"",issued:item.issued||null,updated:item.updated||null,onset:item.onset||null,expires:item.expires||item.expiry||null,headline:item.headline||"",description:item.description||item.desc||""})).filter(item=>!item.expires||!Number.isFinite(Date.parse(item.expires))||Date.parse(item.expires)>Date.now());
  return {county:"Wexford",warnings,source,checked_at:new Date().toISOString()};
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
  // Persistent provenance: first seen never advances simply because the
  // station reports the same cached voltage in a later weather observation.
  let batteryRecord = await readWs90BatteryRecord(env);
  if (!batteryRecord || !Number.isFinite(batteryRecord.last_checked_epoch) ||
      Math.floor(Date.now()/1000) - batteryRecord.last_checked_epoch >= WS90_BATTERY_CHECK_INTERVAL_SECONDS) {
    try {
      const applicationKey = await readSecret(env.ECOWITT_APPLICATION_KEY);
      const apiKey = await readSecret(env.ECOWITT_API_KEY);
      const mac = await readSecret(env.ECOWITT_MAC);
      if (applicationKey && apiKey && mac) {
        await getWs90BatteryVoltage(env, applicationKey, apiKey, mac, {
          directVoltage: findWs90BatteryVoltage(latest?.raw_json ? JSON.parse(latest.raw_json) : null)
        });
        batteryRecord = await readWs90BatteryRecord(env);
      }
    } catch (error) {
      console.warn("Battery check during /quality failed:", error);
    }
  }
  // Legacy archive readings have no trustworthy original battery timestamp.
  const legacyBattery = batteryRecord ? null : batteryVoltageFromRow(latest);
  const v = batteryRecord?.value ?? legacyBattery;
  const firstSeenEpoch = batteryRecord?.first_seen_epoch ?? null;
  const batteryArchiveAgeSeconds = Number.isFinite(firstSeenEpoch)
    ? Math.max(0, Math.floor(Date.now()/1000) - firstSeenEpoch) : null;
  const battery = v === null ? "--" : v >= 3.0 ? `Normal · ${v.toFixed(2)} V` : v >= 2.7 ? `Check · ${v.toFixed(2)} V` : `Low · ${v.toFixed(2)} V`;

  const gustExclusions = await allGustExclusions(env);
  const recentGustExclusions = gustExclusions.filter(
    row => Number(row.epoch) >= cutoff
  );
  const lastGustExclusionEpoch = gustExclusions.length
    ? Math.max(...gustExclusions.map(row => Number(row.epoch)).filter(Number.isFinite))
    : null;

  return {
    feed_status: age === null ? "No data" : age < 600 ? "Live" : age < 1800 ? "Delayed" : "Offline",
    latest_age_seconds: age,
    samples_last_24h: epochs.length,
    median_interval_minutes: median,
    largest_recent_gap_minutes: largest,
    total_samples: Number(count?.count || 0),
    battery_status: battery, // Legacy field for older website clients.
    battery_voltage_v: v,
    // Compatibility fields: now refer to the *first time this value was seen*,
    // not to the timestamp of the newest weather observation.
    battery_last_archived_at: firstSeenEpoch !== null ? new Date(firstSeenEpoch*1000).toISOString() : null,
    battery_archive_age_seconds: batteryArchiveAgeSeconds,
    battery_first_seen_at: firstSeenEpoch !== null ? new Date(firstSeenEpoch*1000).toISOString() : null,
    battery_last_checked_at: Number.isFinite(batteryRecord?.last_checked_epoch)
      ? new Date(batteryRecord.last_checked_epoch*1000).toISOString() : null,
    battery_last_reported_at: Number.isFinite(batteryRecord?.last_reported_epoch)
      ? new Date(batteryRecord.last_reported_epoch*1000).toISOString() : null,
    battery_measurement_time_confirmed: false, // Ecowitt may cache the value.
    gust_spikes_excluded_24h: recentGustExclusions.length,
    gust_spikes_excluded_total: gustExclusions.length,
    last_gust_exclusion_epoch: nullableNumber(lastGustExclusionEpoch)
  };
}

async function buildRainSummary(env) {
  const latest = await getLatest(env);

  /*
   * Use the one-row-per-day summary for rainfall totals. All rolling calendar
   * periods below are keyed to Europe/Dublin calendar dates, never to "the last
   * N stored rows", so a missing day cannot silently pull an older day into a
   * seven-day total.
   */
  const daily = await env.DB.prepare(
    `SELECT day, rain_mm, last_rain_epoch
     FROM ${DAILY_TABLE}
     ORDER BY day ASC`
  ).all();

  const days = (daily.results || []).map(r => ({
    day: r.day,
    rain_mm: correctedRainForDay(r.day, r.rain_mm),
    last_rain_epoch: nullableNumber(r.last_rain_epoch)
  }));
  const byDay = new Map(days.map(row => [row.day, row]));

  const now = new Date();
  const todayKey = stationDayKey(now);
  const yesterdayKey = shiftDayKey(todayKey, -1);
  const sevenDayStart = shiftDayKey(todayKey, -6);
  const monthPrefix = todayKey.slice(0, 7);
  const yearPrefix = todayKey.slice(0, 4);

  const storedToday = byDay.get(todayKey)?.rain_mm;
  const latestIsToday = latest?.epoch && stationDayKey(new Date(Number(latest.epoch) * 1000)) === todayKey;
  const latestToday = latestIsToday ? correctedRainForDay(todayKey, latest?.rain_daily_mm) : null;
  const todayCandidates = [storedToday, latestToday].filter(usableNumber).map(Number);
  const today = todayCandidates.length ? Math.max(...todayCandidates) : null;
  const yesterday = byDay.get(yesterdayKey)?.rain_mm ?? null;

  const last7Days = days.filter(row =>
    row.day >= sevenDayStart && row.day <= todayKey
  );
  const last7 = sum(last7Days.map(row => row.rain_mm));
  const last7ExpectedKeys = Array.from({ length: 7 }, (_, index) =>
    shiftDayKey(todayKey, index - 6)
  );
  const missingLast7Days = last7ExpectedKeys.filter(key => !byDay.has(key));

  const monthDays = days.filter(x => String(x.day).startsWith(monthPrefix));
  const yearDays = days.filter(x => String(x.day).startsWith(yearPrefix));
  const monthRain = sum(monthDays.map(x => x.rain_mm));
  const yearRain = sum(yearDays.map(x => x.rain_mm));
  const monthRainDays = monthDays.filter(x => Number(x.rain_mm || 0) > 0).length;
  const wettest = days.reduce((best, row) => {
    if (!best || Number(row.rain_mm || 0) > Number(best.rain_mm || 0)) return row;
    return best;
  }, null);

  /*
   * Consecutive dry days must be truly consecutive calendar days. Stop at the
   * first missing archive day because unknown weather is not evidence of a dry
   * day.
   */
  let dry = 0;
  let drySequenceComplete = true;
  for (let offset = 0; offset < 3660; offset += 1) {
    const key = shiftDayKey(todayKey, -offset);
    const row = byDay.get(key);
    if (!row) {
      drySequenceComplete = false;
      break;
    }
    if (Number(row.rain_mm || 0) <= 0) dry += 1;
    else break;
  }

  /*
   * updateDailySummary() records last_rain_epoch whenever either the
   * instantaneous rain rate is positive or the WS90 cumulative daily counter
   * increases.
   */
  const effectiveLastRainEpoch = days.reduce((latestEpoch, row) => {
    const value = nullableNumber(row.last_rain_epoch);
    return value !== null && (latestEpoch === null || value > latestEpoch) ? value : latestEpoch;
  }, null);

  let currentEvent = null;
  const currentRate = Number(latest?.rain_rate_mm_h || 0);
  if (currentRate > 0 && latest) {
    const cutoff = Number(latest.epoch) - 48 * 3600;
    const recent = await env.DB.prepare(
      `SELECT epoch,received_at,rain_daily_mm,rain_rate_mm_h
       FROM ${TABLE}
       WHERE epoch >= ?
       ORDER BY epoch ASC`
    ).bind(cutoff).all();

    let previous = null;
    let start = null;
    let totalMm = 0;
    let lastWetEpoch = null;
    for (const row of recent.results || []) {
      const epoch = Number(row.epoch);
      if (!Number.isFinite(epoch)) continue;
      const day = stationDayKey(new Date(epoch * 1000));
      const total = nullableNumber(row.rain_daily_mm);
      const rate = nullableNumber(row.rain_rate_mm_h) || 0;

      if (previous && epoch - previous.epoch > 30 * 60) {
        start = null; totalMm = 0; lastWetEpoch = null;
      } else if (start && lastWetEpoch !== null && epoch - lastWetEpoch > 90 * 60) {
        start = null; totalMm = 0; lastWetEpoch = null;
      }

      let increment = 0;
      const continuous = previous && epoch - previous.epoch <= 30 * 60;
      if (continuous && total !== null && previous.total !== null) {
        if (previous.day === day) {
          const delta = total - previous.total;
          if (delta >= 0.05 && delta < 50) increment = delta;
        } else if (total >= 0.05 && total < 50) {
          // Ecowitt daily rain resets at local midnight. The first cumulative
          // value after midnight is rain since midnight and belongs to the
          // same meteorological event if observations are continuous.
          increment = total;
        }
      }

      const wet = rate > 0 || increment >= 0.05;
      if (wet) {
        if (!start) start = row;
        totalMm += increment;
        lastWetEpoch = epoch;
      }
      previous = { day, total, epoch };
    }

    if (start && lastWetEpoch !== null && Number(latest.epoch) - lastWetEpoch <= 20 * 60) {
      currentEvent = {
        started_at: start.received_at,
        total_mm: round1(totalMm)
      };
    }
  }

  return {
    current_rate_mm_h: nullableNumber(latest?.rain_rate_mm_h),
    today_mm: usableNumber(today) ? round1(today) : null,
    yesterday_mm: usableNumber(yesterday) ? round1(yesterday) : null,
    last_7_days_mm: round1(last7),
    last_7_days_start: sevenDayStart,
    last_7_days_end: todayKey,
    last_7_days_complete: missingLast7Days.length === 0,
    last_7_days_missing_dates: missingLast7Days,
    month_mm: round1(monthRain),
    month_rain_days: monthRainDays,
    year_mm: round1(yearRain),
    consecutive_dry_days: dry,
    consecutive_dry_days_complete: drySequenceComplete,
    wettest_day: wettest && usableNumber(wettest.rain_mm)
      ? { day: wettest.day, rain_mm: round1(wettest.rain_mm) }
      : null,
    last_measurable_rain: usableNumber(effectiveLastRainEpoch)
      ? {
          received_at: new Date(Number(effectiveLastRainEpoch) * 1000).toISOString(),
          epoch: Number(effectiveLastRainEpoch)
        }
      : null,
    current_event: currentEvent
  };
}
function orderedStationDayResolver() {
  let day = null, range = null;
  return epoch => {
    if (!range || epoch < range.startEpoch || epoch >= range.endEpoch) {
      day = stationDayKey(new Date(epoch * 1000));
      range = stationDayEpochRange(day);
    }
    return day;
  };
}

async function buildRainEvents(env, url) {
  const requested = Number(url.searchParams.get("days") || 30);
  const days = Math.max(1, Math.min(90, Number.isFinite(requested) ? requested : 30));
  const nowEpoch = Math.floor(Date.now() / 1000);
  const cutoff = nowEpoch - days * 86400;
  const dryGapSeconds = 90 * 60;
  const observationGapSeconds = 30 * 60;

  /*
   * Fetch one extra hour so the first in-window observation can inherit the
   * preceding cumulative-rain value. This lead-in is used only as context:
   * time before the first real in-window observation is never counted as dry.
   */
  const result = await env.DB.prepare(
    `SELECT epoch, received_at, rain_rate_mm_h, rain_daily_mm
     FROM ${TABLE}
     WHERE epoch >= ?
     ORDER BY epoch ASC`
  ).bind(cutoff - 3600).all();

  const rows = result.results || [];
  const events = [];
  const observations = [];
  let previous = null;
  let current = null;
  let lastWetEpoch = null;

  const finish = active => {
    if (!current) return;
    const endEpoch = lastWetEpoch || current.end_epoch || current.start_epoch;
    const durationMinutes = Math.max(
      5,
      Math.round((endEpoch - current.start_epoch) / 60) + 5
    );

    if (current.total_mm >= 0.05 || current.peak_rate_mm_h > 0) {
      events.push({
        start_epoch: current.start_epoch,
        start_at: new Date(current.start_epoch * 1000).toISOString(),
        end_epoch: endEpoch,
        end_at: new Date(endEpoch * 1000).toISOString(),
        duration_minutes: durationMinutes,
        total_mm: round1(current.total_mm),
        peak_rate_mm_h: round1(current.peak_rate_mm_h),
        active: Boolean(active)
      });
    }

    current = null;
    lastWetEpoch = null;
  };

  const dayForEpoch = orderedStationDayResolver();
  for (const row of rows) {
    const epoch = Number(row.epoch);
    if (!Number.isFinite(epoch)) continue;

    const day = dayForEpoch(epoch);
    const total = nullableNumber(row.rain_daily_mm);
    const rate = nullableNumber(row.rain_rate_mm_h) || 0;

    let increment = 0;
    const continuous = previous && epoch - previous.epoch <= observationGapSeconds;
    if (continuous && total !== null && previous.total !== null) {
      if (previous.day === day) {
        const delta = total - previous.total;
        if (delta >= 0.05 && delta < 50) increment = delta;
      } else if (total >= 0.05 && total < 50) {
        // Daily cumulative rainfall resets at local midnight. Count the first
        // post-midnight cumulative amount so an event crossing midnight does
        // not lose rain from its total.
        increment = total;
      }
    }

    const wet = rate > 0 || increment >= 0.05;

    /*
     * Keep a separate observation stream for dry-interval analysis.
     * Only actual samples inside the requested window are eligible.
     */
    if (epoch >= cutoff) {
      observations.push({ epoch, wet });
    }

    // Unknown weather breaks an event. Do not bridge a rain event across a
    // >30-minute observation gap even if the gap is shorter than the normal
    // 90-minute dry separation threshold.
    if (previous && epoch - previous.epoch > observationGapSeconds) {
      finish(false);
    } else if (
      current &&
      lastWetEpoch !== null &&
      epoch - lastWetEpoch > dryGapSeconds
    ) {
      finish(false);
    }

    if (wet) {
      if (!current) {
        current = {
          start_epoch: epoch,
          end_epoch: epoch,
          total_mm: 0,
          peak_rate_mm_h: 0
        };
      }
      current.end_epoch = epoch;
      current.total_mm += increment;
      current.peak_rate_mm_h = Math.max(current.peak_rate_mm_h, rate);
      lastWetEpoch = epoch;
    }

    previous = { day, total, epoch };
  }

  if (current) {
    finish(
      lastWetEpoch !== null &&
      nowEpoch - lastWetEpoch <= 20 * 60
    );
  }

  const inWindow = events.filter(event => event.end_epoch >= cutoff);

  /*
   * Longest dry interval must be based on OBSERVED weather only.
   *
   * v38.4.1 incorrectly started the dry clock at the requested 30-day cutoff,
   * even when no Parknacross observations existed then. That could classify
   * weeks before the station/archive existed as dry weather.
   *
   * Also break the calculation across observation gaps >30 minutes: absence
   * of data is unknown weather, not evidence of dry weather.
   */
  let longestDrySeconds = 0;
  let dryStartEpoch = null;
  let previousObservation = null;

  for (const observation of observations) {
    if (
      previousObservation &&
      observation.epoch - previousObservation.epoch > observationGapSeconds
    ) {
      if (dryStartEpoch !== null) {
        longestDrySeconds = Math.max(
          longestDrySeconds,
          previousObservation.epoch - dryStartEpoch
        );
      }
      dryStartEpoch = null;
    }

    if (observation.wet) {
      if (dryStartEpoch !== null) {
        longestDrySeconds = Math.max(
          longestDrySeconds,
          observation.epoch - dryStartEpoch
        );
      }
      dryStartEpoch = null;
    } else if (dryStartEpoch === null) {
      dryStartEpoch = observation.epoch;
    }

    previousObservation = observation;
  }

  if (dryStartEpoch !== null && previousObservation) {
    /*
     * If the feed is current, count the ongoing dry spell to now. If the feed
     * is stale, stop at the final observation rather than inventing dry time.
     */
    const endEpoch =
      nowEpoch - previousObservation.epoch <= 20 * 60
        ? nowEpoch
        : previousObservation.epoch;

    longestDrySeconds = Math.max(
      longestDrySeconds,
      Math.max(0, endEpoch - dryStartEpoch)
    );
  }

  const byTotal = [...inWindow]
    .sort((a,b) => b.total_mm - a.total_mm)[0] || null;
  const byDuration = [...inWindow]
    .sort((a,b) => b.duration_minutes - a.duration_minutes)[0] || null;
  const byRate = [...inWindow]
    .sort((a,b) => b.peak_rate_mm_h - a.peak_rate_mm_h)[0] || null;

  const firstObservedEpoch = observations.length
    ? Number(observations[0].epoch)
    : null;
  const lastObservedEpoch = observations.length
    ? Number(observations[observations.length - 1].epoch)
    : null;

  return {
    days,
    separation_minutes: 90,
    observation_gap_threshold_minutes: 30,
    observed_from_epoch: firstObservedEpoch,
    observed_to_epoch: lastObservedEpoch,
    observed_span_hours:
      firstObservedEpoch !== null && lastObservedEpoch !== null
        ? Math.round(((lastObservedEpoch - firstObservedEpoch) / 3600) * 10) / 10
        : null,
    event_count: inWindow.length,
    longest_dry_hours: observations.length
      ? Math.round((longestDrySeconds / 3600) * 10) / 10
      : null,
    dry_interval_basis: "continuous_observed_data",
    largest_event: byTotal,
    longest_event: byDuration,
    highest_rate_event: byRate,
    events: [...inWindow]
      .sort((a,b) => b.start_epoch - a.start_epoch)
      .slice(0, 20)
  };
}

async function buildEvents(env) {
  const stats = await buildStats(env);
  const result = await env.DB.prepare(
    `SELECT day, high_c, low_c, peak_gust_kmh, rain_mm,
            lightning_strikes, lightning_nearest_km, lightning_last_epoch
     FROM ${DAILY_TABLE}
     ORDER BY day DESC
     LIMIT 730`
  ).all();

  const events = [];
  const add = (day, title, detail, type = "weather") => {
    const range = stationDayEpochRange(day);
    const epoch = range?.startEpoch ?? Date.parse(`${day}T00:00:00Z`) / 1000;
    events.push({ day, title, detail, received_at:new Date(epoch * 1000).toISOString(), epoch, type });
  };

  for (const row of result.results || []) {
    const rain = correctedRainForDay(row.day, row.rain_mm);
    let gust = nullableNumber(row.peak_gust_kmh);
    const high = nullableNumber(row.high_c);
    const low = nullableNumber(row.low_c);
    const strikes = nullableNumber(row.lightning_strikes);
    const nearest = nullableNumber(row.lightning_nearest_km);

    /*
     * Only days that could create a wind event pay the cost of a raw-row QC
     * check. This keeps the event diary consistent with today's and all-time
     * gust filtering without rescanning every archive day.
     */
    if (usableNumber(gust) && Number(gust) >= 50) {
      const validated = await validatedPeakGustForDay(env, row.day);
      gust = usableNumber(validated.peak_gust_kmh)
        ? Number(validated.peak_gust_kmh)
        : null;
    }

    if (usableNumber(strikes) && Number(strikes) > 0) {
      add(
        row.day,
        "Lightning detected",
        `${Math.round(Number(strikes))} strike${Number(strikes) === 1 ? "" : "s"}${usableNumber(nearest) ? ` · nearest ${round1(nearest)} km` : ""}`,
        "lightning"
      );
    }
    if (usableNumber(rain) && Number(rain) >= 10) {
      add(row.day, Number(rain) >= 25 ? "Very wet day" : "Wet day", `${round1(rain)} mm of rain`, "rain");
    }
    if (usableNumber(gust) && Number(gust) >= 50) {
      add(row.day, Number(gust) >= 70 ? "Very windy day" : "Windy day", `QC-checked peak gust ${round1(gust)} km/h`, "wind");
    }
    if (usableNumber(low) && Number(low) <= 0) {
      add(row.day, "Frost recorded", `Low temperature ${round1(low)}°C`, "temperature");
    }
  }

  const pushRecord = (title, detail, record) => {
    if (!record) return;
    events.push({
      title,
      detail,
      received_at: record.received_at || new Date(record.epoch * 1000).toISOString(),
      epoch: Number(record.epoch),
      day: stationDayKey(new Date(Number(record.epoch) * 1000)),
      type: "record"
    });
  };

  pushRecord("Warmest Parknacross reading", stats.records?.high_temperature ? `${round1(stats.records.high_temperature.value)}°C` : "", stats.records?.high_temperature);
  pushRecord("Coldest Parknacross reading", stats.records?.low_temperature ? `${round1(stats.records.low_temperature.value)}°C` : "", stats.records?.low_temperature);
  pushRecord("Strongest gust recorded", stats.records?.peak_gust ? `${round1(stats.records.peak_gust.value)} km/h` : "", stats.records?.peak_gust);

  if (stats.wettest_day) {
    add(stats.wettest_day.day, "Wettest day in the archive", `${round1(stats.wettest_day.rain_mm)} mm`, "record");
  }

  const first20Candidates = await env.DB.prepare(
    `SELECT epoch,received_at,temperature_c FROM ${TABLE}
     WHERE temperature_c >= 20 ORDER BY epoch ASC LIMIT 50`
  ).all();
  for (const candidate of first20Candidates.results || []) {
    if (!(await temperatureRecordIsOutlier(env, candidate))) {
      pushRecord("First 20°C reading", `${round1(candidate.temperature_c)}°C`, candidate);
      break;
    }
  }

  events.sort((a,b) => Number(b.epoch || 0) - Number(a.epoch || 0));

  const seen = new Set();
  const unique = events.filter(event => {
    const key = `${event.day}|${event.title}|${event.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { events: unique.slice(0, 80) };
}

async function buildReliability(env) {
  const latest = await getLatest(env);
  const nowEpoch = Math.floor(Date.now() / 1000);
  const expectedIntervalSeconds = 5 * 60;
  const today = stationDayKey(new Date());
  const monthStartDay = `${today.slice(0,7)}-01`;
  const monthRange = stationDayEpochRange(monthStartDay);
  const monthStartEpoch = monthRange?.startEpoch;

  /*
   * Reliability means coverage of the intended five-minute archive cadence,
   * not the number of raw rows received. Older Worker versions could save
   * more than one observation inside a five-minute period, which inflated
   * sample_count and produced impossible figures such as 2,212 of 1,654.
   * Count each five-minute time bucket once, regardless of how many raw
   * observations happen to exist inside that bucket. This is read-only and
   * does not alter or delete any historical weather data.
   */
  if (!Number.isFinite(monthStartEpoch)) {
    return {
      archive_reliability_percent: null,
      expected_interval_minutes: 5,
      actual_samples: 0,
      expected_samples: 0,
      period: "current month",
      label: "Building"
    };
  }

  const month = await env.DB.prepare(
    `SELECT MIN(epoch) AS first_epoch,
            MAX(epoch) AS last_epoch,
            COUNT(DISTINCT CAST((epoch - ?) / ? AS INTEGER)) AS archive_slots
     FROM ${TABLE}
     WHERE epoch >= ? AND epoch <= ?`
  ).bind(
    Number(monthStartEpoch),
    expectedIntervalSeconds,
    Number(monthStartEpoch),
    nowEpoch
  ).first();

  const periodStart = nullableNumber(month?.first_epoch);
  const latestEpoch = nullableNumber(latest?.epoch ?? month?.last_epoch);
  const actual = Number(month?.archive_slots || 0);

  if (!periodStart || actual <= 0) {
    return {
      archive_reliability_percent: null,
      expected_interval_minutes: 5,
      actual_samples: actual,
      expected_samples: 0,
      period: "current month",
      label: "Building"
    };
  }

  /*
   * Start the expectation at the first occupied five-minute bucket. This
   * avoids penalising the station for time before the first archive reading
   * of the month while still exposing genuine gaps after collection starts.
   */
  const firstBucket = Math.floor((periodStart - monthStartEpoch) / expectedIntervalSeconds);
  const currentBucket = Math.floor((nowEpoch - monthStartEpoch) / expectedIntervalSeconds);
  const expected = Math.max(1, currentBucket - firstBucket + 1);
  const percent = Math.min(100, (actual / expected) * 100);
  const label = percent >= 99 ? "Excellent" : percent >= 97 ? "Good" : percent >= 90 ? "Reduced" : "Needs attention";

  return {
    archive_reliability_percent: Math.round(percent * 10) / 10,
    expected_interval_minutes: 5,
    actual_samples: actual,
    expected_samples: expected,
    period: "current month",
    period_start_epoch: periodStart,
    latest_epoch: latestEpoch,
    counting_method: "unique_5_minute_slots",
    label
  };
}

function stationDaySqlExpression(firstDay, lastDay) {
  const summer=[];
  for(let year=Number(firstDay.slice(0,4));year<=Number(lastDay.slice(0,4));year++){
    const start=Date.parse(lastSundayDayKey(year,2)+"T01:00:00Z")/1000;
    const end=Date.parse(lastSundayDayKey(year,9)+"T01:00:00Z")/1000;
    summer.push(`(epoch >= ${start} AND epoch < ${end})`);
  }
  return `strftime('%Y-%m-%d', epoch + CASE WHEN ${summer.join(' OR ')} THEN 3600 ELSE 0 END, 'unixepoch')`;
}

async function buildArchiveCoverage(env, requestedDays = 371) {
  const today = stationDayKey(new Date());
  const cutoffDay = shiftDayKey(today, -(Math.max(1, requestedDays) - 1));
  const cutoffRange = stationDayEpochRange(cutoffDay);
  const nowEpoch = Math.floor(Date.now() / 1000);
  // Return one aggregate per Irish calendar day, not every saved observation.
  // Epoch remains indexed in WHERE; DST adjustment affects only the grouping.
  const result = await env.DB.prepare(
    `SELECT ${stationDaySqlExpression(cutoffDay,today)} AS day,
            COUNT(DISTINCT CAST(epoch / 300 AS INTEGER)) AS actual_slots,
            MIN(epoch) AS first_epoch
     FROM ${TABLE} WHERE epoch >= ? AND epoch <= ? GROUP BY day ORDER BY day`
  ).bind(Number(cutoffRange?.startEpoch || 0),nowEpoch).all();
  const firstStoredRow=await env.DB.prepare(`SELECT MIN(epoch) AS first_epoch FROM ${TABLE}`).first();
  const collectionFirstEpoch=nullableNumber(firstStoredRow?.first_epoch);
  const collectionFirstDay=collectionFirstEpoch===null?null:stationDayKey(new Date(collectionFirstEpoch*1000));
  const coverageStartDay=collectionFirstDay===null?shiftDayKey(today,1):collectionFirstDay<cutoffDay?cutoffDay:collectionFirstDay;
  const aggregates=new Map((result.results||[]).map(row=>[row.day,row]));
  const firstEpoch=result.results?.length?nullableNumber(result.results[0].first_epoch):null;

  const rows = [];
  let totalActual = 0;
  let totalExpected = 0;
  for (let day = coverageStartDay; day <= today; day = shiftDayKey(day,1)) {
    const aggregate = aggregates.get(day);
    const range = stationDayEpochRange(day);
    if (!range) continue;
    const actual = Number(aggregate?.actual_slots || 0);
    let startEpoch = Number(range.startEpoch);
    let endEpoch = day === today ? nowEpoch : Number(range.endEpoch);
    if (collectionFirstEpoch !== null && collectionFirstEpoch > startEpoch) startEpoch = collectionFirstEpoch;
    const firstBucket = Math.floor(startEpoch / 300);
    const lastBucket = Math.floor(Math.max(startEpoch, endEpoch - 1) / 300);
    const expected = Math.max(1, lastBucket - firstBucket + 1);
    const percent = Math.min(100, actual / expected * 100);
    totalActual += actual;
    totalExpected += expected;
    rows.push({
      day,
      actual_slots: actual,
      expected_slots: expected,
      coverage_percent: Math.round(percent * 10) / 10,
      full_day_expected_slots: Math.round((range.endEpoch-range.startEpoch)/300),
      day_in_progress: day === today,
      coverage_scope: collectionFirstEpoch !== null && collectionFirstEpoch > range.startEpoch && collectionFirstDay === day ? "since_first_observation" : day === today ? "day_so_far" : "full_day"
    });
  }

  return {
    counting_method: "unique_5_minute_slots",
    expected_interval_minutes: 5,
    days: rows,
    summary: {
      actual_slots: totalActual,
      expected_slots: totalExpected,
      coverage_percent: totalExpected ? Math.round(Math.min(100, totalActual / totalExpected * 100) * 10) / 10 : null,
      first_epoch: firstEpoch
    }
  };
}

async function buildLightning(env) {
  const latest = await getLatest(env);
  const today = stationDayKey(new Date());
  const daily = await env.DB.prepare(
    `SELECT lightning_strikes, lightning_nearest_km, lightning_last_epoch
     FROM ${DAILY_TABLE}
     WHERE day = ?
     LIMIT 1`
  ).bind(today).first();

  const recent = await env.DB.prepare(
    `SELECT MIN(CASE WHEN lightning_strikes > 0 AND lightning_distance_km > 0
                     THEN lightning_distance_km END) AS nearest_km,
            MAX(CASE WHEN lightning_strikes > 0 THEN lightning_time_epoch END) AS last_epoch,
            MAX(lightning_strikes) AS max_strikes
     FROM ${TABLE}
     WHERE epoch >= ?
       AND (lightning_distance_km IS NOT NULL OR lightning_strikes IS NOT NULL OR lightning_time_epoch IS NOT NULL)`
  ).bind(Math.floor(Date.now()/1000) - 86400).first();

  const rawCurrentDistance = nullableNumber(latest?.lightning_distance_km);
  const currentDistance = Number(latest?.lightning_strikes || 0) > 0 &&
    rawCurrentDistance !== null && rawCurrentDistance > 0 && rawCurrentDistance <= 40
      ? rawCurrentDistance
      : null;
  const strikesToday = nullableNumber(daily?.lightning_strikes ?? latest?.lightning_strikes);
  const dailyLastEpoch = usableNumber(strikesToday) && Number(strikesToday) > 0
    ? nullableNumber(daily?.lightning_last_epoch)
    : null;
  const latestLastEpoch = usableNumber(latest?.lightning_strikes) && Number(latest.lightning_strikes) > 0
    ? nullableNumber(latest?.lightning_time_epoch)
    : null;
  const lastEpoch = nullableNumber(dailyLastEpoch ?? recent?.last_epoch ?? latestLastEpoch);
  const nearestCandidate = nullableNumber(daily?.lightning_nearest_km ?? recent?.nearest_km ?? currentDistance);
  const nearest = nearestCandidate !== null && nearestCandidate > 0 && nearestCandidate <= 40
    ? nearestCandidate
    : null;

  const available = [currentDistance, strikesToday, lastEpoch, nearest].some(usableNumber);

  return {
    available,
    sensor_status: available ? "active" : "awaiting_sensor",
    distance_km: currentDistance,
    nearest_24h_km: nearest,
    strikes_today: strikesToday,
    last_strike_epoch: lastEpoch,
    last_strike_at: usableNumber(lastEpoch) ? new Date(Number(lastEpoch) * 1000).toISOString() : null
  };
}

async function buildDayDetail(env, url) {
  const day = String(url.searchParams.get("date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("A date in YYYY-MM-DD format is required");
  }

  const range = stationDayEpochRange(day);
  if (!range) throw new Error("Invalid station-local date");

  const [summary, readings] = await Promise.all([
    env.DB.prepare(
      `SELECT day, first_epoch, last_epoch, sample_count,
              high_c, low_c, peak_gust_kmh, rain_mm,
              CASE WHEN pressure_count > 0 THEN pressure_sum_hpa / pressure_count ELSE NULL END AS avg_pressure_hpa,
              solar_peak_w_m2, lightning_strikes, lightning_nearest_km, lightning_last_epoch
       FROM ${DAILY_TABLE}
       WHERE day = ?
       LIMIT 1`
    ).bind(day).first(),
    env.DB.prepare(
      `SELECT epoch, received_at, temperature_c, feels_like_c, humidity,
              dew_point_c, wind_speed_kmh, wind_gust_kmh, wind_direction_deg,
              pressure_hpa, rain_rate_mm_h, rain_daily_mm, solar_w_m2,
              uv_index, battery_v, lightning_distance_km,
              lightning_strikes, lightning_time_epoch
       FROM ${TABLE}
       WHERE epoch >= ? AND epoch < ?
       ORDER BY epoch ASC`
    ).bind(range.startEpoch, range.endEpoch).all()
  ]);

  // Keep the day-detail card in sync with /daily. That endpoint recalculates
  // today's extrema from the validated raw observations; the compact daily
  // row can lag by a tenth of a degree until its next aggregate update.
  const todayKey = stationDayKey(new Date());
  const validatedTemps = day === todayKey
    ? await validatedTemperatureExtremaForDay(env, day)
    : null;
  if (summary && validatedTemps) {
    if (usableNumber(validatedTemps.high_c)) summary.high_c = Number(validatedTemps.high_c);
    if (usableNumber(validatedTemps.low_c)) summary.low_c = Number(validatedTemps.low_c);
  }

  if (!summary && !(readings.results || []).length) {
    return { day, available:false, summary:null, readings:[] };
  }

  const rows = (readings.results || []).map(formatRow);
  const pressureValues = rows.map(row => row.pressure_hpa).filter(usableNumber).map(Number);
  const gustQuality = await revalidateDailyGustQuality(env, day);

  if (summary) {
    summary.peak_gust_kmh = usableNumber(gustQuality.peak_gust_kmh)
      ? Number(gustQuality.peak_gust_kmh)
      : null;
  }

  return {
    day,
    available:true,
    summary: summary ? {
      day: summary.day,
      sample_count: Number(summary.sample_count || rows.length || 0),
      high_c: nullableNumber(summary.high_c),
      low_c: nullableNumber(summary.low_c),
      peak_gust_kmh: nullableNumber(summary.peak_gust_kmh),
      gust_quality: {
        valid_count: gustQuality.valid_count,
        rejected_count: gustQuality.rejected_count
      },
      rain_mm: correctedRainForDay(day, summary.rain_mm),
      avg_pressure_hpa: nullableNumber(summary.avg_pressure_hpa),
      pressure_low_hpa: pressureValues.length ? Math.min(...pressureValues) : null,
      pressure_high_hpa: pressureValues.length ? Math.max(...pressureValues) : null,
      solar_peak_w_m2: nullableNumber(summary.solar_peak_w_m2),
      lightning_strikes: nullableNumber(summary.lightning_strikes),
      lightning_nearest_km: nullableNumber(summary.lightning_nearest_km),
      lightning_last_epoch: nullableNumber(summary.lightning_last_epoch)
    } : null,
    readings: rows
  };
}

async function buildBackupStatus(env) {
  const r2Configured = Boolean(env.BACKUPS && typeof env.BACKUPS.put === "function");
  const webhookUrl = await readSecret(env.BACKUP_WEBHOOK_URL);
  const webhookConfigured = /^https:\/\//i.test(webhookUrl);
  const configured = r2Configured || webhookConfigured;
  const rows = await env.DB.prepare(
    `SELECT key, value FROM ${META_TABLE}
     WHERE key IN ('backup_last_day','backup_last_success','backup_last_key','backup_last_error')`
  ).all();
  const meta = Object.fromEntries((rows.results || []).map(row => [row.key, row.value]));

  const targets = [];
  if (r2Configured) targets.push("Cloudflare R2");
  if (webhookConfigured) targets.push("external HTTPS webhook");

  return {
    configured,
    r2_configured: r2Configured,
    external_webhook_configured: webhookConfigured,
    target: targets.length ? targets.join(" + ") : "Not configured",
    last_backup_day: meta.backup_last_day || null,
    last_success: meta.backup_last_success || null,
    last_key: meta.backup_last_key || null,
    last_error: meta.backup_last_error || null
  };
}

function rowsToCsv(rows) {
  const headers = [
    "epoch","received_at","observation_time_ireland","temperature_c","feels_like_c","humidity","dew_point_c",
    "wind_speed_kmh","wind_gust_kmh","wind_direction_deg","pressure_hpa",
    "rain_rate_mm_h","rain_daily_mm","solar_w_m2","uv_index","battery_v",
    "soil_channel","soil_moisture_pct","soil_temperature_c","soil_ec_us_cm",
    "lightning_distance_km","lightning_strikes","lightning_last_strike_time_ireland"
  ];
  const irelandTime = epoch => {
    const value = Number(epoch);
    if (!Number.isFinite(value) || value <= 0) return "";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Dublin", hourCycle: "h23", year: "numeric",
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(new Date(value * 1000));
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
  };
  const esc = value => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
  };
  return [headers.join(","), ...rows.map(row => {
    const strikes = Number(row.lightning_strikes);
    const hasLightningEvent = Number.isFinite(strikes) && strikes > 0;
    const distance = Number(row.lightning_distance_km);
    const values = {
      ...row,
      observation_time_ireland: irelandTime(row.epoch),
      lightning_distance_km: hasLightningEvent && Number.isFinite(distance) && distance > 0 && distance <= 40 ? distance : "",
      lightning_strikes: hasLightningEvent ? Math.round(strikes) : "",
      lightning_last_strike_time_ireland: hasLightningEvent ? irelandTime(row.lightning_time_epoch) : ""
    };
    return headers.map(header => esc(values[header])).join(",");
  })].join("\n");
}

async function runDailyBackup(env) {
  const r2Configured = Boolean(env.BACKUPS && typeof env.BACKUPS.put === "function");
  const webhookUrl = await readSecret(env.BACKUP_WEBHOOK_URL);
  const webhookToken = await readSecret(env.BACKUP_WEBHOOK_TOKEN);
  const webhookConfigured = /^https:\/\//i.test(webhookUrl);

  if (!r2Configured && !webhookConfigured) return { configured:false };

  const today = stationDayKey(new Date());
  const day = shiftDayKey(today, -1);
  const last = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE} WHERE key = 'backup_last_day' LIMIT 1`
  ).first();

  if (last?.value === day) return { configured:true, skipped:true, day };

  try {
    const range = stationDayEpochRange(day);
    if (!range) throw new Error(`Invalid backup day: ${day}`);

    const result = await env.DB.prepare(
      `SELECT epoch,received_at,temperature_c,feels_like_c,humidity,dew_point_c,
              wind_speed_kmh,wind_gust_kmh,wind_direction_deg,pressure_hpa,
              rain_rate_mm_h,rain_daily_mm,solar_w_m2,uv_index,battery_v,
              lightning_distance_km,lightning_strikes,lightning_time_epoch,
              soil_channel,soil_moisture_pct,soil_temperature_c,soil_ec_us_cm
       FROM ${TABLE}
       WHERE epoch >= ? AND epoch < ?
       ORDER BY epoch ASC`
    ).bind(range.startEpoch, range.endEpoch).all();

    const rows = (result.results || []).map(row => ({
      ...row,
      rain_daily_mm: correctedRainForDay(day, row.rain_daily_mm)
    }));
    const csv = rowsToCsv(rows);
    const key = `daily/${day}.csv`;
    const targets = [];

    if (r2Configured) {
      await env.BACKUPS.put(key, csv, {
        httpMetadata: { contentType:"text/csv; charset=utf-8" },
        customMetadata: { station:"Parknacross Weather", day, rows:String(rows.length) }
      });
      targets.push("R2");
    }

    if (webhookConfigured) {
      const response = await fetch(webhookUrl, {
        method:"POST",
        headers:{
          "Content-Type":"text/csv; charset=utf-8",
          "X-Parknacross-Backup-Day":day,
          "X-Parknacross-Backup-Filename":`parknacross-weather-${day}.csv`,
          ...(webhookToken ? {"Authorization":`Bearer ${webhookToken}`} : {})
        },
        body:csv
      });
      if (!response.ok) throw new Error(`External backup HTTP ${response.status}`);
      targets.push("external webhook");
    }

    const now = new Date().toISOString();
    const targetText = `${key} · ${targets.join(" + ")}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (key,value) VALUES ('backup_last_day',?)`).bind(day),
      env.DB.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (key,value) VALUES ('backup_last_success',?)`).bind(now),
      env.DB.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (key,value) VALUES ('backup_last_key',?)`).bind(targetText),
      env.DB.prepare(`INSERT OR REPLACE INTO ${META_TABLE} (key,value) VALUES ('backup_last_error','')`)
    ]);
    return { configured:true, backed_up:true, day, key:targetText, rows:rows.length, targets };
  } catch (error) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ${META_TABLE} (key,value) VALUES ('backup_last_error',?)`
    ).bind(String(error?.message || error)).run();
    throw error;
  }
}

async function exportRows(env, days, range = null) {
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 365)));
  const cutoff = range?.startEpoch ?? (Math.floor(Date.now()/1000) - safeDays*86400);
  const pageSize = 1000;
  const maximumRows = 110000;
  const rows = [];

  /* Resolve the real archive bounds once. For a 90/365-day request against a
     younger archive, starting every page at the much older requested cutoff
     caused avoidable D1 work and could exhaust the Worker before it returned
     a response. All subsequent pages are restricted to existing epochs. */
  /* Resolve the physical archive bounds without applying a months-old cutoff
     to the bound queries. On a young archive, those wide predicates caused
     avoidable D1 work and Worker CPU exhaustion for the 90/365-day buttons. */
  const first = range
    ? await env.DB.prepare(`SELECT epoch FROM ${TABLE} WHERE epoch >= ? AND epoch < ? ORDER BY epoch ASC LIMIT 1`).bind(range.startEpoch, range.endExclusiveEpoch).first()
    : await env.DB.prepare(`SELECT epoch FROM ${TABLE} ORDER BY epoch ASC LIMIT 1`).first();
  const latest = range
    ? await env.DB.prepare(`SELECT epoch FROM ${TABLE} WHERE epoch >= ? AND epoch < ? ORDER BY epoch DESC LIMIT 1`).bind(range.startEpoch, range.endExclusiveEpoch).first()
    : await env.DB.prepare(`SELECT epoch FROM ${TABLE} ORDER BY epoch DESC LIMIT 1`).first();
  const firstEpoch = nullableNumber(first?.epoch);
  const latestEpoch = nullableNumber(latest?.epoch);
  if (firstEpoch === null || latestEpoch === null || latestEpoch < cutoff) return [];
  let cursor = Math.max(cutoff - 1, firstEpoch - 1);

  /* Explicit keyset pagination is essential here. A single large D1 result
     can stop before the newest records under platform execution/serialization
     limits. That made long exports contain only pre-WH52/WH57 observations. */
  while (rows.length < maximumRows) {
    const result = await env.DB.prepare(
      `SELECT epoch,received_at,temperature_c,feels_like_c,humidity,dew_point_c,
              wind_speed_kmh,wind_gust_kmh,wind_direction_deg,pressure_hpa,
              rain_rate_mm_h,rain_daily_mm,solar_w_m2,uv_index,battery_v,
              lightning_distance_km,lightning_strikes,lightning_time_epoch,
              soil_channel,soil_moisture_pct,soil_temperature_c,soil_ec_us_cm
       FROM ${TABLE}
       WHERE epoch > ? AND epoch <= ?
       ORDER BY epoch ASC
       LIMIT ?`
    ).bind(cursor, latestEpoch, pageSize).all();
    const page = result.results || [];
    if (!page.length) break;
    rows.push(...page);
    const nextCursor = Number(page.at(-1)?.epoch);
    if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
      throw new Error("CSV pagination did not advance");
    }
    cursor = nextCursor;
    /* Never infer end-of-data from page length. D1 may return fewer rows than
       requested under platform serialization limits. The empty page on the
       next cursor is the only reliable completion signal. */
  }

  if (rows.length >= maximumRows) {
    throw new Error("CSV export exceeded the supported observation limit");
  }

  /* Final completeness guard: the last exported epoch must be the latest
     archived epoch inside the requested window. Fail loudly instead of
     silently offering a CSV that omits recent sensor readings. */
  const exportedEpoch = nullableNumber(rows.at(-1)?.epoch);
  if (latestEpoch !== null && exportedEpoch !== latestEpoch) {
    throw new Error(`CSV export incomplete: newest archive epoch ${latestEpoch} was not reached`);
  }

  return rows.map(row => ({
    ...row,
    rain_daily_mm: correctedRainForDay(stationDayKey(new Date(Number(row.epoch) * 1000)), row.rain_daily_mm)
  }));
}

function exportCsv(rows, days = 365, forceFresh = false, range = null) {
  /* Put recent WH52/lightning-capable observations at the top of a public
     download. Daily backup files remain chronological because they call
     rowsToCsv directly. */
  const text = rowsToCsv([...rows].reverse());
  const filenameRange = range ? `${range.from}-to-${range.to}` : `${days}-days`;
  return new Response(text, {
    status: 200,
    headers: {
      ...BASE_CORS_COMPAT(),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="parknacross-weather-${filenameRange}.csv"`,
      "Cache-Control": forceFresh ? "no-store" : "public, max-age=300",
      "X-Parknacross-Export-Max-Days": "365"
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
  // The Met Éireann report heading publishes a report date and local time.
  // This is the report's time, not a guarantee of the individual station's
  // measurement time. Do not substitute the HTTP retrieval time for it.
  const reportHeading = stripHtml(html).match(
    /Latest\s+Weather\s+Reports\s+on\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+FOR\s+(\d{1,2}):(\d{2})/i
  );
  let reportTime = null;
  if (reportHeading) {
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const month = months[reportHeading[2].toLowerCase()];
    if (month !== undefined) {
      const year = Number(reportHeading[3]), day = Number(reportHeading[1]);
      const hour = Number(reportHeading[4]), minute = Number(reportHeading[5]);
      const localAsUtc = Date.UTC(year, month, day, hour, minute);
      const validDate = new Date(localAsUtc);
      if (validDate.getUTCFullYear() === year && validDate.getUTCMonth() === month &&
          validDate.getUTCDate() === day && hour < 24 && minute < 60) {
        const tzLabel = new Intl.DateTimeFormat('en-GB', {
          timeZone: STATION_TIME_ZONE, timeZoneName: 'shortOffset'
        }).formatToParts(new Date(localAsUtc)).find(p => p.type === 'timeZoneName')?.value || 'GMT';
        const offsetMatch = tzLabel.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
        const minutes = offsetMatch
          ? (offsetMatch[1] === '-' ? -1 : 1) * (Number(offsetMatch[2])*60 + Number(offsetMatch[3]||0))
          : 0;
        reportTime = new Date(localAsUtc - minutes*60000).toISOString();
      }
    }
  }

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
    report_time: reportTime,
    report_time_note: "Met Éireann report time; an individual station observation may be older.",
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

function pointForecastRainTotal(periods, range) {
  if (!range || !periods.length) return { total_mm: 0, basis: "none", periods_used: 0 };

  const valid = periods
    .filter(period =>
      Number.isFinite(period.from) &&
      Number.isFinite(period.to) &&
      period.to > period.from &&
      period.to > range.startEpoch * 1000 &&
      period.from < range.endEpoch * 1000 &&
      usableNumber(period.value)
    )
    .map(period => ({
      ...period,
      duration_hours: (period.to - period.from) / 3600000
    }));

  /*
   * The Met.no-style feed commonly publishes overlapping 1h, 3h and 6h
   * precipitation totals. Summing all of them double-counts rain. Prefer the
   * non-overlapping hourly periods when available.
   */
  const hourly = valid
    .filter(period => period.duration_hours >= 0.75 && period.duration_hours <= 1.25)
    .sort((a, b) => a.from - b.from);

  if (hourly.length) {
    const seen = new Set();
    let total = 0;
    let used = 0;
    for (const period of hourly) {
      const key = `${period.from}|${period.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += Number(period.value);
      used += 1;
    }
    return { total_mm: round1(total), basis: "non_overlapping_hourly_periods", periods_used: used };
  }

  /*
   * Fallback for feeds without hourly precipitation: choose the shortest
   * available non-overlapping periods in chronological order. This is more
   * conservative than adding overlapping accumulation windows.
   */
  const selected = [];
  for (const period of [...valid].sort((a, b) =>
    (a.duration_hours - b.duration_hours) || (a.from - b.from)
  )) {
    const overlaps = selected.some(existing =>
      period.from < existing.to && period.to > existing.from
    );
    if (!overlaps) selected.push(period);
  }

  const total = selected.reduce((sumValue, period) => sumValue + Number(period.value), 0);
  return {
    total_mm: round1(total),
    basis: selected.length ? "shortest_non_overlapping_periods" : "none",
    periods_used: selected.length
  };
}

async function getPointForecast(env, options = {}) {
  const xml = await fetchMetEireannPointForecastXml();

  const blocks = [...xml.matchAll(/<time[^>]*from="([^"]+)"[^>]*to="([^"]+)"[^>]*>([\s\S]*?)<\/time>/gi)];
  const key = shiftDayKey(stationDayKey(new Date()), 1);
  const range = stationDayEpochRange(key);
  const temps = [];
  const precipitationPeriods = [];

  for (const b of blocks) {
    const from = Date.parse(b[1]);
    const to = Date.parse(b[2]);
    const body = b[3];
    if (!Number.isFinite(from) || !Number.isFinite(to) || !range) continue;

    const inTargetDay = from >= range.startEpoch * 1000 && from < range.endEpoch * 1000;
    const temp = body.match(/<temperature[^>]*value="([^"]+)"/i);
    if (inTargetDay && temp && Number.isFinite(Number(temp[1]))) {
      temps.push(Number(temp[1]));
    }

    const precip = body.match(/<precipitation[^>]*value="([^"]+)"/i);
    if (precip && Number.isFinite(Number(precip[1]))) {
      precipitationPeriods.push({
        from,
        to,
        value: Number(precip[1])
      });
    }
  }

  const rainSummary = pointForecastRainTotal(precipitationPeriods, range);
  const captureBasis = options.captureBasis || null;
  const summary = {
    target_day: key,
    forecast_high_c: temps.length ? Math.max(...temps) : null,
    forecast_low_c: temps.length ? Math.min(...temps) : null,
    forecast_rain_mm: rainSummary.total_mm,
    rain_aggregation_basis: rainSummary.basis,
    rain_periods_used: rainSummary.periods_used,
    captured_at: new Date().toISOString(),
    capture_basis: captureBasis
  };

  if (env && options.persist === true) {
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
    ).bind(
      key,
      summary.captured_at,
      summary.forecast_high_c,
      summary.forecast_low_c,
      summary.forecast_rain_mm,
      JSON.stringify(summary)
    ).run();
  }

  return summary;
}

async function maybeCaptureDailyForecastSnapshot(env) {
  const clock = stationClockParts(new Date());

  /*
   * Verification must compare like with like. Capture tomorrow's point
   * forecast on the first successful scheduled run between 07:00 and 10:00
   * local time. The wider retry window avoids losing an entire day's snapshot
   * after a transient cron/upstream failure while still keeping a consistent
   * morning lead time.
   */
  if (clock.hour < 7 || clock.hour >= 10) {
    return { captured: false, reason: "outside_capture_window" };
  }

  const targetDay = shiftDayKey(stationDayKey(new Date()), 1);
  const existing = await env.DB.prepare(
    `SELECT raw_json FROM forecast_snapshots_v2 WHERE target_day = ? LIMIT 1`
  ).bind(targetDay).first();

  if (existing?.raw_json) {
    try {
      const parsed = JSON.parse(existing.raw_json);
      if (parsed?.capture_basis === FORECAST_VERIFY_CAPTURE_BASIS) {
        return { captured: false, reason: "already_captured", target_day: targetDay };
      }
    } catch (_) {}
  }

  const snapshot = await getPointForecast(env, {
    persist: true,
    captureBasis: FORECAST_VERIFY_CAPTURE_BASIS
  });
  return { captured: true, target_day: snapshot.target_day, captured_at: snapshot.captured_at };
}

async function buildForecastVerification(env) {
  const today = stationDayKey(new Date());
  const cutoffDay = shiftDayKey(today, -14);
  const snaps = await env.DB.prepare(
    `SELECT * FROM forecast_snapshots_v2
     WHERE target_day >= ?
     ORDER BY target_day DESC
     LIMIT 30`
  ).bind(cutoffDay).all();

  const comparisons = [];
  const pending = [];

  for (const s of snaps.results || []) {
    let snapshotMeta = null;
    try { snapshotMeta = s.raw_json ? JSON.parse(s.raw_json) : null; } catch (_) {}

    /*
     * Older snapshots could have been overwritten by arbitrary page visits.
     * Exclude them so verification only compares forecasts captured at the
     * defined morning lead time.
     */
    if (snapshotMeta?.capture_basis !== FORECAST_VERIFY_CAPTURE_BASIS) continue;

    if (String(s.target_day) >= String(today)) {
      pending.push({
        target_day: s.target_day,
        captured_at: s.captured_at,
        capture_basis: FORECAST_VERIFY_CAPTURE_BASIS,
        forecast_high_c: nullableNumber(s.forecast_high_c),
        forecast_low_c: nullableNumber(s.forecast_low_c),
        forecast_rain_mm: nullableNumber(s.forecast_rain_mm),
        rain_aggregation_basis: snapshotMeta?.rain_aggregation_basis || null
      });
      continue;
    }

    const actual = await env.DB.prepare(
      `SELECT high_c, low_c, rain_mm
       FROM ${DAILY_TABLE}
       WHERE day = ?
       LIMIT 1`
    ).bind(s.target_day).first();

    const rain = correctedRainForDay(s.target_day, actual?.rain_mm);
    comparisons.push({
      target_day:s.target_day,
      captured_at:s.captured_at,
      capture_basis:FORECAST_VERIFY_CAPTURE_BASIS,
      forecast_high_c:nullableNumber(s.forecast_high_c),
      forecast_low_c:nullableNumber(s.forecast_low_c),
      forecast_rain_mm:nullableNumber(s.forecast_rain_mm),
      rain_aggregation_basis:snapshotMeta?.rain_aggregation_basis || null,
      actual_high_c:nullableNumber(actual?.high_c),
      actual_low_c:nullableNumber(actual?.low_c),
      actual_rain_mm:rain,
      high_error_c: usableNumber(actual?.high_c) && usableNumber(s.forecast_high_c) ? round1(Number(actual.high_c)-Number(s.forecast_high_c)) : null,
      low_error_c: usableNumber(actual?.low_c) && usableNumber(s.forecast_low_c) ? round1(Number(actual.low_c)-Number(s.forecast_low_c)) : null
    });

    if (comparisons.length >= 7) break;
  }

  const clock = stationClockParts(new Date());
  const nextCaptureDay = clock.hour >= 10 ? shiftDayKey(today, 1) : today;
  const nextTargetDay = shiftDayKey(nextCaptureDay, 1);
  const status = comparisons.length
    ? "comparison_available"
    : pending.length
      ? "snapshot_pending_actual"
      : "awaiting_first_snapshot";

  return {
    capture_basis: FORECAST_VERIFY_CAPTURE_BASIS,
    status,
    comparisons,
    pending,
    next_capture_day: nextCaptureDay,
    next_target_day: nextTargetDay,
    capture_window_local: "07:00–10:00 Europe/Dublin"
  };
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
    .replace(/&deg;/gi, "°")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " ";
    })
    .replace(/&#x([\da-f]+);/gi, (_, code) => {
      const value = parseInt(code, 16);
      return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " ";
    });
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
      headline: `${match[1]} warning${String(match[2] || "").trim() ? ` ${String(match[2] || "").trim()}` : ""}`.trim(),
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
   * The EI811 page is specifically for Wicklow Head → Carnsore Point.
   * Parse that sector block FIRST and treat it as authoritative, including
   * when it explicitly says there is no warning in operation. This prevents
   * a warning for another Irish coastal sector from leaking into the
   * Parknacross/North Wexford card via the page's general Marine Warnings list.
   */
  const localSection = extractNamedTextSection(
    text,
    `${LOCAL_MARINE_SECTOR} Warnings`,
    ["Weather Warnings", "Environmental Advisories", "Marine Warnings"]
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

  /*
   * Fallback only if the sector-specific block cannot be found/parsed.
   * Do not allow a generic warning for another named coastal sector to be
   * presented as a North Wexford warning.
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

  if (marineParsed.parsed) {
    const warnings = (marineParsed.warnings || []).filter(warning => {
      const headline = String(warning?.headline || "").toLowerCase();
      if (!headline) return false;
      if (/all (irish )?(coasts|coastal waters|sea areas)/i.test(headline)) return true;
      return headline.includes("wicklow head") && headline.includes("carnsore point");
    });

    return {
      parsed: true,
      day_scope: dayScope,
      url,
      warnings
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

function marineLocalTimeToIso(value) {
  const text = cleanMetText(value);
  const match = text.match(/(\d{1,2}:\d{2}),?\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (!match) return null;
  const epoch = parseMetIssuedTime(`${match[2]} ${match[1]}`);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

function parseMarineForecastHtml(html) {
  const source = String(html || "");
  const localBlocks = [];
  const blockRe = /<div\b[^>]*class=["'][^"']*\bsea-area-short-coastal\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let block;

  while ((block = blockRe.exec(source))) {
    const markup = block[1];
    const heading = markup.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    const areaName = heading ? cleanMetText(heading[1]) : "";
    const field = label => {
      const pattern = new RegExp(`<p\\b[^>]*>\\s*<strong>\\s*${label}:\\s*<\\/strong>([\\s\\S]*?)<\\/p>`, "i");
      const match = markup.match(pattern);
      return match ? cleanMetText(match[1]) : null;
    };
    if (!areaName) continue;
    localBlocks.push({ area: areaName.replace(/^Forecast for\s+/i, ""), wind: field("Wind"), weather: field("Weather"), visibility: field("Visibility") });
  }

  const outlookBlock = source.match(/<div\b[^>]*class=["'][^"']*\bsea-area-outlook\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const outlookText = outlookBlock
    ? (outlookBlock[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "")
    : "";
  const issuedText = outlookBlock
    ? (outlookBlock[1].match(/Forecast issued at:\s*([^<]+)/i)?.[1] || "")
    : "";
  const validText = source.match(/Forecast valid from:\s*([^<]+)/i)?.[1] || "";
  const issued = marineLocalTimeToIso(issuedText);
  const untilText = validText.match(/\buntil\s+(.+)$/i)?.[1] || "";
  const until = marineLocalTimeToIso(untilText);
  const warningText = className => {
    const pattern = new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "i");
    const match = source.match(pattern);
    return match ? htmlToPlainText(match[1]) : "";
  };
  const smallCraftText = warningText("sea-area-small-craft-warnings");
  const galeText = warningText("sea-area-small-gale-warnings");
  const sea = {
    issued,
    until,
    "gale-warning": galeText && !/\bnil\b|no warnings/i.test(galeText) ? "yes" : "no",
    "small-craft-warning": smallCraftText && !/\bnil\b|no warnings/i.test(smallCraftText) ? "yes" : "no",
    areas: localBlocks,
    outlook: { text: cleanMetText(outlookText) || null }
  };

  if (!issued || !until || !localBlocks.length || !sea.outlook.text) {
    throw new Error("Met Éireann live marine page did not contain a complete forecast");
  }
  return sea;
}

function validateMarineForecast(sea, sourceName) {
  if (!sea || !Array.isArray(sea.areas)) throw new Error(`${sourceName} marine data has no forecast areas`);
  const issuedMs = parseMetIssuedTime(sea.issued);
  if (!Number.isFinite(issuedMs)) throw new Error(`${sourceName} marine issue time is missing or unreadable`);
  const ageHours = (Date.now() - issuedMs) / 3_600_000;
  if (ageHours > 24) throw new Error(`${sourceName} marine forecast is stale (${ageHours.toFixed(1)} hours old)`);
  if (ageHours < -6) throw new Error(`${sourceName} marine forecast issue time is unexpectedly in the future`);
  const untilMs = parseMetIssuedTime(sea.until);
  if (Number.isFinite(untilMs) && untilMs < Date.now() - 60 * 60_000) {
    throw new Error(`${sourceName} marine forecast has expired`);
  }
  const local = findEastCoastMarineArea(sea.areas);
  if (!local || !local.wind || !local.weather || !local.visibility) {
    throw new Error(`${sourceName} marine forecast has no complete Irish Sea area`);
  }
  return { sea, local };
}

const MARINE_FEED_TIMEOUT_MS = 4500;

async function getMarineForecastFeed() {
  const errors = [];
  try {
    const response = await fetchWithTimeout(
      "https://www.met.ie/Open_Data/json/Met-Sea-area.json",
      { headers: { "Accept": "application/json", "Cache-Control": "no-cache", "User-Agent": "ParknacrossWeather/1.0" } },
      MARINE_FEED_TIMEOUT_MS
    );
    if (!response.ok) throw new Error(`Met Éireann marine JSON HTTP ${response.status}`);
    const raw = await response.json();
    const checked = validateMarineForecast(raw?.["sea-area-forecast"], "Met Éireann JSON");
    return { ...checked, source: "Met Éireann Open Data JSON" };
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  try {
    const { response, text } = await fetchTextWithTimeout(
      "https://www.met.ie/forecasts/marine-inland-lakes/sea-area-forecast",
      { headers: { "Accept": "text/html,application/xhtml+xml", "Cache-Control": "no-cache", "User-Agent": "ParknacrossWeather/1.0" } },
      MARINE_FEED_TIMEOUT_MS
    );
    if (!response.ok) throw new Error(`Met Éireann live marine page HTTP ${response.status}`);
    const sea = parseMarineForecastHtml(text);
    const checked = validateMarineForecast(sea, "Met Éireann live page");
    return { ...checked, source: "Met Éireann live sea-area page" };
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  throw new Error(`Met Éireann marine feeds failed: ${errors.join("; ")}`);
}

async function fetchLocalMarineWarningPage(dayScope) {
  const url = `https://www.met.ie/warnings/${dayScope}/marine/${LOCAL_MARINE_WARNING_CODE}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "ParknacrossWeather/1.0"
    }
  }, MARINE_FEED_TIMEOUT_MS);

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
  const [feedResult, todayResult, tomorrowResult] = await Promise.all([
    getMarineForecastFeed(),
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

  const { sea, local } = feedResult;

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
    local_warning_onset: parseWarningValidity(primaryWarning?.valid_text).onset,
    local_warning_expires: parseWarningValidity(primaryWarning?.valid_text).expires,
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
    outlook: sea.outlook || null,
    forecast_source: feedResult.source
  };
}

const MARINE_UPSTREAM_TIMEOUT_MS = 9000;

async function fetchWithTimeout(input, init = {}, timeoutMs = MARINE_UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`Marine data request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(input, init = {}, timeoutMs = MARINE_UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (timedOut) throw new Error(`Marine data request timed out after ${timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getTides(url) {
  const station = url.searchParams.get("station") || "Arklow";
  const start = new Date();
  start.setUTCHours(0,0,0,0);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(start.getTime()+6*86400000);

  const q = new URL("https://erddap.marine.ie/erddap/tabledap/IMI_TidePrediction_HighLow.csv");
  q.search = `?stationID,time,tide_time_category,Water_Level_ODMalin&stationID="${encodeURIComponent(station)}"&time>=${start.toISOString()}&time<=${end.toISOString()}`;

  try {
    // The main Marine Institute ERDDAP has recently stalled for >50s on this
    // dataset. Fail over quickly to its official tide-prediction web app.
    const { response, text: csv } = await fetchTextWithTimeout(q.toString(), {
      headers:{ "Accept":"text/csv" }
    }, 1800);
    if (!response.ok) throw new Error(`Marine Institute tides HTTP ${response.status}`);
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
    if (events.length) return { station, events };
    throw new Error("Marine Institute tides returned no events");
  } catch (error) {
    console.warn("ERDDAP tide query failed; using official tide prediction page:", error);
    return await getOfficialTidePredictions(station, start);
  }
}

async function getOfficialTidePredictions(station, rangeStart) {
  // The official tide page supplies predicted water level every five minutes.
  // Select a date three days after our range start to get the matching six-day
  // window, then reduce the series to its significant local high/low points.
  const supportedLabels = station === "Arklow" || station === "OPW Arklow Harbour"
    ? ["OPW Arklow Harbour", "Arklow"]
    : [];
  if (!supportedLabels.length) throw new Error(`Official tide fallback does not support station ${station}`);

  const endpoint = "https://tidalpredictions.marine.ie/TidePredictions.aspx";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const page = await fetch(endpoint, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-IE,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; ParknacrossWeather/1.0)"
      },
      signal: controller.signal
    });
    if (!page.ok) throw new Error(`Official tide page HTTP ${page.status}`);
    const html = await page.text();

    // Resolve the site's current option value from its own form. These values
    // are implementation details and can change; a stale hard-coded ID makes
    // ASP.NET reject the postback with HTTP 500.
    let siteId = null;
    for (const match of html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const label = decodeBasicHtml(match[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
      if (!supportedLabels.includes(label)) continue;
      const valueMatch = match[1].match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (valueMatch) siteId = decodeBasicHtml(valueMatch[1] ?? valueMatch[2] ?? valueMatch[3]);
      break;
    }
    if (!siteId) throw new Error(`Official tide page has no matching site option for ${station}`);

    const fields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
    const hidden = {};
    for (const field of fields) {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const input = html.match(new RegExp(`<input\\b(?=[^>]*\\bname=["']${escaped}["'])[^>]*>`, "i"));
      const value = input?.[0].match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      if (!value) throw new Error(`Official tide page missing ${field}`);
      hidden[field] = decodeBasicHtml(value[1] ?? value[2] ?? "");
    }

    // ASP.NET may bind the view state to a session cookie issued by the GET.
    // Carry that cookie through with the postback.
    let setCookies = [];
    if (typeof page.headers.getSetCookie === "function") setCookies = page.headers.getSetCookie();
    else if (typeof page.headers.getAll === "function") setCookies = page.headers.getAll("Set-Cookie");
    else {
      const singleCookie = page.headers.get("Set-Cookie");
      if (singleCookie) setCookies = [singleCookie];
    }
    const cookieHeader = setCookies.map(value => value.split(";", 1)[0]).filter(Boolean).join("; ");

    const selectedDate = new Date(rangeStart.getTime() + 3 * 86400000);
    const dateText = `${String(selectedDate.getUTCDate()).padStart(2,"0")}/${String(selectedDate.getUTCMonth()+1).padStart(2,"0")}/${selectedDate.getUTCFullYear()}`;
    const form = new URLSearchParams({
      ...hidden,
      lstSites: siteId,
      SelectedDateTime: dateText,
      btnGetPredictions: "Get Predictions"
    });
    const result = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-IE,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://tidalpredictions.marine.ie",
        "Referer": endpoint,
        "User-Agent": "Mozilla/5.0 (compatible; ParknacrossWeather/1.0)",
        ...(cookieHeader ? { "Cookie": cookieHeader } : {})
      },
      body: form.toString(),
      signal: controller.signal
    });
    const resultHtml = await result.text();
    if (!result.ok) {
      const detail = htmlToPlainText(resultHtml).slice(0, 240);
      throw new Error(`Official tide prediction HTTP ${result.status}${detail ? `: ${detail}` : ""}`);
    }

    const samples = [];
    const rowPattern = /<td[^>]*>(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})<\/td>\s*<td[^>]*>(-?[\d.]+)<\/td>/g;
    let row;
    while ((row = rowPattern.exec(resultHtml)) !== null) {
      const parts = row[1].match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
      const height = Number(row[2]);
      if (!parts || !Number.isFinite(height)) continue;
      const time = new Date(Date.UTC(Number(parts[3]), Number(parts[2])-1, Number(parts[1]), Number(parts[4]), Number(parts[5]), Number(parts[6])));
      samples.push({ time, height });
    }
    if (samples.length < 100) throw new Error("Official tide page returned too few water-level samples");

    const candidates = [];
    const meanHeight = (from, to) => {
      let total = 0;
      for (let j = from; j <= to; j++) total += samples[j].height;
      return total / (to - from + 1);
    };
    // Compare 30-minute-smoothed levels either side to identify real turning
    // points, then require a meaningful change across one hour to filter
    // small five-minute ripples.
    for (let i = 12; i < samples.length - 12; i++) {
      const current = samples[i];
      const center = meanHeight(i - 3, i + 3);
      const left = meanHeight(i - 9, i - 3);
      const right = meanHeight(i + 3, i + 9);
      const before = samples[i - 12].height;
      const after = samples[i + 12].height;
      let type = null;
      if (center >= left && center >= right && center - before >= 0.025 && center - after >= 0.025) type = "high";
      if (center <= left && center <= right && before - center >= 0.025 && after - center >= 0.025) type = "low";
      if (!type) continue;

      candidates.push({
        epoch: current.time.getTime(),
        station,
        // Keep the official page's displayed clock time as a local ISO value;
        // consumers can render it in the same Europe/Dublin context.
        time: `${current.time.getUTCFullYear()}-${String(current.time.getUTCMonth()+1).padStart(2,"0")}-${String(current.time.getUTCDate()).padStart(2,"0")}T${String(current.time.getUTCHours()).padStart(2,"0")}:${String(current.time.getUTCMinutes()).padStart(2,"0")}:${String(current.time.getUTCSeconds()).padStart(2,"0")}`,
        type,
        height_m: current.height
      });
    }

    const events = [];
    for (const candidate of candidates) {
      const previous = events[events.length - 1];
      if (previous && candidate.epoch - previous.epoch < 90 * 60000) {
        if (previous.type !== candidate.type) continue;
        const isMoreExtreme = candidate.type === "high"
          ? candidate.height_m > previous.height_m
          : candidate.height_m < previous.height_m;
        if (isMoreExtreme) events[events.length - 1] = candidate;
      } else {
        events.push(candidate);
      }
    }
    if (!events.length) throw new Error("Could not derive high/low tides from official water-level samples");
    return { station, events: events.map(({ epoch, ...event }) => event) };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Official tide prediction request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
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


async function getMarineInstituteM2SeaTemperature() {
  try {
    return await getMarineInstituteM2SeaTemperatureErddap();
  } catch (error) {
    console.warn("Marine Institute ERDDAP M2 query failed; trying Met Éireann buoy API:", error);
    return await getMetEireannM2SeaTemperature();
  }
}

async function getMarineInstituteM2SeaTemperatureErddap() {
  /*
   * Primary sea-temperature source: Marine Institute M2 buoy.
   * M2 is a real moored instrument in the Irish Sea, so this is an observed
   * sea-surface temperature rather than a model estimate.  We deliberately
   * request the last 48 hours and select the newest usable row ourselves,
   * avoiding reliance on ERDDAP orderBy syntax and allowing simple freshness
   * checks before the value is presented as "current".
   */
  const endpoint = new URL(
    "https://erddap.marine.ie/erddap/tabledap/IWBNetwork.csv"
  );
  endpoint.search =
    '?station_id,time,longitude,latitude,SeaTemperature,QC_Flag' +
    '&station_id="M2"' +
    '&time>=now-48hours';

  const { response, text } = await fetchTextWithTimeout(endpoint.toString(), {
    headers: { "Accept": "text/csv" }
  }, 1800);

  if (!response.ok) {
    throw new Error(`Marine Institute M2 buoy HTTP ${response.status}`);
  }

  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const candidates = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 6) continue;

    const stationId = String(cols[0] || "").trim();
    const time = String(cols[1] || "").trim();
    const longitude = nullableNumber(cols[2]);
    const latitude = nullableNumber(cols[3]);
    const value = nullableNumber(cols[4]);
    const qualityFlag = String(cols[5] || "").trim();
    const epoch = Date.parse(time);

    if (stationId !== "M2") continue;
    if (!Number.isFinite(epoch)) continue;
    if (value === null || value < -5 || value > 35) continue;
    if (qualityFlag === "9") continue; // SeaDataNet missing-value flag.

    candidates.push({
      epoch,
      time,
      longitude,
      latitude,
      value,
      qualityFlag: qualityFlag || null
    });
  }

  if (!candidates.length) {
    throw new Error("Marine Institute M2 buoy sea-temperature value unavailable");
  }

  candidates.sort((a, b) => b.epoch - a.epoch);
  const latest = candidates[0];
  const ageMinutes = Math.max(0, (Date.now() - latest.epoch) / 60000);

  // Do not describe an old buoy observation as current.  If the feed has not
  // updated within 12 hours, fall through to the model sources below.
  if (ageMinutes > 12 * 60) {
    throw new Error(`Marine Institute M2 buoy observation is stale (${Math.round(ageMinutes)} min old)`);
  }

  return {
    sea_surface_temperature_c: latest.value,
    observation_time: latest.time,
    // Kept for backwards compatibility with the existing coast.js display.
    model_time: latest.time,
    timestamp: latest.time,
    latitude: latest.latitude,
    longitude: latest.longitude,
    station_id: "M2",
    quality_flag: latest.qualityFlag,
    observation_age_minutes: Math.round(ageMinutes),
    source: "Marine Institute M2 buoy",
    source_short: "M2 buoy",
    source_type: "observation",
    location_label: "M2 buoy · Irish Sea",
    licence: "CC BY 4.0"
  };
}

async function getMetEireannM2SeaTemperature() {
  const endpoint = "https://www.met.ie/api/seaarea/buoys/m2/meteogram";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(endpoint, {
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Met Éireann M2 buoy HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Met Éireann M2 buoy returned an invalid response");

    const candidates = [];
    for (const row of rows) {
      if (String(row?.name || "").trim().toUpperCase() !== "M2") continue;
      const value = nullableNumber(row?.seaTemp);
      if (value === null || value < -5 || value > 35) continue;
      const reportDate = String(row?.reportDate || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const timeParts = String(row?.time || "").match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{1,2}):(\d{2})$/);
      if (!reportDate || !timeParts) continue;
      const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
      const month = monthNames.indexOf(timeParts[2].toLowerCase());
      if (month < 0) continue;
      let year = Number(reportDate[3]);
      const reportMonth = Number(reportDate[2]) - 1;
      if (month - reportMonth > 6) year--;
      else if (reportMonth - month > 6) year++;
      const timestamp = new Date(Date.UTC(
        year, month, Number(timeParts[1]), Number(timeParts[3]), Number(timeParts[4])
      ));
      if (!Number.isFinite(timestamp.getTime())) continue;
      candidates.push({ value, timestamp });
    }
    candidates.sort((a, b) => b.timestamp - a.timestamp);
    const latest = candidates[0];
    if (!latest) throw new Error("Met Éireann M2 buoy has no usable sea-temperature observation");

    const ageMinutes = Math.max(0, (Date.now() - latest.timestamp.getTime()) / 60000);
    if (ageMinutes > 12 * 60) {
      throw new Error(`Met Éireann M2 buoy observation is stale (${Math.round(ageMinutes)} min old)`);
    }
    const time = latest.timestamp.toISOString();
    return {
      sea_surface_temperature_c: latest.value,
      observation_time: time,
      model_time: time,
      timestamp: time,
      latitude: 53.48,
      longitude: -5.425,
      station_id: "M2",
      quality_flag: null,
      observation_age_minutes: Math.round(ageMinutes),
      source: "Met Éireann M2 buoy report",
      source_short: "M2 buoy · Met Éireann",
      source_type: "observation",
      location_label: "M2 buoy · Irish Sea"
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Met Éireann M2 buoy request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getMarineInstituteNeatlSeaTemperature() {
  /*
   * Local Marine Institute NEATL model estimate.
   *
   * IMPORTANT: do not use ERDDAP's [(last)] selector here. NEATL contains
   * forecast timesteps beyond the present, so [(last)] can return a value
   * several days in the future and make it look like the current sea
   * temperature. Instead request the current UTC hour explicitly. The model
   * has an hourly time axis, so this selects the timestep representing now,
   * not the end of the forecast run.
   */
  const stationLon = -6.25;
  const modelLat = 52.61875;
  const westLon = -6.23125;
  const eastLon = -6.13125;

  const requestedTime = new Date();
  requestedTime.setUTCMinutes(0, 0, 0);
  const requestedTimeIso = requestedTime.toISOString().replace(".000Z", "Z");

  const endpoint =
    "https://erddap.marine.ie/erddap/griddap/IMI_NEATL.csv" +
    "?sea_surface_temperature[(" + requestedTimeIso + ")][(" + modelLat + ")][(" + westLon + "):1:(" + eastLon + ")]";

  const response = await fetchWithTimeout(endpoint, {
    headers: { "Accept": "text/csv" }
  });

  if (!response.ok) {
    throw new Error(`Marine Institute NEATL sea-temperature HTTP ${response.status}`);
  }

  const text = await response.text();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const candidates = [];
  const nowEpoch = Date.now();

  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 4) continue;

    const modelTime = String(cols[0] || "").trim();
    const modelEpoch = Date.parse(modelTime);
    const value = Number(cols[3]);
    const lon = nullableNumber(cols[2]);

    if (!Number.isFinite(modelEpoch)) continue;
    if (!Number.isFinite(value) || value < -5 || value > 35 || lon === null) continue;

    /*
     * Safety guard: a current-value card must never silently display a future
     * forecast timestep. Allow five minutes only for harmless clock skew.
     */
    if (modelEpoch > nowEpoch + 5 * 60 * 1000) continue;

    candidates.push({
      model_time: modelTime,
      model_epoch: modelEpoch,
      latitude: nullableNumber(cols[1]) ?? modelLat,
      longitude: lon,
      sea_surface_temperature_c: value
    });
  }

  if (!candidates.length) {
    throw new Error("Marine Institute NEATL current sea-temperature value unavailable");
  }

  /*
   * All rows should share the requested model hour. If ERDDAP ever returns
   * more than one time, prefer the newest non-future timestep first, then the
   * geographically nearest valid offshore longitude.
   */
  candidates.sort((a, b) =>
    (b.model_epoch - a.model_epoch) ||
    (Math.abs(a.longitude - stationLon) - Math.abs(b.longitude - stationLon))
  );
  const parsed = candidates[0];
  const modelAgeMinutes = Math.max(0, Math.round((nowEpoch - parsed.model_epoch) / 60000));

  return {
    sea_surface_temperature_c: parsed.sea_surface_temperature_c,
    model_time: parsed.model_time,
    timestamp: parsed.model_time,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    model_age_minutes: modelAgeMinutes,
    requested_model_time: requestedTimeIso,
    source: "Marine Institute NEATL model",
    source_short: "NEATL model",
    source_type: "model",
    location_label: "Irish Sea near Parknacross",
    grid_selection: "nearest valid offshore cell at current UTC hour",
    time_selection: "current UTC hour; future forecast timesteps excluded",
    licence: "CC BY 4.0"
  };
}

async function getOpenMeteoSeaTemperature() {
  /* Second fallback only: modelled SST from the nearest sea grid cell. */
  const stationLat = 52.6247;
  const stationLon = -6.25;
  const endpoint =
    "https://marine-api.open-meteo.com/v1/marine" +
    `?latitude=${encodeURIComponent(stationLat)}` +
    `&longitude=${encodeURIComponent(stationLon)}` +
    "&current=sea_surface_temperature" +
    "&temperature_unit=celsius" +
    "&timezone=UTC" +
    "&cell_selection=sea";

  const response = await fetchWithTimeout(endpoint, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo marine SST HTTP ${response.status}`);
  }

  const data = await response.json();
  const value = nullableNumber(data?.current?.sea_surface_temperature);

  if (value === null || value < -5 || value > 35) {
    throw new Error("Open-Meteo marine SST value unavailable");
  }

  return {
    model_time: data?.current?.time || null,
    latitude: nullableNumber(data?.latitude) ?? stationLat,
    longitude: nullableNumber(data?.longitude) ?? stationLon,
    sea_surface_temperature_c: value,
    source: "Open-Meteo Marine model",
    source_short: "Open-Meteo model",
    source_type: "model",
    location_label: "Irish Sea near Parknacross",
    grid_selection: "nearest sea cell",
    licence: "CC BY 4.0"
  };
}

async function getLocalSeaTemperatureModel() {
  /*
   * Local Parknacross sea-temperature estimate.  This is intentionally kept
   * separate from the M2 buoy observation: the model represents the nearest
   * usable sea grid close to Parknacross, while M2 is an offshore Irish Sea
   * instrument at a different location.
   */
  const errors = [];

  try {
    return await getMarineInstituteNeatlSeaTemperature();
  } catch (error) {
    errors.push(`NEATL: ${error?.message || error}`);
    console.warn("Marine Institute NEATL local sea temperature unavailable; trying Open-Meteo:", error);
  }

  try {
    return await getOpenMeteoSeaTemperature();
  } catch (error) {
    errors.push(`Open-Meteo: ${error?.message || error}`);
  }

  throw new Error(`Local modelled sea temperature unavailable. ${errors.join("; ")}`);
}

async function getSeaSurfaceTemperature() {
  /*
   * Return TWO independent readings:
   *   1) local_model — modelled sea temperature near Parknacross;
   *   2) m2_buoy    — observed open-water Irish Sea temperature at M2.
   *
   * The backwards-compatible top-level fields deliberately mirror the local
   * model when it is available, because that is the geographically relevant
   * value for Parknacross.  M2 remains available separately and is never
   * presented as a local Poulshone/Ardamine measurement.
   */
  const [localResult, m2Result] = await Promise.allSettled([
    getLocalSeaTemperatureModel(),
    getMarineInstituteM2SeaTemperature()
  ]);

  const localModel = localResult.status === "fulfilled" ? localResult.value : null;
  const m2Buoy = m2Result.status === "fulfilled" ? m2Result.value : null;

  if (!localModel && !m2Buoy) {
    const localError = localResult.status === "rejected"
      ? (localResult.reason?.message || String(localResult.reason))
      : "unavailable";
    const m2Error = m2Result.status === "rejected"
      ? (m2Result.reason?.message || String(m2Result.reason))
      : "unavailable";
    throw new Error(`Sea temperature unavailable. Local model: ${localError}; M2 buoy: ${m2Error}`);
  }

  const legacyPrimary = localModel || m2Buoy;

  return {
    // Backwards-compatible fields. Prefer the geographically local model.
    sea_surface_temperature_c: legacyPrimary?.sea_surface_temperature_c ?? null,
    source: legacyPrimary?.source ?? null,
    source_short: legacyPrimary?.source_short ?? null,
    source_type: legacyPrimary?.source_type ?? null,
    location_label: legacyPrimary?.location_label ?? null,
    model_time: legacyPrimary?.model_time ?? null,
    observation_time: legacyPrimary?.observation_time ?? null,
    timestamp: legacyPrimary?.timestamp ?? legacyPrimary?.model_time ?? legacyPrimary?.observation_time ?? null,
    latitude: legacyPrimary?.latitude ?? null,
    longitude: legacyPrimary?.longitude ?? null,

    // New explicit split used by the Coastal page.
    local_model: localModel,
    m2_buoy: m2Buoy,
    local_model_available: Boolean(localModel),
    m2_observation_available: Boolean(m2Buoy),
    display_default: localModel ? "local_model" : "m2_buoy",
    errors: {
      local_model: localResult.status === "rejected"
        ? (localResult.reason?.message || String(localResult.reason))
        : null,
      m2_buoy: m2Result.status === "rejected"
        ? (m2Result.reason?.message || String(m2Result.reason))
        : null
    }
  };
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

  // Johnstown Castle long-term monthly rainfall normals (1991–2020):
  // September 72.3 mm and October 126.5 mm (WMO/TCC ClimatView station table).
  // Keep the lookup explicit so an unknown month is never assigned a guess.
  const johnstownLtaByMonth = { 9: 72.3, 10: 126.5 };
  const currentMonthLta = johnstownLtaByMonth[Number(todayKey.slice(5, 7))] ?? null;
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



function normalizeLightningEpoch(value) {
  const n = numericSensorValue(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 10_000_000_000 ? Math.round(n / 1000) : Math.round(n);
}

function findLightningValue(root, aliases) {
  const wanted = new Set(aliases.map(normalizeSensorKey));
  let found = null;

  function walk(node, path = []) {
    if (found !== null || !node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const nextPath = [...path, key];
      const pathText = nextPath.map(normalizeSensorKey).join(".");
      const keyNorm = normalizeSensorKey(key);
      const inLightningBranch = pathText.includes("lightning");

      if (inLightningBranch && wanted.has(keyNorm)) {
        const n = numericSensorValue(value);
        if (Number.isFinite(n)) {
          found = n;
          return;
        }
      }
      if (value && typeof value === "object") walk(value, nextPath);
    }
  }

  walk(root);
  return found;
}

function extractLightning(data) {
  const distance = valueAt(data, [
    "lightning.distance.value",
    "lightning.distance",
    "lightning.lightning_distance.value",
    "lightning.lightning_distance",
    "lightning_distance.value",
    "lightning_distance"
  ]) ?? findLightningValue(data, ["lightning_distance", "distance"]);

  const strikes = valueAt(data, [
    "lightning.count.value",
    "lightning.count",
    "lightning.lightning_count.value",
    "lightning.lightning_count",
    "lightning.strike_count.value",
    "lightning.strike_count",
    "lightning_count.value",
    "lightning_count"
  ]) ?? findLightningValue(data, ["lightning_count", "strike_count", "lightning_strike_count", "count"]);

  const rawTime = valueAt(data, [
    "lightning.time.value",
    "lightning.time",
    "lightning.last_strike_time.value",
    "lightning.last_strike_time",
    "lightning.lightning_time.value",
    "lightning.lightning_time",
    "lightning_time.value",
    "lightning_time"
  ]) ?? findLightningValue(data, ["lightning_time", "last_strike_time", "last_det_time", "time"]);

  const strikeCount = usableNumber(strikes) ? Math.max(0, Math.round(Number(strikes))) : null;

  const validDistance = boundedSensorNumber(distance, 0, 40);
  return {
    distance_km: strikeCount !== null && strikeCount > 0 && validDistance > 0
      ? validDistance
      : null,
    strikes: strikeCount,
    // WH57/Ecowitt payloads can contain a current/update time in the lightning
    // branch even when no strike has occurred. Never treat that as a strike time.
    last_epoch: strikeCount !== null && strikeCount > 0 ? normalizeLightningEpoch(rawTime) : null
  };
}

/*
 * Ecowitt exposes the WH52 through slightly different JSON shapes depending
 * on whether a reading came from its cloud API or a gateway/custom upload.
 * Flatten the payload once, then recognise both the documented upload keys
 * (soil_ec_hum1, soil_ec_temp1 and soil_ec1) and nested channel groups.
 * The first complete/usable WH52 channel wins; ordinary WH51 moisture fields
 * are deliberately ignored so the two sensor types can never be confused.
 */
function extractWh52(root, temperatureUnit = "c") {
  const entries = [];
  const soilNumber = value => {
    let candidate = value;
    if (candidate && typeof candidate === "object" && "value" in candidate) {
      candidate = candidate.value;
    }
    if (candidate === null || candidate === undefined || candidate === "") return null;
    return numericSensorValue(candidate);
  };

  function walk(node, path = []) {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      const nextPath = [...path, key];
      const number = soilNumber(child);
      if (Number.isFinite(number)) {
        entries.push({
          key: normalizeSensorKey(key),
          path: nextPath.map(normalizeSensorKey).join("."),
          value: number
        });
      }
      if (child && typeof child === "object") walk(child, nextPath);
    }
  }

  walk(root);

  const direct = (name, channel) =>
    entries.find(item => item.key === normalizeSensorKey(`${name}${channel}`))?.value ?? null;
  const nested = (channel, aliases) => entries.find(item => {
    const wh52Branch = item.path.includes(`soilecch${channel}`) ||
      item.path.includes(`soilec.ch${channel}`) ||
      item.path.includes(`soilec.channel${channel}`) ||
      item.path.includes(`soilec.${channel}.`) ||
      item.path.includes(`wh52ch${channel}`) ||
      item.path.includes(`wh52.ch${channel}`) ||
      item.path.includes(`soilch${channel}`) ||
      item.path.includes(`soil.ch${channel}`) ||
      item.path.includes(`soilec${channel}.`);
    return wh52Branch && aliases.includes(item.key);
  })?.value ?? null;

  for (let channel = 1; channel <= 16; channel += 1) {
    const moisture = direct("soil_ec_hum", channel) ??
      direct("soil_moisture", channel) ??
      direct("soilmoisture", channel) ?? nested(channel, [
      "soilmoisture", "moisture", "humidity", "hum"
    ]);
    const temperature = direct("soil_ec_temp", channel) ??
      direct("soil_temp", channel) ??
      direct("soiltemp", channel) ?? nested(channel, [
      "soiltemperature", "temperature", "temp"
    ]);
    const conductivity = direct("soil_ec", channel) ??
      direct("soil_conductivity", channel) ??
      direct("soilconductivity", channel) ?? nested(channel, [
      "electricalconductivity", "conductivity", "ec"
    ]);

    if ([moisture, temperature, conductivity].some(Number.isFinite)) {
      const temperatureC = Number.isFinite(temperature)
        ? (String(temperatureUnit).toLowerCase() === "f" ? (temperature - 32) * 5 / 9 : temperature)
        : null;
      return {
        channel,
        moisture_pct: Number.isFinite(moisture) && moisture >= 0 && moisture <= 100
          ? moisture : null,
        temperature_c: Number.isFinite(temperatureC) && temperatureC >= -40 && temperatureC <= 60
          ? Math.round(temperatureC * 10) / 10 : null,
        ec_us_cm: Number.isFinite(conductivity) && conductivity >= 0 && conductivity <= 10000
          ? conductivity : null
      };
    }
  }

  return { channel: null, moisture_pct: null, temperature_c: null, ec_us_cm: null };
}

async function readFreshWh52Upload(env) {
  const row = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
  ).bind(WH52_UPLOAD_META_KEY).first();
  if (!row?.value) return null;
  try {
    const record = JSON.parse(row.value);
    const age = Math.floor(Date.now() / 1000) - Number(record.received_epoch || 0);
    if (!Number.isFinite(age) || age < -300 || age > WH52_UPLOAD_MAX_AGE_SECONDS) return null;
    const soil = {
      channel: nullableNumber(record.channel),
      moisture_pct: nullableNumber(record.moisture_pct),
      temperature_c: nullableNumber(record.temperature_c),
      ec_us_cm: nullableNumber(record.ec_us_cm)
    };
    return [soil.moisture_pct, soil.temperature_c, soil.ec_us_cm].some(usableNumber) ? soil : null;
  } catch (_) {
    return null;
  }
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
        normal === "hapticarraybattery" ||
        normal === "hapticarraybatt" ||
        (normal.includes("wh90") && normal.includes("batt")) ||
        (normal.includes("ws90") && normal.includes("batt")) ||
        (normal.includes("hapticarray") && normal.includes("batt"));

      if (looksLikeWs90Battery && !normal.includes("cap")) {
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
    "battery.haptic_array_battery.value",
    "battery.haptic_array_battery",
    "battery.haptic_array_batt.value",
    "battery.haptic_array_batt",
    "haptic_array_battery.value",
    "haptic_array_battery",
    "haptic_array_batt.value",
    "haptic_array_batt",
    "wh90batt.value",
    "wh90batt",
    "ws90batt.value",
    "ws90batt",
    "battWh90.value",
    "battWh90"
  ]);

  // An absent field can be coerced to 0 by valueAt; do not accept it as a
  // voltage and do not let it hide a valid alternate battery field.
  if (direct !== null && direct >= 1.5 && direct <= 4.0) return direct;

  const candidates = collectBatteryCandidates(root);

  /*
   * A WS90 AA battery is normally roughly 2–3.3 V.
   * Prefer plausible voltages and deliberately ignore ws90cap_volt,
   * which is the solar capacitor rather than the AA battery.
   */
  const plausible = candidates.find(
    item => item.value >= 1.5 && item.value <= 4.0
  );

  // Do not return a capacitor, battery-status code or out-of-range value.
  return plausible ? plausible.value : null;
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
  if (stored !== null && stored >= 1.5 && stored <= 4.0) return stored;
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
        normal === "hapticarraybattery" ||
        normal === "hapticarraybatt" ||
        (normal.includes("wh90") && normal.includes("batt")) ||
        (normal.includes("ws90") && normal.includes("batt")) ||
        (normal.includes("hapticarray") && normal.includes("batt"));

      if (looksLikeWs90Battery && !normal.includes("cap")) {
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
     WHERE battery_v BETWEEN 1.5 AND 4.0
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

// Separate, persistent provenance for the AA battery (never the solar capacitor).
// First-seen time is not a sensor measurement time; the API can return a cached
// voltage, even when a weather observation itself has a fresh timestamp.
const WS90_BATTERY_META_KEY = "ws90_battery_provenance_v1";
const WS90_BATTERY_CHECK_INTERVAL_SECONDS = 15 * 60;

function usableWs90BatteryVoltage(value) {
  const voltage = nullableNumber(value);
  return voltage !== null && voltage >= 1.5 && voltage <= 4.0 ? voltage : null;
}

async function readWs90BatteryRecord(env) {
  const row = await env.DB.prepare(
    `SELECT value FROM ${META_TABLE} WHERE key = ? LIMIT 1`
  ).bind(WS90_BATTERY_META_KEY).first();
  if (!row?.value) return null;
  try {
    const data = JSON.parse(row.value);
    const value = usableWs90BatteryVoltage(data.value);
    if (value === null) return null;
    const firstSeen = Number(data.first_seen_epoch);
    const lastChecked = Number(data.last_checked_epoch);
    const lastReported = Number(data.last_reported_epoch);
    const now = Math.floor(Date.now()/1000);
    return {
      value,
      first_seen_epoch: Number.isFinite(firstSeen) && firstSeen > 0 && firstSeen <= now + 300
        ? firstSeen : null,
      last_checked_epoch: Number.isFinite(lastChecked) && lastChecked > 0 && lastChecked <= now + 300
        ? lastChecked : null,
      last_reported_epoch: Number.isFinite(lastReported) && lastReported > 0 && lastReported <= now + 300
        ? lastReported : null,
      source: String(data.source || "unknown")
    };
  } catch (_) { return null; }
}

async function writeWs90BatteryRecord(env, voltage, source, { checked = false, reported = false } = {}) {
  const previous = await readWs90BatteryRecord(env);
  const now = Math.floor(Date.now()/1000);
  const incoming = usableWs90BatteryVoltage(voltage);
  if (incoming === null && !previous) return null;
  const value = incoming ?? previous.value;
  const unchanged = previous && Math.abs(previous.value - value) < 0.005;
  const record = {
    value,
    // The first-seen epoch is preserved for every repeat of the same cached
    // voltage, even if the weather sample timestamp changes.
    first_seen_epoch: unchanged ? previous.first_seen_epoch : (incoming === null ? null : now),
    last_checked_epoch: checked ? now : previous?.last_checked_epoch ?? null,
    // A successful retrieval is not proof of a new physical measurement.
    last_reported_epoch: reported ? now : previous?.last_reported_epoch ?? null,
    source: incoming !== null && !unchanged ? source : previous?.source || source
  };
  if (JSON.stringify(record) !== JSON.stringify(previous)) {
    await env.DB.prepare(
      `INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(WS90_BATTERY_META_KEY, JSON.stringify(record)).run();
  }
  return record;
}

async function getLastKnownStoredBattery(env) {
  // Legacy use in authenticated diagnostics only. Its epoch is the weather
  // observation time and MUST NOT be used as a battery measurement timestamp.
  return getStoredBatteryRecord(env, 7 * 24 * 3600);
}

async function fetchEcowittBatteryRealTime(applicationKey, apiKey, mac) {
  const api = new URL("https://api.ecowitt.net/api/v3/device/real_time");
  api.searchParams.set("application_key", applicationKey);
  api.searchParams.set("api_key", apiKey);
  api.searchParams.set("mac", mac);
  api.searchParams.set("call_back", "battery");
  const response = await fetch(api.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const payload = await response.json();
  if (Number(payload?.code ?? 0) !== 0) return null;
  return findWs90BatteryVoltageDeep(payload?.data || payload);
}

async function fetchEcowittBatteryHistory(applicationKey, apiKey, mac) {
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 3600 * 1000);
  const api = new URL("https://api.ecowitt.net/api/v3/device/history");
  api.searchParams.set("application_key", applicationKey);
  api.searchParams.set("api_key", apiKey);
  api.searchParams.set("mac", mac);
  api.searchParams.set("start_date", formatApiDate(start));
  api.searchParams.set("end_date", formatApiDate(end));
  api.searchParams.set("cycle_type", "5min");
  api.searchParams.set("call_back", "battery");
  const response = await fetch(api.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const payload = await response.json();
  if (Number(payload?.code ?? 0) !== 0) return null;
  return findWs90BatteryVoltageDeep(payload?.data || payload);
}

async function getWs90BatteryVoltage(env, applicationKey, apiKey, mac, options = {}) {
  const previous = await readWs90BatteryRecord(env);
  const now = Math.floor(Date.now()/1000);
  const direct = usableWs90BatteryVoltage(options.directVoltage);
  const needsCheck = !previous || !Number.isFinite(previous.last_checked_epoch) ||
    now - previous.last_checked_epoch >= WS90_BATTERY_CHECK_INTERVAL_SECONDS;
  let explicit = null;
  let checked = false;
  if (needsCheck) {
    checked = true;
    try {
      explicit = usableWs90BatteryVoltage(
        await fetchEcowittBatteryRealTime(applicationKey, apiKey, mac)
      );
    } catch (error) {
      console.warn("Ecowitt battery real-time request failed:", error);
    }
    if (explicit === null) {
      try {
        explicit = usableWs90BatteryVoltage(
          await fetchEcowittBatteryHistory(applicationKey, apiKey, mac)
        );
      } catch (error) {
        console.warn("Ecowitt battery history request failed:", error);
      }
    }
  }
  // A dedicated battery response wins over a potentially cached value in
  // the general weather response. Never let a saved value prevent this check.
  // Do not let an older, general-weather payload overwrite a voltage from
  // the dedicated battery endpoint while the next dedicated check is pending.
  const trustedDirect = direct !== null && (!previous || previous.source !== "battery_api")
    ? direct : null;
  const observed = explicit ?? trustedDirect;
  const chosen = observed ?? previous?.value ?? null;
  if (chosen !== null || checked) {
    await writeWs90BatteryRecord(
      env, observed, explicit !== null ? "battery_api" : "weather_api",
      { checked, reported: explicit !== null }
    );
  }
  return chosen;
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
  const batteryRecord = await readWs90BatteryRecord(env);

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
    tracked_battery_v: batteryRecord?.value ?? null,
    tracked_battery_first_seen_at: batteryRecord?.first_seen_epoch
      ? new Date(batteryRecord.first_seen_epoch*1000).toISOString() : null,
    tracked_last_cloud_check_at: batteryRecord?.last_checked_epoch
      ? new Date(batteryRecord.last_checked_epoch*1000).toISOString() : null,
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
      batteryRecord?.value ??
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
  const nowEpoch = Math.floor(Date.now() / 1000);
  const earliestReasonableEpoch = 1_000_000_000; // 2001-09-09
  const latestReasonableEpoch = nowEpoch + 10 * 60; // tolerate small device clock skew only

  function normalizeObservationEpoch(value) {
    let number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;

    // Ecowitt fields are normally Unix seconds, but some sensor branches
    // (including WH57/lightning payloads) may expose milliseconds. Never
    // allow a 13-digit millisecond value to be mistaken for Unix seconds.
    if (number > 10_000_000_000) number /= 1000;
    number = Math.round(number);

    if (number < earliestReasonableEpoch || number > latestReasonableEpoch) {
      return null;
    }
    return number;
  }

  function walk(value) {
    if (!value || typeof value !== "object") return;

    for (const [key, child] of Object.entries(value)) {
      if (key === "time") {
        const epoch = normalizeObservationEpoch(child);
        if (epoch !== null) {
          latest = latest === null ? epoch : Math.max(latest, epoch);
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
    battery_v: batteryVoltageFromRow(row),
    lightning_distance_km: nullableNumber(row.lightning_distance_km),
    lightning_strikes: nullableNumber(row.lightning_strikes),
    lightning_time_epoch: nullableNumber(row.lightning_time_epoch),
    soil_channel: nullableNumber(row.soil_channel),
    soil_moisture_pct: nullableNumber(row.soil_moisture_pct),
    soil_temperature_c: nullableNumber(row.soil_temperature_c),
    soil_ec_us_cm: nullableNumber(row.soil_ec_us_cm)
  };
}

function usableNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function nullableNumber(value) {
  return usableNumber(value) ? Number(value) : null;
}

function apparentTemperatureC(temperatureC, humidityPercent, windSpeedKmh) {
  if (!usableNumber(temperatureC) ||
      !usableNumber(humidityPercent) ||
      !usableNumber(windSpeedKmh)) return null;

  const temperature = Number(temperatureC);
  const humidity = Math.max(0, Math.min(100, Number(humidityPercent)));
  const windMps = Math.max(0, Number(windSpeedKmh)) / 3.6;
  const vapourPressureHpa =
    (humidity / 100) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
  const apparent = temperature + (0.33 * vapourPressureHpa) - (0.70 * windMps) - 4.0;

  return Number.isFinite(apparent) ? round1(apparent) : null;
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
  if (cacheUrl.pathname === "/marine/tides" || cacheUrl.pathname === "/marine/sea-temperature") {
    cacheUrl.searchParams.set("__marine_source_version", "v38.4.81");
  }
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
    if (cached) {
      if (["/met/forecast","/met/marine","/marine/tides","/marine/sea-temperature"].includes(cacheUrl.pathname)) {
        const data=await cached.clone().json();
        return json({...data,freshness:{...data.freshness,cached:true}},200,{"Cache-Control":`public, max-age=${ttl}`,"X-Parknacross-Cache":"HIT"});
      }
      return cached;
    }
  } catch (error) {
    console.warn("Edge cache read unavailable:", error);
  }

  const produced = await producer();
  const data=["/met/forecast","/met/marine","/marine/tides","/marine/sea-temperature"].includes(cacheUrl.pathname)
    ? {...produced,freshness:{retrieved_at:new Date().toISOString(),cached:false}} : produced;
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

async function previewWeatherExport(env,url) {
  const from=url.searchParams.get("from"),to=url.searchParams.get("to"),now=Math.floor(Date.now()/1000);
  let start,end;
  if(from!==null||to!==null){
    if(!from||!to||!isValidStationDayKey(from)||!isValidStationDayKey(to)||from>to) return json({error:"Invalid date range"},400);
    const days=Math.round((Date.parse(to+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/86400000)+1;
    if(days>365||to>stationDayKey(new Date()))return json({error:"Choose no more than 365 days, ending no later than today"},400);
    start=dublinLocalMidnightEpoch(from);end=Math.min(now+1,dublinLocalMidnightEpoch(shiftDayKey(to,1)));
  }else{
    const days=Number(url.searchParams.get("days")||7);
    if(![7,30,90,365].includes(days))return json({error:"Unsupported export window"},400);
    start=now-days*86400;end=now+1;
  }
  const stats=await env.DB.prepare(`SELECT COUNT(*) AS count,MIN(epoch) AS first_epoch,MAX(epoch) AS last_epoch,COUNT(DISTINCT CAST(epoch/300 AS INTEGER)) AS slots FROM ${TABLE} WHERE epoch >= ? AND epoch < ?`).bind(start,end).first();
  const sample=await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE epoch >= ? AND epoch < ? ORDER BY epoch ASC LIMIT 3`).bind(start,end).all();
  const expected=Math.max(1,Math.floor((end-1)/300)-Math.floor(start/300)+1),slots=Math.max(0,Number(stats?.slots||0));
  return json({count:Number(stats?.count||0),first_epoch:nullableNumber(stats?.first_epoch),last_epoch:nullableNumber(stats?.last_epoch),columns:rowsToCsv([]).trim().split(","),coverage_percent:Math.min(100,slots/expected*100),actual_slots:slots,expected_slots:expected,sample:(sample.results||[]).map(row=>({epoch:row.epoch,temperature_c:nullableNumber(row.temperature_c),rain_rate_mm_h:nullableNumber(row.rain_rate_mm_h),soil_moisture_pct:nullableNumber(row.soil_moisture_pct)}))},200,{"Cache-Control":"no-store"});
}
