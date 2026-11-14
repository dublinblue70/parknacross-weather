import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read=name=>fs.readFileSync(new URL("../"+name,import.meta.url),"utf8");
const status=read("status.js"),page=read("status.html"),ui=read("status-ui.js");
assert.match(page,/id="cahoreObservationInfo"[^>]*role="status"/);
assert.match(page,/id="health-cahore"/);
assert.doesNotMatch(page,/id="health-m2"/);
assert.match(status,/Cahore Pier data is delayed/);
assert.match(ui,/Cahore Pier water levels could not be verified/);
assert.match(page,/status-ui\.css\?v=[^"\s]+/);

const sandbox={window:{},document:{addEventListener(){}},Date,Math,Number,Intl};
vm.createContext(sandbox);
vm.runInContext(status,sandbox,{filename:"status.js"});
const classify=sandbox.classifyM2Observation;
assert.equal(typeof classify,"function");
const now=Date.parse("2026-11-06T22:00:00Z");
const sample=(hours,extra={})=>({
  m2_observation_available:true,
  m2_buoy:{sea_surface_temperature_c:13.9,observation_time:new Date(now-hours*3600000).toISOString(),...extra}
});
for(const [hours,expected] of [[2,"good"],[4,"warn"],[11,"warn"],[13,"unavailable"]]){
  assert.equal(classify(sample(hours),now).state,expected, `${hours}-hour-old M2 observation`);
}
assert.equal(classify(sample(-0.01),now).state,"good","Minor clock skew");
assert.equal(classify(sample(-0.2),now).state,"unavailable","Future-dated sample");
assert.equal(classify(sample(1,{sea_surface_temperature_c:null}),now).state,"unavailable","Missing value");
assert.equal(classify(sample(1,{sea_surface_temperature_c:99}),now).state,"unavailable","Outlier value");
assert.equal(classify(sample(1,{observation_time:"invalid"}),now).state,"unavailable","Invalid timestamp");
assert.equal(classify({m2_observation_available:true,m2_buoy:{sea_surface_temperature_c:13.9,observation_age_minutes:1}},now).state,"unavailable","No supplied timestamp must not count as live");
assert.equal(classify({...sample(1),__error:new Error("offline")},now).state,"unavailable","Failed feed");
assert.equal(classify({...sample(1),m2_observation_available:false},now).state,"unavailable","Provider unavailable");
assert.equal(classify(sample(0.2),now).state,"good","Recovery");
console.log("PASS: M2 freshness, outages, recovery, clock skew, value and timestamp validation.");

// Regression coverage for the production Worker (not the archived root snapshot).
const workerSource=read("_worker/worker.mjs");
const strategyStart=workerSource.indexOf("async function getMarineInstituteM2SeaTemperature() {");
const strategyEnd=workerSource.indexOf("\nasync function getMarineInstituteM2SeaTemperatureErddap()",strategyStart);
const cacheStart=workerSource.indexOf("async function storeOrReadLastM2Observation(env, observation) {");
const cacheEnd=workerSource.indexOf("\nasync function buildClimateSummary(env)",cacheStart);
assert.ok(strategyStart>=0&&strategyEnd>strategyStart&&cacheStart>=0&&cacheEnd>cacheStart);
assert.match(workerSource,/headers: \{ "Accept": "text\/csv" \}\s*\}, 8000\)/);
const feedSandbox={
  Date,Number,Math,Promise,JSON,String,console,
  getMarineInstituteM2SeaTemperatureErddap:async()=>({is_stale:true,observation_time:"2026-11-11T00:00:00Z",observation_age_minutes:900}),
  getMetEireannM2SeaTemperature:async()=>({is_stale:false,observation_time:"2026-11-12T12:00:00Z",observation_age_minutes:10})
};
vm.createContext(feedSandbox);
vm.runInContext(workerSource.slice(strategyStart,strategyEnd),feedSandbox);
let m2=await feedSandbox.getMarineInstituteM2SeaTemperature();
assert.equal(m2.state,"current","newer backup beats stale primary");
assert.equal(m2.observation.observation_time,"2026-11-12T12:00:00Z");
feedSandbox.getMetEireannM2SeaTemperature=async()=>({is_stale:true,observation_time:"2026-11-11T02:00:00Z",observation_age_minutes:800});
m2=await feedSandbox.getMarineInstituteM2SeaTemperature();
assert.equal(m2.state,"upstream_delayed","stale official data has its own status");
assert.equal(m2.observation.observation_time,"2026-11-11T02:00:00Z");
feedSandbox.getMarineInstituteM2SeaTemperatureErddap=async()=>{throw Error("HTTP 503");};
feedSandbox.getMetEireannM2SeaTemperature=async()=>{throw Error("request timed out");};
m2=await feedSandbox.getMarineInstituteM2SeaTemperature();
assert.equal(m2.state,"retrieval_failed","retrieval errors cannot be called delayed readings");
assert.equal(m2.observation,null);

let saved=null;
const fakeDB={prepare(query){let args=[];return{
  bind(...values){args=values;return this;},
  async run(){if(query.startsWith("INSERT")){if(!saved||args[1]>saved.observed_at)saved={observation_json:args[0],observed_at:args[1]};}return{};},
  async first(){return saved?{observation_json:saved.observation_json}:null;}
};}};
feedSandbox.getLocalSeaTemperatureModel=async()=>({sea_surface_temperature_c:12.5,source_type:"model",model_time:"2026-11-12T12:00:00Z"});
vm.runInContext(workerSource.slice(cacheStart,cacheEnd),feedSandbox);
const historical={sea_surface_temperature_c:12.9,observation_time:"2026-11-11T02:00:00Z",source_type:"observation"};
const stored=await feedSandbox.storeOrReadLastM2Observation({DB:fakeDB},historical);
assert.equal(stored.sea_surface_temperature_c,12.9);
feedSandbox.getMarineInstituteM2SeaTemperature=async()=>({observation:null,state:"retrieval_failed",detail:"HTTP 503"});
const fallback=await feedSandbox.getSeaSurfaceTemperature({DB:fakeDB});
assert.equal(fallback.local_model.sea_surface_temperature_c,12.5,"local coastal model remains available");
assert.equal(fallback.m2_buoy.observation_time,historical.observation_time,"historical buoy survives retrieval failure");
assert.equal(fallback.m2_source_status,"retrieval_failed");
assert.equal(fallback.m2_observation_available,false,"historical reading must not masquerade as live");
console.log("PASS: M2 source failover, delayed-vs-retrieval diagnostics, durable history and coastal isolation.");

