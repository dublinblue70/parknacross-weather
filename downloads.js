"use strict";
const API="https://parknacross-weather.dave-s-carter.workers.dev/export.csv";
const $=id=>document.getElementById(id);
function safeDate(){return new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"});}
function status(text,state=""){const el=$("downloadStatus");if(!el)return;el.textContent=text;el.className=`status ${state}`.trim();}
function archiveDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",year:"numeric"});}
async function loadArchiveCoverage(){const el=$("archiveCoverage");if(!el)return;try{const [statsResponse,currentResponse]=await Promise.all([fetch("https://parknacross-weather.dave-s-carter.workers.dev/stats",{cache:"no-store"}),fetch("https://parknacross-weather.dave-s-carter.workers.dev/current",{cache:"no-store"})]);if(!statsResponse.ok||!currentResponse.ok)throw new Error("Coverage unavailable");const stats=await statsResponse.json(),current=await currentResponse.json(),first=Number(stats.first_epoch),last=Number(current.epoch);const from=Number.isFinite(first)?archiveDate(first*1000):null,to=Number.isFinite(last)?archiveDate(last*1000):archiveDate(current.received_at);el.textContent=from&&to?`Archive coverage: ${from} to ${to}. Longer download options return only the observations actually available in that period.`:"Archive dates are still being established. Downloads contain only observations currently available.";}catch{el.textContent="Archive date coverage could not be checked just now. Downloads contain only the observations currently available.";}}
async function download(days,label,button){
  const n=Math.max(1,Math.min(365,Math.floor(Number(days)||1)));
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent="Preparing…";}
  status(`Preparing ${n}-day download…`);
  try{
    const r=await fetch(`${API}?days=${encodeURIComponent(n)}`,{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob=await r.blob();
    if(!blob.size) throw new Error("The export was empty");
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`parknacross-weather-${label}-${safeDate()}.csv`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    status(`CSV ready: ${label.replaceAll("-"," ")}.`,"good");
  }catch(err){console.warn("Weather archive download:",err);status("Download failed. Please try again.","bad");}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
async function loadBackupStatus(){
  const el=$("backupStatusText");if(!el)return;
  try{
    const r=await fetch("https://parknacross-weather.dave-s-carter.workers.dev/backup-status",{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const b=await r.json();
    el.textContent=b.configured
      ? (b.last_success?`Automatic completed-day backup is active. Last successful copy: ${b.last_backup_day||"recently"}.`:"Backup storage is configured and will populate on the next scheduled run.")
      : "Automatic backup is ready, but the separate backup destination has not been connected yet.";
  }catch(e){el.textContent="Backup status is temporarily unavailable.";}
}
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".export").forEach(btn=>btn.addEventListener("click",()=>download(btn.dataset.days,btn.dataset.name,btn)));
  loadArchiveCoverage();
  loadBackupStatus();
});
