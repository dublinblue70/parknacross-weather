const API_BASE = "https://parknacross-weather.dave-s-carter.workers.dev";
const $ = id => document.getElementById(id);
const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const usable = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const num = (value, digits = 1) => usable(value) ? Number(value).toFixed(digits) : "--";
const TIME_ZONE = "Europe/Dublin";
let currentTodayRows = [];
let currentTodayKey = null;
let latestShareRow = null;

function readingDate(row) {
  if (row?.received_at) { const d = new Date(row.received_at); if (!Number.isNaN(d.getTime())) return d; }
  if (usable(row?.epoch)) { const d = new Date(Number(row.epoch) * 1000); if (!Number.isNaN(d.getTime())) return d; }
  return null;
}

function localDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = type => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function longDate(date) {
  return new Intl.DateTimeFormat("en-IE", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

function shortTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date);
}

function exactDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-IE", { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function getJSON(path) {
  const response = await fetch(`${API_BASE}${path}`, { cache: "default" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

function maxReading(rows, field) { return rows.reduce((best, row) => !usable(row[field]) ? best : (!best || Number(row[field]) > Number(best[field]) ? row : best), null); }
function minReading(rows, field) { return rows.reduce((best, row) => !usable(row[field]) ? best : (!best || Number(row[field]) < Number(best[field]) ? row : best), null); }
function average(rows, field) { const values = rows.map(row => Number(row[field])).filter(Number.isFinite); return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null; }
function rainTotal(rows) { const values = rows.map(row => Number(row.rain_daily_mm)).filter(Number.isFinite); return values.length ? Math.max(...values) : null; }

function metrics(rows) {
  return {
    high: maxReading(rows, "temperature_c"), low: minReading(rows, "temperature_c"), gust: maxReading(rows, "wind_gust_kmh"),
    uv: maxReading(rows, "uv_index"), solar: maxReading(rows, "solar_w_m2"), pressureHigh: maxReading(rows, "pressure_hpa"), pressureLow: minReading(rows, "pressure_hpa"),
    rain: rainTotal(rows), avgHumidity: average(rows, "humidity"), avgWind: average(rows, "wind_speed_kmh"), avgPressure: average(rows, "pressure_hpa"),
    count: rows.length, latest: rows.length ? readingDate(rows[rows.length - 1]) : null
  };
}

function temperatureWord(high) { if (!usable(high)) return "mixed"; const v=Number(high); return v>=23?"warm":v>=17?"mild":v>=11?"cool":"cold"; }
function rainPhrase(rain) { if (!usable(rain)) return "with rainfall data still building"; const v=Number(rain); if(v<0.1)return"and dry so far"; if(v<1)return`with just ${v.toFixed(1)} mm of rain`; if(v<5)return`with ${v.toFixed(1)} mm of rain`; if(v<15)return`with a fairly wet ${v.toFixed(1)} mm recorded`; return`with a wet ${v.toFixed(1)} mm recorded`; }
function windPhrase(gust) { if (!usable(gust)) return ""; const v=Number(gust); if(v<20)return"Winds have generally been light"; if(v<35)return"There has been a noticeable breeze"; if(v<50)return"It has been breezy at times"; if(v<70)return"It has been windy, with some strong gusts"; return"It has been very windy, with strong gusts"; }
function buildStory(m) {
  const high=m.high?.temperature_c, low=m.low?.temperature_c, gust=m.gust?.wind_gust_kmh;
  const first=`A ${temperatureWord(high)} day so far ${rainPhrase(m.rain)}.`;
  const temp=usable(high)&&usable(low)?`Temperatures have ranged from ${Number(low).toFixed(1)}°C to ${Number(high).toFixed(1)}°C.`:"Temperature observations are still building.";
  const wind=windPhrase(gust); const windSentence=wind?`${wind}${usable(gust)?`, reaching ${Number(gust).toFixed(1)} km/h`:""}.`:"";
  const uv=usable(m.uv?.uv_index)?`The highest UV index recorded so far is ${Number(m.uv.uv_index).toFixed(1)}.`:"";
  return [first,temp,windSentence,uv].filter(Boolean).join(" ");
}

function renderToday(m) {
  set("dayStory", buildStory(m));
  set("todayHigh", usable(m.high?.temperature_c) ? `${num(m.high.temperature_c)} °C` : "--"); set("todayHighTime", m.high ? shortTime(readingDate(m.high)) : "--");
  set("todayLow", usable(m.low?.temperature_c) ? `${num(m.low.temperature_c)} °C` : "--"); set("todayLowTime", m.low ? shortTime(readingDate(m.low)) : "--");
  set("todayRain", usable(m.rain) ? `${num(m.rain)} mm` : "--");
  set("todayGust", usable(m.gust?.wind_gust_kmh) ? `${num(m.gust.wind_gust_kmh)} km/h` : "--"); set("todayGustTime", m.gust ? shortTime(readingDate(m.gust)) : "--");
  set("todayHumidity", usable(m.avgHumidity) ? `${Math.round(m.avgHumidity)}%` : "--");
  set("todayUv", usable(m.uv?.uv_index) ? num(m.uv.uv_index) : "--"); set("todayUvTime", m.uv ? shortTime(readingDate(m.uv)) : "--");
  set("todayWind", usable(m.avgWind) ? `${num(m.avgWind)} km/h` : "--");
  set("todayPressureAvg", usable(m.avgPressure) ? `${num(m.avgPressure)} hPa` : "--");
  set("todayPressureRange", usable(m.pressureLow?.pressure_hpa)&&usable(m.pressureHigh?.pressure_hpa)?`${num(m.pressureLow.pressure_hpa)}–${num(m.pressureHigh.pressure_hpa)} hPa`:"--");
  set("todaySolar", usable(m.solar?.solar_w_m2) ? `${Math.round(Number(m.solar.solar_w_m2))} W/m²` : "--");
  set("todaySamples", m.count ? m.count.toLocaleString("en-IE") : "--"); set("latestObservation", m.latest ? shortTime(m.latest) : "--");
}

function renderYesterday(rows) {
  if (!rows.length) return metrics([]);
  const m=metrics(rows), date=readingDate(rows[0]);
  if(date)set("yesterdayLabel",`${longDate(date)} · completed station observations.`);
  set("yesterdayHigh",usable(m.high?.temperature_c)?`${num(m.high.temperature_c)} °C`:"--");
  set("yesterdayLow",usable(m.low?.temperature_c)?`${num(m.low.temperature_c)} °C`:"--");
  set("yesterdayRain",usable(m.rain)?`${num(m.rain)} mm`:"--");
  set("yesterdayGust",usable(m.gust?.wind_gust_kmh)?`${num(m.gust.wind_gust_kmh)} km/h`:"--");
  return m;
}

function deltaText(today,yesterday,unit,positive,negative) {
  if(!usable(today)||!usable(yesterday)) return {value:"--",note:"Not enough data yet"};
  const d=Number(today)-Number(yesterday), abs=Math.abs(d).toFixed(1);
  if(Math.abs(d)<0.05)return{value:`0.0 ${unit}`,note:"About the same as yesterday"};
  return {value:`${d>0?"+":"−"}${abs} ${unit}`,note:d>0?positive:negative};
}

function renderComparison(today,yesterday) {
  const high=deltaText(today.high?.temperature_c,yesterday.high?.temperature_c,"°C","Warmer high so far","Cooler high so far");
  const low=deltaText(today.low?.temperature_c,yesterday.low?.temperature_c,"°C","Higher minimum so far","Lower minimum so far");
  const rain=deltaText(today.rain,yesterday.rain,"mm","Wetter so far","Drier so far");
  const gust=deltaText(today.gust?.wind_gust_kmh,yesterday.gust?.wind_gust_kmh,"km/h","Windier so far","Calmer so far");
  [["compareHigh","compareHighNote",high],["compareLow","compareLowNote",low],["compareRain","compareRainNote",rain],["compareGust","compareGustNote",gust]].forEach(([v,n,o])=>{set(v,o.value);set(n,o.note);});
}

function relativeTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--";
  let seconds=Math.max(0,Math.floor((Date.now()-date.getTime())/1000));
  if(seconds<60)return `${seconds}s ago`; const minutes=Math.floor(seconds/60);
  if(minutes<60)return `${minutes} min ago`; const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}h ${minutes%60}m ago`; const days=Math.floor(hours/24); return `${days} day${days===1?"":"s"} ago`;
}

function renderRainSummary(rain) {
  const rate=Number(rain?.current_rate_mm_h||0), last=rain?.last_measurable_rain?.received_at?new Date(rain.last_measurable_rain.received_at):null;
  if(rate>0){set("lastRainWhen","Raining now"); set("lastRainExact",last?`Latest wet reading ${exactDateTime(last)}`:"Measurable rain is being recorded");}
  else if(last&&!Number.isNaN(last.getTime())){set("lastRainWhen",relativeTime(last));set("lastRainExact",exactDateTime(last));}
  else{set("lastRainWhen","None recorded yet");set("lastRainExact","No measurable rain is in the archive");}
  set("currentRainRate",usable(rain?.current_rate_mm_h)?`${num(rain.current_rate_mm_h)} mm/h`:"--");
  set("rainNowNote",rate>0?"Rain is currently being detected":"No measurable rain right now");
  set("rainTodayPanel",usable(rain?.today_mm)?`${num(rain.today_mm)} mm`:"--");
  const dry=Number(rain?.consecutive_dry_days); set("drySpell",Number.isFinite(dry)?`${dry} day${dry===1?"":"s"}`:"--");
}

function localTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const part=type=>parts.find(p=>p.type===type)?.value||""; return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
function csvCell(value){if(value===null||value===undefined)return"";const text=String(value);return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function downloadTodayCsv(){
  if(!currentTodayRows.length||!currentTodayKey)return;
  const columns=[["timestamp_local",r=>localTimestamp(readingDate(r))],["timestamp_utc",r=>readingDate(r)?.toISOString()||""],["temperature_c",r=>r.temperature_c],["feels_like_c",r=>r.feels_like_c],["humidity_pct",r=>r.humidity],["dew_point_c",r=>r.dew_point_c],["wind_speed_kmh",r=>r.wind_speed_kmh],["wind_gust_kmh",r=>r.wind_gust_kmh],["wind_direction_deg",r=>r.wind_direction_deg],["pressure_hpa",r=>r.pressure_hpa],["rain_rate_mm_h",r=>r.rain_rate_mm_h],["rain_daily_mm",r=>r.rain_daily_mm],["solar_w_m2",r=>r.solar_w_m2],["uv_index",r=>r.uv_index],["battery_v",r=>r.battery_v]];
  const rows=[...currentTodayRows].sort((a,b)=>(readingDate(a)?.getTime()||0)-(readingDate(b)?.getTime()||0));
  const lines=[columns.map(([n])=>csvCell(n)).join(","),...rows.map(r=>columns.map(([,g])=>csvCell(g(r))).join(","))];
  const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const link=document.createElement("a");
  link.href=url;link.download=`parknacross-weather-${currentTodayKey}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function cardinal(deg){if(!usable(deg))return"";const dirs=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];return dirs[Math.round((Number(deg)%360)/22.5)%16];}
