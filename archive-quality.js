(() => {
 'use strict';
 const usable=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 function epoch(row){if(usable(row?.epoch))return Number(row.epoch);const t=Date.parse(row?.received_at||'');return Number.isFinite(t)?t/1000:null;}
 function gaps(rows,minutes=10){const sorted=[...(rows||[])].filter(r=>epoch(r)!==null).sort((a,b)=>epoch(a)-epoch(b)),out=[];let count=0;for(const row of sorted){const prev=out.at(-1);if(prev&&epoch(row)-epoch(prev)>minutes*60){out.push({_gap:true,_archiveGap:true,epoch:(epoch(prev)+epoch(row))/2,_gapTime:(epoch(prev)+epoch(row))*500});count++;}out.push(row);}return {rows:out,gaps:count};}
 function bounds(day){const midnight=key=>{const utc=Date.parse(key+'T00:00:00Z');const part=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Dublin',timeZoneName:'shortOffset'}).formatToParts(new Date(utc)).find(p=>p.type==='timeZoneName')?.value||'GMT';const m=part.match(/GMT([+-])(\d+)(?::(\d+))?/);return utc/1000-(m?(m[1]==='-'?-1:1)*(Number(m[2])*3600+Number(m[3]||0)*60):0);};const next=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);return {start:midnight(day),end:midnight(next)};}
 function coverageText(row,day){if(!row||!usable(row.coverage_percent))return 'Coverage unavailable · daily totals may be incomplete.';const pct=Number(row.coverage_percent),scope=row.coverage_scope==='since_first_observation'?'since collection began that day':(row.day_in_progress||day===new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin'}).format(new Date()))?'so far today':'of the day';const partial=pct<98||row.coverage_scope==='since_first_observation';return `${partial?'Partial archive':'Archive coverage'} · ${pct.toFixed(1)}% ${scope} · ${row.actual_slots}/${row.expected_slots} five-minute slots. ${partial?'Daily totals and extremes may be incomplete.':'Coverage describes saved observations, not sensor accuracy.'}`;}
 // The /coverage endpoint counts *saved* unique 5-minute slots, not all raw
 // gateway packets. Use its day-so-far denominator and full Irish day length.
 // The full-day value is 276/288/300 on the spring/normal/autumn clock days.
 function coverageCard(row,day){
   const unavailable={headline:'Coverage unavailable',count:'Saved readings cannot be checked right now.',fullDay:'Weather readings may still be arriving.',state:'unknown'};
   if(!row||!usable(row.coverage_percent)||!usable(row.actual_slots)||!usable(row.expected_slots))return unavailable;
   const pct=Number(row.coverage_percent),actual=Number(row.actual_slots),expected=Number(row.expected_slots);
   if(!Number.isFinite(pct)||pct<0||pct>100||!Number.isInteger(actual)||actual<0||!Number.isInteger(expected)||expected<1)return unavailable;
   const fmt=n=>n.toLocaleString('en-IE');
   const pctText=Number.isInteger(pct)?String(pct):pct.toFixed(1);
   const firstDay=row.coverage_scope==='since_first_observation';
   const today=day===new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin'}).format(new Date());
   const headline=firstDay?`${pctText}% since recording began`:pct===100?`100% complete ${today?'so far':'for the day'}`:`${pctText}% saved ${today?'so far':'for the day'}`;
   const count=`${fmt(actual)} of ${fmt(expected)} expected readings saved${firstDay?' since recording began':''}.`;
   const dayLength=bounds(day),calculated=Math.round((dayLength.end-dayLength.start)/300);
   const full=usable(row.full_day_expected_slots)?Number(row.full_day_expected_slots):calculated;
   const fullValid=Number.isInteger(full)&&full>0&&full<=300;
   const fullDay=fullValid?`${fmt(full)} readings expected ${today?'by midnight':'for the full day'}.${firstDay?' Today’s coverage excludes the time before the first saved reading.':''}`:
     firstDay?'Today’s coverage excludes the time before the first saved reading.':'';
   return {headline,count,fullDay,state:firstDay||pct<98?'partial':'complete'};
 }
 window.ParknacrossArchiveQuality={epoch,gaps,bounds,coverageText,coverageCard};
 function displayCoverage(details){
   const node=document.getElementById('dashboardCoverage');if(!node)return;
   node.dataset.state=details.state;
   for(const [id,value] of [['dashboardCoveragePercent',details.headline],['dashboardCoverageCounts',details.count],['dashboardCoverageFullDay',details.fullDay]]){
     const target=document.getElementById(id);
     if(target)target.textContent=value;
   }
 }
 async function dashboard(){
   if(!document.getElementById('dashboardCoverage'))return;
   try{
     const base=(window.PARKNACROSS_CONFIG?.apiBase||'https://parknacross-weather.dave-s-carter.workers.dev').replace(/\/$/,'');
     const response=await fetch(base+'/coverage?days=2',{signal:AbortSignal.timeout(12000)});
     if(!response.ok)throw Error();
     const data=await response.json();
     const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin'}).format(new Date());
     displayCoverage(coverageCard(data.days?.find(row=>row.day===day),day));
   }catch(_){displayCoverage(coverageCard(null));}
 }
 window.addEventListener('DOMContentLoaded',dashboard);if(document.readyState!=='loading')dashboard();(window.ParknacrossRefresh?.every || setInterval)(dashboard,300000);
})();
