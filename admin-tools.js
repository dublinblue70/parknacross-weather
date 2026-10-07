(() => {
 'use strict';
 const $=id=>document.getElementById(id),base=(window.PARKNACROSS_CONFIG?.apiBase||'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/,'');
 let active=false,generation=0,items=[],position=0,total=0,offset=0,imageUrl=null,imageExtension="jpg";
 const key=()=>{try{return sessionStorage.getItem('parknacrossAdminKey')||'';}catch(_){return '';}};
 const note=text=>{$('adminMessage').textContent=text;};
 async function request(path,options={}){
   const response=await fetch(base+path,{...options,headers:{...options.headers,'X-Parknacross-Admin-Key':key()},cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(response.status===401){signOut();throw Error('Admin key was not accepted. Please sign in again.');}
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error==='Invalid sky setting'?'The Worker does not support this sky choice yet. Deploy Worker v38.4.87, or choose Overcast for now.':data.error||(response.status===404?'This feature needs Worker v38.4.86.':`Request failed (${response.status}).`));}
   return response;
 }
 function signOut(){
   active=false;generation++;$('adminSkySave').disabled=true;sessionStorage.removeItem('parknacrossAdminKey');
   $('adminWorkspace').hidden=true;$('adminLogin').hidden=false;$('adminKey').value='';
   window.dispatchEvent(new Event('parknacross:admin-signout'));
   $('postHistory').replaceChildren();$('archiveCaption').textContent='';$('archiveImage').removeAttribute('src');
   if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;note('Signed out on this tab.');
 }
 async function signIn(){
   const ticket=++generation;
   note('Checking admin access…');
   await request('/social-dashboard');
   if(ticket!==generation)return;
   active=true;$('adminLogin').hidden=true;$('adminWorkspace').hidden=false;note('Signed in. Your key stays in this tab’s session.');
   window.dispatchEvent(new Event('parknacross:admin-signin'));
   await Promise.allSettled([loadArchive(),loadHistory(),loadSky(),checkCompatibility()]);
 }
 $('adminLogin').addEventListener('submit',async event=>{
   event.preventDefault();sessionStorage.setItem('parknacrossAdminKey',$('adminKey').value.trim());$('adminKey').value='';
   try{await signIn();}catch(error){note(error.message);}
 });
 $('adminSignOut').addEventListener('click',signOut);
 let supported=null,compatibilitySequence=0;
 async function checkCompatibility(){
   if(!active)return;
   const ticket=generation,sequence=++compatibilitySequence,button=$('adminCompatibilityRefresh'),status=$('adminCompatibility');
   button.disabled=true;button.textContent='Checking…';status.textContent='Checking the deployed Worker’s features…';status.setAttribute('aria-busy','true');
   try{
     const data=await (await request('/admin/capabilities')).json();if(!active||ticket!==generation||sequence!==compatibilitySequence)return;
     if(!data.features||typeof data.features!=='object')throw Error('Feature list missing from the deployed Worker response.');
     supported=data.features;
     const checked=new Date().toLocaleTimeString('en-IE',{timeZone:'Europe/Dublin',hour:'2-digit',minute:'2-digit',second:'2-digit'});
     status.textContent=`Checked at ${checked} · Deployed Worker ${data.worker_version||'version unknown'} · `+[['rain_override','rain / storm settings'],['photo_calendar','photo calendar'],['social_history','social history'],['history_photos','historical sky photos'],['export_preview','download previews'],['history_range','event graph windows']].map(([key,label])=>`${label}: ${supported[key]?'supported':'unavailable'}`).join(' · ');
   }catch(error){
     if(!active||ticket!==generation||sequence!==compatibilitySequence)return;
     supported={};status.textContent='Compatibility check failed. '+error.message+' Try Check compatibility again.';
   }finally{
     if(sequence===compatibilitySequence){button.disabled=false;button.textContent='Check compatibility';status.setAttribute('aria-busy','false');}
     if(active&&ticket===generation&&sequence===compatibilitySequence){$('adminSkySave').disabled=!supported?.rain_override;window.dispatchEvent(new CustomEvent('parknacross:capabilities',{detail:supported||{}}));}
   }
 }
 $('adminCompatibilityRefresh')?.addEventListener('click',checkCompatibility);
 async function loadSky(){try{const payload=await (await request('/weather-window/sky')).json(),d=payload.override||{};if(!active)return;$('adminSky').value=d.sky||'auto';$('adminRain').value=d.rain||'auto';window.dispatchEvent(new Event('parknacross:window-preview-update'));$('adminSkyStatus').textContent=(d.sky&&d.sky!=='auto')||(d.rain&&d.rain!=='auto')?`Visual settings: sky ${d.sky||'auto'} · rain / storm ${d.rain||'auto'}${d.expires_at?' · expires '+new Date(d.expires_at).toLocaleString('en-IE',{timeZone:'Europe/Dublin'}):''}`:'Automatic forecast sky and station rain are active.';}catch(error){$('adminSkyStatus').textContent=error.message;}}
 $('adminSkyForm').addEventListener('submit',async event=>{
   event.preventDefault();if(!supported?.rain_override){$('adminSkyStatus').textContent='Check compatibility and deploy Worker v38.4.89 before saving illustration settings.';return;}$('adminSkySave').disabled=true;
   try{const response=await request('/weather-window/sky',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sky:$('adminSky').value,rain:$('adminRain').value||'auto',duration:$('adminSkyDuration').value})});const saved=await response.json();if($('adminRain').value&&$('adminRain').value!=='auto'&&saved.override?.rain!==$('adminRain').value)throw Error('Deploy Worker v38.4.88 to save rain and storm settings.');await loadSky();}catch(error){$('adminSkyStatus').textContent=error.message;}finally{$('adminSkySave').disabled=!supported?.rain_override;}
 });
 async function preparePhoto(file){
   if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Choose a JPEG, PNG or WebP photo.');
   if(file.size>30*1024*1024)throw Error('Choose a photo smaller than 30 MB.');
   const bitmap=await createImageBitmap(file);
   try{const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));if(!blob)throw Error('Could not prepare this photo.');return blob;}finally{bitmap.close();}
 }
 $('adminPhotoForm').addEventListener('submit',async event=>{
   event.preventDefault();$('adminPhotoSave').disabled=true;$('adminPhotoStatus').textContent='Preparing and uploading…';
   try{const file=$('adminPhotoFile').files[0];if(!file)throw Error('Choose a photo first.');const photo=await preparePhoto(file),body=new FormData();body.append('photo',photo,'parknacross-sky.jpg');body.append('caption',$('adminPhotoCaption').value.trim());await request('/sky-photo',{method:'POST',body});$('adminPhotoStatus').textContent='Today’s photo uploaded.';$('adminPhotoFile').value='';await loadArchive();window.dispatchEvent(new Event('parknacross:photo-archive-update'));window.dispatchEvent(new Event('parknacross:admin-signin'));}catch(error){$('adminPhotoStatus').textContent=error.message;}finally{$('adminPhotoSave').disabled=false;}
 });
 function archiveControls(){ $('archivePrevious').disabled=position===0&&offset===0;$('archiveNext').disabled=offset+position+1>=total;$('archiveDownload').disabled=!imageUrl; }
 async function showPhoto(){
   const item=items[position],ticket=generation;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;$('archiveImage').removeAttribute('src');archiveControls();
   if(!item){$('archiveCaption').textContent='No photographs for this selection.';return;}
   $('archiveCaption').textContent=`${item.day} · ${item.caption||'No caption'} · photo ${offset+position+1} of ${total}`;
   try{const response=await request('/sky-photo/archive/image?photo_id='+encodeURIComponent(item.photo_id)),blob=await response.blob();if(!active||ticket!==generation||items[position]?.photo_id!==item.photo_id)return;imageExtension=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';imageUrl=URL.createObjectURL(blob);$('archiveImage').src=imageUrl;archiveControls();}catch(error){$('archiveCaption').textContent=error.message;}
 }
 async function loadArchive(nextOffset=0,nextPosition=0){
   const ticket=generation;$('archiveCaption').textContent='Loading photo archive…';
   try{const day=$('archiveDay').value,d=await (await request(`/sky-photo/archive/admin?limit=50&offset=${nextOffset}${day?'&day='+encodeURIComponent(day):''}`)).json();if(!active||ticket!==generation)return;if(day&&d.day!==day)throw Error('Calendar filtering needs Worker v38.4.86. Choose All dates until it is deployed.');items=d.items||[];total=d.total||0;offset=nextOffset;position=nextPosition<0?Math.max(0,items.length-1):nextPosition;await showPhoto();}catch(error){$('archiveCaption').textContent=error.message;}
 }
 $('archiveDay').addEventListener('change',()=>loadArchive());
 $('archiveAll').addEventListener('click',()=>{$('archiveDay').value='';loadArchive();});
 $('archivePrevious').addEventListener('click',()=>{if(position>0){position--;showPhoto();}else if(offset>0)loadArchive(Math.max(0,offset-50),-1);});
 $('archiveNext').addEventListener('click',()=>{if(position+1<items.length){position++;showPhoto();}else if(offset+items.length<total)loadArchive(offset+items.length);});
 $('archiveDownload').addEventListener('click',()=>{if(!imageUrl)return;const a=document.createElement('a');a.href=imageUrl;a.download=`parknacross-sky-${items[position].day}.${imageExtension}`;a.click();});
 async function loadHistory(){
   const ticket=generation;$('postHistoryNote').textContent='Loading saved social posts…';
   try{const data=await (await request('/social-history')).json();if(!active||ticket!==generation)return;const container=$('postHistory');container.replaceChildren();
     for(const item of data.items||[]){
       const card=document.createElement('details'),title=document.createElement('summary');title.textContent=`${item.day} · ${item.network==='x'?'X':'Facebook'} · ${item.status||'Submitted'}`;card.append(title);
       const text=document.createElement('pre');text.textContent=item.text||'Original wording was not recorded.';card.append(text);
       const photo=document.createElement('p');photo.textContent=item.photo_url?(item.status==='failed'?'Photo was intended for this failed attempt.':'Photo attachment recorded.'):'No photo attachment recorded.';card.append(photo);
       if(item.photo_id){const image=document.createElement('img');image.alt='Archived sky photograph for this post';image.hidden=true;card.append(image);let loaded=false;
         card.addEventListener('toggle',async()=>{if(!card.open||loaded)return;try{const response=await request('/sky-photo/archive/image?photo_id='+encodeURIComponent(item.photo_id)),blob=await response.blob();if(!active||ticket!==generation)return;const url=URL.createObjectURL(blob);image.src=url;image.hidden=false;loaded=true;window.addEventListener('parknacross:admin-signout',()=>{URL.revokeObjectURL(url);image.removeAttribute('src');},{once:true});}catch(error){photo.textContent='Recorded photo is unavailable: '+error.message;}});
       }
       for(const [url,label,hosts] of [[item.public_url,'View published post',/^(.*\.)?(facebook\.com|x\.com|twitter\.com|t\.co)$/]]){
         try{const u=new URL(url);if(u.protocol==='https:'&&hosts.test(u.hostname)){const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;card.append(a);}}catch(_){}
       }
       if(item.error){const error=document.createElement('p');error.textContent=item.error;card.append(error);}container.append(card);
     }
     $('postHistoryNote').textContent=(data.items?.length?data.note:'No saved posts yet. '+data.note)||'Saved social-post history.';
   }catch(error){$('postHistoryNote').textContent=error.message;}
 }
 $('postHistoryRefresh').addEventListener('click',loadHistory);
 if(key())signIn().catch(error=>note(error.message));
})();
