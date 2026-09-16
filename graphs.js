(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},API=cfg.apiBase,$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};let charts={},hours=24;
 const line=(label,color,axis="y")=>({label,data:[],borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25,yAxisID:axis});
 const scales=unit=>({x:{grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:9}},y:{grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:unit,color:"#9fb3c1"}}});
 const windLine=(label,colour,axis="y")=>({
   label,
   data:[],
   borderColor:colour,
   backgroundColor:colour,
   borderWidth:2.2,
   pointRadius:0,
   pointHoverRadius:4,
   tension:0.3,
   fill:false,
   spanGaps:false,
   yAxisID:axis
 });
 const windScales=title=>({
   x:{
     grid:{color:"transparent"},
     ticks:{color:"#a8bfd4",maxTicksLimit:8}
   },
   y:{
     grid:{color:"rgba(163,209,255,.10)"},
     ticks:{color:"#a8bfd4"},
     title:{display:true,text:title,color:"#a8bfd4"}
   }
 });
 const usable=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 const rainText=v=>{if(!usable(v))return"Unavailable";const n=Number(v);if(n<=0)return"Dry";if(n<1)return"Very light rain";if(n<2.5)return"Light rain";if(n<7.5)return"Moderate rain";return"Heavy rain"};
 function make(){
 if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){
   Chart.defaults.animation=false;
 }
 Chart.defaults.color="#bfd0e3";
 Chart.defaults.font.family="Inter,system-ui,sans-serif";
 const common={maintainAspectRatio:false,interaction:{mode:"index",intersect:false}};
 charts.t=new Chart($("gTemp"),{type:"line",data:{labels:[],datasets:[line("Temperature","#ff8d8d"),line("Dew point","#6ef1cb")]},options:{...common,scales:scales("°C"),plugins:{legend:{position:"bottom"}}}});
 charts.w=new Chart($("gWind"),{
   type:"line",
   data:{
     labels:[],
     datasets:[
       windLine("Wind km/h","#74ddff"),
       windLine("Gust km/h","#ffad66")
     ]
   },
   options:{
     maintainAspectRatio:false,
     interaction:{mode:"index",intersect:false},
     scales:windScales("km/h"),
     plugins:{legend:{position:"bottom"}}
   }
 });
 const roseLabels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
 charts.rose=new Chart($("gWindRose"),{type:"polarArea",data:{labels:roseLabels,datasets:[{label:"Direction frequency %",data:new Array(16).fill(0),backgroundColor:roseLabels.map((_,i)=>`hsla(${185+i*3},78%,68%,${.30+(i%4)*.08})`),borderColor:"rgba(174,225,244,.32)",borderWidth:1}]},options:{maintainAspectRatio:false,scales:{r:{beginAtZero:true,grid:{color:"rgba(174,210,232,.11)"},angleLines:{color:"rgba(174,210,232,.11)"},ticks:{display:false},pointLabels:{display:true,color:"#bfd0e3",font:{size:11}}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${Number(ctx.raw||0).toFixed(1)}%`}}}}});
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
       tooltip:{callbacks:{label:ctx=>usable(ctx.parsed.y)?`${rainText(ctx.parsed.y)} · ${Number(ctx.parsed.y).toFixed(1)} mm/h`:"Rain rate unavailable"}}
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
 const TEMP_OUTLIER_DELTA_C=2.5,TEMP_OUTLIER_BASELINE_C=1.0,TEMP_OUTLIER_WINDOW_SECONDS=30*60,TEMP_OUTLIER_MIN_NEIGHBORS=3;
 function median(values){const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return null;const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;}
 function temperatureOutlierRows(rows){const ordered=rows.map(row=>({row,epoch:rowEpoch(row),temp:Number(row?.temperature_c)})).filter(x=>x.epoch!==null&&usable(x.row?.temperature_c)).sort((a,b)=>a.epoch-b.epoch),out=new Set();for(const c of ordered){const neighbors=ordered.filter(x=>x!==c&&Math.abs(x.epoch-c.epoch)<=TEMP_OUTLIER_WINDOW_SECONDS);if(neighbors.length<TEMP_OUTLIER_MIN_NEIGHBORS)continue;const baseline=median(neighbors.map(x=>x.temp));if(!Number.isFinite(baseline))continue;const agreeing=neighbors.filter(x=>Math.abs(x.temp-baseline)<=TEMP_OUTLIER_BASELINE_C).length,required=Math.max(2,Math.ceil(neighbors.length*.6));if(agreeing>=required&&Math.abs(c.temp-baseline)>=TEMP_OUTLIER_DELTA_C)out.add(c.row);}return out;}


 const GUST_SPIKE_MIN_KMH=12,GUST_SPIKE_DELTA_KMH=8,GUST_SPIKE_WINDOW_SECONDS=20*60,GUST_CALM_NEIGHBOR_MAX_KMH=7,GUST_SUSTAINED_WIND_MAX_KMH=7;
 function gustOutlierRows(rows){
   const ordered=(rows||[]).map(row=>({row,epoch:rowEpoch(row),gust:Number(row?.wind_gust_kmh),speed:usable(row?.wind_speed_kmh)?Number(row.wind_speed_kmh):null}))
     .filter(x=>x.epoch!==null&&usable(x.row?.wind_gust_kmh)).sort((a,b)=>a.epoch-b.epoch),out=new Set();
   for(const c of ordered){
     if(c.row?.wind_gust_excluded){out.add(c.row);continue;}
     if(c.gust<GUST_SPIKE_MIN_KMH)continue;
     const before=ordered.filter(x=>x!==c&&x.epoch<c.epoch&&c.epoch-x.epoch<=GUST_SPIKE_WINDOW_SECONDS);
     const after=ordered.filter(x=>x!==c&&x.epoch>c.epoch&&x.epoch-c.epoch<=GUST_SPIKE_WINDOW_SECONDS);
     const neighbors=[...before,...after];
     if(!before.length||!after.length||neighbors.length<4)continue;
     const baseline=median(neighbors.map(x=>x.gust));if(!Number.isFinite(baseline))continue;
     const calm=neighbors.filter(x=>x.gust<=GUST_CALM_NEIGHBOR_MAX_KMH).length>=Math.ceil(neighbors.length*.75);
     const sustainedCalm=c.speed===null||c.speed<=GUST_SUSTAINED_WIND_MAX_KMH;
     if(calm&&sustainedCalm&&c.gust-baseline>=GUST_SPIKE_DELTA_KMH&&c.gust>=Math.max(GUST_SPIKE_MIN_KMH,baseline*2.5))out.add(c.row);
   }
   return out;
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
     const wet=usable(rows[i]?.rain_rate_mm_h)&&Number(rows[i].rain_rate_mm_h)>0;
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
 function updateWindRose(rows){
   const bins=new Array(16).fill(0);let total=0,calm=0;
   for(const row of rows){
     if(!usable(row?.wind_direction_deg)||!usable(row?.wind_speed_kmh))continue;
     const speed=Number(row.wind_speed_kmh);if(speed<1){calm++;continue;}
     const deg=((Number(row.wind_direction_deg)%360)+360)%360,index=Math.round(deg/22.5)%16;bins[index]++;total++;
   }
   charts.rose.data.datasets[0].data=bins.map(v=>total?v/total*100:0);charts.rose.update();
   set("windRoseMeta",total?`${total.toLocaleString("en-IE")} directional observations · calm/near-calm samples excluded${calm?` (${calm.toLocaleString("en-IE")})`:""}`:"No usable wind-direction observations in this period.");
 }
 async function load(h){hours=h;set("graphRangeTitle",({6:"Last 6 hours",24:"Last 24 hours",48:"Last 48 hours",168:"Last 7 days",720:"Last 30 days"})[h]);set("graphCount","Loading…");
 try{const [d,c]=await Promise.all([fetch(`${API}/history?hours=${h}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error();return r.json()}),fetch(`${API}/current`,{cache:"no-store"}).then(r=>r.ok?r.json():null).catch(()=>null)]);let rows=Array.isArray(d.readings)?d.readings:[];if(c&&rowEpoch(c)!==null){const ce=rowEpoch(c),last=rows.length?rowEpoch(rows.at(-1)):null;if(last===null||ce>last)rows=[...rows,c];else if(ce===last)rows=[...rows.slice(0,-1),c];}const temperatureOutliers=temperatureOutlierRows(rows),gapData=withGapMarkers(rows),r=h===24?gapData.rows:thin(gapData.rows),labs=r.map(label),rainRows=thinRain(gapData.rows),rainLabs=rainRows.map(label);
 charts.t.data.labels=labs;charts.w.data.labels=labs;charts.p.data.labels=labs;charts.s.data.labels=labs;
 charts.r.data.labels=rainLabs;
 charts.t.data.datasets[0].data=r.map(x=>x?._gap||temperatureOutliers.has(x)?null:(x?.temperature_c??null));charts.t.data.datasets[1].data=r.map(x=>value(x,"dew_point_c"));
 const windGustOutliers=gustOutlierRows(r.filter(x=>!x?._gap));
 charts.w.data.datasets[0].data=r.map(x=>value(x,"wind_speed_kmh"));charts.w.data.datasets[1].data=r.map(x=>x?._gap||windGustOutliers.has(x)?null:value(x,"wind_gust_kmh"));charts.p.data.datasets[0].data=r.map(x=>value(x,"pressure_hpa"));
 charts.r.data.datasets[0].data=rainRows.map(x=>x?._gap?null:(usable(x.rain_rate_mm_h)?Number(x.rain_rate_mm_h):null));charts.s.data.datasets[0].data=r.map(x=>value(x,"solar_w_m2"));charts.s.data.datasets[1].data=r.map(x=>value(x,"uv_index"));
 updateWindRose(rows);
 [charts.t,charts.w,charts.p,charts.r,charts.s].forEach(c=>c.update());
 const gapText=gapData.gaps?` · ${gapData.gaps} archive gap${gapData.gaps===1?"":"s"} shown as breaks`:"",qualityText=temperatureOutliers.size?` · ${temperatureOutliers.size} isolated temperature spike${temperatureOutliers.size===1?"":"s"} excluded`:"",gustQualityText=windGustOutliers.size?` · ${windGustOutliers.size} suspect gust spike${windGustOutliers.size===1?"":"s"} excluded`:"";
 set("graphCount",`${rows.length.toLocaleString("en-IE")} saved observations · ${r.filter(x=>!x?._gap).length.toLocaleString("en-IE")} plotted${gapText}${qualityText}${gustQualityText}`);}catch(e){set("graphCount","Archive temporarily unavailable.");}}
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());make();document.querySelectorAll("[data-hours]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-hours]").forEach(x=>x.classList.toggle("active",x===b));load(Number(b.dataset.hours))}));load(24);setInterval(()=>load(hours),5*60*1000);});
})();
