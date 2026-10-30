import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

// The same motion field must yield an arrival relative to now, not to an old image.
const radar=read('radar.js'),width=300,patch=x=>{const mask=new Uint8Array(width*width);for(let y=146;y<=154;y++)for(let i=x;i<=x+8;i++)mask[y*width+i]=1;return {mask,width,sx:150,sy:150};};
const old=patch(102),recent=patch(122),now=Date.now(),frames=[{time:now/1000-40*60},{time:now/1000-20*60}];let message;
const r={arrivalBusy:false,frames,Date,Math,console,loadRadarPatch:async f=>f===frames[0]?old:recent,setArrival:(title,detail)=>message={title,detail}};
vm.createContext(r);vm.runInContext(radar.slice(radar.indexOf(' function motionBetween('),radar.indexOf(' async function loadRadar(){')),r);await r.updateArrivalEstimate();assert.match(message.title,/within about 10 minutes/);assert.match(message.detail,/image 20 minutes old/);
frames.forEach(f=>f.time-=5*60);await r.updateArrivalEstimate();assert.match(message.title,/arrival time has passed/);

// An overnight forecast has its own period and never enters the daytime group.
const f={window:{},document:{getElementById(){}}};vm.createContext(f);vm.runInContext(read('local-forecast.js'),f);
const at=Date.parse('2026-10-26T02:30Z'),feed={fetched_at:new Date(at).toISOString(),points:Array.from({length:25},(_,i)=>({epoch:Date.parse('2026-10-26T03:00Z')/1000+i*3600,temperature_c:10,wind_kmh:15,rain_mm:i===0?2:0}))},forecast=f.window.ParknacrossLocalForecast.describe(feed,at);
assert.match(forecast.restOfNight.coverage,/03:00/);assert.match(forecast.restOfNight.summary,/2 mm/);assert.match(forecast.periods[0].coverage,/06:00/);assert.doesNotMatch(forecast.periods[0].coverage,/03:00/);

// Stale station data must not become current coastal wind or rain text.
const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{add(){}},dataset:{}});return nodes.get(id);};
let observation={epoch:Date.now()/1000-48*3600,temperature_c:12,wind_speed_kmh:20,wind_gust_kmh:30,wind_direction_deg:90,rain_rate_mm_h:3,rain_daily_mm:6};
const c={window:{PARKNACROSS_CONFIG:{apiBase:'https://fixture.test'}},document:{getElementById:node,addEventListener(){}},Date,Intl,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>observation})};vm.createContext(c);vm.runInContext(read('source-freshness.js'),c);vm.runInContext(read('coast.js').replace(' document.addEventListener("DOMContentLoaded"',' window.auditLoad=loadCurrent;document.addEventListener("DOMContentLoaded"'),c);await c.window.auditLoad();assert.equal(node('coastWind').textContent,'Unavailable');assert.doesNotMatch(node('swimSummary').textContent,/Rain rate 3/);assert.match(node('coastLocalFreshness').textContent,/2 days ago/);
observation={...observation,epoch:Date.now()/1000};await c.window.auditLoad();assert.equal(node('coastWind').textContent,'20.0 km/h');
observation={...observation,epoch:Date.now()/1000+3600};await c.window.auditLoad();assert.equal(node('coastWind').textContent,'Unavailable');

// A saved active flag is not a subscription. Startup repair preserves selections.
const storage=new Map([['parknacross:background-alerts:v1',JSON.stringify({active:true,token:'fixture'})],['parknacross.alerts.settings.v1',JSON.stringify({rainStart:true,gust:true})]]);
const b={window:{addEventListener(){}},document:{addEventListener(){},getElementById(){return null;}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Notification:{permission:'granted'},navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>null}})}},setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;},Promise};vm.createContext(b);vm.runInContext(read('background-alerts.js'),b);assert.equal(b.window.PWBackgroundAlerts.isActive(),false);assert.equal(b.window.PWBackgroundAlerts.isChecking(),true);await b.window.PWBackgroundAlerts.reconcile();assert.equal(b.window.PWBackgroundAlerts.isChecking(),false);assert.equal(b.window.PWBackgroundAlerts.isActive(),false);assert.equal(JSON.parse(storage.get('parknacross:background-alerts:v1')).active,true);assert.equal(JSON.parse(storage.get('parknacross.alerts.settings.v1')).rainStart,true);

