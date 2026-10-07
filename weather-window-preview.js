(() => {
 'use strict';
 const $=id=>document.getElementById(id),scene=$('adminWindowPreview');if(!scene)return;
 let current=null,point=null,forecast=null,ticket=0;
 const skyLabels={clear:'Clear', 'mostly-clear':'Mostly clear','partly-cloudy':'Partly cloudy',cloudy:'Cloudy',overcast:'Overcast',unknown:'Cloud cover unavailable'},rainLabels={none:'No rain',light:'Light rain / drizzle',rain:'Rain',heavy:'Heavy rain',thunderstorm:'Thunder / lightning with rain',measured:'Station rain'};
 function render(){
  const selection=$('adminSky').value||'auto',rainSelection=$('adminRain').value||'auto';
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const automatic=window.ParknacrossWeatherSky?.resolvePoint(point)||window.ParknacrossWeatherSky?.resolve(forecast,{day:`${values.year}-${values.month}-${values.day}`,hour:Number(values.hour),isNight:false})||{sky:'unknown'};
  const sky=selection==='auto'?automatic.sky:selection,rate=current?.rain_rate_mm_h;
  const rain=rainSelection==='auto'?(rate!==null&&rate!==undefined&&Number.isFinite(Number(rate))?Number(rate)>0?'measured':'none':'unknown'):rainSelection;
  scene.dataset.sky=sky;scene.dataset.rain=rain;scene.dataset.wind='calm';scene.dataset.light='day';
  const text=`Preview only · ${skyLabels[sky]||'Cloud cover unavailable'} (${selection==='auto'?'automatic forecast':'your selection'}) · ${rainLabels[rain]||'Rain reading unavailable'} (${rainSelection==='auto'?'station reading':'manual visual setting'}). Daylight preview; live wind and sun position appear on the dashboard. Visible to you until Save illustration settings is pressed.`;
  $('windowPreviewStatus').textContent=text;scene.setAttribute('aria-label',text);
 }
 async function refresh(){const turn=++ticket,base=(window.PARKNACROSS_CONFIG?.apiBase||'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/,'');const results=await Promise.allSettled(['/current','/met/point-sky','/met/forecast'].map(async path=>{const response=await fetch(base+path,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();return response.json();}));if(turn!==ticket)return;current=results[0].status==='fulfilled'?results[0].value:null;point=results[1].status==='fulfilled'?results[1].value:null;forecast=results[2].status==='fulfilled'?{...results[2].value,day:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin'}).format(new Date()),fetchedAt:Date.now()}:null;render();}
 for(const id of ['adminSky','adminRain','adminSkyDuration'])$(id)?.addEventListener('change',render);
 window.addEventListener('parknacross:window-preview-update',render);window.addEventListener('parknacross:admin-signin',refresh);window.addEventListener('parknacross:admin-signout',()=>{ticket++;current=point=forecast=null;});render();if(!$('adminWorkspace').hidden)refresh();
})();
