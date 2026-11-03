import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('status.js'),html=read('status.html'),ui=read('status-ui.js');
const start=source.indexOf('function describeWh40hStatus('),end=source.indexOf('\nasync function runChecks',start);
assert.ok(start>=0&&end>start,'WH40H function present');
const context={
 usableNumber:v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)),
 observationAge:(epoch,now)=>epoch>0?now-Number(epoch):null,
 fmtAge:s=>Math.round(s)+' sec',
 fmtNum:(v)=>Number(v).toFixed(1)
};
const check=vm.runInNewContext(source.slice(start,end)+'\ndescribeWh40hStatus;',context);
const now=1793710000, capabilities={worker_version:'38.4.240',features:{wh40h_primary_rain:true}};
const withReading=reading=>({capabilities,reading:{epoch:now-90,...reading}});
assert.equal(check(withReading({rain_rate_mm_h:0,rain_daily_mm:0}),now).state,'good','zero rain is healthy');
assert.equal(check(withReading({rain_rate_mm_h:0,rain_daily_mm:1.2}),now).state,'good');
assert.equal(check(withReading({rain_rate_mm_h:null,rain_daily_mm:null}),now).state,'warn','missing data cannot be healthy');
assert.equal(check({capabilities:{worker_version:'38.4.237',features:{}},reading:{epoch:now-60,rain_rate_mm_h:1,rain_daily_mm:2}},now).state,'warn','old mapping cannot be healthy');
assert.equal(check({capabilities,reading:{epoch:now-2000,rain_rate_mm_h:1,rain_daily_mm:2}},now).state,'warn','stale weather cannot be healthy');
assert.equal(check({capabilities,reading:{epoch:now-1100,rain_rate_mm_h:0,rain_daily_mm:0}},now).state,'warn','delayed feed deserves warning');
assert.equal(check({__error:new Error('network')},now).state,'warn');
assert.match(html,/health-wh40h.*data-health-source="rainSource"/s);
assert.match(source,/read\("rainSource"/);
assert.match(source,/const totalChecks=19/);
assert.match(ui,/of 19 sources checked/);
assert.match(ui,/wh40h:\[/);
assert.match(html,/status\.js\?v=20261103-wh40h-health/);
console.log('PASS: WH40H source-check card, error states, valid zero rain, freshness and recheck integration.');
