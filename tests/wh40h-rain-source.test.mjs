import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Regression guard: the WH40H must be selected as the primary rainfall
// source even when the gateway or cloud payload includes WS90 piezo values.
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const worker=read('_worker/worker.mjs');
const grab=(start,end)=>{const i=worker.indexOf(start);assert.ok(i>=0,'Missing '+start);const j=worker.indexOf(end,i+start.length);assert.ok(j>i,'Missing '+end);return worker.slice(i,j);};
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const ctx={
  normalizeSensorKey:k=>String(k).toLowerCase().replace(/[^a-z0-9]/g,''),
  numericSensorValue:number,
  usableNumber:v=>number(v)!==null,
  nullableNumber:number,
  round1:v=>Math.round(Number(v)*10)/10,
  apparentTemperatureC:()=>null,
  gatewayDewPointC:()=>null,
  validateWeatherReading:r=>r,
  normalizeLightningEpoch:v=>v
};
vm.createContext(ctx);
vm.runInContext(grab('function gatewayNumber(','function gatewayDewPointC('),ctx);
vm.runInContext(grab('function gatewayWeatherReading(','function gatewayLiveReading('),ctx);
const both=ctx.gatewayWeatherReading({
  rainratein:0.07874,dailyrainin:0.11811,rrain_piezo:0.9,drain_piezo:0.01574803
},null);
assert.equal(both.rain_rate_mm_h,2.0,'WH40H rate wins over WS90 piezo rate');
assert.equal(both.rain_daily_mm,3.0,'WH40H total wins over WS90 piezo total');
assert.equal(both.piezo_rain_rate_mm_h,22.9,'WS90 rate is exposed separately, not counted as WH40H rainfall');
assert.equal(both.piezo_daily_mm,0.4,'WS90 daily estimate is independent of WH40H total');
const zero=ctx.gatewayWeatherReading({rainratein:0,dailyrainin:0,rrain_piezo:0.9,drain_piezo:0.8},null);
assert.equal(zero.rain_rate_mm_h,0,'traditional zero is not replaced by piezo rain');
assert.equal(zero.rain_daily_mm,0);
assert.equal(zero.piezo_rain_rate_mm_h,22.9,'Early piezo signal survives while WH40H remains zero');
assert.equal(zero.piezo_daily_mm,20.3,'WS90 day total remains separate from an authoritative WH40H zero');
const piezoOnly=ctx.gatewayWeatherReading({rrain_piezo:0.9,drain_piezo:0.8},null);
assert.equal(piezoOnly.rain_rate_mm_h,null,'missing traditional rain stays unavailable');
assert.equal(piezoOnly.rain_daily_mm,null);
assert.equal(piezoOnly.piezo_rain_rate_mm_h,22.9);
assert.equal(piezoOnly.piezo_daily_mm,20.3);
const select=grab('    rain_rate_mm_h: valueAt(data, [','    solar_w_m2: valueAt(data, [');
assert.match(select,/piezo_rain_rate_mm_h: valueAt\(data,/,'cloud reads WS90 rate as an independent signal');
const path=(obj,name)=>name.split('.').reduce((acc,k)=>acc?.[k],obj);
const cloudCtx={data:null,valueAt:(data,keys)=>{for(const name of keys){const val=path(data,name);if(val!==undefined&&val!==null)return Number(val);}return null;}};
vm.createContext(cloudCtx);
const cloudExpression='({'+select+'})';
cloudCtx.data={
 rainfall:{rain_rate:{value:0},daily:{value:5.2}},
 rainfall_piezo:{rain_rate:{value:80},daily:{value:120}}
};
const values=vm.runInContext(cloudExpression,cloudCtx);
assert.equal(values.rain_rate_mm_h,0);
assert.equal(values.rain_daily_mm,5.2);
assert.equal(values.piezo_rain_rate_mm_h,80);
assert.equal(values.piezo_daily_mm,120);
cloudCtx.data={rainfall_piezo:{rain_rate:{value:80},daily:{value:120}}};
const missing=vm.runInContext(cloudExpression,cloudCtx);
assert.equal(missing.rain_rate_mm_h,null);
assert.equal(missing.rain_daily_mm,null);
assert.equal(missing.piezo_rain_rate_mm_h,80,'Missing WH40H stays unavailable even when WS90 detects rain');
assert.equal(missing.piezo_daily_mm,120,'WS90 accumulated day estimate does not fill missing WH40H totals');
assert.match(worker,/wh40h_primary_rain:true/);
assert.match(worker,/readRecentCloudPiezo/);
assert.match(worker,/piezo_observed_epoch/);
assert.match(worker,/piezo_daily_mm: nullableNumber\(row.piezo_daily_mm\)/);
assert.match(read('index.html'),/id="heroPiezoRain"/);
assert.match(read('rain.html'),/id="rainPiezoToday"/);
const dashboard=read('app.js');
assert.match(dashboard,/tag: "Light rain detected"/);
assert.match(dashboard,/piezoIndicatesRain/);
assert.match(read('rain.js'),/piezoDetected/);
assert.match(dashboard,/Rainfall totals are based on the dedicated gauge only/);
assert.match(read('station.html'),/data-sensor="rain"/);
assert.match(read('station.html'),/self-emptying tipping-bucket rain gauge/);
assert.doesNotMatch(read('station.html'),/WS90 piezoelectric sensor/);
assert.doesNotMatch(read('rain.html'),/zero rain-rate reading means the WS90/i);
assert.match(read('maintenance-log.js'),/2026-11-03.*WH40H/);
assert.match(read('history.html'),/Rain-gauge change.*3 Nov 2026/);
assert.match(read('downloads.html'),/Rainfall sensor history:/);
assert.ok(read('admin.html').includes('Admin interface '+JSON.parse(read('package.json')).version),'Admin label must match the public site release');
// The headline must react to WS90 rain without using it as a rainfall total.
const appCode=read('app.js');
const ai=appCode.indexOf('function rainActivity('),aj=appCode.indexOf('/* NOAA-style',ai);
assert.ok(ai>=0&&aj>ai,'Dashboard condition functions must be present');
const clock=Math.floor(Date.now()/1000);
const vis={
  history24:[],
  lastObservedRainDay:null,lastObservedRainTotal:null,lastRainIncreaseTime:null,
  RAIN_INCREMENT_EPSILON_MM:0.05,RAIN_ACTIVE_WINDOW_MS:300000,RAIN_RECENT_WINDOW_MS:900000,
  usable:v=>number(v)!==null,
  readingTime:row=>Number(row?.epoch||0)*1000,
  stationDateKeyFromTime:()=> '2026-11-10',
  correctedDailyRain:row=>number(row?.rain_daily_mm),
  localDateKey:()=> '2026-11-10',
  n:v=>Number(v).toFixed(1)
};
vm.createContext(vis);
vm.runInContext(appCode.slice(ai,aj),vis);
const base={epoch:clock,rain_rate_mm_h:0,rain_daily_mm:0,wind_speed_kmh:0,solar_w_m2:0,uv_index:0};
assert.equal(vis.conditionInfo({...base,piezo_daily_mm:0.4,piezo_rain_rate_mm_h:0,piezo_observed_epoch:clock},true).tag,
 'Rain noted today','WS90 recorded rain earlier, so show discrepancy even with current rate zero');
assert.equal(vis.conditionInfo({...base,piezo_rain_rate_mm_h:0.6,piezo_observed_epoch:clock},true).tag,
 'Light rain detected','Fresh WS90 signal overrides the time-of-day label');
assert.equal(vis.conditionInfo({...base,piezo_rain_rate_mm_h:0,piezo_observed_epoch:clock},true).tag,
 'Night','No WS90 or WH40H signal leaves night-time label unchanged');
assert.equal(vis.conditionInfo({...base,piezo_rain_rate_mm_h:0.6,piezo_observed_epoch:clock-900},true).tag,
 'Night','Stale piezo readings cannot claim current rain');
assert.equal(vis.conditionInfo({...base,rain_rate_mm_h:3,piezo_rain_rate_mm_h:0,piezo_observed_epoch:clock},true).tag,
 'Rainy','Actual WH40H rain still takes priority over WS90');

console.log('PASS: WH40H rain priority, zeros, missing-data fail-closed, public source labels and version parity.');
