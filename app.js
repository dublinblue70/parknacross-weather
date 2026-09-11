const CURRENT_URL = "https://parknacross-weather.dave-s-carter.workers.dev/current";
const HISTORY_24_URL = "https://parknacross-weather.dave-s-carter.workers.dev/history?hours=24";
const HISTORY_7D_URL = "https://parknacross-weather.dave-s-carter.workers.dev/history?hours=168";

const $ = id => document.getElementById(id);
const set = (id,value) => { const e=$(id); if(e) e.textContent=value; };
const usable = v => v!==null && v!==undefined && v!=="" && Number.isFinite(Number(v));
const n = (v,d=1) => usable(v) ? Number(v).toFixed(d) : "--";

let history24=[];
let history7d=[];
let charts={};

/*
 * Rain correction:
 * 0.1 mm on 11 Sep 2026 came from testing the new station,
 * not from actual rainfall. The correction applies only to that date.
 */
const RAIN_CORRECTIONS_MM = {
  "2026-09-11": 0.1
};

function localDateKey(reading){
  const t=readingTime(reading);
  if(!t) return null;

  const d=new Date(t);

  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("-");
}

function correctedDailyRain(reading){
  const raw=Number(reading?.rain_daily_mm);

  if(!Number.isFinite(raw)) return null;

  const key=localDateKey(reading);
  const correction=Number(RAIN_CORRECTIONS_MM[key]||0);

  return Math.max(0,raw-correction);
}

function readingTime(r){
  if(r?.received_at){
    const t=new Date(r.received_at).getTime();
    if(Number.isFinite(t)) return t;
  }
  return usable(r?.epoch) ? Number(r.epoch)*1000 : null;
}

function sameDay(t,ref=new Date()){
  const d=new Date(t);
  return d.getFullYear()===ref.getFullYear() && d.getMonth()===ref.getMonth() && d.getDate()===ref.getDate();
}

function maxField(rows,field){
  const vals=rows.map(r=>Number(r[field])).filter(Number.isFinite);
  return vals.length ? Math.max(...vals) : null;
}

function minField(rows,field){
  const vals=rows.map(r=>Number(r[field])).filter(Number.isFinite);
  return vals.length ? Math.min(...vals) : null;
}

function compass(deg){
  if(!usable(deg)) return "--";
  const labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const d=((Number(deg)%360)+360)%360;
  return labels[Math.round(d/22.5)%16];
}

function pressureStats(){
  const rows=history24.filter(r=>usable(r.pressure_hpa));
  if(rows.length<2) return {change:null,trend:"--"};
  const change=Number(rows.at(-1).pressure_hpa)-Number(rows[0].pressure_hpa);
  return {change,trend:change>.5?"Rising":change<-.5?"Falling":"Steady"};
}

function prevailingWind(){
  const rows=history24.filter(r=>usable(r.wind_direction_deg));
  if(!rows.length) return {deg:null,text:"--"};
  let x=0,y=0;
  rows.forEach(r=>{
    const weight=usable(r.wind_speed_kmh)?Math.max(Number(r.wind_speed_kmh),1):1;
    const rad=Number(r.wind_direction_deg)*Math.PI/180;
    x+=Math.cos(rad)*weight;
    y+=Math.sin(rad)*weight;
  });
  const deg=(Math.atan2(y,x)*180/Math.PI+360)%360;
  return {deg,text:compass(deg)};
}

function comfort(h){
  h=Number(h);
  if(!Number.isFinite(h)) return "--";
  if(h<35) return "Dry";
  if(h<=65) return "Comfortable";
  if(h<=80) return "Humid";
  return "Very humid";
}

function conditionInfo(c){
  const rain=Number(c.rain_rate_mm_h||0);
  const wind=Number(c.wind_speed_kmh||0);
  const solar=Number(c.solar_w_m2||0);
  const uv=Number(c.uv_index||0);

  if(rain>=2.5) return {tag:"Rainy",icon:"🌧️",story:`Rain is falling at ${n(rain)} mm/h.`};
  if(rain>0) return {tag:"Light rain",icon:"🌦️",story:`Light rain is falling at ${n(rain)} mm/h.`};
  if(wind>=35) return {tag:"Very windy",icon:"💨",story:`A lively Wexford breeze is blowing at ${n(wind)} km/h.`};
  if(wind>=20) return {tag:"Breezy",icon:"🌬️",story:`Breezy conditions with wind around ${n(wind)} km/h.`};
  if(uv>=5) return {tag:"Bright",icon:"☀️",story:`Bright conditions with UV index ${n(uv,0)}.`};
  if(solar>=400) return {tag:"Bright",icon:"🌤️",story:`Good brightness over Parknacross right now.`};
  if(solar>=100) return {tag:"Some brightness",icon:"⛅",story:`Some brightness breaking through at Parknacross.`};
  return {tag:"Calm & local",icon:"☁️",story:`Quiet local conditions at Parknacross.`};
}

