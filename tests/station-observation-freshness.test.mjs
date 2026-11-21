import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const app = read("app.js");
const html = read("index.html");
const rainSource = read("rain-status.js");
assert.doesNotThrow(() => new vm.Script(app, {filename:"app.js"}));
assert.match(html, /id="heroObservationTime"/);
assert.match(html, /app\.js\?v=20261121-[a-z0-9-]+/,"Dashboard must request the updated JS while retaining source-aware freshness");
assert.match(app, /Live rain rate unconfirmed/);
assert.match(app, /currentResponseAvailable = false/);

// Exercise the actual dashboard source-aware freshness function in isolation.
const start = app.indexOf("function stationObservationState(");
const end = app.indexOf("\nfunction irishObservationClock(", start);
assert.ok(start > 0 && end > start, "Station observation state helper is present");
const context = {
  GATEWAY_EXPECTED_INTERVAL_MS: 60 * 1000,
  ARCHIVE_EXPECTED_INTERVAL_MS: 5 * 60 * 1000,
  OFFLINE_AFTER_MS: 20 * 60 * 1000,
  readingTime: row => row?.received_at ? Date.parse(row.received_at) :
    (Number.isFinite(Number(row?.epoch)) ? Number(row.epoch) * 1000 : null),
  Date, Number, Math
};
vm.createContext(context);
vm.runInContext(app.slice(start, end) + "\nthis.state = stationObservationState;", context);
const now = Date.parse("2026-11-18T11:36:00Z");
const observation = (ageSeconds, source = "archive_or_cloud") => ({
  epoch: (now - ageSeconds * 1000) / 1000,
  observation_source: source
});
const status = (seconds, source) => context.state(observation(seconds, source), now).status;

assert.equal(status(60, "gateway_live"), "live", "One-minute direct packets are live");
assert.equal(status(179, "gateway_live"), "live", "Direct packet has brief grace");
assert.equal(status(180, "gateway_live"), "delayed", "Unexpectedly late direct feed warns");
assert.equal(status(300, "archive_or_cloud"), "saved", "Five-minute archive cadence is normal");
assert.equal(status(599, "archive_or_cloud"), "saved", "Archive grace protects normal uploads");
assert.equal(status(600, "archive_or_cloud"), "delayed", "Archive overdue after ten minutes");
assert.equal(status(1200, "archive_or_cloud"), "offline", "Very old reading is offline");
assert.equal(status(300), "saved", "Older Workers without source metadata get safe archive grace");
assert.equal(context.state({}, now).status, "missing", "Missing timestamp is not live");
assert.equal(context.state({epoch:(now+120000)/1000}, now).status, "missing", "Future timestamp is not live");

// Keep strict rain evidence: a 5-minute archived observation must never
// claim it is raining now even if its saved WH40H rate is positive.
const rainContext = {window:{}, Intl, Date, Number, Array, Math, Infinity};
vm.runInNewContext(rainSource, rainContext);
const oldRain = {...observation(300), rain_rate_mm_h:8, rain_daily_mm:1.2};
const rain = rainContext.window.ParknacrossRainStatus.evaluate(oldRain, [], {now,trackLive:false});
assert.equal(rain.status, "unavailable");
assert.equal(rain.rainAvailable, false);
assert.equal(rain.dailyTotalAvailable, true);
assert.equal(rain.rainRate, null);
console.log("PASS: source-aware station freshness, exact timestamp display, cached-feed guard and strict live rain limits.");
