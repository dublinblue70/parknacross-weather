const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
const $ = id => document.getElementById(id);
const set = (id, value) => { const e = $(id); if (e) e.textContent = value; };
const usable = v => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const n = (v, d = 1) => usable(v) ? Number(v).toFixed(d) : "--";
const TZ = "Europe/Dublin";

let selectedDays = 30;
let dailyRows = [];
let dailyMap = new Map();
let charts = {};
let calendarCursor = null;
let selectedArchiveDay = null;
let dayLoadSequence = 0;
let coverageRows = new Map();
let coverageSummary = null;

function dateLabel(value) {
  if (!value) return "--";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-IE", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}
function longDay(day) { const date=new Date(`${day}T12:00:00Z`); return date.toLocaleDateString("en-IE",{timeZone:TZ,weekday:"long",day:"numeric",month:"long",year:"numeric"}); }
function shortDate(day) { const date=new Date(`${day}T12:00:00Z`); return date.toLocaleDateString("en-IE",{timeZone:TZ,day:"numeric",month:"short"}); }
function localTime(row) { const d=new Date(row.received_at||Number(row.epoch)*1000); return d.toLocaleTimeString("en-IE",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}); }
async function getJSON(url) { const response=await fetch(url,{cache:"no-store"}); if(!response.ok)throw new Error(`HTTP ${response.status}`); const data=await response.json(); if(data?.error)throw new Error(data.error); return data; }

function createDayChart() {
  const canvas=$("dayDetailChart");
  if(!canvas)return null;
  const existing=Chart.getChart?.(canvas);
  if(existing)existing.destroy();
  return new Chart(canvas,{type:"line",data:{labels:[],datasets:[{type:"line",label:"Temperature °C",data:[],borderColor:"#74ddff",backgroundColor:"#74ddff",borderWidth:2,pointRadius:0,tension:.25,yAxisID:"y"},{type:"bar",label:"Rain rate mm/h",data:[],backgroundColor:"rgba(124,169,255,.42)",borderRadius:3,yAxisID:"y1"}]},options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:8}},y:{grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:"°C",color:"#a8bfd4"}},y1:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},ticks:{color:"#a8bfd4"},title:{display:true,text:"mm/h",color:"#a8bfd4"}}},plugins:{legend:{position:"bottom"}}}});
}

