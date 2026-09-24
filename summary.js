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

async function getJSON(path, cache = "default") {
  const response = await fetch(`${API_BASE}${path}`, { cache });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

const TEMP_OUTLIER_DELTA_C=2.5,TEMP_OUTLIER_BASELINE_C=1.0,TEMP_OUTLIER_WINDOW_MS=30*60*1000,TEMP_OUTLIER_MIN_NEIGHBORS=3;
function median(values){const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return null;const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;}
function temperatureOutlierRows(rows){const ordered=rows.map(row=>({row,date:readingDate(row),temp:Number(row?.temperature_c)})).filter(x=>x.date&&usable(x.row?.temperature_c)).sort((a,b)=>a.date-b.date),out=new Set();for(const c of ordered){const neighbors=ordered.filter(x=>x!==c&&Math.abs(x.date-c.date)<=TEMP_OUTLIER_WINDOW_MS);if(neighbors.length<TEMP_OUTLIER_MIN_NEIGHBORS)continue;const baseline=median(neighbors.map(x=>x.temp));if(!Number.isFinite(baseline))continue;const agreeing=neighbors.filter(x=>Math.abs(x.temp-baseline)<=TEMP_OUTLIER_BASELINE_C).length,required=Math.max(2,Math.ceil(neighbors.length*.6));if(agreeing>=required&&Math.abs(c.temp-baseline)>=TEMP_OUTLIER_DELTA_C)out.add(c.row);}return out;}

function maxReading(rows, field) { const out=field==="temperature_c"?temperatureOutlierRows(rows):null; return rows.reduce((best, row) => !usable(row[field]) || out?.has(row) ? best : (!best || Number(row[field]) > Number(best[field]) ? row : best), null); }
function minReading(rows, field) { const out=field==="temperature_c"?temperatureOutlierRows(rows):null; return rows.reduce((best, row) => !usable(row[field]) || out?.has(row) ? best : (!best || Number(row[field]) < Number(best[field]) ? row : best), null); }

const GUST_SPIKE_MIN_KMH = 12;
const GUST_SPIKE_DELTA_KMH = 8;
const GUST_SPIKE_WINDOW_MS = 20 * 60 * 1000;
const GUST_CALM_NEIGHBOR_MAX_KMH = 7;
const GUST_SUSTAINED_WIND_MAX_KMH = 7;

function medianValue(values){
  const sorted=[...values].sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function gustOutlierRows(rows){
  const ordered=(rows||[]).map(row=>({row,time:readingDate(row)?.getTime(),gust:Number(row?.wind_gust_kmh),speed:usable(row?.wind_speed_kmh)?Number(row.wind_speed_kmh):null}))
    .filter(x=>Number.isFinite(x.time)&&usable(x.row?.wind_gust_kmh)).sort((a,b)=>a.time-b.time);
  const out=new Set();
  for(const c of ordered){
    if(c.row?.wind_gust_excluded){out.add(c.row);continue;}
    if(c.gust<GUST_SPIKE_MIN_KMH)continue;
    const before=ordered.filter(x=>x!==c&&x.time<c.time&&c.time-x.time<=GUST_SPIKE_WINDOW_MS);
    const after=ordered.filter(x=>x!==c&&x.time>c.time&&x.time-c.time<=GUST_SPIKE_WINDOW_MS);
    const neighbors=[...before,...after];
    if(!before.length||!after.length||neighbors.length<4)continue;
    const baseline=medianValue(neighbors.map(x=>x.gust));
    const calm=neighbors.filter(x=>x.gust<=GUST_CALM_NEIGHBOR_MAX_KMH).length>=Math.ceil(neighbors.length*.75);
    const speedCalm=c.speed===null||c.speed<=GUST_SUSTAINED_WIND_MAX_KMH;
    if(calm&&speedCalm&&Number.isFinite(baseline)&&c.gust-baseline>=GUST_SPIKE_DELTA_KMH&&c.gust>=Math.max(GUST_SPIKE_MIN_KMH,baseline*2.5))out.add(c.row);
  }
  return out;
}
function maxGustReading(rows){
  const out=gustOutlierRows(rows);
  return maxReading((rows||[]).filter(row=>!out.has(row)),"wind_gust_kmh");
}
function average(rows, field) { const values = rows.filter(row => usable(row[field])).map(row => Number(row[field])); return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null; }
const RAIN_CORRECTIONS_MM = window.PARKNACROSS_DATA_CORRECTIONS?.dailyRainMm || {};
function correctedRain(row) {
  if (!usable(row?.rain_daily_mm)) return null;
  const day = localDayKey(readingDate(row));
  const correction = Number(RAIN_CORRECTIONS_MM[day] || 0);
  return Math.round(Math.max(0, Number(row.rain_daily_mm) - correction) * 10) / 10;
}
function rainTotal(rows) { const values = rows.map(correctedRain).filter(usable).map(Number); return values.length ? Math.max(...values) : null; }
function mergeCurrent(rows, current, todayKey) {
  if (!current || localDayKey(readingDate(current)) !== todayKey) return [...rows];
  const currentEpoch = usable(current.epoch) ? Number(current.epoch) : null;
  const filtered = currentEpoch === null ? [...rows] : rows.filter(row => Number(row.epoch) !== currentEpoch);
  return [...filtered, current].sort((a,b)=>(readingDate(a)?.getTime()||0)-(readingDate(b)?.getTime()||0));
}

function metrics(rows) {
  return {
    high: maxReading(rows, "temperature_c"), low: minReading(rows, "temperature_c"), gust: maxGustReading(rows),
    uv: maxReading(rows, "uv_index"), solar: maxReading(rows, "solar_w_m2"), pressureHigh: maxReading(rows, "pressure_hpa"), pressureLow: minReading(rows, "pressure_hpa"),
    rain: rainTotal(rows), avgHumidity: average(rows, "humidity"), avgDewPoint: average(rows, "dew_point_c"), avgTemperature: average(rows, "temperature_c"), avgWind: average(rows, "wind_speed_kmh"), avgPressure: average(rows, "pressure_hpa"),
    count: rows.length, latest: rows.length ? readingDate(rows[rows.length - 1]) : null
  };
}

function temperatureWord(high) { if (!usable(high)) return "mixed"; const v=Number(high); return v>=23?"warm":v>=17?"mild":v>=11?"cool":"cold"; }
function rainPhrase(rain) { if (!usable(rain)) return "with rainfall data still building"; const v=Number(rain); if(v<0.1)return"and dry so far"; if(v<1)return`with just ${v.toFixed(1)} mm of rain`; if(v<5)return`with ${v.toFixed(1)} mm of rain`; if(v<15)return`with a fairly wet ${v.toFixed(1)} mm recorded`; return`with a wet ${v.toFixed(1)} mm recorded`; }
function windPhrase(gust) { if (!usable(gust)) return ""; const v=Number(gust); if(v<20)return"Winds have generally been light"; if(v<35)return"There has been a noticeable breeze"; if(v<50)return"It has been breezy at times"; if(v<70)return"It has been windy, with some strong gusts"; return"It has been very windy, with strong gusts"; }
function averageDaily(rows, field) {
  const values=(rows||[]).map(row=>row?.[field]).filter(usable).map(Number);
  return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
}

function buildStory(m, yesterday, recentDays=[]) {
  const high=m.high?.temperature_c, low=m.low?.temperature_c, gust=m.gust?.wind_gust_kmh;
  const dewPoint=usable(m.avgDewPoint)?Number(m.avgDewPoint):null;
  const avgTemp=usable(m.avgTemperature)?Number(m.avgTemperature):null;
  let airFeel="";
  if(dewPoint!==null){
    if(dewPoint<5) airFeel=avgTemp!==null&&avgTemp<=16?"fresh and dry":"dry";
    else if(dewPoint<10) airFeel="fresh";
    else if(dewPoint<13) airFeel=avgTemp!==null&&avgTemp<=16?"fresh":"comfortable";
    else if(dewPoint<16) airFeel="comfortable";
    else if(dewPoint<18) airFeel=avgTemp!==null&&avgTemp<=17?"mild":"slightly muggy";
    else if(dewPoint<20) airFeel="muggy";
    else airFeel="very muggy";
  }
  const first=`A ${temperatureWord(high)}${airFeel?` and ${airFeel}`:""} day so far ${rainPhrase(m.rain)}.`;
  const temp=usable(high)&&usable(low)?`Temperatures have ranged from ${Number(low).toFixed(1)}°C to ${Number(high).toFixed(1)}°C.`:"Temperature observations are still building.";
  const wind=windPhrase(gust); const windSentence=wind?`${wind}${usable(gust)?`, reaching ${Number(gust).toFixed(1)} km/h`:""}.`:"";

  const comparisons=[];
  if(usable(high)&&usable(yesterday?.high?.temperature_c)){
    const d=Number(high)-Number(yesterday.high.temperature_c);
    if(Math.abs(d)>=0.5) comparisons.push(`the high is ${Math.abs(d).toFixed(1)}°C ${d>0?"warmer":"cooler"} than yesterday`);
  }
  if(usable(m.rain)&&usable(yesterday?.rain)){
    const d=Number(m.rain)-Number(yesterday.rain);
    if(Math.abs(d)>=0.5) comparisons.push(`${Math.abs(d).toFixed(1)} mm ${d>0?"wetter":"drier"} than yesterday so far`);
  }

  const avgHigh=averageDaily(recentDays,"high_c");
  const avgRain=averageDaily(recentDays,"rain_mm");
  if(usable(high)&&usable(avgHigh)){
    const d=Number(high)-Number(avgHigh);
    if(Math.abs(d)>=0.5) comparisons.push(`${Math.abs(d).toFixed(1)}°C ${d>0?"above":"below"} the recent 7-day average high`);
  }
  if(usable(m.rain)&&usable(avgRain)&&Number(m.rain)>=0.1){
    const d=Number(m.rain)-Number(avgRain);
    if(Math.abs(d)>=1) comparisons.push(`rainfall is ${d>0?"above":"below"} the recent daily average`);
  }

  const comparisonSentence=comparisons.length?`Compared with recent conditions, ${comparisons.slice(0,2).join(" and ")}.`:"";
  const uv=usable(m.uv?.uv_index)?`Peak UV so far is ${Number(m.uv.uv_index).toFixed(1)}.`:"";
  return [first,temp,windSentence,comparisonSentence,uv].filter(Boolean).join(" ");
}

function renderToday(m, yesterday=null, recentDays=[]) {
  set("dayStory", buildStory(m, yesterday, recentDays));
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

function renderRainSummary(rain, todayRain) {
  const rate=usable(rain?.current_rate_mm_h)?Number(rain.current_rate_mm_h):null, last=rain?.last_measurable_rain?.received_at?new Date(rain.last_measurable_rain.received_at):null;
  if(rate !== null && rate>0){set("lastRainWhen","Raining now"); set("lastRainExact",last?`Latest wet reading ${exactDateTime(last)}`:"Measurable rain is being recorded");}
  else if(last&&!Number.isNaN(last.getTime())){set("lastRainWhen",relativeTime(last));set("lastRainExact",exactDateTime(last));}
  else{set("lastRainWhen","None recorded yet");set("lastRainExact","No measurable rain is in the archive");}
  set("currentRainRate",rate !== null?`${num(rate)} mm/h`:"--");
  set("rainNowNote",rate === null?"Current rain rate unavailable":rate>0?"Rain is currently being detected":"No measurable rain right now");
  set("rainTodayPanel",usable(todayRain)?`${num(todayRain)} mm`:"--");
  const dry=usable(rain?.consecutive_dry_days)?Number(rain.consecutive_dry_days):null;
  set("drySpell",dry===null?"--":`${rain?.consecutive_dry_days_complete===false?"≥":""}${dry} day${dry===1?"":"s"}`);
}

function renderSignificantWeather(rows){
  const cutoff=Date.now()-24*60*60*1000;
  const recent=(rows||[]).filter(row=>{const date=readingDate(row);return date&&date.getTime()>=cutoff;}).sort((a,b)=>readingDate(a)-readingDate(b));
  if(!recent.length){set("significantWeatherBadge","Unavailable");set("significantWeatherNarrative","The latest 24-hour observation review is temporarily unavailable.");return;}
  const pressures=recent.filter(row=>usable(row.pressure_hpa));
  const pressureChange=pressures.length>1?Number(pressures.at(-1).pressure_hpa)-Number(pressures[0].pressure_hpa):null;
  const gustRow=maxGustReading(recent),maxGust=usable(gustRow?.wind_gust_kmh)?Number(gustRow.wind_gust_kmh):null;
  const rainRates=recent.filter(row=>usable(row.rain_rate_mm_h)).map(row=>Number(row.rain_rate_mm_h));
  const maxRain=rainRates.length?Math.max(...rainRates):null;
  const lightningRows=recent.filter(row=>usable(row.lightning_strikes)).map(row=>({time:readingDate(row)?.getTime(),count:Number(row.lightning_strikes)})).filter(row=>Number.isFinite(row.time));
  let lightningChange=lightningRows.length?0:null;
  if(lightningRows.length>1){for(let i=1;i<lightningRows.length;i++){const previous=lightningRows[i-1],current=lightningRows[i],elapsed=current.time-previous.time;if(elapsed>0&&elapsed<=20*60*1000&&current.count>=previous.count)lightningChange+=current.count-previous.count;}}
  const indicators=[];
  if(usable(pressureChange)&&pressureChange<=-8)indicators.push(`pressure fell ${Math.abs(pressureChange).toFixed(1)} hPa`);
  if(usable(maxGust)&&maxGust>=50)indicators.push(`the strongest accepted gust reached ${maxGust.toFixed(1)} km/h`);
  if(usable(maxRain)&&maxRain>=7.5)indicators.push(`the peak rain rate reached ${maxRain.toFixed(1)} mm/h`);
  if(usable(lightningChange)&&lightningChange>0)indicators.push(`${Math.round(lightningChange)} lightning detection${Math.round(lightningChange)===1?" was":"s were"} recorded`);
  const badge=$("significantWeatherBadge");
  if(badge){badge.textContent=indicators.length?"Indicator reached":"No indicator reached";badge.classList.toggle("storm-active",indicators.length>0);}
  set("significantWeatherNarrative",indicators.length?`In the latest 24 hours, ${indicators.join(", ")}. Check Met Éireann for official warnings.`:"No site-defined significant-weather indicator was reached in the latest 24 hours.");
}

function localTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const part=type=>parts.find(p=>p.type===type)?.value||""; return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
function csvCell(value){if(value===null||value===undefined)return"";const text=String(value);return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
function downloadTodayCsv(){
  if(!currentTodayRows.length||!currentTodayKey)return;
  const columns=[["timestamp_local",r=>localTimestamp(readingDate(r))],["timestamp_utc",r=>readingDate(r)?.toISOString()||""],["temperature_c",r=>r.temperature_c],["feels_like_c",r=>r.feels_like_c],["humidity_pct",r=>r.humidity],["dew_point_c",r=>r.dew_point_c],["wind_speed_kmh",r=>r.wind_speed_kmh],["wind_gust_kmh",r=>r.wind_gust_kmh],["wind_direction_deg",r=>r.wind_direction_deg],["pressure_hpa",r=>r.pressure_hpa],["rain_rate_mm_h",r=>r.rain_rate_mm_h],["rain_daily_mm",r=>correctedRain(r)],["solar_w_m2",r=>r.solar_w_m2],["uv_index",r=>r.uv_index],["battery_v",r=>r.battery_v]];
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
    const [history,rain,current,daily]=await Promise.all([getJSON("/history?hours=48"),getJSON("/rain-summary","no-store"),getJSON("/current","no-store"),getJSON("/daily?days=8","no-store")]);
    const rows=Array.isArray(history.readings)?history.readings.filter(r=>readingDate(r)):[]; const now=new Date(),todayKey=localDayKey(now),grouped=new Map();
    rows.forEach(row=>{const key=localDayKey(readingDate(row));if(!key)return;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);});
    const todayRows=mergeCurrent(grouped.get(todayKey)||[],current,todayKey);currentTodayRows=todayRows;currentTodayKey=todayKey;latestShareRow=current&&localDayKey(readingDate(current))===todayKey?current:(todayRows.length?todayRows[todayRows.length-1]:null);
    const yesterdayKey=localDayKey(new Date(now.getTime()-24*60*60*1000));const yesterdayRows=yesterdayKey?(grouped.get(yesterdayKey)||[]):[];
    const todayMetrics=metrics(todayRows),yesterdayMetrics=renderYesterday(yesterdayRows);
    if (usable(current?.rain_daily_mm) && localDayKey(readingDate(current)) === todayKey) todayMetrics.rain = correctedRain(current);
    else if (usable(rain?.today_mm)) todayMetrics.rain = Number(rain.today_mm);
    const rainDisplay = {...rain, current_rate_mm_h: usable(current?.rain_rate_mm_h) ? Number(current.rain_rate_mm_h) : rain?.current_rate_mm_h};
    set("summaryTitle",`Today in Parknacross · ${longDate(now)}`);set("summarySubtitle",todayRows.length?`Live day-so-far summary from ${todayRows.length.toLocaleString("en-IE")} stored observations.`:"Waiting for today's stored station observations.");
    const recentCompletedDays=(Array.isArray(daily?.days)?daily.days:[]).filter(row=>row.day!==todayKey).slice(-7);
    renderToday(todayMetrics,yesterdayMetrics,recentCompletedDays);renderComparison(todayMetrics,yesterdayMetrics);renderRainSummary(rainDisplay,todayMetrics.rain);renderSignificantWeather(rows);
    $("downloadCsvButton").disabled=!todayRows.length;$("shareWeatherButton").disabled=!latestShareRow;
    set("actionStatus",todayRows.length?`${todayRows.length.toLocaleString("en-IE")} observations ready. Download or share using the buttons above.`:"No observations are available yet.");
  }catch(error){console.error("Daily summary:",error);set("summarySubtitle","The daily summary is temporarily unavailable.");set("dayStory","Live station observations could not be loaded. Please try again shortly.");set("significantWeatherBadge","Unavailable");set("significantWeatherNarrative","The latest 24-hour observation review is temporarily unavailable.");currentTodayRows=[];currentTodayKey=null;latestShareRow=null;$("downloadCsvButton").disabled=true;$("shareWeatherButton").disabled=true;set("actionStatus","Summary tools are temporarily unavailable.");}
}

document.addEventListener("DOMContentLoaded",()=>{set("year",new Date().getFullYear());$("downloadCsvButton")?.addEventListener("click",downloadTodayCsv);$("shareWeatherButton")?.addEventListener("click",shareCurrentWeather);loadSummary();setInterval(loadSummary,60*1000);});
