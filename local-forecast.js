/* Local, time-bounded summaries of the existing Ardamine hourly forecast. */
(() => {
 'use strict';
 const HOUR=3600000,TZ='Europe/Dublin',$=id=>document.getElementById(id);
 const parts=ms=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
 const key=p=>`${p.year}-${p.month}-${p.day}`;
 const bounded=(raw,min,max)=>raw!==null&&raw!==undefined&&String(raw).trim()!==''&&Number.isFinite(Number(raw))&&Number(raw)>=min&&Number(raw)<=max?Number(raw):null;
 const number=n=>n.toLocaleString('en-IE',{maximumFractionDigits:1});
 const range=(values,unit)=>values.length?`${number(Math.min(...values))}${Math.min(...values)===Math.max(...values)?'':'–'+number(Math.max(...values))} ${unit}`:'Not available';
 const stamp=ms=>new Date(ms).toLocaleString('en-IE',{timeZone:TZ,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 function narrative(rows,i,complete){
  const rains=rows.filter(r=>r.rain!==null),temps=rows.filter(r=>r.temp!==null),winds=rows.filter(r=>r.wind!==null),bits=[];
  if(complete){
   const wet=rains.filter(r=>r.rain>0),total=rains.reduce((sum,r)=>sum+r.rain,0);
   if(!wet.length)bits.push('Dry');
   else{
    const peak=wet.reduce((a,b)=>a.rain>=b.rain?a:b);
    const when=new Date(peak.ms).toLocaleString('en-IE',{timeZone:TZ,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    bits.push(`Rain ${number(total)} mm · Heaviest ${when}`);
   }
  }else bits.push('Rainfall data incomplete');
  if(temps.length)bits.push(range(temps.map(r=>r.temp),'°C'));
  if(winds.length)bits.push('Wind '+range(winds.map(r=>r.wind),'km/h'));
  return bits.join(' · ')+'.';
 }
 function describe(feed,now=Date.now()){
  const fetched=Date.parse(feed?.fetched_at||'');
  if(!Number.isFinite(fetched)||fetched>now+90000||now-fetched>90*60000||!Array.isArray(feed?.points))return null;
  const today=parts(now),todayKey=key(today),tomorrowKey=new Date(Date.UTC(Number(today.year),Number(today.month)-1,Number(today.day)+1,12)).toISOString().slice(0,10);
  const slots=new Map(),start=Math.ceil(now/HOUR)*HOUR;
  for(const raw of feed.points){
   const epoch=bounded(raw?.epoch,0,1e11),ms=epoch===null?NaN:epoch*1000;
   if(!Number.isFinite(ms)||ms%HOUR!==0||ms<start||ms>now+26*HOUR)continue;
   const temp=bounded(raw.temperature_c,-40,50),wind=bounded(raw.wind_kmh,0,200),rain=bounded(raw.rain_mm,0,100);
   if(temp!==null||wind!==null||rain!==null)slots.set(ms,{ms,temp,wind,rain});
  }
  if(!slots.size)return null;
  const groups=[[],[],[]],overnight=[];
  for(const row of [...slots.values()].sort((a,b)=>a.ms-b.ms)){
   const local=parts(row.ms),date=key(local),hour=Number(local.hour);
   if(date===todayKey&&hour<6)overnight.push(row);
   else if(date===todayKey&&hour<18)groups[0].push(row);
   else if((date===todayKey&&hour>=18)||(date===tomorrowKey&&hour<6))groups[1].push(row);
   else if(date===tomorrowKey&&hour>=6)groups[2].push(row);
  }
  const periods=groups.map((rows,i)=>{
   if(!rows.length)return {label:['Today · remaining hours','Tonight','Tomorrow · available hours'][i],coverage:'No hourly coverage',summary:'',hours:[],rainTotalMm:null,complete:false,text:i===0&&Number(today.hour)>=18?'Daytime has ended. See tonight’s forecast.':'Hourly forecast temporarily unavailable for this period.'};
   const first=rows[0].ms,end=rows.at(-1).ms+HOUR,temps=rows.map(r=>r.temp).filter(v=>v!==null),winds=rows.map(r=>r.wind).filter(v=>v!==null),rains=rows.map(r=>r.rain).filter(v=>v!==null);
   const contiguous=rows.every((r,index)=>index===0||r.ms===rows[index-1].ms+HOUR);
   // Never call a partial night or day a complete precipitation total.
   const firstLocal=parts(first),endLocal=parts(end);
   const fullWindow=i===0?(key(endLocal)===todayKey&&Number(endLocal.hour)===18)
     :i===1?(key(firstLocal)===todayKey&&Number(firstLocal.hour)===18&&key(endLocal)===tomorrowKey&&Number(endLocal.hour)===6)
     :(key(firstLocal)===tomorrowKey&&Number(firstLocal.hour)===6&&key(endLocal)===tomorrowKey&&Number(endLocal.hour)===18);
   const complete=contiguous&&rains.length===rows.length&&fullWindow;
   const total=rains.reduce((sum,r)=>sum+r,0),rain=rains.length?`${complete?'Rain forecast':'Rain in available hours'}: ${number(total)} mm${complete&&total===0?' · Dry':''}`:'Rain forecast: Not available';
   const label=['Today','Tonight','Tomorrow'][i];
   const partial=!complete||temps.length!==rows.length||winds.length!==rows.length;
   return {label,summary:narrative(rows,i,complete),coverage:`${stamp(first)} – ${stamp(end)} · Irish time${partial?' · partial coverage':''}`,text:`Temperature: ${range(temps,'°C')}\nWind (sustained): ${range(winds,'km/h')}\n${rain}`,hours:rows.map(r=>r.ms),rainTotalMm:complete?total:null,complete};
  });
  let restOfNight=null;
  if(overnight.length){const first=overnight[0].ms,end=overnight.at(-1).ms+HOUR,complete=overnight.every((r,i)=>r.rain!==null&&(!i||r.ms===overnight[i-1].ms+HOUR));restOfNight={label:'Rest of tonight',summary:narrative(overnight,3,complete),coverage:`${stamp(first)} – ${stamp(end)} · Irish time`};}
  return {periods,fetched,restOfNight};
 }
 function compare(primary,secondary,now=Date.now()){
  const shown=describe(primary,now),other=describe(secondary,now);
  if(!shown||!other||primary?.fallback===true||secondary?.source!=='Open-Meteo'||secondary?.fallback!==true)return null;
  const alternative=new Map();
  for(const row of secondary.points){
   const seconds=bounded(row?.epoch,0,1e11),rain=bounded(row?.rain_mm,0,100);
   if(seconds!==null&&seconds*1000%HOUR===0&&rain!==null)alternative.set(seconds*1000,rain);
  }
  return shown.periods.map(period=>{
   if(!period.complete||!period.hours?.length||period.rainTotalMm===null)return null;
   const values=period.hours.map(hour=>alternative.get(hour));
   if(values.some(v=>v===undefined))return null;
   const primaryMm=period.rainTotalMm,otherMm=values.reduce((a,b)=>a+b,0);
   const diff=Math.abs(primaryMm-otherMm),high=Math.max(primaryMm,otherMm),low=Math.min(primaryMm,otherMm);
   const disagree=(diff>=5&&diff>=high*.20)||(low<.5&&high>=3&&diff>=2);
   return {primaryMm,otherMm,disagree,hours:values.length};
  });
 }
 function renderComparison(primary,secondary,now=Date.now()){
  const first=describe(primary,now);
  const results=secondary?compare(primary,secondary,now):null;
  if(!first)return;
  ['Today','Tonight','Tomorrow'].forEach((name,i)=>{
   const node=$('forecast'+name+'Comparison'),summary=$('forecast'+name+'Summary');
   if(!node)return;
   const period=first.periods[i],match=results?.[i];
   node.hidden=false;node.dataset.level='neutral';
   if(primary?.fallback===true){
    node.textContent='Open-Meteo backup only · no independent model comparison.';
   }else if(match){
    if(match.disagree){
     node.dataset.level='disagreement';
     node.textContent=`Rainfall uncertain: Met Éireann ${number(match.primaryMm)} mm vs Open-Meteo ${number(match.otherMm)} mm over the same ${match.hours} hours. Models disagree.`;
     if(summary)summary.textContent='Rainfall amount uncertain · the two forecast models differ significantly.';
    }else{
     node.textContent=`Rain cross-check: Open-Meteo ${number(match.otherMm)} mm vs Met Éireann ${number(match.primaryMm)} mm (same hours).`;
    }
   }else if(period?.rainTotalMm!==null&&period?.rainTotalMm!==undefined&&period.rainTotalMm>=15){
    node.textContent='High rainfall model estimate · independent comparison unavailable. Exact amount uncertain.';
   }else if(period?.hours?.length){
    node.textContent=secondary?'Independent hourly comparison incomplete · no reliable model agreement check.':'Independent model check unavailable · amounts are estimates.';
   }else{
    node.hidden=true;node.textContent='';
   }
  });
 }
 function unavailable(){
  if($("forecastRestOfNight"))$("forecastRestOfNight").hidden=true;
  for(const name of ['Today','Tonight','Tomorrow']){
   if($('forecast'+name+'Comparison'))$('forecast'+name+'Comparison').hidden=true;
   if($('forecast'+name))$('forecast'+name).textContent='Local hourly forecast temporarily unavailable.';
   if($('forecast'+name+'Summary'))$('forecast'+name+'Summary').textContent='';
   if($('forecast'+name+'Coverage'))$('forecast'+name+'Coverage').textContent='No verified hourly coverage';
  }
  if($('forecastFreshness'))$('forecastFreshness').textContent='Hourly forecast unavailable from both providers. Try refreshing shortly.';
  if($('forecastProvider'))$('forecastProvider').textContent='Ardamine hourly forecast · temporarily unavailable';
 }
 function render(feed,now=Date.now()){
  const result=describe(feed,now);if(!result){unavailable();return;}
  const backup = feed?.fallback === true && feed?.source === 'Open-Meteo';
  const provider = $('forecastProvider');
  if (provider) provider.textContent = backup
    ? 'Open-Meteo hourly forecast (backup) for Ardamine · 52.6247°N, 6.25°W'
    : 'Met Éireann hourly point forecast for Ardamine · 52.6247°N, 6.25°W';
  const note = document.querySelector('.forecast-local-note');
  if (note) note.textContent = backup
    ? 'Open-Meteo backup forecast. Only available hours are shown.'
    : 'Ardamine hourly forecast. Only available hours are shown; tomorrow may be partial.';
  window.dispatchEvent(new CustomEvent("parknacross:local-forecast",{detail:feed}));
  ['Today','Tonight','Tomorrow'].forEach((name,i)=>{
   $('forecast'+name+'Label').textContent=result.periods[i].label;
   $('forecast'+name+'Coverage').textContent=result.periods[i].coverage;
   $('forecast'+name).textContent=result.periods[i].text;
   $('forecast'+name+'Summary').textContent=result.periods[i].summary;
  });
  renderComparison(feed,null,now);
  let rest=$('forecastRestOfNight');
  // Only mount an extra forecast article when overnight hours really exist.
  // A permanently hidden first article confuses both visitors' accessibility
  // tree and generic first-card selection in mobile regression tests.
  if(result.restOfNight){
   if(!rest){rest=document.createElement('article');rest.id='forecastRestOfNight';rest.className='forecast-card';$('forecastTodayLabel')?.closest('article,.forecast-card')?.before(rest);}
   rest.replaceChildren();rest.hidden=false;
   for(const [tag,value] of [['h3',result.restOfNight.label],['p',result.restOfNight.summary],['small',result.restOfNight.coverage]]){const node=document.createElement(tag);node.textContent=value;rest.append(node);}
  }else if(rest){rest.hidden=true;rest.replaceChildren();}
  $('forecastFreshness').textContent=`${backup?'Backup':'Local'} hourly forecast retrieved ${stamp(result.fetched)} Irish time`;
 }
 window.ParknacrossLocalForecast={describe,compare,render,renderComparison,unavailable};
})();
