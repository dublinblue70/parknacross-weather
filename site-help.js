(() => {
 'use strict';
 const definitions={
  'dew point':'The temperature at which air would become saturated if cooled. It helps describe how damp or muggy the air feels.',
  'conductivity':'How readily the soil conducts electricity. It reflects dissolved salts and moisture near this sensor; it is not a direct measure of fertiliser need.',
  'sea-level pressure':'Air pressure adjusted to sea level so readings from stations at different heights can be compared.',
  'solar radiation':'The sunlight energy reaching the sensor, measured in watts per square metre. It includes diffuse light on cloudy days.',
  'uv index':'A scale describing the strength of ultraviolet sunlight that can damage skin; it is different from temperature or brightness.',
  'rain rate':'How quickly rain is falling at the latest reading, in millimetres per hour. It is different from the total rain collected today.',
  'peak gust':'The strongest brief wind burst recorded during the period shown.',
  'soil moisture':'The moisture reading around this garden sensor. Compare it with its own trend; one pot does not represent every garden.',
  'archive coverage':'The proportion of expected five-minute observation slots that were saved. It describes completeness, not whether every sensor value is accurate.'
 };
 const panel=document.createElement('div');panel.id='weather-term-tooltip';panel.className='weather-help-tooltip';panel.setAttribute('role','tooltip');panel.hidden=true;
 const title=document.createElement('strong'),explanation=document.createElement('p');panel.append(title,explanation);document.body.append(panel);
 let trigger=null,owner=null,overLabel=false,overTooltip=false,focused=false,closeTimer=null;
 const cancelClose=()=>{if(closeTimer!==null)clearTimeout(closeTimer);closeTimer=null;};
 const hide=()=>{cancelClose();panel.hidden=true;};
 function position(){if(!owner)return;const box=owner.getBoundingClientRect(),width=panel.offsetWidth,height=panel.offsetHeight;panel.style.left=`${Math.max(8,Math.min(box.left,window.innerWidth-width-8))}px`;const below=box.bottom+8;panel.style.top=`${below+height<=window.innerHeight-8?below:Math.max(8,box.top-height-8)}px`;}
 function show(button,node,term){cancelClose();if(trigger!==button){overTooltip=false;focused=false;}trigger=button;owner=node;title.textContent=term.charAt(0).toUpperCase()+term.slice(1);explanation.textContent=definitions[term];panel.hidden=false;position();}
 const scheduleClose=()=>{cancelClose();closeTimer=setTimeout(()=>{if(!overLabel&&!overTooltip&&!focused)hide();},180);};
 panel.addEventListener('pointerenter',()=>{overTooltip=true;cancelClose();});panel.addEventListener('pointerleave',()=>{overTooltip=false;scheduleClose();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
 document.addEventListener('click',event=>{if(!panel.hidden&&!owner?.contains(event.target)&&!panel.contains(event.target))hide();});
 window.addEventListener('resize',()=>{if(!panel.hidden)position();});window.addEventListener('scroll',hide,true);
 function enhance(root){const candidates=[];if(root.matches?.('h2,h3,h4,.metric-label,.metric-name,.weather-window-readings span,.soil-label,.metric-head span,.metric-sub,.hero-condition-details span,.soil-stats span,.solar-chart-panel>strong,dt'))candidates.push(root);candidates.push(...(root.querySelectorAll?.('h2,h3,h4,.metric-label,.metric-name,.weather-window-readings span,.soil-label,.metric-head span,.metric-sub,.hero-condition-details span,.soil-stats span,.solar-chart-panel>strong,dt')||[]));for(const node of candidates){if(node.closest('button,a,dialog,.weather-help-tooltip')||node.querySelector('.weather-term-help'))continue;const text=node.textContent.trim().toLowerCase(),term=Object.keys(definitions).find(key=>text===key||text.startsWith(key+' '));if(!term)continue;const button=document.createElement('button');button.type='button';button.className='weather-term-help';button.textContent='?';button.setAttribute('aria-label',`Explain ${term}`);button.setAttribute('aria-describedby',panel.id);
   node.classList.add('weather-term-label');node.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;overLabel=true;show(button,node,term);});node.addEventListener('pointerleave',event=>{if(event.pointerType==='touch')return;overLabel=false;scheduleClose();});
   button.addEventListener('focus',()=>{show(button,node,term);focused=true;});button.addEventListener('blur',()=>{focused=false;scheduleClose();});
   button.addEventListener('click',event=>{event.stopPropagation();show(button,node,term);focused=document.activeElement===button;});node.append(button);
 }}
 enhance(document.body);
 // Enhance newly rendered labels without rewriting live readings or replacing existing DOM nodes.
 new MutationObserver(records=>{for(const record of records){if(record.target.closest?.('dialog,.weather-term-help,.weather-help-tooltip'))continue;for(const node of record.addedNodes)if(node.nodeType===1&&!node.matches?.('.weather-term-help,.weather-help-tooltip'))enhance(node);}}).observe(document.body,{childList:true,subtree:true});
})();
