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
      set("stormModeStatus",active?"One or more significant-weather thresholds were reached in the last 24 hours.":"No Storm Mode threshold was reached in the latest 24-hour archive.");
      const parts=[];if(usable(pressureChange))parts.push(`Pressure ${pressureChange<0?"fell":"rose"} ${Math.abs(pressureChange).toFixed(1)} hPa`);if(usable(maxGust))parts.push(`the strongest gust reached ${maxGust.toFixed(1)} km/h`);if(usable(maxRain))parts.push(maxRain>0?`the peak rain rate was ${maxRain.toFixed(1)} mm/h`:"no rain rate above zero was recorded");if(usable(lightningChange)&&lightningChange>0)parts.push(`${Math.round(lightningChange)} lightning-counter increase${lightningChange===1?"":"s"} occurred`);set("stormNarrative",`${parts.join(", ")}. Thresholds describe the archived observations; official warnings remain authoritative.`);return true;
    }catch(error){set("stormModeStatus","Recent archive analysis is temporarily unavailable.");set("stormNarrative","Storm Mode could not analyse the latest observations.");return false;}
  }

  function answerArchive(rows,question){
    const q=question.toLowerCase(),max=(field)=>rows.reduce((best,row)=>usable(row[field])&&(!best||Number(row[field])>Number(best[field]))?row:best,null),min=(field)=>rows.reduce((best,row)=>usable(row[field])&&(!best||Number(row[field])<Number(best[field]))?row:best,null);
    let row,label,value;
    if(/wettest|most rain/.test(q)){row=max("rain_mm");label="The wettest archived day";value=row?`${n(row.rain_mm)} mm`:null;}
    else if(/warmest|hottest|highest temp/.test(q)){row=max("high_c");label="The warmest archived day";value=row?`${n(row.high_c)}°C`:null;}
    else if(/coldest|lowest temp/.test(q)){row=min("low_c");label="The coldest archived day";value=row?`${n(row.low_c)}°C`:null;}
    else if(/gust|windiest|strongest wind/.test(q)){row=max("peak_gust_kmh");label="The strongest archived gust";value=row?`${n(row.peak_gust_kmh)} km/h`:null;}
    else if(/wettest month|most rain.*month/.test(q)){const months=new Map();rows.forEach(item=>{if(item.day&&usable(item.rain_mm)){const key=item.day.slice(0,7);months.set(key,(months.get(key)||0)+Number(item.rain_mm));}});const result=[...months].sort((a,b)=>b[1]-a[1])[0];return result?`The wettest archived month is ${new Date(`${result[0]}-15T12:00:00Z`).toLocaleDateString("en-IE",{timeZone:"UTC",month:"long",year:"numeric"})} with ${n(result[1])} mm. Months with partial archive coverage may not be directly comparable.`:"No suitable archived rainfall values were found.";}
    else if(/dry spell|consecutive dry/.test(q)){let best=0,current=0,end=null;rows.slice().sort((a,b)=>String(a.day).localeCompare(String(b.day))).forEach(item=>{if(usable(item.rain_mm)&&Number(item.rain_mm)<0.2){current++;if(current>best){best=current;end=item.day;}}else current=0;});return best?`The longest archived dry spell is ${best} day${best===1?"":"s"}, ending ${dayLabel(end)}. A dry day here means less than 0.2 mm recorded.`:"No complete dry spell could be calculated from the archive.";}
    else if(/average.*temperature|mean.*temperature/.test(q)){const values=rows.filter(item=>usable(item.mean_temperature_c)).map(item=>Number(item.mean_temperature_c));return values.length?`The average of the ${values.length} available archived daily mean temperatures is ${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)}°C.`:"Daily mean temperature is not available in the archive yet.";}
    else if(/frost|freez/.test(q)){const days=rows.filter(item=>usable(item.low_c)&&Number(item.low_c)<=0);return `${days.length} archived day${days.length===1?"":"s"} had a low of 0°C or below.`;}
    else {const match=q.match(/(?:above|over|exceed(?:ed)?)\s*(-?\d+(?:\.\d+)?)\s*°?c?/);if(match){const threshold=Number(match[1]),days=rows.filter(item=>usable(item.high_c)&&Number(item.high_c)>threshold);return `${days.length} archived day${days.length===1?"":"s"} had a high above ${threshold}°C.`;}return"Choose an example or ask about the wettest day, warmest day, coldest day, strongest gust, wettest month, dry spell, frost days or days above a temperature.";}
    return row&&value?`${label} was ${dayLabel(row.day)} with ${value}. Open History and choose that date for the detailed record.`:`No suitable archived value was found for that question.`;
  }
  async function setupArchiveQuestions(){
    let rows=[];try{const data=await get("/daily?days=3660");rows=data.days||[];}catch{}
    const ask=question=>{if($("archiveQuestion"))$("archiveQuestion").value=question;set("archiveAnswer",rows.length?answerArchive(rows,question):"The saved archive could not be loaded. Please try again later.");};
    $("archiveQuestionForm")?.addEventListener("submit",event=>{event.preventDefault();const question=$("archiveQuestion").value.trim();if(question)ask(question);else set("archiveAnswer","Enter a question about the saved archive.");});
    document.querySelectorAll("[data-archive-question]").forEach(button=>button.addEventListener("click",()=>ask(button.dataset.archiveQuestion||"")));
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
    Promise.all([loadCoastalTimeline(),loadStormMode(),setupArchiveQuestions()]).then(()=>markRefreshed());
    const coastalButton=$("coastalRetry"),stormButton=$("stormRetry");
    coastalButton?.addEventListener("click",()=>refreshSection(coastalButton,loadCoastalTimeline,"Coastal overview"));
    stormButton?.addEventListener("click",()=>refreshSection(stormButton,loadStormMode,"Storm Mode"));
  });
})();
