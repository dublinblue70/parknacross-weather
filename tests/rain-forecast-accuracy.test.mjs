import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const worker=fs.readFileSync(new URL('../_worker/worker.mjs',import.meta.url),'utf8');
const start=worker.indexOf("const RAIN_FORECAST_ACCURACY_TABLE = 'weather_rain_forecast_accuracy_v1';");
const finish=worker.indexOf('async function getOutdoorOutlook() {',start);
assert.ok(start>0&&finish>start,'Rain forecast accuracy functions must exist');

const dateKey=date=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(date).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
};
const clock=date=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(date).map(p=>[p.type,p.value]));
 return {hour:Number(parts.hour),minute:Number(parts.minute)};
};
const shift=(day,n)=>{
 const [year,month,date]=day.split('-').map(Number);
 return new Date(Date.UTC(year,month-1,date+n,12)).toISOString().slice(0,10);
};
const ctx={stationClockParts:clock,stationDayKey:dateKey,shiftDayKey:shift,
 Date,Intl,Map,Math,Number,String,console};
vm.createContext(ctx);
vm.runInContext(worker.slice(start,finish)+
 '\nthis.rainTest={rainAccuracyCaptureWindow,rainAccuracyModelTotal,rainAccuracyMeasuredRows,buildRainForecastAccuracy};',ctx);
const {rainAccuracyCaptureWindow:window,rainAccuracyModelTotal:total,
 rainAccuracyMeasuredRows:measure,buildRainForecastAccuracy:summary}=ctx.rainTest;

const day=window(new Date('2026-11-16T05:20:00Z'));
const night=window(new Date('2026-11-16T17:20:00Z'));
assert.equal(day.end-day.start,12*3600);
assert.equal(night.end-night.start,12*3600);
assert.equal(window(new Date('2026-11-16T12:20:00Z')),null);
assert.equal(window(new Date('2026-11-16T17:58:00Z')),null);
assert.equal(window(new Date('2027-03-27T17:20:00Z')).end-
 window(new Date('2027-03-27T17:20:00Z')).start,11*3600);
assert.equal(window(new Date('2027-10-30T16:20:00Z')).end-
 window(new Date('2027-10-30T16:20:00Z')).start,13*3600);

const forecast=Array.from({length:12},(_,i)=>({epoch:day.start+i*3600,rain_mm:1}));
assert.equal(total(forecast,day.start,day.end),12);
assert.equal(total(forecast.slice(1),day.start,day.end),null,'missing forecast hour is not zero');
assert.equal(total(forecast.map((r,i)=>i===1?{...r,rain_mm:null}:r),day.start,day.end),null);

const rows=[];
for(let at=night.start-600;at<=night.end+600;at+=300){
 const currentDay=dateKey(new Date(at*1000));
 const rainfall=currentDay==='2026-11-16'?Math.max(0,(at-night.start)/3600)*.1:
  Math.max(0,(at-Date.parse('2026-11-17T00:00:00Z')/1000)/3600)*.2;
 rows.push({epoch:at,rain_daily_mm:Number(rainfall.toFixed(3))});
}
const observed=measure(rows,night.start,night.end);
assert.equal(observed.valid,true);
assert.ok(observed.total>=1.6&&observed.total<=2.0,'overnight rainfall adds pre/post-midnight increments');
assert.equal(measure(rows.filter(r=>r.epoch<=night.end-1200),night.start,night.end).valid,false,'missing end anchor rejected');
assert.equal(measure(rows.filter(r=>r.epoch<night.start+3600||r.epoch>night.start+6000),night.start,night.end).valid,false,'gaps >30m rejected');
const resetting=rows.map(r=>({...r}));
resetting.find(r=>r.epoch===night.start+3*3600).rain_daily_mm=0;
assert.equal(measure(resetting,night.start,night.end).valid,false,'bad gauge observations rejected');

const now=Math.floor(Date.parse('2026-11-18T12:00:00Z')/1000);
function fixture(n=10,postEvent=false){
 return Array.from({length:n},(_,i)=>{
  const epoch=now-(i+2)*86400;
  const base={target_start:epoch,target_end:epoch+12*3600,period:'night',
   captured_epoch:postEvent?epoch+2:epoch-3000,status:'scored',observed_mm:4,gauge_samples:140,largest_gap_sec:300};
  return [{...base,model:'met_eireann',forecast_mm:5},{...base,model:'open_meteo',forecast_mm:10}];
 }).flat();
}
async function collect(rows){
 const env={DB:{prepare(){return {bind(){return {async all(){return {results:rows}}}}}}}};
 return summary(env,now);
}
const scores=await collect(fixture());
assert.equal(scores.paired_periods_30d,10);
assert.equal(scores.met_eireann_mae_mm,1);
assert.equal(scores.open_meteo_mae_mm,6);
assert.equal(scores.winner,'met_eireann');
assert.equal((await collect(fixture(3))).winner,'insufficient_data');
assert.equal((await collect(fixture(10,true))).paired_periods_30d,0,'post-event snapshots must not be scored');

const homepage=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const accuracyPage=fs.readFileSync(new URL('../forecast-accuracy.html',import.meta.url),'utf8');
assert.match(homepage,/href="forecast-accuracy.html"/);
assert.match(homepage,/data-forecast-accuracy/);
assert.match(accuracyPage,/forecastAccuracyRows/);
assert.match(worker,/url.pathname === "\/forecast-accuracy"/);
assert.match(worker,/await runRainForecastAccuracy\(env\)/);
console.log('PASS: pre-event capture, same-hour model totals, midnight and DST, gauge gaps, MAE and minimum evidence.');
