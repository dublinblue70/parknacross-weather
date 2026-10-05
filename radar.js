(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const API=cfg.apiBase,usable=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));let map,frames=[],layer=null,i=0,playing=true,timer;
 function show(n){if(!frames.length)return;i=Math.max(0,Math.min(frames.length-1,n));const f=frames[i];if(layer)map.removeLayer(layer);
  layer=L.tileLayer(`${f.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.72,maxNativeZoom:7,maxZoom:12}).addTo(map);
  $("radarSlider").value=i;set("radarTime",new Date(f.time*1000).toLocaleString("en-IE",{timeZone:"Europe/Dublin",weekday:"short",hour:"2-digit",minute:"2-digit"}));
  set("radarStatus",i===frames.length-1?"Latest available frame":"Recent radar frame");}
 async function loadRadar(){try{const r=await fetch("https://api.rainviewer.com/public/weather-maps.json",{cache:"no-store"});const d=await r.json();
   frames=(d.radar?.past||[]).map(x=>({...x,host:d.host}));$("radarSlider").max=Math.max(0,frames.length-1);show(frames.length-1);
   clearInterval(timer);timer=setInterval(()=>{if(playing)show((i+1)%frames.length)},1500);}catch(e){set("radarTime","Radar temporarily unavailable");}}
 async function loadRain(){try{const c=await fetch(`${API}/current`,{cache:"no-store"}).then(r=>r.json());set("radarRainRate",usable(c.rain_rate_mm_h)?`${Number(c.rain_rate_mm_h).toFixed(1)} mm/h`:"--");set("radarRainToday",usable(c.rain_daily_mm)?`${Number(c.rain_daily_mm).toFixed(1)} mm`:"--");}catch{set("radarRainRate","--");set("radarRainToday","--");}}
 function loadSatelliteImage(image){
  if(!image||image.dataset.loading==="true")return Promise.resolve(false);
  const base=image.dataset.satelliteSrc;if(!base)return Promise.resolve(false);
  image.dataset.loading="true";
  const status=image.closest("figure")?.querySelector("[data-satellite-status]");
  if(status)status.textContent=image.dataset.loadedAt?"Refreshing image; keeping the current view until it is ready…":"Loading image from EUMETSAT…";
  const stamp=Math.floor(Date.now()/60000),url=`${base}?refresh=${stamp}`;
  return new Promise(resolve=>{
   let done=false;
   const finish=(loaded)=>{
    if(done)return;done=true;clearTimeout(timeout);image.dataset.loading="false";
    if(loaded){image.src=url;image.dataset.loadedAt=String(Date.now());image.dataset.failed="false";if(status)status.textContent="Latest image loaded. Check the image for its observation time.";}
    else{image.dataset.failed="true";if(status)status.textContent=image.dataset.loadedAt?"Refresh unavailable; showing the previous image.":"Image temporarily unavailable. Use the EUMETView source link below.";}
    resolve(loaded);
   };
   const timeout=setTimeout(()=>finish(false),20000),probe=new Image();
   probe.decoding="async";probe.onload=()=>finish(true);probe.onerror=()=>finish(false);probe.src=url;
  });
 }
 function startSatelliteImages(){
  const images=[...document.querySelectorAll("[data-satellite-image]")],section=$("satelliteImagery"),button=$("satelliteRefresh");
  if(!images.length||!section)return;
  const refreshVisible=()=>images.filter(image=>image.dataset.inView==="true").map(image=>{
   const loadedAt=Number(image.dataset.loadedAt||0);return !loadedAt||Date.now()-loadedAt>=15*60*1000?loadSatelliteImage(image):Promise.resolve(false);
  });
  if("IntersectionObserver" in window){
   const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    const image=entry.target;image.dataset.inView=String(entry.isIntersecting);
    if(entry.isIntersecting){const loadedAt=Number(image.dataset.loadedAt||0);if(!loadedAt||Date.now()-loadedAt>=15*60*1000)loadSatelliteImage(image);}
   }),{rootMargin:"280px 0px",threshold:0});
   images.forEach(image=>observer.observe(image));
  }else{images.forEach(image=>{image.dataset.inView="true";loadSatelliteImage(image);});}
  button?.addEventListener("click",async()=>{
   button.disabled=true;button.setAttribute("aria-busy","true");set("satelliteRefresh","Refreshing…");
   await Promise.all(images.map(image=>loadSatelliteImage(image)));
   button.disabled=false;button.removeAttribute("aria-busy");set("satelliteRefresh","Refresh images");
  });
  setInterval(refreshVisible,15*60*1000);
 }
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());map=L.map("radarMap").setView([cfg.stationLat,cfg.stationLon],7);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
 L.circleMarker([cfg.stationLat,cfg.stationLon],{radius:7,color:"#fff",weight:2,fillColor:"#7bd7ef",fillOpacity:1}).addTo(map).bindTooltip("Approximate station area · North Wexford (not an exact location)");
 $("radarSlider").addEventListener("input",e=>{playing=false;set("radarPlay","Play");show(Number(e.target.value))});
 $("radarPlay").addEventListener("click",()=>{playing=!playing;set("radarPlay",playing?"Pause":"Play")});startSatelliteImages();loadRadar();loadRain();setInterval(loadRain,60*1000);setInterval(loadRadar,5*60*1000);
 });})();
