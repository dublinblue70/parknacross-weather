import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const nodes=new Map(),element=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'CHECK',className:'',disabled:false,innerHTML:'',append(){},appendChild(){}});return nodes.get(id);};
const now=Math.floor(Date.now()/1000),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let releaseMarine,healthFails=false;let marine=new Promise(resolve=>releaseMarine=resolve);
const json=path=>({
 '/health':{status:'ok',database:'connected',archive_ingest:{latest_age_seconds:10}},
 '/current':{epoch:now,received_at:new Date(now*1000).toISOString(),soil_moisture_pct:38},
 '/quality':{samples_last_24h:288,median_interval_minutes:5,largest_recent_gap_minutes:5,gust_spikes_excluded_24h:0,gust_spikes_excluded_total:0},
 '/history':{readings:[{epoch:now,temperature_c:12}]},
 '/reliability':{archive_reliability_percent:100,actual_samples:288,expected_samples:288},
 '/backup-status':{configured:true,last_success:new Date().toISOString(),last_backup_day:day},
 '/social-status':{facebook_verified_day:day,x_verified_day:day},
 '/marine/tides':{events:[{type:'high',time:new Date(Date.now()+3600000).toISOString()}]},
 '/marine/sea-temperature':{m2_observation_available:true,m2_buoy:{sea_surface_temperature_c:14,observation_age_minutes:10}},
 '/met/warnings':{warnings:[]},'/met/marine':{local_warning_relevant:false},
 '/daily':{days:[{day}]},'/stats':{total_samples:100,records:{}},
 '/export-preview':{count:10,columns:['epoch'],last_epoch:now}
}[path]||{});
const context={window:{ParknacrossWarnings:{select:()=>[]}},document:{getElementById:element,createElement:()=>({append(){}}),addEventListener(){}},fetch:async url=>{const path=new URL(url,'https://parknacrossweather.ie').pathname;if(['/met/marine','/marine/tides','/marine/sea-temperature'].includes(path))await marine;if(path==='/health'&&healthFails)throw Error('Network unavailable');return{ok:true,json:async()=>json(path)};},URL,Date,Intl,Number,Object,Array,String,Math,Promise,AbortController,setTimeout,clearTimeout,performance};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../status.js',import.meta.url),'utf8'),context);
let check=context.runChecks();await new Promise(resolve=>setImmediate(resolve));
assert.equal(element('apiBadge').textContent,'OK');assert.equal(element('feedBadge').textContent,'LIVE');assert.equal(element('marineWarningBadge').textContent,'CHECK');assert.match(element('overallText').textContent,/checks complete/);assert.equal(element('refreshButton').disabled,true);
releaseMarine();await check;assert.equal(element('refreshButton').disabled,false);assert.equal(element('marineWarningBadge').textContent,'CHECKED');
healthFails=true;marine=new Promise(resolve=>releaseMarine=resolve);check=context.runChecks();await new Promise(resolve=>setImmediate(resolve));assert.equal(element('apiBadge').textContent,'DOWN');assert.equal(element('overallTitle').textContent,'A monitored service needs attention');releaseMarine();await check;
console.log('PASS: fast status cards render before delayed marine checks, failures appear immediately and controls recover.');
