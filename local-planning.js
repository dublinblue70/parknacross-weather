/* Local planning aids: forecast rainfall and observed coastal wind stay separate. */
(() => {
 'use strict';
 const HOUR=3600000,number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 const stamp=v=>typeof v==='number'?v*(v<1e12?1000:1):Date.parse(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(v)?v+'Z':v||'');
 const fresh=(t,max,now)=>Number.isFinite(t)&&t<=now+90000&&now-t<=max;
 const bearing=d=>((d%360)+360)%360;
 const compass=d=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(bearing(d)/22.5)%16];
 function rainOutlook(feed,now=Date.now()){
  if(!fresh(stamp(feed?.fetched_at),90*60000,now)||!Array.isArray(feed?.points))return null;
  const start=Math.floor(now/HOUR)*HOUR,byHour=new Map();
  for(const p of feed.points){const t=number(p.epoch),r=number(p.rain_mm);if(t!==null&&t*1000%HOUR===0)byHour.set(t*1000,r!==null&&r>=0&&r<=100?r:null);}
  const slots=Array.from({length:6},(_,i)=>({from:start+i*HOUR,to:start+(i+1)*HOUR,mm:byHour.get(start+i*HOUR)??null}));
  if(slots.every(s=>s.mm===null))return null;
  const wet=slots.find(s=>s.mm!==null&&s.mm>=.1),complete=slots.every(s=>s.mm!==null),covered=slots.filter(s=>s.mm!==null).length;
  return {slots,wet,complete,covered,retrieved:stamp(feed.fetched_at)};
 }
 function coastalWind(c,now=Date.now()){
  const time=c?.received_at?stamp(c.received_at):c?.epoch?stamp(Number(c.epoch)):NaN;
  if(!fresh(time,10*60000,now))return {state:'unavailable'};
  const speed=number(c?.wind_speed_kmh),gust=number(c?.wind_gust_kmh),raw=number(c?.wind_direction_deg);
  if(speed===null||speed<0||speed>250)return {state:'unavailable'};
  if(speed<1)return {state:'calm',speed,gust,time};
  if(raw===null||raw<0||raw>360)return {state:'direction-unavailable',speed,gust,time};
  const from=bearing(raw),to=bearing(from+180);
  // Same approximate coastal sectors as the existing Sea & Swim page.
  const exposure=from>=45&&from<165?'Onshore':from>=225&&from<345?'Offshore':'Alongshore';
  return {state:'wind',speed,gust,time,from,to,exposure,fromName:compass(from),toName:compass(to)};
 }
 window.ParknacrossLocalPlanning={rainOutlook,coastalWind};
 document.addEventListener('DOMContentLoaded',()=>{
  const rain=document.querySelector('[data-rain-outlook]'),wind=document.querySelector('[data-coastal-compass]');if(!rain&&!wind)return;
  const base=(window.PARKNACROSS_CONFIG?.apiBase||window.PARKNACROSS_API_BASE||'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/,'');
  const text=(host,key,value)=>{const el=host?.querySelector(`[data-${key}]`);if(el)el.textContent=value;};
  const time=t=>new Date(t).toLocaleTimeString('en-IE',{timeZone:'Europe/Dublin',hour:'2-digit',minute:'2-digit'});
  let forecast=null,current=null,rainLoading=false,windLoading=false;
  function renderRain(){if(!rain)return;const view=rainOutlook(forecast),list=rain.querySelector('[data-rain-slots]');list.replaceChildren();
   if(!view){text(rain,'rain-summary','Hourly rain outlook unavailable');text(rain,'rain-context','Try Refresh, or open the radar for the latest rain picture.');text(rain,'rain-source','Forecast data is missing or too old to use.');return;}
   text(rain,'rain-summary',view.wet?(view.wet.from<=Date.now()?'Rain forecast this hour':`Rain forecast around ${time(view.wet.from)}`):view.complete?'Little or no rain forecast in the next six hourly periods':'No rain signal in the available forecast hours');
   text(rain,'rain-context',`${view.complete?'Six hourly periods':`${view.covered} of 6 hours available`} · timing confidence is limited; showers may miss Parknacross.`);
   for(const s of view.slots){const item=document.createElement('li');item.dataset.level=s.mm===null?'missing':s.mm>=1?'wet':s.mm>=.1?'light':'dry';const label=document.createElement('span'),value=document.createElement('strong');label.textContent=`${s.from<=Date.now()?'Now':time(s.from)}–${time(s.to)}`;value.textContent=s.mm===null?'Unavailable':s.mm===0?'0.0 mm':s.mm<.1?'<0.1 mm':`${s.mm.toFixed(1)} mm`;item.append(label,value);list.append(item);}
   text(rain,'rain-source',`Met Éireann point forecast · retrieved ${time(view.retrieved)} Irish time. Amounts cover whole forecast hours, including the current hour; this is forecast rain, not detected rain or a radar arrival estimate.`);
  }
  function renderWind(){if(!wind)return;const v=coastalWind(current),arrow=wind.querySelector('[data-wind-arrow]');arrow.hidden=v.state!=='wind';arrow.style.display=v.state==='wind'?'':'none';
   if(v.state==='unavailable'){text(wind,'wind-summary','Live wind unavailable');text(wind,'wind-detail','A fresh station reading is needed to show the wind direction.');text(wind,'wind-source','Station data is missing or over 10 minutes old.');return;}
   text(wind,'wind-source',`Parknacross observation · ${time(v.time)} Irish time. Coastal orientation is approximate; this is not a swimming-safety assessment.`);
   const speed=`${v.speed.toFixed(1)} km/h${v.gust!==null&&v.gust>=0?` · gust ${v.gust.toFixed(1)} km/h`:''}`;
   if(v.state==='calm'){text(wind,'wind-summary','Calm at the station');text(wind,'wind-detail',`${speed} · no meaningful wind direction.`);return;}
   if(v.state==='direction-unavailable'){text(wind,'wind-summary','Wind direction unavailable');text(wind,'wind-detail',speed);return;}
   arrow.setAttribute('transform',`rotate(${v.to} 90 90)`);
   text(wind,'wind-summary',`${v.exposure} wind · from ${v.fromName}`);
   text(wind,'wind-detail',`${speed}. Blowing towards ${v.toName} (${Math.round(v.to)}°).`);
  }
  async function get(path){const r=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Feed unavailable');return r.json();}
  async function loadRain(){if(!rain||rainLoading)return;rainLoading=true;const b=rain.querySelector('button');b.disabled=true;try{forecast=await get('/outdoor-outlook');}catch{forecast=null;}finally{rainLoading=false;b.disabled=false;renderRain();}}
  async function loadWind(){if(!wind||windLoading)return;windLoading=true;try{current=await get('/current');}catch{current=null;}finally{windLoading=false;renderWind();}}
  rain?.querySelector('button').addEventListener('click',loadRain);
  window.addEventListener('parknacross:current-observation',e=>{current=e.detail?.current||null;renderWind();});
  loadRain();loadWind();
  (window.ParknacrossRefresh?.every||setInterval)(()=>{renderRain();renderWind();},60000);
  (window.ParknacrossRefresh?.every||setInterval)(loadRain,15*60000);
  if(wind&&!document.querySelector('#heroTemp'))(window.ParknacrossRefresh?.every||setInterval)(loadWind,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderRain();renderWind();loadRain();loadWind();}});
 });
})();
