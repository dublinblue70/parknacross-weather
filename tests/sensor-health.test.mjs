import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const worker = readFileSync(new URL("_worker/worker.mjs", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const ui = readFileSync(new URL("sensor-health.js", root), "utf8");
const sw = readFileSync(new URL("service-worker.js", root), "utf8");
const start = worker.indexOf("/* Read battery indicators from the most recent Cloud Ecowitt payload.");
const stop = worker.indexOf("async function buildQuality(env)", start);
assert.ok(start >= 0 && stop > start, "Worker's standalone sensor battery helper must exist");

const context = {
  PAYLOAD_TABLE: "latest_payload_v1",
  console,
  usableNumber: value => value !== null && value !== undefined && Number.isFinite(Number(value)),
  extractWh52: data => ({
    temperature_c: data.soil_ec_temp1 ?? null,
    ec_us_cm: data.soil_ec1 ?? null
  })
};
runInNewContext(worker.slice(start, stop) +
  "\nglobalThis.batteryFns = {buildSensorHealth};", context);
const read = async (data, ageMinutes = 2) => {
  const epoch = Math.floor(Date.now() / 1000) - Math.round(ageMinutes * 60);
  const env = {
    DB: { prepare(sql) {
      assert.match(sql, /^SELECT epoch, raw_json FROM latest_payload_v1/);
      return { first: async () => ({
        epoch, raw_json: JSON.stringify({ data })
      }) };
    } }
  };
  return context.batteryFns.buildSensorHealth(env);
};

let response = await read({
  battery: {
    rainfall_sensor: { value: "1.52" },
    lightning_sensor: { value: "5" },
    soil_ec_sensor_ch1: { value: "1.10" }
  }
});
assert.equal(response.sensors.rain.state, "normal");
assert.equal(response.sensors.rain.unit, "V");
assert.equal(response.sensors.lightning.state, "normal");
assert.equal(response.sensors.lightning.unit, "level");
assert.equal(response.sensors.soil.state, "low");

response = await read({
  battery: { rainfall_sensor: { value: "1.0" }, lightning_sensor: { value: 0 } }
});
assert.equal(response.sensors.rain.state, "low");
assert.equal(response.sensors.lightning.state, "low");
assert.equal(response.sensors.soil.state, "unavailable");

response = await read({
  battery: { rainfall_sensor: { value: "0" }, lightning_sensor: { value: 8 } }
});
assert.equal(response.sensors.rain.state, "unavailable");
assert.equal(response.sensors.lightning.state, "unavailable");

response = await read({ battery: { soilbatt1: { value: 1.5 } } });
assert.equal(response.sensors.soil.state, "unavailable", "A generic WH51 reading must not be labelled WH52");
response = await read({ soil_ec_temp1: 12, battery: { soilbatt1: { value: 1.5 } } });
assert.equal(response.sensors.soil.state, "normal", "A WH52 channel-one upload may use soilbatt1");

response = await read({ battery: { lightning_sensor: { value: 5 } } }, 31);
assert.equal(response.sensors.lightning.state, "unavailable", "Stale cloud payload must not show healthy");
assert.equal(response.sensors.rain.state, "unavailable");
assert.equal(response.sensors.soil.state, "unavailable");

assert.match(worker, /url\.pathname === "\/sensor-health"/);
assert.match(html, /id="sensorHealthRain"/);
assert.match(html, /id="sensorHealthLightning"/);
assert.match(html, /id="sensorHealthSoil"/);
assert.equal((html.match(/id="battery"/g) || []).length, 1, "Main weather battery must retain its existing ID");
assert.match(html, /sensor-health\.css\?v=/);
assert.match(html, /sensor-health\.js\?v=/);
assert.match(ui, /"Unavailable"/);
assert.match(ui, /"Low battery"/);
assert.match(sw, /\.\/sensor-health\.js/);
assert.match(sw, /\.\/sensor-health\.css/);
assert.match(sw, /\.\/notification-storage\.js/, "PWA notification preferences must remain cached");
console.log("PASS: four-sensor battery UI, low/normal/unavailable classification, WH52 provenance and stale-data handling");
