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
  const sentences=[],rains=rows.filter(r=>r.rain!==null),temps=rows.filter(r=>r.temp!==null),winds=rows.filter(r=>r.wind!==null);
  const period=['the remaining daytime hours','tonight','the available hours tomorrow'][i];
  if(complete){
   const wet=rains.filter(r=>r.rain>0),total=rains.reduce((sum,r)=>sum+r.rain,0);
   if(!wet.length)sentences.push(`Dry conditions are forecast for ${period}.`);
   else {
    const timing=ms=>new Date(ms).toLocaleTimeString('en-IE',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const peak=wet.reduce((a,b)=>a.rain>=b.rain?a:b);
    sentences.push(`Rain is forecast during ${wet.length===rows.length?'each hourly period':'some of the hours'} ${i===1?'tonight':'shown'}, totalling about ${number(total)} mm.`);
    if(wet.length<rows.length)sentences.push(`The wettest forecast hour starts at ${timing(peak.ms)} Irish time.`);
   }
  }else sentences.push('Rainfall coverage is incomplete, so dry conditions cannot be confirmed for this whole window.');
  if(temps.length){
   const low=Math.min(...temps.map(r=>r.temp)),high=Math.max(...temps.map(r=>r.temp));
   sentences.push(`Temperatures will ${low===high?'stay around '+number(low):'range between '+number(low)+' and '+number(high)}°C${temps.length>1&&temps.at(-1).temp<=temps[0].temp-2?', becoming cooler towards the end of the period':temps.length>1&&temps.at(-1).temp>=temps[0].temp+2?', rising towards the end of the period':''}.`);
  }
  if(winds.length){
   const low=Math.min(...winds.map(r=>r.wind)),high=Math.max(...winds.map(r=>r.wind));
   sentences.push(`Sustained winds will ${low===high?'stay around '+number(low):'range between '+number(low)+' and '+number(high)} km/h${winds.length>1&&winds.at(-1).wind<=winds[0].wind-5?', easing towards the end of the period':winds.length>1&&winds.at(-1).wind>=winds[0].wind+5?', strengthening towards the end of the period':''}.`);
  }
  if(temps.length!==rows.length||winds.length!==rows.length)sentences.push('Some temperature or wind readings are missing.');
  if(i===2)sentences.push('This describes only the hours shown, rather than a full-day outlook.');
  return sentences.join(' ');
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
  const groups=[[],[],[]];
  for(const row of [...slots.values()].sort((a,b)=>a.ms-b.ms)){
   const local=parts(row.ms),date=key(local),hour=Number(local.hour);
   if(date===todayKey&&hour<18)groups[0].push(row);
   else if((date===todayKey&&hour>=18)||(date===tomorrowKey&&hour<6))groups[1].push(row);
   else if(date===tomorrowKey&&hour>=6)groups[2].push(row);
  }
  const periods=groups.map((rows,i)=>{
   if(!rows.length)return {label:['Today · remaining hours','Tonight','Tomorrow · available hours'][i],coverage:'No hourly coverage',summary:'',text:i===0&&Number(today.hour)>=18?'Daytime has ended. See tonight’s forecast.':'Hourly forecast temporarily unavailable for this period.'};
   const first=rows[0].ms,end=rows.at(-1).ms+HOUR,temps=rows.map(r=>r.temp).filter(v=>v!==null),winds=rows.map(r=>r.wind).filter(v=>v!==null),rains=rows.map(r=>r.rain).filter(v=>v!==null);
   const contiguous=rows.every((r,index)=>index===0||r.ms===rows[index-1].ms+HOUR),complete=contiguous&&rains.length===rows.length;
   const total=rains.reduce((sum,r)=>sum+r,0),rain=rains.length?`${complete?'Rain forecast':'Rain in available hours'}: ${number(total)} mm${complete&&total===0?' · Dry':''}`:'Rain forecast: Not available';
   const label=i===2?(Number(parts(end-1).hour)<12?'Tomorrow morning · available hours':'Tomorrow · available hours'):['Today · remaining hours','Tonight'][i];
   const partial=!contiguous||temps.length!==rows.length||winds.length!==rows.length||rains.length!==rows.length;
   return {label,summary:narrative(rows,i,complete),coverage:`${stamp(first)} – ${stamp(end)} · Irish time${partial?' · some readings missing':''}`,text:`Temperature: ${range(temps,'°C')}\nWind: ${range(winds,'km/h')}\n${rain}`};
  });
  return {periods,fetched};
 }
 function unavailable(){
  for(const name of ['Today','Tonight','Tomorrow']){
   if($('forecast'+name))$('forecast'+name).textContent='Local hourly forecast temporarily unavailable.';
   if($('forecast'+name+'Summary'))$('forecast'+name+'Summary').textContent='';
   if($('forecast'+name+'Coverage'))$('forecast'+name+'Coverage').textContent='No verified hourly coverage';
  }
  if($('forecastFreshness'))$('forecastFreshness').textContent='The Ardamine point forecast could not be verified. Try refreshing shortly.';
 }
 function render(feed,now=Date.now()){
  const result=describe(feed,now);if(!result){unavailable();return;}
  ['Today','Tonight','Tomorrow'].forEach((name,i)=>{
   $('forecast'+name+'Label').textContent=result.periods[i].label;
   $('forecast'+name+'Coverage').textContent=result.periods[i].coverage;
   $('forecast'+name).textContent=result.periods[i].text;
   $('forecast'+name+'Summary').textContent=result.periods[i].summary;
  });
  $('forecastFreshness').textContent=`Local hourly forecast retrieved ${stamp(result.fetched)} Irish time`;
 }
 window.ParknacrossLocalForecast={describe,render,unavailable};
})();
