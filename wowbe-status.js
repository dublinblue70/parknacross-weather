"use strict";
(() => {
  const api = globalThis.PARKNACROSS_API_BASE || "https://parknacross-weather.dave-s-carter.workers.dev";
  const byId = id => document.getElementById(id);
  const set = (id,value) => { const node = byId(id); if(node) node.textContent = value; };
  const badge = (label,kind) => {
    const node=byId("wowbeBadge");
    if(node){node.textContent=label;node.className="badge "+kind;}
  };
  async function refresh() {
    if(!byId("wowbeBadge"))return;
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),12000);
    try {
      const response=await fetch(api+"/wowbe-status",{cache:"no-store",signal:ctrl.signal});
      if(!response.ok)throw Error("WOW-BE monitor unavailable");
      const data=await response.json();
      if(!data.enabled || !data.credential_configured){
        badge("NOT ENABLED","warning");
        set("wowbeValue","Registration complete · Upload setup pending");
        set("wowbeDetail","Add WOWBE_AUTH_KEY as a Cloudflare secret and set WOWBE_ENABLED=true after deploying the updated Worker. Your station is registered as d8bbdb70.");
      }else if(data.last_attempt?.state==="error"){
        badge("ERROR","bad");
        set("wowbeValue","Last upload rejected or failed");
        set("wowbeDetail",data.last_attempt.error || "Check Worker logs and WOW-BE registration.");
      }else if(data.last_attempt?.state==="accepted_not_display_verified"){
        const epoch=Number(data.last_sent_observation_epoch);
        const recent=epoch>0&&Date.now()/1000-epoch<=15*60&&Date.now()/1000-epoch>=-300;
        badge(recent?"SENT":"STALE",recent?"good":"warning");
        set("wowbeValue",recent?"Upload acknowledged":"No recent upload acknowledged");
        const t=new Date(data.last_attempt.at).toLocaleString("en-IE",{timeZone:"Europe/Dublin"});
        set("wowbeDetail","WOW-BE acknowledged an observation at "+t+". Confirm the measurement appears in your WOW-BE dashboard.");
      }else{
        badge("WAITING","warning");
        set("wowbeValue","Waiting for first upload");
        set("wowbeDetail","Uploads run from direct Ecowitt gateway observations, with a scheduled fallback.");
      }
    }catch(_){
      badge("UNAVAILABLE","warning");
      set("wowbeValue","WOW-BE upload status unavailable");
      set("wowbeDetail","The newest Cloudflare Worker may not yet be deployed.");
    }finally{
      clearTimeout(timer);
      set("wowbeCheckedAt","Checked "+new Date().toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}));
    }
  }
  document.addEventListener("DOMContentLoaded",()=>{
    byId("wowbeRetry")?.addEventListener("click",refresh);
    refresh();
    setInterval(refresh,5*60*1000);
  });
})();
