(() => {
 "use strict";
 // This WH52 sits in one hydrangea pot. Bands are trial prompts, not calibrated thresholds.
 const isNum=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 const isPct=v=>isNum(v)&&Number(v)>=0&&Number(v)<=100;
 function trendFromReadings(rows,current){
   const epoch=Number(current?.epoch),moisture=Number(current?.soil_moisture_pct);
   if(!Number.isFinite(epoch)||epoch<=0||!isPct(current?.soil_moisture_pct))return null;
   const baseline=(Array.isArray(rows)?rows:[]).filter(r=>isNum(r?.epoch)&&isPct(r?.soil_moisture_pct)&&Number(r.epoch)>=epoch-43200&&Number(r.epoch)<=epoch-7200)
     .sort((a,b)=>Math.abs(Number(a.epoch)-(epoch-21600))-Math.abs(Number(b.epoch)-(epoch-21600)))[0];
   return baseline?Math.round((moisture-Number(baseline.soil_moisture_pct))*10)/10:null;
 }
 function assess({moisture,temperature,trendChange=null,epoch=null,nowEpoch=Date.now()/1000}={}){
   const month=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Dublin",month:"numeric"}).format(new Date(nowEpoch*1000)));
   const coolSeason=month>=11||month<=3;
   const seasonal=coolSeason
     ?"In cooler months, this potted hydrangea usually needs less water; check its compost before watering."
     :"In warmer months, this hydrangea pot can dry quickly, especially in windy conditions; check its compost regularly.";
   const disclaimer="These WH52 bands are trial guidance for this hydrangea pot, not calibrated watering thresholds. Check compost 4–5 cm below the surface and ensure drainage.";
   if(!isPct(moisture))return{status:"Check compost manually",advice:"A usable soil moisture reading is unavailable. Feel the compost before deciding whether to water.",context:seasonal+" "+disclaimer,trend:"Moisture trend unavailable"};
   const age=isNum(epoch)?Number(nowEpoch)-Number(epoch):null;
   if(age===null||age>900||age< -120)return{status:"Reading needs checking",advice:"This moisture reading is missing a valid time or is delayed. Refresh the station and feel the compost before deciding whether to water.",context:seasonal+" "+disclaimer,trend:"Current trend not verified"};
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
 window.ParknacrossHydrangeaSoil={assess,trendFromReadings};
})();