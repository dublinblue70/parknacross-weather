import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={window:{},document:{addEventListener(){}}};vm.runInNewContext(fs.readFileSync('local-planning.js','utf8'),ctx);
const {rainOutlook,coastalWind}=ctx.window.ParknacrossLocalPlanning;
const now=Date.parse('2026-10-17T15:15:00Z'),start=Math.floor(now/3600000)*3600000;
const feed=values=>({fetched_at:new Date(now).toISOString(),points:values.map((rain_mm,i)=>({epoch:start/1000+i*3600,rain_mm}))});
assert.equal(rainOutlook(feed([0,0,.3,0,1,0]),now).wet.from,start+7200000);
assert.equal(rainOutlook(feed([0,0,0,0,0,0]),now).complete,true);
assert.equal(rainOutlook(feed([0,null,0,0,0,0]),now).complete,false);
assert.equal(rainOutlook(feed([null,null]),now),null);
assert.equal(rainOutlook({...feed([0]),fetched_at:'2026-10-16T15:15:00Z'},now),null);
assert.equal(rainOutlook(feed([.02,.1,0,0,0,0]),now).wet.from,start+3600000);
// Time axes use UTC epochs even at the Irish daylight-saving clock change.
const dst=Date.parse('2026-10-25T00:30:00Z');const d=rainOutlook({fetched_at:new Date(dst).toISOString(),points:[{epoch:dst/1000-1800,rain_mm:.2},{epoch:dst/1000+1800,rain_mm:0}]},dst);assert.equal(d.slots[1].from-d.slots[0].from,3600000);
const wind=d=>coastalWind({received_at:new Date(now).toISOString(),wind_speed_kmh:15,wind_gust_kmh:25,wind_direction_deg:d},now);
assert.equal(wind(90).exposure,'Onshore');assert.equal(wind(90).to,270);assert.equal(wind(270).exposure,'Offshore');assert.equal(wind(270).to,90);assert.equal(wind(0).exposure,'Alongshore');assert.equal(wind(180).exposure,'Alongshore');assert.equal(wind(null).state,'direction-unavailable');assert.equal(wind(400).state,'direction-unavailable');
assert.equal(coastalWind({epoch:now/1000,wind_speed_kmh:0,wind_direction_deg:90},now).state,'calm');
assert.equal(coastalWind({epoch:(now-11*60000)/1000,wind_speed_kmh:15,wind_direction_deg:90},now).state,'unavailable');
console.log('PASS: forecast coverage, missing/zero/drizzle, stale feeds, Irish DST epochs, meteorological from/to bearings, coastal sectors and calm wind.');
