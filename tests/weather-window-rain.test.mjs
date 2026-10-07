import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../weather-window.js',import.meta.url),'utf8');
for(const rain of ['none','light','rain','heavy','thunderstorm','auto']){
 for(const expired of [false,true]){
  const elements=new Map(),listeners=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',dataset:{},style:{setProperty(){}},setAttribute(k,v){this[k]=v},querySelector:()=>({style:{}}),addEventListener(){}});return elements.get(id)};
  vm.runInNewContext(source,{document:{getElementById:el,addEventListener(){}},window:{addEventListener:(n,f)=>listeners.set(n,f),ParknacrossWeatherSky:{resolvePoint:()=>({sky:'clear',source:'point',cloud_percent:5})}},Date,Math,Number,String,Intl,URLSearchParams,AbortSignal,location:{search:''},setInterval(){},fetch:async url=>({ok:url.includes('/weather-window/sky'),json:async()=>({override:{sky:'auto',rain,expires_at:new Date(Date.now()+(expired?-60000:60000)).toISOString()}})})});
  await new Promise(r=>setImmediate(r));
  listeners.get('parknacross:weather-window-observation')({detail:{isNight:false,current:{epoch:Date.now()/1000,rain_rate_mm_h:0,wind_speed_kmh:3,solar_w_m2:100}}});
  assert.equal(el('weatherWindowScene').dataset.sky,'clear','rain-only settings retain forecast clouds');
  assert.equal(el('weatherWindowScene').dataset.rain,expired||rain==='auto'?'none':rain);
  assert.equal(el('weatherWindowRain').textContent,'0.0 mm/h');
  assert.match(el('weatherWindowObservation').textContent,/No rain is reported/);
  if(!expired&&rain!=='auto')assert.match(el('weatherWindowSkySource').textContent,/manual visual override/);
  if(!expired&&rain==='thunderstorm')assert.match(el('weatherWindowSkySource').textContent,/no lightning detection implied/);
 }
}
console.log('PASS: rain-only settings retain forecast sky and real rain readings; all visual choices expire; manual storms labelled.');
