import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("coast.html"),js=read("cahore-waterlevel.js"),worker=read("_worker/worker.mjs");
for(const id of ["cahoreWaterHeading","cahoreWaterLevel","cahoreWaterTrend","cahoreWaterUpdated","cahoreWaterChart"]){
  assert.match(html,new RegExp('id="'+id+'"'));
}
assert.ok(html.indexOf('id="tideList"')<html.indexOf('id="cahoreWaterHeading"'));
assert.ok(html.indexOf('id="cahoreWaterHeading"')<html.indexOf('Water safety</span>'));
assert.match(html,/local staff-gauge zero/);
assert.match(html,/not chart datum or predicted Arklow tide heights/);
assert.match(html,/WaterLevel\.ie/);
assert.match(html,/CC BY 4\.0/);
assert.match(html,/cahore-waterlevel\.js\?v=/);
assert.match(html,/cahore-waterlevel\.css\?v=/);
assert.match(read("service-worker.js"),/"\.\/cahore-waterlevel\.js"/);
assert.match(read("service-worker.js"),/"\.\/cahore-waterlevel\.css"/);
assert.match(worker,/if \(url\.pathname === "\/marine\/cahore-water-level"\)/);
assert.match(worker,/cachedJson\(request, ctx, 900, \(\) => getCahorePierWaterLevel\(\)\)/);
assert.match(worker,/https:\/\/waterlevel\.ie\/data\/day\/11061_0001\.csv/);
assert.doesNotThrow(()=>new vm.Script(js,{filename:"cahore-waterlevel.js"}));

const start=worker.indexOf("function parseCahoreWaterLevelCsv(");
const end=worker.indexOf("async function getTides(url)",start);
assert.ok(start>0&&end>start,"The Worker exposes an isolated Cahore parser");
const sandbox={Date,Number,Math,String,Array,JSON,Promise,parseCsvLine:line=>line.split(",")};
vm.createContext(sandbox);
vm.runInContext(worker.slice(start,end),sandbox);
const parse=sandbox.parseCahoreWaterLevelCsv;
const now=Date.parse("2026-11-13T13:30:00Z");
const csv=[
  "Date,Value,Quality",
  "2026/11/13 12:00:00,1.10,0",
  "2026/11/13 12:45:00,1.30,0",
  "2026/11/13 13:00:00,1.42,0",
  "2026/11/13 13:15:00,1.55,0"
].join("\n");
const good=parse(csv,now);
assert.equal(good.status,"ok");
assert.equal(good.water_level_m,1.55);
assert.equal(good.trend,"rising");
assert.equal(good.readings.length,4);
assert.match(good.datum,/local staff gauge zero/);
const declining=parse("2026-11-13 12:30:00,1.70,0\n2026-11-13 13:15:00,1.20,0",now);
assert.equal(declining.trend,"falling");
const dmy=parse("13/11/2026 12:30:00,1.50,0\n13/11/2026 13:15:00,1.50,0",now);
assert.equal(dmy.trend,"steady");
const stale=parse("2026/11/13 10:00:00,1.45,0",now);
assert.equal(stale.status,"stale");
assert.equal(stale.water_level_m,null);
assert.equal(stale.readings.length,0);
const invalid=parse("Date,Value,Quality\n2026/11/13 14:30:00,1.50,0\n2026/11/13 13:15:00,100.00,0",now);
assert.equal(invalid.status,"unavailable");
assert.equal(invalid.water_level_m,null);

async function render(result,throwError=false){
  const nodes=new Map();
  const document={
    addEventListener(type,handler){if(type==="DOMContentLoaded")this.ready=handler;},
    getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:"",innerHTML:"",href:""});return nodes.get(id);}
  };
  const ctx={document,window:{PARKNACROSS_CONFIG:{apiBase:"https://worker.example"}},
    fetch:async url=>{
      assert.match(url,/\/marine\/cahore-water-level$/);
      if(throwError)throw Error("upstream unavailable");
      return {ok:true,json:async()=>result};
    },
    AbortController,Date,Number,Math,Array,JSON,String,Intl,setTimeout,clearTimeout,setInterval(){}};
  vm.runInNewContext(js,ctx);
  document.ready();
  await new Promise(resolve=>setTimeout(resolve,0));
  await new Promise(resolve=>setImmediate(resolve));
  return nodes;
}
const observed=new Date(Date.now()-15*60*1000).toISOString();
const earlier=new Date(Date.now()-65*60*1000).toISOString();
const ui=await render({status:"ok",observed_at:observed,water_level_m:1.61,trend:"rising",
  readings:[{time:earlier,water_level_m:1.22},{time:observed,water_level_m:1.61}]});
assert.equal(ui.get("cahoreWaterLevel").textContent,"1.61 m");
assert.match(ui.get("cahoreWaterTrend").textContent,/Rising/);
assert.match(ui.get("cahoreWaterChart").innerHTML,/<svg/);
assert.match(ui.get("cahoreWaterSource").href,/waterlevel\.ie\/0000011061/);
const uiStale=await render({status:"stale",observed_at:new Date(Date.now()-4*3600000).toISOString(),
  water_level_m:1.61,trend:"rising",readings:[]});
assert.equal(uiStale.get("cahoreWaterLevel").textContent,"Unavailable");
assert.doesNotMatch(uiStale.get("cahoreWaterLevel").textContent,/1\.61/);
const uiOffline=await render({},true);
assert.equal(uiOffline.get("cahoreWaterLevel").textContent,"Unavailable");
console.log("PASS: Cahore gauge API, staff-gauge datum, freshness, trend, mobile assets and UI fallbacks.");
