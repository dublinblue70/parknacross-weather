import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const pages=fs.readdirSync(root).filter(file=>file.endsWith('.html'));
const cssToken='site-polish.css?v=20261103-v38-4-242-ux';
for(const page of pages){
  if(['offline.html','intelligence.html'].includes(page))continue;
  const html=read(page);
  assert.ok(html.includes(cssToken),page+' must request the current shared mobile UX stylesheet');
}
const names=['status.js','status-ui.js','app.js','rain.js','history.js',
 'graphs.js','station-page.js','site-polish.js','review-tools.js',
 'monthly.js','annual.js','sky.js','radar.js','coast.js',
 'dashboard-ui.js','dashboard-enhancements.js','service-worker.js'];
for(const name of names){
  assert.doesNotThrow(()=>new vm.Script(read(name),{filename:name}),name+' has a JavaScript syntax error');
}
assert.match(read('radar.html'),/WH40H tipping-bucket gauge/);
assert.doesNotMatch(read('radar.html'),/measured locally by the WS90/);
assert.match(read('monthly.js'),/rainSourceNote/);
assert.match(read('annual.js'),/annualRainSourceNote/);
assert.match(read('rain.html'),/3 November changeover-day rainfall total is provisional/);
assert.match(read('history.html'),/3 Nov changeover-day rainfall total is provisional/);
assert.match(read('_worker/worker.mjs'),/wh40h_primary_rain:true/);
assert.match(read('worker.mjs'),/ARCHIVED SNAPSHOT — DO NOT DEPLOY/);
assert.match(read('_worker/README.md'),/single designated source/);
console.log('PASS: '+(pages.length-2)+' public pages use current mobile UX CSS; JavaScript syntax and WH40H provenance checks passed.');
