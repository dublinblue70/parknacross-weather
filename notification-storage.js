/* Keep device notification choices across missing/corrupt local-storage entries. */
(() => {
 'use strict';
 const keys=['parknacross.alerts.settings.v1','parknacross:background-alerts:v1'];
 const memory=new Map(),changed=new Set();let database=null;
 const valid=raw=>{try{const value=JSON.parse(raw);return value===null||typeof value==='object'&&!Array.isArray(value);}catch{return false;}};
 const local=key=>{try{const raw=localStorage.getItem(key);return raw!==null&&valid(raw)?raw:null;}catch{return null;}};
 function persist(key,value){if(!database)return;try{const tx=database.transaction('preferences','readwrite');tx.objectStore('preferences').put(value,key);tx.onerror=()=>{};}catch{}}
 function setItem(key,value){if(!keys.includes(key))throw Error('Unsupported notification key');changed.add(key);memory.set(key,value);persist(key,value);localStorage.setItem(key,value);}
 function getItem(key){return local(key)??memory.get(key)??null;}
 const ready=new Promise(resolve=>{
  if(!window.indexedDB){resolve();return;}
  let finished=false;const finish=()=>{if(finished)return;finished=true;resolve();};
  try{const request=window.indexedDB.open('parknacross-notifications',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('preferences'))request.result.createObjectStore('preferences');};
   request.onerror=request.onblocked=finish;
   request.onsuccess=()=>{database=request.result;database.onversionchange=()=>database.close();
    const jobs=keys.map(key=>new Promise(done=>{try{const tx=database.transaction('preferences','readonly'),read=tx.objectStore('preferences').get(key);read.onerror=()=>done();read.onsuccess=()=>{if(changed.has(key)){persist(key,memory.get(key));done();return;}const current=local(key),backup=read.result;if(current!==null){memory.set(key,current);persist(key,current);}else if(typeof backup==='string'&&valid(backup)){memory.set(key,backup);try{localStorage.setItem(key,backup);}catch{}}done();};}catch{done();}}));
    Promise.all(jobs).then(()=>{window.dispatchEvent(new Event('parknacross:notification-storage-ready'));finish();});
   };
  }catch{finish();}
 });
 window.PWNotificationStorage={getItem,setItem,ready};
})();
