(() => {
  'use strict';
  const TZ = 'Europe/Dublin';
  const metrics = {
    temperature_c: ['Temperature', '°C', false, 2],
    wind_speed_kmh: ['Wind speed', 'km/h', true, 5],
    wind_gust_kmh: ['Wind gust', 'km/h', true, 5],
    rain_rate_mm_h: ['Rain rate', 'mm/h', true, .2],
    pressure_hpa: ['Sea-level pressure', 'hPa', false, 2],
    soil_moisture_pct: ['Soil moisture', '%', false, 4]
  };
  const usable = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const parts = epoch => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date(epoch * 1000)).map(part => [part.type, part.value]));
  const dayKey = epoch => { const p=parts(epoch); return `${p.year}-${p.month}-${p.day}`; };
  const shiftDay = (day, amount) => { const d=new Date(day+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+amount); return d.toISOString().slice(0,10); };
  const labelDay = day => new Date(day+'T12:00:00Z').toLocaleDateString('en-IE',{timeZone:TZ,day:'numeric',month:'short',year:'numeric'});
  // Align actual observations by Irish clock time. Break gaps and clock reversals;
  // never invent readings or connect the two occurrences of the autumn hour.
  function points(rows, day, field) {
    const sorted=(Array.isArray(rows)?rows:[]).filter(row=>usable(row.epoch)&&dayKey(Number(row.epoch))===day).sort((a,b)=>Number(a.epoch)-Number(b.epoch));
    const result=[]; let previous=null;
    for(const row of sorted){
      const epoch=Number(row.epoch),p=parts(epoch),x=Number(p.hour)*60+Number(p.minute);
      if(previous && (epoch-previous.epoch>900 || x<previous.x || x-previous.x>15))result.push({x:previous.x+.01,y:null});
      result.push({x,y:usable(row[field])?Number(row[field]):null,epoch});
      previous={epoch,x};
    }
    return result;
  }
  window.ParknacrossDateComparison={points};
  const host=document.getElementById('dateComparison');
  if(!host)return;
  const $=id=>document.getElementById(id);
  let chart=null,sequence=0,loaded=null;
  const setStatus=text=>{$('comparisonStatus').textContent=text;};
  async function get(path){
    const base=window.PARKNACROSS_CONFIG?.apiBase || 'https://parknacross-weather.dave-s-carter.workers.dev';
    const response=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const data=await response.json();if(data?.error)throw Error(data.error);return data;
  }
  function clear(){if(chart){chart.destroy();chart=null;}$('comparisonChart').hidden=true;$('comparisonChart').parentElement.hidden=true;$('comparisonSummary').textContent='';}
  function render(){
    if(!loaded)return;
    clear();
    const field=$('comparisonMetric').value,[name,unit,zero,minRange]=metrics[field];
    const datasets=loaded.map((item,index)=>({
      label:labelDay(item.day),data:points(item.data.readings,item.day,field),
      borderColor:index?'#ffd56a':'#74ddff',backgroundColor:index?'#ffd56a':'#74ddff',
      borderDash:index?[6,3]:[],borderWidth:2.2,pointRadius:0,pointHoverRadius:4,pointHitRadius:8,
      tension:0,spanGaps:false,stepped:field==='rain_rate_mm_h'
    }));
    const notes=datasets.map((dataset,index)=>{
      const measured=dataset.data.filter(point=>point.y!==null);
      const values=measured.map(point=>point.y);
      return `${dataset.label}: ${measured.length} ${name.toLowerCase()} readings${values.length?` · ${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)} ${unit}`:' · no values available'}${loaded[index].day===dayKey(Date.now()/1000)?' · today so far':''}`;
    });
    $('comparisonSummary').textContent=notes.join(' | ');
    if(!datasets.some(dataset=>dataset.data.some(point=>point.y!==null))){setStatus(`No ${name.toLowerCase()} readings are available for these dates. Choose another measurement or date.`);return;}
    if(!window.Chart){setStatus('The chart library could not load. The comparison figures are shown below; reload to restore the graph.');return;}
    const canvas=$('comparisonChart');canvas.hidden=false;canvas.parentElement.hidden=false;canvas.setAttribute('aria-label',`${name} comparison for ${datasets.map(d=>d.label).join(' and ')}. Both dates use Irish clock time.`);
    chart=new Chart(canvas,{type:'line',data:{datasets},options:{
      animation:false,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},
      scales:{x:{type:'linear',min:0,max:1440,title:{display:true,text:'Time of day · Irish time'},grid:{color:'rgba(174,210,232,.06)'},ticks:{stepSize:240,maxRotation:0,callback:value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`}},
        y:{beginAtZero:zero,grace:'10%',title:{display:true,text:unit},grid:{color:'rgba(174,210,232,.09)'},afterDataLimits:axis=>{if(zero)axis.max=Math.max(minRange,axis.max);else if(axis.max-axis.min<minRange){const middle=(axis.min+axis.max)/2;axis.min=middle-minRange/2;axis.max=middle+minRange/2;}}}},
      plugins:{parknacrossChartExplorer:false,legend:{position:'bottom'},tooltip:{callbacks:{title:items=>{const epoch=items[0]?.raw?.epoch;return epoch?new Date(epoch*1000).toLocaleString('en-IE',{timeZone:TZ,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}):'';},label:item=>`${item.dataset.label} · ${name}: ${item.parsed.y.toFixed(1)} ${unit}`}}}
    }});
    setStatus(`Comparing ${datasets.map(d=>d.label).join(' with ')}. Blank sections are missing readings. Clock-change dates may contain a repeated or missing hour; hover or tap for the exact time and UTC offset.`);
  }
  async function compare(){
    const first=$('comparisonFirst').value,second=$('comparisonSecond').value;
    const valid=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
    const turn=++sequence;loaded=null;clear();
    if(!valid(first)||!valid(second)){setStatus('Choose two valid dates.');return;}
    if(first===second){setStatus('Choose two different dates to compare.');return;}
    if(first>dayKey(Date.now()/1000)||second>dayKey(Date.now()/1000)){setStatus('Choose today or an earlier date. Future observations are unavailable.');return;}
    const button=$('compareDatesButton');button.disabled=true;host.setAttribute('aria-busy','true');setStatus('Loading both archived dates…');
    try{
      const results=await Promise.allSettled([first,second].map(day=>get('/day?date='+encodeURIComponent(day))));
      if(turn!==sequence)return;
      if(results.some(result=>result.status==='rejected')){setStatus('One or both dates could not be loaded. Please retry; the other charts remain available.');return;}
      loaded=results.map((result,index)=>({day:index?second:first,data:result.value}));render();
    }finally{if(turn===sequence){button.disabled=false;host.setAttribute('aria-busy','false');}}
  }
  const today=dayKey(Date.now()/1000);
  for(const id of ['comparisonFirst','comparisonSecond'])$(id).max=today;
  $('comparisonFirst').value=shiftDay(today,-1);$('comparisonSecond').value=today;
  $('comparisonForm').addEventListener('submit',event=>{event.preventDefault();compare();});
  $('comparisonMetric').addEventListener('change',render);
  // Invalidate old results immediately when a date changes; do not label the
  // previous chart as a comparison of newly selected dates.
  for(const id of ['comparisonFirst','comparisonSecond'])$(id).addEventListener('change',()=>{sequence++;loaded=null;clear();$('compareDatesButton').disabled=false;host.setAttribute('aria-busy','false');setStatus('Select Compare dates to load the selected dates.');});
})();
