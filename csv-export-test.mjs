import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workerPath = resolve("../../worker-source/Parknacross-worker-v38.4.74-LIVE-VERIFIED-LONG-CSV-NOTEPAD.txt");
const worker = await readFile(workerPath, "utf8");
const start = worker.indexOf("async function exportRows(env, days)");
const end = worker.indexOf("\nfunction exportCsv(", start);
if (start < 0 || end < 0) throw new Error("Could not locate the Worker CSV exporter");

const exportRows = Function(
  "TABLE", "nullableNumber", "correctedRainForDay", "stationDayKey",
  `return (${worker.slice(start, end)})`
)(
  "weather_observations",
  value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value),
  (_day, value) => value,
  () => "2026-09-28"
);

const now = Math.floor(Date.now() / 1000);
const source = [];
for (let epoch = now - 364 * 86400; epoch <= now; epoch += 300) {
  source.push({
    epoch,
    received_at: new Date(epoch * 1000).toISOString(),
    temperature_c: 12,
    rain_daily_mm: 0,
    soil_channel: epoch >= now - 15000 ? 1 : null,
    soil_moisture_pct: epoch >= now - 15000 ? 37 : null,
    soil_temperature_c: epoch >= now - 15000 ? 13.2 : null,
    soil_ec_us_cm: epoch >= now - 15000 ? 421 : null,
    lightning_distance_km: epoch === now ? 18 : null,
    lightning_strikes: epoch === now ? 1 : null,
    lightning_time_epoch: epoch === now ? now : null
  });
}

function environmentWithArtificialPageCap(cap) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async all() {
                const [cursor, latestEpoch] = values;
                return { results: source.filter(row => row.epoch > cursor && row.epoch <= latestEpoch).slice(0, cap) };
              },
              async first() {
                const [cutoff] = values;
                const eligible = source.filter(row => row.epoch >= cutoff);
                return sql.includes("ORDER BY epoch ASC") ? eligible[0] || null : eligible.at(-1) || null;
              }
            };
          }
        };
      }
    }
  };
}

for (const days of [7, 30, 90, 365]) {
  const rows = await exportRows(environmentWithArtificialPageCap(137), days);
  if (!rows.length || rows.at(-1).epoch !== source.at(-1).epoch) {
    throw new Error(`${days}-day export did not reach the newest archived row`);
  }
  if (!rows.some(row => row.soil_moisture_pct !== null)) {
    throw new Error(`${days}-day export omitted populated WH52 data`);
  }
  if (!rows.some(row => Number(row.lightning_strikes) > 0)) {
    throw new Error(`${days}-day export omitted populated WH57 data`);
  }
  console.log(`${days}-day CSV pagination passed (${rows.length} rows)`);
}
