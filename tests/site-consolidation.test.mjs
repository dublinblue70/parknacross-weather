import assert from "node:assert/strict";
import {readFile, access} from "node:fs/promises";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=async path=>readFile(join(root,path),"utf8");
const [home,rain,coast,history,graphs,monthly,annual,station,menu,app,reportApp]=await Promise.all([
  "index.html","rain.html","coast.html","history.html","graphs.html",
  "monthly.html","annual.html","station.html","navigation.js","app.js","monthly.js"
].map(read));
assert(!home.includes("data-rain-outlook"),"Duplicate full rain-outlook card remains on Dashboard");
assert(!home.includes("data-coastal-compass"),"Duplicate coastal compass remains on Dashboard");
assert(rain.includes("data-rain-outlook")&&coast.includes("data-coastal-compass"),"Dedicated weather tools must remain");
assert(home.includes('href="rain.html#rainOutlookHeading"')&&home.includes('href="coast.html#coastalCompassHeading"'),"Dashboard specialist links missing");
for(const [key,id] of [["window","weatherWindowScene"],["clothes","wearTodayHeading"],["charts","temperatureChart"],["records","recordHigh"]]){
  assert(home.includes('data-dashboard-extra="'+key+'"'),"Optional Dashboard section missing: "+key);
  assert(home.includes('id="'+id+'"'),"Existing data binding removed: "+id);
}
for(const id of ["heroTemp","heroRain","windVal","rainVal","socialAdminPanel","todaySkyPanel","soilPanel","sunMoon"]){
  assert(home.includes('id="'+id+'"'),"Dashboard critical element missing: "+id);
}
assert(home.includes("data-laundry-window"),"Laundry tool must remain available");
assert(app.includes("function updateCharts()")&&app.includes('set("heroRain",'),"Dashboard logic must remain");
assert(history.includes('href="records.html"')&&history.includes('href="graphs.html#dateComparison"'),"History links to definitive tools missing");
assert(!history.includes('id="comparisonForm"')&&graphs.includes('id="comparisonForm"'),"Duplicate date comparison still shown");
assert(graphs.includes('id="comparisonChart"'),"Date comparison chart was removed");
assert(monthly.includes('aria-label="Weather report views"')&&annual.includes('aria-label="Weather report views"'),"Unified report tabs missing");
assert(monthly.includes('id="monthPicker"')&&annual.includes('id="yearPicker"')&&reportApp.includes("monthPicker"),"Report controls broken");
assert(menu.includes('reportLink.textContent = "Weather reports"'),"Unified navigation missing");
assert(station.includes('id="stationMaintenancePreview"')&&station.includes('id="maintenanceLog"'),"Station log must retain preview and full history");
assert(station.includes('maintenance.js?v='),"Full maintenance-log renderer not loaded");
assert(rain.includes('id="rainNow"')&&rain.includes('id="rainToday"'),"Rain Centre core measurements missing");
for(const path of ["monthly.html","annual.html","history.html","maintenance.html","records.html","sky.html","status.html","coast.html","rain.html","graphs.html","station.html"]){
 await access(join(root,path));
}
console.log("PASS: consolidation preserves live readings, historical URLs, specialist tools, reports, maintenance and navigation.");
