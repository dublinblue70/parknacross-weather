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
  rainratein:0.07874,dailyrainin:0.11811,rrain_piezo:0.9,drain_piezo:0.8
},null);
assert.equal(both.rain_rate_mm_h,2.0,'WH40H rate wins over WS90 piezo rate');
assert.equal(both.rain_daily_mm,3.0,'WH40H total wins over WS90 piezo total');
const zero=ctx.gatewayWeatherReading({rainratein:0,dailyrainin:0,rrain_piezo:0.9,drain_piezo:0.8},null);
assert.equal(zero.rain_rate_mm_h,0,'traditional zero is not replaced by piezo rain');
assert.equal(zero.rain_daily_mm,0);
const piezoOnly=ctx.gatewayWeatherReading({rrain_piezo:0.9,drain_piezo:0.8},null);
assert.equal(piezoOnly.rain_rate_mm_h,null,'missing traditional rain stays unavailable');
assert.equal(piezoOnly.rain_daily_mm,null);
const select=grab('    rain_rate_mm_h: valueAt(data, [','    solar_w_m2: valueAt(data, [');
assert.doesNotMatch(select,/"rainfall_piezo\./,'cloud must not read WS90 piezo');
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
cloudCtx.data={rainfall_piezo:{rain_rate:{value:80},daily:{value:120}}};
const missing=vm.runInContext(cloudExpression,cloudCtx);
assert.equal(missing.rain_rate_mm_h,null);
assert.equal(missing.rain_daily_mm,null);
assert.match(worker,/wh40h_primary_rain:true/);
assert.match(read('station.html'),/data-sensor="rain"/);
assert.match(read('station.html'),/WH40H · self-emptying tipping-bucket/);
assert.doesNotMatch(read('station.html'),/WS90 piezoelectric sensor/);
assert.doesNotMatch(read('rain.html'),/zero rain-rate reading means the WS90/i);
assert.match(read('maintenance-log.js'),/2026-11-03.*WH40H/);
assert.match(read('history.html'),/Rain-gauge change.*3 Nov 2026/);
assert.match(read('downloads.html'),/Rainfall sensor history:/);
assert.ok(read('admin.html').includes('Admin interface '+JSON.parse(read('package.json')).version),'Admin label must match the public site release');
console.log('PASS: WH40H rain priority, zeros, missing-data fail-closed, public source labels and version parity.');