function dailyRainTotals(){
  const days=new Map();

  history7d.forEach(r=>{
    const t=readingTime(r);
    const rain=correctedDailyRain(r);

    if(!t || !usable(rain)) return;

    const d=new Date(t);
    const key=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const existing=days.get(key);

    if(!existing || rain>existing.rain){
      days.set(key,{time:t,rain});
    }
  });

  return [...days.values()]
    .sort((a,b)=>a.time-b.time)
    .slice(-7);
}

function updateDashboard(c){
  const today=history24.filter(r=>{const t=readingTime(r); return t && sameDay(t);});
  const high=maxField(today,"temperature_c");
  const low=minField(today,"temperature_c");
  const peak=maxField(today,"wind_gust_kmh");
  const solarPeak=maxField(today,"solar_w_m2");
  const pressure=pressureStats();
  const dir=compass(c.wind_direction_deg);
  const info=conditionInfo(c);
  const rainToday=correctedDailyRain(c);
  const t=readingTime(c);

  if(t){
    const d=new Date(t);
    set("lastUpdated",`Updated ${d.toLocaleTimeString("en-IE",{hour:"2-digit",minute:"2-digit"})} · ${d.toLocaleDateString("en-IE",{day:"2-digit",month:"short"})}`);
  }

  set("heroTemp",n(c.temperature_c));
  set("heroFeels",`${n(c.feels_like_c)}°C`);
  set("heroHumidity",`${n(c.humidity,0)}%`);
  set("heroDew",`${n(c.dew_point_c)}°C`);
  set("heroWind",`${n(c.wind_speed_kmh)} km/h`);
  set("heroRain",`${n(rainToday)} mm`);
  set("heroPressure",`${n(c.pressure_hpa)} hPa`);
  set("heroTrend",pressure.trend==="--"?"--":`${pressure.trend} pressure`);
  set("weatherStory",info.story);
  set("conditionsTag",info.tag);
  set("weatherIcon",info.icon);

  set("todayLow",n(low));
  set("todayHigh",n(high));
  set("peakGust",n(peak));
  set("summaryRain",n(rainToday));
  set("solarPeak",n(solarPeak,0));

  set("tempVal",n(c.temperature_c));
  set("feelsVal",`${n(c.feels_like_c)}°C`);
  set("tempMin",n(low));
  set("tempMax",n(high));
  set("humVal",n(c.humidity,0));
  set("dewVal",`${n(c.dew_point_c)}°C`);
  set("comfortVal",comfort(c.humidity));
  set("windVal",n(c.wind_speed_kmh));
  set("gustVal",`${n(c.wind_gust_kmh)} km/h`);
  set("dirVal",usable(c.wind_direction_deg)?`${dir} (${Math.round(Number(c.wind_direction_deg))}°)`:dir);
  set("rainVal",n(rainToday));
  set("rainRateVal",`${n(c.rain_rate_mm_h)} mm/h`);
  set("pressureVal",n(c.pressure_hpa));
  set("pressureTrend",pressure.trend);
  set("pressureChange",usable(pressure.change)?`${pressure.change>=0?"+":""}${n(pressure.change)} hPa`:"--");
  set("solarVal",n(c.solar_w_m2,0));
  set("uvVal",n(c.uv_index,0));

  set("battery",usable(c.battery_v)?`${n(c.battery_v,2)} V`:"--");
  set("cloudStatus","Connected");
  $("cloudStatus")?.classList.add("ok");
  set("sampleCount",history24.length);

  const prev=prevailingWind();
  set("prevailing",prev.text);
  if(usable(prev.deg)) $("needle").style.transform=`rotate(${prev.deg}deg)`;
  set("currentDirection",usable(c.wind_direction_deg)?`${dir} · ${Math.round(Number(c.wind_direction_deg))}°`:dir);
  set("currentWind",`${n(c.wind_speed_kmh)} km/h`);
  set("currentGust",`${n(c.wind_gust_kmh)} km/h`);

  set("recordHigh",`${n(high)} °C`);
  set("recordLow",`${n(low)} °C`);
  set("recordGust",`${n(peak)} km/h`);
  set("recordRain",`${n(rainToday)} mm`);
  set("year",new Date().getFullYear());
}

function scales(title){
  return {
    x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:8}},
    y:{grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:title,color:"#a8bfd4"}}
  };
}

function line(label,color,axis="y"){
  return {label,data:[],borderColor:color,backgroundColor:color,borderWidth:2.2,pointRadius:0,pointHoverRadius:4,tension:.3,fill:false,yAxisID:axis};
}

