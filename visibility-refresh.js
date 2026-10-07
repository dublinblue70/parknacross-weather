(() => {
 'use strict';const jobs=new Set();
 function every(fn,ms,options={}){const job={fn,running:false,resume:options.resume!==false};jobs.add(job);const run=()=>{if(document.hidden||job.running)return;job.running=true;try{Promise.resolve(fn()).catch(()=>{}).finally(()=>{job.running=false;});}catch(_){job.running=false;}};job.run=run;return setInterval(run,ms);}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const job of jobs)if(job.resume)job.run();});window.ParknacrossRefresh={every};
})();
