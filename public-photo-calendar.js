(() => {
 'use strict';const $=id=>document.getElementById(id),host=$('publicPhotoCalendar');if(!host)return;
 const api=(window.PARKNACROSS_CONFIG?.apiBase||'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/,'');const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());let month=(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(new URL(location.href).searchParams.get('day')||'')&&new URL(location.href).searchParams.get('day')<=today?new URL(location.href).searchParams.get('day'):today).slice(0,7),sequence=0,photoSequence=0;
 const viewer=$('publicPhotoViewer');let selectedDay=null,photoTimer=null,photos=[],photoIndex=0,fullGallery=false;
 const photoControls=document.createElement("div"),previous=document.createElement("button"),next=document.createElement("button"),count=document.createElement("span");photoControls.className="review-photo-controls";previous.type=next.type="button";previous.textContent="← Previous photo";next.textContent="Next photo →";photoControls.append(previous,count,next);$("publicPhotoCaption").before(photoControls);photoControls.hidden=true;
 function stopPhoto(){photoSequence++;clearTimeout(photoTimer);photoTimer=null;}
 function closePhoto(){stopPhoto();if(typeof viewer.close==='function')viewer.close();else viewer.removeAttribute('open');}
 async function show(day,wantedPhoto=null){
  photos=[];photoControls.hidden=true;
  clearTimeout(photoTimer);const ticket=++photoSequence;selectedDay=day;
  const image=document.createElement('img');image.id='publicArchivePhoto';image.className='public-archive-photo';image.alt='Sky over Parknacross on '+day;image.loading='eager';image.hidden=true;$('publicArchivePhoto').replaceWith(image);
  $('publicPhotoViewerTitle').textContent='Sky over Parknacross · '+day;$('publicPhotoCaption').textContent='';$('publicPhotoStatus').textContent='Loading photograph for '+day+'…';$('publicPhotoImageRetry').hidden=true;
  $('publicPhotoWeatherLink').href='history.html?day='+encodeURIComponent(day)+'#dayDetailTitle';$('publicPhotoWeatherLink').hidden=false;
  if(!viewer.open){if(typeof viewer.showModal==='function')viewer.showModal();else viewer.setAttribute('open','');}
  for(const cell of host.querySelectorAll('[data-day]'))cell.setAttribute('aria-pressed',String(cell.dataset.day===day));
  const failed=message=>{if(ticket!==photoSequence)return;clearTimeout(photoTimer);image.hidden=true;$('publicPhotoStatus').textContent=message;$('publicPhotoImageRetry').hidden=false;};
  photoTimer=setTimeout(()=>failed('This photograph is taking too long to load. Please retry.'),20000);
  try{
   const response=await fetch(api+'/sky-photo/history?day='+encodeURIComponent(day),{cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('The photograph could not be loaded. Please retry.');const data=await response.json();if(ticket!==photoSequence)return;
   if(data.day!==day||!data.photo?.photo_id)throw Error('No photograph is available for this date.');
   fullGallery=Array.isArray(data.photos);photos=Array.isArray(data.photos)&&data.photos.length?data.photos:[data.photo];photoIndex=wantedPhoto?photos.findIndex(p=>p.photo_id===wantedPhoto):photos.length-1;if(photoIndex<0)photoIndex=photos.length-1;
   displayPhoto(day,photos[photoIndex],image,ticket);

  }catch(error){failed(error.name==='TimeoutError'?'The photo service took too long to respond. Please retry.':error.message);}
 }
 function displayPhoto(day,photo,image,ticket){
  clearTimeout(photoTimer);photoControls.hidden=false;previous.disabled=photoIndex===0;next.disabled=photoIndex===photos.length-1;count.textContent=fullGallery?(photoIndex+1)+" of "+photos.length:'Latest saved view';
  image.hidden=true;$('publicPhotoStatus').textContent='Loading photograph…';
  const failed=()=>{if(ticket!==photoSequence)return;clearTimeout(photoTimer);image.hidden=true;$('publicPhotoStatus').textContent='Photograph could not be displayed. Please retry.';$('publicPhotoImageRetry').hidden=false;};
  photoTimer=setTimeout(failed,20000);image.onload=()=>{if(ticket!==photoSequence)return;clearTimeout(photoTimer);image.hidden=false;$('publicPhotoStatus').textContent=fullGallery?'Photograph '+(photoIndex+1)+' of '+photos.length+' for '+day:'Latest saved photograph for '+day+' · full gallery awaits the data-service update.';$('publicPhotoImageRetry').hidden=true;};image.onerror=failed;
  image.src=api+'/sky-photo/history/image?day='+encodeURIComponent(day)+'&photo_id='+encodeURIComponent(photo.photo_id)+'&retry='+ticket;
  $('publicPhotoCaption').textContent=(photo.caption||'')+(photo.captured_at?' · Saved '+new Date(photo.captured_at).toLocaleString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' Irish time':'');
 }
 function step(delta){const index=photoIndex+delta;if(index<0||index>=photos.length)return;photoIndex=index;const ticket=++photoSequence,image=document.createElement('img');image.id='publicArchivePhoto';image.className='public-archive-photo';image.alt='Sky over Parknacross on '+selectedDay;$('publicArchivePhoto').replaceWith(image);displayPhoto(selectedDay,photos[index],image,ticket);}
 previous.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));
 $('publicPhotoClose').addEventListener('click',closePhoto);viewer.addEventListener('close',stopPhoto);$('publicPhotoImageRetry').addEventListener('click',()=>{if(selectedDay)show(selectedDay,photos[photoIndex]?.photo_id);});
 async function load(){$('publicPhotoRetry').hidden=true;const ticket=++sequence;host.replaceChildren();$('publicPhotoCalendarNote').textContent='Loading saved photo dates…';const first=new Date(month+'-01T12:00:00Z');$('publicPhotoMonthTitle').textContent=first.toLocaleDateString('en-IE',{timeZone:'UTC',month:'long',year:'numeric'});$('publicPhotoMonthNext').disabled=month>=today.slice(0,7);
 try{const response=await fetch(api+'/sky-photo/history/dates?month='+month,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error(response.status===404?'The visitor photo calendar requires Worker v38.4.91.':'Photo dates could not be loaded. Use Retry photo dates.');const data=await response.json();if(ticket!==sequence)return;if(data.month!==month)throw Error('The returned photo dates did not match this month.');const counts=new Map((data.days||[]).filter(x=>x.day?.startsWith(month+'-')&&Number(x.count)>0).map(x=>[x.day,Number(x.count)]));
 for(const text of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const span=document.createElement('span');span.textContent=text;host.append(span);}for(let i=0;i<(first.getUTCDay()+6)%7;i++){const span=document.createElement('span');span.setAttribute('aria-hidden','true');host.append(span);}const days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();for(let i=1;i<=days;i++){const day=month+'-'+String(i).padStart(2,'0'),button=document.createElement('button');button.type='button';button.dataset.day=day;button.dataset.hasPhoto=String(counts.has(day));button.textContent=String(i);button.disabled=!counts.has(day);button.setAttribute('aria-label',day+' · '+(counts.get(day)||0)+' saved photo'+((counts.get(day)||0)===1?'':'s')+' · view photographs');button.setAttribute('aria-pressed','false');if(counts.has(day))button.addEventListener('click',()=>show(day));host.append(button);}const selected=new URL(location.href).searchParams.get('day');if(selected&&selected.startsWith(month)&&counts.has(selected))show(selected);$('publicPhotoCalendarNote').textContent=counts.size?counts.size+' dates with photographs. Select a highlighted date to browse every saved photo.':'No sky photographs saved this month.';
 }catch(error){if(ticket===sequence){$('publicPhotoCalendarNote').textContent=error.message;$('publicPhotoRetry').hidden=false;}}}
 function shift(delta){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+delta,1,12)).toISOString().slice(0,7);stopPhoto();$('publicArchivePhoto').hidden=true;$('publicArchivePhoto').removeAttribute('src');$('publicPhotoWeatherLink').hidden=true;$('publicPhotoCaption').textContent='';$('publicPhotoStatus').textContent='Choose a highlighted date.';load();}
 $('publicPhotoMonthPrev').addEventListener('click',()=>shift(-1));$('publicPhotoMonthNext').addEventListener('click',()=>shift(1));$('publicPhotoRetry').addEventListener('click',load);load();
})();
