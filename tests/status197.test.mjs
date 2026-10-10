import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {checkPublicSite} from '../public-monitor.mjs';
const context={window:{},document:{addEventListener(){}},Date,Number,Math};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../status.js',import.meta.url),'utf8'),context);
for(const date of ['2026-03-29T01:05:00Z','2026-10-25T02:05:00Z','2026-10-10T23:01:00Z']){
 const now=Date.parse(date)/1000;const full=context.recentSampleCoverage(100,now-86400*2,now);assert.equal(full.expected,288);assert.ok(full.percent<35);
 const commissioning=context.recentSampleCoverage(5,now-1200,now);assert.equal(commissioning.expected,5);assert.equal(commissioning.percent,100);assert.equal(commissioning.commissioning,true);
 assert.ok(context.observationAge(now+901,now)< -120);assert.equal(context.observationAge(null,now),null);
}
const now=Date.parse('2026-10-10T23:01:00Z'),requests=[];
const results=await checkPublicSite({now,fetcher:async url=>{
 requests.push(url);const path=new URL(url).pathname;
 const data=path==='/current'?{epoch:now/1000-60}:path==='/history'?{readings:[{epoch:now/1000-60}]}:path==='/daily'?{days:[{day:'2026-10-11'}]}:path==='/rain-events'?{events:[],event_count:0}:path==='/coverage'?{days:[{day:'2026-10-11'}],summary:{coverage_percent:100}}:path==='/stats'?{total_samples:200,records:{}}:{count:3,last_epoch:now/1000-60,columns:['soil_moisture_pct','lightning_strikes']};
 return{ok:true,json:async()=>data,text:async()=>path==='/export.csv'?'observation_time_ireland\nreading1\nreading2':'PARKNACROSS WEATHER'};
}});
assert.ok(results.every(r=>r.ok));for(const url of requests.filter(u=>/export/.test(u))){const q=new URL(url).searchParams;assert.equal(q.get('from'),'2026-10-10');assert.equal(q.get('to'),'2026-10-11');}
console.log('PASS: expected five-minute saves, commissioning, DST, invalid timestamps and midnight-safe independent monitoring exports.');