function createCharts() {
  Chart.defaults.color="#bfd0e3"; Chart.defaults.font.family="Inter,system-ui,sans-serif";
  charts.temp=new Chart($("dailyTempChart"),{type:"line",data:{labels:[],datasets:[{label:"Daily high °C",data:[],borderColor:"#ff8d8d",backgroundColor:"#ff8d8d",borderWidth:2.2,pointRadius:1,tension:.25},{label:"Daily low °C",data:[],borderColor:"#74ddff",backgroundColor:"#74ddff",borderWidth:2.2,pointRadius:1,tension:.25}]},options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:10}},y:{grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:"°C",color:"#a8bfd4"}}},plugins:{legend:{position:"bottom"}}}});
  charts.rain=new Chart($("dailyRainChart"),{type:"bar",data:{labels:[],datasets:[{label:"Rainfall mm",data:[],backgroundColor:"#7ca9ff",borderRadius:6}]},options:{maintainAspectRatio:false,scales:{x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:10}},y:{beginAtZero:true,grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:"mm",color:"#a8bfd4"}}},plugins:{legend:{display:false}}}});
  charts.day=createDayChart();
}
function renderCharts(){const rows=dailyRows.slice(-selectedDays),labels=rows.map(row=>shortDate(row.day));charts.temp.data.labels=labels;charts.temp.data.datasets[0].data=rows.map(row=>row.high_c);charts.temp.data.datasets[1].data=rows.map(row=>row.low_c);charts.temp.update();charts.rain.data.labels=labels;charts.rain.data.datasets[0].data=rows.map(row=>row.rain_mm);charts.rain.update();}
function renderStats(stats){set("historyMonthRain",`${n(stats.month_rain_mm)} mm`);set("historyMonthRainDays",`${stats.month_rain_days??0} rain day${stats.month_rain_days===1?"":"s"}`);set("historyYearRain",`${n(stats.year_rain_mm)} mm`);set("historySince",dateLabel(stats.first_epoch));set("histSamples",stats.total_samples??"--");if(stats.wettest_day){set("historyWettest",`${n(stats.wettest_day.rain_mm)} mm`);set("historyWettestDate",dateLabel(`${stats.wettest_day.day}T12:00:00Z`));}const r=stats.records||{};if(r.high_temperature){set("histAllHigh",`${n(r.high_temperature.value)} °C`);set("histAllHighDate",dateLabel(r.high_temperature.epoch));}if(r.low_temperature){set("histAllLow",`${n(r.low_temperature.value)} °C`);set("histAllLowDate",dateLabel(r.low_temperature.epoch));}if(r.peak_gust){set("histAllGust",`${n(r.peak_gust.value)} km/h`);set("histAllGustDate",dateLabel(r.peak_gust.epoch));}if(r.high_pressure){set("histAllPressureHigh",`${n(r.high_pressure.value)} hPa`);set("histAllPressureHighDate",`Verified record · ${dateLabel(r.high_pressure.epoch)}`);}else{set("histAllPressureHigh","Building…");set("histAllPressureHighDate","Awaiting verified sea-level reading");}if(r.low_pressure){set("histAllPressureLow",`${n(r.low_pressure.value)} hPa`);set("histAllPressureLowDate",`Verified record · ${dateLabel(r.low_pressure.epoch)}`);}else{set("histAllPressureLow","Building…");set("histAllPressureLowDate","Awaiting verified sea-level reading");}}
function cursorFromDay(day){const d=new Date(`${day}T12:00:00Z`);return{year:d.getUTCFullYear(),month:d.getUTCMonth()};}
function shiftMonth(cursor,delta){const d=new Date(Date.UTC(cursor.year,cursor.month+delta,1,12));return{year:d.getUTCFullYear(),month:d.getUTCMonth()};}
function monthKey(cursor){return`${cursor.year}-${String(cursor.month+1).padStart(2,"0")}`;}
function lastSunday(year,month){const d=new Date(Date.UTC(year,month+1,0,12));d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);}
function todayKey(){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),m=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${m.year}-${m.month}-${m.day}`;}
function expectedSamples(day){if(day===todayKey()){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),m=Object.fromEntries(parts.map(p=>[p.type,p.value])),minutes=Number(m.hour||0)*60+Number(m.minute||0);return Math.max(1,Math.floor(minutes/5)+1);}const y=Number(day.slice(0,4));if(day===lastSunday(y,2))return276;if(day===lastSunday(y,9))return300;return288;}

function renderHeatmap(){
  const host=$("archiveHeatmap");if(!host)return;host.innerHTML="";
  const end=new Date(`${todayKey()}T12:00:00Z`),start=new Date(end);start.setUTCDate(start.getUTCDate()-364);
  const weekday=(start.getUTCDay()+6)%7;start.setUTCDate(start.getUTCDate()-weekday);
  let complete=0,populated=0,totalExpected=0,totalActual=0;
  for(let i=0;i<371;i++){
    const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);const day=d.toISOString().slice(0,10);
    if(day>todayKey())break;
    const row=dailyMap.get(day),coverage=coverageRows.get(day);
    const cell=document.createElement(row?"button":"span");
    if(row)cell.type="button";
    cell.className="heatmap-day";
    if(row&&coverage&&usable(coverage.actual_slots)){
      const expected=Number(coverage.expected_slots||expectedSamples(day)),actual=Number(coverage.actual_slots),pct=usable(coverage.coverage_percent)?Number(coverage.coverage_percent):Math.min(100,(actual/expected)*100);populated++;totalExpected+=expected;totalActual+=actual;if(pct>=98)complete++;
      const level=pct>=98?4:pct>=90?3:pct>=50?2:1;cell.classList.add("has-data",`level-${level}`);cell.title=`${longDay(day)} · ${actual}/${expected} unique five-minute slots captured · ${pct.toFixed(1)}% coverage`;cell.setAttribute("aria-label",cell.title);cell.addEventListener("click",()=>openArchiveDay(day));
    }else if(row){cell.classList.add("has-data","level-1");cell.title=`${longDay(day)} · coverage calculation unavailable`;cell.setAttribute("aria-label",cell.title);cell.addEventListener("click",()=>openArchiveDay(day));}
    else {cell.title=`${longDay(day)} · no archived data`;cell.setAttribute("aria-hidden","true");}
    if(day===todayKey())cell.classList.add("current");if(day===selectedArchiveDay)cell.classList.add("selected");host.appendChild(cell);
  }
  const pct=usable(coverageSummary?.coverage_percent)?Number(coverageSummary.coverage_percent):(totalExpected?Math.min(100,totalActual/totalExpected*100):null);
  set("heatmapSummary",populated?`${populated} archived day${populated===1?"":"s"} in view · ${complete} at ≥98% coverage${pct!==null?` · ${pct.toFixed(1)}% of unique five-minute slots captured since archiving began`:""}.` : "The completeness map will fill as the archive grows.");
}

function renderCalendar(){const host=$("archiveCalendar");if(!host||!calendarCursor)return;host.innerHTML="";["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(name=>{const h=document.createElement("div");h.className="cal-head";h.textContent=name;host.appendChild(h);});const first=new Date(Date.UTC(calendarCursor.year,calendarCursor.month,1,12)),daysInMonth=new Date(Date.UTC(calendarCursor.year,calendarCursor.month+1,0,12)).getUTCDate(),offset=(first.getUTCDay()+6)%7;set("calendarTitle",first.toLocaleDateString("en-IE",{timeZone:"UTC",month:"long",year:"numeric"}));for(let i=0;i<offset;i++){const blank=document.createElement("span");blank.className="archive-day empty";blank.setAttribute("aria-hidden","true");host.appendChild(blank);}for(let day=1;day<=daysInMonth;day++){const key=`${monthKey(calendarCursor)}-${String(day).padStart(2,"0")}`,row=dailyMap.get(key),cell=document.createElement(row?"button":"span");if(row)cell.type="button";cell.className=`archive-day ${row?"has-data":"no-data"}${key===selectedArchiveDay?" active":""}`;const rain=usable(row?.rain_mm)?`${n(row.rain_mm)} mm`:"",range=usable(row?.high_c)&&usable(row?.low_c)?`${n(row.low_c)}°–${n(row.high_c)}°`:"";cell.innerHTML=`<span class="day-num">${day}</span><small>${[range,rain].filter(Boolean).join("<br>")||"No data"}</small>`;if(row){cell.setAttribute("aria-label",`${longDay(key)}${range?` · ${range}`:""}${rain?` · ${rain} rain`:""}`);cell.addEventListener("click",()=>openArchiveDay(key));}else cell.setAttribute("aria-hidden","true");host.appendChild(cell);}}
function dayStory(summary){if(!summary)return"Daily summary unavailable.";const parts=[];if(usable(summary.high_c)&&usable(summary.low_c))parts.push(`Temperatures ranged from ${n(summary.low_c)}°C to ${n(summary.high_c)}°C.`);if(usable(summary.rain_mm))parts.push(Number(summary.rain_mm)>0?`${n(summary.rain_mm)} mm of rain was recorded.`:"No measurable rain was recorded.");if(usable(summary.peak_gust_kmh))parts.push(`The strongest gust reached ${n(summary.peak_gust_kmh)} km/h.`);if(usable(summary.lightning_strikes)&&Number(summary.lightning_strikes)>0)parts.push(`${Math.round(Number(summary.lightning_strikes))} lightning strike${Number(summary.lightning_strikes)===1?" was":"s were"} detected.`);return parts.join(" ");}
function openArchiveDay(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||""))){
    set("archiveSearchStatus","Choose a valid archive date.");
    return;
  }
  selectedArchiveDay=day;
  calendarCursor=cursorFromDay(day);
  renderCalendar();
  renderHeatmap();
  const input=$("archiveDateSearch");
  if(input)input.value=day;
  set("archiveSearchStatus",`Loading ${longDay(day)}…`);
  loadDay(day);
  $("dayDetailTitle")?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
}
function clearDayChart(message=""){
  const chart=charts.day;
  if(chart){
    chart.data.labels=[];
    chart.data.datasets[0].data=[];
    chart.data.datasets[1].data=[];
    chart.update("none");
  }
  const empty=$("dayChartEmpty");
  if(empty){empty.textContent=message;empty.hidden=!message;}
}
function renderDayChart(rows){
  const validRows=(Array.isArray(rows)?rows:[])
    .filter(row=>Number.isFinite(Number(row?.epoch)) || (row?.received_at && !Number.isNaN(new Date(row.received_at).getTime())))
    .sort((a,b)=>{
      const ta=Number.isFinite(Number(a?.epoch))?Number(a.epoch)*1000:new Date(a?.received_at||0).getTime();
      const tb=Number.isFinite(Number(b?.epoch))?Number(b.epoch)*1000:new Date(b?.received_at||0).getTime();
      return ta-tb;
    });
  const plottable=validRows.filter(row=>usable(row.temperature_c)||usable(row.rain_rate_mm_h));
  if(!plottable.length){
    clearDayChart(validRows.length?"Detailed readings exist for this date, but there are no temperature or rain-rate values to draw.":"A daily summary is available, but detailed five-minute readings are not available for this date.");
    return 0;
  }
  if(charts.day){try{charts.day.destroy();}catch(_){}}
  charts.day=createDayChart();
  const chart=charts.day;
  if(!chart){return 0;}
  chart.data.labels=plottable.map(localTime);
  chart.data.datasets[0].data=plottable.map(row=>usable(row.temperature_c)?Number(row.temperature_c):null);
  chart.data.datasets[1].data=plottable.map(row=>usable(row.rain_rate_mm_h)?Number(row.rain_rate_mm_h):null);
  const empty=$("dayChartEmpty");
  if(empty){empty.textContent="";empty.hidden=true;}
  chart.update("none");
  requestAnimationFrame(()=>{chart.resize();chart.update("none");});
  return plottable.length;
}
async function loadDay(day){
  const loadId=++dayLoadSequence;
  selectedArchiveDay=day;
  renderCalendar();
  renderHeatmap();
  set("dayDetailTitle",longDay(day));
  set("dayDetailStory","Loading archived observations…");
  clearDayChart("");
  try{
    const data=await getJSON(`${API_BASE}/day?date=${encodeURIComponent(day)}`);
    if(loadId!==dayLoadSequence || day!==selectedArchiveDay)return;
    const s=data.summary||{},rows=Array.isArray(data.readings)?data.readings:[];
    const detailCanvas=$("dayDetailChart");
    if(detailCanvas)detailCanvas.setAttribute("aria-label",`Weather observations for ${longDay(day)}`);
    set("dayDetailStory",data.available?dayStory(s):"No archived observations are available for this date.");
    set("dayDetailCount",`${(s.sample_count??rows.length??0).toLocaleString("en-IE")} observations`);
    set("dayHigh",usable(s.high_c)?`${n(s.high_c)} °C`:"--");
    set("dayLow",usable(s.low_c)?`${n(s.low_c)} °C`:"--");
    set("dayRain",usable(s.rain_mm)?`${n(s.rain_mm)} mm`:"--");
    set("dayGust",usable(s.peak_gust_kmh)?`${n(s.peak_gust_kmh)} km/h`:"--");
    set("dayPressure",usable(s.pressure_low_hpa)&&usable(s.pressure_high_hpa)?`${n(s.pressure_low_hpa)}–${n(s.pressure_high_hpa)} hPa`:"--");
    const strikes=usable(s.lightning_strikes)?Number(s.lightning_strikes):0;
    set("dayLightning",strikes>0?`${Math.round(strikes)} strike${strikes===1?"":"s"}`:"None");
    set("dayLightningNote",strikes>0&&usable(s.lightning_nearest_km)?`Nearest ${n(s.lightning_nearest_km,0)} km`:"");
    const plotted=renderDayChart(rows);
    if(data.available){
      set("archiveSearchStatus",plotted?`Showing ${longDay(day)} · ${plotted.toLocaleString("en-IE")} plotted observations.`:`Showing ${longDay(day)} · daily summary available; detailed graph unavailable.`);
    }else{
      set("archiveSearchStatus",`No stored observations are available for ${longDay(day)}.`);
      clearDayChart("A daily summary is available, but detailed five-minute readings are not available for this date.");
    }
  }catch(error){
    if(loadId!==dayLoadSequence || day!==selectedArchiveDay)return;
    console.error("Day detail:",error);
    set("dayDetailStory","This archived day could not be loaded.");
    set("archiveSearchStatus",`Could not load ${longDay(day)}. Please try another archived date.`);
    clearDayChart("The observation graph could not be loaded for this date.");
  }
}
function renderEvents(events){const host=$("weatherDiary");if(!host)return;host.innerHTML="";if(!events.length){host.innerHTML='<p class="info-note">No notable events have been identified yet. The diary will build automatically as the archive grows.</p>';return;}events.slice(0,40).forEach(event=>{const article=document.createElement("article");article.className="weather-event";if(event.day&&dailyMap.has(event.day)){article.tabIndex=0;article.setAttribute('role','button');article.title='Open this day in the archive';const open=()=>openArchiveDay(event.day);article.addEventListener('click',open);article.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});}const time=document.createElement("time");time.dateTime=event.day||event.received_at||"";time.textContent=event.day?dateLabel(`${event.day}T12:00:00Z`):dateLabel(event.received_at);const copy=document.createElement("div"),strong=document.createElement("strong");strong.textContent=event.title||"Weather event";const small=document.createElement("small");small.textContent=event.detail||"";copy.append(strong,small);const type=document.createElement("span");type.className="event-type";type.textContent=event.type||"weather";article.append(time,copy,type);host.appendChild(article);});}
async function loadHistory(){try{const[daily,stats,events,coverage]=await Promise.all([getJSON(`${API_BASE}/daily?days=3660`),getJSON(`${API_BASE}/stats`),getJSON(`${API_BASE}/events`),getJSON(`${API_BASE}/coverage?days=371`)]);dailyRows=Array.isArray(daily.days)?daily.days:[];dailyMap=new Map(dailyRows.map(row=>[row.day,row]));coverageRows=new Map((Array.isArray(coverage.days)?coverage.days:[]).map(row=>[row.day,row]));coverageSummary=coverage.summary||null;renderCharts();renderStats(stats);renderEvents(Array.isArray(events.events)?events.events:[]);renderHeatmap();const latest=dailyRows.length?dailyRows[dailyRows.length-1].day:null;if(latest){const input=$("archiveDateSearch");if(input){input.min=dailyRows[0].day;input.max=todayKey();input.value=latest;}calendarCursor=cursorFromDay(latest);selectedArchiveDay=latest;renderCalendar();loadDay(latest);}}catch(error){console.error("History:",error);set("archiveSearchStatus","Archive temporarily unavailable.");}}

document.addEventListener("DOMContentLoaded",()=>{createCharts();set("year",new Date().getFullYear());document.querySelectorAll("[data-days]").forEach(button=>button.addEventListener("click",()=>{selectedDays=Number(button.dataset.days);document.querySelectorAll("[data-days]").forEach(b=>b.classList.toggle("active",b===button));renderCharts();}));$("calendarPrev")?.addEventListener("click",()=>{calendarCursor=shiftMonth(calendarCursor,-1);renderCalendar();});$("calendarNext")?.addEventListener("click",()=>{calendarCursor=shiftMonth(calendarCursor,1);renderCalendar();});$("archiveDateButton")?.addEventListener("click",()=>{const day=$("archiveDateSearch")?.value;if(day)openArchiveDay(day);});$("archiveDateSearch")?.addEventListener("change",event=>{const day=event.currentTarget.value;if(day)openArchiveDay(day);});$("archiveDateSearch")?.addEventListener("keydown",event=>{if(event.key==='Enter'){event.preventDefault();const day=event.currentTarget.value;if(day)openArchiveDay(day);}});loadHistory();});
