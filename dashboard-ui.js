(() => {
 'use strict';
 document.addEventListener('DOMContentLoaded',()=>{
  const button=document.getElementById('dashboardRefresh'),status=document.getElementById('dashboardRefreshStatus');if(!button||!status)return;
  function date(){document.getElementById('dashboardDate').textContent=new Intl.DateTimeFormat('en-IE',{timeZone:'Europe/Dublin',weekday:'long',day:'numeric',month:'long'}).format(new Date())+' · Irish time';}
  date();window.addEventListener('parknacross:current-observation',date);document.addEventListener('visibilitychange',()=>{if(!document.hidden)date();});
  button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;button.textContent='Refreshing…';button.setAttribute('aria-busy','true');status.textContent='Refreshing weather sources…';
   try{if(typeof window.ParknacrossDashboardRefresh!=='function')throw Error('Refresh unavailable');const result=await window.ParknacrossDashboardRefresh();status.textContent=result?.busy?'A weather refresh is already running.':!result?.live?'The live feed could not refresh. Available saved readings remain visible; check their observation time.':result.incomplete?'Weather refreshed. Some archive details could not refresh.':'Weather refreshed. Observation times show when readings were recorded.';}
   catch(_){status.textContent='Weather could not refresh. Please try again.';}finally{button.disabled=false;button.textContent='Refresh weather';button.setAttribute('aria-busy','false');date();}
  });
  document.querySelectorAll('.dashboard-shortcuts a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{const target=document.getElementById(link.getAttribute('href').slice(1));if(!target)return;
   if(target.closest('[data-user-hidden]')){event.preventDefault();const controls=document.querySelector('.dashboard-customise');if(controls){controls.open=true;controls.scrollIntoView({block:'start',behavior:'instant'});}status.textContent=link.textContent+' is hidden in your saved layout. Enable its section in Customise your dashboard.';return;}
   window.requestAnimationFrame(()=>window.dispatchEvent(new Event('hashchange')));
  }));
 });
})();
