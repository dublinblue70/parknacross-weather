import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
for(const path of ['status.js','status-ui.js','rain.js','history.js','monthly.js','annual.js','app.js','radar.js','station-page.js','site-polish.js','review-tools.js','service-worker.js']){
  assert.doesNotThrow(()=>new vm.Script(read(path),{filename:path}),path+' must parse without a browser-blocking error');
}
const rainy=read('rain.js'),history=read('history.js'),monthly=read('monthly.js'),annual=read('annual.js');
assert.match(read('radar.html'),/rainfall.*WH40H/i,'Radar describes the new primary rain sensor');
assert.match(rainy,/rain-day-date/);
assert.match(rainy,/gauge-change day \(provisional total\)/);
assert.match(rainy,/2026-11-03/);
assert.match(history,/gauge changeover: provisional total/);
assert.match(history,/backgroundColor=rows\.map/);
assert.match(read('history.html'),/provisional/i);
assert.match(monthly,/key==="2026-11"/);
assert.match(annual,/year\)==="2026"/);
assert.match(read('monthly.html'),/id="rainSourceNote"/);
assert.match(read('annual.html'),/id="annualRainSourceNote"/);
assert.match(read('site-polish.css'),/--ui-touch-min: 44px/);
assert.match(read('site-polish.css'),/--ui-label-min: \.8125rem/);
const siteVersion=JSON.parse(read('package.json')).version;
assert.ok(read('admin.html').includes('Admin interface '+siteVersion));
assert.ok(read('service-worker.js').includes('parknacross-v'+siteVersion.replaceAll('.','-')+'-'));
console.log('PASS: public scripts parse, rainfall provenance is labelled, mobile type scale is readable and release metadata is consistent.');
