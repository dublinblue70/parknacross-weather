/* Durable, versioned device notification preferences. Never treat a missing
 * record, a failed write, or an old default as an intentional opt-out. */
(() => {
 'use strict';
 if(window.PWNotificationStorage)return;
 const keys=['parknacross.alerts.settings.v1','parknacross:background-alerts:v1'];
 const memory=new Map(),recovered=new Set();let database=null;
 const parse=raw=>{try{return JSON.parse(raw);}catch{return undefined;}};
 const valid=(raw,key)=>typeof raw==='string'&&(()=>{const v=parse(raw);return v===null?key===keys[1]:!!v&&typeof v==='object'&&!Array.isArray(v);})();
 const local=key=>{try{const raw=localStorage.getItem(key);return valid(raw,key)?raw:null;}catch{return null;}};
 const revision=raw=>Number(parse(raw)?.__pwSavedAt)||0;
 const consent=raw=>Number(parse(raw)?.__pwConsentAt)||0;
 function choose(key,a,b){
  if(!valid(a,key))return valid(b,key)?b:null;
  if(!valid(b,key))return a;
  const x=parse(a),y=parse(b);
  // New explicit choices take precedence over stale copies, including opt-outs.
  if(key===keys[0]){
   if(consent(a)!==consent(b))return consent(a)>consent(b)?a:b;
   const chosen=v=>v.explicitlyDisabled===true||v.enabled===true;
   // Legacy records have no timestamp. Prefer an actual local decision over
   // an unversioned backup; recover only when local is missing/default.
   if(chosen(x)!==chosen(y))return chosen(x)?a:b;
   if(chosen(x)&&chosen(y))return revision(b)>revision(a)?b:a;
  }
  // Old null is the legacy explicit background-off record, not missing data.
  if(key===keys[1]&&!revision(a)&&!revision(b)&&x===null)return a;
  return revision(b)>revision(a)?b:a;
 }
 function persist(key,value){if(!database||value===null)return;try{const tx=database.transaction('preferences','readwrite');tx.objectStore('preferences').put(value,key);tx.onerror=()=>{};}catch{}}
 function getItem(key){return choose(key,local(key),memory.get(key));}
 function setItem(key,value){
  if(!keys.includes(key)||!valid(value,key))throw Error('Unsupported notification record');
  const current=getItem(key),previous=parse(current),next=parse(value);
  const stamp=Math.max(Date.now(),revision(current)+1);
  // Preserve the revision of the last actual enable/disable, rather than
  // treating a threshold change in an old tab as a new consent decision.
  const record=next===null?{active:false,explicitlyDisabled:true}:{...next};
  if(key===keys[0]){
   const changed=previous?.enabled!==record.enabled||previous?.explicitlyDisabled!==record.explicitlyDisabled;
   record.__pwConsentAt=changed&&(record.enabled===true||record.explicitlyDisabled===true)?stamp:Math.max(consent(current),Number(record.__pwConsentAt)||0);
  }
  record.__pwSavedAt=stamp;value=JSON.stringify(record);
  recovered.delete(key);memory.set(key,value);persist(key,value);
  try{localStorage.setItem(key,value);}catch(error){if(!database)throw error;}
 }
 const ready=new Promise(resolve=>{
  if(!window.indexedDB){resolve();return;}
  let finished=false;const finish=()=>{if(finished)return;finished=true;resolve();};
  try{const request=window.indexedDB.open('parknacross-notifications',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('preferences'))request.result.createObjectStore('preferences');};
   request.onerror=request.onblocked=finish;
   request.onsuccess=()=>{database=request.result;database.onversionchange=()=>{database.close();database=null;};
    const jobs=keys.map(key=>new Promise(done=>{try{const tx=database.transaction('preferences','readonly'),read=tx.objectStore('preferences').get(key);read.onerror=()=>done();read.onsuccess=()=>{
     const current=getItem(key),selected=choose(key,current,read.result);
     if(selected!==null){memory.set(key,selected);if(selected!==local(key)){recovered.add(key);try{localStorage.setItem(key,selected);}catch{}}persist(key,selected);}
     done();
    };}catch{done();}}));
    Promise.all(jobs).then(()=>{finish();window.dispatchEvent(new Event('parknacross:notification-storage-ready'));});
   };
  }catch{finish();}
 });
 // Keep backup current when a different tab saves an explicit choice.
 window.addEventListener?.('storage',event=>{if(keys.includes(event.key)&&valid(event.newValue,event.key)){const selected=choose(event.key,event.newValue,memory.get(event.key));memory.set(event.key,selected);persist(event.key,selected);}});
 window.PWNotificationStorage={getItem,setItem,ready,wasRecovered:key=>recovered.has(key)};
})();
