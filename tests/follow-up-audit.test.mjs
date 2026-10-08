import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

// Missing daily values must never become zero in monthly averages.
const monthly=source('monthly.js'),averages={};
vm.runInNewContext(monthly.slice(monthly.indexOf('const usable='),monthly.indexOf('const n='))+
  monthly.match(/function average\(values\)\{[^\n]+/)[0]+';result=average([1020,null,"",undefined]);empty=average([null,null]);',averages);
assert.equal(averages.result,1020);assert.equal(averages.empty,null);

// Arriving coverage repaints the heatmap without a visitor clicking a date.
const history=source('history.js'),heatmap={window:{},document:{getElementById:()=>null,addEventListener(){}},console,Date,Intl,Map,Set,Number,Math,Promise};
vm.createContext(heatmap);vm.runInContext(history,heatmap);
vm.runInContext('renders=0;renderCharts=()=>{};renderStats=()=>{};renderCalendar=()=>{};renderHeatmap=()=>renders++;getJSON=async url=>url.includes("/daily")?{days:[]}:url.includes("/coverage")?{days:[],summary:{coverage_percent:100}}:{};',heatmap);
await vm.runInContext('loadHistory()',heatmap);await new Promise(resolve=>setImmediate(resolve));assert.equal(heatmap.renders,2);

// New date loading and failure cannot retain the previous date's figures.
const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'previous day',hidden:true,setAttribute(){}});return nodes.get(id)};
let rejectDay;
const day={dayLoadSequence:0,selectedArchiveDay:null,window:{},$:el,set:(id,v)=>el(id).textContent=v,longDay:d=>d,loadHistoricalSky(){},renderCalendar(){},renderHeatmap(){},clearDayChart(){},API_BASE:'https://example.test',getJSON:()=>new Promise((_,reject)=>rejectDay=reject),console:{error(){}},encodeURIComponent};
vm.createContext(day);vm.runInContext(history.slice(history.indexOf('function clearDayValues('),history.indexOf('async function loadHistory()')),day);
const pending=day.loadDay('2026-10-07');assert.equal(el('dayHigh').textContent,'Loading…');assert.equal(el('dayCoverage').textContent,'Checking this date’s archive coverage…');
rejectDay(Error('Network unavailable'));await pending;assert.equal(el('dayHigh').textContent,'Unavailable');assert.equal(el('dayDetailCount').textContent,'Unavailable');assert.equal(el('archiveDayRetry').hidden,false);

// A late coverage response updates bounds but preserves an edited date range.
const dateNodes=new Map(),dateEl=id=>{if(!dateNodes.has(id))dateNodes.set(id,{value:'',events:{},addEventListener(n,f){this.events[n]=f}});return dateNodes.get(id)};
let startup;const dates={document:{getElementById:dateEl,querySelectorAll:()=>[],addEventListener:(n,f)=>startup=f},Date,Number,String,Math,fetch:()=>new Promise(()=>{})};
vm.createContext(dates);vm.runInContext(source('downloads.js'),dates);startup();dateEl('exportFrom').value='2026-09-20';dateEl('exportTo').value='2026-09-23';dateEl('exportFrom').events.input();vm.runInContext('setRangeDefaults("2026-09-11")',dates);
assert.equal(dateEl('exportFrom').value,'2026-09-20');assert.equal(dateEl('exportTo').value,'2026-09-23');assert.equal(dateEl('exportFrom').min,'2026-09-11');

// Shared zoom/reset registers both linear bars and lines (including lightning).
let explorerPlugin;const explorerWindow={Chart:{register:p=>explorerPlugin=p},addEventListener(){}};
vm.runInNewContext(source('chart-explorer.js'),{window:explorerWindow,Chart:explorerWindow.Chart,document:{addEventListener(){},getElementById:()=>null},Set,WeakMap,Date,Math,Number});
const chart=type=>({config:{type},options:{scales:{x:{type:'linear',min:100000,max:900000}}},data:{datasets:[{data:[{x:100000,y:0},{x:900000,y:1}]}]},update(){},draw(){}});
const bars=chart('bar'),line=chart('line');explorerPlugin.afterInit(bars);explorerPlugin.afterInit(line);explorerWindow.ParknacrossChartExplorer.zoom(200000,600000);
for(const c of [bars,line]){assert.equal(c.options.scales.x.min,200000);assert.equal(c.options.scales.x.max,600000);}explorerWindow.ParknacrossChartExplorer.reset();assert.equal(bars.options.scales.x.min,100000);
const lightningWindow={addEventListener(){}};vm.runInNewContext(source('lightning-charts.js'),{window:lightningWindow,document:{addEventListener(){}},Date,Number,Math,Set});
const series=lightningWindow.ParknacrossLightningSeries.buildSeries([{epoch:1800000000,lightning_strikes:0}],24,1800000000);assert.equal(series.times.length,series.count.length);assert.equal(typeof series.times[0],'number');

// Failed chart downloads prevent an incomplete release replacing the old one.
async function install(missing){const handlers={},cache=new Map();let skipped=0;
 const context={self:{registration:{scope:'https://example.test/'},addEventListener:(n,f)=>handlers[n]=f,skipWaiting:async()=>skipped++},caches:{open:async()=>({put:async(req,res)=>cache.set(req.url,res),match:async key=>cache.get(key)})},fetch:async req=>({ok:!req.url.endsWith(missing)}),Request,URL,AbortController,setTimeout,clearTimeout};
 vm.runInNewContext(source('service-worker.js'),context);let promise;handlers.install({waitUntil:p=>promise=p});await assert.rejects(promise,/Incomplete offline update/);assert.equal(skipped,0);
}
await install('chart.umd.min.js');await install('admin-tools.js');

// HTTP errors and cache-write failures preserve the working asset.
const handlers={},cached=new Response('working chart',{status:200});let writes=0;
vm.runInNewContext(source('service-worker.js'),{self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/'},addEventListener:(n,f)=>handlers[n]=f},caches:{open:async()=>({put:async()=>writes++}),match:async()=>cached},fetch:async()=>new Response('outage',{status:503}),Request,URL});
let result;handlers.fetch({request:new Request('https://example.test/chart.umd.min.js'),respondWith:p=>result=p,waitUntil(){}});assert.equal(await (await result).text(),'working chart');assert.equal(writes,0);
console.log('PASS: heatmap refresh, date loading/failure, missing averages, edited export dates, lightning zoom/reset and offline dependency/cache protection.');
