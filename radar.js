(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const API=cfg.apiBase;let map,frames=[],layer=null,i=0,playing=true,timer;
 function show(n){if(!frames.length)return;i=Math.max(0,Math.min(frames.length-1,n));const f=frames[i];if(layer)map.removeLayer(layer);
  layer=L.tileLayer(`${f.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.72,maxNativeZoom:7,maxZoom:12}).addTo(map);
  $("radarSlider").value=i;set("radarTime",new Date(f.time*1000).toLocaleString("en-IE",{weekday:"short",hour:"2-digit",minute:"2-digit"}));
  set("radarStatus",i===frames.length-1?"Latest available frame":"Recent radar frame");}
 async function loadRadar(){try{const r=await fetch("https://api.rainviewer.com/public/weather-maps.json",{cache:"no-store"});const d=await r.json();
   frames=(d.radar?.past||[]).map(x=>({...x,host:d.host}));$("radarSlider").max=Math.max(0,frames.length-1);show(frames.length-1);
   clearInterval(timer);timer=setInterval(()=>{if(playing)show((i+1)%frames.length)},1500);}catch(e){set("radarTime","Radar temporarily unavailable");}}
 async function loadRain(){try{const c=await fetch(`${API}/current`,{cache:"no-store"}).then(r=>r.json());set("radarRainRate",`${Number(c.rain_rate_mm_h||0).toFixed(1)} mm/h`);set("radarRainToday",`${Number(c.rain_daily_mm||0).toFixed(1)} mm`);}catch{}}
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());map=L.map("radarMap").setView([cfg.stationLat,cfg.stationLon],7);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
 L.circleMarker([cfg.stationLat,cfg.stationLon],{radius:7,color:"#fff",weight:2,fillColor:"#7bd7ef",fillOpacity:1}).addTo(map).bindTooltip("Parknacross Weather");
 $("radarSlider").addEventListener("input",e=>{playing=false;set("radarPlay","Play");show(Number(e.target.value))});
 $("radarPlay").addEventListener("click",()=>{playing=!playing;set("radarPlay",playing?"Pause":"Play")});loadRadar();loadRain();
 if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});});})();