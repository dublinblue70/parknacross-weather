import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = name => fs.readFileSync(new URL('../'+name, import.meta.url), 'utf8');

// Preserve measured zero and saved rainfall during offline/recovery states.
const events={}, node={dataset:{},hidden:true,setAttribute(){}}, win={addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){}}, network={onLine:false};
vm.runInNewContext(source('offline.js'), {window:win,navigator:network,document:{getElementById:()=>node,documentElement:{classList:{toggle(){}}},addEventListener(){}},localStorage:{getItem:()=>JSON.stringify({value:{temperature_c:10,wind_speed_kmh:0,rain_daily_mm:1.2,received_at:'2026-10-10T18:00:00Z'}})},Number,Date,JSON,Event});
events.offline();assert.match(node.textContent,/Rain at saved observation 1.2 mm/);
win.PWOffline.setLive({temperature_c:10,rain_daily_mm:0,received_at:'2026-10-10T18:05:00Z'});assert.match(node.textContent,/Rain at saved observation 0.0 mm/);
network.onLine=true;events.online();assert.equal(node.hidden,false);win.PWOffline.setLive({});assert.equal(node.hidden,true);

// Compare observations at the report time, without interpolating or showing stale differences.
const comparisons={window:{},Date,Number,Math};vm.runInNewContext(source('comparison-alignment.js'),comparisons);
const api=comparisons.window.ParknacrossComparison, target=Date.parse('2026-10-10T17:00:00Z')/1000;
assert.equal(api.match({report_time:'2026-10-10T17:00:00',temperature_c:12},[{epoch:target+300,temperature_c:11},{epoch:target+30,temperature_c:10}],target+3600).delta,-2);
assert.equal(api.match({report_time:'2026-10-10T17:00:00+01:00',temperature_c:12},[{epoch:target-3600,temperature_c:10}],target).delta,-2);
assert.equal(api.match({report_time:'2026-10-10T17:00:00Z',temperature_c:12},[{epoch:target+301,temperature_c:10}],target+3600),null);
assert.equal(api.match({report_time:'2026-10-10T17:00:00Z',temperature_c:12},[{epoch:target,temperature_c:10}],target+7201),null);
assert.equal(api.match({report_time:null,temperature_c:12},[{epoch:target,temperature_c:10}],target),null);

// Separate pre-commissioning dates from actual missing days, while preserving partial coverage.
const reports={window:{},Date,Intl,Map,Set,Number,Math};vm.runInNewContext(source('report-quality.js'),reports);
const describe=reports.window.ParknacrossReportQuality.describe;
const rows=[{day:'2026-09-11'},{day:'2026-09-13'}];
const coverage={collection_start_day:'2026-09-11',days:[{day:'2026-09-11',actual_slots:100,expected_slots:100,coverage_percent:100,coverage_scope:'since_first_observation'},{day:'2026-09-13',actual_slots:50,expected_slots:100,coverage_percent:50}]};
const note=describe(rows,'2026',coverage,new Date('2026-09-13T12:00:00Z'));
assert.match(note,/2\/3 calendar days/);assert.match(note,/253 earlier days were before station recording began/);assert.match(note,/1 day has no archived/);assert.match(note,/2 recorded days have incomplete/);

const firstDayNote=describe([{day:'2026-09-11'}],'2026',{collection_start_day:'2026-09-11',days:[]},new Date('2026-09-11T12:00:00Z'));
assert.match(firstDayNote,/1\/1 calendar days/);assert.match(firstDayNote,/253 earlier days were before station recording began/);

// Optional screenshot/admin failures cannot prevent installation; missing core code must.
async function installWithFailure(failure) {
  const stored=new Map(),handlers={},self={registration:{scope:'https://site.test/'},location:{origin:'https://site.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>self.activated=true};
  const caches={open:async()=>({put:async(request,response)=>stored.set(request.url,response),match:async key=>stored.get(key)}),keys:async()=>['previous-release'],delete:async()=>{throw Error('Old cache must not be deleted during install');}};
  vm.runInNewContext(source('service-worker.js'),{self,caches,fetch:async request=>new Response('test',{status:new URL(request.url).pathname===failure?404:200}),URL,Request,Response,AbortController,setTimeout,clearTimeout,Promise,Set,Error});
  let pending;handlers.install({waitUntil:value=>pending=value});
  return {self,pending};
}
const optional=await installWithFailure('/pwa-dashboard-wide.jpg');await optional.pending;assert.equal(optional.self.activated,true);
const core=await installWithFailure('/app.js');await assert.rejects(core.pending,/Incomplete offline update/);assert.equal(core.self.activated,undefined);
console.log('PASS: offline rainfall and recovery, matched observation timestamps, commissioning coverage and optional/core app-update failures.');
