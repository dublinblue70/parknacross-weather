/* Local rain forecast skill: paired Met Éireann and Open-Meteo against WH40H. */
(() => {
 'use strict';
 const main=document.querySelector('[data-forecast-accuracy]');
 if(!main)return;
 const base=(window.PARKNACROSS_CONFIG?.apiBase||window.PARKNACROSS_API_BASE||
  'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/,'');
 const status=document.getElementById('forecastAccuracyStatus');
 const set=(id,value)=>{const element=document.getElementById(id);if(element)element.textContent=value;};
 const fmt=value=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(1)+' mm':'—';
 const when=epoch=>new Date(epoch*1000).toLocaleString('en-IE',{
  timeZone:'Europe/Dublin',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
 });
 function render(data){
  const count=Number(data.paired_periods_30d||0),met=data.met_eireann_mae_mm,open=data.open_meteo_mae_mm;
  const winner=data.winner==='met_eireann'?'Met Éireann':data.winner==='open_meteo'?'Open-Meteo':null;
  const pending=count===0?'Awaiting the first completed, quality-checked forecast comparisons.':
   count<10?count+' comparable periods logged. A model leader needs at least 10.':
   data.winner==='too_close'?'The models are performing similarly so far.':
   winner?winner+' currently has the lower mean absolute rainfall error.':'More evidence is needed.';
  if(status)status.textContent=pending;
  set('forecastAccuracyCount',String(count));
  set('forecastAccuracyMet',fmt(met));
  set('forecastAccuracyOpen',fmt(open));
  set('forecastAccuracyLeader',winner&&count>=10?winner:'Not established');
  const table=document.getElementById('forecastAccuracyRows');
  if(!table)return;
  table.replaceChildren();
  const history=Array.isArray(data.history)?data.history:[];
  if(!history.length){
   const row=document.createElement('tr'),cell=document.createElement('td');
   cell.colSpan=5;cell.textContent='No comparable, verified periods yet. Forecasts are only scored after the weather window ends and the gauge archive passes quality checks.';
   row.append(cell);table.append(row);return;
  }
  for(const record of history){
   const row=document.createElement('tr');
   const cells=[
     when(Number(record.start_epoch))+(record.period==='night'?' · Night':' · Day'),
     fmt(record.observed_mm),fmt(record.met_eireann_mm),fmt(record.open_meteo_mm),
     fmt(Math.abs(Number(record.met_error_mm)))+' / '+fmt(Math.abs(Number(record.open_error_mm)))
   ];
   for(const value of cells){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
   table.append(row);
  }
 }
 async function load(){
  try{
   const response=await fetch(base+'/forecast-accuracy',{cache:'no-store',
    ...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(12000)}:{})});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   if(data?.available!==true)throw Error('Forecast verification endpoint unavailable');
   render(data);
  }catch{
   if(status)status.textContent='Forecast accuracy tracking is awaiting the Worker update or a connection. No scores are available yet.';
   set('forecastAccuracyCount','—');set('forecastAccuracyMet','—');set('forecastAccuracyOpen','—');set('forecastAccuracyLeader','Not established');
  }
 }
 load();
})();
