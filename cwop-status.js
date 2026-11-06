"use strict";
(() => {
  const base = globalThis.PARKNACROSS_API_BASE || "https://parknacross-weather.dave-s-carter.workers.dev";
  const el = id => document.getElementById(id);
  const set = (id,text) => { const target=el(id); if(target) target.textContent=text; };
  async function refreshCwop() {
    const badge=el("cwopBadge");
    if(!badge) return;
    try {
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),12000);
      let response;
      try { response=await fetch(base+"/cwop-status",{cache:"no-store",signal:controller.signal}); }
      finally { clearTimeout(timeout); }
      if(!response.ok) throw new Error("HTTP "+response.status);
      const data=await response.json();
      if(!data.enabled || !data.coordinates_configured) {
        badge.className="badge warning"; badge.textContent="NOT ENABLED";
        set("cwopValue","Awaiting configuration");
        set("cwopDetail","Set the exact CWOP latitude and longitude and enable CWOP_ENABLED in Cloudflare. No packets are being transmitted.");
      } else if(data.last_attempt?.state==="error") {
        badge.className="badge bad"; badge.textContent="ERROR";
        set("cwopValue","Last upload failed");
        set("cwopDetail",data.last_attempt.error || "Check Cloudflare Worker logs.");
      } else if(data.last_attempt?.state==="sent_unverified") {
        const ageSeconds=Date.now()/1000-Number(data.last_sent_observation_epoch||0);
        const fresh=ageSeconds>=-300 && ageSeconds<=15*60;
        badge.className="badge "+(fresh?"good":"warning");
        badge.textContent=fresh?"SENT":"STALE";
        set("cwopValue",fresh?"Transmission sent":"No recent transmission");
        set("cwopDetail","Last TCP write: "+new Date(data.last_attempt.at).toLocaleString("en-IE",{timeZone:"Europe/Dublin"})+
          ". FindU must independently confirm reception. This is not a CWOP activation check.");
      } else {
        badge.className="badge warning"; badge.textContent="WAITING";
        set("cwopValue","No uploads recorded");
        set("cwopDetail","The first upload should occur after the next successful scheduled Ecowitt sync.");
      }
    } catch (error) {
      badge.className="badge warning"; badge.textContent="UNAVAILABLE";
      set("cwopValue","Cannot check CWOP status");
      set("cwopDetail","CWOP status endpoint is unavailable until the corresponding Cloudflare Worker code is deployed.");
    }
    set("cwopCheckedAt","Checked "+new Date().toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}));
  }
  document.addEventListener("DOMContentLoaded",()=>{
    el("cwopRetry")?.addEventListener("click",refreshCwop);
    refreshCwop();
    setInterval(refreshCwop,5*60*1000);
  });
})();
