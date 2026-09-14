(() => {
 const cfg=window.PARKNACROSS_CONFIG||{},API=cfg.apiBase,$=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e)e.textContent=v},n=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):"--";
 const dt=v=>v?new Date(v).toLocaleString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"--";
 async function get(p){const r=await fetch(`${API}${p}`,{cache:"no-store"});if(!r.ok)throw new Error();return r.json()}
 const rainState=(summary,history,current)=>{
  const rate=Number(current?.rain_rate_mm_h??summary?.current_rate_mm_h??0),rows=Array.isArray(history?.readings)?history.readings:[],now=current?.received_at?new Date(current.received_at).getTime():(Number(current?.epoch||0)*1000||Date.now());let lastIncrease=null,prev=null;
  for(const row of rows){const t=row?.received_at?new Date(row.received_at).getTime():Number(row?.epoch||0)*1000,total=Number(row?.rain_daily_mm);if(!Number.isFinite(t)||!Number.isFinite(total))continue;if(prev&&total>=prev.total+0.05)lastIncrease=t;prev={t,total};}
  const currentTotal=Number(current?.rain_daily_mm);if(prev&&Number.isFinite(currentTotal)&&currentTotal>=prev.total+0.05)lastIncrease=now;if(rate>0)lastIncrease=now;
  const age=lastIncrease?Math.max(0,now-lastIncrease):Infinity;return{rate,isRaining:rate>0||age<=5*60*1000,rainRecently:rate<=0&&age>5*60*1000&&age<=15*60*1000};
 };
 document.addEventListener("DOMContentLoaded",async()=>{set("year",new Date().getFullYear());try{const [s,d,h,c]=await Promise.all([get("/rain-summary"),get("/daily?days=30"),get("/history?hours=1"),get("/current")]);const rs=rainState(s,h,c);
 set("rainNow",rs.isRaining&&rs.rate<=0?"Rain detected":`${n(rs.rate)} mm/h`);set("rainToday",`${n(c?.rain_daily_mm??s.today_mm)} mm`);set("rainYesterday",`${n(s.yesterday_mm)} mm`);set("rain7",`${n(s.last_7_days_mm)} mm`);
 set("rainMonth",`${n(s.month_mm)} mm`);set("rainMonthDays",`${s.month_rain_days||0} rain days`);set("rainYear",`${n(s.year_mm)} mm`);set("dryDays",String(s.consecutive_dry_days??"--"));
 set("rainWettest",s.wettest_day?`${n(s.wettest_day.rain_mm)} mm`:"--");set("rainWettestDate",s.wettest_day?.day||"--");
 set("lastRain",s.last_measurable_rain?"Rain detected":"No rain yet");set("lastRainDate",dt(s.last_measurable_rain?.received_at));
 if(s.current_event){set("rainEventTotal",`${n(s.current_event.total_mm)} mm`);set("rainEventStart",`Since ${dt(s.current_event.started_at)}`);set("rainEventText",`Active rain event · ${n(s.current_event.total_mm)} mm accumulated.`)}
 else if(rs.isRaining){set("rainEventTotal",`${n(s.today_mm)} mm today`);set("rainEventStart","Rain detected recently");set("rainEventText",rs.rate>0?`Rain is falling at ${n(rs.rate)} mm/h.`:"Rain has been detected within the last few minutes, although the instantaneous WS90 rate is currently 0.0 mm/h.");}
 else if(rs.rainRecently){set("rainEventTotal","Rain recently");set("rainEventStart","Within the last 15 min");set("rainEventText","Rain was detected recently at Parknacross.");}
 else{set("rainEventTotal","No active event");set("rainEventStart","Station currently dry");set("rainEventText","No measurable rain has been detected recently at Parknacross.");}
 const rows=d.days||[];new Chart($("rainDailyChart"),{type:"bar",data:{labels:rows.map(x=>new Date(x.day+"T12:00:00").toLocaleDateString("en-IE",{timeZone:"Europe/Dublin",day:"numeric",month:"short"})),datasets:[{data:rows.map(x=>x.rain_mm),backgroundColor:"#7ca9ff",borderRadius:5}]},options:{maintainAspectRatio:false,scales:{x:{grid:{color:"transparent"},ticks:{color:"#9fb3c1",maxTicksLimit:12}},y:{beginAtZero:true,grid:{color:"rgba(174,210,232,.09)"},ticks:{color:"#9fb3c1"},title:{display:true,text:"mm",color:"#9fb3c1"}}},plugins:{legend:{display:false}}}});}catch(e){set("rainEventText","Rainfall summary temporarily unavailable.");}
 if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});});})();