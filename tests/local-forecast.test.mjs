import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const window={};vm.runInNewContext(fs.readFileSync(new URL('../local-forecast.js',import.meta.url),'utf8'),{window,document:{getElementById(){}},Intl,Date,Map,Number,String,Math});
const describe=window.ParknacrossLocalForecast.describe,now=Date.parse('2026-10-21T08:30:00Z');
const feed={fetched_at:new Date(now).toISOString(),points:Array.from({length:25},(_,i)=>({epoch:Date.parse('2026-10-21T09:00Z')/1000+i*3600,temperature_c:i===0?0:10,wind_kmh:0,rain_mm:0}))};
let r=describe(feed,now);assert.ok(r);assert.match(r.periods[0].text,/0–10 °C/);assert.match(r.periods[0].text,/Wind: 0 km\/h/);assert.match(r.periods[0].text,/Dry/);assert.match(r.periods[2].label,/morning/);assert.match(r.periods[2].coverage,/22 Oct/);
assert.equal(describe({...feed,fetched_at:'2026-10-21T06:00:00Z'},now),null);assert.equal(describe({...feed,fetched_at:'2026-10-22T06:00:00Z'},now),null);
const gap={...feed,points:feed.points.filter((_,i)=>i!==1).map((p,i)=>i===0?{...p,rain_mm:null}:p)};r=describe(gap,now);assert.match(r.periods[0].text,/Rain in available hours/);assert.doesNotMatch(r.periods[0].text,/Dry/);assert.match(r.periods[0].coverage,/missing/);
const dstNow=Date.parse('2026-10-24T16:00:00Z'),dstFeed={fetched_at:new Date(dstNow).toISOString(),points:Array.from({length:24},(_,i)=>({epoch:Date.parse('2026-10-24T17:00Z')/1000+i*3600,temperature_c:8,wind_kmh:10,rain_mm:1}))};r=describe(dstFeed,dstNow);assert.match(r.periods[1].text,/13 mm/);
console.log('PASS: local periods, zero values, partial rain, stale/future data and the 13-hour autumn clock-change night.');
