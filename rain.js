(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},API=cfg.apiBase,$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 const usable=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 const n=(v,d=1)=>usable(v)?Number(v).toFixed(d):"--";
 const dt=v=>v?new Date(v).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"--";
 const dayKey=v=>{const d=v instanceof Date?v:new Date(v);if(Number.isNaN(d.getTime()))return null;const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d),get=t=>parts.find(p=>p.type===t)?.value;return `${get("year")}-${get("month")}-${get("day")}`};
 const correctedCurrentRain=c=>{if(!usable(c?.rain_daily_mm))return null;const when=c.received_at||(usable(c.epoch)?Number(c.epoch)*1000:null),key=dayKey(when);if(!when||key!==dayKey(new Date()))return null;const correction=Number(window.PARKNACROSS_DATA_CORRECTIONS?.dailyRainMm?.[key]||0);return Math.round(Math.max(0,Number(c.rain_daily_mm)-correction)*10)/10};
 async function get(p){let last;const attempts=p==="/current"?1:2;for(let attempt=0;attempt<attempts;attempt++){try{const r=await fetch(`${API}${p}`,{cache:"no-store",...(typeof AbortSignal!=="undefined"&&AbortSignal.timeout?{signal:AbortSignal.timeout(12000)}:{})});if(!r.ok)throw new Error(`HTTP ${r.status}`);const data=await r.json();if(data?.error)throw new Error(data.error);return data;}catch(error){last=error;if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,500));}}throw last;}
 const rainState=(summary,history,current)=>window.ParknacrossRainStatus.evaluate(current,history?.readings||[]);

 // The immediate and archive-complete states must have the same evidence priority.
 function rainConditionText(rs,intensity,rateText){
  switch(rs.status){
    case "measured": return `${intensity||"Rain measured"} · ${rateText||window.ParknacrossRainIntensity?.formatRate(rs.rate)||n(rs.rate)+" mm/h"}`;
    case "sensor_disagreement": return `Rain indicated now · WS90 ${n(rs.piezoRate)} mm/h, WH40H ${n(rs.rainRate)} mm/h · intensity unconfirmed`;
    case "possible": return rs.piezoIndicatesRain
      ? `Possible rain · WS90 indicates ${n(rs.piezoRate)} mm/h, not confirmed by WH40H`
      : "Possible rain · WS90 rain counter increased, not confirmed by WH40H";
    case "new_tip": return "Rain detected · WH40H counter increased within 2 min";
    case "recent": return "Rain recorded recently · current rain rate unconfirmed";
    case "unavailable": return rs.reason==="stale_observation"?"Station observation delayed · live rain unconfirmed":"Station observation timestamp unavailable";
    case "rate_unavailable": return "WH40H live rain rate missing · daily total separate";
    default: return "No current rain measured by the dedicated gauge";
  }
 }
 function eventGraphLink(event){const start=Number(event.start_epoch),end=Number(event.end_epoch),now=Math.floor(Date.now()/1000);const from=Number.isFinite(start)&&start>0?Math.floor(start)-1800:null,to=Number.isFinite(end)&&end>=start?Math.min(now,Math.ceil(end)+1800):now;return from&&to>from&&to-from<=31*86400?`graphs.html?from=${from}&to=${to}#gRain`:'history.html';}
 let chart=null,loading=false;
 const calendarLabel=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||"")?new Date(day+"T12:00:00Z").toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",weekday:"short",day:"numeric",month:"short"}):"Date unavailable";

 let dailyRows=[],dailyExpanded=false;
 function renderDailyTable(){
  const table=$("rainDailyTable"),button=$("rainDailyMore");if(!table)return;
  const visible=dailyExpanded?dailyRows:dailyRows.slice(0,7),peak=Math.max(0,...visible.filter(x=>usable(x.rain_mm)).map(x=>Number(x.rain_mm)));
  const today=dayKey(new Date()),yesterdayDate=new Date(today+"T12:00:00Z");yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1);const yesterday=dayKey(yesterdayDate);
  table.innerHTML=visible.length?visible.map(row=>{
   const value=usable(row.rain_mm)?Number(row.rain_mm):null,changeover=row.day==="2026-11-03",title=row.day===today?"Today":row.day===yesterday?"Yesterday":new Date(row.day+"T12:00:00Z").toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",weekday:"long"}),date=new Date(row.day+"T12:00:00Z").toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",year:"numeric"});
   return `<tr data-rain-day="${row.day}" class="${value===0?"rain-day-zero":value===null?"rain-day-missing":"rain-day-wet"}"><th scope="row"><span class="rain-day-primary">${title}${row.day===today?' <span class="rain-day-badge">so far</span>':""}</span><span class="rain-day-date">${date}${changeover?" · provisional":""}</span></th><td><span class="rain-day-total"><span class="rain-day-value">${value===null?"Unavailable":`<strong>${n(value)}</strong> <small>mm</small>`}</span>${value!==null&&value>0?`<span class="rain-day-bar" aria-hidden="true"><span style="width:${peak?Math.min(100,value/peak*100):0}%"></span></span>`:""}</span></td></tr>`;
  }).join(""):'<tr><td colspan="2">No daily totals are available.</td></tr>';
  if(button){button.hidden=dailyRows.length<=7;button.textContent=dailyExpanded?"Show fewer days":`Show more days (${dailyRows.length-7})`;button.setAttribute("aria-expanded",String(dailyExpanded));}
 }
 function renderChart(days){
  const rows=Array.isArray(days)?[...days].filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.day||"")).sort((a,b)=>a.day.localeCompare(b.day)):[];
  set("rainChartNote",rows.length?"Recorded daily totals · today is still in progress; gaps mean missing data"+(rows.some(row=>row.day==="2026-11-03")?" · Amber marks the gauge-change day (provisional total).":""):"No daily totals are available.");
  dailyRows=[...rows].reverse();renderDailyTable();
  const config={type:"bar",data:{labels:rows.map(x=>new Date(x.day+"T12:00:00Z").toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short"})),datasets:[{data:rows.map(x=>usable(x.rain_mm)?Number(x.rain_mm):null),backgroundColor:rows.map(row=>row.day==="2026-11-03"?"#f2bf67":"#7ca9ff"),borderRadius:5}]},options:{maintainAspectRatio:false,scales:{x:{grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:12}},y:{beginAtZero:true,grace:"10%",grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:"mm",color:"#9fb3c1"}}},plugins:{legend:{display:false}}}};
  if(chart){chart.data=config.data;chart.update();}else if(window.Chart)chart=new Chart($("rainDailyChart"),config);
 }
 async function load(){
  if(loading)return;loading=true;const button=$("rainRefresh");if(button){button.disabled=true;button.textContent="Refreshing…";}
  set("rainLoadStatus","Refreshing rainfall sources…");
  try{const live=get("/current").then(c=>{
     // Do not hold today's live status hostage to slow archive and event requests.
     const rs=rainState({}, {}, c),rate=rs.rate;
     const updated=c.received_at||(usable(c.epoch)?Number(c.epoch)*1000:null);
     set("rainUpdated",updated?`Station reading: ${dt(updated)} · Irish time${rs.reason==="stale_observation"?" · delayed":""}`:"Live station reading unavailable");
     set("rainNow",rate===null?"--":window.ParknacrossRainIntensity?.formatRate(rate)||`${n(rate)} mm/h`);
     set("rainToday",usable(correctedCurrentRain(c))?`${n(correctedCurrentRain(c))} mm`:"--");
     set("rainCondition",rainConditionText(rs));
     return c;
   });
   const results=await Promise.allSettled([get("/rain-summary"),get("/daily?days=30"),get("/history?hours=1"),live,get("/rain-events?days=30")]);
   const [s,d,h,c,e]=results.map(x=>x.status==="fulfilled"?x.value:{});
   const stamp=c.received_at||(usable(c.epoch)?Number(c.epoch)*1000:null);const liveCheck=rainState({}, {}, c);set("rainUpdated",stamp?`Station reading: ${dt(stamp)} · Irish time${liveCheck.reason==="stale_observation"?" · delayed":""}`:"Live station reading unavailable");
   const rs=rainState(s,h,c);
   const intensityTools = window.ParknacrossRainIntensity;
   const measuredIntensity = rs.rate !== null && rs.rate > 0
     ? intensityTools?.classify(rs.rate)?.label || "Rain measured"
     : null;
   const measuredRateText = intensityTools?.formatRate(rs.rate)
     || (rs.rate === null ? "Unavailable" : `${n(rs.rate)} mm/h`);
   set("rainCondition",rainConditionText(rs,measuredIntensity,measuredRateText));
   const piezoToday=$("rainPiezoToday");
   if(piezoToday){
     piezoToday.hidden=!usable(rs.piezoDailyMm);
     piezoToday.textContent=usable(rs.piezoDailyMm)
       ? `Piezo estimate today: ${n(rs.piezoDailyMm)} mm · ${usable(c?.rain_daily_mm)&&Number(c.rain_daily_mm)<0.05?"not confirmed by the dedicated rain gauge.":"independent of the dedicated rain-gauge total."}` 
       : "";
   }
   set("rainLoadStatus",results.some(x=>x.status==="rejected")?"Some rainfall sources are unavailable. Showing the readings that loaded successfully.":"");window.ParknacrossRainEvidence?.render(c,h.readings||[],s.last_measurable_rain?.received_at);
   const todayRain=correctedCurrentRain(c)??(usable(s.today_mm)?Number(s.today_mm):null);
   set("rainNow",rs.rate===null?"--":measuredRateText);set("rainToday",usable(todayRain)?`${n(todayRain)} mm`:"--");set("rainYesterday",`${n(s.yesterday_mm)} mm`);set("rain7",`${n(s.last_7_days_mm)} mm`);
   set("rain7Note",s.last_7_days_complete===false&&Array.isArray(s.last_7_days_missing_dates)&&s.last_7_days_missing_dates.length?`Observed total · ${s.last_7_days_missing_dates.length} missing calendar day${s.last_7_days_missing_dates.length===1?"":"s"}`:s.last_7_days_complete===true?"Complete 7-calendar-day total":"Available archive total");
   set("rainMonth",`${n(s.month_mm)} mm`);set("rainMonthDays",usable(s.month_rain_days)?`${Number(s.month_rain_days)} days with measurable rain`:"--");set("rainYear",`${n(s.year_mm)} mm`);set("dryDays",usable(s.consecutive_dry_days)?String(Number(s.consecutive_dry_days)):"--");
   set("dryDaysNote",s.consecutive_dry_days_complete===false?"0.0 mm days · includes today so far; count stops at first missing archive day":"0.0 mm calendar days · includes today so far");
   set("rainWettest",s.wettest_day&&usable(s.wettest_day.rain_mm)?`${n(s.wettest_day.rain_mm)} mm`:"--");set("rainWettestDate",s.wettest_day?.day?calendarLabel(s.wettest_day.day):"--");
   const detectedAt=rs.lastIncrease?new Date(rs.lastIncrease).toISOString():s.last_measurable_rain?.received_at;set("lastRain",detectedAt?"Last detected":results[0].status==="rejected"?"Unavailable":"None recorded");set("lastRainDate",dt(detectedAt));
   if(s.current_event){
     set("rainEventTotal",`${n(s.current_event.total_mm)} mm`);
     set("rainEventStart",`Since ${dt(s.current_event.started_at)}`);
     set("rainEventText",rs.isRaining?`Rain measured · ${n(s.current_event.total_mm)} mm in this event.`
       :rs.rainIndicatedNow?"Rain indicated by fresh station sensor evidence. WH40H current rate may not confirm ongoing rain."
       :rs.status==="unavailable"||rs.status==="rate_unavailable"?"Live rain status unavailable; showing recorded event total."
       :`No current rain confirmed · ${n(s.current_event.total_mm)} mm recorded in this event.`);
   }
   else if(rs.isRaining){set("rainEventTotal",usable(todayRain)?`${n(todayRain)} mm today`:"Rain measured");set("rainEventStart","Current WH40H rate");set("rainEventText",`Rain measured at ${n(rs.rate)} mm/h.`);}
   else if(rs.rainIndicatedNow){set("rainEventTotal","Possible rain now");set("rainEventStart","Fresh sensor indication");set("rainEventText","Fresh WS90 or WH40H readings suggest rain; WH40H rate may still show 0.0 mm/h.");}
   else if(rs.status==="possible"){set("rainEventTotal","Possible rain");set("rainEventStart","Weak WS90 signal");set("rainEventText","Rain may be falling, but the dedicated WH40H gauge is not confirming it. A weak piezo signal can also be caused by wind or vibration.");}
   else if(rs.status==="recent"){set("rainEventTotal","Rain recorded recently");set("rainEventStart","Within the last 15 min");set("rainEventText","Rain was measured recently, but rainfall now is unconfirmed.");}
   else if(rs.rate===null){set("rainEventTotal","Current rain status unavailable");set("rainEventStart","Live reading could not be checked");set("rainEventText","Current rain status cannot be confirmed. Showing available archive totals.");}
   else{set("rainEventTotal","No active event");set("rainEventStart","No current gauge rain measured");set("rainEventText","No current rainfall confirmed by the dedicated gauge.");}
   if(results[1].status==="fulfilled")renderChart(d.days);else{if(chart){chart.destroy();chart=null;}set("rainChartNote","Daily rainfall history is temporarily unavailable. Try Refresh rain data.");dailyRows=[];const more=$("rainDailyMore");if(more)more.hidden=true;const table=$("rainDailyTable");if(table)table.innerHTML='<tr><td colspan="2">Daily totals unavailable.</td></tr>';}
   set("rainEventCount",usable(e.event_count)?String(Number(e.event_count)):"--");
   set("largestRainEvent",e.largest_event&&usable(e.largest_event.total_mm)?`${n(e.largest_event.total_mm)} mm`:"--");
   set("largestRainEventDate",e.largest_event?.start_at?dt(e.largest_event.start_at):"--");
   set("peakRainEventRate",e.highest_rate_event&&usable(e.highest_rate_event.peak_rate_mm_h)?`${n(e.highest_rate_event.peak_rate_mm_h)} mm/h`:"--");
   set("peakRainEventDate",e.highest_rate_event?.start_at?dt(e.highest_rate_event.start_at):"--");
   set("longestDryInterval",usable(e.longest_dry_hours)?`${n(e.longest_dry_hours)} h`:"--");
   const list=$("rainEventsList");if(list){const events=Array.isArray(e.events)?e.events:[];list.innerHTML=events.length?events.slice(0,10).map(event=>{const mins=Number(event.duration_minutes||0),dur=mins>=60?`${Math.floor(mins/60)}h ${mins%60}m`:`${mins} min`;return `<article class="rain-event-row"><a href="${eventGraphLink(event)}">${dt(event.start_at)}${event.active?" · active":""}</a><strong>${n(event.total_mm)} mm</strong><span>${dur}</span><span>Peak ${n(event.peak_rate_mm_h)} mm/h</span></article>`;}).join(""):results[4].status==="rejected"?'<p class="info-note">Rain event history is temporarily unavailable.</p>':'<p class="info-note">No measurable rain events were identified in the last 30 days.</p>';}
  }catch(e){set("rainEventText","Rainfall summary temporarily unavailable.");set("rainLoadStatus","Rainfall sources could not be reached. Use Refresh rain data to try again.");}
  finally{loading=false;if(button){button.disabled=false;button.textContent="Refresh rain data";}}
 }
 document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());$("rainRefresh")?.addEventListener?.("click",load);$("rainDailyMore")?.addEventListener("click",()=>{dailyExpanded=!dailyExpanded;renderDailyTable();});load();(window.ParknacrossRefresh?.every || setInterval)(load,30*1000);});
})();

