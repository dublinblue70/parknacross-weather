"use strict";
const API=(globalThis.PARKNACROSS_API_BASE||"https://parknacross-weather.dave-s-carter.workers.dev")+"/export.csv";
const SENSOR_EXPORT_FIELDS=["soil_channel","soil_moisture_pct","soil_temperature_c","soil_ec_us_cm","lightning_distance_km","lightning_strikes","lightning_last_strike_time_ireland"];
const $=id=>document.getElementById(id);
function safeDate(){return new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"});}
function status(text,state=""){const el=$("downloadStatus");if(!el)return;el.textContent=text;el.className=`status ${state}`.trim();}
function archiveDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",year:"numeric"});}
function dateKey(value){return new Date(value).toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"});}
function shiftDay(day,amount){const [year,month,date]=day.split("-").map(Number);return new Date(Date.UTC(year,month-1,date+amount,12)).toISOString().slice(0,10);}
function validDateKey(value){const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return false;return new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),12)).toISOString().slice(0,10)===value;}
function csvStats(csv){
  const headers=csv.split(/\r?\n/,1)[0].split(",").map(value=>value.trim().replace(/^"|"$/g,""));
  const missing=SENSOR_EXPORT_FIELDS.filter(field=>!headers.includes(field));
  if(missing.length)throw new Error(`Export is missing sensor fields: ${missing.join(", ")}`);
  const rows=csv.trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
  const indices=Object.fromEntries(headers.map((field,index)=>[field,index]));
  const hasValue=(row,field)=>String(row[indices[field]]??"").trim()!=="";
  return{soilRows:rows.filter(row=>hasValue(row,"soil_moisture_pct")||hasValue(row,"soil_temperature_c")||hasValue(row,"soil_ec_us_cm")).length,
    lightningRows:rows.filter(row=>Number(row[indices.lightning_strikes]||0)>0||hasValue(row,"lightning_distance_km")||hasValue(row,"lightning_last_strike_time_ireland")).length};
}
async function downloadUrl(url,label,button,description){
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent="Preparing…";}
  status(`Preparing ${description}…`);
  try{
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok){let detail="";try{detail=(await response.json()).error||"";}catch{}throw new Error(detail||`HTTP ${response.status}`);}
    const csv=await response.text();if(!csv.trim())throw new Error("The export was empty");
    const{soilRows,lightningRows}=csvStats(csv),blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),objectUrl=URL.createObjectURL(blob);
    const anchor=document.createElement("a");anchor.href=objectUrl;anchor.download=`parknacross-weather-${label}-${safeDate()}.csv`;document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
    status(`CSV ready: ${description} · ${soilRows.toLocaleString("en-IE")} soil rows · ${lightningRows.toLocaleString("en-IE")} lightning rows.`,"good");
  }catch(error){console.warn("Weather archive download:",error);status(error.message==="Date range exceeds 365 days"?"Choose a range of 365 days or fewer.":error.message==="Date range is outside available archive coverage"?"Choose dates within the available archive coverage.":"Download failed. Please check the dates and try again.","bad");}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
function download(days,label,button){const n=Math.max(1,Math.min(365,Math.floor(Number(days)||1)));return downloadUrl(`${API}?days=${encodeURIComponent(n)}&fresh=1`,label,button,`${n}-day download`);}
function downloadCustom(button){
  const from=$("exportFrom")?.value,to=$("exportTo")?.value,today=safeDate();
  if(!validDateKey(from)||!validDateKey(to)){status("Choose a valid start and end date.","bad");return;}
  if(from>to){status("The start date must be on or before the end date.","bad");return;}
  if(to>today){status("Choose an end date no later than today in Ireland.","bad");return;}
  const days=Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000)+1;
  if(days>365){status("Choose a range of 365 days or fewer.","bad");return;}
  const archiveStart=$("exportFrom")?.min;
  if(archiveStart&&from<archiveStart){status("Choose dates within the available archive coverage.","bad");return;}
  return downloadUrl(`${API}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&fresh=1`,`${from}-to-${to}`,button,`${from} to ${to}`);
}
let rangeEdited=false;
function setRangeDefaults(firstKey){
  const from=$("exportFrom"),to=$("exportTo");if(!from||!to)return;
  const today=safeDate();from.min=firstKey||"";from.max=today;to.min=firstKey||"";to.max=today;
  if(!rangeEdited){to.value=today;const proposed=shiftDay(today,-6);from.value=firstKey&&proposed<firstKey?firstKey:proposed;}
}
async function loadArchiveCoverage(){
  const el=$("archiveCoverage");if(!el)return;
  try{
    const [statsResponse,currentResponse]=await Promise.all([fetch("https://parknacross-weather.dave-s-carter.workers.dev/stats",{cache:"no-store"}),fetch("https://parknacross-weather.dave-s-carter.workers.dev/current",{cache:"no-store"})]);
    if(!statsResponse.ok||!currentResponse.ok)throw new Error("Coverage unavailable");
    const stats=await statsResponse.json(),current=await currentResponse.json(),first=stats.first_epoch!==null&&stats.first_epoch!==undefined&&stats.first_epoch!==""?Number(stats.first_epoch):NaN,last=current.epoch!==null&&current.epoch!==undefined&&current.epoch!==""?Number(current.epoch):NaN,fromKey=Number.isFinite(first)?dateKey(first*1000):null,toKey=Number.isFinite(last)?dateKey(last*1000):safeDate();
    const from=fromKey?archiveDate(first*1000):null,to=Number.isFinite(last)?archiveDate(last*1000):archiveDate(current.received_at);
    el.textContent=from&&to?`Archive coverage: ${from} to ${to}. Longer download options return only the observations actually available in that period.`:"Archive dates are still being established. Downloads contain only observations currently available.";
    setRangeDefaults(fromKey);
  }catch{el.textContent="Archive date coverage could not be checked just now. Downloads contain only the observations currently available.";setRangeDefaults(null);}
}
async function loadBackupStatus(){
  const el=$("backupStatusText");if(!el)return;
  try{const response=await fetch("https://parknacross-weather.dave-s-carter.workers.dev/backup-status",{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);const backup=await response.json();el.textContent=backup.configured?(backup.last_success?`Automatic completed-day backup is active. Last successful copy: ${backup.last_backup_day||"recently"}.`:"Backup storage is configured and will populate on the next scheduled run."):"Automatic backup is ready, but the separate backup destination has not been connected yet.";}
  catch{el.textContent="Backup status is temporarily unavailable.";}
}
document.addEventListener("DOMContentLoaded",()=>{
  for(const id of ["exportFrom","exportTo"]){for(const event of ["input","change"])$(id)?.addEventListener(event,()=>{rangeEdited=true;});}
  document.querySelectorAll(".export").forEach(button=>button.addEventListener("click",()=>download(button.dataset.days,button.dataset.name,button)));
  $("customExportButton")?.addEventListener("click",event=>downloadCustom(event.currentTarget));
  setRangeDefaults(null);loadArchiveCoverage();loadBackupStatus();
});
