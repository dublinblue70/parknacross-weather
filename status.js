"use strict";

const API_BASE = globalThis.PARKNACROSS_API_BASE || "https://parknacross-weather.dave-s-carter.workers.dev";
const REFRESH_MS = 5 * 60 * 1000;
const $ = id => document.getElementById(id);

function setBadge(id, state, text) {
  const el = $(id);
  if (!el) return;
  el.className = `badge ${state || ""}`.trim();
  el.textContent = text;
}
function setText(id, value) { const el=$(id); if(el) el.textContent=value; }
function usableNumber(value) { return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)); }
function fmtAge(seconds) {
  if (!usableNumber(seconds)) return "--";
  const s = Math.max(0, Number(seconds));
  if (s < 60) return `${Math.round(s)} sec`;
  if (s < 3600) return `${Math.floor(s/60)} min`;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
function fmtNum(value, digits=1) {
  if (!usableNumber(value)) return "--";
  const n=Number(value); return n.toFixed(digits).replace(/\.0$/,"" );
}
function fmtIrishDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IE", {
    timeZone: "Europe/Dublin",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function fmtDurationMinutes(minutes) {
  if(!usableNumber(minutes)) return "--";
  const n=Number(minutes);
  if(n<60) return `${fmtNum(n,1)} min`;
  const total=Math.round(n), h=Math.floor(total/60), m=total%60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
async function fetchJSON(url, timeout=20000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeout);
  try {
    const r = await fetch(url, {cache:"no-store", signal:controller.signal});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data=await r.json();if(!data||typeof data!=="object"||data.error)throw new Error(data?.error||"Invalid data response");return data;
  } finally { clearTimeout(timer); }
}
async function checkSite() {
  const controller = new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  const started=performance.now();
  try {
    const r=await fetch(`/?healthcheck=${Date.now()}`,{cache:"no-store",signal:controller.signal});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const ms=Math.round(performance.now()-started);
    setBadge("siteBadge","good","OK"); setText("siteValue",`${ms} ms`); setText("siteDetail","Website responded successfully");
    return {state:"good"};
  } catch(err) {
    setBadge("siteBadge","bad","DOWN"); setText("siteValue","Unavailable"); setText("siteDetail",err.message||"Website request failed");
    return {state:"bad"};
  } finally {clearTimeout(timer);}
}

function localDay(epoch) {
  const d=new Date(Number(epoch)*1000);
  if(Number.isNaN(d.getTime())) return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

const LIMITS = {
  temperature_c:[-30,45,"Temperature"], feels_like_c:[-40,50,"Feels-like temperature"], humidity:[0,100,"Humidity"],
  dew_point_c:[-40,40,"Dew point"], wind_speed_kmh:[0,180,"Wind speed"], wind_gust_kmh:[0,220,"Wind gust"],
  wind_direction_deg:[0,360,"Wind direction"], pressure_hpa:[870,1085,"Pressure"], rain_rate_mm_h:[0,300,"Rain rate"],
  rain_daily_mm:[0,500,"Daily rainfall"], solar_w_m2:[0,1600,"Solar radiation"], uv_index:[0,20,"UV index"], battery_v:[2.0,5.0,"Battery voltage"],
  soil_moisture_pct:[0,100,"Soil moisture"], soil_temperature_c:[-40,60,"Soil temperature"], soil_ec_us_cm:[0,10000,"Soil conductivity"]
};

function analyzeRows(rows) {
  const issues=[];
  const counts={};
  for(const [field] of Object.entries(LIMITS)) counts[field]=0;

  for(const row of rows) {
    for(const [field,[lo,hi,label]] of Object.entries(LIMITS)) {
      if(row[field]===null || row[field]===undefined || row[field]==="") continue;
      const n=Number(row[field]);
      if(!Number.isFinite(n) || n<lo || n>hi) counts[field]++;
    }
    if(usableNumber(row.dew_point_c) && usableNumber(row.temperature_c) && Number(row.dew_point_c)>Number(row.temperature_c)+2) {
      counts.dew_point_c++;
    }
  }
  for(const [field,count] of Object.entries(counts)) {
    if(count>0) issues.push({state:"warn",text:`${LIMITS[field][2]}: ${count} suspicious reading${count===1?"":"s"} in the last 24 hours.`});
  }

  let jumps={temp:0,pressure:0,humidity:0,rainDrop:0};
  const sorted=[...rows].filter(r=>Number.isFinite(Number(r.epoch))).sort((a,b)=>Number(a.epoch)-Number(b.epoch));
  for(let i=1;i<sorted.length;i++) {
    const a=sorted[i-1], b=sorted[i];
    const mins=(Number(b.epoch)-Number(a.epoch))/60;
    if(!(mins>0 && mins<=15)) continue;
    if(usableNumber(a.temperature_c)&&usableNumber(b.temperature_c)&&Math.abs(Number(b.temperature_c)-Number(a.temperature_c))>8) jumps.temp++;
    if(usableNumber(a.pressure_hpa)&&usableNumber(b.pressure_hpa)&&Math.abs(Number(b.pressure_hpa)-Number(a.pressure_hpa))>8) jumps.pressure++;
    if(usableNumber(a.humidity)&&usableNumber(b.humidity)&&Math.abs(Number(b.humidity)-Number(a.humidity))>35) jumps.humidity++;
    if(localDay(a.epoch)===localDay(b.epoch) && usableNumber(a.rain_daily_mm)&&usableNumber(b.rain_daily_mm) && Number(b.rain_daily_mm)+0.2<Number(a.rain_daily_mm)) jumps.rainDrop++;
  }
  if(jumps.temp) issues.push({state:"warn",text:`Temperature: ${jumps.temp} unusually large short-term jump${jumps.temp===1?"":"s"}.`});
  if(jumps.pressure) issues.push({state:"warn",text:`Pressure: ${jumps.pressure} unusually large short-term jump${jumps.pressure===1?"":"s"}.`});
  if(jumps.humidity) issues.push({state:"warn",text:`Humidity: ${jumps.humidity} unusually large short-term jump${jumps.humidity===1?"":"s"}.`});
  if(jumps.rainDrop) issues.push({state:"warn",text:`Daily rainfall counter: ${jumps.rainDrop} unexpected decrease${jumps.rainDrop===1?"":"s"} before local midnight.`});

  if(!issues.length) issues.push({state:"good",text:`No unusual values or large short-term changes found across ${rows.length} recent readings.`});
  return issues;
}

// The Worker may reuse a saved WS90 voltage. Archive time is NOT proof of
// a new physical battery measurement; show its provenance without falsely
// telling users with new batteries that their batteries need replacing.
function describeWs90Battery(quality) {
  const voltage=quality?.battery_voltage_v;
  const archivedAt=quality?.battery_first_seen_at ?? quality?.battery_last_archived_at;
  const lastReportedAt=quality?.battery_last_reported_at;
  if(!usableNumber(voltage) || Number(voltage)<1.5 || Number(voltage)>4.0) {
    return {state:"warn",label:"UNAVAILABLE",value:"--",detail:"Battery reading unavailable. Check Ecowitt."};
  }
  const volts=Number(voltage);
  const value=`${volts.toFixed(2)} V`;
  const archivedDate=archivedAt ? new Date(archivedAt) : null;
  const validDate=archivedDate && Number.isFinite(archivedDate.getTime());
  const reportedDate=lastReportedAt ? new Date(lastReportedAt) : null;
  const reportedValid=reportedDate && Number.isFinite(reportedDate.getTime());
  const reportedAge=reportedValid ? (Date.now()-reportedDate.getTime())/1000 : null;
  if(!validDate || !reportedValid || reportedAge>30*60 || reportedAge<0) {
    return {state:"warn",label:"LAST KNOWN",value,detail:"Last known voltage. Check Ecowitt for the latest reading."};
  }
  if(volts>=3.0) {
    return {state:"good",label:"REPORTED",value,detail:"Voltage is in the normal range. Reading may be cached."};
  }
  return {state:"warn",label:"VERIFY",value,detail:"Reported voltage is below the usual range. Check the latest reading in Ecowitt."};
}

function renderIssues(issues) {
  const ul=$("qualityChecks"); if(!ul) return;
  ul.innerHTML="";
  for(const issue of issues) {
    const li=document.createElement("li"); li.className=issue.state;
    const dot=document.createElement("i"); const span=document.createElement("span"); span.textContent=issue.text;
    li.append(dot,span); ul.appendChild(li);
  }
  const worst=issues.some(x=>x.state==="bad")?"bad":issues.some(x=>x.state==="warn")?"warn":"good";
  setBadge("qualityBadge",worst,worst==="good"?"CLEAN":worst==="warn"?"REVIEW":"FAIL");
  return worst;
}

let checkResults={},checksRunning=false;
async function runChecks(only=null) {
  if(checksRunning)return;checksRunning=true;
  if(only)delete checkResults[only];else checkResults={};
  const read=async(key,fn)=>{if(only&&only!==key&&checkResults[key])return checkResults[key];const data=await fn();checkResults[key]=data;renderChecks(only);return data;};
  const button=$("refreshButton"); if(button) button.disabled=true;
  setText("overallTitle","Checking systems…"); setText("overallText","Checking the website, weather station and saved data.");
  $("overall").className="overall";

  const sitePromise=read("site",checkSite);
  const exportDay=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  try { await Promise.all([
    read("health",async()=>{const started=performance.now();const data=await fetchJSON(`${API_BASE}/health`).catch(e=>({__error:e}));return {...data,__elapsed_ms:Math.round(performance.now()-started)};}),
    read("current",()=>fetchJSON(`${API_BASE}/current`).catch(e=>({__error:e}))),
    read("quality",()=>fetchJSON(`${API_BASE}/quality`).catch(e=>({__error:e}))),
    read("history",()=>fetchJSON(`${API_BASE}/history?hours=24`).catch(e=>({__error:e}))),
    read("reliability",()=>fetchJSON(`${API_BASE}/reliability`).catch(e=>({__error:e}))),
    read("backup",()=>fetchJSON(`${API_BASE}/backup-status`).catch(e=>({__error:e}))),
    read("social",()=>fetchJSON(`${API_BASE}/social-status`).catch(e=>({__error:e}))),
    // Unique query values bypass the Worker's long marine cache TTLs so this
    // health check can detect an upstream outage instead of only checking cache.
    read("tides",()=>fetchJSON(`${API_BASE}/marine/tides?station=Arklow&healthcheck=${Date.now()}`,10000).catch(e=>({__error:e}))),
    read("m2",()=>fetchJSON(`${API_BASE}/marine/sea-temperature?healthcheck=${Date.now()}`,10000).catch(e=>({__error:e}))),
    read("landWarnings",()=>fetchJSON(`${API_BASE}/met/warnings?healthcheck=${Date.now()}`,12000).catch(e=>({__error:e}))),
    read("marineWarnings",()=>fetchJSON(`${API_BASE}/met/marine?healthcheck=${Date.now()}`,15000).catch(e=>({__error:e}))),
    sitePromise,
    read("daily",()=>fetchJSON(`${API_BASE}/daily?days=8`).catch(e=>({__error:e}))),
    read("stats",()=>fetchJSON(`${API_BASE}/stats`).catch(e=>({__error:e}))),
    read("summaryHistory",()=>fetchJSON(`${API_BASE}/history?hours=48`).catch(e=>({__error:e}))),
    read("rainEvents",()=>fetchJSON(`${API_BASE}/rain-events?days=30`).catch(e=>({__error:e}))),
    read("coverage",()=>fetchJSON(`${API_BASE}/coverage?days=371`).catch(e=>({__error:e}))),
    read("exportPreview",()=>fetchJSON(`${API_BASE}/export-preview?from=${exportDay}&to=${exportDay}`).catch(e=>({__error:e})))
  ]);
  } finally { if(button)button.disabled=false;checksRunning=false; }
}

function renderChecks(only=null) {
  const {health={},current={},quality={},history={},reliability={},backup={},social={},tides={},m2={},landWarnings={},marineWarnings={},site={},daily={},stats={},summaryHistory={},exportPreview={},rainEvents={},coverage={}}=checkResults;
  const apiElapsed=health.__elapsed_ms||0;
  let states=site.state?[site.state]:[];
  const latestEpoch=rows=>Math.max(0,...(Array.isArray(rows)?rows:[]).map(row=>usableNumber(row.epoch)?Number(row.epoch):Date.parse(row.received_at||"")/1000).filter(Number.isFinite));
  const fresh=epoch=>usableNumber(epoch)&&Number(epoch)>0&&Math.abs(Date.now()/1000-Number(epoch))<=900;
  const dayKey=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const recentDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||"")&&Math.abs(Date.parse(dayKey+"T12:00:00Z")-Date.parse(day+"T12:00:00Z"))<=86400000;
  for(const [prefix,data,valid,detail] of [
    ["dailyFeed",daily,Array.isArray(daily.days)&&daily.days.some(row=>recentDay(row.day)),"Recent daily summaries available"],
    ["recordsFeed",stats,usableNumber(stats.total_samples)&&Number(stats.total_samples)>0&&typeof stats.records==="object"&&stats.records!==null,"Archive statistics and records available"],
    ["summaryFeed",summaryHistory,Array.isArray(summaryHistory.readings)&&fresh(latestEpoch(summaryHistory.readings)),"Daily Summary observation feed is fresh"],
    ["rainEventsFeed",rainEvents,Array.isArray(rainEvents.events)&&Number.isFinite(rainEvents.event_count),"Rain-event history available"],
    ["coverageFeed",coverage,Array.isArray(coverage.days)&&coverage.days.length>0&&usableNumber(coverage.summary?.coverage_percent),"Per-day archive coverage available"],
    ["exportFeed",exportPreview,Number(exportPreview.count)>0&&Array.isArray(exportPreview.columns)&&exportPreview.columns.includes("epoch")&&fresh(exportPreview.last_epoch),"Recent export preview and field list available"]
  ]){
    if(!Object.values(checkResults).includes(data))continue;
    const ok=!data.__error&&valid;
    setBadge(prefix+"Badge",ok?"good":"warn",ok?"CHECKED":"UNAVAILABLE");
    setText(prefix+"Value",ok?"Available":"Could not verify");
    setText(prefix+"Detail",ok?detail:data.__error?"This data source could not be reached. Other sources may still work.":"The source is missing expected data or its observations are delayed.");
    if(!ok)states.push("warn");
  }
  for(const [prefix,data,valid] of [["landWarning",landWarnings,Array.isArray(landWarnings?.warnings)],["marineWarning",marineWarnings,typeof marineWarnings?.local_warning_relevant==="boolean"]]){
    if(!Object.values(checkResults).includes(data))continue;
    const ok=!data.__error&&valid;setBadge(prefix+"Badge",ok?"good":"warn",ok?"CHECKED":"UNAVAILABLE");
    setText(prefix+"Value",ok?(prefix==="landWarning"?`${window.ParknacrossWarnings.select(data.warnings).length} relevant warnings`:data.local_warning_relevant?"Relevant marine warning":"No relevant marine warning"):"Feed unavailable");
    setText(prefix+"Detail",ok?`Official feed checked ${fmtIrishDateTime(new Date().toISOString())}`:"The official warning feed could not be verified. Check Met Éireann directly.");if(!ok)states.push("warn");
  }

  if (checkResults.tides) {
    const tideEvents=Array.isArray(tides?.events)?tides.events:[];
    const validTideEvents=tideEvents.filter(event=>event&&Number.isFinite(Date.parse(event.time))&&
      (String(event.type).toLowerCase()==="high"||String(event.type).toLowerCase()==="low"));
    if(tides.__error||!validTideEvents.length){
      setBadge("tideBadge","warn","UNAVAILABLE");
      setText("tideValue","No predictions");
      setText("tideDetail",tides.__error?`Arklow prediction check failed: ${tides.__error.message||"request failed"}`:"The tide service returned no usable Arklow predictions.");
      states.push("warn");
    }else{
      const next=validTideEvents.map(event=>({event,at:Date.parse(event.time)})).filter(item=>item.at>=Date.now()).sort((a,b)=>a.at-b.at)[0];
      setBadge("tideBadge","good","LIVE");
      setText("tideValue",`${validTideEvents.length} predictions`);
      setText("tideDetail",next?`Next ${String(next.event.type).toLowerCase()} water: ${fmtIrishDateTime(next.event.time)} · Marine Institute Arklow`:`${tides.station||"Arklow"} predictions received; no later event in this window.`);
    }

  }

  if (checkResults.m2) {
    const buoy=m2?.m2_buoy;
    const m2Value=buoy?.sea_surface_temperature_c;
    const m2Time=buoy?.observation_time||buoy?.timestamp;
    const m2Age=usableNumber(buoy?.observation_age_minutes)?Number(buoy.observation_age_minutes):
      m2Time&&Number.isFinite(Date.parse(m2Time))?Math.max(0,(Date.now()-Date.parse(m2Time))/60000):null;
    if(m2.__error||m2?.m2_observation_available!==true||!usableNumber(m2Value)||m2Age===null||m2Age>12*60){
      setBadge("m2Badge","warn","UNAVAILABLE");
      setText("m2Value","No current reading");
      const reason=m2.__error?.message||m2?.errors?.m2_buoy||"No fresh M2 observation was returned";
      setText("m2Detail",`${reason}. The local model may still be available on the coast page.`);
      states.push("warn");
    }else{
      const m2State=m2Age<=180?"good":"warn";
      setBadge("m2Badge",m2State,m2State==="good"?"LIVE":"AGING");
      setText("m2Value",`${fmtNum(m2Value,1)} °C`);
      setText("m2Detail",`M2 buoy observation ${fmtAge(m2Age*60)} old${m2Time?` · ${fmtIrishDateTime(m2Time)}`:""} · about 110 km offshore`);
      if(m2State==="warn")states.push("warn");
    }

  }

  if (checkResults.health) {
    if(health.__error) {
      setBadge("apiBadge","bad","DOWN"); setText("apiValue","Unavailable"); setText("apiDetail","Weather data service could not be reached"); states.push("bad");
      setBadge("ingestBadge","bad","UNKNOWN"); setText("ingestValue","Unavailable"); setText("ingestDetail","Archive collection status could not be reached.");
    } else {
      const db=health.database==="connected"; const ok=db&&["ok","warning"].includes(health.status);
      const slow=ok&&apiElapsed>=8000;
      setBadge("apiBadge",ok?(slow?"warn":"good"):"warn",ok?(slow?"SLOW":"OK"):"CHECK"); setText("apiValue",db?"Connected":"Check"); setText("apiDetail",db?(slow?`Weather data service responded slowly (${(apiElapsed/1000).toFixed(1)} sec)`:"Weather data service connected"):"Weather data service needs checking"); states.push(ok?(slow?"warn":"good"):"warn");

      const ingest=health.archive_ingest;
      const age=usableNumber(ingest?.latest_age_seconds)?Number(ingest.latest_age_seconds):null;
      const ingestState=age===null?"warn":age<=600?"good":age<=1800?"warn":"bad";
      setBadge("ingestBadge",ingestState,age===null?"CHECK":ingestState==="good"?"CURRENT":ingestState==="warn"?"DELAYED":"STALE");
      setText("ingestValue",age===null?"No timestamp":fmtAge(age));
      const direct=ingest?.gateway_direct?.last_success_at?`Direct gateway: ${fmtIrishDateTime(ingest.gateway_direct.last_success_at)}`:"direct gateway awaiting first save";
      const scheduled=ingest?.scheduled?.last_success_at?`scheduled sync: ${fmtIrishDateTime(ingest.scheduled.last_success_at)}`:"scheduled sync awaiting first success";
      const recovery=ingest?.gateway_recovery?.last_success_at?`recovery sync: ${fmtIrishDateTime(ingest.gateway_recovery.last_success_at)}`:"recovery sync ready";
      const error=ingest?.gateway_direct?.last_error||ingest?.scheduled?.last_error||ingest?.gateway_recovery?.last_error;
      setText("ingestDetail",`${direct} · ${scheduled} · ${recovery}${error?` · latest error: ${error}`:""}`);
      states.push(ingestState);
    }

  }

  if (checkResults.current) {
    if(current.__error) {
      setBadge("feedBadge","bad","FAIL"); setText("feedValue","No reading"); setText("feedDetail","Current weather reading could not be reached"); states.push("bad");
      setBadge("soilBadge","warn","CHECK"); setText("soilValue","Unavailable"); setText("soilDetail","The latest soil-sensor reading could not be checked.");
    } else {
      const age=usableNumber(current.epoch)?Math.max(0,Math.floor(Date.now()/1000)-Number(current.epoch)):null;
      const state=age===null?"warn":age<600?"good":age<1800?"warn":"bad";
      setBadge("feedBadge",state,age===null?"CHECK":state==="good"?"LIVE":state==="warn"?"DELAY":"STALE"); setText("feedValue",fmtAge(age)); setText("feedDetail",current.received_at?`Latest reading: ${fmtIrishDateTime(current.received_at)} Irish time`:"Latest weather reading time unavailable"); states.push(state);
      const hasSoil=usableNumber(current.soil_moisture_pct)||usableNumber(current.soil_temperature_c)||usableNumber(current.soil_ec_us_cm);
      if(hasSoil){
        const soilState=age!==null&&age<600?"good":"warn";
        setBadge("soilBadge",soilState,soilState==="good"?"LIVE":"CHECK");
        setText("soilValue",usableNumber(current.soil_moisture_pct)?`${fmtNum(current.soil_moisture_pct,1)}% moisture`:"Sensor detected");
        const details=[];if(usableNumber(current.soil_temperature_c))details.push(`${fmtNum(current.soil_temperature_c,1)}°C soil`);if(usableNumber(current.soil_ec_us_cm))details.push(`${Math.round(Number(current.soil_ec_us_cm)).toLocaleString("en-IE")} µS/cm`);if(usableNumber(current.soil_channel))details.push(`channel ${Number(current.soil_channel)}`);
        setText("soilDetail",`${details.join(" · ")}. Reading represents the probe location only.`);states.push(soilState);
      }else{
        setBadge("soilBadge","warn","WAITING");setText("soilValue","No current value");setText("soilDetail","No soil-sensor fields were present in the latest gateway observation.");states.push("warn");
      }
    }

  }

  if (checkResults.quality) {
    if(quality.__error) {
      setBadge("samplesBadge","warn","CHECK"); setText("samplesValue","--"); setText("samplesDetail","Weather quality check unavailable");
      setBadge("gapBadge","warn","CHECK"); setText("gapValue","--"); setText("gapDetail","Weather quality check unavailable");
      setBadge("batteryBadge","warn","UNAVAILABLE"); setText("batteryValue","--"); setText("batteryDetail","Battery reading could not be checked. This does not mean the batteries are low.");
      setBadge("gustQualityBadge","warn","CHECK"); setText("gustQualityValue","--"); setText("gustQualityDetail","Weather quality check unavailable"); states.push("warn");
    } else {
      const samples=usableNumber(quality.samples_last_24h)?Number(quality.samples_last_24h):null; const sampleState=samples===null?"warn":samples>=100?"good":samples>=24?"warn":"bad";
      setBadge("samplesBadge",sampleState,samples===null?"CHECK":sampleState==="good"?"OK":sampleState==="warn"?"LOW":"POOR"); setText("samplesValue",samples===null?"--":samples.toLocaleString("en-IE")); setText("samplesDetail",usableNumber(quality.median_interval_minutes)?`Typical time between saved readings: ${fmtNum(quality.median_interval_minutes,1)} min`:"Typical save interval unavailable"); states.push(sampleState);
      const gap=usableNumber(quality.largest_recent_gap_minutes)?Number(quality.largest_recent_gap_minutes):null;
      const gapState=gap===null?"warn":gap<=15?"good":"warn";
      const gapLabel=gap===null?"CHECK":gap<=15?"OK":gap<=60?"GAP":"LARGE";
      setBadge("gapBadge",gapState,gapLabel);
      setText("gapValue",fmtDurationMinutes(gap));
      setText("gapDetail",`Largest gap between saved readings · station feed: ${quality.feed_status||"unknown"}`);
      states.push(gapState);
      const battery=describeWs90Battery(quality);
      setBadge("batteryBadge",battery.state,battery.label);
      setText("batteryValue",battery.value);
      setText("batteryDetail",battery.detail);
      states.push(battery.state);

      const gust24=usableNumber(quality.gust_spikes_excluded_24h)?Number(quality.gust_spikes_excluded_24h):null;
      const gustTotal=usableNumber(quality.gust_spikes_excluded_total)?Number(quality.gust_spikes_excluded_total):null;
      if(gust24===null||gustTotal===null){
        setBadge("gustQualityBadge","warn","CHECK");
        setText("gustQualityValue","Unavailable");
        setText("gustQualityDetail","Wind-reading quality counters could not be retrieved");
        states.push("warn");
      }else{
        setBadge("gustQualityBadge",gust24>0?"warn":"good",gust24>0?"REVIEW":gustTotal>0?"RECORDED":"OK");
        setText("gustQualityValue",gustTotal===0?"No anomalies":gust24>0?`${gust24} recent · ${gustTotal} total`:`${gustTotal} historical`);
        const lastGust=usableNumber(quality.last_gust_exclusion_epoch)
          ? new Date(Number(quality.last_gust_exclusion_epoch)*1000).toLocaleString("en-IE",{dateStyle:"medium",timeStyle:"short"})
          : null;
        setText("gustQualityDetail",gustTotal>0
          ? `${gustTotal} unusual wind reading${gustTotal===1?"":"s"} retained in the raw archive and excluded from derived peak-gust statistics${lastGust?` · last ${lastGust}`:""}`
          : "No unusual wind readings found");
        if(gust24>0)states.push("warn");
      }
    }

  }

  if (checkResults.reliability) {
    if(reliability.__error || !usableNumber(reliability.archive_reliability_percent)) {
      setBadge("reliabilityBadge","warn","CHECK");setText("reliabilityValue","--");setText("reliabilityDetail","Archive reliability check unavailable");states.push("warn");
    } else {
      const pct=Number(reliability.archive_reliability_percent);
      const state=pct>=97?"good":"warn";
      setBadge("reliabilityBadge",state,state==="good"?"COMPLETE":"PARTIAL");
      setText("reliabilityValue",`${pct.toFixed(1)}%`);
      const currentFeedLive=!current.__error&&usableNumber(current.epoch)&&(Date.now()/1000-Number(current.epoch))<600;
      const monthLabel=new Intl.DateTimeFormat("en-IE",{timeZone:"Europe/Dublin",month:"long",year:"numeric"}).format(new Date());
      setText("reliabilityDetail",`${monthLabel} coverage · ${reliability.actual_samples?.toLocaleString?.("en-IE")||reliability.actual_samples} of ${reliability.expected_samples?.toLocaleString?.("en-IE")||reliability.expected_samples} expected five-minute slots saved${currentFeedLive?" · station feed currently live":""}. Overall archive completeness is shown on the History page.`);
    }

  }

  if (checkResults.backup) {
    if(backup.__error) {
      setBadge("backupBadge","warn","CHECK");setText("backupValue","Unavailable");setText("backupDetail","Backup status unavailable");states.push("warn");
    } else if(!backup.configured) {
      setBadge("backupBadge","warn","NOT SET");
      setText("backupValue","Not configured");
      setText("backupDetail","Automatic archive backup has no configured destination. Configure Cloudflare R2 or an external backup endpoint.");
      states.push("warn");
    } else {
      const backedUpAt = backup.last_success ? Date.parse(backup.last_success) : NaN;
      const hoursSinceBackup = Number.isFinite(backedUpAt) ? (Date.now()-backedUpAt)/3600000 : Infinity;
      const recentBackup = hoursSinceBackup >= -0.25 && hoursSinceBackup <= 48;
      setBadge("backupBadge",recentBackup?"good":"warn",recentBackup?"ACTIVE":"CHECK");
      setText("backupValue",recentBackup?"Automatic":"Backup needs checking");
      setText("backupDetail",recentBackup
        ? `Last successful backup: ${backup.last_backup_day||"--"}`
        : backup.last_success
          ? `Last successful backup is over 48 hours old or has an invalid timestamp · ${backup.last_backup_day||"date unavailable"}`
          : "Waiting for a confirmed successful backup");
      if(!recentBackup) states.push("warn");
    }

  }

  if (checkResults.social) {
    // The public API exposes *verified* delivery-day markers, not scheduled
    // intent or post creation. This does not independently inspect Facebook/X.
    const clockParts = new Intl.DateTimeFormat("en-GB", {
      timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(new Date());
    const clock = Object.fromEntries(clockParts.map(part=>[part.type,part.value]));
    const localToday = `${clock.year}-${clock.month}-${clock.day}`;
    const localMinutes = Number(clock.hour)*60+Number(clock.minute);
    const shouldHavePosted = localMinutes >= 12*60;
    const socialNetworks = [
      ["facebook","Facebook"], ["x","X"]
    ];
    for (const [key,name] of socialNetworks) {
      if (social.__error) {
        setBadge(`${key}Badge`,"warn","CHECK");
        setText(`${key}Value`,"Unavailable");
        setText(`${key}Detail`,"Posting status could not be checked. Check the platform directly.");
        states.push("warn");
        continue;
      }
      const verified = social[`${key}_verified_day`];
      const attention = social[`${key}_status`] === "attention";
      const deliveredToday = verified === localToday;
      const severity = deliveredToday ? "good" : shouldHavePosted || attention ? "warn" : "good";
      setBadge(`${key}Badge`, severity, deliveredToday ? "SENT" : shouldHavePosted || attention ? "CHECK" : "PENDING");
      setText(`${key}Value`, deliveredToday ? "Today's post sent" : verified ? `Last sent: ${verified}` : "Not confirmed");
      setText(`${key}Detail`, deliveredToday
        ? "Worker reports verified delivery today. Confirm the visible post on the platform."
        : shouldHavePosted || attention
          ? "Today's post is not confirmed. Check Buffer and the platform."
          : "Today's posting window has not finished; check again after 12:00.");
      if (severity === "warn") states.push("warn");
    }

  }

  if (checkResults.history) {
    if(history.__error || !Array.isArray(history.readings)) {
      renderIssues([{state:"warn",text:"Recent readings could not be checked. Existing live weather data is unchanged."}]); states.push("warn");
    } else {
      const qState=renderIssues(analyzeRows(history.readings)); states.push(qState);
    }

  }

  const overall=states.includes("bad")?"bad":states.includes("warn")?"warn":"good";
  const latestAge=usableNumber(current?.epoch)?Math.max(0,Math.floor(Date.now()/1000)-Number(current.epoch)):null;
  const coreFailure=site.state==="bad"||Boolean(health.__error)||Boolean(current.__error)||health?.status!=="ok"||health?.database!=="connected"||(latestAge!==null&&latestAge>=1800);
  $("overall").className=`overall ${overall}`;
  setText("overallTitle",overall==="good"?"All monitored systems look healthy":overall==="warn"?"Site is running, but something is worth checking":coreFailure?"A monitored service needs attention":"Historical archive is incomplete");
  setText("overallText",overall==="good"?"Website, weather data service, live readings and recent data checks passed.":overall==="warn"?"One or more checks produced a warning. Review the cards below.":coreFailure?"At least one core service failed or the latest weather reading is stale.":"The website, weather data service and latest observation are operating normally. Some earlier five-minute archive intervals are missing; this does not indicate a current station outage.");
  setText("lastRun",`${only?"Selected source rechecked; other cards retain their previous results · ":"Last checked "}${new Date().toLocaleString("en-IE",{dateStyle:"medium",timeStyle:"short"})}`);
  const pending=16-Object.keys(checkResults).length;
  if(pending>0){
    setText("overallTitle",states.includes("bad")?"A monitored service needs attention":"Checking remaining sources…");
    setText("overallText",`${Object.keys(checkResults).length} of 16 checks complete. Finished results are shown below; ${pending} source${pending===1?" is":"s are"} still being checked.`);
    if(!states.includes("bad"))$("overall").className="overall";
    setText("lastRun","Checks in progress · results appear as each source responds");
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  $("refreshButton")?.addEventListener("click",()=>runChecks());

  runChecks();
  (window.ParknacrossRefresh?.every || setInterval)(runChecks,REFRESH_MS);
});

