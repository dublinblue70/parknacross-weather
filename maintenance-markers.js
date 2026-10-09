(() => {
 'use strict';const entries=()=>Array.isArray(window.PARKNACROSS_MAINTENANCE_LOG)?window.PARKNACROSS_MAINTENANCE_LOG.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)):[];
 function list(host,items){if(!host)return;host.replaceChildren();if(!items.length){host.textContent='No dated maintenance entries in this period.';return;}for(const item of items){const p=document.createElement('p');p.className='maintenance-event';p.textContent=`${item.date} · ${item.title} · ${item.detail||item.type||''}`;host.append(p);}}
 function dayHost(){let host=document.getElementById('dayMaintenance');if(!host){const title=document.getElementById('dayDetailTitle');if(title){host=document.createElement('div');host.id='dayMaintenance';host.className='maintenance-day-notes';title.parentElement.append(host);}}return host;}
 function renderDay(day){list(dayHost(),entries().filter(x=>x.date===day));}
 // Keep the chart integration API compatible without adding maintenance shading or notes.
 function renderCharts() {}
 window.ParknacrossMaintenance={renderCharts,renderDay};
})();
