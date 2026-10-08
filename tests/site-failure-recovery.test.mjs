import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function environment() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {textContent:'', hidden:false, value:'', dataset:{}, style:{}, disabled:false,
      classList:{toggle(){},add(){},remove(){}}, setAttribute(){}, removeAttribute(){}, addEventListener(){}, append(){}, replaceChildren(){}});
    return nodes.get(id);
  };
  const callbacks=[];
  const context={window:{},document:{getElementById:node,querySelectorAll:()=>[],addEventListener:(event,fn)=>{if(event==='DOMContentLoaded')callbacks.push(fn);},createElement:()=>({})},console:{warn(){},error(){}},Date,Intl,Map,Set,WeakMap,Number,Math,Promise,URL,URLSearchParams,location:{href:'https://example.test/',search:'',reload(){}},setInterval(){},clearInterval(){},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout};
  vm.createContext(context);return {context,node,callbacks};
}
const history=environment();vm.runInContext(source('history.js'),history.context);
assert.doesNotThrow(()=>history.context.createCharts(),'History must start when the chart download fails');
assert.doesNotThrow(()=>history.context.renderCharts(),'History controls must remain usable without charts');
assert.match(history.node('historyChartStatus').textContent,/chart.*could not load/i);

assert.equal(history.context.expectedSamples('2026-03-29'),276);
assert.equal(history.context.expectedSamples('2026-10-25'),300);
assert.equal(history.context.expectedSamples('2026-10-07'),288);
const annual=environment();vm.runInContext(source('annual.js'),annual.context);
vm.runInContext('allRows=[{day:"2026-10-07",rain_mm:2,high_c:14,low_c:8}];render("2026")',annual.context);
assert.equal(annual.node('annualRain').textContent,'2.0 mm');
assert.match(annual.node('annualChartStatus').textContent,/chart.*could not load/i);

const graphs=environment();vm.runInContext(source('graphs.js'),graphs.context);
assert.doesNotThrow(()=>graphs.callbacks[0]());
assert.match(graphs.node('graphUpdated').textContent,/Graphs could not load/);
assert.doesNotMatch(graphs.node('chartTextSummary').textContent,/are loading/);
const monthly=environment();vm.runInContext(source('monthly.js'),monthly.context);
monthly.context.getJSON=async path=>path.startsWith('/daily')?{days:[]}:{};
await monthly.context.loadVerified();await new Promise(resolve=>setImmediate(resolve));
assert.match(monthly.node('monthStory').textContent,/No archive data/);
assert.doesNotMatch(monthly.node('monthTitle').textContent,/undefined|Invalid/);
assert.ok(monthly.node('monthTitle').textContent.length>0);

const station=environment();station.context.window.PARKNACROSS_CONFIG={apiBase:'https://example.test'};
station.context.fetch=async url=>{
  if(url.endsWith('/reliability'))throw Error('Optional reliability source failed');
  return {ok:true,json:async()=>url.endsWith('/quality')?{feed_status:'Live',samples_last_24h:288}: {available:false}};
};
vm.runInContext(source('station-v2.js'),station.context);station.callbacks[0]();await new Promise(resolve=>setImmediate(resolve));
assert.equal(station.node('qualityFeed').textContent,'Live','Failed reliability must not hide quality');
assert.equal(station.node('quality24').textContent,'288');
assert.match(station.node('qualityReliabilityNote').textContent,/could not.*refresh|unavailable/i);

const radar=environment();radar.context.window.PARKNACROSS_CONFIG={apiBase:'https://example.test'};radar.context.fetch=async()=>{throw Error('Radar unavailable');};
vm.runInContext(source('radar.js').replace(/\}\)\(\);\s*$/,'window.testRadar=loadRadar;})();'),radar.context);
await radar.context.window.testRadar();assert.match(radar.node('radarStatus').textContent,/unavailable/i);
assert.equal(radar.node('radarPlay').disabled,true);

console.log('PASS: missing charts retain History/Annual data, empty Monthly archive, isolated Station feeds and explicit radar failure.');
