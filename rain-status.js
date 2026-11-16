/* Single source of truth for live rainfall status. No piezo accumulation is added to WH40H totals. */
(function(root){
"use strict";
const number=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const stamp=r=>{const t=r?.received_at?Date.parse(r.received_at):null;return Number.isFinite(t)?t:(number(r?.epoch)===null?null:number(r.epoch)*1000);};
const day=t=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
function evaluate(current,history=[],options={}){
 const now=number(options.now)??Date.now(),time=stamp(current),ageMs=time===null?Infinity:now-time;
 const gaugeFresh=ageMs>=-90000&&ageMs<=180000;
 const rainRate=gaugeFresh?number(current?.rain_rate_mm_h):null;
 const rawTotal=number(current?.rain_daily_mm),correction=number(options.correctionMm)??0;
 const currentTotal=rawTotal===null?null:Math.max(0,rawTotal-correction);
 // A daily accumulation is not evidence that the live rain-rate field is available.
 const rainAvailable=gaugeFresh&&rainRate!==null;
 const dailyTotalAvailable=rawTotal!==null&&time!==null&&day(time)===day(now);
 const reason=!gaugeFresh?(time===null?"missing_timestamp":"stale_observation"):rainRate===null?"rate_missing":null;
 const piezoTime=number(current?.piezo_observed_epoch);
 const piezoAge=piezoTime===null?Infinity:now-piezoTime*1000;
 const piezoFresh=ageMs>=-90000&&ageMs<=180000&&piezoAge>=-90000&&piezoAge<=180000;
 const piezoRate=piezoFresh?number(current?.piezo_rain_rate_mm_h):null;
 const piezoDailyMm=piezoFresh&&time!==null&&day(time)===day(now)?number(current?.piezo_daily_mm):null;
 const piezoIndicatesRain=piezoRate!==null&&piezoRate>0;
 const piezoStrongSignal=piezoRate!==null&&piezoRate>=2;
 const rows=(Array.isArray(history)?history:history?.readings||[])
  .map(r=>({time:stamp(r),total:number(r?.rain_daily_mm)}))
  .filter(r=>r.time!==null&&r.total!==null&&time!==null&&day(r.time)===day(time)&&r.time<=time&&r.time>=time-20*60000)
  .sort((a,b)=>a.time-b.time);
 let lastIncrease=null,recentIncreaseMm=0,previous=null;
 for(const row of rows){if(previous&&row.total-previous.total>=0.05&&row.time-previous.time<=10*60000){lastIncrease=row.time;}previous=row;}
 if(previous&&currentTotal!==null&&time>previous.time&&time-previous.time<=10*60000&&currentTotal-previous.total>=0.05)lastIncrease=time;
 if(rainRate!==null&&rainRate>0)lastIncrease=time;
 if(rows.length&&currentTotal!==null&&time-rows[0].time<=20*60000)recentIncreaseMm=Math.max(0,currentTotal-rows[0].total);
 const since=lastIncrease===null?Infinity:now-lastIncrease;
 const isRaining=rainRate!==null&&rainRate>0; // A historical bucket tip is not proof of current rain.
 const rainRecently=gaugeFresh&&!isRaining&&since>=0&&since<=15*60000;
 const status=!gaugeFresh?"unavailable":isRaining?"measured":piezoStrongSignal&&rainAvailable?"sensor_disagreement":piezoStrongSignal?"possible":rainRecently?"recent":piezoIndicatesRain?"possible":!rainAvailable?"rate_unavailable":"no_current_rain";
 return {status,reason,rate:rainRate,rainRate,rainAvailable,dailyTotalAvailable,gaugeFresh,observationAgeMs:ageMs,piezoRate,piezoDailyMm,piezoIndicatesRain,piezoDetected:piezoIndicatesRain,piezoStrongSignal,recentIncreaseMm,isRaining,rainRecently,lastIncrease,lastIncreaseTime:lastIncrease};
}
root.ParknacrossRainStatus={evaluate};
})(typeof window!=="undefined"?window:globalThis);
