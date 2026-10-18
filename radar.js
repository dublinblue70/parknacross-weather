(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const API=cfg.apiBase,coords=[Number(cfg.stationLat),Number(cfg.stationLon)],usable=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 let map,frames=[],layer=null,i=0,playing=false,timer,feedWarning="",arrivalBusy=false;
 const frameTime=seconds=>new Date(seconds*1000).toLocaleString("en-IE",{timeZone:"Europe/Dublin",weekday:"short",hour:"2-digit",minute:"2-digit"});
 function updateRadarStatus(){
  if(!frames.length)return;
  const latest=frames[frames.length-1],age=Math.max(0,Math.floor((Date.now()-latest.time*1000)/60000)),latestTime=frameTime(latest.time);
  const ageText=age<1?"just now":age+" min ago";
  let freshness="Latest frame captured "+latestTime+" · "+ageText;
  if(age>=120)freshness="Radar frames are stale · latest captured "+latestTime+" ("+ageText+")";
  else if(age>=45)freshness="Radar feed may be delayed · latest captured "+latestTime+" ("+ageText+")";
  const viewText=i===frames.length-1?freshness:"Viewing an earlier frame · "+freshness;
  set("radarStatus",feedWarning?feedWarning+" · "+viewText:viewText);
 }
 function show(n){
  if(!frames.length)return;
  i=Math.max(0,Math.min(frames.length-1,n));const f=frames[i];
  if(layer)map.removeLayer(layer);
  layer=L.tileLayer(f.host+f.path+"/256/{z}/{x}/{y}/2/1_1.png",{opacity:.72,maxNativeZoom:7,maxZoom:12}).addTo(map);
  $("radarSlider").value=i;set("radarTime",frameTime(f.time));updateRadarStatus();
 }
 function startAnimation(){clearInterval(timer);if(document.hidden)return;if(frames.length>1)timer=setInterval(()=>show((i+1)%frames.length),1500);}
 function stopAnimation(){clearInterval(timer);timer=null;}
 function setArrival(title,detail){set("radarArrivalEstimate",title);set("radarArrivalDetail",detail);}
 function projection(lat,lon,z){
  const scale=256*Math.pow(2,z),latRad=lat*Math.PI/180;
  return {x:(lon+180)/360*scale,y:(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*scale};
 }
 async function loadRadarPatch(frame){
  const z=7,size=256,patchSize=size*3,worldTiles=Math.pow(2,z),station=projection(coords[0],coords[1],z);
  const originX=Math.floor((station.x-patchSize/2)/size),originY=Math.floor((station.y-patchSize/2)/size);
  const canvas=document.createElement("canvas");canvas.width=patchSize;canvas.height=patchSize;
  const context=canvas.getContext("2d",{willReadFrequently:true});
  const tasks=[];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
   const tx=((originX+col)%worldTiles+worldTiles)%worldTiles,ty=originY+row;
   if(ty<0||ty>=worldTiles)continue;
   const url=frame.host+frame.path+"/"+size+"/"+z+"/"+tx+"/"+ty+"/2/1_1.png";
   tasks.push((async()=>{
    const response=await fetch(url,{mode:"cors",cache:"force-cache"});
    if(!response.ok)throw new Error("Radar image tile unavailable");
    const blob=await response.blob(),bitmap=await createImageBitmap(blob);
    context.drawImage(bitmap,col*size,row*size,size,size);bitmap.close();
   })());
  }
  await Promise.all(tasks);
  const data=context.getImageData(0,0,patchSize,patchSize).data,mask=new Uint8Array(patchSize*patchSize);
  for(let p=0,q=0;p<mask.length;p++,q+=4)if(data[q+3]>28&&Math.max(data[q],data[q+1],data[q+2])>24)mask[p]=1;
  return {mask,width:patchSize,sx:station.x-originX*size,sy:station.y-originY*size};
 }
 function motionBetween(older,newer){
  const w=older.width,limit=48,step=2;
  let best={score:0,dx:0,dy:0,overlap:0};
  for(let dy=-limit;dy<=limit;dy+=step)for(let dx=-limit;dx<=limit;dx+=step){
   let intersection=0,union=0;
   for(let y=50;y<w-50;y+=3){
    const yy=y+dy;if(yy<0||yy>=w)continue;
    for(let x=50;x<w-50;x+=3){
     const xx=x+dx;if(xx<0||xx>=w)continue;
     const a=older.mask[y*w+x],b=newer.mask[yy*w+xx];
     if(a||b)union++;if(a&&b)intersection++;
    }
   }
   if(intersection<6||!union)continue;
   const score=intersection/union;
   if(score>best.score)best={score,dx,dy,overlap:intersection};
  }
  return best;
 }
 function arrivalFromMasks(older,newer,minutes){
  const w=newer.width,sx=newer.sx,sy=newer.sy,latest=newer.mask;
  let nearEcho=0,areaEcho=0;
  for(let y=0;y<w;y+=2)for(let x=0;x<w;x+=2){
   if(!latest[y*w+x])continue;
   const d=Math.hypot(x-sx,y-sy);
   if(d<=9)nearEcho++;
   if(d<=125)areaEcho++;
  }
  if(nearEcho>2)return {kind:"now",nearEcho,areaEcho};
  if(areaEcho<3)return {kind:"dry",nearEcho,areaEcho};
  const motion=motionBetween(older,newer),speed=Math.hypot(motion.dx,motion.dy)/minutes;
  if(motion.score<0.12||speed<0.08||speed>2.5)return {kind:"uncertain",motion,nearEcho,areaEcho};
  const vx=motion.dx/minutes,vy=motion.dy/minutes,v2=vx*vx+vy*vy,candidates=[];
  for(let y=0;y<w;y+=2)for(let x=0;x<w;x+=2){
   if(!latest[y*w+x])continue;
   const ox=sx-x,oy=sy-y,d=Math.hypot(ox,oy);
   if(d<12||d>125)continue;
   const t=(ox*vx+oy*vy)/v2;
   if(t<=0||t>60)continue;
   const miss=Math.hypot(ox-vx*t,oy-vy*t);
   if(miss<=10)candidates.push(t);
  }
  if(!candidates.length)return {kind:"none",motion,nearEcho,areaEcho};
  candidates.sort((a,b)=>a-b);
  const first=candidates[0],coherent=candidates.filter(t=>t<=first+8).length;
  if(coherent<4)return {kind:"uncertain",motion,nearEcho,areaEcho};
  return {kind:"arrival",minutes:first,confidence:motion.score>=0.25&&coherent>=12?"moderate":"low",motion,nearEcho,areaEcho};
 }
 async function updateArrivalEstimate(){
  if(arrivalBusy||!frames.length)return;
  arrivalBusy=true;
  try{
   const latest=frames[frames.length-1],age=Math.max(0,(Date.now()-latest.time*1000)/60000);
   if(age>45){setArrival("Estimate unavailable — radar is delayed","The latest radar frame is "+Math.round(age)+" minutes old. Wait for fresher frames before relying on an arrival estimate.");return;}
   const earlier=frames.filter(f=>latest.time-f.time>=20*60).slice(-1)[0];
   if(!earlier){setArrival("Waiting for more radar history","At least 20 minutes of recent radar movement is needed to estimate a direction and arrival.");return;}
   const [oldPatch,newPatch]=await Promise.all([loadRadarPatch(earlier),loadRadarPatch(latest)]);
   const elapsed=(latest.time-earlier.time)/60,result=arrivalFromMasks(oldPatch,newPatch,elapsed);
   if(result.kind==="now"){setArrival("A radar echo is over the Parknacross area","Radar shows precipitation close to the station marker now. Check the WS90 reading for the local observation.");return;}
   if(result.kind==="dry"){setArrival("No rain echo detected nearby","No precipitation echo is visible within roughly 90 km of the station in the latest frame.");return;}
   if(result.kind==="uncertain"){setArrival("Not enough consistent movement to estimate","Rain echoes are present, but their recent motion is too weak or scattered to give a useful arrival time.");return;}
   if(result.kind==="none"){setArrival("No approaching echo detected","Recent radar echoes are not on a clear track toward the Parknacross area within the next hour.");return;}
   const lower=Math.floor(result.minutes/10)*10,upper=lower+10,windowText=lower<10?"within about 10 minutes":"in about "+lower+"–"+upper+" minutes";
   setArrival("Rain may reach the Parknacross area "+windowText,"Short-range extrapolation from "+Math.round(elapsed)+" minutes of RainViewer radar frames · "+result.confidence+" confidence. Radar echoes can strengthen, weaken or change direction; this is not an official forecast.");
  }catch(error){
   setArrival("Radar arrival estimate unavailable","Recent radar images could not be analysed in this browser. The animated radar remains available above.");
  }finally{arrivalBusy=false;}
 }
 async function loadRadar(){
  try{
   const response=await fetch("https://api.rainviewer.com/public/weather-maps.json",{cache:"no-store"});
   if(!response.ok)throw new Error("RainViewer returned "+response.status);
   const data=await response.json(),next=(data.radar?.past||[]).filter(frame=>frame.path&&Number.isFinite(Number(frame.time))).map(frame=>({...frame,host:data.host}));
   if(!data.host||!next.length)throw new Error("No radar frames returned");
   frames=next;feedWarning="";$("radarPlay").disabled=frames.length<2;$("radarSlider").disabled=frames.length<2;$("radarSlider").max=Math.max(0,frames.length-1);show(frames.length-1);
   if(playing)startAnimation();else stopAnimation();
   updateArrivalEstimate();
  }catch(error){
   feedWarning=frames.length?"Radar refresh failed; showing the last loaded frames":"Radar feed temporarily unavailable";
   if(frames.length){updateRadarStatus();updateArrivalEstimate();}else {set("radarTime","Radar temporarily unavailable");set("radarStatus",feedWarning+". Rain readings and satellite imagery remain available; refresh this page to retry.");setArrival("Radar arrival estimate unavailable","Waiting for the RainViewer radar feed to return.");playing=false;stopAnimation();set("radarPlay","Play");$("radarPlay").disabled=true;$("radarSlider").disabled=true;}
  }
 }
 async function loadRain(){try{const response=await fetch(API+"/current",{cache:"no-store"});if(!response.ok)throw Error("Rain reading unavailable");const c=await response.json();if(c.error)throw Error(c.error);const stamp=c.received_at?Date.parse(c.received_at):usable(c.epoch)?Number(c.epoch)*1000:NaN,age=Date.now()-stamp,fresh=Number.isFinite(stamp)&&age>=-90000&&age<=600000,day=v=>new Date(v).toLocaleDateString("en-CA",{timeZone:"Europe/Dublin"}),today=Number.isFinite(stamp)&&day(stamp)===day(Date.now());set("radarRainRate",fresh&&usable(c.rain_rate_mm_h)?Number(c.rain_rate_mm_h).toFixed(1)+" mm/h":"--");const correction=Number(window.PARKNACROSS_DATA_CORRECTIONS?.dailyRainMm?.[day(stamp)]||0);set("radarRainToday",today&&usable(c.rain_daily_mm)?Math.max(0,Number(c.rain_daily_mm)-correction).toFixed(1)+" mm":"--");set("radarRainUpdated",Number.isFinite(stamp)?(fresh?"Observed":"Saved reading")+" "+new Date(stamp).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" Irish time"+(fresh?"":" · current rain status unavailable"):"Observation time unavailable");}catch{set("radarRainRate","--");set("radarRainToday","--");set("radarRainUpdated","Current station rainfall could not be checked.");}}
 function startSatelliteStream(){
  const stream=document.querySelector("[data-satellite-stream]"),section=$("satelliteImagery"),status=document.querySelector("[data-satellite-status]");
  if(!stream||!section)return;
  let started=false;
  const start=()=>{if(started)return;started=true;stream.addEventListener("load",()=>{if(status)status.textContent="Player loaded. Press play to view the stream; if playback is unavailable, use the direct link below."},{once:true});stream.addEventListener("error",()=>{if(status)status.textContent="The embedded player could not load. Open the EUMETSAT stream directly using the link below."},{once:true});stream.src=stream.dataset.streamSrc;};
  if("IntersectionObserver"in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){start();observer.disconnect();}},{rootMargin:"280px 0px",threshold:0});observer.observe(stream);}else start();
 }
 document.addEventListener("visibilitychange",()=>{if(document.hidden)stopAnimation();else if(playing)startAnimation();});
 document.addEventListener("DOMContentLoaded",()=>{
  set("year",new Date().getFullYear());startSatelliteStream();loadRain();(window.ParknacrossRefresh?.every||setInterval)(loadRain,60*1000);
  if(!window.L){set("radarStatus","The map library could not load. Retry this page to restore radar.");set("radarTime","Radar map unavailable");setArrival("Radar arrival estimate unavailable","The map library could not load.");["radarCenter","radarSlider","radarPlay"].forEach(id=>{if($(id))$(id).disabled=true;});return;}
  map=L.map("radarMap").setView(coords,7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
  L.circleMarker(coords,{radius:7,color:"#fff",weight:2,fillColor:"#7bd7ef",fillOpacity:1}).addTo(map).bindTooltip("Approximate station area · North Wexford (not an exact location)");
  $("radarCenter").addEventListener("click",()=>map.setView(coords,Math.max(7,map.getZoom())));
  $("radarSlider").addEventListener("input",event=>{playing=false;stopAnimation();set("radarPlay","Play");show(Number(event.target.value))});
  $("radarPlay").addEventListener("click",()=>{playing=!playing;set("radarPlay",playing?"Pause":"Play");if(playing)startAnimation();else stopAnimation()});
  loadRadar();(window.ParknacrossRefresh?.every||setInterval)(loadRadar,5*60*1000);(window.ParknacrossRefresh?.every||setInterval)(updateRadarStatus,60*1000);
 });
})();