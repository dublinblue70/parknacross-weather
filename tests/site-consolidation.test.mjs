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
const preferences=await read("dashboard-preferences.js");
const shortcutScript=await read("dashboard-ui.js");
assert(preferences.includes("section?.closest('details.dashboard-explore-group')"),"Custom layout must keep optional disclosure wrappers");
assert(shortcutScript.includes("revealSpecialistHash"),"Direct links must open collapsed specialist sections");
assert(/dashboard-preferences\.js\?v=202611\d{2}-[a-z0-9-]+/.test(home),"Dashboard must use the current preferences script");
assert(home.includes('data-dashboard-extra="charts" hidden')&&home.includes('data-dashboard-extra="records" hidden'),"Duplicated Dashboard chart and record panels should not be visible");
assert(home.includes('class="dashboard-specialist-links"')&&!home.includes('src="chart.umd.min.js'),"Specialist links should replace the unused Dashboard Chart.js library");
assert(history.includes('href="records.html"')&&history.includes('href="graphs.html#dateComparison"'),"History links to definitive tools missing");
assert(!history.includes('id="comparisonForm"')&&graphs.includes('id="comparisonForm"'),"Duplicate date comparison still shown");
assert(graphs.includes('id="comparisonChart"'),"Date comparison chart was removed");
assert(monthly.includes('aria-label="Weather report views"')&&annual.includes('aria-label="Weather report views"'),"Unified report tabs missing");
assert(monthly.includes('id="monthPicker"')&&annual.includes('id="yearPicker"')&&reportApp.includes("monthPicker"),"Report controls broken");
assert(menu.includes('reportLink.textContent = "Weather reports"'),"Unified navigation missing");
assert(station.includes('id="stationMaintenancePreview"')&&station.includes('id="maintenanceLog"'),"Station log must retain preview and full history");
assert(station.includes('maintenance.js?v='),"Full maintenance-log renderer not loaded");
assert(rain.includes('id="rainNow"')&&rain.includes('id="rainToday"'),"Rain Centre core measurements missing");
// Visitor-first streamlining: keep core data, reduce duplicate panels and preserve direct links.
const summary=await read("summary.html");
assert(home.includes('class="dashboard-coverage-more"')&&home.includes('id="dashboardCoveragePercent"'),"Archive coverage must remain accessible without crowding the Dashboard");
assert(home.includes('href="climate.html"')&&home.includes('data-dashboard-extra="context"'),"Climate has its own page, while local context remains available on demand");
assert(home.includes('class="local-planning-quick" href="rain.html#rainOutlookHeading"')&&
       home.includes('class="local-planning-quick" href="coast.html#coastalCompassHeading"'),"One-tap local planning shortcuts missing");
assert(summary.includes('class="summary-actions-more"')&&summary.includes('id="downloadCsvButton"')&&summary.includes('id="shareWeatherButton"'),"Report export and share controls must remain accessible");
assert(rain.includes('id="rainMoreStatistics"')&&rain.includes('id="rainMeasurementNotes"')&&rain.includes('id="rainIntensityGuide"'),"Rain measurement and historical detail must remain accessible");
assert(rain.indexOf('id="rainNow"')<rain.indexOf('id="rainMeasurementNotes"'),"Live rainfall must precede technical notes");
for(const id of ["rainEventCount","rainMonth","rainYear","dryDays","rainEvidence"])assert(rain.includes('id="'+id+'"'),"Rain Centre lost the data binding "+id);
assert(menu.includes('"networks.html"'),"The external network directory must remain in main navigation");

for(const path of ["monthly.html","annual.html","history.html","maintenance.html","records.html","sky.html","status.html","coast.html","rain.html","graphs.html","station.html"]){
 await access(join(root,path));
}
console.log("PASS: consolidation preserves live readings, historical URLs, specialist tools, reports, maintenance and navigation.");