function shareText(){
  const row=latestShareRow; if(!row)return null;
  const parts=["Parknacross Weather"];
  if(usable(row.temperature_c))parts.push(`${num(row.temperature_c)}°C in Ardamine`);
  if(usable(row.wind_speed_kmh))parts.push(`wind ${cardinal(row.wind_direction_deg)} ${num(row.wind_speed_kmh)} km/h`.replace("wind  ","wind "));
  const todayRain=rainTotal(currentTodayRows); if(usable(todayRain))parts.push(`${num(todayRain)} mm rain today`);
  return parts.join(" · ");
}
async function shareCurrentWeather(){
  const text=shareText(); if(!text)return;
  try{
    if(navigator.share){await navigator.share({title:"Parknacross Weather",text,url:"https://parknacrossweather.ie/"});set("actionStatus","Weather shared.");return;}
    const fallbackText=`${text} · https://parknacrossweather.ie/`;
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(fallbackText);set("actionStatus","Current weather copied to clipboard.");return;}
    const area=document.createElement("textarea");area.value=fallbackText;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();set("actionStatus","Current weather copied to clipboard.");
  }catch(error){if(error?.name!=="AbortError")set("actionStatus","Sharing was unavailable. Please try again.");}
}

async function loadSummary(){
  try{
    const [history,rain]=await Promise.all([getJSON("/history?hours=48"),getJSON("/rain-summary")]);
    const rows=Array.isArray(history.readings)?history.readings.filter(r=>readingDate(r)):[]; const now=new Date(),todayKey=localDayKey(now),grouped=new Map();
    rows.forEach(row=>{const key=localDayKey(readingDate(row));if(!key)return;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);});
    const todayRows=grouped.get(todayKey)||[];currentTodayRows=todayRows;currentTodayKey=todayKey;latestShareRow=todayRows.length?todayRows[todayRows.length-1]:null;
    const yesterdayKey=localDayKey(new Date(now.getTime()-24*60*60*1000));const yesterdayRows=yesterdayKey?(grouped.get(yesterdayKey)||[]):[];
    const todayMetrics=metrics(todayRows),yesterdayMetrics=renderYesterday(yesterdayRows);
    set("summaryTitle",`Today in Parknacross · ${longDate(now)}`);set("summarySubtitle",todayRows.length?`Live day-so-far summary from ${todayRows.length.toLocaleString("en-IE")} stored observations.`:"Waiting for today's stored station observations.");
    renderToday(todayMetrics);renderComparison(todayMetrics,yesterdayMetrics);renderRainSummary(rain);
    $("downloadCsvButton").disabled=!todayRows.length;$("shareWeatherButton").disabled=!latestShareRow;
    set("actionStatus",todayRows.length?`${todayRows.length.toLocaleString("en-IE")} observations ready. Download or share using the buttons above.`:"No observations are available yet.");
  }catch(error){console.error("Daily summary:",error);set("summarySubtitle","The daily summary is temporarily unavailable.");set("dayStory","Live station observations could not be loaded. Please try again shortly.");currentTodayRows=[];currentTodayKey=null;latestShareRow=null;$("downloadCsvButton").disabled=true;$("shareWeatherButton").disabled=true;set("actionStatus","Summary tools are temporarily unavailable.");}
}

document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());$("downloadCsvButton")?.addEventListener("click",downloadTodayCsv);$("shareWeatherButton")?.addEventListener("click",shareCurrentWeather);loadSummary();setInterval(loadSummary,10*60*1000);if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});});
