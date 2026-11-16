import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const nodes=new Map();
const document={
  getElementById(id){
    if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,dataset:{}});
    return nodes.get(id);
  },
  querySelector(){return null;}
};
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../local-forecast.js',import.meta.url),'utf8'),{
  window,document,Intl,Date,Map,Number,String,Math
});
const forecast=window.ParknacrossLocalForecast;
const now=Date.parse('2026-11-16T12:08:00Z');
const first=Date.parse('2026-11-16T13:00:00Z')/1000;
const makeFeed=(nightMm,source='Met Éireann point forecast')=>({
  source,fallback:source==='Open-Meteo',
  fetched_at:new Date(now).toISOString(),
  points:Array.from({length:26},(_,i)=>({
    epoch:first+i*3600,temperature_c:8,wind_kmh:30,
    rain_mm:i>=5&&i<17?nightMm/12:0.2
  }))
});
const met=makeFeed(26.6),independent=makeFeed(8.4,'Open-Meteo');
const primary=forecast.describe(met,now);
assert.equal(primary.periods[1].complete,true);
assert.equal(primary.periods[1].hours.length,12);
assert.ok(Math.abs(primary.periods[1].rainTotalMm-26.6)<1e-6);
const compare=forecast.compare(met,independent,now);
assert.equal(compare[1].disagree,true);
assert.ok(Math.abs(compare[1].otherMm-8.4)<1e-6);
forecast.renderComparison(met,independent,now);
assert.equal(nodes.get('forecastTonightComparison').dataset.level,'disagreement');
assert.ok(nodes.get('forecastTonightComparison').textContent.includes('26.6 mm vs Open-Meteo 8.4 mm'));
assert.match(nodes.get('forecastTonightSummary').textContent,/uncertain/);
const agreeing=forecast.compare(met,makeFeed(24,'Open-Meteo'),now);
assert.equal(agreeing[1].disagree,false);
assert.equal(forecast.compare(met,{...independent,fallback:false},now),null);
const missing={...independent,points:independent.points.filter((_,i)=>i!==10)};
assert.equal(forecast.compare(met,missing,now)[1],null,'missing independent hour cannot be compared');
const missingPrimary={...met,points:met.points.filter((_,i)=>i!==10)};
assert.equal(forecast.describe(missingPrimary,now).periods[1].complete,false);
assert.match(forecast.describe(missingPrimary,now).periods[1].text,/Rain in available hours/);
const truncated={...met,points:met.points.slice(0,12)};
assert.equal(forecast.describe(truncated,now).periods[1].complete,false,'truncated night is not a full-night total');
const earlier={...met,fetched_at:'2026-11-16T09:00:00Z'};
assert.equal(forecast.describe(earlier,now),null,'stale source must be rejected');
const dstNow=Date.parse('2026-10-24T16:00:00Z'),dstFirst=Date.parse('2026-10-24T17:00:00Z')/1000;
const dst={fetched_at:new Date(dstNow).toISOString(),points:Array.from({length:25},(_,i)=>({
  epoch:dstFirst+i*3600,temperature_c:8,wind_kmh:10,rain_mm:1
}))};
assert.equal(forecast.describe(dst,dstNow).periods[1].rainTotalMm,13,'clock-change night is 13 hours');
console.log('PASS: same-hours rain model cross-check, disagreement flag, missing-data safeguards and DST.');
