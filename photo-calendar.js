(() => {
 'use strict';
 const $=id=>document.getElementById(id),host=$('photoCalendar');if(!host)return;
 let month=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit'}).format(new Date()),supported=false,sequence=0;
 function shift(delta){const [year,m]=month.split('-').map(Number);const d=new Date(Date.UTC(year,m-1+delta,1,12));month=d.toISOString().slice(0,7);load();}
 async function load(){
  const turn=++sequence;host.replaceChildren();const first=new Date(month+'-01T12:00:00Z'),days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7;
  $('photoMonthTitle').textContent=first.toLocaleDateString('en-IE',{timeZone:'UTC',month:'long',year:'numeric'});
  if(!supported){$('photoCalendarNote').textContent='Photo calendar requires Worker v38.4.89. Check compatibility after deploying it.';return;}
  $('photoCalendarNote').textContent='Loading photo dates…';
  try{const base=(window.PARKNACROSS_CONFIG?.apiBase||'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/,''),key=sessionStorage.getItem('parknacrossAdminKey')||'';if(!key)return;const response=await fetch(base+'/sky-photo/archive/dates?month='+encodeURIComponent(month),{headers:{'X-Parknacross-Admin-Key':key},cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Could not load photo dates.');const data=await response.json();if(turn!==sequence)return;if(data.month!==month)throw Error('The calendar response did not match the selected month.');const counts=new Map((data.days||[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.day)&&x.day.startsWith(month)&&Number(x.count)>0).map(x=>[x.day,Math.floor(Number(x.count))]));
   for(const label of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const span=document.createElement('span');span.textContent=label;span.className='photo-weekday';host.append(span);}
   for(let i=0;i<offset;i++){const span=document.createElement('span');span.setAttribute('aria-hidden','true');host.append(span);}
   for(let n=1;n<=days;n++){const day=month+'-'+String(n).padStart(2,'0'),count=counts.get(day)||0,button=document.createElement('button');button.type='button';button.className='photo-calendar-day';button.textContent=String(n);button.disabled=!count;button.dataset.day=day;button.dataset.hasPhoto=String(Boolean(count));button.setAttribute('aria-pressed',String($('archiveDay').value===day));button.setAttribute('aria-label',`${day} · ${count} photograph${count===1?'':'s'}`);if(count)button.addEventListener('click',()=>{$('archiveDay').value=day;$('archiveDay').dispatchEvent(new Event('change',{bubbles:true}));for(const cell of host.querySelectorAll('[data-day]'))cell.setAttribute('aria-pressed',String(cell.dataset.day===day));});host.append(button);}
   $('photoCalendarNote').textContent=counts.size?`${counts.size} date${counts.size===1?'':'s'} with photographs. Highlighted dates can be selected.`:'No photographs saved this month.';
  }catch(error){if(turn===sequence)$('photoCalendarNote').textContent=error.message||'Photo dates unavailable.';}
 }
 $('photoMonthPrev')?.addEventListener('click',()=>shift(-1));$('photoMonthNext')?.addEventListener('click',()=>shift(1));
 $('archiveDay')?.addEventListener('change',()=>{const next=$('archiveDay').value.slice(0,7);if(next&&next!==month){month=next;load();}else for(const cell of host.querySelectorAll('[data-day]'))cell.setAttribute('aria-pressed',String(cell.dataset.day===$('archiveDay').value));});
 $('archiveAll')?.addEventListener('click',()=>{for(const cell of host.querySelectorAll('[data-day]'))cell.setAttribute('aria-pressed','false');});
 window.addEventListener('parknacross:photo-archive-update',load);window.addEventListener('parknacross:capabilities',event=>{supported=event.detail.photo_calendar===true;load();});window.addEventListener('parknacross:admin-signout',()=>{sequence++;supported=false;host.replaceChildren();$('photoCalendarNote').textContent='Sign in to see saved photo dates.';});load();
})();
