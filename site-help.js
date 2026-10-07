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
 const panel=document.createElement('dialog');panel.className='weather-help-dialog';panel.setAttribute('aria-labelledby','weather-help-heading');const title=document.createElement('h2');title.id='weather-help-heading';const explanation=document.createElement('p'),close=document.createElement('button');close.type='button';close.textContent='Close explanation';panel.append(title,explanation,close);document.body.append(panel);let trigger=null;
 const shut=()=>{panel.close();trigger?.focus();};close.addEventListener('click',shut);panel.addEventListener('cancel',()=>trigger?.focus());panel.addEventListener('click',e=>{if(e.target===panel){const rect=panel.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)shut();}});
 function enhance(root){const candidates=[];if(root.matches?.('h2,h3,h4,.metric-label,.metric-name,.weather-window-readings span,.soil-label,.metric-head span,.metric-sub,.hero-condition-details span,.soil-stats span,.solar-chart-panel>strong,dt'))candidates.push(root);candidates.push(...(root.querySelectorAll?.('h2,h3,h4,.metric-label,.metric-name,.weather-window-readings span,.soil-label,.metric-head span,.metric-sub,.hero-condition-details span,.soil-stats span,.solar-chart-panel>strong,dt')||[]));for(const node of candidates){if(node.closest('button,a,dialog')||node.querySelector('.weather-term-help'))continue;const text=node.textContent.trim().toLowerCase(),term=Object.keys(definitions).find(key=>text===key||text.startsWith(key+' '));if(!term)continue;const button=document.createElement('button');button.type='button';button.className='weather-term-help';button.textContent='?';button.setAttribute('aria-label',`Explain ${term}`);button.addEventListener('click',event=>{event.stopPropagation();trigger=button;title.textContent=term.charAt(0).toUpperCase()+term.slice(1);explanation.textContent=definitions[term];panel.showModal();});node.append(button);}}
 enhance(document.body);
 // Enhance newly rendered labels without rewriting live readings or replacing existing DOM nodes.
 new MutationObserver(records=>{for(const record of records){if(record.target.closest?.('dialog,.weather-term-help'))continue;for(const node of record.addedNodes)if(node.nodeType===1&&!node.matches?.('.weather-term-help'))enhance(node);}}).observe(document.body,{childList:true,subtree:true});
})();
