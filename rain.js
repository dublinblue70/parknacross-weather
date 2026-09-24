(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},API=cfg.apiBase,$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const usable=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 const n=(v,d=1)=>usable(v)?Number(v).toFixed(d):"--";
 const dt=v=>v?new Date(v).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"--";
 const dayKey=v=>{const d=v instanceof Date?v:new Date(v);if(Number.isNaN(d.getTime()))return null;const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d),get=t=>parts.find(p=>p.type===t)?.value;return `${get("year")}-${get("month")}-${get("day")}`};
 const correctedCurrentRain=c=>{if(!usable(c?.rain_daily_mm))return null;const when=c.received_at||(usable(c.epoch)?Number(c.epoch)*1000:null),key=dayKey(when),correction=Number(window.PARKNACROSS_DATA_CORRECTIONS?.dailyRainMm?.[key]||0);return Math.round(Math.max(0,Number(c.rain_daily_mm)-correction)*10)/10};
 async function get(p){const r=await fetch(`${API}${p}`,{cache:"no-store"});if(!r.ok)throw new Error();return r.json()}
 const rainState=(summary,history,current)=>{
  const rate=usable(current?.rain_rate_mm_h)?Number(current.rain_rate_mm_h):usable(summary?.current_rate_mm_h)?Number(summary.current_rate_mm_h):null;
  const rows=Array.isArray(history?.readings)?history.readings:[],now=current?.received_at?new Date(current.received_at).getTime():(usable(current?.epoch)?Number(current.epoch)*1000:Date.now());let lastIncrease=null,prev=null;
  for(const row of rows){const t=row?.received_at?new Date(row.received_at).getTime():usable(row?.epoch)?Number(row.epoch)*1000:NaN,total=usable(row?.rain_daily_mm)?Number(row.rain_daily_mm):NaN;if(!Number.isFinite(t)||!Number.isFinite(total))continue;if(prev&&total>=prev.total+0.05)lastIncrease=t;prev={t,total};}
  const currentTotal=usable(current?.rain_daily_mm)?Number(current.rain_daily_mm):null;if(prev&&currentTotal!==null&&currentTotal>=prev.total+0.05)lastIncrease=now;if(rate!==null&&rate>0)lastIncrease=now;
  const age=lastIncrease?Math.max(0,now-lastIncrease):Infinity;return{rate,isRaining:(rate!==null&&rate>0)||age<=5*60*1000,rainRecently:(rate===null||rate<=0)&&age>5*60*1000&&age<=15*60*1000,lastIncrease};
 };
 let chart=null;
 function renderChart(days){
  const rows=days||[];
  const config={type:"bar",data:{labels:rows.map(x=>new Date(x.day+"T12:00:00").toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short"})),datasets:[{data:rows.map(x=>usable(x.rain_mm)?Number(x.rain_mm):null),backgroundColor:"#7ca9ff",borderRadius:5}]},options:{maintainAspectRatio:false,scales:{x:{grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:12}},y:{beginAtZero:true,grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:"mm",color:"#9fb3c1"}}},plugins:{legend:{display:false}}}};
  if(chart){chart.data=config.data;chart.update();}else chart=new Chart($("rainDailyChart"),config);
 }
 async function load(){
  try{const [s,d,h,c,e]=await Promise.all([get("/rain-summary"),get("/daily?days=30"),get("/history?hours=1"),get("/current"),get("/rain-events?days=30")]);const rs=rainState(s,h,c);
   const todayRain=correctedCurrentRain(c)??(usable(s.today_mm)?Number(s.today_mm):null);
   set("rainNow",rs.isRaining&&!(rs.rate>0)?"Rain detected":rs.rate===null?"--":`${n(rs.rate)} mm/h`);set("rainToday",usable(todayRain)?`${n(todayRain)} mm`:"--");set("rainYesterday",`${n(s.yesterday_mm)} mm`);set("rain7",`${n(s.last_7_days_mm)} mm`);
   set("rain7Note",s.last_7_days_complete===false&&Array.isArray(s.last_7_days_missing_dates)&&s.last_7_days_missing_dates.length?`Observed total · ${s.last_7_days_missing_dates.length} missing calendar day${s.last_7_days_missing_dates.length===1?"":"s"}`:"Complete 7-calendar-day total");
   set("rainMonth",`${n(s.month_mm)} mm`);set("rainMonthDays",usable(s.month_rain_days)?`${Number(s.month_rain_days)} rain days`:"--");set("rainYear",`${n(s.year_mm)} mm`);set("dryDays",usable(s.consecutive_dry_days)?String(Number(s.consecutive_dry_days)):"--");
   set("dryDaysNote",s.consecutive_dry_days_complete===false?"Stops at first missing archive day":"0.0 mm daily total · consecutive calendar days");
   set("rainWettest",s.wettest_day&&usable(s.wettest_day.rain_mm)?`${n(s.wettest_day.rain_mm)} mm`:"--");set("rainWettestDate",s.wettest_day?.day||"--");
   const detectedAt=rs.lastIncrease?new Date(rs.lastIncrease).toISOString():s.last_measurable_rain?.received_at;set("lastRain",detectedAt?"Rain detected":"No rain yet");set("lastRainDate",dt(detectedAt));
   if(s.current_event){set("rainEventTotal",`${n(s.current_event.total_mm)} mm`);set("rainEventStart",`Since ${dt(s.current_event.started_at)}`);set("rainEventText",`Active rain event · ${n(s.current_event.total_mm)} mm accumulated.`)}
   else if(rs.isRaining){set("rainEventTotal",usable(todayRain)?`${n(todayRain)} mm today`:"Rain detected");set("rainEventStart","Rain detected recently");set("rainEventText",rs.rate>0?`Rain is falling at ${n(rs.rate)} mm/h.`:"Rain has been detected within the last few minutes, although the instantaneous WS90 rate is currently 0.0 mm/h.");}
   else if(rs.rainRecently){set("rainEventTotal","Rain recently");set("rainEventStart","Within the last 15 min");set("rainEventText","Rain was detected recently at Parknacross.");}
   else{set("rainEventTotal","No active event");set("rainEventStart","Station currently dry");set("rainEventText","No measurable rain has been detected recently at Parknacross.");}
   renderChart(d.days);
   set("rainEventCount",usable(e.event_count)?String(Number(e.event_count)):"--");
   set("largestRainEvent",e.largest_event&&usable(e.largest_event.total_mm)?`${n(e.largest_event.total_mm)} mm`:"--");
   set("largestRainEventDate",e.largest_event?.start_at?dt(e.largest_event.start_at):"--");
   set("peakRainEventRate",e.highest_rate_event&&usable(e.highest_rate_event.peak_rate_mm_h)?`${n(e.highest_rate_event.peak_rate_mm_h)} mm/h`:"--");
   set("peakRainEventDate",e.highest_rate_event?.start_at?dt(e.highest_rate_event.start_at):"--");
   set("longestDryInterval",usable(e.longest_dry_hours)?`${n(e.longest_dry_hours)} h`:"--");
   const list=$("rainEventsList");if(list){const events=Array.isArray(e.events)?e.events:[];list.innerHTML=events.length?events.slice(0,10).map(event=>{const mins=Number(event.duration_minutes||0),dur=mins>=60?`${Math.floor(mins/60)}h ${mins%60}m`:`${mins} min`;return `<article class="rain-event-row"><span>${dt(event.start_at)}${event.active?" · active":""}</span><strong>${n(event.total_mm)} mm</strong><span>${dur}</span><span>Peak ${n(event.peak_rate_mm_h)} mm/h</span></article>`;}).join(""):'<p class="info-note">No measurable rain events were identified in the last 30 days.</p>';}
  }catch(e){set("rainEventText","Rainfall summary temporarily unavailable.");}
 }
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());load();setInterval(load,60*1000);});
})();
