(() => {
 'use strict';let lcp=null,cls=0,interaction=null;
 const value=()=>({page:location.pathname,lcp_ms:lcp,layout_shift:cls,longest_interaction_ms:interaction,measured_at:new Date().toISOString()});
 const show=()=>{const n=document.getElementById('pagePerformance');if(n)n.textContent=`This visit: largest content paint ${lcp===null?'not available':(lcp/1000).toFixed(2)+' s'} · layout shift ${cls.toFixed(3)} · longest observed interaction ${interaction===null?'not measured yet':Math.round(interaction)+' ms'}. These are measurements on this device, not a site-wide score.`;};
 if(window.PerformanceObserver){for(const [type,update] of [['largest-contentful-paint',e=>lcp=e.startTime],['layout-shift',e=>{if(!e.hadRecentInput)cls+=e.value;}],['event',e=>{if(e.interactionId)interaction=Math.max(interaction||0,e.duration);}]] ){try{const observer=new PerformanceObserver(list=>{list.getEntries().forEach(update);show();});observer.observe({type,buffered:true,...(type==='event'?{durationThreshold:40}:{})});}catch{}}}
 window.ParknacrossPerformance={snapshot:value};document.addEventListener('DOMContentLoaded',show);
})();