function createCharts(){
  Chart.defaults.color="#bfd0e3";
  Chart.defaults.font.family='Inter,system-ui,sans-serif';

  charts.temperature=new Chart($("temperatureChart"),{
    type:"line",
    data:{labels:[],datasets:[line("Temperature °C","#ff8d8d"),line("Dew point °C","#6ef1cb")]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:scales("°C"),plugins:{legend:{position:"bottom"}}}
  });

  charts.wind=new Chart($("windChart"),{
    type:"line",
    data:{labels:[],datasets:[line("Wind km/h","#74ddff"),line("Gust km/h","#ffad66")]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:scales("km/h"),plugins:{legend:{position:"bottom"}}}
  });

  charts.pressure=new Chart($("pressureChart"),{
    type:"line",
    data:{labels:[],datasets:[line("Pressure hPa","#b594ff")]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:scales("hPa"),plugins:{legend:{display:false}}}
  });

  charts.rain=new Chart($("rainChart"),{
    type:"bar",
    data:{labels:[],datasets:[{label:"Rainfall mm",data:[],backgroundColor:"#7ca9ff",borderRadius:8}]},
    options:{maintainAspectRatio:false,scales:scales("mm"),plugins:{legend:{display:false}}}
  });

  charts.solar=new Chart($("solarChart"),{
    type:"line",
    data:{labels:[],datasets:[line("Solar W/m²","#ffd77a","y"),line("UV index","#b594ff","y1")]},
    options:{
      maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      scales:{
        x:{grid:{color:"transparent"},ticks:{color:"#a8bfd4",maxTicksLimit:8}},
        y:{position:"left",beginAtZero:true,grid:{color:"rgba(163,209,255,.10)"},ticks:{color:"#a8bfd4"},title:{display:true,text:"W/m²",color:"#a8bfd4"}},
        y1:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},ticks:{color:"#a8bfd4"},title:{display:true,text:"UV",color:"#a8bfd4"}}
      },
      plugins:{legend:{position:"bottom"}}
    }
  });
}

function updateCharts(){
  const rows=history24.filter(r=>readingTime(r));
  const labels=rows.map(r=>new Date(readingTime(r)).toLocaleTimeString("en-IE",{hour:"2-digit",minute:"2-digit"}));

  charts.temperature.data.labels=labels;
  charts.temperature.data.datasets[0].data=rows.map(r=>r.temperature_c);
  charts.temperature.data.datasets[1].data=rows.map(r=>r.dew_point_c);
  charts.temperature.update();

  charts.wind.data.labels=labels;
  charts.wind.data.datasets[0].data=rows.map(r=>r.wind_speed_kmh);
  charts.wind.data.datasets[1].data=rows.map(r=>r.wind_gust_kmh);
  charts.wind.update();

  charts.pressure.data.labels=labels;
  charts.pressure.data.datasets[0].data=rows.map(r=>r.pressure_hpa);
  charts.pressure.update();

  charts.solar.data.labels=labels;
  charts.solar.data.datasets[0].data=rows.map(r=>r.solar_w_m2);
  charts.solar.data.datasets[1].data=rows.map(r=>r.uv_index);
  charts.solar.update();

  const rain=dailyRainTotals();
  charts.rain.data.labels=rain.map(d=>new Date(d.time).toLocaleDateString("en-IE",{weekday:"short"}));
  charts.rain.data.datasets[0].data=rain.map(d=>d.rain);
  charts.rain.update();
}

async function getJSON(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const data=await r.json();
  if(data.error) throw new Error(data.error);
  return data;
}

async function loadEverything(){
  try{
    const [current,h24,h7]=await Promise.all([
      getJSON(CURRENT_URL),
      getJSON(HISTORY_24_URL),
      getJSON(HISTORY_7D_URL)
    ]);

    history24=Array.isArray(h24.readings)?h24.readings:[];
    history7d=Array.isArray(h7.readings)?h7.readings:[];

    updateDashboard(current);
    updateCharts();

  }catch(err){
    console.error("Parknacross Weather:",err);

    set("cloudStatus","Error");
    $("cloudStatus")?.classList.add("bad");
    set("conditionsTag","Feed unavailable");
    set("lastUpdated","Unable to load live weather");
  }
}

async function refreshCurrent(){
  try{
    const current=await getJSON(CURRENT_URL);
    updateDashboard(current);

  }catch(err){
    console.error("Current refresh:",err);
    set("cloudStatus","Delayed");
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  createCharts();
  loadEverything();

  setInterval(
    refreshCurrent,
    60*1000
  );

  setInterval(
    loadEverything,
    5*60*1000
  );
});
