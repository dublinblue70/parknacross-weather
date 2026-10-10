import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

// A live graph point remains plotted, while the archive count reflects saved rows only.
const graphSource=source('graphs.js').replace(/\}\)\(\);\s*$/,'window.testInclude=includeCurrentReading;})();');
const graphWindow={},graphContext={window:graphWindow,document:{addEventListener(){},getElementById(){return null},querySelectorAll(){return[]}},Date,Intl,Number,Math,Set,Map,console};
vm.runInNewContext(graphSource,graphContext);
const archive=[{epoch:100,temperature_c:10}],newer={epoch:101,temperature_c:11},same={epoch:100,temperature_c:12};
const withLive=graphWindow.testInclude(archive,newer);
assert.equal(withLive.rows.length,2);assert.equal(withLive.savedCount,1);assert.equal(withLive.liveReadingAdded,true);
const sameTime=graphWindow.testInclude(archive,same);
assert.equal(sameTime.rows.length,1);assert.equal(sameTime.savedCount,1);assert.equal(sameTime.liveReadingAdded,false);assert.equal(sameTime.rows[0].temperature_c,12);

// Day detail replaces the matching calendar/chart summary so both views agree.
const historyContext={window:{},document:{addEventListener(){}},Date,Intl,Map,Set,Number,Math,Promise};
vm.createContext(historyContext);vm.runInContext(source('history.js'),historyContext);
vm.runInContext(`dailyRows=[{day:'2026-10-10',high_c:15.7,low_c:8,rain_mm:0}];dailyMap=new Map(dailyRows.map(row=>[row.day,row]));renderCalendar=()=>{};renderCharts=()=>{};renderHeatmap=()=>{};reconcileDailySummary('2026-10-10',{high_c:16.4,low_c:8.2,rain_mm:0.1});`,historyContext);
assert.equal(vm.runInContext(`dailyMap.get('2026-10-10').high_c`,historyContext),16.4);
assert.equal(vm.runInContext(`dailyRows[0].low_c`,historyContext),8.2);

// Soil moisture changes use percentage points with correct singular/plural grammar.
const app=source('app.js'),visitStart=app.indexOf('function stationDayKey('),visitEnd=app.indexOf('async function refreshSoilFreshness()',visitStart);
const output={textContent:'',hidden:true};
const visitContext={Date,Intl,Number,Math,JSON,STATION_TIME_ZONE:'Europe/Dublin',visitComparisonRendered:false,
 localStorage:{getItem:()=>JSON.stringify({epoch:1791622500,soil_moisture_pct:36}),setItem(){}},
 usable:value=>value!==null&&value!==undefined&&Number.isFinite(Number(value)),lightningRelative:()=> '5 minutes ago',
 $:id=>id==='sinceVisitPanel'?output:null,set:(id,value)=>{if(id==='sinceVisitText')output.textContent=value;}};
vm.createContext(visitContext);vm.runInContext(app.slice(visitStart,visitEnd),visitContext);
visitContext.renderSinceLastVisit({epoch:1791622800,soil_moisture_pct:37,rain_daily_mm:0});
assert.match(output.textContent,/soil moisture rose 1 percentage point\b/);
assert.doesNotMatch(output.textContent,/points\b/);
console.log('PASS: saved graph counts, archive detail/calendar consistency and soil moisture units.');
