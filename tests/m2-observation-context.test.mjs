import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read=name=>fs.readFileSync(new URL("../"+name,import.meta.url),"utf8");
const status=read("status.js"),page=read("status.html"),ui=read("status-ui.js");
assert.match(page,/id="m2ObservationInfo"[^>]*role="status"/);
assert.match(status,/Last available observation · not live/);
assert.match(ui,/a last available reading, not a live measurement/);
assert.match(page,/status-ui\.css\?v=20261106-m2-timestamp/);

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
