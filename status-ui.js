(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const guidance={
 site:['The public website could not be verified from this device.','Check your internet connection, then retry.','index.html'],
 api:['The weather data service needs checking. Live and archived features may be affected.','Retry the service check; review its details if it continues to fail.','station.html'],
 feed:['The latest local weather observation is delayed, unavailable or has an invalid timestamp.','Check the gateway’s internet connection and Ecowitt reading time.','station.html'],
 ingest:['Recent five-minute archive collection needs checking. Live readings may still be available.','Check collection details and compare the latest saved observations.','history.html#completenessHeading'],
 battery:['The outdoor array’s battery reading needs checking. An unavailable value does not mean low batteries.','Check the latest battery indication in Ecowitt before taking action.','station.html'],
 soil:['The latest upload does not confirm a current soil reading. Other weather sensors can still work.','Check the soil sensor’s placement and connection in Ecowitt.','graphs.html#soilMoistureCard'],
 gustQuality:['Wind-reading quality checks need review. Original readings remain in the archive.','Review the flagged readings and recent station changes.','maintenance.html'],
 quality:['Recent observation checks found an issue or could not finish.','Expand the observation checks and compare the relevant charts.','graphs.html'],
 samples:['Fewer recent readings were saved than expected, or the count could not be verified.','Compare archive coverage and collection status; this alone does not prove a current outage.','history.html#completenessHeading'],
 gap:['Recent archive intervals are missing or could not be checked.','Review the dated coverage grid and the current collection status.','history.html#completenessHeading'],
 reliability:['Monthly saved-reading coverage is partial or could not be checked.','Review the dates affected; monthly completeness is separate from current feed health.','history.html#completenessHeading'],
 backup:['A recent successful archive backup has not been confirmed.','Review backup details and the configured backup destination.','downloads.html'],
 coverageFeed:['The dated archive-coverage feature could not be verified.','Retry this check; other historical observations may still be available.','history.html#completenessHeading'],
 dailyFeed:['Recent daily summaries could not be verified.','Retry the check and compare History with current observations.','history.html'],
 recordsFeed:['Archive statistics or records could not be verified.','Retry the check; live dashboard readings are checked separately.','records.html'],
 summaryFeed:['The observation source for Daily Summary is missing or delayed.','Retry the source and compare its timestamps with the live dashboard.','summary.html'],
 exportFeed:['Recent export-preview observations or required fields could not be verified.','Retry the preview before downloading; this check includes yesterday to avoid a midnight gap.','downloads.html'],
 rainEventsFeed:['The rain-event history feature could not be verified.','Retry the source; current rainfall readings may still be available.','rain.html'],
 tide:['Official Arklow tide predictions could not be verified. Local weather readings are independent.','Check the coastal page for available predictions and source information.','coast.html'],
 m2:['The offshore M2 buoy reading is unavailable or aging. This does not indicate a local station failure.','Check the coastal page; a separately labelled local model may still be available.','coast.html'],
 landWarning:['The official Wexford warning feed could not be verified.','Check Met Éireann directly for current warnings.','https://www.met.ie/warnings-today.html'],
 marineWarning:['The official local marine-warning feed could not be verified.','Check Met Éireann directly before relying on marine conditions.','https://www.met.ie/warnings-today.html'],
 facebook:['Today’s Facebook delivery has not been confirmed, or its status is unavailable.','Check Buffer and the visible Facebook post.','https://www.facebook.com/1361994206992789'],
 x:['Today’s X delivery has not been confirmed, or its status is unavailable.','Check Buffer and the visible X post.','https://x.com/ParknacrossWx']
 };
 let cards=[],ready=false,issuesOnly=false,running=false,activeSource=null;
 let previous={},changes=[];
 try{const data=JSON.parse(sessionStorage.getItem('parknacross-health-session')||'{}');previous=data.previous&&typeof data.previous==='object'?data.previous:{};changes=Array.isArray(data.changes)?data.changes.filter(c=>guidance[c.key]&&['recovered','new','worsened','changed'].includes(c.kind)&&Number.isFinite(Date.parse(c.at))).slice(0,20):[];}catch{}
 const persist=()=>{try{sessionStorage.setItem('parknacross-health-session',JSON.stringify({previous,changes}));}catch{}};
 const formatTime=value=>new Date(value).toLocaleString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 function label(text,state){
  if(text==='NOT SET')return 'Not configured';
  if(text==='PENDING')return 'Pending';
  if(['UNAVAILABLE','DOWN','FAIL','UNKNOWN'].includes(text))return 'Unavailable';
  if(text==='STALE')return 'Stale';
  if(['AGING','DELAY','DELAYED','SLOW'].includes(text))return 'Delayed';
  if(['CHECK','WAITING','VERIFY'].includes(text))return 'Not verified';
  return state==='good'?'Healthy':state==='bad'?'Needs attention':state==='warn'?'Review':'Checking';
 }
 function init(){
  if(ready)return;ready=true;
  cards=[...document.querySelectorAll('[data-health-key]')].map(element=>({element,key:element.dataset.healthKey,source:element.dataset.healthSource,title:element.querySelector('h2').textContent}));
  $('healthIssuesOnly')?.addEventListener('change',event=>{issuesOnly=event.target.checked;applyFilter();});
  for(const button of document.querySelectorAll('[data-retry-source]'))button.addEventListener('click',()=>window.runChecks(button.dataset.retrySource));
 }
 function applyFilter(){
  for(const card of cards)card.element.hidden=issuesOnly&&!['warn','bad'].includes(card.element.dataset.healthState);
  for(const group of document.querySelectorAll('.health-group')){
   const grouped=cards.filter(c=>group.contains(c.element));if(!grouped.length)continue;
   const shown=grouped.filter(c=>!c.element.hidden).length;group.hidden=issuesOnly&&shown===0;
   const count=group.querySelector('.health-group-count');if(count)count.textContent=issuesOnly?`${shown} need attention`:`${grouped.filter(c=>c.element.dataset.healthState==='good').length} healthy · ${grouped.length} checks`;
  }
  if($('healthFilteredEmpty'))$('healthFilteredEmpty').hidden=!issuesOnly||cards.some(c=>!c.element.hidden);
 }
 function start(source){init();running=true;activeSource=source;for(const card of cards){if(!source||card.source===source){card.element.dataset.healthState='checking';const badge=$(card.key+'Badge');badge.className='badge';badge.textContent='Checking';}}applyFilter();}
 function update(results,meta,isRunning){
  init();running=isRunning;
  let healthy=0,pending=0;const issues=[];
  for(const card of cards){
   const checked=Boolean(results[card.source])&&Boolean(meta[card.source]);
   const badge=$(card.key+'Badge');
   const state=!checked?'checking':badge.classList.contains('bad')?'bad':badge.classList.contains('warn')?'warn':badge.classList.contains('good')?'good':'checking';
   card.element.dataset.healthState=state;
   if(state==='good')healthy++;else if(state==='checking')pending++;else issues.push(card);
   const time=$(card.key+'CheckedAt');if(time)time.textContent=checked?`Checked ${formatTime(meta[card.source].done)} · Irish time`:'Not yet checked';
   const technical=card.element.querySelector('.health-technical');
   let timing=technical?.querySelector('.health-response-time');
   if(technical&&!timing){timing=document.createElement('p');timing.className='health-response-time';technical.append(timing);}
   if(timing)timing.textContent=checked?`Source check completed in ${(meta[card.source].elapsed/1000).toFixed(2)} seconds.`:'Response time will appear after the source check.';
   const info=guidance[card.key];const impact=$(card.key+'Impact');
   if(impact)impact.textContent=state==='checking'?'Checking this source…':state==='good'?(card.key==='battery'?'Reported battery information is available; its measurement time may be unknown.':card.key==='soil'?'Soil values are included in the gateway upload; the sensor’s own transmission time is not supplied.':card.key==='facebook'||card.key==='x'?'Delivery status is reported by the weather data service. Confirm the visible post on the platform.':'This check passed. Expand details for the source result.'):(info?.[0]||'This check needs review.');
   if(checked&&state!=='checking'&&!isRunning){
    const before=previous[card.key];
    if(['good','warn','bad'].includes(before)&&before!==state){
     changes.unshift({key:card.key,kind:state==='good'?'recovered':before==='good'?'new':state==='bad'?'worsened':'changed',at:new Date().toISOString()});changes=changes.slice(0,20);
    }
    previous[card.key]=state;
   }
   const button=card.element.querySelector('[data-retry-source]');button.disabled=running;button.textContent=running&&(!activeSource||activeSource===card.source)?'Checking…':'Recheck';
  }
  persist();
  $('healthCounts').textContent=`${issues.length} need attention · ${healthy} healthy${pending?` · ${pending} checking`:''}`;
  $('healthProgress').textContent=`${Object.keys(results).length} of 18 sources checked${running?' · checks running':' · refreshes about every 5 minutes'}`;
  $('healthAttentionIntro').textContent=issues.length?'Each item explains the affected feature and the next step. Core services are assessed separately below.':pending?'No issues in completed checks. Remaining sources are still being checked.':'No issues found in the completed checks.';
  const host=$('healthAttentionList');host.replaceChildren();
  for(const card of issues.sort((a,b)=>(a.element.dataset.healthState==='bad'?-1:1)-(b.element.dataset.healthState==='bad'?-1:1))){
   const li=document.createElement('li');li.className='health-attention-item '+card.element.dataset.healthState;
   const title=document.createElement('h3');title.textContent=card.title;
   const impact=document.createElement('p');impact.textContent=guidance[card.key][0];
   const action=document.createElement('p');action.className='health-next-step';action.textContent=guidance[card.key][1];
   const links=document.createElement('div');links.className='health-attention-actions';
   const inspect=document.createElement('a');inspect.href='#health-'+card.key;inspect.textContent='View check';
   const feature=document.createElement('a');feature.href=guidance[card.key][2];feature.textContent='Open related page';if(feature.href.startsWith('https:')&&!feature.href.startsWith(location.origin)){feature.target='_blank';feature.rel='noopener noreferrer';}
   const retry=document.createElement('button');retry.type='button';retry.textContent=running?'Checking…':'Retry';retry.disabled=running;retry.setAttribute('aria-label','Retry '+card.title);retry.addEventListener('click',()=>window.runChecks(card.source));
   links.append(inspect,feature,retry);li.append(title,impact,action,links);host.append(li);
  }
  const core=cards.filter(c=>['site','api','feed','ingest'].includes(c.key));
  const bad=core.some(c=>c.element.dataset.healthState==='bad'),warn=core.some(c=>c.element.dataset.healthState==='warn'),waiting=core.some(c=>c.element.dataset.healthState==='checking');
  const overall=$('overall');overall.className='overall '+(bad?'bad':warn?'warn':waiting?'':'good');
  $('overallTitle').textContent=bad?'A core weather service needs attention':warn?'Core weather services need review':waiting?'Checking core weather services…':'Core weather services are healthy';
  const other=issues.filter(c=>!core.includes(c)).length;
  $('overallText').textContent=(bad||warn?'Review the core-service checks below. ':waiting?'Finished checks remain visible while other sources respond. ':'Website, latest observations and archive collection passed. ')+(other?`${other} supporting check${other===1?' has':'s have'} warnings; this does not by itself mean the weather station is offline.`:'Supporting services are shown separately.');
  const list=$('healthChanges');list.replaceChildren();
  for(const change of changes){const item=document.createElement('li');const card=cards.find(c=>c.key===change.key);item.textContent=`${change.kind==='recovered'?'Recovered':change.kind==='new'?'New issue':change.kind==='worsened'?'Needs more attention':'Status changed'} · ${card?.title||change.key} · ${formatTime(change.at)} Irish time`;list.append(item);}
  if(!changes.length){const item=document.createElement('li');item.textContent='No changes recorded yet. A previous completed result is needed to detect a new issue or recovery.';list.append(item);}
  applyFilter();
 }
 window.ParknacrossHealthUI={start,update,label};
 document.addEventListener('DOMContentLoaded',init);
})();
