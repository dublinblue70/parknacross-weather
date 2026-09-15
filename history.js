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

function dateLabel(value) {
  if (!value) return "--";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-IE", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}
function longDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  return date.toLocaleDateString("en-IE", { timeZone: TZ, weekday:"long", day:"numeric", month:"long", year:"numeric" });
}
function shortDate(day) {
  const date = new Date(`${day}T12:00:00Z`);
  return date.toLocaleDateString("en-IE", { timeZone: TZ, day: "numeric", month: "short" });
}
function localTime(row) {
  const d = new Date(row.received_at || Number(row.epoch) * 1000);
  return d.toLocaleTimeString("en-IE",{timeZone:TZ,hour:"2-digit",minute:"2-digit"});
}
async function getJSON(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

function createCharts() {
  Chart.defaults.color = "#bfd0e3";
  Chart.defaults.font.family = "Inter,system-ui,sans-serif";

  charts.temp = new Chart($("dailyTempChart"), {
    type: "line",
    data: {labels: [],datasets:[
      {label:"Daily high °C",data:[],borderColor:"#ff8d8d",backgroundColor:"#ff8d8d",borderWidth:2.2,pointRadius:1,tension:.25},
      {label:"Daily low °C",data:[],borderColor:"#74ddff",backgroundColor:"#74ddff",borderWidth:2.2,pointRadius:1,tension:.25}
    ]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{
      x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:10}},
      y:{grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:"°C",color:"#a8bfd4"}}
    },plugins:{legend:{position:"bottom"}}}
  });

  charts.rain = new Chart($("dailyRainChart"), {
    type:"bar",data:{labels:[],datasets:[{label:"Rainfall mm",data:[],backgroundColor:"#7ca9ff",borderRadius:6}]},
    options:{maintainAspectRatio:false,scales:{
      x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:10}},
      y:{beginAtZero:true,grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:"mm",color:"#a8bfd4"}}
    },plugins:{legend:{display:false}}}
  });

  charts.day = new Chart($("dayDetailChart"), {
    data:{labels:[],datasets:[
      {type:"line",label:"Temperature °C",data:[],borderColor:"#74ddff",backgroundColor:"#74ddff",borderWidth:2,pointRadius:0,tension:.25,yAxisID:"y"},
      {type:"bar",label:"Rain rate mm/h",data:[],backgroundColor:"rgba(124,169,255,.42)",borderRadius:3,yAxisID:"y1"}
    ]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{
      x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:8}},
      y:{grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:"°C",color:"#a8bfd4"}},
      y1:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},ticks:{color:"#a8bfd4"},title:{display:true,text:"mm/h",color:"#a8bfd4"}}
    },plugins:{legend:{position:"bottom"}}}
  });
}

function renderCharts() {
  const rows = dailyRows.slice(-selectedDays);
  const labels = rows.map(row => shortDate(row.day));
  charts.temp.data.labels = labels;
  charts.temp.data.datasets[0].data = rows.map(row => row.high_c);
  charts.temp.data.datasets[1].data = rows.map(row => row.low_c);
  charts.temp.update();

  charts.rain.data.labels = labels;
  charts.rain.data.datasets[0].data = rows.map(row => row.rain_mm);
  charts.rain.update();
}

