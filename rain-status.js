/* Single source of truth for live rainfall status. No piezo accumulation is added to WH40H totals. */
(function(root){
"use strict";
const number=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const stamp=r=>{const t=r?.received_at?Date.parse(r.received_at):null;return Number.isFinite(t)?t:(number(r?.epoch)===null?null:number(r.epoch)*1000);};
const day=t=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
// Track consecutive fresh gateway observations. Counters indicate recent activity,
// not calibrated rain intensity. Only update the tracker on a newer packet.
let lastLive=null, lastTraditionalTip=null, lastPiezoIncrease=null;
function liveChanges(time,now,current){
 if(time===null||now-time>180000||now-time < -90000)
   return {traditionalTip:false,piezoIncrease:false};
 const total=number(current?.rain_daily_mm),piezo=number(current?.piezo_daily_mm);
 const piezoEpoch=number(current?.piezo_observed_epoch);
 const piezoIsFresh=piezoEpoch!==null&&now-piezoEpoch*1000>=-90000&&now-piezoEpoch*1000<=180000;
 if(lastLive&&time>lastLive.time&&time-lastLive.time<=180000&&day(time)===day(lastLive.time)){
   if(total!==null&&lastLive.total!==null&&total-lastLive.total>=0.05)lastTraditionalTip=time;
   if(piezoIsFresh&&piezo!==null&&lastLive.piezo!==null&&piezo-lastLive.piezo>=0.1)lastPiezoIncrease=time;
 }
 if(!lastLive||time>lastLive.time||day(time)!==day(lastLive.time)){
   lastLive={time,total,piezo:piezoIsFresh?piezo:null};
 }
 return {traditionalTip:lastTraditionalTip!==null&&now-lastTraditionalTip>=-90000&&now-lastTraditionalTip<=120000,
  piezoIncrease:lastPiezoIncrease!==null&&now-lastPiezoIncrease>=-90000&&now-lastPiezoIncrease<=120000};
}
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
 const isRaining=rainRate!==null&&rainRate>0; // Never infer current intensity from historical totals.
 const changes=options.trackLive===false?{traditionalTip:false,piezoIncrease:false}:liveChanges(time,now,current);
 const rainRecently=gaugeFresh&&!isRaining&&since>=0&&since<=15*60000;
 // Fresh secondary evidence and fresh counter movements take priority over
 // historical tips; the WH40H remains authoritative for measured totals/rate.
 const status=!gaugeFresh?"unavailable":isRaining?"measured":piezoStrongSignal&&rainAvailable?"sensor_disagreement":piezoIndicatesRain||changes.piezoIncrease?"possible":changes.traditionalTip?"new_tip":rainRecently?"recent":!rainAvailable?"rate_unavailable":"no_current_rain";
 const rainIndicatedNow=gaugeFresh&&(isRaining||piezoIndicatesRain||changes.piezoIncrease||changes.traditionalTip);
 return {status,reason,rate:rainRate,rainRate,rainAvailable,dailyTotalAvailable,gaugeFresh,observationAgeMs:ageMs,piezoRate,piezoDailyMm,piezoIndicatesRain,piezoDetected:piezoIndicatesRain,piezoStrongSignal,traditionalTipRecent:changes.traditionalTip,piezoIncreaseRecent:changes.piezoIncrease,rainIndicatedNow,recentIncreaseMm,isRaining,rainRecently,lastIncrease,lastIncreaseTime:lastIncrease};
}
root.ParknacrossRainStatus={evaluate};
})(typeof window!=="undefined"?window:globalThis);
