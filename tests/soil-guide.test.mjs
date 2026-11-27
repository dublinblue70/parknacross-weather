import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const context={window:{},Date,Intl,Math,Number};
vm.createContext(context);
vm.runInContext(read('soil-guide.js'),context);
const guide=context.window.ParknacrossSoil;
const now=Date.parse('2026-11-05T15:10:00Z')/1000;
const base={epoch:now,nowEpoch:now,temperature:11.8};
const okay=guide.assess({...base,moisture:34});
assert.equal(okay.status,'No watering indicated yet');
assert.match(okay.advice,/still slightly damp/);
assert.match(okay.context,/cooler months/);
assert.match(okay.context,/not universal watering thresholds/);
assert.match(guide.assess({...base,moisture:14}).advice,/If compost feels dry/);
const falling=guide.assess({...base,moisture:27,trendChange:-4});
assert.match(falling.trend,/Drying/);
assert.match(falling.advice,/falling/);
const wet=guide.assess({...base,moisture:74,trendChange:4});
assert.match(wet.advice,/drainage/);
assert.match(wet.trend,/Moistening/);
const stale=guide.assess({...base,moisture:34,epoch:now-2000});
assert.equal(stale.status,'Reading needs checking');
assert.doesNotMatch(stale.advice,/no watering needed/i);
assert.equal(guide.assess({...base,moisture:null}).status,'Check compost manually');
const cutoff=Date.parse('2026-11-27T09:00:00Z')/1000;
assert.equal(guide.NEW_POT_CUTOFF_EPOCH,cutoff);
const latest=cutoff+10*3600;
assert.equal(guide.trendFromReadings([{epoch:latest-21600,soil_moisture_pct:38},{epoch:latest-3600,soil_moisture_pct:33}],{epoch:latest,soil_moisture_pct:34}),-4);
assert.equal(guide.trendFromReadings([{epoch:cutoff-20,soil_moisture_pct:45}],{epoch:cutoff+8000,soil_moisture_pct:34}),null,'no comparison to previous pot');
assert.equal(guide.trendFromReadings([],{epoch:latest,soil_moisture_pct:34}),null);
// Original archival baseline predates the confirmed new pot location.
const first=Date.parse('2026-09-28T13:00:00Z')/1000;
assert.equal(guide.baselinePhase(first,cutoff+60).day,1);
assert.equal(guide.baselinePhase(first,cutoff+13*86400).building,true);
assert.equal(guide.baselinePhase(first,cutoff+14*86400).building,false);
assert.equal(guide.baselinePhase(null,cutoff+60).verified,false);
assert.equal(guide.baselinePhase(first,cutoff-300).verified,false);
const resetting=guide.assess({moisture:32,temperature:9.3,epoch:cutoff+2000,nowEpoch:cutoff+2100,trendChange:-7});
assert.equal(resetting.status,'Building new-pot baseline');
assert.doesNotMatch(resetting.advice,/No watering indicated yet/);
assert.match(resetting.context,/Earlier pot readings are excluded/);
assert.equal(guide.assess({moisture:32,temperature:9.3,epoch:cutoff+2000,nowEpoch:cutoff+3000}).status,'Reading needs checking');

for(const f of ['summary.html','index.html']){assert.match(read(f),/soil-guide\.js\?v=/);assert.match(read(f),/soil-guide\.css\?v=/);}
assert.match(read('summary.js'),/renderSoil\(current,rows\)/);
assert.match(read('app.js'),/ParknacrossSoil/);
console.log('PASS: Garden Soil guidance handles 34%, changing moisture, dry/wet compost, stale readings and seasonal context.');

for(const filename of ['index.html','summary.html','graphs.html','station.html','app.js','summary.js','station-page.js','soil-guide.js','soil-guide.css','service-worker.js']){
  assert.doesNotMatch(read(filename),/hydrangea/i, filename+' should not refer to previous plant');
}
assert.match(read('index.html'),/>Garden Soil<\/h2>/);
assert.match(read('summary.html'),/>Garden Soil<\/h2>/);

assert.match(read('index.html'),/Electrical conductivity/);
assert.match(read('app.js'),/Number\(row\.epoch\)>=newPotEpoch/);
assert.match(read('summary.js'),/trendFromReadings\(historyRows,current\)/);
