(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},API=cfg.apiBase,$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};let charts={},hours=24;
 const line=(label,color,axis="y")=>({label,data:[],borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25,yAxisID:axis});
 const scales=unit=>({x:{grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:9}},y:{grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:unit,color:"#9fb3c1"}}});
 const rainText=v=>{const n=Number(v||0);if(n<=0)return"Dry";if(n<1)return"Very light rain";if(n<2.5)return"Light rain";if(n<7.5)return"Moderate rain";return"Heavy rain"};
 function make(){const common={maintainAspectRatio:false,interaction:{mode:"index",intersect:false}};
 charts.t=new Chart($("gTemp"),{type:"line",data:{labels:[],datasets:[line("Temperature","#ff8d8d"),line("Dew point","#6ef1cb")]},options:{...common,scales:scales("°C"),plugins:{legend:{position:"bottom"}}}});
 charts.w=new Chart($("gWind"),{type:"line",data:{labels:[],datasets:[line("Wind","#74ddff"),line("Gust","#ffad66")]},options:{...common,scales:scales("km/h"),plugins:{legend:{position:"bottom"}}}});
 charts.p=new Chart($("gPressure"),{type:"line",data:{labels:[],datasets:[line("Pressure","#b594ff")]},options:{...common,scales:scales("hPa"),plugins:{legend:{display:false}}}});
 charts.r=new Chart($("gRain"),{
   type:"line",
   data:{labels:[],datasets:[{
     label:"Rain rate",
     data:[],
     borderColor:"#7ca9ff",
     backgroundColor:"rgba(124,169,255,.22)",
     borderWidth:2,
     pointRadius:0,
     pointHoverRadius:5,
     pointHitRadius:10,
     stepped:"before",
     fill:"origin",
     tension:0
   }]},
   options:{
     ...common,
     scales:{
       x:{grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:9}},
       y:{beginAtZero:true,suggestedMax:1,grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1",precision:1},title:{display:true,text:"mm/h",color:"#9fb3c1"}}
     },
     plugins:{
       legend:{display:false},
       tooltip:{callbacks:{label:ctx=>`${rainText(ctx.parsed.y)} · ${Number(ctx.parsed.y||0).toFixed(1)} mm/h`}}
     }
   }
 });
 charts.s=new Chart($("gSolar"),{type:"line",data:{labels:[],datasets:[line("Solar","#ffd77a","y"),line("UV","#b594ff","y1")]},options:{...common,scales:{x:{grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:9}},y:{position:"left",beginAtZero:true,grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:"W/m²",color:"#9fb3c1"}},y1:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},ticks:{color:"#9fb3c1"}}},plugins:{legend:{position:"bottom"}}}});
 }
 const GAP_SECONDS=20*60;
 function rowEpoch(x){
   const n=Number(x?.epoch);
   if(Number.isFinite(n))return n;
   const ms=Date.parse(x?.received_at||"");
   return Number.isFinite(ms)?Math.floor(ms/1000):null;
 }
 function withGapMarkers(rows){
   if(rows.length<2)return {rows:[...rows],gaps:0};
   const out=[rows[0]];
   let gaps=0;
   for(let i=1;i<rows.length;i++){
     const a=rowEpoch(rows[i-1]),b=rowEpoch(rows[i]);
     if(a!==null&&b!==null&&b-a>GAP_SECONDS){
       out.push({_gap:true,gap_seconds:b-a,epoch:a+Math.floor((b-a)/2)});
       gaps++;
     }
     out.push(rows[i]);
   }
   return {rows:out,gaps};
 }
 function thin(r,max=900){
   if(r.length<=max)return r;
   const keep=new Set([0,r.length-1]);
   const step=r.length/max;
   for(let i=0;i<max;i++)keep.add(Math.min(r.length-1,Math.floor(i*step)));
   for(let i=0;i<r.length;i++){
     if(r[i]?._gap){
       keep.add(i);
       if(i>0)keep.add(i-1);
       if(i<r.length-1)keep.add(i+1);
     }
   }
   return [...keep].sort((a,b)=>a-b).map(i=>r[i]);
 }
 function thinRain(rows,max=1200){
   if(rows.length<=max)return rows;
   const keep=new Set([0,rows.length-1]);
   const step=rows.length/max;
   for(let i=0;i<max;i++)keep.add(Math.min(rows.length-1,Math.floor(i*step)));
   for(let i=0;i<rows.length;i++){
     if(rows[i]?._gap){keep.add(i);if(i>0)keep.add(i-1);if(i<rows.length-1)keep.add(i+1);continue;}
     const wet=Number(rows[i]?.rain_rate_mm_h||0)>0;
     if(wet){keep.add(i);if(i>0)keep.add(i-1);if(i<rows.length-1)keep.add(i+1);}
   }
   return [...keep].sort((a,b)=>a-b).map(i=>rows[i]);
 }
 function label(x){
   if(x?._gap)return "";
   const d=new Date(x.received_at||x.epoch*1000);
   return hours<=48?d.toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short"})+" "+d.toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit"});
 }
 const value=(x,key)=>x?._gap?null:x?.[key]??null;
 async function load(h){hours=h;set("graphRangeTitle",({6:"Last 6 hours",24:"Last 24 hours",48:"Last 48 hours",168:"Last 7 days",720:"Last 30 days"})[h]);set("graphCount","Loading…");
 try{const d=await fetch(`${API}/history?hours=${h}`).then(r=>r.json()),rows=d.readings||[],gapData=withGapMarkers(rows),r=thin(gapData.rows),labs=r.map(label),rainRows=thinRain(gapData.rows),rainLabs=rainRows.map(label);
 charts.t.data.labels=labs;charts.w.data.labels=labs;charts.p.data.labels=labs;charts.s.data.labels=labs;
 charts.r.data.labels=rainLabs;
 charts.t.data.datasets[0].data=r.map(x=>value(x,"temperature_c"));charts.t.data.datasets[1].data=r.map(x=>value(x,"dew_point_c"));
 charts.w.data.datasets[0].data=r.map(x=>value(x,"wind_speed_kmh"));charts.w.data.datasets[1].data=r.map(x=>value(x,"wind_gust_kmh"));charts.p.data.datasets[0].data=r.map(x=>value(x,"pressure_hpa"));
 charts.r.data.datasets[0].data=rainRows.map(x=>x?._gap?null:Number(x.rain_rate_mm_h||0));charts.s.data.datasets[0].data=r.map(x=>value(x,"solar_w_m2"));charts.s.data.datasets[1].data=r.map(x=>value(x,"uv_index"));
 Object.values(charts).forEach(c=>c.update());
 const gapText=gapData.gaps?` · ${gapData.gaps} archive gap${gapData.gaps===1?"":"s"} shown as breaks`:"";
 set("graphCount",`${rows.length.toLocaleString("en-IE")} saved observations · ${r.filter(x=>!x?._gap).length.toLocaleString("en-IE")} plotted${gapText}`);}catch(e){set("graphCount","Archive temporarily unavailable.");}}
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());make();document.querySelectorAll("[data-hours]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-hours]").forEach(x=>x.classList.toggle("active",x===b));load(Number(b.dataset.hours))}));load(24);if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});});
})();
