import { readFile } from "node:fs/promises";

const workerPath = process.env.PARKNACROSS_WORKER_SOURCE || new URL("./_worker/worker.mjs", import.meta.url);
const worker = await readFile(workerPath, "utf8");
const exportStart = worker.indexOf("async function exportCsv(env, days = 365, forceFresh = false, range = null, fields = null)");
const exportEnd = worker.indexOf("\nfunction BASE_CORS_COMPAT()", exportStart);
if (exportStart < 0 || exportEnd < 0) throw new Error("Could not locate the streaming Worker CSV exporter");
const csvStart = worker.indexOf("function rowsToCsv(");
const csvEnd = worker.indexOf("\nasync function runDailyBackup", csvStart);
if (csvStart < 0 || csvEnd < 0) throw new Error("Could not locate the Worker CSV formatter");
const rowsToCsv = Function(`return (${worker.slice(csvStart, csvEnd)})`)();
const exportCsv = Function("TABLE", "nullableNumber", "rowsToCsv", "correctedRainForDay", "stationDayKey", "BASE_CORS_COMPAT", `return (${worker.slice(exportStart, exportEnd)})`)(
  "weather_observations",
  value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value),
  rowsToCsv,
  (_day, value) => value,
  () => "2026-09-28",
  () => ({"Access-Control-Allow-Origin":"*"})
);

const now = Math.floor(Date.now() / 1000);
const source = [];
const sourceStart = now - 364 * 86400;
const newestEpoch = sourceStart + Math.floor((now - sourceStart) / 300) * 300;
for (let epoch = sourceStart; epoch <= now; epoch += 300) {
  source.push({
    epoch,
    received_at: new Date(epoch * 1000).toISOString(),
    temperature_c: 12,
    rain_daily_mm: 0,
    soil_channel: epoch >= now - 15000 ? 1 : null,
    soil_moisture_pct: epoch >= now - 15000 ? 37 : null,
    soil_temperature_c: epoch >= now - 15000 ? 13.2 : null,
    soil_ec_us_cm: epoch >= now - 15000 ? 421 : null,
    lightning_distance_km: epoch === newestEpoch ? 18 : null,
    lightning_strikes: epoch === newestEpoch ? 1 : null,
    lightning_time_epoch: epoch === newestEpoch ? now : null
  });
}
function lowerBound(epoch) {
  let lo = 0, hi = source.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (source[mid].epoch < epoch) lo = mid + 1; else hi = mid; }
  return lo;
}
function environmentWithArtificialPageCap(cap) {
  return {
    DB: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async first() {
            const [start, end] = args;
            const upper = lowerBound(end) - 1;
            return upper >= 0 && source[upper].epoch >= start ? { epoch: source[upper].epoch } : null;
          },
          async all() {
            const [cursor, start, end, requestedLimit] = args;
            const upper = Math.min(lowerBound(cursor), lowerBound(end)) - 1;
            const lower = lowerBound(start);
            const limit = Math.min(cap, requestedLimit);
            if (upper < lower) return { results: [] };
            return { results: source.slice(Math.max(lower, upper - limit + 1), upper + 1).reverse() };
          }
        };
      }
    }
  };
}

const legacyIdle = rowsToCsv([{epoch:now,lightning_distance_km:0,lightning_strikes:0,lightning_time_epoch:now,soil_channel:1,soil_moisture_pct:37,soil_temperature_c:13.2,soil_ec_us_cm:421}]);
const [csvHeader,csvRow] = legacyIdle.split("\n").map(line=>line.split(","));
if (csvHeader.includes("lightning_time_epoch")) throw new Error("Raw lightning epoch must not be exported");
for (const field of ["soil_channel","soil_moisture_pct","soil_temperature_c","soil_ec_us_cm"]) {
  if (!csvHeader.includes(field) || !String(csvRow[csvHeader.indexOf(field)] || "").trim()) throw new Error(`Populated ${field} was omitted`);
}
for (const field of ["lightning_distance_km","lightning_strikes","lightning_last_strike_time_ireland"]) {
  if (String(csvRow[csvHeader.indexOf(field)] || "").trim()) throw new Error(`Idle legacy ${field} was exported as a false lightning event`);
}

const realDateNow = Date.now;
Date.now = () => now * 1000;
for (const days of [7, 30, 90, 365]) {
  const response = await exportCsv(environmentWithArtificialPageCap(137), days);
  if (response.status !== 200 || !response.body) throw new Error(`${days}-day export did not return a streaming CSV response`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", header = null, firstEpoch = null, lastEpoch = null, rowCount = 0, hasSoil = false, hasLightning = false;
  const consume = line => {
    if (!header) { header = line.split(","); return; }
    if (!line) return;
    const columns = line.split(","), epoch = Number(columns[header.indexOf("epoch")]);
    if (firstEpoch === null) firstEpoch = epoch;
    lastEpoch = epoch;
    rowCount++;
    hasSoil ||= Boolean(columns[header.indexOf("soil_moisture_pct")]);
    hasLightning ||= Number(columns[header.indexOf("lightning_strikes")]) > 0;
  };
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) consume(line);
  }
  buffer += decoder.decode();
  if (buffer) consume(buffer);
  const cutoff = now - days * 86400;
  const expected = source.filter(row => row.epoch >= cutoff && row.epoch < now + 1).length;
  if (rowCount !== expected) throw new Error(`${days}-day stream returned ${rowCount} rows; expected ${expected}`);
  if (firstEpoch !== source.at(-1).epoch) throw new Error(`${days}-day export did not start with the newest archive row`);
  if (lastEpoch !== source.find(row => row.epoch >= cutoff)?.epoch) throw new Error(`${days}-day export did not include the first row in its window`);
  if (!hasSoil || !hasLightning) throw new Error(`${days}-day export omitted populated soil or lightning data`);
  console.log(`${days}-day streamed CSV pagination passed (${rowCount} rows)`);
}
Date.now = realDateNow;
