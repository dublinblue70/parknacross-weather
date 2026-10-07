(() => {
 'use strict';
 const validDate=value=>{if(value===null||value===undefined||value==='')return null;const n=typeof value==='number'?value<1e12?value*1000:value:Date.parse(value);return Number.isFinite(n)?n:null;};
 const stamp=value=>{const n=validDate(value);if(n===null)return 'time unavailable';const minutes=Math.floor((Date.now()-n)/60000);return new Date(n).toLocaleString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' Irish time'+(minutes>=0?` · ${minutes<60?minutes+' min':Math.floor(minutes/60)+' hr'} ago`:'');};
 function render(id,data,sourceTime,maxAgeHours=24,label='Source update'){
   const node=document.getElementById(id);if(!node)return;
   const time=validDate(sourceTime),retrieved=data?.freshness?.retrieved_at,old=time!==null&&Date.now()-time>maxAgeHours*3600000;
   node.classList.add('source-freshness');node.dataset.state=old?'old':'normal';
   node.textContent=`${label}: ${stamp(sourceTime)}${old?' · older than expected':''}${retrieved?' · feed retrieved '+stamp(retrieved):''}${data?.freshness?.cached?' · cached response':''}`;
 }
 window.ParknacrossFreshness=Object.freeze({render,stamp,validDate});
})();
