(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const API=cfg.apiBase,coords=[Number(cfg.stationLat),Number(cfg.stationLon)],usable=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 let map,frames=[],layer=null,i=0,playing=true,timer,feedWarning="";
 const frameTime=seconds=>new Date(seconds*1000).toLocaleString("en-IE",{timeZone:"Europe/Dublin",weekday:"short",hour:"2-digit",minute:"2-digit"});
 function updateRadarStatus(){
  if(!frames.length)return;
  const latest=frames[frames.length-1],age=Math.max(0,Math.floor((Date.now()-latest.time*1000)/60000)),latestTime=frameTime(latest.time);
  const ageText=age<1?"just now":`${age} min ago`;
  let freshness=`Latest frame captured ${latestTime} · ${ageText}`;
  if(age>=120)freshness=`Radar frames are stale · latest captured ${latestTime} (${ageText})`;
  else if(age>=45)freshness=`Radar feed may be delayed · latest captured ${latestTime} (${ageText})`;
  const viewText=i===frames.length-1?freshness:`Viewing an earlier frame · ${freshness}`;
  set("radarStatus",feedWarning?`${feedWarning} · ${viewText}`:viewText);
 }
 function show(n){
  if(!frames.length)return;
  i=Math.max(0,Math.min(frames.length-1,n));const f=frames[i];
  if(layer)map.removeLayer(layer);
  layer=L.tileLayer(`${f.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.72,maxNativeZoom:7,maxZoom:12}).addTo(map);
  $("radarSlider").value=i;set("radarTime",frameTime(f.time));updateRadarStatus();
 }
 async function loadRadar(){
  try{
   const response=await fetch("https://api.rainviewer.com/public/weather-maps.json",{cache:"no-store"});
   if(!response.ok)throw new Error(`RainViewer returned ${response.status}`);
   const data=await response.json(),next=(data.radar?.past||[]).filter(frame=>frame.path&&Number.isFinite(Number(frame.time))).map(frame=>({...frame,host:data.host}));
   if(!data.host||!next.length)throw new Error("No radar frames returned");
   frames=next;feedWarning="";$("radarSlider").max=Math.max(0,frames.length-1);show(frames.length-1);
   clearInterval(timer);if(frames.length>1)timer=setInterval(()=>{if(playing)show((i+1)%frames.length)},1500);
  }catch(error){
   feedWarning=frames.length?"Radar refresh failed; showing the last loaded frames":"Radar feed temporarily unavailable";
   if(frames.length)updateRadarStatus();else set("radarTime","Radar temporarily unavailable");
  }
 }
 async function loadRain(){try{const c=await fetch(`${API}/current`,{cache:"no-store"}).then(r=>r.json());set("radarRainRate",usable(c.rain_rate_mm_h)?`${Number(c.rain_rate_mm_h).toFixed(1)} mm/h`:"--");set("radarRainToday",usable(c.rain_daily_mm)?`${Number(c.rain_daily_mm).toFixed(1)} mm`:"--");}catch{set("radarRainRate","--");set("radarRainToday","--");}}
 function startSatelliteStream(){
  const stream=document.querySelector("[data-satellite-stream]"),section=$("satelliteImagery"),status=document.querySelector("[data-satellite-status]");
  if(!stream||!section)return;
  let started=false;
  const start=()=>{if(started)return;started=true;stream.addEventListener("load",()=>{if(status)status.textContent="Player loaded. Press play to view the stream; if playback is unavailable, use the direct link below.";},{once:true});stream.addEventListener("error",()=>{if(status)status.textContent="The embedded player could not load. Open the EUMETSAT stream directly using the link below.";},{once:true});stream.src=stream.dataset.streamSrc;};
  if("IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){start();observer.disconnect();}},{rootMargin:"280px 0px",threshold:0});observer.observe(stream);}else start();
 }
 document.addEventListener("DOMContentLoaded",()=>{
  set("year",new Date().getFullYear());map=L.map("radarMap").setView(coords,7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
  L.circleMarker(coords,{radius:7,color:"#fff",weight:2,fillColor:"#7bd7ef",fillOpacity:1}).addTo(map).bindTooltip("Approximate station area · North Wexford (not an exact location)");
  $("radarCenter").addEventListener("click",()=>map.setView(coords,Math.max(7,map.getZoom())));
  $("radarSlider").addEventListener("input",event=>{playing=false;set("radarPlay","Play");show(Number(event.target.value))});
  $("radarPlay").addEventListener("click",()=>{playing=!playing;set("radarPlay",playing?"Pause":"Play")});
  startSatelliteStream();loadRadar();loadRain();setInterval(loadRain,60*1000);setInterval(loadRadar,5*60*1000);setInterval(updateRadarStatus,60*1000);
 });
})();