// Field selection does not mutate raw rows, and streamed CSV retains its values.
const worker=read('_worker/worker.mjs'),csvContext={Intl,Date,Number,String,ReadableStream,TextEncoder,Response,TABLE:'weather_readings_v2',nullableNumber:value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value),correctedRainForDay:(_day,value)=>value,stationDayKey:()=>"2026-10-25",BASE_CORS_COMPAT:()=>({})};vm.createContext(csvContext);vm.runInContext(worker.slice(worker.indexOf('function rowsToCsv('),worker.indexOf('async function runDailyBackup(')),csvContext);vm.runInContext(worker.slice(worker.indexOf('async function exportCsv('),worker.indexOf('function BASE_CORS_COMPAT(')),csvContext);
const input=[{epoch:1793001600,temperature_c:0,soil_moisture_pct:17},{epoch:1793001900,temperature_c:8,soil_moisture_pct:null}],exportEnv={DB:{prepare(){let args=[];return{bind(...values){args=values;return this;},async first(){const [start,end]=args;return input.filter(row=>row.epoch>=start&&row.epoch<end).sort((a,b)=>b.epoch-a.epoch)[0]||null;},async all(){const [cursor,start,end,limit]=args;return{results:input.filter(row=>row.epoch<cursor&&row.epoch>=start&&row.epoch<end).sort((a,b)=>b.epoch-a.epoch).slice(0,limit)};}};}}},csv=await(await csvContext.exportCsv(exportEnv,7,true,null,['epoch','temperature_c'])).text();assert.equal(csv.trim(),'epoch,temperature_c\n1793001900,8\n1793001600,0');assert.equal(input[0].soil_moisture_pct,17);

// Device preference transfer tools have been removed.
const tools=read('review-tools.js');assert.doesNotMatch(tools,/devicePreferences|cleanPreferences|Export preferences|Import preferences|Clear these preferences/);
assert.match(read('service-worker.js'),/graphs-controls\.css/);
console.log('PASS: aged radar ETA, elapsed arrivals, rest-of-night forecast, stale/future coastal observations, lost subscriptions, streamed selected-field CSV and removal of preference transfer tools.');

// Historical coverage is bounded to the requested year, with real Irish DST slots.
const {DatabaseSync}=await import('node:sqlite');
const backend=await import('data:text/javascript;base64,'+Buffer.from(worker+'\nexport {buildArchiveCoverage,stationDayEpochRange};').toString('base64'));
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE weather_readings_v2(epoch INTEGER PRIMARY KEY);');
const range=backend.stationDayEpochRange('2025-10-26');for(let epoch=range.startEpoch;epoch<range.endEpoch;epoch+=300)db.prepare('INSERT INTO weather_readings_v2 VALUES (?)').run(epoch);
const env={DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}}};
const coverage=await backend.buildArchiveCoverage(env,371,'2025'),clockChange=coverage.days.find(r=>r.day==='2025-10-26');assert.equal(clockChange.actual_slots,300);assert.equal(clockChange.expected_slots,300);assert.equal(clockChange.coverage_percent,100);assert.ok(coverage.days.every(r=>r.day.startsWith('2025-')));db.close();
console.log('PASS: annual coverage uses the selected year and 300-slot autumn clock-change days.');

const {validMarineForecast}=await import('../public-monitor.mjs');const checked=Date.now(),marine={forecast_available:true,issued:new Date(checked).toISOString(),local_area:{wind:'Southwest force 5',weather:'Showers',visibility:'Good'}};assert.equal(validMarineForecast(marine,checked),true);assert.equal(validMarineForecast({...marine,forecast_available:false,local_warning_relevant:true},checked),false);assert.equal(validMarineForecast({...marine,issued:new Date(checked-25*3600000).toISOString()},checked),false);assert.equal(validMarineForecast({source:'Met Éireann'},checked),false);console.log('PASS: marine monitoring checks actual forecast fields and age, separately from warning availability.');
