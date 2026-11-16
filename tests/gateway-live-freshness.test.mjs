import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Test the actual deployed-source function in isolation: the live record must
// survive a newer status packet that lacks weather data, and the fresh newest
// valid observation must win over older legacy/archived records.
const worker=fs.readFileSync(new URL('../_worker/worker.mjs',import.meta.url),'utf8');
assert.match(worker,/const GATEWAY_LIVE_META_KEY = "gateway_live_observation_v1"/);
assert.match(worker,/if \(liveReading\) \{[\s\S]*?\.bind\(GATEWAY_LIVE_META_KEY, JSON\.stringify\(liveReading\), receivedEpoch\)/);
assert.match(worker,/formatted\.observation_source = latest\?\.source/);
assert.match(worker,/formatted\.observation_age_seconds/);
const start=worker.indexOf('async function readGatewayLiveReading(');
const end=worker.indexOf('// Optional WS90 fallback',start);
assert.ok(start>0&&end>start);
const context={
 META_TABLE:'meta',GATEWAY_LIVE_META_KEY:'gateway_live_observation_v1',
 WH52_UPLOAD_STATUS_META_KEY:'wh52_gateway_status_v1',
 nullableNumber:x=>x==null||x===''?null:Number(x),
 validateWeatherReading:x=>({...x})
};
vm.createContext(context);
vm.runInContext(worker.slice(start,end)+'\nthis.readGatewayLiveReading=readGatewayLiveReading;',context);
const now=1800000000;
const reading=(age)=>({epoch:now-age,temperature_c:8.3,rain_rate_mm_h:3.5,rain_daily_mm:4});
const test=async records=>{
 let bindings=[];
 const env={DB:{prepare:sql=>({bind(...keys){bindings=keys;return this;},all:async()=>({results:records.map(([key,value])=>({key,value:JSON.stringify(value)}))})})}};
 const result=await context.readGatewayLiveReading(env,now);
 assert.deepEqual(bindings,['gateway_live_observation_v1','wh52_gateway_status_v1']);
 return result;
};
let result=await test([
 ['gateway_live_observation_v1',reading(35)],
 ['wh52_gateway_status_v1',{received_epoch:now-1,live_reading:null}]
]);
assert.equal(result.epoch,now-35,'Soil-only packet must not erase latest live weather reading');
assert.equal(result.source,'gw3001_direct_live');
result=await test([
 ['gateway_live_observation_v1',reading(100)],
 ['wh52_gateway_status_v1',{live_reading:reading(10)}]
]);
assert.equal(result.epoch,now-10,'Choose latest valid live packet');
result=await test([
 ['gateway_live_observation_v1',reading(400)],
 ['wh52_gateway_status_v1',{live_reading:null}]
]);
assert.equal(result,null,'Do not misrepresent stale gateway weather as live');
result=await test([
 ['wh52_gateway_status_v1',{live_reading:reading(80)}]
]);
assert.equal(result.epoch,now-80,'Preserve compatibility with previously stored gateway status');
console.log('PASS: recent independent live data survives soil-only status, newest record wins, stale records rejected, legacy compatible.');
