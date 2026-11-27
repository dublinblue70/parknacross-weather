(() => {
 "use strict";
 // This sensor can be moved between pots; readings represent only the current soil. Bands are provisional, not calibrated thresholds.
 const isNum=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 const isPct=v=>isNum(v)&&Number(v)>=0&&Number(v)<=100;
 // Conservative start of the new-pot monitoring period: location confirmed
 // on 27 Nov 2026 at 09:00 Irish time. Do not mix earlier pot observations
 // into moisture trends, baseline age, or watering advice.
 const NEW_POT_CUTOFF_EPOCH=Date.parse("2026-11-27T09:00:00Z")/1000;
 const NEW_POT_BASELINE_DAYS=14;
 function trendFromReadings(rows,current){
   const epoch=Number(current?.epoch),moisture=Number(current?.soil_moisture_pct);
   if(!Number.isFinite(epoch)||epoch<NEW_POT_CUTOFF_EPOCH||!isPct(current?.soil_moisture_pct))return null;
   const baseline=(Array.isArray(rows)?rows:[]).filter(r=>isNum(r?.epoch)&&isPct(r?.soil_moisture_pct)&&Number(r.epoch)>=NEW_POT_CUTOFF_EPOCH&&Number(r.epoch)>=epoch-43200&&Number(r.epoch)<=epoch-7200)
     .sort((a,b)=>Math.abs(Number(a.epoch)-(epoch-21600))-Math.abs(Number(b.epoch)-(epoch-21600)))[0];
   return baseline?Math.round((moisture-Number(baseline.soil_moisture_pct))*10)/10:null;
 }
 function baselinePhase(firstValidEpoch,nowEpoch=Date.now()/1000,days=14){
   const archivedStart=Number(firstValidEpoch),now=Number(nowEpoch),length=Math.floor(Number(days));
   if(!isNum(firstValidEpoch)||archivedStart<=0||!Number.isFinite(now)||
       !Number.isInteger(length)||length<1||now<NEW_POT_CUTOFF_EPOCH)
     return{verified:false,day:null,building:false};
   // The original /soil-baseline endpoint still reports the old installation.
   // Keep its evidence of archived soil data, but never start the new pot's
   // baseline before the confirmed relocation point.
   const first=Math.max(archivedStart,NEW_POT_CUTOFF_EPOCH);
   if(now<first)return{verified:false,day:null,building:false};
   const day=Math.max(1,Math.floor((now-first)/86400)+1);
   return{verified:true,day,building:day<=length,fromEpoch:first};
 }
 function assess({moisture,temperature,trendChange=null,epoch=null,nowEpoch=Date.now()/1000}={}){
   const month=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Dublin",month:"numeric"}).format(new Date(nowEpoch*1000)));
   const coolSeason=month>=11||month<=3;
   const seasonal=coolSeason
     ?"In cooler months, soil can dry more slowly. Check the soil and the plant's needs before watering."
     :"In warmer or windy conditions, soil may dry faster. Check the soil and the plant's needs before watering.";
   const disclaimer="These soil sensor bands are provisional, not universal watering thresholds, and are not calibrated for any plant species. Check moisture below the surface and ensure appropriate drainage.";
   if(!isPct(moisture))return{status:"Check compost manually",advice:"A usable soil moisture reading is unavailable. Feel the compost before deciding whether to water.",context:seasonal+" "+disclaimer,trend:"Moisture trend unavailable"};
   const age=isNum(epoch)?Number(nowEpoch)-Number(epoch):null;
   if(age===null||age>900||age< -120)return{status:"Reading needs checking",advice:"This moisture reading is missing a valid time or is delayed. Refresh the station and feel the compost before deciding whether to water.",context:seasonal+" "+disclaimer,trend:"Current trend not verified"};
   // During the reset period the historic plant/pot thresholds are not
   // calibrated to the replacement compost. Report the sensor's measurement
   // but avoid automated watering decisions, whatever the percentage.
   if(Number(nowEpoch)>=NEW_POT_CUTOFF_EPOCH){
     const phase=baselinePhase(NEW_POT_CUTOFF_EPOCH,nowEpoch,NEW_POT_BASELINE_DAYS);
     if(!phase.verified||phase.building){
       const difference=isNum(trendChange)?Number(trendChange):null;
       const trend=difference===null?"New-pot trend building":difference<=-2
         ?"Drying · down "+Math.abs(difference).toFixed(1)+" percentage points":difference>=2
         ?"Moistening · up "+difference.toFixed(1)+" percentage points":"Broadly steady";
       return{
         status:"Building new-pot baseline",
         advice:"Readings are being established for the new pot. Check the soil below the surface and the plant's needs before watering; no automatic watering recommendation is available yet.",
         context:seasonal+" Earlier pot readings are excluded from this baseline. The new reference period starts 27 November 2026.",
         trend
       };
     }
   }
   const value=Number(moisture);
   let status,advice;
   if(value<20){status="Check compost now";advice="The reading is low for this pot's trial guide. If compost feels dry 4–5 cm down, water thoroughly and let excess drain. If damp, do not water from the percentage alone.";}
   else if(value<30){status="Check before watering";advice="The reading is towards the dry end of this pot's trial guide. Feel the compost 4–5 cm below the surface and water only if it is dry.";}
   else if(value<=55){status="No watering indicated yet";advice="This falls in the provisional monitoring range for this pot. If compost is still slightly damp 4–5 cm down, leave it alone; water if it feels dry.";}
   else{status="Check drainage if persistently wet";advice="This reading is high for this pot's trial guide. Avoid adding water while compost is wet and check drainage if the reading stays high.";}
   let trend="Moisture trend not yet established";
   if(isNum(trendChange)){
     const difference=Number(trendChange),change=Math.abs(difference).toFixed(1);
     trend=difference<=-2?"Drying · down "+change+" percentage points":difference>=2?"Moistening · up "+change+" percentage points":"Broadly steady";
     if(difference<=-3)advice+=" Moisture has been falling; check again sooner.";
     else if(difference>=3)advice+=" Moisture has risen recently; monitor drainage if compost remains wet.";
   }
   const cold=isNum(temperature)&&Number(temperature)<=12?" The compost reading is cool, which generally reduces water demand.":"";
   return{status,advice,context:seasonal+cold+" "+disclaimer,trend};
 }
 window.ParknacrossSoil={assess,trendFromReadings,baselinePhase,NEW_POT_CUTOFF_EPOCH,NEW_POT_BASELINE_DAYS};
})();