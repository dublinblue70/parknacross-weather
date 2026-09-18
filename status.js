"use strict";

const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
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
function fmtDurationMinutes(minutes) {
  if(!usableNumber(minutes)) return "--";
  const n=Number(minutes);
  if(n<60) return `${fmtNum(n,1)} min`;
  const total=Math.round(n), h=Math.floor(total/60), m=total%60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
async function fetchJSON(url, timeout=12000) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeout);
  try {
    const r = await fetch(url, {cache:"no-store", signal:controller.signal});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
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
  rain_daily_mm:[0,500,"Daily rainfall"], solar_w_m2:[0,1600,"Solar radiation"], uv_index:[0,20,"UV index"], battery_v:[2.0,5.0,"Battery voltage"]
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
    if(Number.isFinite(Number(row.dew_point_c)) && Number.isFinite(Number(row.temperature_c)) && Number(row.dew_point_c)>Number(row.temperature_c)+2) {
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
    if(Number.isFinite(Number(a.temperature_c))&&Number.isFinite(Number(b.temperature_c))&&Math.abs(Number(b.temperature_c)-Number(a.temperature_c))>8) jumps.temp++;
    if(Number.isFinite(Number(a.pressure_hpa))&&Number.isFinite(Number(b.pressure_hpa))&&Math.abs(Number(b.pressure_hpa)-Number(a.pressure_hpa))>8) jumps.pressure++;
    if(Number.isFinite(Number(a.humidity))&&Number.isFinite(Number(b.humidity))&&Math.abs(Number(b.humidity)-Number(a.humidity))>35) jumps.humidity++;
    if(localDay(a.epoch)===localDay(b.epoch) && Number.isFinite(Number(a.rain_daily_mm))&&Number.isFinite(Number(b.rain_daily_mm)) && Number(b.rain_daily_mm)+0.2<Number(a.rain_daily_mm)) jumps.rainDrop++;
  }
  if(jumps.temp) issues.push({state:"warn",text:`Temperature: ${jumps.temp} unusually large short-term jump${jumps.temp===1?"":"s"}.`});
  if(jumps.pressure) issues.push({state:"warn",text:`Pressure: ${jumps.pressure} unusually large short-term jump${jumps.pressure===1?"":"s"}.`});
  if(jumps.humidity) issues.push({state:"warn",text:`Humidity: ${jumps.humidity} unusually large short-term jump${jumps.humidity===1?"":"s"}.`});
  if(jumps.rainDrop) issues.push({state:"warn",text:`Daily rainfall counter: ${jumps.rainDrop} unexpected decrease${jumps.rainDrop===1?"":"s"} before local midnight.`});

  if(!issues.length) issues.push({state:"good",text:`No unusual values or large short-term changes found across ${rows.length} recent readings.`});
  return issues;
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

async function runChecks() {
  const button=$("refreshButton"); if(button) button.disabled=true;
  setText("overallTitle","Checking systems…"); setText("overallText","Checking the website, weather station and saved data.");
  $("overall").className="overall";

  const sitePromise=checkSite();
  const [health,current,quality,history,reliability,backup,site] = await Promise.all([
    fetchJSON(`${API_BASE}/health`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/current`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/quality`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/history?hours=24`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/reliability`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/backup-status`).catch(e=>({__error:e})),
    sitePromise
  ]);

  let states=[site.state];

  if(health.__error) {
    setBadge("apiBadge","bad","DOWN"); setText("apiValue","Unavailable"); setText("apiDetail","Weather data service could not be reached"); states.push("bad");
  } else {
    const db=health.database==="connected"; const ok=health.status==="ok"&&db;
    setBadge("apiBadge",ok?"good":"warn",ok?"OK":"CHECK"); setText("apiValue",db?"Connected":"Check"); setText("apiDetail",db?"Weather data service connected":"Weather data service needs checking"); states.push(ok?"good":"warn");
  }

  if(current.__error) {
    setBadge("feedBadge","bad","FAIL"); setText("feedValue","No reading"); setText("feedDetail","Current weather reading could not be reached"); states.push("bad");
  } else {
    const age=usableNumber(current.epoch)?Math.max(0,Math.floor(Date.now()/1000)-Number(current.epoch)):null;
    const state=age===null?"warn":age<600?"good":age<1800?"warn":"bad";
    setBadge("feedBadge",state,age===null?"CHECK":state==="good"?"LIVE":state==="warn"?"DELAY":"STALE"); setText("feedValue",fmtAge(age)); setText("feedDetail",current.received_at?`Latest weather reading · ${current.received_at}`:"Latest weather reading time unavailable"); states.push(state);
  }

  if(quality.__error) {
    setBadge("samplesBadge","warn","CHECK"); setText("samplesValue","--"); setText("samplesDetail","Weather quality check unavailable");
    setBadge("gapBadge","warn","CHECK"); setText("gapValue","--"); setText("gapDetail","Weather quality check unavailable");
    setBadge("batteryBadge","warn","CHECK"); setText("batteryValue","--"); setText("batteryDetail","Weather quality check unavailable");
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
    const batt=String(quality.battery_status||"--"); const battState=/^Normal/i.test(batt)?"good":/^Check/i.test(batt)?"warn":/^Low/i.test(batt)?"bad":"warn";
    setBadge("batteryBadge",battState,battState==="good"?"OK":battState==="warn"?"CHECK":"LOW"); setText("batteryValue",batt.replace(/^\w+\s*·\s*/,"")||"--"); setText("batteryDetail",batt); states.push(battState);

    const gust24=usableNumber(quality.gust_spikes_excluded_24h)?Number(quality.gust_spikes_excluded_24h):0;
    const gustTotal=usableNumber(quality.gust_spikes_excluded_total)?Number(quality.gust_spikes_excluded_total):0;
    setBadge("gustQualityBadge","good",gustTotal>0?"CHECKED":"OK");
    setText("gustQualityValue",gust24===0?"None":`${gust24} unusual today`);
    const lastGust=usableNumber(quality.last_gust_exclusion_epoch)
      ? new Date(Number(quality.last_gust_exclusion_epoch)*1000).toLocaleString("en-IE",{dateStyle:"medium",timeStyle:"short"})
      : null;
    setText("gustQualityDetail",gustTotal>0
      ? `${gustTotal} unusual wind reading${gustTotal===1?"":"s"} identified${lastGust?` · last ${lastGust}`:""}`
      : "No unusual wind readings found");
  }

  if(reliability.__error || !usableNumber(reliability.archive_reliability_percent)) {
    setBadge("reliabilityBadge","warn","CHECK");setText("reliabilityValue","--");setText("reliabilityDetail","Archive reliability check unavailable");states.push("warn");
  } else {
    const pct=Number(reliability.archive_reliability_percent);
    const state=pct>=99?"good":pct>=97?"good":pct>=90?"warn":"bad";
    setBadge("reliabilityBadge",state,state==="good"?"GOOD":state==="warn"?"REVIEW":"LOW");
    setText("reliabilityValue",`${pct.toFixed(1)}%`);
    setText("reliabilityDetail",`${reliability.label||""}${reliability.label?" · ":""}${reliability.actual_samples?.toLocaleString?.("en-IE")||reliability.actual_samples} of ${reliability.expected_samples?.toLocaleString?.("en-IE")||reliability.expected_samples} expected 5-minute readings saved this month`);
    states.push(state);
  }

  if(backup.__error) {
    setBadge("backupBadge","warn","CHECK");setText("backupValue","Unavailable");setText("backupDetail","Backup status unavailable");states.push("warn");
  } else if(!backup.configured) {
    setBadge("backupBadge","warn","READY");setText("backupValue","Not active yet");setText("backupDetail","Daily archive backup is ready to be connected.");
  } else {
    const ok=Boolean(backup.last_success);
    setBadge("backupBadge",ok?"good":"warn",ok?"ACTIVE":"READY");
    setText("backupValue",ok?"Automatic":"Configured");
    setText("backupDetail",ok?`Last daily backup: ${backup.last_backup_day||"--"}`:"Waiting for the next scheduled backup");
    if(!ok) states.push("warn");
  }

  if(history.__error || !Array.isArray(history.readings)) {
    renderIssues([{state:"warn",text:"Recent readings could not be checked. Existing live weather data is unchanged."}]); states.push("warn");
  } else {
    const qState=renderIssues(analyzeRows(history.readings)); states.push(qState);
  }

  const overall=states.includes("bad")?"bad":states.includes("warn")?"warn":"good";
  $("overall").className=`overall ${overall}`;
  setText("overallTitle",overall==="good"?"All monitored systems look healthy":overall==="warn"?"Site is running, but something is worth checking":"A monitored service needs attention");
  setText("overallText",overall==="good"?"Website, weather data service, live readings and recent data checks passed.":overall==="warn"?"One or more checks produced a warning. Review the cards below.":"At least one check failed or the latest weather reading is stale.");
  setText("lastRun",`Last checked ${new Date().toLocaleString("en-IE",{dateStyle:"medium",timeStyle:"short"})}`);
  if(button) button.disabled=false;
}

document.addEventListener("DOMContentLoaded",()=>{
  $("refreshButton")?.addEventListener("click",runChecks);
  runChecks();
  setInterval(runChecks,REFRESH_MS);
});
