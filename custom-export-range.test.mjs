import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";

const workerPath = process.env.PARKNACROSS_WORKER_SOURCE || process.argv[2];
if (!workerPath) {
  console.log("Custom CSV range test skipped; set PARKNACROSS_WORKER_SOURCE to the Worker file.");
  process.exit(0);
}

const source = await readFile(workerPath, "utf8");
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).default;
const observations = [
  "2025-10-24T22:59:00Z", // before Irish local midnight: excluded
  "2025-10-24T23:00:00Z", // first instant of 25 October in Ireland: included
  "2025-10-26T00:30:00Z", // inside the 25-hour DST change day: included
  "2025-10-26T23:59:59Z", // final instant of 26 October: included
  "2025-10-27T00:00:00Z"  // first instant of 27 October: excluded
].map((time, index) => ({
  epoch: Date.parse(time) / 1000,
  received_at: time,
  temperature_c: 10 + index,
  wind_speed_kmh: 0,
  wind_gust_kmh: 0,
  lightning_strikes: 0
}));

const DB = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async run() { return {}; },
      async first() {
        if (sql.includes("WHERE epoch >= ? AND epoch < ?")) {
          const matches = observations.filter(row => row.epoch >= args[0] && row.epoch < args[1]);
          const row = sql.includes("ORDER BY epoch ASC") ? matches[0] : matches.at(-1);
          return row ? { epoch: row.epoch } : null;
        }
        if (sql.includes("SELECT epoch FROM")) {
          const row = sql.includes("ORDER BY epoch ASC") ? observations[0] : observations.at(-1);
          return { epoch: row.epoch };
        }
        return null;
      },
      async all() {
        if (sql.includes("PRAGMA")) return { results: [] };
        return { results: observations.filter(row => row.epoch > args[0] && row.epoch <= args[1]).slice(0, args[2]) };
      }
    };
  }
};

const invalid = await worker.fetch(
  new Request("https://worker.test/export.csv?from=2026-02-30&to=2026-03-01"),
  { DB }
);
assert.equal(invalid.status, 400, "invalid calendar dates should be rejected");

const response = await worker.fetch(
  new Request("https://worker.test/export.csv?from=2025-10-25&to=2025-10-26&fresh=1"),
  { DB }
);
assert.equal(response.status, 200);
assert.match(response.headers.get("content-disposition"), /2025-10-25-to-2025-10-26/);
const lines = (await response.text()).trim().split("\n");
const epochs = lines.slice(1).map(line => Number(line.split(",")[0]));
assert.deepEqual(epochs, [observations[3].epoch, observations[2].epoch, observations[1].epoch]);
console.log("Custom CSV range validation and Irish daylight-saving boundary test passed.");
