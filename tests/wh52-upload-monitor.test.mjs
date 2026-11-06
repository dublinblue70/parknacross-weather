import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = name => fs.readFileSync(new URL("../" + name, import.meta.url), "utf8");
const app = read("app.js");
const dashboard = read("index.html");
const status = read("status.js");
const statusHtml = read("status.html");
const ui = read("status-ui.js");
const worker = read("_worker/worker.mjs");

assert.match(dashboard, /id="soilPanel" class="soil-panel" aria-labelledby="soilHeading"/);
assert.match(dashboard, /id="soilFeedWarning"/);
assert.match(statusHtml, /id="soilLastUpload"/);
assert.match(statusHtml, /data-health-key="soil" data-health-source="soilUpload"/);
assert.match(status, /read\("soilUpload"/);
assert.match(status, /last_successful_upload_epoch/);
assert.match(ui, /of 20 sources checked/);
assert.match(worker, /last_successful_upload_epoch: lastSuccessfulEpoch/);
assert.match(worker, /WH52_UPLOAD_META_KEY\)\.first\(\)/);

const start = app.indexOf("let latestSoilUploadStatus = null;");
const end = app.indexOf("function updateSoilPanel(current)", start);
assert.ok(start !== -1 && end > start, "The dashboard has a WH52 feed-warning function");
const warning = {hidden:true,textContent:""};
const sandbox = {
  $: id => id === "soilFeedWarning" ? warning : null,
  usable: v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))
};
vm.runInNewContext(app.slice(start,end) +
  "\nglobalThis.checkSoil = (upload, current) => {latestSoilUploadStatus=upload; updateSoilFeedWarning(current)};", sandbox);
const now = Math.floor(Date.now()/1000);
const current = {soil_moisture_pct:36,soil_temperature_c:10.7,soil_ec_us_cm:20};
sandbox.checkSoil({gateway_upload_received:true,wh52_detected:true,received_epoch:now,last_successful_upload_epoch:now}, current);
assert.equal(warning.hidden,true, "Healthy WH52 uploads should not warn");
sandbox.checkSoil({gateway_upload_received:true,wh52_detected:true,received_epoch:now-2000,last_successful_upload_epoch:now-2000}, current);
assert.equal(warning.hidden,false, "Stale WH52 uploads must display a warning even with cached soil values");
assert.match(warning.textContent,/upload delayed/i);
sandbox.checkSoil({gateway_upload_received:true,wh52_detected:false,received_epoch:now,last_successful_upload_epoch:now-300}, current);
assert.match(warning.textContent,/no WH52 soil fields/i);
sandbox.checkSoil(null, {soil_moisture_pct:null,soil_temperature_c:null,soil_ec_us_cm:null});
assert.match(warning.textContent,/unavailable/i);
console.log("PASS: WH52 offline warning and last successful gateway upload are independently monitored.");
