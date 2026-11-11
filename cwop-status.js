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
        set("cwopValue","Account verified · Upload not configured");
        set("cwopDetail","CWOP account GW8205 is verified. Set the registered CWOP coordinates and enable CWOP_ENABLED in Cloudflare before uploads can start. FindU reception is unverified.");
      } else if(data.last_attempt?.state==="error") {
        badge.className="badge bad"; badge.textContent="ERROR";
        set("cwopValue","Last upload failed");
        set("cwopDetail","Account verified · "+(data.last_attempt.error || "Check Cloudflare Worker logs.")+" FindU reception has not been confirmed.");
      } else if(data.last_attempt?.state==="sent_unverified") {
        const ageSeconds=Date.now()/1000-Number(data.last_sent_observation_epoch||0);
        const fresh=ageSeconds>=-300 && ageSeconds<=15*60;
        badge.className="badge "+(fresh?"good":"warning");
        badge.textContent=fresh?"SENT":"STALE";
        set("cwopValue",fresh?"Transmission sent":"No recent transmission");
        set("cwopDetail","Last TCP write: "+new Date(data.last_attempt.at).toLocaleString("en-IE",{timeZone:"Europe/Dublin"})+
          ". Account GW8205 is verified; FindU reception remains unverified.");
      } else {
        badge.className="badge warning"; badge.textContent="WAITING";
        set("cwopValue","Verified · Awaiting first upload");
        set("cwopDetail","CWOP account GW8205 is verified. Awaiting the next scheduled transmission using a fresh gateway or Ecowitt observation; check FindU for reception.");
      }
    } catch (error) {
      badge.className="badge warning"; badge.textContent="UNAVAILABLE";
      set("cwopValue","Cannot check CWOP status");
      set("cwopDetail","CWOP account GW8205 is verified, but the Cloudflare upload status cannot be checked. FindU reception remains unverified.");
    }
    set("cwopCheckedAt","Checked "+new Date().toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}));
  }
  document.addEventListener("DOMContentLoaded",()=>{
    el("cwopRetry")?.addEventListener("click",refreshCwop);
    refreshCwop();
    setInterval(refreshCwop,5*60*1000);
  });
})();
