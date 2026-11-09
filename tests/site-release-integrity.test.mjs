import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const pages=fs.readdirSync(root).filter(file=>file.endsWith('.html'));
// All public pages must load the shared responsive stylesheet with a cache
// version. Individual pages legitimately use newer query tokens as they ship.
for(const page of pages){
  if(['offline.html','intelligence.html'].includes(page))continue;
  const html=read(page);
  assert.match(html,/site-polish\\.css\\?v=[A-Za-z0-9._-]+/,page+' must request the responsive UX stylesheet with a cache version');
}
assert.match(read('index.html'),/site-polish\\.css\\?v=20261109-mobile-spacing-rhythm/);
assert.match(read('index.html'),/class="section-heading planning-heading"/);
assert.match(read('site-polish.css'),/body\\.dashboard-page \\.planning-heading \\.source-note/);
const names=['status.js','status-ui.js','app.js','rain.js','history.js',
 'graphs.js','station-page.js','site-polish.js','review-tools.js','rain-gauge-audit.js','hydrangea-soil.js',
 'monthly.js','annual.js','sky.js','radar.js','coast.js',
 'dashboard-ui.js','dashboard-enhancements.js','service-worker.js'];
for(const name of names){
  assert.doesNotThrow(()=>new vm.Script(read(name),{filename:name}),name+' has a JavaScript syntax error');
}
assert.match(read('radar.html'),/WH40H tipping-bucket gauge/);
assert.doesNotMatch(read('radar.html'),/measured locally by the WS90/);
assert.match(read('monthly.js'),/rainSourceNote/);
assert.match(read('monthly.js'),/hasChangeoverRain\?/);
assert.match(read('site-polish.css'),/font-size:max\(14px,\.875rem\)!important/);
assert.match(read('dashboard-enhancements.js'),/forecast-mobile-preview/);
assert.match(read('annual.js'),/annualRainSourceNote/);
assert.match(read('rain.html'),/3 November changeover-day rainfall total is provisional/);
assert.match(read('history.html'),/3 Nov changeover-day rainfall total is provisional/);
assert.match(read('_worker/worker.mjs'),/wh40h_primary_rain:true/);
assert.match(read('worker.mjs'),/ARCHIVED SNAPSHOT — DO NOT DEPLOY/);
assert.match(read('_worker/README.md'),/single designated source/);
assert.ok(read('index.html').indexOf('id="observationsHeading"')<read('index.html').indexOf('id="planningHeading"'),'Live weather observations must precede planning tools');
assert.ok(read('index.html').indexOf('id="forecast"')<read('index.html').indexOf('id="planning"'),'Local forecast must precede planning tools');
assert.match(read('rain.html'),/id="rainGaugeAudit"/);
assert.match(read('service-worker.js'),/\.\/rain-gauge-audit\.js/);
assert.match(read('summary.html'),/Potted hydrangea · soil readings/);
assert.match(read('index.html'),/id="soilWateringStatus"/);
assert.match(read('summary.html'),/id="summarySoilWateringStatus"/);
assert.match(read('service-worker.js'),/\.\/hydrangea-soil\.js/);
console.log('PASS: '+(pages.length-2)+' public pages use current mobile UX CSS; JavaScript syntax and WH40H provenance checks passed.');
