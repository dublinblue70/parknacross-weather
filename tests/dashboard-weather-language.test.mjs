import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Test the real dashboard condition formatter without the browser boot sequence.
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("function rainActivity(current) {");
const end = source.indexOf("/* NOAA-style", start);
assert.ok(start >= 0 && end > start, "Dashboard condition formatter must be present");
const conditionSource = source.slice(start, end);
let rainState = { status: "no_current_rain", rainAvailable: true, rainRate: 0 };

function formatter(feedAvailable = true) {
  const context = {
    window: {
      ParknacrossRainStatus: { evaluate: () => rainState },
      ParknacrossRainIntensity: {
        classify: () => ({ label: "Light rain" }),
        formatRate: rate => `${rate.toFixed(1)} mm/h`
      }
    },
    history24: [],
    currentResponseAvailable: feedAvailable,
    stationObservationState: () => ({ status: "delayed", source: "gateway" }),
    n: value => Number(value).toFixed(1)
  };
  vm.runInNewContext(conditionSource, context, { filename: "app.js" });
  return context.conditionInfo;
}
const condition = formatter();
const story = (input = {}, night = false) => condition(input, night).story;

assert.equal(story(), "Calm conditions at Parknacross. No rain detected.");
assert.equal(story({ wind_speed_kmh: 8 }), "Light breeze at Parknacross (8.0 km/h). No rain detected.");
assert.equal(story({ solar_w_m2: 450 }), "Bright conditions at Parknacross. No rain detected.");
assert.equal(story({}, true), "Night-time conditions at Parknacross. No rain detected.");
assert.ok(!story().toLowerCase().includes("sunny"), "Do not infer sunshine from no rain");

rainState = { status: "measured", rainAvailable: true, rainRate: 3 };
assert.match(story(), /^Rain detected at Parknacross/);

rainState = { status: "possible", rainAvailable: true, rainRate: 0, piezoStrongSignal: false, piezoIncreaseRecent: false };
assert.equal(condition({}).tag, "Possible rain");

rainState = { status: "sensor_disagreement", rainAvailable: true, rainRate: 0 };
assert.match(story(), /^Rain uncertain:/);

rainState = { status: "rate_unavailable", reason: "rate_missing", rainAvailable: false, rainRate: null };
assert.equal(story({ solar_w_m2: 500 }), "Rainfall data temporarily unavailable.");

rainState = { status: "unavailable", reason: "stale_observation", rainAvailable: false, rainRate: null };
assert.equal(condition({}).tag, "Station reading delayed");
assert.match(story(), /Live rain status cannot be confirmed/);

rainState = { status: "no_current_rain", rainAvailable: true, rainRate: 0 };
assert.equal(formatter(false)({}).tag, "Live feed unavailable");
assert.ok(!source.includes("this does not establish dry conditions"));
console.log("PASS: clear dashboard rainfall language and genuine warning states");
