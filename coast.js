(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},API=cfg.apiBase,$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const usable=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 const n=(v,d=1)=>usable(v)?Number(v).toFixed(d):"--";
 const comp=d=>{if(!usable(d))return"--";const a=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];return a[Math.round((((Number(d)%360)+360)%360)/22.5)%16]};
 const timeOpts={timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"};
 const dateOpts={timeZone:"Europe/Dublin",weekday:"short",day:"numeric",month:"short"};
 const duration=ms=>{if(!Number.isFinite(ms)||ms<0)return"";const mins=Math.max(0,Math.round(ms/60000));const h=Math.floor(mins/60),m=mins%60;if(h&&m)return`${h}h ${m}m`;if(h)return`${h}h`;return`${m}m`};
 const seaDataTime=item=>{const raw=item?.observation_time||item?.timestamp||item?.model_time||null;if(!raw)return null;const time=new Date(raw).getTime();return Number.isFinite(time)?time:null};
 const freshSeaReference=item=>{const time=seaDataTime(item);return time!==null&&Date.now()-time>=-2*3600000&&Date.now()-time<=12*3600000};
 function correctedLocalSeaEstimate(local,m2){
   const model=usable(local?.sea_surface_temperature_c)?Number(local.sea_surface_temperature_c):null;
   const buoy=usable(m2?.sea_surface_temperature_c)?Number(m2.sea_surface_temperature_c):null;
   if(model===null||model<2||model>25)return null;
   if(buoy===null||buoy<2||buoy>25||!freshSeaReference(m2))return{value:model,crossChecked:false,adjusted:false};
   const difference=model-buoy;
   if(Math.abs(difference)<=1.5)return{value:model,crossChecked:true,adjusted:false};
   /* M2 is not local, so retain most of the higher-resolution coastal model.
      Its fresh observation receives a 35% bias-correction weight only when
      the two sources differ materially. The 2.5°C guard prevents either
      source producing an implausible local departure on its own. */
   const blended=model*.65+buoy*.35;
   const value=Math.min(buoy+2.5,Math.max(buoy-2.5,blended));
   return{value:Math.round(value*10)/10,crossChecked:true,adjusted:true};
 }
 const swimState={wind:null,gust:null,direction:null,exposure:null,air:null,rain:null,observedAt:null,sea:null,seaSource:null,tide:null,warning:null};
 function renderWhatToWear(){
   const air=usable(swimState.air)?Number(swimState.air):null,wind=usable(swimState.wind)?Number(swimState.wind):null,gust=usable(swimState.gust)?Number(swimState.gust):null,rain=usable(swimState.rain)?Number(swimState.rain):null;
   let clothing="Waiting for the latest air-temperature observation…";
   if(air!==null){
     if(air>=22)clothing="Light clothing should be comfortable: a T-shirt with shorts or light trousers.";
     else if(air>=17)clothing="Light layers should work well: a T-shirt or light top with trousers, plus a thin layer to carry.";
     else if(air>=13)clothing="Wear a light jumper or fleece with trousers and bring a light jacket.";
     else if(air>=9)clothing="Choose warm layers, long trousers and a medium-weight jacket.";
     else if(air>=5)clothing="A warm coat with layered clothing is advisable.";
     else clothing="Dress for cold conditions with an insulated coat, warm layers, a hat and gloves.";
   }
   const extras=[];
   if((wind!==null&&wind>=20)||(gust!==null&&gust>=30))extras.push("a windproof outer layer");
   if(rain!==null&&rain>0)extras.push("a waterproof jacket and water-resistant footwear");
   if(!extras.length)extras.push("no additional rain or strong-wind layer is indicated by the latest station reading");
   set("wearClothing",clothing);set("wearExtras",`${extras.join("; ")}.`);
   set("wearContext",air===null?"Recommendations will update when the local observation is available.":`Based on ${n(air)}°C at Parknacross${wind!==null?`, wind ${n(wind)} km/h`:""}${gust!==null?` and gusts ${n(gust)} km/h`:""}.`);
 }
 function renderSwimSummary(){
   const parts=[];
   if(usable(swimState.air))parts.push(`Air ${n(swimState.air)}°C`);
   if(usable(swimState.sea))parts.push(`sea ${n(swimState.sea)}°C (${swimState.seaSource||"modelled"})`);
   if(usable(swimState.wind)){const direction=usable(swimState.direction)?` ${comp(swimState.direction)}`:"";const exposure=swimState.exposure?` · ${swimState.exposure.toLowerCase()}`:"";parts.push(`wind ${n(swimState.wind)} km/h${direction}${exposure}`);}
   if(usable(swimState.rain)&&Number(swimState.rain)>0)parts.push(`rain rate ${n(swimState.rain)} mm/h`);else if(usable(swimState.rain))parts.push("no rain detected at the station");
   if(swimState.tide)parts.push(swimState.tide);
   if(swimState.warning)parts.push(swimState.warning);
   set("swimSummary",parts.length?`${parts.join(". ")}. Check the official forecast and assess conditions at the water yourself.`:"Conditions are temporarily unavailable. Check official forecasts before travelling.");
   if(swimState.observedAt){const d=new Date(swimState.observedAt);if(!Number.isNaN(d.getTime()))set("swimUpdated",`Latest local observation: ${d.toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})} Irish time.`);}
   renderWhatToWear();
 }
 async function get(p){const r=await fetch(`${API}${p}`,{cache:"no-store"});if(!r.ok)throw new Error();return r.json()}
 async function loadCurrent(){try{const c=await get("/current");set("coastWind",usable(c.wind_speed_kmh)?`${n(c.wind_speed_kmh)} km/h`:"--");set("coastGust",usable(c.wind_gust_kmh)?`${n(c.wind_gust_kmh)} km/h`:"--");set("coastDir",usable(c.wind_direction_deg)?`${comp(c.wind_direction_deg)} · ${Math.round(Number(c.wind_direction_deg))}°`:"--");set("coastAirTemp",usable(c.temperature_c)?`${n(c.temperature_c)} °C`:"--");set("coastAirDetail",usable(c.humidity)?`Humidity ${Math.round(Number(c.humidity))}% · Parknacross`:"Parknacross observation");set("coastRain",usable(c.rain_rate_mm_h)?`${n(c.rain_rate_mm_h)} mm/h`:"--");set("coastRainDetail",usable(c.rain_daily_mm)?`${n(c.rain_daily_mm)} mm recorded today`:"Current station rain rate");Object.assign(swimState,{wind:c.wind_speed_kmh,gust:c.wind_gust_kmh,direction:c.wind_direction_deg,air:c.temperature_c,rain:c.rain_rate_mm_h,observedAt:c.received_at||c.timestamp||(usable(c.epoch)?Number(c.epoch)*1000:null)});if(usable(c.wind_direction_deg)){const d=((Number(c.wind_direction_deg)%360)+360)%360;let label,detail;if(d>=45&&d<165){label="Onshore";detail="Wind arriving from the Irish Sea";}else if(d>=225&&d<345){label="Offshore";detail="Wind arriving from inland";}else if(d>=165&&d<225){label="Alongshore · S";detail="Southerly component along the coast";}else{label="Alongshore · N";detail="Northerly component along the coast";}swimState.exposure=label;set("coastExposure",label);set("coastExposureDetail",`${detail} · ${comp(d)} ${Math.round(d)}°`);}renderSwimSummary();}catch{set("coastWind","--");set("coastGust","--");set("coastDir","--");set("coastExposure","--");renderSwimSummary();}}
 async function loadSeaTemperature(){try{const s=await get("/marine/sea-temperature");const local=s.local_model||(s.source_type==="model"?s:null);const m2=s.m2_buoy||((s.source_type==="observation"&&s.station_id==="M2")?s:null);const stamp=v=>{const t=v?.model_time||v?.observation_time||v?.timestamp||null;return t?new Date(t).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):null};const estimate=correctedLocalSeaEstimate(local,m2);if(estimate){set("localSeaTemp",`${n(estimate.value)} °C`);const t=stamp(local);let detail=estimate.crossChecked?"Coastal model cross-checked with fresh M2 data":"Coastal model estimate · M2 cross-check unavailable";if(estimate.adjusted)detail+=" · warm bias adjusted";set("localSeaTempTime",t?`${detail} · ${t}`:detail);swimState.sea=estimate.value;swimState.seaSource=estimate.crossChecked?"cross-checked model estimate":"unverified model estimate";}else{set("localSeaTemp","Unavailable");set("localSeaTempTime","Local model temporarily unavailable");}if(m2&&usable(m2.sea_surface_temperature_c)){set("m2SeaTemp",`${n(m2.sea_surface_temperature_c)} °C`);const source=m2.source_short||m2.source||"M2 buoy",t=stamp(m2);set("m2SeaTempTime",t?`${source} · ${t}`:source);}else{set("m2SeaTemp","Unavailable");set("m2SeaTempTime","M2 buoy observation temporarily unavailable");}renderSwimSummary();}catch(error){console.error("Sea temperature:",error);set("localSeaTemp","Unavailable");set("localSeaTempTime","Local model temporarily unavailable");set("m2SeaTemp","Unavailable");set("m2SeaTempTime","M2 buoy observation temporarily unavailable");renderSwimSummary();}}
 async function loadMarine(){try{const m=await get("/met/marine");const localWarning=Boolean(m.local_warning_relevant||m.local_gale_warning||m.local_small_craft_warning);let warningTitle="No warning in force";if(localWarning){if(m.local_gale_warning&&m.local_small_craft_warning)warningTitle="Gale and Small Craft warnings";else if(m.local_gale_warning)warningTitle="Gale warning";else if(m.local_small_craft_warning)warningTitle="Small Craft warning";else warningTitle="Marine warning in force";}swimState.warning=localWarning?`${warningTitle} relevant to the local marine sector`:"no relevant marine warning reported";set("coastWarn",warningTitle);set("coastIssued",m.local_warning_sector?`${m.local_warning_sector} · Met Éireann`:(m.issued?`Issued ${new Date(m.issued).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}`:"Met Éireann"));if(m.local_area){set("marineArea",m.local_area.area);set("marineWind",m.local_area.wind);set("marineWeather",m.local_area.weather);set("marineVis",m.local_area.visibility)}set("marineOutlook",m.outlook?.text||"--");renderSwimSummary();}catch{set("coastWarn","Marine forecast unavailable");swimState.warning="official marine forecast unavailable";renderSwimSummary();}}
 async function loadTides(){try{const t=await get("/marine/tides?station=Arklow"),a=(t.events||[]).filter(x=>x&&x.time).sort((x,y)=>new Date(x.time)-new Date(y.time));if(!a.length)return;const now=new Date(),previous=[...a].reverse().find(x=>new Date(x.time)<=now)||null,next=a.find(x=>new Date(x.time)>now)||null;let state="--";if(previous)state=previous.type==="low"?"Rising ↑":"Falling ↓";else if(next)state=next.type==="high"?"Rising ↑":"Falling ↓";set("nextTide",state);if(next){const label=next.type==="high"?"High":"Low",until=duration(new Date(next.time)-now),height=usable(next.height_m)?` · ${n(next.height_m,2)} m OD Malin`:"";const time=new Date(next.time).toLocaleTimeString("en-IE",timeOpts);set("nextTideTime",`${label} ${time} · in ${until}${height}`);swimState.tide=`Arklow tide ${state.replace(/[↑↓]/g,"").trim().toLowerCase()} toward ${label.toLowerCase()} water at ${time}`;}else set("nextTideTime","Arklow prediction · next event unavailable");$("tideList").innerHTML=a.filter(x=>new Date(x.time)>now-6*3600000).slice(0,8).map(x=>`<article class="tide-item"><span>${new Date(x.time).toLocaleDateString("en-IE",dateOpts)}</span><strong>${x.type==="high"?"High water":"Low water"}</strong><time>${new Date(x.time).toLocaleTimeString("en-IE",timeOpts)}</time><b>${usable(x.height_m)?`${n(x.height_m,2)} m OD Malin`:"--"}</b></article>`).join("");renderSwimSummary();}catch{set("nextTideTime","Arklow prediction temporarily unavailable");swimState.tide="tide prediction unavailable";renderSwimSummary();}}
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());loadCurrent();loadMarine();loadTides();loadSeaTemperature();setInterval(loadCurrent,60*1000);setInterval(loadMarine,15*60*1000);setInterval(loadTides,30*60*1000);setInterval(loadSeaTemperature,30*60*1000);});
})();
