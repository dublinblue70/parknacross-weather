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
  // First-seen time comes from dedicated provenance, never from the latest
  // weather observation. A successful cloud check is NOT a battery reading time.
  const archivedAt=quality?.battery_first_seen_at ?? quality?.battery_last_archived_at;
  const age=quality?.battery_archive_age_seconds;
  const cloudCheckedAt=quality?.battery_last_checked_at;
  const lastReportedAt=quality?.battery_last_reported_at;
  if(!usableNumber(voltage) || Number(voltage)<1.5 || Number(voltage)>4.0) {
    return {state:"warn",label:"UNAVAILABLE",value:"--",detail:"No reliable WS90 AA battery voltage is available. Check the Battery reading in Ecowitt; do not confuse it with the solar capacitor."};
  }
  const volts=Number(voltage);
  const value=`${volts.toFixed(2)} V`;
  const ageValid=usableNumber(age) && Number(age)>=0;
  const archivedDate=archivedAt ? new Date(archivedAt) : null;
  const validDate=archivedDate && Number.isFinite(archivedDate.getTime());
  const timeText=validDate ? archivedDate.toLocaleString("en-IE",{timeZone:"Europe/Dublin",dateStyle:"medium",timeStyle:"short"}) : "time unavailable";
  const archiveText=`Voltage first seen: ${timeText}${ageValid ? ` (${fmtAge(age)} ago)` : ""}.`;
  const checkedDate=cloudCheckedAt ? new Date(cloudCheckedAt) : null;
  const checkTimeText=checkedDate && Number.isFinite(checkedDate.getTime())
    ? ` Last cloud battery check: ${checkedDate.toLocaleString("en-IE",{timeZone:"Europe/Dublin",dateStyle:"medium",timeStyle:"short"})}.` : "";
  const reportedDate=lastReportedAt ? new Date(lastReportedAt) : null;
  const reportedValid=reportedDate && Number.isFinite(reportedDate.getTime());
  const reportedAge=reportedValid ? (Date.now()-reportedDate.getTime())/1000 : null;
  const reportedText=reportedValid ? ` Battery voltage last returned by Ecowitt: ${reportedDate.toLocaleString("en-IE",{timeZone:"Europe/Dublin",dateStyle:"medium",timeStyle:"short"})}.` : "";
  const caution=`${checkTimeText}${reportedText} Ecowitt may cache the voltage; none of these times proves when the batteries were measured.`;
  if(!validDate || !reportedValid || reportedAge>30*60 || reportedAge<0) {
    return {state:"warn",label:"LAST KNOWN",value,detail:`${archiveText} ${caution} Confirm the present reading in Ecowitt before assessing newly fitted batteries.`};
  }
  if(volts>=3.0) {
    return {state:"good",label:"REPORTED",value,detail:`${archiveText} This voltage is in the site's normal range. ${caution}`};
  }
  return {state:"warn",label:"VERIFY",value,detail:`${archiveText} This recorded voltage is below the site's usual range, but may pre-date a battery change. ${caution} Compare with Ecowitt's current WS90 AA battery reading.`};
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
  const apiStarted=performance.now();
  const [health,current,quality,history,reliability,backup,social,site] = await Promise.all([
    fetchJSON(`${API_BASE}/health`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/current`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/quality`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/history?hours=24`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/reliability`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/backup-status`).catch(e=>({__error:e})),
    fetchJSON(`${API_BASE}/social-status`).catch(e=>({__error:e})),
    sitePromise
  ]);

  const apiElapsed=Math.round(performance.now()-apiStarted);
  let states=[site.state];

  if(health.__error) {
    setBadge("apiBadge","bad","DOWN"); setText("apiValue","Unavailable"); setText("apiDetail","Weather data service could not be reached"); states.push("bad");
  } else {
    const db=health.database==="connected"; const ok=health.status==="ok"&&db;
    const slow=ok&&apiElapsed>=8000;
    setBadge("apiBadge",ok?(slow?"warn":"good"):"warn",ok?(slow?"SLOW":"OK"):"CHECK"); setText("apiValue",db?"Connected":"Check"); setText("apiDetail",db?(slow?`Weather data checks completed slowly (${(apiElapsed/1000).toFixed(1)} sec)`:"Weather data service connected"):"Weather data service needs checking"); states.push(ok?(slow?"warn":"good"):"warn");
  }

  if(current.__error) {
    setBadge("feedBadge","bad","FAIL"); setText("feedValue","No reading"); setText("feedDetail","Current weather reading could not be reached"); states.push("bad");
  } else {
    const age=usableNumber(current.epoch)?Math.max(0,Math.floor(Date.now()/1000)-Number(current.epoch)):null;
    const state=age===null?"warn":age<600?"good":age<1800?"warn":"bad";
    setBadge("feedBadge",state,age===null?"CHECK":state==="good"?"LIVE":state==="warn"?"DELAY":"STALE"); setText("feedValue",fmtAge(age)); setText("feedDetail",current.received_at?`Latest reading: ${fmtIrishDateTime(current.received_at)} Irish time`:"Latest weather reading time unavailable"); states.push(state);
  }

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

    const gust24=usableNumber(quality.gust_spikes_excluded_24h)?Number(quality.gust_spikes_excluded_24h):0;
    const gustTotal=usableNumber(quality.gust_spikes_excluded_total)?Number(quality.gust_spikes_excluded_total):0;
    setBadge("gustQualityBadge","good",gustTotal>0?"CHECKED":"OK");
    setText("gustQualityValue",gustTotal===0?"No anomalies":`${gustTotal} flagged${gust24>0?` · ${gust24} today`:""}`);
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
    const state=pct>=97?"good":"warn";
    setBadge("reliabilityBadge",state,state==="good"?"COMPLETE":"PARTIAL");
    setText("reliabilityValue",`${pct.toFixed(1)}%`);
    const currentFeedLive=!current.__error&&usableNumber(current.epoch)&&(Date.now()/1000-Number(current.epoch))<600;
    setText("reliabilityDetail",`Historical archive completeness · ${currentFeedLive?"current station feed is live · ":""}${reliability.actual_samples?.toLocaleString?.("en-IE")||reliability.actual_samples} of ${reliability.expected_samples?.toLocaleString?.("en-IE")||reliability.expected_samples} expected five-minute slots saved`);
    states.push(state);
  }

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

  if(history.__error || !Array.isArray(history.readings)) {
    renderIssues([{state:"warn",text:"Recent readings could not be checked. Existing live weather data is unchanged."}]); states.push("warn");
  } else {
    const qState=renderIssues(analyzeRows(history.readings)); states.push(qState);
  }

  const overall=states.includes("bad")?"bad":states.includes("warn")?"warn":"good";
  const latestAge=usableNumber(current?.epoch)?Math.max(0,Math.floor(Date.now()/1000)-Number(current.epoch)):null;
  const coreFailure=site.state==="bad"||Boolean(health.__error)||Boolean(current.__error)||health?.status!=="ok"||health?.database!=="connected"||(latestAge!==null&&latestAge>=1800);
  $("overall").className=`overall ${overall}`;
  setText("overallTitle",overall==="good"?"All monitored systems look healthy":overall==="warn"?"Site is running, but something is worth checking":coreFailure?"A monitored service needs attention":"Historical archive is incomplete");
  setText("overallText",overall==="good"?"Website, weather data service, live readings and recent data checks passed.":overall==="warn"?"One or more checks produced a warning. Review the cards below.":coreFailure?"At least one core service failed or the latest weather reading is stale.":"The website, weather data service and latest observation are operating normally. Some earlier five-minute archive intervals are missing; this does not indicate a current station outage.");
  setText("lastRun",`Last checked ${new Date().toLocaleString("en-IE",{dateStyle:"medium",timeStyle:"short"})}`);
  if(button) button.disabled=false;
}

document.addEventListener("DOMContentLoaded",()=>{
  $("refreshButton")?.addEventListener("click",runChecks);
  runChecks();
  setInterval(runChecks,REFRESH_MS);
});
