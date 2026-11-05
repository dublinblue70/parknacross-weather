(() => {
"use strict";
// Read-only gauge diagnostics. These are inferred counter movements, NOT proof of calibration.
const SWITCH=Date.parse("2026-11-03T13:00:00Z")/1000,START=Date.parse("2026-11-03T00:00:00Z")/1000,END=Date.parse("2026-11-04T00:00:00Z")/1000;
const num=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x));
const rounded=x=>Math.round(x*10)/10;
function normalise(rows){
 const byEpoch=new Map();
 for(const r of Array.isArray(rows)?rows:[]){if(num(r?.epoch)&&num(r?.rain_daily_mm))byEpoch.set(Number(r.epoch),{epoch:Number(r.epoch),total:Number(r.rain_daily_mm)});}
 return [...byEpoch.values()].sort((a,b)=>a.epoch-b.epoch);
}
function segment(rows) {
 const a=normalise(rows);let rise=0,resets=0,gaps=0,lastRise=null;
 for(let i=1;i<a.length;i++){
   const delta=a[i].total-a[i-1].total,dt=a[i].epoch-a[i-1].epoch;
   if(dt>1200)gaps++;
   if(delta<-.05)resets++;
   else if(delta>=.05){rise+=delta;lastRise=a[i].epoch;}
 }
 return{samples:a.length,first:a[0]?.epoch??null,last:a.at(-1)?.epoch??null,firstTotal:a[0]?.total??null,observedIncreaseMm:rounded(rise),lastRise,resets,gaps};
}
function analyseChangeover(day){
 const rows=normalise(day?.readings).filter(r=>r.epoch>=START&&r.epoch<END);
 const toRaw=arr=>arr.map(r=>({epoch:r.epoch,rain_daily_mm:r.total}));
 const before=segment(toRaw(rows.filter(r=>r.epoch<SWITCH))),after=segment(toRaw(rows.filter(r=>r.epoch>=SWITCH)));
 const warnings=[];
 if(before.samples<2||after.samples<2)warnings.push("Not enough archived readings on both sides of the change");
 if(before.first!==null&&before.first-START>900)warnings.push("Incomplete record near midnight");
 if(before.last!==null&&SWITCH-before.last>1200)warnings.push("Gap before the approximate changeover");
 if(after.first!==null&&after.first-SWITCH>1200)warnings.push("Gap after the approximate changeover");
 if(before.resets||after.resets)warnings.push("Counter reset within a sensor segment");
 if(before.gaps||after.gaps)warnings.push("One or more intervals exceed 20 minutes");
 const estimate=before.samples>1&&after.samples>1&&!before.resets&&!after.resets?rounded(before.observedIncreaseMm+after.observedIncreaseMm):null;
 return{before,after,estimateMm:estimate,recordedMm:num(day?.summary?.rain_mm)?Number(day.summary.rain_mm):null,warnings,verified:false};
}
const localDay=epoch=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(epoch*1000));
function analyseRecentTips(readings,now=Date.now()/1000){
 const a=normalise(readings).filter(r=>r.epoch>=SWITCH&&r.epoch<=now+120);
 let rise=0,lastRise=null,resets=0,gaps=0;
 for(let i=1;i<a.length;i++){
   if(localDay(a[i].epoch)!==localDay(a[i-1].epoch))continue;
   const delta=a[i].total-a[i-1].total;
   if(a[i].epoch-a[i-1].epoch>1200)gaps++;
   if(delta<-.05)resets++;
   else if(delta>=.05){rise+=delta;lastRise=a[i].epoch;}
 }
 const latest=a.at(-1)?.epoch??null;
 return{samples:a.length,observedIncreaseMm:rounded(rise),lastRise,resets,gaps,latest,feedFresh:latest!==null&&now-latest<=600&&now-latest>=-120,physicallyVerified:false};
}
const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
const mm=n=>Number(n).toFixed(1)+" mm";
const when=e=>e?new Date(e*1000).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" Irish time":"unknown time";
async function read(path){
 const api=window.PARKNACROSS_CONFIG?.apiBase;
 if(!api)throw Error("Weather service URL unavailable");
 const r=await fetch(api+path,{cache:"no-store",signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error("HTTP "+r.status);
 const data=await r.json();if(data?.error)throw Error(String(data.error));return data;
}
let checking=false;
async function check(){
 if(checking)return;checking=true;
 const button=document.getElementById("rainGaugeAuditRefresh");if(button)button.disabled=true;
 set("rainGaugeAuditUpdated","Checking saved rainfall observations…");
 try {
   const responses=await Promise.allSettled([read("/day?date=2026-11-03"),read("/history?hours=72"),read("/current"),read("/site-capabilities")]);
   const day=responses[0].status==="fulfilled"?responses[0].value:null;
   const history=responses[1].status==="fulfilled"?responses[1].value:null;
   const current=responses[2].status==="fulfilled"?responses[2].value:null;
   const capabilities=responses[3].status==="fulfilled"?responses[3].value:null;
   const traditionalMapped=capabilities?.features?.wh40h_primary_rain===true;
   const archived=day&&day.available!==false?analyseChangeover(day):null;
   if(archived){
     set("rainGaugeBefore",mm(archived.before.observedIncreaseMm)+" observed");
     set("rainGaugeAfter",mm(archived.after.observedIncreaseMm)+" observed");
     let description="Archived 3 Nov day total: "+(archived.recordedMm===null?"unavailable":mm(archived.recordedMm))+". ";
     description+=archived.estimateMm!==null?"Observed counter changes within the two sensor periods sum to "+mm(archived.estimateMm)+". ":"There are too few reliable readings to estimate both sensor periods. ";
     description+=archived.warnings.length?"Cautions: "+archived.warnings.join("; ")+". ":"No large gaps or resets were found in the available intervals. ";
     set("rainGaugeReconciliation",description+"This is NOT a verified corrected daily total; the published archive remains unchanged and provisional.");
   }else{
     set("rainGaugeBefore","Unavailable");set("rainGaugeAfter","Unavailable");
     set("rainGaugeReconciliation","3 Nov archived observations are unavailable. The published changeover-day total remains provisional and unchanged.");
   }
   const epoch=num(current?.epoch)?Number(current.epoch):null;
   const fresh=epoch!==null&&Date.now()/1000-epoch<=600&&epoch<=Date.now()/1000+120;
   const hasRainFields=num(current?.rain_daily_mm)&&num(current?.rain_rate_mm_h);
   set("rainGaugeFeedState",fresh&&hasRainFields&&traditionalMapped?"Mapped feed current":"Not verified");
   set("rainGaugeFeedDetail",fresh&&hasRainFields&&traditionalMapped?"Worker confirms traditional WH40H mapping; latest observation "+when(epoch)+". This tests software data availability, not sensor hardware.":"Cannot confirm a fresh rain reading AND a deployed Worker with WH40H traditional source mapping.");
   if(history&&Array.isArray(history.readings)){
     const activity=analyseRecentTips(history.readings);
     set("rainGaugeTipState",activity.lastRise?"Counter increased":activity.samples>1?"No recent tips observed":"Not verified");
     set("rainGaugeTipDetail",activity.lastRise?mm(activity.observedIncreaseMm)+" observed rises in the available 72-hour record, last at "+when(activity.lastRise)+". Not a calibration test.":activity.samples>1?"No counter increases in the available 72-hour record. This may simply reflect dry weather.":"Insufficient recent observations to determine counter movement.");
     set("rainGaugeQuality",activity.samples+" archived samples checked; "+activity.gaps+" intervals over 20 minutes; "+activity.resets+" within-day counter resets. To check the physical WH40H, inspect battery and radio status in Ecowitt and corroborate measurements during genuine rain.");
   }else{
     set("rainGaugeTipState","Not verified");set("rainGaugeTipDetail","Recent archived rain readings unavailable.");
     set("rainGaugeQuality","Software cannot verify the physical bucket or battery. Inspect WH40H status in Ecowitt and compare measurements during genuine rainfall.");
   }
   set("rainGaugeAuditUpdated","Checked "+new Date().toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" Irish time · read-only, no records changed.");
 }catch(e){set("rainGaugeAuditUpdated","Gauge check unavailable: "+e.message);}
 finally{checking=false;if(button)button.disabled=false;}
}
window.ParknacrossRainGaugeAudit={analyseChangeover,analyseRecentTips,segment,check};
document.addEventListener("DOMContentLoaded",()=>{
 const section=document.getElementById("rainGaugeAudit");let opened=false;
 section?.addEventListener("toggle",()=>{if(section.open&&!opened){opened=true;check();}});
 document.getElementById("rainGaugeAuditRefresh")?.addEventListener("click",check);
});
})();