function renderStats(stats) {
  set("historyMonthRain", `${n(stats.month_rain_mm)} mm`);
  set("historyMonthRainDays", `${stats.month_rain_days ?? 0} rain day${stats.month_rain_days === 1 ? "" : "s"}`);
  set("historyYearRain", `${n(stats.year_rain_mm)} mm`);
  set("historySince", dateLabel(stats.first_epoch));
  set("histSamples", stats.total_samples ?? "--");
  if (stats.wettest_day) {set("historyWettest", `${n(stats.wettest_day.rain_mm)} mm`);set("historyWettestDate", dateLabel(`${stats.wettest_day.day}T12:00:00Z`));}
  const r=stats.records||{};
  if(r.high_temperature){set("histAllHigh",`${n(r.high_temperature.value)} °C`);set("histAllHighDate",dateLabel(r.high_temperature.epoch));}
  if(r.low_temperature){set("histAllLow",`${n(r.low_temperature.value)} °C`);set("histAllLowDate",dateLabel(r.low_temperature.epoch));}
  if(r.peak_gust){set("histAllGust",`${n(r.peak_gust.value)} km/h`);set("histAllGustDate",dateLabel(r.peak_gust.epoch));}
  if(r.high_pressure){set("histAllPressureHigh",`${n(r.high_pressure.value)} hPa`);set("histAllPressureHighDate",dateLabel(r.high_pressure.epoch));}
  if(r.low_pressure){set("histAllPressureLow",`${n(r.low_pressure.value)} hPa`);set("histAllPressureLowDate",dateLabel(r.low_pressure.epoch));}
}

function cursorFromDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()};
}
function shiftMonth(cursor, delta) {
  const d=new Date(Date.UTC(cursor.year,cursor.month+delta,1,12));
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()};
}
function monthKey(cursor) { return `${cursor.year}-${String(cursor.month+1).padStart(2,"0")}`; }

function renderCalendar() {
  const host=$("archiveCalendar"); if(!host||!calendarCursor)return;
  host.innerHTML="";
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(name=>{
    const h=document.createElement("div");h.className="cal-head";h.textContent=name;host.appendChild(h);
  });
  const first=new Date(Date.UTC(calendarCursor.year,calendarCursor.month,1,12));
  const daysInMonth=new Date(Date.UTC(calendarCursor.year,calendarCursor.month+1,0,12)).getUTCDate();
  const offset=(first.getUTCDay()+6)%7;
  set("calendarTitle",first.toLocaleDateString("en-IE",{timeZone:"UTC",month:"long",year:"numeric"}));

  for(let i=0;i<offset;i++){const blank=document.createElement("button");blank.type="button";blank.className="archive-day empty";blank.disabled=true;host.appendChild(blank);}
  for(let day=1;day<=daysInMonth;day++){
    const key=`${monthKey(calendarCursor)}-${String(day).padStart(2,"0")}`;
    const row=dailyMap.get(key);
    const button=document.createElement("button");button.type="button";
    button.className=`archive-day ${row?"has-data":"no-data"}${key===selectedArchiveDay?" active":""}`;
    button.disabled=!row;
    const rain=usable(row?.rain_mm)?`${n(row.rain_mm)} mm`:"";
    const range=usable(row?.high_c)&&usable(row?.low_c)?`${n(row.low_c)}°–${n(row.high_c)}°`:"";
    button.innerHTML=`<span class="day-num">${day}</span><small>${[range,rain].filter(Boolean).join("<br>")||"No data"}</small>`;
    if(row)button.addEventListener("click",()=>loadDay(key));
    host.appendChild(button);
  }
}

function dayStory(summary) {
  if(!summary)return"Daily summary unavailable.";
  const parts=[];
  if(usable(summary.high_c)&&usable(summary.low_c))parts.push(`Temperatures ranged from ${n(summary.low_c)}°C to ${n(summary.high_c)}°C.`);
  if(usable(summary.rain_mm))parts.push(Number(summary.rain_mm)>0?`${n(summary.rain_mm)} mm of rain was recorded.`:"No measurable rain was recorded.");
  if(usable(summary.peak_gust_kmh))parts.push(`The strongest gust reached ${n(summary.peak_gust_kmh)} km/h.`);
  if(usable(summary.lightning_strikes)&&Number(summary.lightning_strikes)>0)parts.push(`${Math.round(Number(summary.lightning_strikes))} lightning strike${Number(summary.lightning_strikes)===1?" was":"s were"} detected.`);
  return parts.join(" ");
}

