import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const window={};
vm.runInNewContext(read('rain-intensity.js'),{window,Number,Object});
const intensity=window.ParknacrossRainIntensity;
assert.ok(intensity?.classify&&intensity?.formatRate,'Shared WH40H rain intensity helper must load');
const bands=[
  [null,'Rain rate unavailable'],
  [undefined,'Rain rate unavailable'],
  [-1,'Rain rate unavailable'],
  [0,'No rain measured now'],
  [0.01,'Very light rain'],
  [0.1,'Very light rain'],
  [0.5,'Very light rain'],
  [0.5001,'Light rain'],
  [1,'Light rain'],
  [2.5,'Light rain'],
  [2.5001,'Moderate rain'],
  [5,'Moderate rain'],
  [7.5,'Moderate rain'],
  [7.5001,'Heavy rain'],
  [12,'Heavy rain'],
  [15,'Heavy rain'],
  [15.0001,'Very heavy rain'],
  [25,'Very heavy rain'],
  [30,'Very heavy rain'],
  [30.0001,'Torrential rain'],
  [40,'Torrential rain']
];
for(const [value,label] of bands)assert.equal(intensity.classify(value).label,label,'Rate '+value+' mm/h');
assert.equal(intensity.formatRate(5.25),'5.3 mm/h');
assert.equal(intensity.formatRate(0.05),'<0.1 mm/h');
assert.equal(intensity.formatRate(null),'Unavailable');

const dashboard=read('index.html'),centre=read('rain.html'),app=read('app.js'),rain=read('rain.js'),sw=read('service-worker.js');
assert.ok(dashboard.indexOf('rain-intensity.js?v=')<dashboard.indexOf('app.js?v='),'Rain helper must load before app.js');
assert.ok(centre.indexOf('rain-intensity.js?v=')<centre.indexOf('rain.js?v='),'Rain helper must load before rain.js');
assert.match(centre,/id="rainIntensityGuide"/);
assert.match(app,/ParknacrossRainIntensity\?\.classify\(rain\)/);
assert.match(rain,/ParknacrossRainIntensity/);
assert.match(sw,/\.\/rain-intensity\.js/);

const appStart=app.indexOf('function rainActivity('),appEnd=app.indexOf('/* NOAA-style',appStart);
assert.ok(appStart>=0&&appEnd>appStart);
const clock=Math.floor(Date.now()/1000);
const env={
  window,history24:[],lastObservedRainDay:null,lastObservedRainTotal:null,lastRainIncreaseTime:null,
  RAIN_INCREMENT_EPSILON_MM:0.05,RAIN_ACTIVE_WINDOW_MS:300000,RAIN_RECENT_WINDOW_MS:900000,
  usable:v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)),
  readingTime:row=>Number(row?.epoch||0)*1000,
  stationDateKeyFromTime:()=> '2026-11-16',
  correctedDailyRain:row=>row?.rain_daily_mm,
  localDateKey:()=> '2026-11-16',
  n:v=>Number(v).toFixed(1)
};
vm.createContext(env);
vm.runInContext(app.slice(appStart,appEnd),env);
const base={epoch:clock,rain_daily_mm:0,rain_rate_mm_h:0,wind_speed_kmh:2.5,piezo_observed_epoch:clock,solar_w_m2:0,uv_index:0};
const condition=(changes={})=>{
  env.lastRainIncreaseTime=null;env.lastObservedRainDay=null;env.lastObservedRainTotal=null;
  return env.conditionInfo({...base,...changes},false);
};
assert.equal(condition({rain_rate_mm_h:1.2,piezo_rain_rate_mm_h:40}).tag,'Light rain','WH40H rate determines classification, not WS90 rate');
assert.equal(condition({rain_rate_mm_h:5}).tag,'Moderate rain');
assert.equal(condition({rain_rate_mm_h:12}).tag,'Heavy rain');
assert.equal(condition({rain_rate_mm_h:28}).tag,'Very heavy rain');
assert.equal(condition({rain_rate_mm_h:35}).tag,'Torrential rain');
assert.equal(condition({rain_rate_mm_h:0,piezo_rain_rate_mm_h:4}).tag,'Possible rain','Piezo is only unconfirmed detection');
assert.equal(condition({rain_rate_mm_h:0,piezo_rain_rate_mm_h:0.3}).tag,'Light breeze','Weak piezo must not fake a rainfall classification');
assert.doesNotMatch(condition({rain_rate_mm_h:0}).story,/Dry conditions with a light breeze/);
console.log('PASS: shared WH40H rain intensity bands, dashboard, Rain Centre and PWA script loading.');
