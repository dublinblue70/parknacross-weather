import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../_worker/worker.mjs';
import {checkPublicSite} from '../public-monitor.mjs';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const nodes=new Map();
const element=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,hidden:true,classList:{toggle(){}},setAttribute(){},addEventListener(){}});return nodes.get(id);};
const sandbox={window:{},document:{getElementById:element,addEventListener(){}},console,Date,Intl,Map,Set,Number,Math,Promise,URL,Blob};
vm.createContext(sandbox);vm.runInContext(source('summary.js'),sandbox);
for(const [instant,expected] of [['2026-10-25T23:30:00Z','2026-10-24'],['2026-03-29T23:30:00Z','2026-03-29'],['2027-01-01T12:00:00Z','2026-12-31'],['2028-03-01T12:00:00Z','2028-02-29']]){
  sandbox.instant=instant;assert.equal(vm.runInContext('shiftLocalDay(localDayKey(new Date(instant)),-1)',sandbox),expected);
}
const now=Math.floor(Date.now()/1000),reading={epoch:now,temperature_c:12,wind_gust_kmh:10,rain_daily_mm:1,soil_moisture_pct:37};
for(const failed of ['/history?hours=48','/rain-summary','/current','/daily?days=8']){
  vm.runInContext('summarySources.clear()',sandbox);
  sandbox.getJSON=async path=>{if(path===failed)throw Error('simulated unavailable');if(path.startsWith('/history'))return {readings:[reading]};if(path==='/current')return reading;if(path.startsWith('/daily'))return {days:[]};return {today_mm:1};};
  await sandbox.loadSummary();
  assert.equal(element('todayHigh').textContent,'12.0 °C',failed+' must preserve available observations');
  assert.equal(element('downloadCsvButton').disabled,false);
  assert.match(element('summarySubtitle').textContent,/could not refresh/);
}
// A failed refresh retains saved data and labels its timestamp honestly.
sandbox.getJSON=async()=>{throw Error('unavailable');};await sandbox.loadSummary();assert.equal(element('todayHigh').textContent,'12.0 °C');assert.match(element('summarySubtitle').textContent,/latest observation/);
const quality={window:{},Date,Intl,Map,Set,Number,Math};vm.runInNewContext(source('report-quality.js'),quality);
const describe=quality.window.ParknacrossReportQuality.describe;
const coverage={days:[{day:'2026-09-14',actual_slots:104,expected_slots:288,coverage_percent:36.1}]};
const note=describe([{day:'2026-09-14'}],'2026-09',coverage,new Date('2026-10-08T12:00:00Z'));
assert.match(note,/1\/30 calendar days/);assert.match(note,/29 days have no archived/);assert.match(note,/36.1%/);assert.match(note,/1 recorded day has incomplete/);
const currentNote=describe([{day:'2026-10-08'}],'2026-10',{days:[{day:'2026-10-08',actual_slots:150,expected_slots:150,coverage_percent:100,day_in_progress:true}]},new Date('2026-10-08T12:00:00Z'));
assert.match(currentNote,/0 recorded days have incomplete/);assert.match(currentNote,/Today is measured only/);
assert.match(describe([{day:'2025-01-01'}],'2025',null,new Date('2026-10-08T12:00:00Z')),/could not be verified/);
// Even when daily fails, successful metadata is rendered and loading ends.
const history={window:{},document:{getElementById:element,addEventListener(){}},console,Date,Intl,Map,Set,Number,Math,Promise};vm.createContext(history);vm.runInContext(source('history.js'),history);
vm.runInContext('renderedStats=false;getJSON=async path=>{if(path.includes("/daily"))throw Error("unavailable");return path.includes("/stats")?{total_samples:100}:{days:[],summary:{coverage_percent:94}};};renderStats=()=>renderedStats=true;renderHeatmap=()=>{};renderCalendar=()=>{};updateArchiveDayNavigation=()=>{};clearDayValues=()=>{};',history);
await history.loadHistory();assert.equal(history.renderedStats,true);assert.match(element('heatmapSummary').textContent,/94.0%/);assert.match(element('historyChartStatus').textContent,/could not load/);
// Failed keys are throttled, while correct keys still sign in without D1.
const env={ADMIN_KEY:'test-only',DB:{prepare(){throw Error('Authentication must not use D1');}}};
for(let i=0;i<31;i++){
 const response=await worker.fetch(new Request('https://worker.test/admin/capabilities',{headers:{'CF-Connecting-IP':'192.0.2.140'}}),env,{});
 assert.equal(response.status,i<30?401:429);
 if(i===30)assert.equal(response.headers.get('Retry-After'),'60');
}
const authenticated=await worker.fetch(new Request('https://worker.test/admin/capabilities',{headers:{'CF-Connecting-IP':'192.0.2.140','X-Parknacross-Admin-Key':'test-only'}}),env,{});assert.equal(authenticated.status,200);
const backend=source('_worker/worker.mjs'),rates={Map,Date,SECURITY_WINDOWS:new Map()};vm.createContext(rates);vm.runInContext(backend.slice(backend.indexOf('function requestRateLimited'),backend.indexOf('function rateLimitedResponse')),rates);
const request=new Request('https://worker.test/',{headers:{'CF-Connecting-IP':'192.0.2.141'}});
for(let i=0;i<30;i++)assert.equal(rates.requestRateLimited(request,'photo-writes',30,1000),false);
assert.equal(rates.requestRateLimited(request,'photo-writes',30,1000),true);assert.equal(rates.requestRateLimited(request,'photo-writes',30,61000),false);
// Independent monitoring detects a failing source instead of reporting a green site.
const monitor=await checkPublicSite({now:now*1000,fetcher:async url=>{
 if(url.endsWith('/stats'))return new Response('{}',{status:503});
 if(url.endsWith('/'))return new Response('PARKNACROSS WEATHER');
 if(url.includes('export.csv'))return new Response('epoch,observation_time_ireland\n1,time\n');
 const data=url.includes('/current')?{epoch:now}:url.includes('/history')?{readings:[{epoch:now}]}:url.includes('/daily')?{days:[{day:new Date(now*1000).toISOString().slice(0,10)}]}:{count:10,last_epoch:now,columns:['soil_moisture_pct','lightning_strikes']};
 return Response.json(data);
}});assert.equal(monitor.find(row=>row.name==='Statistics').ok,false);assert.ok(monitor.filter(row=>row.name!=='Statistics').every(row=>row.ok));
console.log('PASS: calendar transitions, isolated summary/history failures, cached timestamps, report coverage, throttled failed authentication and independent monitoring.');
