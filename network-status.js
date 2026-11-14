/* Provider status checks for Other Networks.
 * Do not infer external publication from a local station upload or gateway timestamp.
 * Unknown providers remain neutral until an authenticated provider confirmation exists.
 */
(() => {
  "use strict";
  const base = (window.PARKNACROSS_CONFIG?.apiBase || window.PARKNACROSS_API_BASE ||
    "https://parknacross-weather.dave-s-carter.workers.dev").replace(/\/$/, "");
  const statusIds = {
    ecowitt:"stationEcowittStatus", wu:"stationWeatherUndergroundStatus",
    windguru:"stationWindguruStatus", windy:"stationWindyStatus",
    weathercloud:"stationWeathercloudStatus", awekas:"stationAwekasStatus",
    pws:"stationPwsweatherStatus", cwop:"stationCwopStatus", wowbe:"stationWowBeStatus"
  };
  const safeEpoch = input => {
    const value = typeof input === "number" ? input : typeof input === "string" && /^\d+$/.test(input) ? Number(input) : Date.parse(input || "");
    const seconds = value > 1e12 ? value / 1000 : value;
    return Number.isFinite(seconds) && seconds > 0 && seconds <= Date.now()/1000+90 ? seconds : null;
  };
  const localDate = date => new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(date);
  function timeLabel(epoch){
    if(epoch===null)return null;
    const date=new Date(epoch*1000);
    const time=date.toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"});
    return localDate(date)===localDate(new Date())?time:
      date.toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short"})+", "+time;
  }
  function freshness(epoch,minutes){
    if(epoch===null)return "unknown";
    return Date.now()/1000-epoch<=minutes*60?"recent":"stale";
  }
  function decorate(epoch,minutes){
    return freshness(epoch,minutes)==="stale"?" · Stale":"";
  }
  function set(key,label,state="unknown",source=""){
    const el=document.getElementById(statusIds[key]);
    if(!el)return;
    el.textContent=label;
    el.dataset.state=state;
    if(source)el.title=source;
    else el.removeAttribute("title");
    // Keep the System Health display compact; retain the full provider evidence below.
    const badge=document.getElementById("networkBadge-"+key);
    if(badge){
      const lowered=label.toLowerCase();
      let short;
      if(state==="recent")short=key==="ecowitt"?"Synced":key==="wu"?"Observed":key==="cwop"?"Sent":"Accepted";
      else if(state==="stale")short="Stale";
      else if(state==="error")short="Failed";
      else if(lowered.includes("not configured"))short="Not set";
      else if(lowered.includes("awaiting"))short="Waiting";
      else short="Unverified";
      badge.textContent=short;
      badge.dataset.state=state;
      badge.setAttribute("aria-label",short+": "+nameFor(key));
    }
  }
  const names={ecowitt:"Ecowitt.net",wu:"Weather Underground",windguru:"Windguru",windy:"Windy.com",weathercloud:"Weathercloud",awekas:"AWEKAS",pws:"PWSWeather",cwop:"CWOP",wowbe:"WOW-BE"};
  function nameFor(key){return names[key]||key;}
  async function get(path){
    const response=await fetch(base+path,{cache:"no-store",signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error("Provider diagnostic unavailable");
    const data=await response.json();
    if(data?.error)throw Error("Provider diagnostic unavailable");
    return data;
  }
  async function ecowitt(){
    try{
      const d=await get("/health");
      const epoch=safeEpoch(d?.archive_ingest?.scheduled?.last_success_at);
      const label=timeLabel(epoch);
      set("ecowitt",label?"Cloud API synced "+label+decorate(epoch,20)+" · Display unverified.":"Cloud API sync unverified.",
        freshness(epoch,20),"Last successful Ecowitt cloud-to-archive sync; not proof of the public Ecowitt.net page updating.");
    }catch{set("ecowitt","Cloud API sync unverified.");}
  }
  async function wunderground(){
    try{
      const d=await get("/wunderground-status");
      const epoch=d?.confirmed===true?safeEpoch(d.observation_epoch):null;
      const label=timeLabel(epoch);
      set("wu",label?"Observed "+label+decorate(epoch,20):"Provider update unverified.",
        freshness(epoch,20),"Weather Underground current-observation API, station IARDAM6. Requires a private owner API key in Cloudflare.");
    }catch{set("wu","Provider update unverified.");}
  }
  async function windguru(){
    try{
      const d=await get("/windguru-status");
      if(d.enabled!==true||d.credential_configured!==true){
        set("windguru","Upload not configured.");return;
      }
      const state=d.last_attempt?.state;
      if(state==="error"){set("windguru","Last upload failed.","error");return;}
      const epoch=state==="accepted_not_display_verified"?safeEpoch(d.last_attempt?.at):null;
      const label=timeLabel(epoch);
      set("windguru",label?"Acknowledged "+label+decorate(epoch,15)+" · Display unverified.":"Awaiting acknowledged upload.",
        freshness(epoch,15),"Windguru HTTP upload acknowledgement; public readings are not independently verified.");
    }catch{set("windguru","Upload status unavailable.");}
  }
  async function pwsweather(){
    try{
      const d=await get("/pwsweather-status");
      if(d.credential_configured!==true){set("pws","Upload not configured.");return;}
      if(d.last_attempt?.state==="error"){set("pws","Last upload failed.","error",d.last_attempt.error||"Check the PWSWeather pipeline logs.");return;}
      const accepted=safeEpoch(d.last_accepted_at);
      const observed=safeEpoch(d.last_accepted_observation_epoch);
      const epoch=accepted??observed;
      const label=timeLabel(epoch);
      const prefix=accepted!==null?"Acknowledged ":"Accepted observation ";
      set("pws",label?prefix+label+decorate(epoch,20)+" · Display unverified.":"Awaiting acknowledged upload.",
        freshness(epoch,20),accepted!==null?"PWSWeather upload API returned success at this time, not proof of published weather readings.":"Time is the observation reported in the last accepted PWSWeather upload; actual upload time unavailable.");
    }catch{set("pws","Upload status unavailable.");}
  }
  async function cwop(){
    try{
      const d=await get("/cwop-status");
      if(d.enabled!==true||d.coordinates_configured!==true){
        set("cwop","Verified · Upload not configured.");return;
      }
      if(d.last_attempt?.state==="error"){set("cwop","Verified · Last send failed.","error");return;}
      const epoch=d.last_attempt?.state==="sent_unverified"?safeEpoch(d.last_attempt?.at):null;
      const label=timeLabel(epoch);
      set("cwop",label?"Sent "+label+decorate(epoch,20)+" · FindU unconfirmed.":"Verified · Awaiting first send.",
        freshness(epoch,20),"CWOP TCP write time is not proof FindU received or displayed the report.");
    }catch{set("cwop","Verified · Upload status unavailable.");}
  }
  async function wowbe(){
    try{
      const d=await get("/wowbe-status");
      if(d.registered!==true){set("wowbe","Registration unverified.");return;}
      if(d.enabled!==true||d.credential_configured!==true){set("wowbe","Registered · Upload not configured.");return;}
      if(d.last_attempt?.state==="error"){set("wowbe","Last upload failed.","error");return;}
      const epoch=d.last_attempt?.state==="accepted_not_display_verified"?safeEpoch(d.last_attempt?.at):null;
      const label=timeLabel(epoch);
      set("wowbe",label?"Acknowledged "+label+decorate(epoch,20)+" · Display unverified.":"Registered · Awaiting first upload.",
        freshness(epoch,20),"WOW-BE accepted the upload request; public display not independently verified.");
    }catch{set("wowbe","Upload status unavailable.");}
  }
  let running=false;
  async function refresh(){
    if(running||document.hidden)return;
    running=true;
    try{await Promise.allSettled([ecowitt(),wunderground(),windguru(),pwsweather(),cwop(),wowbe()]);}
    finally{running=false;}
  }
  function start(){
    // Windy, Weathercloud and AWEKAS cannot be labelled current without
    // trustworthy authenticated observation APIs; no station-side timestamp substitute.
    for(const key of ["windy","weathercloud","awekas"])
      set(key,"Provider update unverified.","unknown","Check the linked provider station page for its latest public observation.");
    refresh();
    (window.ParknacrossRefresh?.every||setInterval)(refresh,5*60*1000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
