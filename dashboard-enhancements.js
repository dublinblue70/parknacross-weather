(() => {
 'use strict';
 document.body.classList.add('compact-dashboard');
 const groups=[['.weather-window-section','Ardamine Weather Window'],['.wear-today-section','What to wear'],['.astronomy-strip','Sun and moon'],['.metrics-section','Detailed station readings'],['#soilPanel','Garden soil'],['#forecast','Met Éireann forecast'],['.climate-section','Station climate'],['.signature-section','Local context'],['#graphs','Weather trend charts'],['#records','Station records']];
 const mobile=window.matchMedia('(max-width:640px)');
 for(const [selector,label] of groups){
   const section=document.querySelector(selector);if(!section)continue;
   const body=document.createElement('div');body.className='mobile-detail-body';body.id=`mobile-detail-${label.toLowerCase().replace(/[^a-z]+/g,'-')}`;
   while(section.firstChild)body.append(section.firstChild);
   const button=document.createElement('button');button.type='button';button.className='mobile-detail-toggle';button.setAttribute('aria-controls',body.id);button.setAttribute('aria-expanded','false');button.textContent=`${label} ▾`;body.dataset.collapsed='true';section.append(button,body);
   button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));body.dataset.collapsed=String(!open);button.textContent=`${label} ${open?'▴':'▾'}`;if(open)window.dispatchEvent(new Event('resize'));});
   const revealAnchor=()=>{const target=document.getElementById(location.hash.slice(1));if(target&&(target===section||body.contains(target))){button.setAttribute('aria-expanded','true');body.dataset.collapsed='false';}};
   window.addEventListener('hashchange',revealAnchor);revealAnchor();
 }
 mobile.addEventListener('change',()=>window.dispatchEvent(new Event('resize')));
 const scene=document.getElementById('weatherWindowScene'),details=document.getElementById('weatherWindowInfo');
 if(scene&&details){
   scene.tabIndex=0;scene.setAttribute('role','button');scene.setAttribute('aria-controls',details.id);scene.setAttribute('aria-expanded','false');
   const toggle=()=>{details.open=!details.open;scene.setAttribute('aria-expanded',String(details.open));};
   scene.addEventListener('click',toggle);scene.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
   details.addEventListener('toggle',()=>scene.setAttribute('aria-expanded',String(details.open)));
   const update=()=>{document.getElementById('weatherWindowExplanation').textContent=document.getElementById('weatherWindowSkySource')?.textContent||'Sky source unavailable.';document.getElementById('weatherWindowMeasured').textContent=document.getElementById('weatherWindowObservation')?.textContent||'Local readings are loading.';};
   for(const id of ['weatherWindowSkySource','weatherWindowObservation']){const node=document.getElementById(id);if(node)new MutationObserver(update).observe(node,{childList:true,subtree:true,characterData:true});}update();
 }
})();
