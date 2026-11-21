import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const worker = readFileSync(new URL("_worker/worker.mjs", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");
const station = readFileSync(new URL("station.html", root), "utf8");
const css = readFileSync(new URL("sensor-health.css", root), "utf8");
const ui = readFileSync(new URL("sensor-health.js", root), "utf8");
const sw = readFileSync(new URL("service-worker.js", root), "utf8");
const start = worker.indexOf("/* Read battery indicators from the most recent Cloud Ecowitt payload.");
const stop = worker.indexOf("async function buildQuality(env)", start);
assert.ok(start >= 0 && stop > start, "Worker's standalone sensor battery helper must exist");

const context = {
  PAYLOAD_TABLE: "latest_payload_v1",
  META_TABLE: "parknacross_meta_v1",
  WH52_UPLOAD_META_KEY: "wh52_gateway_latest_v1",
  console,
  usableNumber: value => value !== null && value !== undefined && Number.isFinite(Number(value)),
  extractWh52: data => ({
    channel: data.soil_ec_temp1 !== undefined || data.soil_ec1 !== undefined ? 1 : null,
    temperature_c: data.soil_ec_temp1 ?? null,
    ec_us_cm: data.soil_ec1 ?? null
  })
};
runInNewContext(worker.slice(start, stop) +
  "\nglobalThis.batteryFns = {buildSensorHealth};", context);
const read = async (data, ageMinutes = 2, gateway = null, gatewayAgeMinutes = 2) => {
  const epoch = Math.floor(Date.now() / 1000) - Math.round(ageMinutes * 60);
  const gatewayEpoch = Math.floor(Date.now() / 1000) - Math.round(gatewayAgeMinutes * 60);
  const env = {
    DB: { prepare(sql) {
      if (sql.startsWith("SELECT epoch, raw_json FROM latest_payload_v1")) {
        return { first: async () => data ? ({ epoch, raw_json: JSON.stringify({ data }) }) : null };
      }
      assert.match(sql, /^SELECT value FROM parknacross_meta_v1/);
      return { bind(key) {
        assert.equal(key, "wh52_gateway_latest_v1");
        return { first: async () => gateway
          ? { value: JSON.stringify({
              channel: 1, temperature_c: 13, ec_us_cm: 50,
              battery_v: gateway.value,
              battery_report_epoch: gatewayEpoch,
              received_epoch: gatewayEpoch
            }) }
          : null };
      } };
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

response = await read({
  battery: { soilmoisture_ec_sensor_ch1: { value: "1.44" } }
});
assert.equal(response.sensors.soil.state, "normal",
  "The dedicated WH52 Ecowitt API battery field works without separate EC measurements");
assert.equal(response.sensors.soil.value, 1.44);

response = await read({
  soil_ec_temp1: 13,
  battery: { soilmoisture_sensor_ch1: { value: "1.48" } }
});
assert.equal(response.sensors.soil.state, "normal",
  "Ecowitt's documented soilmoisture_sensor_ch1 key supports WH52 channel 1");

response = await read({
  battery: { soilmoisture_sensor_ch1: { value: "1.48" } }
});
assert.equal(response.sensors.soil.state, "unavailable",
  "Shared WH51/WH52 channel batteries cannot be assigned to WH52 without proof");

response = await read(null, 40, { value: 1.53 });
assert.equal(response.sensors.soil.state, "normal",
  "Direct WH52 gateway battery data must work when the cloud is unavailable");
assert.equal(response.sensors.soil.source, "GW3001 WH52 upload");

response = await read({ battery: { lightning_sensor: { value: 4 } } },
  2, { value: 1.03 }, 2);
assert.equal(response.sensors.soil.state, "low",
  "Low WH52 gateway voltage is reported even when the cloud omits soil");
assert.equal(response.sensors.lightning.state, "normal");

response = await read(null, 40, { value: 1.53 }, 40);
assert.equal(response.sensors.soil.state, "unavailable",
  "Stale gateway battery evidence must never be marked normal");


response = await read({ battery: { lightning_sensor: { value: 5 } } }, 31);
assert.equal(response.sensors.lightning.state, "unavailable", "Stale cloud payload must not show healthy");
assert.equal(response.sensors.rain.state, "unavailable");
assert.equal(response.sensors.soil.state, "unavailable");

assert.ok(worker.includes("soil_ec_batt"), 
  "Authenticated WH52 gateway field must be retained");
assert.match(worker, /battery_report_epoch: wh52Battery.state/,
  "Gateway record must preserve separate battery report age");
assert.match(worker, /url\.pathname === "\/sensor-health"/);
assert.match(station, /id="stationSensorHealth"/);
for (const id of ["sensorHealthRain", "sensorHealthLightning", "sensorHealthSoil", "stationBattery"]) {
  assert.match(station, new RegExp('id="' + id + '"'), id + " belongs on Station");
  assert.doesNotMatch(html, new RegExp('id="' + id + '"'), id + " should not be on dashboard");
}
assert.doesNotMatch(html, /id="battery"/, "Dashboard battery tile is removed");
assert.doesNotMatch(station, /id="qualityBattery"/, "No second battery display in collection statistics");
assert.match(html, /id="sensorBatteryWarning"[^>]*hidden/, "Warning starts hidden");
assert.match(html, /href="station.html#stationSensorHealth"/);
assert.match(html, /sensor-health\\.css\\?v=/);
assert.match(html, /sensor-health\\.js\\?v=/);
assert.match(station, /sensor-health\\.css\\?v=/);
assert.match(station, /sensor-health\\.js\\?v=/);
assert.match(css, /sensor-battery-warning\\[hidden\\]/, "Hidden alert remains visually hidden");
assert.match(css, /#dashboard > \\.sensor-battery-warning \\{ order: 4;/,
  "Low-battery banner follows live status in flex layout");
assert.match(ui, /"Unavailable"/);
assert.match(ui, /"Low battery"/);
assert.match(ui, /mainBatteryLow/, "Dashboard independently monitors WS90 for genuinely low voltage");
assert.match(ui, /sensorReport\\?\\.sensors\\?\\.\\[key\\]\\?\\.state === "low"/,
  "Unavailable sensor reports must not trigger dashboard warnings");
assert.match(station, /notification-storage\\.js\\?v=20261120-persistent-notifications/);
assert.match(html, /notification-storage\\.js\\?v=20261120-persistent-notifications/);
assert.match(sw, /\.\/sensor-health\.js/);
assert.match(sw, /\.\/sensor-health\.css/);
assert.match(sw, /\.\/notification-storage\.js/, "PWA notification preferences must remain cached");
console.log("PASS: Ecowitt battery mappings, stale-data handling and site layout assertions");

// Exercise the actual client-side report rendering without a browser or network.
async function renderSensorHealth(page, batteryReport, current) {
  const node = () => ({
    textContent: "", title: "", hidden: false,
    classList: { remove() {}, add() {} }
  });
  const names = page === "station"
    ? ["stationSensorHealth", "stationBattery", "sensorHealthRain",
       "sensorHealthLightning", "sensorHealthSoil", "sensorHealthNote"]
    : ["sensorBatteryWarning", "sensorBatteryWarningText"];
  const elements = Object.fromEntries(names.map(name => [name, node()]));
  if (page === "station") elements.stationBattery.textContent = "Normal · 3.02 V";
  const sandbox = {
    document: {readyState: "complete", getElementById: id => elements[id] ?? null},
    fetch: async uri => ({
      ok: true, json: async () => String(uri).endsWith("/current") ? current : batteryReport
    }),
    AbortController,
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 2,
    Date, Number, Object
  };
  runInNewContext(ui, sandbox);
  await new Promise(resolve => setImmediate(resolve));
  return elements;
}

const now = Math.floor(Date.now()/1000);
let rendered = await renderSensorHealth("station", {sensors: {
  rain: {state:"normal", value:1.49, unit:"V"},
  lightning: {state:"low", value:1, unit:"level"},
  soil: {state:"unavailable"}
}}, null);
assert.match(rendered.sensorHealthRain.textContent, /^Normal/);
assert.match(rendered.sensorHealthLightning.textContent, /^Low battery/);
assert.equal(rendered.sensorHealthSoil.textContent, "Unavailable");
assert.equal(rendered.stationBattery.textContent, "Normal · 3.02 V",
  "Sensor report must not overwrite main battery sourced from /current");

rendered = await renderSensorHealth("dashboard", {sensors: {
  rain: {state:"unavailable"}, lightning: {state:"normal"}, soil: {state:"unavailable"}
}}, {epoch:now,battery_v:3.01});
assert.equal(rendered.sensorBatteryWarning.hidden, true,
  "Missing and normal readings do not show a dashboard warning");

rendered = await renderSensorHealth("dashboard", {sensors: {
  rain: {state:"low"}, lightning: {state:"normal"}, soil: {state:"unavailable"}
}}, {epoch:now,battery_v:3.01});
assert.equal(rendered.sensorBatteryWarning.hidden, false);
assert.match(rendered.sensorBatteryWarningText.textContent, /Rain gauge battery low/);

rendered = await renderSensorHealth("dashboard", null, {epoch:now,battery_v:2.54});
assert.equal(rendered.sensorBatteryWarning.hidden, false);
assert.match(rendered.sensorBatteryWarningText.textContent, /Main weather sensor battery low/);

rendered = await renderSensorHealth("dashboard", null, {epoch:now-3600,battery_v:2.54});
assert.equal(rendered.sensorBatteryWarning.hidden, true,
  "Stale weather readings must never create low-battery alerts");

console.log("PASS: battery readings moved to Station; only confirmed low-battery warnings on dashboard");

