"use strict";
const API="https://parknacross-weather.dave-s-carter.workers.dev/export.csv";
const $=id=>document.getElementById(id);
function safeDate(){return new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"});}
function status(text,state=""){const el=$("downloadStatus");if(!el)return;el.textContent=text;el.className=`status ${state}`.trim();}
async function download(days,label,button){
  const n=Math.max(1,Math.min(3660,Math.floor(Number(days)||1)));
  const original=button?.textContent;
  if(button){button.disabled=true;button.textContent="Preparing…";}
  status(`Preparing ${n}-day export…`);
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
  }catch(err){status(`Download failed: ${err.message||"unknown error"}. No site data was changed.`,"bad");}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".export").forEach(btn=>btn.addEventListener("click",()=>download(btn.dataset.days,btn.dataset.name,btn)));
  $("customButton")?.addEventListener("click",()=>{
    const input=$("customDays");const n=Math.floor(Number(input?.value));
    if(!Number.isFinite(n)||n<1||n>3660){status("Enter a number between 1 and 3660 days.","bad");return;}
    download(n,`${n}-days`,$("customButton"));
  });
});
