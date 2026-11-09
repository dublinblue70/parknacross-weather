"use strict";
(() => {
  const api = globalThis.PARKNACROSS_API_BASE || "https://parknacross-weather.dave-s-carter.workers.dev";
  const el = id => document.getElementById(id);
  const setText = (id, text) => {const target=el(id);if(target)target.textContent=text;};
  const setBadge = (label, status) => {
    const badge=el("windguruBadge");
    if (badge) {badge.textContent=label;badge.className="badge "+status;}
  };
  async function refreshWindguru(){
    if(!el("windguruBadge"))return;
    try {
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),12000);
      let response;
      try{response=await fetch(api+"/windguru-status",{cache:"no-store",signal:controller.signal});}
      finally{clearTimeout(timeout);}
      if(!response.ok)throw Error("HTTP "+response.status);
      const data=await response.json();
      if(!data.enabled || !data.credential_configured){
        setBadge("NOT ENABLED","warning");
        setText("windguruValue","Awaiting upload configuration");
        setText("windguruDetail","A Windguru station upload password must be stored in Cloudflare as WINDGURU_UPLOAD_PASSWORD, and WINDGURU_ENABLED must be true. No transmission is confirmed.");
      }else if(data.last_attempt?.state==="error"){
        setBadge("ERROR","bad");
        setText("windguruValue","Last upload failed");
        setText("windguruDetail",data.last_attempt.error||"Check the Cloudflare Worker logs.");
      }else if(data.last_attempt?.state==="accepted_not_display_verified"){
        const epoch=Number(data.last_sent_observation_epoch);
        const age=Date.now()/1000-epoch;
        const fresh=Number.isFinite(epoch)&&epoch>0&&age>=-300&&age<=15*60;
        setBadge(fresh?"SENT":"STALE",fresh?"good":"warning");
        setText("windguruValue",fresh?"Upload acknowledged":"No recent upload acknowledged");
        setText("windguruDetail","Windguru acknowledged an upload at "+new Date(data.last_attempt.at).toLocaleString("en-IE",{timeZone:"Europe/Dublin"})+". Confirm that actual readings are visible on the Windguru station page.");
      }else{
        setBadge("WAITING","warning");
        setText("windguruValue","No acknowledged upload yet");
        setText("windguruDetail","The first upload will be attempted during a successful scheduled Ecowitt sync.");
      }
    }catch(_){
      setBadge("UNAVAILABLE","warning");
      setText("windguruValue","Windguru upload status unavailable");
      setText("windguruDetail","The updated Cloudflare Worker may not have been deployed yet.");
    }
    setText("windguruCheckedAt","Checked "+new Date().toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}));
  }
  document.addEventListener("DOMContentLoaded",()=>{
    el("windguruRetry")?.addEventListener("click",refreshWindguru);
    refreshWindguru();
    setInterval(refreshWindguru,5*60*1000);
  });
})();