async function loadDay(day) {
  selectedArchiveDay=day;renderCalendar();
  set("dayDetailTitle",longDay(day));set("dayDetailStory","Loading archived observations…");
  try{
    const data=await getJSON(`${API_BASE}/day?date=${encodeURIComponent(day)}`);
    const s=data.summary||{}, rows=Array.isArray(data.readings)?data.readings:[];
    set("dayDetailStory",data.available?dayStory(s):"No archived observations are available for this date.");
    set("dayDetailCount",`${(s.sample_count??rows.length??0).toLocaleString("en-IE")} observations`);
    set("dayHigh",usable(s.high_c)?`${n(s.high_c)} °C`:"--");set("dayLow",usable(s.low_c)?`${n(s.low_c)} °C`:"--");
    set("dayRain",usable(s.rain_mm)?`${n(s.rain_mm)} mm`:"--");set("dayGust",usable(s.peak_gust_kmh)?`${n(s.peak_gust_kmh)} km/h`:"--");
    set("dayPressure",usable(s.pressure_low_hpa)&&usable(s.pressure_high_hpa)?`${n(s.pressure_low_hpa)}–${n(s.pressure_high_hpa)} hPa`:"--");
    const strikes=usable(s.lightning_strikes)?Number(s.lightning_strikes):0;
    set("dayLightning",strikes>0?`${Math.round(strikes)} strike${strikes===1?"":"s"}`:"None");
    set("dayLightningNote",strikes>0&&usable(s.lightning_nearest_km)?`Nearest ${n(s.lightning_nearest_km,0)} km`:"");
    charts.day.data.labels=rows.map(localTime);
    charts.day.data.datasets[0].data=rows.map(row=>row.temperature_c);
    charts.day.data.datasets[1].data=rows.map(row=>row.rain_rate_mm_h);
    charts.day.update();
  }catch(error){
    console.error("Day detail:",error);set("dayDetailStory","This archived day could not be loaded.");
  }
}

function renderEvents(events) {
  const host=$("weatherDiary");if(!host)return;host.innerHTML="";
  if(!events.length){host.innerHTML='<p class="info-note">No notable events have been identified yet. The diary will build automatically as the archive grows.</p>';return;}
  events.slice(0,40).forEach(event=>{
    const article=document.createElement("article");article.className="weather-event";
    const time=document.createElement("time");time.dateTime=event.day||event.received_at||"";time.textContent=event.day?dateLabel(`${event.day}T12:00:00Z`):dateLabel(event.received_at);
    const copy=document.createElement("div");const strong=document.createElement("strong");strong.textContent=event.title||"Weather event";const small=document.createElement("small");small.textContent=event.detail||"";copy.append(strong,small);
    const type=document.createElement("span");type.className="event-type";type.textContent=event.type||"weather";
    article.append(time,copy,type);host.appendChild(article);
  });
}

async function loadHistory() {
  try {
    const [daily, stats, events] = await Promise.all([
      getJSON(`${API_BASE}/daily?days=3660`),
      getJSON(`${API_BASE}/stats`),
      getJSON(`${API_BASE}/events`)
    ]);
    dailyRows = Array.isArray(daily.days) ? daily.days : [];
    dailyMap = new Map(dailyRows.map(row=>[row.day,row]));
    renderCharts();renderStats(stats);renderEvents(Array.isArray(events.events)?events.events:[]);
    const latest=dailyRows.length?dailyRows[dailyRows.length-1].day:null;
    if(latest){calendarCursor=cursorFromDay(latest);selectedArchiveDay=latest;renderCalendar();loadDay(latest);}
  } catch (error) { console.error("History:", error); }
}

document.addEventListener("DOMContentLoaded", () => {
  createCharts();set("year", new Date().getFullYear());
  document.querySelectorAll("[data-days]").forEach(button => button.addEventListener("click",()=>{
    selectedDays=Number(button.dataset.days);document.querySelectorAll("[data-days]").forEach(b=>b.classList.toggle("active",b===button));renderCharts();
  }));
  $("calendarPrev")?.addEventListener("click",()=>{calendarCursor=shiftMonth(calendarCursor,-1);renderCalendar();});
  $("calendarNext")?.addEventListener("click",()=>{calendarCursor=shiftMonth(calendarCursor,1);renderCalendar();});
  loadHistory();
});
