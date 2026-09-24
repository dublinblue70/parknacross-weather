(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},API=cfg.apiBase,$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};let charts={},hours=24;
 const line=(label,color,axis="y")=>({label,data:[],borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.25,yAxisID:axis});
 const tickTime=value=>{const d=new Date(Number(value));return hours<=48?d.toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short"})};
 const tooltipTime=items=>{const value=items?.[0]?.parsed?.x;return Number.isFinite(value)?new Date(value).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):""};
 const timeAxis=()=>({type:"linear",grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:9,callback:tickTime}});
 const scales=(unit,zero=false)=>({x:timeAxis(),y:{beginAtZero:zero,grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:unit,color:"#9fb3c1"}}});
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
   x:timeAxis(),
   y:{
     beginAtZero:true,
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
 const common={maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{tooltip:{callbacks:{title:tooltipTime}}}};
 charts.t=new Chart($("gTemp"),{type:"line",data:{datasets:[line("Temperature","#ff8d8d"),line("Dew point","#6ef1cb")]},options:{...common,scales:scales("°C"),plugins:{...common.plugins,legend:{position:"bottom"}}}});
 charts.w=new Chart($("gWind"),{
   type:"line",
   data:{
     datasets:[
       windLine("Wind km/h","#74ddff"),
       windLine("Gust km/h","#ffad66"),
       {label:"Suspect gust excluded from line",data:[],borderColor:"#8797a5",backgroundColor:"#8797a5",showLine:false,pointRadius:3,pointHoverRadius:6,yAxisID:"y"}
     ]
   },
   options:{
     maintainAspectRatio:false,
     interaction:{mode:"index",intersect:false},
     scales:windScales("km/h"),
     plugins:{...common.plugins,legend:{position:"bottom"}}
   }
 });
 charts.rose=window.ParknacrossWindRose?.create($("gWindRose")) || null;
 charts.p=new Chart($("gPressure"),{type:"line",data:{datasets:[line("Pressure","#b594ff")]},options:{...common,scales:scales("hPa"),plugins:{...common.plugins,legend:{display:false}}}});
 charts.r=new Chart($("gRain"),{
   type:"line",
   data:{datasets:[{
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
       x:timeAxis(),
       y:{beginAtZero:true,suggestedMax:1,grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1",precision:1},title:{display:true,text:"mm/h",color:"#9fb3c1"}}
     },
     plugins:{
       legend:{display:false},
       tooltip:{callbacks:{title:tooltipTime,label:ctx=>usable(ctx.parsed.y)?`${rainText(ctx.parsed.y)} · ${Number(ctx.parsed.y).toFixed(1)} mm/h`:"Rain rate unavailable"}}
     }
   }
 });
 charts.s=new Chart($("gSolar"),{type:"line",data:{datasets:[line("Solar","#ffd77a","y"),line("UV","#b594ff","y1")]},options:{...common,scales:{x:timeAxis(),y:{position:"left",beginAtZero:true,grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:"W/m²",color:"#9fb3c1"}},y1:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},ticks:{color:"#9fb3c1"},title:{display:true,text:"UV index",color:"#9fb3c1"}}},plugins:{...common.plugins,legend:{position:"bottom"}}}});
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
 function thinPreservingExtrema(rows,keys,max=900){
   if(rows.length<=max)return rows;
   const real=rows.filter(x=>!x?._gap&&rowEpoch(x)!==null);
   if(!real.length)return thin(rows,max);
   const first=rowEpoch(real[0]),last=rowEpoch(real.at(-1));
   const bucket=Math.max(1,(last-first)/Math.max(1,Math.floor(max/(keys.length*2))));
   const keep=new Set([rows[0],rows.at(-1)]),groups=new Map();
   for(const row of real){const k=Math.floor((rowEpoch(row)-first)/bucket);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}
   for(const group of groups.values())for(const key of keys){const valid=group.filter(x=>usable(x?.[key]));if(!valid.length)continue;keep.add(valid.reduce((a,b)=>Number(a[key])<=Number(b[key])?a:b));keep.add(valid.reduce((a,b)=>Number(a[key])>=Number(b[key])?a:b));}
   rows.filter(x=>x?._gap).forEach(x=>keep.add(x));
   return [...keep].sort((a,b)=>(rowEpoch(a)||0)-(rowEpoch(b)||0));
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
 const point=(x,key,excluded=null)=>({x:Number(rowEpoch(x))*1000,y:x?._gap||excluded?.has(x)?null:value(x,key)});
 function coverageDetails(rows,requestedHours){const epochs=rows.map(rowEpoch).filter(Number.isFinite).sort((a,b)=>a-b);if(!epochs.length)return{text:"No usable timestamps",pct:0};const available=Math.max(0,epochs.at(-1)-epochs[0]),requested=requestedHours*3600,pct=Math.min(100,available/requested*100);const date=e=>new Date(e*1000).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});return{text:`${date(epochs[0])}–${date(epochs.at(-1))} · ${pct.toFixed(1)}% of selected span`,pct};}
 function updateChartAccessibility(periodLabel,rowCount,coverage){
   const labels={gTemp:"Temperature and dew point",gWind:"Wind speed and gusts",gPressure:"Sea-level pressure",gRain:"Rain rate",gSolar:"Solar radiation and UV",gWindRose:"Wind direction frequency"};
   Object.entries(labels).forEach(([id,label])=>$(id)?.setAttribute("aria-label",`${label} for ${periodLabel.toLowerCase()}, based on ${rowCount.toLocaleString("en-IE")} saved observations. ${coverage.text}.`));
 }
 function rangeText(rows,key,unit,excluded=null,digits=1){
   const values=rows.filter(row=>!excluded?.has(row)&&usable(row?.[key])).map(row=>Number(row[key]));
   if(!values.length)return"Unavailable";
   return`${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)} ${unit}`;
 }
 function maxText(rows,key,unit,excluded=null,digits=1){
   const values=rows.filter(row=>!excluded?.has(row)&&usable(row?.[key])).map(row=>Number(row[key]));
   return values.length?`${Math.max(...values).toFixed(digits)} ${unit}`:"Unavailable";
 }
 function updateHighlights(rows,tempExcluded,gustExcluded){
   set("highlightTemp",rangeText(rows,"temperature_c","°C",tempExcluded));
   set("highlightGust",maxText(rows,"wind_gust_kmh","km/h",gustExcluded));
   set("highlightPressure",rangeText(rows,"pressure_hpa","hPa",null,1));
   set("highlightRain",maxText(rows,"rain_rate_mm_h","mm/h"));
   const solar=maxText(rows,"solar_w_m2","W/m²",null,0),uv=maxText(rows,"uv_index","UV");
   set("highlightSolar",solar==="Unavailable"&&uv==="Unavailable"?"Unavailable":`${solar} · ${uv}`);
 }
 function updateWindRose(rows, hours, endEpoch){
   window.ParknacrossWindRose?.update(charts.rose,rows,$("windRoseMeta"),{hours,endEpoch});
 }
 async function load(h){hours=h;const periodLabel=({6:"Last 6 hours",24:"Last 24 hours",48:"Last 48 hours",168:"Last 7 days",720:"Last 30 days"})[h];set("graphRangeTitle",periodLabel);set("graphCoverage","Checking available coverage…");set("graphCount","Loading…");$("partialCoverageBadge")?.setAttribute("hidden","");
 try{const [d,c]=await Promise.all([fetch(`${API}/history?hours=${h}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error();return r.json()}),fetch(`${API}/current`,{cache:"no-store"}).then(r=>r.ok?r.json():null).catch(()=>null)]);let rows=Array.isArray(d.readings)?d.readings:[];if(c&&rowEpoch(c)!==null){const ce=rowEpoch(c),last=rows.length?rowEpoch(rows.at(-1)):null;if(last===null||ce>last)rows=[...rows,c];else if(ce===last)rows=[...rows.slice(0,-1),c];}const temperatureOutliers=temperatureOutlierRows(rows),windGustOutliers=gustOutlierRows(rows),gapData=withGapMarkers(rows),r=h<=24?gapData.rows:thinPreservingExtrema(gapData.rows,["temperature_c","dew_point_c","wind_speed_kmh","wind_gust_kmh","pressure_hpa","solar_w_m2","uv_index"]),rainRows=thinRain(gapData.rows);
 charts.t.data.datasets[0].data=r.map(x=>point(x,"temperature_c",temperatureOutliers));charts.t.data.datasets[1].data=r.map(x=>point(x,"dew_point_c"));
 charts.w.data.datasets[0].data=r.map(x=>point(x,"wind_speed_kmh"));charts.w.data.datasets[1].data=r.map(x=>point(x,"wind_gust_kmh",windGustOutliers));charts.w.data.datasets[2].data=r.map(x=>({x:Number(rowEpoch(x))*1000,y:windGustOutliers.has(x)?value(x,"wind_gust_kmh"):null}));charts.p.data.datasets[0].data=r.map(x=>point(x,"pressure_hpa"));
 charts.r.data.datasets[0].data=rainRows.map(x=>point(x,"rain_rate_mm_h"));charts.s.data.datasets[0].data=r.map(x=>point(x,"solar_w_m2"));charts.s.data.datasets[1].data=r.map(x=>point(x,"uv_index"));
 updateWindRose(rows,h,Math.floor(Date.now()/300000)*300);
 [charts.t,charts.w,charts.p,charts.r,charts.s].forEach(c=>c.update());
 updateHighlights(rows,temperatureOutliers,windGustOutliers);
 const gapText=gapData.gaps?` · ${gapData.gaps} archive gap${gapData.gaps===1?"":"s"} shown as breaks`:"",qualityText=temperatureOutliers.size?` · ${temperatureOutliers.size} isolated temperature spike${temperatureOutliers.size===1?"":"s"} excluded`:"",gustQualityText=windGustOutliers.size?` · ${windGustOutliers.size} suspect gust spike${windGustOutliers.size===1?"":"s"} excluded`:"";
 const coverage=coverageDetails(rows,h),partial=coverage.pct<98;set("graphCoverage",coverage.text);const badge=$("partialCoverageBadge");if(badge){badge.hidden=!partial;badge.textContent=partial?`Partial archive · ${coverage.pct.toFixed(1)}%`:"";}set("graphCount",`${rows.length.toLocaleString("en-IE")} saved observations · ${r.filter(x=>!x?._gap).length.toLocaleString("en-IE")} extrema-preserving points plotted${gapText}${qualityText}${gustQualityText}`);set("graphUpdated",`Updated ${new Date().toLocaleTimeString("en-IE",{timeZone:"Europe/Dublin",hour:"2-digit",minute:"2-digit"})} Irish time`);updateChartAccessibility(periodLabel,rows.length,coverage);set("chartTextSummary",`${({6:"Six-hour",24:"Twenty-four-hour",48:"Forty-eight-hour",168:"Seven-day",720:"Thirty-day"})[h]} charts. Available observations cover ${coverage.text}. ${partial?"This is a partial archive and should not be read as a complete selected period. ":""}${gapData.gaps?`${gapData.gaps} archive gap${gapData.gaps===1?" is":"s are"} shown as breaks.`:"No archive gaps longer than twenty minutes."}`);}catch(e){["highlightTemp","highlightGust","highlightPressure","highlightRain","highlightSolar"].forEach(id=>set(id,"Unavailable"));set("graphCount","Archive temporarily unavailable.");set("graphCoverage","Coverage unavailable.");set("graphUpdated","Charts could not be refreshed. Try again.");$("partialCoverageBadge")?.setAttribute("hidden","");}}
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());make();document.querySelectorAll("[data-hours]").forEach(b=>{b.setAttribute("aria-pressed",b.classList.contains("active")?"true":"false");b.addEventListener("click",()=>{document.querySelectorAll("[data-hours]").forEach(x=>{const selected=x===b;x.classList.toggle("active",selected);x.setAttribute("aria-pressed",selected?"true":"false")});load(Number(b.dataset.hours))})});$("graphRetry")?.addEventListener("click",()=>document.querySelector("[data-hours].active")?.click());load(24);setInterval(()=>load(hours),5*60*1000);});
})();
