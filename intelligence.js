(() => {
  "use strict";
  const API=(window.PARKNACROSS_CONFIG||{}).apiBase||"https://parknacross-weather.dave-s-carter.workers.dev";
  const $=id=>document.getElementById(id),set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
  const usable=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
  const n=(value,digits=1)=>usable(value)?Number(value).toFixed(digits):"--";
  const get=async path=>{const response=await fetch(`${API}${path}`,{cache:"no-store"});if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);return response.json()};
  const localDate=value=>new Date(value).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  const dayLabel=day=>new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IE",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"});
  const direction=degrees=>{if(!usable(degrees))return"";const labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];return labels[Math.round((((Number(degrees)%360)+360)%360)/22.5)%16]};
  let latestCurrent=null,skyMeta=null;

  async function loadCoastalTimeline(){
    const host=$("coastalTimeline");
    try{
      const [current,tides,point,marine]=await Promise.all([get("/current"),get("/marine/tides?station=Arklow"),get("/met/point").catch(()=>null),get("/met/marine").catch(()=>null)]);
      latestCurrent=current;
      const items=[{time:"Now",title:`${n(current.temperature_c)}°C · wind ${n(current.wind_speed_kmh)} km/h ${direction(current.wind_direction_deg)}`,detail:`Gust ${n(current.wind_gust_kmh)} km/h · rain rate ${n(current.rain_rate_mm_h)} mm/h · observed ${localDate(current.received_at||Number(current.epoch)*1000)}`}];
      const now=Date.now();
      (tides.events||[]).filter(item=>Date.parse(item.time)>now).slice(0,4).forEach(item=>items.push({time:new Date(item.time).toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}),title:`${item.type==="high"?"High":"Low"} water · Arklow prediction`,detail:usable(item.height_m)?`${n(item.height_m,2)} m OD Malin · Poulshone context only`:"Predicted tide event · Poulshone context only"}));
      if(point?.target_day)items.push({time:"Tomorrow",title:`Official point forecast: ${n(point.forecast_low_c)}–${n(point.forecast_high_c)}°C`,detail:`Forecast rain ${n(point.forecast_rain_mm)} mm · captured ${localDate(point.captured_at)}`});
      const warning=marine&&(marine.local_warning_relevant||marine.local_gale_warning||marine.local_small_craft_warning);
      items.push({time:"Official",title:warning?"Relevant marine warning reported":"No relevant marine warning reported",detail:marine?.local_warning_sector||"Check Met Éireann before marine activity"});
      host.replaceChildren(...items.map(item=>{const article=document.createElement("article");article.className="intelligence-timeline-item";const time=document.createElement("time");time.textContent=item.time;const copy=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small");strong.textContent=item.title;small.textContent=item.detail;copy.append(strong,small);article.append(time,copy);return article;}));
    }catch(error){host.innerHTML='<div class="empty-state">Coastal timeline temporarily unavailable.</div>';}
  }

  async function loadStormMode(){
    try{
      const data=await get("/history?hours=24"),rows=(data.readings||[]).filter(row=>usable(row.epoch)).sort((a,b)=>Number(a.epoch)-Number(b.epoch));
      if(!rows.length)throw new Error("No readings");
      const values=key=>rows.filter(row=>usable(row[key])).map(row=>Number(row[key]));
      const pressures=values("pressure_hpa"),gusts=values("wind_gust_kmh"),rainRates=values("rain_rate_mm_h"),lightning=values("lightning_count");
      const pressureChange=pressures.length>1?pressures.at(-1)-pressures[0]:null,maxGust=gusts.length?Math.max(...gusts):null,maxRain=rainRates.length?Math.max(...rainRates):null,lightningChange=lightning.length>1?Math.max(0,lightning.at(-1)-lightning[0]):null;
      set("stormPressure",usable(pressureChange)?`${pressureChange>=0?"+":""}${n(pressureChange)} hPa`:"Unavailable");set("stormGust",usable(maxGust)?`${n(maxGust)} km/h`:"Unavailable");set("stormRain",usable(maxRain)?`${n(maxRain)} mm/h`:"Unavailable");set("stormLightning",usable(lightningChange)?String(Math.round(lightningChange)):"Unavailable");
      const active=(usable(maxGust)&&maxGust>=50)||(usable(maxRain)&&maxRain>=7.5)||(usable(pressureChange)&&pressureChange<=-8)||(usable(lightningChange)&&lightningChange>0);
      const badge=$("stormModeBadge");badge.textContent=active?"Active weather":"No significant trigger";badge.classList.toggle("storm-active",active);
      set("stormModeStatus",active?"One or more significant-weather thresholds were reached in the last 24 hours.":"No Storm Mode threshold was reached in the latest 24-hour archive.");
      const parts=[];if(usable(pressureChange))parts.push(`Pressure ${pressureChange<0?"fell":"rose"} ${Math.abs(pressureChange).toFixed(1)} hPa`);if(usable(maxGust))parts.push(`the strongest gust reached ${maxGust.toFixed(1)} km/h`);if(usable(maxRain))parts.push(maxRain>0?`the peak rain rate was ${maxRain.toFixed(1)} mm/h`:"no rain rate above zero was recorded");if(usable(lightningChange)&&lightningChange>0)parts.push(`${Math.round(lightningChange)} lightning-counter increase${lightningChange===1?"":"s"} occurred`);set("stormNarrative",`${parts.join(", ")}. Thresholds describe the archived observations; official warnings remain authoritative.`);
    }catch(error){set("stormModeStatus","Recent archive analysis is temporarily unavailable.");set("stormNarrative","Storm Mode could not analyse the latest observations.");}
  }

  function answerArchive(rows,question){
    const q=question.toLowerCase(),max=(field)=>rows.reduce((best,row)=>usable(row[field])&&(!best||Number(row[field])>Number(best[field]))?row:best,null),min=(field)=>rows.reduce((best,row)=>usable(row[field])&&(!best||Number(row[field])<Number(best[field]))?row:best,null);
    let row,label,value;
    if(/wettest|most rain/.test(q)){row=max("rain_mm");label="The wettest archived day";value=row?`${n(row.rain_mm)} mm`:null;}
    else if(/warmest|hottest|highest temp/.test(q)){row=max("high_c");label="The warmest archived day";value=row?`${n(row.high_c)}°C`:null;}
    else if(/coldest|lowest temp/.test(q)){row=min("low_c");label="The coldest archived day";value=row?`${n(row.low_c)}°C`:null;}
    else if(/gust|windiest|strongest wind/.test(q)){row=max("peak_gust_kmh");label="The strongest archived gust";value=row?`${n(row.peak_gust_kmh)} km/h`:null;}
    else {const match=q.match(/(?:above|over|exceed(?:ed)?)\s*(-?\d+(?:\.\d+)?)\s*°?c?/);if(match){const threshold=Number(match[1]),days=rows.filter(item=>usable(item.high_c)&&Number(item.high_c)>threshold);return `${days.length} archived day${days.length===1?"":"s"} had a high above ${threshold}°C.`;}return"Try asking about the wettest day, warmest day, coldest day, strongest gust, or days above a temperature.";}
    return row&&value?`${label} was ${dayLabel(row.day)} with ${value}. Open History and choose that date for the detailed record.`:`No suitable archived value was found for that question.`;
  }
  async function setupArchiveQuestions(){
    let rows=[];try{const data=await get("/daily?days=3660");rows=data.days||[];}catch{}
    $("archiveQuestionForm")?.addEventListener("submit",event=>{event.preventDefault();const question=$("archiveQuestion").value.trim();set("archiveAnswer",question?answerArchive(rows,question):"Enter a question about the saved archive.");});
  }

  async function loadVerification(){try{const data=await get("/forecast-verification"),items=data.comparisons||[];set("verificationTitle",items.length?`${items.length} completed comparison${items.length===1?"":"s"}`:"Forecast verification is building");set("verificationText",items.length?"Morning point forecasts compared with completed Parknacross days.":"A comparison appears after both a forecast snapshot and a completed station day are available.");const host=$("verificationList");host.replaceChildren(...items.slice(0,5).map(item=>{const p=document.createElement("p"),strong=document.createElement("strong"),span=document.createElement("span");strong.textContent=dayLabel(item.target_day);const bits=[];if(usable(item.high_error_c))bits.push(`high error ${Number(item.high_error_c)>=0?"+":""}${n(item.high_error_c)}°C`);if(usable(item.rain_error_mm))bits.push(`rain error ${Number(item.rain_error_mm)>=0?"+":""}${n(item.rain_error_mm)} mm`);span.textContent=bits.join(" · ")||"Comparison available";p.append(strong,span);return p;}));}catch{set("verificationTitle","Verification unavailable");set("verificationText","The forecast comparison service could not be reached.");}}

  async function loadStories(){try{const data=await get("/events"),events=data.events||[],host=$("intelligenceStories");if(!events.length){host.innerHTML='<div class="empty-state">The weather diary will grow as notable events are identified.</div>';return;}host.replaceChildren(...events.slice(0,12).map(event=>{const article=document.createElement("article");article.className="weather-story-card";const time=document.createElement("time"),copy=document.createElement("div"),strong=document.createElement("strong"),p=document.createElement("p");time.textContent=event.day?dayLabel(event.day):"Recent";strong.textContent=event.title||"Weather event";p.textContent=event.detail||"";copy.append(strong,p);article.append(time,copy);return article;}));}catch{$("intelligenceStories").innerHTML='<div class="empty-state">Weather stories temporarily unavailable.</div>';}}

  async function loadMicroclimate(){try{const [current,official,climate]=await Promise.all([get("/current"),get("/met/johnstown"),get("/climate-summary")]);latestCurrent=current;const delta=usable(current.temperature_c)&&usable(official.temperature_c)?Number(current.temperature_c)-Number(official.temperature_c):null;set("microTemp",usable(delta)?`${delta>=0?"+":""}${n(delta)}°C`:"Comparison unavailable");set("microTempDetail",usable(delta)?`Parknacross ${n(current.temperature_c)}°C · Johnstown Castle ${n(official.temperature_c)}°C. Observation times may differ.`:"Recent comparable temperatures were unavailable.");const rain=climate.rain_percent_of_lta_month;set("microRain",usable(rain)?`${Math.round(Number(rain))}% of monthly average`:"Building context");set("microRainDetail",usable(climate.station_month_rain_mm)?`Parknacross ${n(climate.station_month_rain_mm)} mm so far; comparison uses Johnstown Castle's full-month 1991–2020 average.`:"Monthly rainfall context unavailable.");}catch{set("microTemp","Comparison unavailable");set("microRain","Context unavailable");}}

  async function loadSky(){const host=$("intelligenceSky"),button=$("downloadSkyCard");try{const meta=await get("/sky-photo/meta");if(!meta.available||!meta.uploaded_at)throw new Error("No photo");skyMeta=meta;const wrap=document.createElement("div");wrap.className="intelligence-sky-wrap";const image=document.createElement("img");image.src=`${API}/sky-photo?v=${encodeURIComponent(meta.uploaded_at)}`;image.alt="Sky over Parknacross";image.crossOrigin="anonymous";const overlay=document.createElement("figcaption");overlay.textContent=`${meta.caption||"Parknacross sky"} · ${latestCurrent&&usable(latestCurrent.temperature_c)?`${n(latestCurrent.temperature_c)}°C · wind ${n(latestCurrent.wind_speed_kmh)} km/h`:"live context loading"}`;wrap.append(image,overlay);host.replaceChildren(wrap);button.disabled=false;}catch{host.innerHTML='<div class="empty-state">No current sky photograph is available.</div>';}}
  async function downloadSkyCard(){const img=$("intelligenceSky")?.querySelector("img");if(!img)return;set("skyCardStatus","Creating image…");try{await img.decode();const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=630;const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,1200,630);ctx.fillStyle="rgba(5,15,24,.72)";ctx.fillRect(0,470,1200,160);ctx.fillStyle="#fff";ctx.font="700 30px system-ui";ctx.fillText("PARKNACROSS WEATHER",55,520);ctx.font="500 25px system-ui";ctx.fillText(`${skyMeta?.caption||"Today’s sky"} · ${latestCurrent&&usable(latestCurrent.temperature_c)?`${n(latestCurrent.temperature_c)}°C · wind ${n(latestCurrent.wind_speed_kmh)} km/h`:"Parknacross, Ardamine"}`,55,566);ctx.fillStyle="#9fd5e4";ctx.font="500 18px system-ui";ctx.fillText("parknacrossweather.ie",55,602);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));if(!blob)throw new Error();const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="parknacross-sky-weather.jpg";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);set("skyCardStatus","Weather-overlay image downloaded.");}catch{set("skyCardStatus","The overlay image could not be created. Browser image-security restrictions may apply.");}}

  document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());Promise.allSettled([loadCoastalTimeline(),loadStormMode(),setupArchiveQuestions(),loadVerification(),loadStories(),loadMicroclimate()]).then(loadSky);$("downloadSkyCard")?.addEventListener("click",downloadSkyCard);});
})();
