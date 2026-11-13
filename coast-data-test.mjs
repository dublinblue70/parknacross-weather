import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = await readFile(new URL("./coast.js", import.meta.url), "utf8");

async function runApi(api) {
  const nodes = new Map();
  const document = {
    addEventListener(name, callback) { if (name === "DOMContentLoaded") this.ready = callback; },
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: "", innerHTML: "", classList: { add() {} }, dataset: {} });
      return nodes.get(id);
    }
  };
  const context = {
    window: { PARKNACROSS_CONFIG: { apiBase: "https://weather.invalid" } },
    document,
    fetch: api,
    AbortController,
    Date,
    Intl,
    Math,
    Number,
    String,
    setTimeout,
    clearTimeout,
    setInterval() {},
    console: { error() {} }
  };
  vm.runInNewContext(await readFile(new URL("./source-freshness.js",import.meta.url),"utf8"),context);
  vm.runInNewContext(source, context, { filename: "coast.js" });
  document.ready();
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setImmediate(resolve));
  return nodes;
}

const empty = await runApi(async url => ({
  ok: true,
  async json() {
    if (url.includes("/marine/tides")) return { events: [] };
    return {};
  }
}));
assert.equal(empty.get("tideList").textContent, "Arklow tide predictions are temporarily unavailable.");
assert.notEqual(empty.get("tideList").textContent, "Loading tide predictions…");
assert.equal(empty.get("localSeaTemp").textContent, "Unavailable");
assert.equal(empty.get("coastWarn").textContent, "Marine warning status unavailable");
assert.match(empty.get("coastIssued").textContent,/Wicklow Head to Carnsore Point/);

const failed = await runApi(async () => { throw new Error("offline"); });
assert.equal(failed.get("nextTide").textContent, "Unavailable");
assert.equal(failed.get("localSeaTempTime").textContent, "Coastal estimate temporarily unavailable");
assert.equal(failed.get("coastWarn").textContent, "Marine warning status unavailable");

const calm = await runApi(async url => ({ok:true,async json(){
  if(url.endsWith("/current"))return {epoch:Date.now()/1000,wind_speed_kmh:0,wind_gust_kmh:0,wind_direction_deg:270};
  if(url.includes("/marine/tides"))return {events:[]};
  return {};
}}));
assert.match(calm.get("coastDir").textContent,/Calm · direction unavailable/);
assert.equal(calm.get("coastExposure").textContent,"Calm");
assert.match(calm.get("coastExposureDetail").textContent,/No meaningful wind direction/);
assert.match(calm.get("swimSummary").textContent,/calm wind 0\.0 km\/h · direction unavailable/i);

const predicted = await runApi(async url => ({ok:true,async json(){
  if(url.includes("/marine/tides"))return {events:[
    {time:new Date(Date.now()-60*60*1000).toISOString(),type:"low",height_m:-0.09},
    {time:new Date(Date.now()+4*60*60*1000).toISOString(),type:"high",height_m:0.46}
  ]};
  return {};
}}));
assert.match(predicted.get("tideList").innerHTML,/0\.46 m/);
assert.match(predicted.get("tideList").innerHTML,/-0\.09 m/);
assert.doesNotMatch(predicted.get("tideList").innerHTML,/OD Malin/);
assert.match(predicted.get("nextTideTime").textContent,/0\.46 m/);
assert.doesNotMatch(predicted.get("nextTideTime").textContent,/OD Malin/);

const localOnly=await runApi(async url=>({ok:true,async json(){
  if(url.includes("/met/marine"))return {
    local_warning_status_available:true,local_warning_relevant:true,
    local_small_craft_warning:true,local_warning_sector:"Wicklow Head to Carnsore Point",
    local_warning_valid_text:"Today 12:00–18:00",
    local_area:{area:"Belfast Lough to Mizen Head",wind:"Whole coast"},
    outlook:{text:"Generic nationwide outlook"}
  };
  if(url.includes("/marine/tides"))return {events:[]};
  if(url.includes("/marine/sea-temperature"))return {
    local_model:{sea_surface_temperature_c:13.2,model_time:new Date().toISOString()},
    m2_observation_available:true,
    m2_buoy:{sea_surface_temperature_c:8.1,observation_time:new Date().toISOString()}
  };
  return {};
}}));
assert.equal(localOnly.get("coastWarn").textContent,"Small Craft warning");
assert.match(localOnly.get("coastIssued").textContent,/Wicklow Head to Carnsore Point/);
assert.equal(localOnly.get("localSeaTemp").textContent,"13.2 °C");
assert.doesNotMatch(localOnly.get("swimSummary").textContent,/Belfast Lough|Mizen Head|nationwide|8\.1 °C/);
const coastMarkup=await readFile(new URL("./coast.html",import.meta.url),"utf8");
assert.doesNotMatch(coastMarkup,/id="marineArea"|id="marineOutlook"|id="m2SeaTemp"/);
assert.match(coastMarkup,/North Wexford marine warning/);
assert.match(coastMarkup,/warnings\/today\/marine\/EI811/);

console.log("Coast data fallbacks and local-only marine presentation tests passed.");
