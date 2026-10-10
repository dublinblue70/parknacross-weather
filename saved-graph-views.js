(() => {
 'use strict';
 const key='parknacross:saved-graphs:v1',metrics={gTemp:'Temperature',gWind:'Wind & gusts',gPressure:'Pressure',gRain:'Rain',gSolar:'Solar radiation',gUv:'UV index',gSoilMoisture:'Soil moisture',gSoilDetail:'Soil temperature',gSoilEc:'Soil conductivity'};
 function valid(view){return view&&typeof view.name==='string'&&view.name.length>0&&view.name.length<=45&&metrics[view.metric]&&([6,24,48,168,720].includes(view.hours)||(Number.isFinite(view.from)&&Number.isFinite(view.to)&&view.from>0&&view.to>view.from&&view.to-view.from<=31*86400));}
 function read(){try{return (JSON.parse(localStorage.getItem(key)||'[]')).filter(valid).slice(0,8);}catch{return [];}}
 function url(view){const u=new URL('graphs.html',location.href);if(view.from&&view.to){u.searchParams.set('from',Math.floor(view.from));u.searchParams.set('to',Math.floor(view.to));}else u.searchParams.set('hours',view.hours);u.searchParams.set('metric',view.metric);u.hash=view.metric;return u;}
 function current(metric){const selected=window.ParknacrossGraphSelection?.get()||{hours:24},zoom=window.ParknacrossChartExplorer?.getRange?.();return zoom?{from:zoom.from/1000,to:Math.min(Date.now()/1000,zoom.to/1000),metric}:selected.range?{from:selected.range.from,to:selected.range.to,metric}:{hours:selected.hours,metric};}
 window.ParknacrossSavedGraphs={read,valid,url,current};
 document.addEventListener('DOMContentLoaded',()=>{
 const host=document.getElementById('savedGraphViews');if(!host)return;
 const metric=document.getElementById('savedGraphMetric'),name=document.getElementById('savedGraphName'),picker=document.getElementById('savedGraphPicker'),note=document.getElementById('savedGraphStatus');
 const initial=new URL(location.href).searchParams.get('metric');if(metrics[initial])metric.value=initial;
 function render(){picker.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Choose a saved view';picker.append(blank);read().forEach((v,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=v.name;picker.append(o);});document.getElementById('openSavedGraph').disabled=document.getElementById('removeSavedGraph').disabled=picker.value==='';}
 document.getElementById('saveGraphView').addEventListener('click',()=>{const label=name.value.trim();if(!label){note.textContent='Give this view a name first.';name.focus();return;}const v={...current(metric.value),name:label};if(!valid(v)){note.textContent='Wait for the charts to load, then save a valid period.';return;}const views=read(),existing=views.findIndex(x=>x.name.toLowerCase()===label.toLowerCase());if(existing>=0)views[existing]=v;else if(views.length>=8){note.textContent='Eight views are saved. Remove one or reuse an existing name.';return;}else views.push(v);try{localStorage.setItem(key,JSON.stringify(views));render();note.textContent='View saved on this device, including its measurement and zoom.';}catch{note.textContent='This browser could not save the view.';}});
 picker.addEventListener('change',()=>{document.getElementById('openSavedGraph').disabled=document.getElementById('removeSavedGraph').disabled=picker.value==='';});
 document.getElementById('openSavedGraph').addEventListener('click',()=>{const v=read()[Number(picker.value)];if(picker.value!==''&&valid(v))location.href=url(v).href;});
 document.getElementById('removeSavedGraph').addEventListener('click',()=>{if(picker.value==='')return;try{const views=read();views.splice(Number(picker.value),1);localStorage.setItem(key,JSON.stringify(views));render();note.textContent='Saved view removed.';}catch{note.textContent='This browser could not remove the view.';}});
 metric.addEventListener('change',()=>{const node=document.getElementById(metric.value);node?.scrollIntoView({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});render();
 });
})();
