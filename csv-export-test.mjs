import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workerPath = process.env.PARKNACROSS_WORKER_SOURCE || resolve("../../worker-source/Parknacross-worker-v38.4.75-LIVE-FRESHNESS-RESILIENCE-NOTEPAD.txt");
let worker;
try { worker = await readFile(workerPath, "utf8"); }
catch {
  console.log("CSV Worker regression checks skipped: set PARKNACROSS_WORKER_SOURCE to the current Cloudflare Worker source.");
  process.exit(0);
}
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
        const statement = {
          async first() {
            return sql.includes("ORDER BY epoch ASC") ? source[0] || null : source.at(-1) || null;
          },
          bind(...values) {
            return {
              async all() {
                const [cursor, latestEpoch] = values;
                return { results: source.filter(row => row.epoch > cursor && row.epoch <= latestEpoch).slice(0, cap) };
              },
              async first() {
                return sql.includes("ORDER BY epoch ASC") ? source[0] || null : source.at(-1) || null;
              }
            };
          }
        };
        return statement;
      }
    }
  };
}

const csvStart = worker.indexOf("function rowsToCsv(rows)");
const csvEnd = worker.indexOf("\nasync function runDailyBackup", csvStart);
if (csvStart < 0 || csvEnd < 0) throw new Error("Could not locate the Worker CSV formatter");
const rowsToCsv = Function(`return (${worker.slice(csvStart, csvEnd)})`)();
const legacyIdle = rowsToCsv([{epoch:now,lightning_distance_km:0,lightning_strikes:0,lightning_time_epoch:now,soil_channel:1,soil_moisture_pct:37,soil_temperature_c:13.2,soil_ec_us_cm:421}]);
const [csvHeader,csvRow] = legacyIdle.split("\n").map(line=>line.split(","));
if (csvHeader.includes("lightning_time_epoch")) throw new Error("Raw lightning epoch must not be exported");
for (const field of ["soil_channel","soil_moisture_pct","soil_temperature_c","soil_ec_us_cm"]) {
  if (!csvHeader.includes(field) || !String(csvRow[csvHeader.indexOf(field)] || "").trim()) throw new Error(`Populated ${field} was omitted`);
}
for (const field of ["lightning_distance_km","lightning_strikes","lightning_last_strike_time_ireland"]) {
  if (String(csvRow[csvHeader.indexOf(field)] || "").trim()) throw new Error(`Idle legacy ${field} was exported as a false lightning event`);
}

for (const days of [7, 30, 90, 365]) {
  const rows = await exportRows(environmentWithArtificialPageCap(137), days);
  if (!rows.length || rows.at(-1).epoch !== source.at(-1).epoch) {
    throw new Error(`${days}-day export did not reach the newest archived row`);
  }
  if (!rows.some(row => row.soil_moisture_pct !== null)) {
    throw new Error(`${days}-day export omitted populated soil-sensor data`);
  }
  if (!rows.some(row => Number(row.lightning_strikes) > 0)) {
    throw new Error(`${days}-day export omitted populated lightning detector data`);
  }
  console.log(`${days}-day CSV pagination passed (${rows.length} rows)`);
}
