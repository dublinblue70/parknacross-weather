(() => {
  "use strict";
  const API=(window.PARKNACROSS_CONFIG||{}).apiBase||"https://parknacross-weather.dave-s-carter.workers.dev";
  const $=id=>document.getElementById(id),set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const usable=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  const n=(value,digits=1)=>usable(value)?Number(value).toFixed(digits):"--";
  const get=async path=>{const response=await fetch(`${API}${path}`,{cache:"no-store"});if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);return response.json()};
  const localDate=value=>new Date(value).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  const timelineStamp=value=>new Date(value).toLocaleString("en-IE",{timeZone:"Europe/Dublin",weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  const dayLabel=day=>new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IE",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"});
  const direction=degrees=>{if(!usable(degrees))return"";const labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];return labels[Math.round((((Number(degrees)%360)+360)%360)/22.5)%16]};

  async function loadCoastalTimeline(){
    const host=$("coastalTimeline");
    try{
      const [current,tides,point,marine]=await Promise.all([get("/current"),get("/marine/tides?station=Arklow"),get("/met/point").catch(()=>null),get("/met/marine").catch(()=>null)]);
      const observedAt=current.received_at||Number(current.epoch)*1000;
      const items=[{group:"Current observation",time:`Now · ${timelineStamp(observedAt)}`,dateTime:new Date(observedAt).toISOString(),title:`${n(current.temperature_c)}°C · wind ${n(current.wind_speed_kmh)} km/h ${direction(current.wind_direction_deg)}`,detail:`Gust ${n(current.wind_gust_kmh)} km/h · rain rate ${n(current.rain_rate_mm_h)} mm/h`}];
      const now=Date.now();
      const warning=marine&&(marine.local_warning_relevant||marine.local_gale_warning||marine.local_small_craft_warning);
      items.push({group:"Marine-warning status",time:`Checked ${timelineStamp(Date.now())}`,dateTime:new Date().toISOString(),title:warning?"Relevant marine warning reported":"No relevant marine warning reported",detail:marine?.local_warning_sector||"Check Met Éireann before marine activity"});
      if(point?.target_day)items.push({group:"Official point forecast",time:`${dayLabel(point.target_day)} · all day`,dateTime:point.target_day,title:`${n(point.forecast_low_c)}–${n(point.forecast_high_c)}°C`,detail:`Forecast rain ${n(point.forecast_rain_mm)} mm · issued ${localDate(point.captured_at)}`});
      (tides.events||[]).filter(item=>Date.parse(item.time)>now).slice(0,4).forEach(item=>items.push({group:"Upcoming Arklow tides",time:timelineStamp(item.time),dateTime:new Date(item.time).toISOString(),title:`${item.type==="high"?"High":"Low"} water · Arklow prediction`,detail:usable(item.height_m)?`${n(item.height_m,2)} m OD Malin · Poulshone context only`:"Predicted tide event · Poulshone context only"}));
      const nodes=[];let lastGroup="";
      for(const item of items){if(item.group!==lastGroup){const heading=document.createElement("h3");heading.className="intelligence-timeline-group";heading.textContent=item.group;nodes.push(heading);lastGroup=item.group;}const article=document.createElement("article");article.className="intelligence-timeline-item";const time=document.createElement("time");time.textContent=item.time;if(item.dateTime)time.dateTime=item.dateTime;const copy=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small");strong.textContent=item.title;small.textContent=item.detail;copy.append(strong,small);article.append(time,copy);nodes.push(article);}host.replaceChildren(...nodes);return true;
    }catch(error){host.innerHTML='<div class="empty-state">Coastal conditions are temporarily unavailable.</div>';return false;}
  }

  async function loadStormMode(){
    try{
      const data=await get("/history?hours=24"),rows=(data.readings||[]).filter(row=>usable(row.epoch)).sort((a,b)=>Number(a.epoch)-Number(b.epoch));
      if(!rows.length)throw new Error("No readings");
      const values=key=>rows.filter(row=>usable(row[key])).map(row=>Number(row[key]));
      const pressures=values("pressure_hpa"),gusts=values("wind_gust_kmh"),rainRates=values("rain_rate_mm_h");
      const lightningRows=rows.filter(row=>usable(row.lightning_strikes)).map(row=>({epoch:Number(row.epoch),count:Number(row.lightning_strikes)}));
      let lightningChange=lightningRows.length?0:null;
      if(lightningRows.length>1){for(let index=1;index<lightningRows.length;index++){const previous=lightningRows[index-1],current=lightningRows[index],elapsed=current.epoch-previous.epoch;if(elapsed>0&&elapsed<=20*60&&current.count>=previous.count)lightningChange+=current.count-previous.count;}}
      const pressureChange=pressures.length>1?pressures.at(-1)-pressures[0]:null,maxGust=gusts.length?Math.max(...gusts):null,maxRain=rainRates.length?Math.max(...rainRates):null;
      set("stormPressure",usable(pressureChange)?`${pressureChange>=0?"+":""}${n(pressureChange)} hPa`:"Unavailable");set("stormGust",usable(maxGust)?`${n(maxGust)} km/h`:"Unavailable");set("stormRain",usable(maxRain)?`${n(maxRain)} mm/h`:"Unavailable");set("stormLightning",usable(lightningChange)?String(Math.round(lightningChange)):"No data yet");set("stormLightningDetail",usable(lightningChange)?"Detections recorded in the last 24 hours":"Waiting for usable WH57 readings");
      const active=(usable(maxGust)&&maxGust>=50)||(usable(maxRain)&&maxRain>=7.5)||(usable(pressureChange)&&pressureChange<=-8)||(usable(lightningChange)&&lightningChange>0);
      const badge=$("stormModeBadge");badge.textContent=active?"Active weather":"No threshold reached";badge.classList.toggle("storm-active",active);
      set("stormModeStatus",active?"One or more site-defined significant-weather indicators were reached in the last 24 hours.":"No site-defined significant-weather indicator was reached in the latest 24-hour archive.");
      const parts=[];if(usable(pressureChange))parts.push(`Pressure ${pressureChange<0?"fell":"rose"} ${Math.abs(pressureChange).toFixed(1)} hPa`);if(usable(maxGust))parts.push(`the strongest gust reached ${maxGust.toFixed(1)} km/h`);if(usable(maxRain))parts.push(maxRain>0?`the peak rain rate was ${maxRain.toFixed(1)} mm/h`:"no rain rate above zero was recorded");if(usable(lightningChange)&&lightningChange>0)parts.push(`${Math.round(lightningChange)} lightning-counter increase${lightningChange===1?"":"s"} occurred`);set("stormNarrative",`${parts.join(", ")}. Thresholds describe the archived observations; official warnings remain authoritative.`);return true;
    }catch(error){set("stormModeStatus","Recent archive analysis is temporarily unavailable.");set("stormNarrative","The significant-weather review could not analyse the latest observations.");return false;}
  }

  const clock=()=>new Date().toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit",second:"2-digit"});
  function markRefreshed(message="Updated"){set("intelligenceUpdated",`${message} ${clock()} Irish time`);}
  async function refreshSection(button,loader,label){
    if(!button||button.disabled)return;
    const original=button.textContent;
    button.disabled=true;button.setAttribute("aria-busy","true");button.textContent="Refreshing…";
    set("intelligenceUpdated",`Refreshing ${label.toLowerCase()}…`);
    const success=await loader();
    markRefreshed(success?`${label} refreshed`:`${label} could not be refreshed · last attempt`);
    button.textContent=success?"Refreshed ✓":"Try again";
    window.setTimeout(()=>{button.disabled=false;button.removeAttribute("aria-busy");button.textContent=original;},1200);
  }
  document.addEventListener("DOMContentLoaded",()=>{
    set("year",new Date().getFullYear());
    Promise.all([loadCoastalTimeline(),loadStormMode()]).then(()=>markRefreshed());
    const coastalButton=$("coastalRetry"),stormButton=$("stormRetry");
    coastalButton?.addEventListener("click",()=>refreshSection(coastalButton,loadCoastalTimeline,"Coastal overview"));
    stormButton?.addEventListener("click",()=>refreshSection(stormButton,loadStormMode,"Significant weather review"));
  });
})();
