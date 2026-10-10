(() => {
  'use strict';
  const usable=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const epoch=r=>r?.received_at?Date.parse(r.received_at)/1000:usable(r?.epoch)?Number(r.epoch):null;
  const day=e=>new Date(e*1000).toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'});
  const stamp=e=>new Date(e*1000).toLocaleString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  function evidence(current,history=[],now=Date.now()/1000){
    const at=epoch(current),fresh=usable(at)&&now-at>=-90&&now-at<=600;
    const rows=[...history,current].filter(r=>r&&usable(epoch(r))&&epoch(r)<=now+90).sort((a,b)=>epoch(a)-epoch(b));
    let previous=null,last=null,increase=0,hasInterval=false;
    for(const row of rows){const t=epoch(row),total=usable(row.rain_daily_mm)?Number(row.rain_daily_mm):null;
      if(usable(row.rain_rate_mm_h)&&Number(row.rain_rate_mm_h)>0)last=t;
      if(previous&&t>previous.t&&t-previous.t<=600&&total!==null&&previous.total!==null){if(now-t<=1200)hasInterval=true;const delta=day(t)===day(previous.t)?total-previous.total:total;if(delta>=.05&&delta<50){last=t;if(now-t<=1200)increase+=delta;}}
      previous={t,total};
    }
    const rate=fresh&&usable(current?.rain_rate_mm_h)?Number(current.rain_rate_mm_h):null;
    const active=fresh&&(rate>0||(last!==null&&now-last<=300));
    const confirmed=active&&(rate>=2.5||increase>=.2-1e-6);
    return {fresh,at,rate,last,increase,hasInterval,active,confirmed};
  }
  function render(current,history=[],lastKnown=null){
    const host=document.getElementById('rainEvidence');if(!host)return;
    const e=evidence(current,history),last=e.last||(lastKnown?Date.parse(lastKnown)/1000:null);
    host.replaceChildren();const title=document.createElement('strong');title.textContent=!e.fresh||e.rate===null?'Current rain evidence unavailable':e.confirmed?'Rainfall confirmed':e.active?'Rain detected · awaiting confirmation':'No recent rain detected';host.append(title);
    const detail=document.createElement('p');detail.textContent=e.fresh?`Latest rate: ${e.rate===null?'unavailable':e.rate.toFixed(1)+' mm/h'} · increase in available readings from the last 20 minutes: ${e.hasInterval?e.increase.toFixed(1)+' mm':'not enough history'}. ${last&&usable(last)?' Last rain detected '+stamp(last)+' Irish time.':''}`:'A recent station observation is needed to describe rain now.';host.append(detail);
    const note=document.createElement('small');note.textContent='Confirmation requires active rain plus a 0.2 mm increase in 20 minutes, or a rate of at least 2.5 mm/h. This describes the station sensor, not radar or a forecast.';host.append(note);
  }
  function sensors(current){const host=document.getElementById('sensorFreshnessDetail');if(!host||!current)return;const received=epoch(current);host.textContent=`Weather reading received ${usable(received)?stamp(received)+' Irish time':'at an unavailable time'}. Soil and lightning sensor transmission times are not supplied separately by the gateway; a fresh upload does not prove that each sensor has just updated. Lightning event times refer to detected strikes.`;}
  window.ParknacrossRainEvidence={evidence,render};
  window.addEventListener('parknacross:current-observation',event=>{render(event.detail.current,event.detail.history);sensors(event.detail.current);});
})();
