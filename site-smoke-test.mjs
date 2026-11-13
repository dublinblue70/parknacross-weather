import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = await readdir(root);
const releaseVersion = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const htmlFiles = files.filter(name => name.endsWith(".html"));
const failures = [];
const offlineReferences = new Set();

for (const obsoleteWorker of ["worker.js", "cloudflare-worker.js", "worker-v38.4.47-photo-likes.js", "Parknacross-worker-v38.4.47-photo-likes.txt", "Parknacross-worker-v38.4.48-like-once.txt", "Parknacross-worker-v38.4.78-MARINE-FEED-FAILOVER.js"]) {
  if (files.includes(obsoleteWorker)) failures.push(`${obsoleteWorker}: obsolete Cloudflare Worker copy must not ship with the website`);
}

for (const name of htmlFiles) {
  const html = await readFile(join(root, name), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) failures.push(`${name}: duplicate IDs ${[...new Set(duplicateIds)].join(", ")}`);
  if (!/<meta\s+name="description"/i.test(html)) failures.push(`${name}: missing meta description`);
  if (!/<link\s+rel="canonical"/i.test(html)) failures.push(`${name}: missing canonical URL`);
  if (!/<h1\b/i.test(html)) failures.push(`${name}: missing H1`);
  if (name !== "offline.html" && name !== "intelligence.html") {
    if (!html.includes('href="install.html">Install help</a>')) failures.push(`${name}: missing static Install help link`);
    if (!html.includes('href="privacy.html">Privacy</a>')) failures.push(`${name}: missing static Privacy link`);
    const menuItems = [...html.matchAll(/role="menuitem"/g)].length;
    if (name !== "admin.html" && name !== "offline.html" && name !== "intelligence.html" && menuItems !== (name === "networks.html" ? 12 : 11)) failures.push(`${name}: unexpected static More-menu count ${menuItems}`);
  }

  for (const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)) {
    const ref = match[1];
    if (/^(?:https?:|mailto:|#|data:)/i.test(ref) || !ref) continue;
    try {
      await access(join(root, ref));
      if (/\.(?:html|js|css|webmanifest|png|jpe?g|svg)$/i.test(ref)) offlineReferences.add(ref);
    }
    catch { failures.push(`${name}: missing local reference ${ref}`); }
  }

  for (const match of html.matchAll(/<button\b([^>]*)>/gi)) {
    if (!/\btype="(?:button|submit|reset)"/i.test(match[1])) failures.push(`${name}: button missing explicit type`);
  }
}

const serviceWorker = await readFile(join(root, "service-worker.js"), "utf8");
for (const ref of offlineReferences) {
  if (!serviceWorker.includes(`./${ref}`)) failures.push(`service-worker.js: local page asset is not pre-cached: ${ref}`);
}

try {
  const manifest = JSON.parse(await readFile(join(root, "manifest.webmanifest"), "utf8"));
  if (!Array.isArray(manifest.shortcuts) || manifest.shortcuts.length < 3) failures.push("manifest.webmanifest: expected Dashboard, Graphs and Rain shortcuts");
  const iconPurposes = (manifest.icons || []).map(icon => String(icon.purpose || ""));
  if (!iconPurposes.some(purpose => purpose.split(/\s+/).includes("maskable"))) failures.push("manifest.webmanifest: expected at least one maskable icon");
  if (!iconPurposes.some(purpose => purpose.split(/\s+/).includes("any"))) failures.push("manifest.webmanifest: expected at least one standard icon");
  if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length < 2) failures.push("manifest.webmanifest: expected Dashboard and Graphs install screenshots");
  const manifestAssets = [
    ...(manifest.icons || []).map(item => item.src),
    ...(manifest.shortcuts || []).flatMap(shortcut => (shortcut.icons || []).map(item => item.src)),
    ...(manifest.screenshots || []).map(item => item.src)
  ];
  for (const asset of new Set(manifestAssets)) {
    try { await access(join(root, asset)); }
    catch { failures.push(`manifest.webmanifest: missing asset ${asset}`); }
    if (!serviceWorker.includes(`./${asset}`)) failures.push(`service-worker.js: manifest asset is not pre-cached: ${asset}`);
  }
} catch (error) {
  failures.push(`manifest.webmanifest: invalid JSON (${error.message})`);
}

const requiredChecks = [
  ["history.js", "/coverage?days=371"],
  ["history.js", "Weather observations for"],
  ["history.js", "No lightning count stored for this day"],
  ["status.js", "retained in the raw archive"],
  ["station.html", "Estimated database writes today"],
  ["navigation.js", "document.body.appendChild(menu)"],
  ["sitemap.xml", "<lastmod>"],
  ["app.js", "dashboardTooltipTime"],
  ["graphs.js", "Partial archive"],
  ["history.html", "previousArchiveDay"],
  ["maintenance.html", "noindex,follow"],
  ["privacy.html", "Privacy information"],
  ["install.html", "Install Parknacross Weather"],
  ["install.html", "Home Screen or browser mode"],
  ["install.html", "Active app cache release"],
  ["station.html", "diagInstalled"],
  ["station.html", "<option value=\"40\">Within 40 km</option>"],
  ["lightning-charts.js", "{min:0,max:40}"],
  ["lightning-charts.js", "{stepSize:5}"],
  ["lightning-charts.js", "Number(value) <= 40"],
  ["graphs.html", "detector range 0–40 km"],
  ["station-v2.js", "approximate range up to 40 km"],
  ["alert-settings.js", "LIGHTNING_DISTANCES"],
  ["alert-settings.js", "reportedDistance <= 40"],
  ["app.js", "function lightningDistance"],
  ["status.js", "PARTIAL"],
  ["pwa-diagnostics.js", "diagWorker"],
  ["service-worker.js", `parknacross-v${releaseVersion.replaceAll(".", "-")}-`],
  ["graphs.js", "recentEventOutsideWindow"],
  ["graphs.js", "applyExactTimeBounds"],
  ["service-worker.js", "url.pathname.endsWith(\"/styles.css\")"],
  ["service-worker.js", "url.pathname.endsWith(\"/app.js\")"],
  ["service-worker.js", "./offline.html"],
  ["manifest.webmanifest", "icon-maskable-512.png"],
  ["manifest.webmanifest", "pwa-dashboard-narrow.jpg"],
  ["graphs.html", "chart-highlights"],
  ["graphs.html", "How to read these charts"],
  ["privacy.html", "Mostly weather, very little personal data"],
  ["playwright.config.mjs", "mobile-safari"],
  ["mobile-menu.spec.mjs", "More menu works"],
  ["coast.html", "Sea &amp; Swim Conditions"],
  ["coast.js", "renderSwimSummary"],
  ["coast.js", "localSeaEstimate"],
  ["coast.js", "A range is more honest"],
  ["coast.html", "Estimated range · not measured at Poulshone"],
  ["data-corrections.js", "PARKNACROSS_DATA_CORRECTIONS"],
  ["service-worker.js", "ignoreSearch"],
  ["app.js", "updateWhatToWear"],
  ["index.html", "What to wear now"],
  ["index.html", "Outdoor clothing guide"],
  ["index.html", "astronomy-critical-styles"],
  ["index.html", "class=\"phase-icon sun-phase-icon\""],
  ["index.html", "class=\"phase-icon moon-phase-icon\""],
  ["monthly.html", "shareMonthCard"],
  ["monthly.js", "shareMonthlyCard"],
  ["monthly.js", "missingRainDays"],
  ["annual.js", "missingRainDays"],
  ["history.js", "Rain-day count unavailable"],
  ["status.js", "Wind-reading quality counters could not be retrieved"],
  ["downloads.html", "rel=\"manifest\""],
  ["status.html", "rel=\"manifest\""],
  ["service-worker.js", "./ardamine-weather.html"],
  ["service-worker.js", "./north-wexford-coastal-weather.html"],
  ["intelligence.html", "window.location.replace(\"summary.html\")"],
  ["summary.html", "Significant weather check"],
  ["summary.js", "renderSignificantWeather"],
  ["summary.js", "AbortSignal.timeout(30000)"],
  ["coast.html", "Water Safety Ireland"],
  ["records.js", "under 0.2 mm/day"],
  ["monthly.html", "Under 0.2 mm"],
  ["sky.html", "Retry loading photo"],
  ["sky.js", "showRetry(true)"],
  ["styles.css", "#skyRetryButton[hidden]{display:none!important}"],
  ["styles.css", ".nav-more-menu a:visited"],
  ["styles.css", ".nav-more-menu a:visited"],
  ["status.html", ".nav-more-menu a:visited"],
  ["styles.css", ".nav-more-menu a.active:hover"],
  ["status.html", ".nav-more-menu a.active:hover"],
  ["navigation.js", "data-nav-more-popup"],
  ["navigation.js", "Site & app"],
  ["downloads.html", "archiveCoverage"],
  ["downloads.js", "query.set(\"fresh\",\"1\")"],
  ["downloads.js", "soil_moisture_pct"],
  ["downloads.js", "lightning_distance_km"],
  ["downloads.js", "lightning_last_strike_time_ireland"],
  ["downloads.js", "?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}"],
  ["downloads.html", "Choose a date range"],
  ["downloads.html", "id=\"exportFrom\""],
  ["downloads.html", "id=\"exportTo\""],
  ["csv-export-test.mjs", "environmentWithArtificialPageCap"],
  ["package.json", "@playwright/test"]
];

for (const [name, text] of requiredChecks) {
  const content = await readFile(join(root, name), "utf8");
  if (!content.includes(text)) failures.push(`${name}: expected marker missing: ${text}`);
}

const intelligenceHtml = await readFile(join(root, "intelligence.html"), "utf8");
if (!/noindex,follow/.test(intelligenceHtml) || !/summary\.html/.test(intelligenceHtml)) failures.push("intelligence.html: retired page must redirect to Summary and remain out of search results");

for (const name of ["index.html", "climate.html", "platform.js", "climate.js"]) {
  const content = await readFile(join(root, name), "utf8");
  if (/forecast[- ]verification/i.test(content)) failures.push(`${name}: removed forecast verification is still present`);
}
if (files.includes("intelligence.js")) failures.push("intelligence.js: retired Weather Lab code must not ship");
const skyHtml = await readFile(join(root, "sky.html"), "utf8");
if (!skyHtml.includes("manually uploaded photograph")) failures.push("sky.html: manual-photo disclosure is missing");
if (/live camera feed/i.test(skyHtml) && !/not a continuous live camera feed/i.test(skyHtml)) failures.push("sky.html: unfinished live-camera claim is still present");
const coastHtml = await readFile(join(root, "coast.html"), "utf8");
if (/What to wear today|Outdoor clothing guide/.test(coastHtml)) failures.push("coast.html: land-based clothing guide must not appear on the Sea & Swim page");
const dashboardHtml = await readFile(join(root, "index.html"), "utf8");
const dashboardChartsCss = await readFile(join(root, "dashboard-ui.css"), "utf8");
if (!dashboardHtml.includes('class="chart-grid chart-grid--balanced"') ||
    !dashboardHtml.includes('class="chart-column chart-column--observations"') ||
    !dashboardHtml.includes('class="chart-column chart-column--analysis"') ||
    !dashboardHtml.includes('dashboard-ui.css?v=20261111-align-weather-values') ||
    !dashboardChartsCss.includes("body.dashboard-page .trends-section .chart-grid.chart-grid--balanced") ||
    !dashboardChartsCss.includes("align-items: start") ||
    !dashboardChartsCss.includes("flex: 0 0 auto") ||
    !dashboardChartsCss.includes("@media (max-width: 760px)") ||
    !dashboardChartsCss.includes("grid-template-columns: minmax(0, 1fr)")) {
  failures.push("Dashboard trends: balanced independent columns must avoid huge empty rainfall card and stack on mobile");
}
const dashboardTrendSection = dashboardHtml.split('class="chart-grid chart-grid--balanced"')[1]?.split('class="records-section"')[0] || "";
const standardCharts = dashboardTrendSection.split('class="chart-column chart-column--observations"')[1]?.split('class="chart-column chart-column--analysis"')[0] || "";
const detailedCharts = dashboardTrendSection.split('class="chart-column chart-column--analysis"')[1] || "";
const chartIDs = ["temperatureChart","windChart","pressureChart","rainChart","solarChart","uvChart","windRose"];
if (chartIDs.some(id => (dashboardTrendSection.match(new RegExp('id="' + id + '"','g')) || []).length !== 1) ||
    ["temperatureChart","windChart","pressureChart","rainChart"].some(id => !standardCharts.includes('id="' + id + '"')) ||
    ["solarChart","uvChart","windRose"].some(id => !detailedCharts.includes('id="' + id + '"')) ||
    (dashboardTrendSection.match(/class="chart-card(?: wind-card)?"/g) || []).length !== 6) {
  failures.push("Dashboard trends: six preserved charts must occupy correct two balanced columns exactly once");
}

const historyHtml = await readFile(join(root, "history.html"), "utf8");
const historyApp = await readFile(join(root, "history.js"), "utf8");
if (/Weather diary|weatherDiary|Notable Parknacross weather/.test(historyHtml + historyApp)) failures.push("history: removed Weather Diary content remains");
if (/garden soil\s+garden-soil/i.test(dashboardHtml)) failures.push("index.html: duplicated garden-soil wording remains");
const dashboardApp = await readFile(join(root, "app.js"), "utf8");
const platformApp = await readFile(join(root, "platform.js"), "utf8");
if (platformApp.includes('$("shareTodayButton")?.addEventListener')) failures.push("platform.js: obsolete duplicate weather-card click handler remains");
if ((dashboardApp.match(/\$\("shareTodayButton"\)\?\.addEventListener\("click",createWeatherCard\)/g) || []).length !== 1) failures.push("app.js: expected exactly one active weather-card click handler");
const alertSettings = await readFile(join(root, "alert-settings.js"), "utf8");
if (!/saveSettings\(\{\s*enabled:\s*false\s*\}\)/.test(alertSettings)) failures.push("alert-settings.js: notification disable branch is missing");
if (!alertSettings.includes('"Turn off notifications"')) failures.push("alert-settings.js: enabled notification control does not offer an off action");
if (!alertSettings.includes('button.setAttribute("aria-pressed", String(enabled))')) failures.push("alert-settings.js: notification control state is not exposed accessibly");
const moonFunctionStart = dashboardApp.indexOf("function moonPhaseInfo");
const moonFunctionEnd = dashboardApp.indexOf("\n\nconst ASTRONOMY_RAD", moonFunctionStart);
if (moonFunctionStart < 0 || moonFunctionEnd < 0) {
  failures.push("app.js: moon phase classifier could not be tested");
} else {
  try {
    const moonPhaseForTest = Function(`return (${dashboardApp.slice(moonFunctionStart, moonFunctionEnd)})`)();
    const reference = Date.UTC(2000, 0, 6, 18, 14);
    const synodicMonthMs = 29.530588853 * 86400000;
    const expectedSequence = [
      [0, "New Moon"],
      [0.1, "Waxing Crescent"],
      [0.25, "First Quarter"],
      [0.4, "Waxing Gibbous"],
      [0.5, "Full Moon"],
      [0.6, "Waning Gibbous"],
      [0.75, "Last Quarter"],
      [0.9, "Waning Crescent"],
      [0.99, "New Moon"]
    ];
    for (const [fraction, expected] of expectedSequence) {
      const actual = moonPhaseForTest(new Date(reference + fraction * synodicMonthMs)).name;
      if (actual !== expected) failures.push(`app.js: lunar phase ${fraction} expected ${expected}, found ${actual}`);
    }
    const postFull = moonPhaseForTest(new Date("2026-09-28T05:44:00Z"));
    if (postFull.name !== "Waning Gibbous") failures.push(`app.js: 97% post-full Moon should be Waning Gibbous, found ${postFull.name}`);
  } catch (error) {
    failures.push(`app.js: moon phase classifier test failed (${error.message})`);
  }
}
if ((dashboardHtml.match(/id="wearTodayHeading"/g)||[]).length !== 1) failures.push("index.html: expected exactly one Dashboard clothing guide");
if (!dashboardHtml.includes('data-corrections.js?v=20260924-v38-4-97')) failures.push("index.html: shared data corrections must load before the dashboard application");
if (dashboardHtml.includes('id="wearForecast"')) failures.push("index.html: redundant forecast advice banner must remain removed");
if (!dashboardApp.includes('const forecastNote=$("wearForecast")')) failures.push("app.js: removed forecast banner must be guarded when absent");
if (!dashboardHtml.includes('aria-label="Daily sun phases"') || !dashboardHtml.includes('aria-label="Eight phases of the Moon"')) failures.push("index.html: visual sun and moon phase cycles are missing");
if (!dashboardHtml.includes('id="seasonNextMarker"') || !dashboardHtml.includes('id="seasonDateNote"') || !dashboardHtml.includes("data-season-date")) failures.push("index.html: year-specific annual equinox and solstice outlook is missing");
if (!dashboardHtml.includes('id="todayTempArchive"')) failures.push("index.html: latest saved daily temperature summary is not shown beside live extrema");
if (!dashboardHtml.includes('id="weatherWindowScene"') || !dashboardHtml.includes('id="weatherWindowObservation"') || dashboardHtml.includes("weatherSoundToggle") || dashboardHtml.includes("weather-sound-controls") || dashboardHtml.includes("Illustrated from local readings")) failures.push("index.html: Weather Window should remain while all sound controls and the removed caption stay absent");
if (!/weather-window\.css\?v=\d{8}-v\d+(?:-\d+)+/.test(dashboardHtml) || !/weather-window\.js\?v=\d{8}-(?:v\d+(?:-\d+)+|[a-z0-9-]+)/.test(dashboardHtml)) failures.push("index.html: isolated weather window assets must be versioned and loaded");
for (const page of ["install.html", "station.html"]) {
  const html = await readFile(new URL(page, import.meta.url), "utf8");
  if (/id="diagCache">v\d/i.test(html)) failures.push(`${page}: installation diagnostics must not hardcode a release number`);
  if (!html.includes('id="diagCache">Checking…')) failures.push(`${page}: installation diagnostics should load the active release dynamically`);
}
const diagnosticsSource = await readFile(new URL("pwa-diagnostics.js", import.meta.url), "utf8");
if (/v\d+\.\d+\.\d+/.test(diagnosticsSource)) failures.push("pwa-diagnostics.js: release number must be read dynamically");
if (!dashboardHtml.includes('class="ww-coastline"') || !dashboardHtml.includes('class="ww-sea-lines"') || !dashboardHtml.includes('class="ww-garden"')) failures.push("index.html: Ardamine Weather Window should include the added coastal, sea and garden illustration details");
if (dashboardHtml.includes('id="wearForecast"')) failures.push("index.html: removed forecast advice banner must not reappear");
if (!dashboardHtml.includes("separate from live station readings")) failures.push("index.html: forecast must remain clearly distinct from measured observations");
if (!dashboardApp.includes('strikesToday===0?"None today"')) failures.push("app.js: zero-lightning wording is missing");
const coastScript = await readFile(join(root, "coast.js"), "utf8");
if (/Math\.(?:floor|ceil)\(Math\.(?:min|max)\(model,buoy\)\*2\)/.test(coastScript)) failures.push("coast.js: sea-temperature range still expands to half-degree bounds");
const statusScript = await readFile(join(root, "status.js"), "utf8");
if (!statusScript.includes("Overall archive completeness is shown on the History page")) failures.push("status.js: monthly coverage must be distinguished from full-archive completeness");
if (!statusScript.includes("coverage · ${reliability.actual_samples")) failures.push("status.js: archive coverage detail must name the current month scope");
const summaryHtml = await readFile(join(root, "summary.html"), "utf8");
const summaryApp = await readFile(join(root, "summary.js"), "utf8");
if (!summaryHtml.includes('id="officialWarningBadge"') || !summaryApp.includes('function renderOfficialWarningStatus')) failures.push("summary: official warning colour status is missing");
if (!summaryApp.includes('warning-green') || !summaryApp.includes('warning-yellow') || !summaryApp.includes('warning-orange') || !summaryApp.includes('warning-red') || !summaryApp.includes('warning-white')) failures.push("summary.js: official warning colour states are incomplete");
try {
  const start = summaryApp.indexOf("function renderOfficialWarningStatus(");
  const end = summaryApp.indexOf("\n\nasync function loadOfficialWarningStatus", start);
  const nodes = new Map();
  for (const id of ["officialWarningBadge", "officialWarningDetail"]) nodes.set(id, { textContent: "", classList: { values: new Set(), add(value) { this.values.add(value); }, remove(...values) { values.forEach(value => this.values.delete(value)); } } });
  const warningsWindow={};(Function("window",await readFile(join(root,"weather-warnings.js"),"utf8")))(warningsWindow);
  const render = Function("$", "TIME_ZONE", "window", `${summaryApp.slice(start, end)}; return renderOfficialWarningStatus;`)(id => nodes.get(id), "Europe/Dublin",warningsWindow);
  render({ warnings: [{ level: "Yellow", type: "Rain", expires: new Date(Date.now() + 3600000).toISOString() }] });
  if (!nodes.get("officialWarningBadge").classList.values.has("warning-yellow")) failures.push("summary.js: official yellow warnings do not receive the yellow colour");
  render({ warnings: [{ level: "Yellow" }, { level: "Orange" }, { level: "Red" }] });
  if (!nodes.get("officialWarningBadge").classList.values.has("warning-red")) failures.push("summary.js: highest official warning level is not selected");
  render({ warnings: [] });
  if (!nodes.get("officialWarningBadge").classList.values.has("warning-green")) failures.push("summary.js: empty official feed does not show green/no warning");
  render(null);
  if (!nodes.get("officialWarningBadge").classList.values.has("warning-white")) failures.push("summary.js: unavailable official feed does not show white/unavailable");
} catch (error) {
  failures.push(`summary.js: official warning status checks failed (${error.message})`);
}
const skyPageHtml = await readFile(join(root, "sky.html"), "utf8");
const skyStyles = await readFile(join(root, "styles.css"), "utf8");
if (!dashboardHtml.includes('src="sky-like-storage.js?v=20261014-v38-4-210"') || !skyPageHtml.includes('src="sky-like-storage.js?v=20261014-v38-4-210"')) failures.push("sky photos: Safari-safe likes storage must load on both dashboard and Today’s Sky page");
/* Today's Sky copy uses a top introduction and a separate lower photo detail area.
 * This layout must keep the photo/likes controls and admin IDs intact. */
if (!dashboardHtml.includes('class="today-sky-copy-intro"') ||
    !dashboardHtml.includes('class="today-sky-copy-footer"') ||
    !dashboardHtml.includes('class="today-sky-detail-label"') ||
    !dashboardHtml.includes('id="todaySkyMeta" role="status" aria-live="polite"') ||
    !dashboardHtml.includes("justify-content: space-between;") ||
    !dashboardHtml.includes("Name for photo likes (optional)")) {
  failures.push("index.html: Today's Sky copy hierarchy, photo status and discreet likes-name control must stay intact");
}
const dashboardSkyPhotoStyle = dashboardHtml.match(/\.today-sky-photo\s*\{([^}]+)\}/)?.[1] || "";
if (!/height:\s*auto/.test(dashboardSkyPhotoStyle) || !/object-fit:\s*contain/.test(dashboardSkyPhotoStyle) || /max-height:\s*390px/.test(dashboardSkyPhotoStyle)) failures.push("index.html: dashboard sky photo must preserve its full image without cropping");
if (!skyStyles.includes(".sky-page-photo .sky-image{display:block;width:100%;height:auto;min-height:0;max-height:none;aspect-ratio:auto;object-fit:contain")) failures.push("styles.css: Today’s Sky page photo must preserve its full image without cropping");
if (!skyStyles.includes(".sky-page-photo .today-sky-caption-pill")) failures.push("styles.css: Today’s Sky caption pill must be styled on the photo");
if (!skyPageHtml.includes("sky.js?v=20261014-v38-4-210")) failures.push("sky.html: landscape photo and caption fix cache version is missing");
const summaryScript = await readFile(join(root, "summary.js"), "utf8");
if (!summaryScript.includes("including the latest live update")) failures.push("summary.js: live readings must not be labelled as stored-only observations");
if (!summaryScript.includes("includes today so far")) failures.push("summary.js: dry spell must identify the current partial day");
const radarHtml = await readFile(join(root, "radar.html"), "utf8");
const radarScript = await readFile(join(root, "radar.js"), "utf8");
if (!radarHtml.includes('data-satellite-stream') || !radarHtml.includes('nigtvuOspmM')) failures.push("radar.html: official EUMETSAT live stream embed is missing");
if (!radarHtml.includes('href="#satelliteImagery"') || !radarScript.includes("new IntersectionObserver")) failures.push("satellite stream must be discoverable and lazy-loaded");
if (!radarScript.includes("stream.src=stream.dataset.streamSrc") || radarHtml.includes("eumetview.eumetsat.int/static-images")) failures.push("satellite stream must replace the retired static-image URLs");
if (!radarHtml.includes('id="radarCenter"') || !radarScript.includes('map.setView(coords,Math.max(7,map.getZoom()))')) failures.push("radar map must have a control to centre on Parknacross");
if (!radarHtml.includes("not a still image") || !radarHtml.includes("Open EUMETSAT stream directly") || !radarHtml.includes("player is blank or blocked")) failures.push("satellite stream must be clearly labelled and include a direct fallback link");
if (!radarScript.includes("Latest frame captured") || !radarScript.includes("Radar frames are stale") || !radarScript.includes("Radar feed may be delayed")) failures.push("radar must show latest frame time and stale-feed warnings");
if (!radarScript.includes("playing=false") || !radarHtml.includes("Frames start paused")) failures.push("radar animation must start paused to reduce motion and loading");
if (!coastHtml.includes('id="coastLocalFreshness"') || !coastScript.includes("Parknacross local readings · observed")) failures.push("coast.html: local observation freshness must be visible");
if (!coastHtml.includes('id="coastWarn"') || !coastHtml.includes('Wicklow Head to Carnsore Point') || !coastHtml.includes('warnings/today/marine/EI811')) failures.push("coast.html: verified North Wexford coastal-sector warnings need source and official link");
if (/id="marineArea"|id="marineOutlook"|id="marineWind"|id="m2SeaTemp"/.test(coastHtml)) failures.push("coast.html: non-local forecasts and offshore M2 reference must not be displayed");
const graphHtml = await readFile(join(root, "graphs.html"), "utf8");
const summaryPageHtml = await readFile(join(root, "summary.html"), "utf8");
if (!summaryPageHtml.includes('href="graphs.html?hours=168#soilMoistureCard"')) failures.push("summary: soil chart link must open the weekly graph range at the soil charts");
const graphScript = await readFile(join(root, "graphs.js"), "utf8");
const historyScript = await readFile(join(root, "history.js"), "utf8");
if (!graphHtml.includes("Units are printed on the axes") || !graphHtml.includes("Blank sections mean readings are missing, not zero") || !graphScript.includes("spanGaps:false")) failures.push("graphs must explain units and show archive gaps without connecting lines");
if (!/id="soilMoistureCard"(?![^>]*\shidden)/.test(graphHtml) || !/id="soilDetailCard"(?![^>]*\shidden)/.test(graphHtml) || !graphScript.includes('$("soilMoistureCard").hidden=false;$("soilDetailCard").hidden=false;')) failures.push("graphs: soil charts must stay visible when the selected range has no saved soil readings");
const soilChartCss = await readFile(join(root, "graphs-controls.css"), "utf8");

/* The Chart Guide is one full-width grid item and its four tips split into
   two columns on laptop, one column at narrower widths. */
if (!graphHtml.includes('class="info-card chart-guide"') ||
    !soilChartCss.includes(".v2-chart-grid > .chart-guide {") ||
    !soilChartCss.includes("grid-column: 1 / -1") ||
    !soilChartCss.includes("max-width: none") ||
    !soilChartCss.includes("@media (min-width: 980px)") ||
    !soilChartCss.includes("@media (max-width: 979px)") ||
    !soilChartCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") ||
    !soilChartCss.includes("grid-template-columns: minmax(0, 1fr)")) {
  failures.push("graphs: Chart Guide must span full width, use two desktop tip columns and one mobile column");
}
const chartGuideMarkup = graphHtml.split('<article class="info-card chart-guide">')[1]?.split("</article>")[0] || "";
if ((chartGuideMarkup.match(/<li>/g) || []).length !== 4 ||
    !chartGuideMarkup.includes("How to read these charts")) {
  failures.push("graphs: Chart Guide must preserve all four explanatory tips and its title");
}

if (!graphHtml.includes('class="soil-chart-grid"') ||
    !graphHtml.includes('id="soilConductivityCard"') ||
    !graphHtml.includes('id="soilDetailTitle">Soil temperature</h3>') ||
    !graphHtml.includes('id="gSoilEc"') ||
    !soilChartCss.includes(".v2-chart-grid > .soil-chart-grid") ||
    !soilChartCss.includes("grid-template-columns: repeat(3, minmax(0, 1fr))") ||
    !soilChartCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") ||
    !soilChartCss.includes("grid-template-columns: minmax(0, 1fr)") ||
    !graphHtml.includes("graphs-controls.css?v=20261109-full-width-chart-guide")) {
  failures.push("graphs: hydrangea soil moisture, temperature and conductivity must form three responsive, separate charts");
}
if (!historyScript.includes("Daily high °C") || !historyScript.includes("Daily low °C") || !historyScript.includes("spanGaps:false") || !historyScript.includes("no archived summary") || !historyHtml.includes('id="historyChartStatus"')) failures.push("history charts must leave missing calendar days visible as gaps");
const downloadsHtml = await readFile(join(root, "downloads.html"), "utf8");
const downloadsScript = await readFile(join(root, "downloads.js"), "utf8");
if (!downloadsHtml.includes('id="exportFrom"') || !downloadsHtml.includes('id="exportTo"') || !downloadsScript.includes("Date.parse(`${to}T12:00:00Z`)") || !downloadsScript.includes("?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}")) failures.push("downloads must provide validated custom Irish-local date ranges without forcing no-store on long exports");
const rainScript = await readFile(join(root, "rain.js"), "utf8");
if (!rainScript.includes("0.0 mm calendar days · includes today so far")) failures.push("rain.js: dry spell must identify the current partial day");
if ((dashboardApp.match(/updateDashboard\(current\);/g)||[]).length < 3) failures.push("app.js: dashboard progressive rendering is missing");
if (!dashboardApp.includes('parknacross:weather-window-observation') || !dashboardApp.includes('publishWeatherWindowObservation(current, latestRainDetected, isNight)')) failures.push("app.js: optional weather-window update must use an isolated event");
try {
  const start = dashboardApp.indexOf("function publishWeatherWindowObservation(");
  const end = dashboardApp.indexOf("\n}\n", start) + 2;
  const events = [];
  const publish = Function("window", "CustomEvent", "stationCalendarDate", "sunEvent", "ARDAMINE_LAT", "ARDAMINE_LON", `${dashboardApp.slice(start, end)}; return publishWeatherWindowObservation;`)({ dispatchEvent: event => events.push(event) }, class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },date=>date,()=>null,52.6,-6.2);
  const observation = { epoch: 1 };
  publish(observation, true, false);
  if (events.length !== 1 || events[0].detail.current !== observation || !events[0].detail.rainDetected) failures.push("app.js: isolated weather-window event must carry readings without transforming them");
  const failureSafePublish = Function("window", "CustomEvent", "stationCalendarDate", "sunEvent", "ARDAMINE_LAT", "ARDAMINE_LON", `${dashboardApp.slice(start, end)}; return publishWeatherWindowObservation;`)({ dispatchEvent: () => { throw new Error("optional listener failure"); } }, class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },date=>date,()=>null,52.6,-6.2);
  try { failureSafePublish(observation, false, false); } catch { failures.push("app.js: optional weather-window failures must not escape into existing dashboard rendering"); }
} catch (error) {
  failures.push(`app.js: weather-window isolation check failed (${error.message})`);
}
const weatherWindowScript = await readFile(join(root, "weather-window.js"), "utf8");
if (!weatherWindowScript.includes("parknacross:weather-window-observation") || /AudioContext|createBufferSource|soundscape|birdsong|weatherSound/i.test(weatherWindowScript)) failures.push("weather-window.js: visual observation updates must remain while weather audio is fully removed");
const weatherWindowStyles = await readFile(join(root, "weather-window.css"), "utf8");
if (!weatherWindowStyles.includes("prefers-reduced-motion")) failures.push("weather window must respect reduced-motion preferences");
const privacyHtml = await readFile(join(root, "privacy.html"), "utf8");
if (/Sky Photo (?:identifier|likes)/.test(privacyHtml)) failures.push("privacy.html: outdated Sky Photo terminology remains");

const navigation = await readFile(join(root, "navigation.js"), "utf8");
if (/window\.addEventListener\("scroll",\s*\(\)\s*=>\s*closeAll/.test(navigation)) {
  failures.push("navigation.js: scrolling must not immediately close the mobile More menu");
}
const installHtml = await readFile(join(root, "install.html"), "utf8");
if (/class="info-card" role="listitem"/.test(installHtml)) failures.push("install.html: installation diagnostics must use the structured pwa-diagnostic card style");
const styles = await readFile(join(root, "styles.css"), "utf8");
if (/mask-image\s*:/.test(styles)) {
  failures.push("styles.css: mask-image can clip the mobile More popup");
}


/* External network directory: active and pending network links live on their own page. */
const stationNetworksHtml = await readFile(join(root, "networks.html"), "utf8");
const stationPageHtml = await readFile(join(root, "station.html"), "utf8");
const stationNetworksCss = await readFile(join(root, "station-page.css"), "utf8");
// Priority order: source network, public/coastal services, secondary platforms,
// and networks whose activation has not yet been completed.
const stationNetworkIds = [
  "stationEcowittLink", "stationWeatherUndergroundLink", "stationWindguruLink",
  "stationWindyLink", "stationWeathercloudLink", "stationAwekasLink",
  "stationPwsweatherLink", "stationCwopLink", "stationWowBeLink"
];
const stationNetworkPositions = stationNetworkIds.map(id => stationNetworksHtml.indexOf('id="' + id + '"'));
if (!stationNetworksHtml.includes('id="stationEcowittLink" href="https://www.ecowitt.net/home/share?authorize=RVM47S"') ||
    !stationNetworksHtml.includes('referrerpolicy="no-referrer"')) {
  failures.push("networks.html: shared Ecowitt link must match provided URL and avoid referrer leaks");
}

if (stationNetworkPositions.some(pos => pos < 0) || stationNetworkPositions.some((pos, i) => i && pos <= stationNetworkPositions[i - 1])) {
  failures.push("networks.html: all nine weather-network links must appear in priority order");
}
const networkDirectoryCss = await readFile(join(root, "networks-page.css"), "utf8");
if (!stationNetworksHtml.includes('aria-labelledby="otherNetworksHeading"') ||
    !stationNetworksHtml.includes('id="otherNetworksHeading"') ||
    !stationNetworksHtml.includes('class="networks-directory-page"') ||
    !/networks-page\.css\?v=[A-Za-z0-9._-]+/.test(stationNetworksHtml) ||
    !networkDirectoryCss.includes("grid-template-columns: repeat(3, minmax(0, 1fr))") ||
    !networkDirectoryCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") ||
    !networkDirectoryCss.includes("grid-template-columns: minmax(0, 1fr)") ||
    !networkDirectoryCss.includes("@media (min-width: 1200px)") ||
    !networkDirectoryCss.includes("@media (max-width: 760px)") ||
    !networkDirectoryCss.includes("background: transparent") ||
    !stationNetworksCss.includes(".station-external-network-list")) {
  failures.push("networks.html: sleek compact directory requires accessible heading, subtle links and responsive 3/2/1 columns");
}
if (stationNetworksHtml.includes("Parknacross Weather elsewhere") ||
    stationNetworksHtml.includes(">View on Weather Underground <") ||
    stationNetworksHtml.includes(">View on Windy.com <")) {
  failures.push("networks.html: avoid duplicate hero eyebrow and oversized verbose link labels");
}
const networkCardMarkup = [...stationNetworksHtml.matchAll(/<article class="station-external-network"[^>]*>([\s\S]*?)<\/article>/g)].map(match => match[1]);
if (networkCardMarkup.length !== 9 || networkCardMarkup.some(card => (card.match(/<p(?:\s[^>]*)?>/g) || []).length !== 0 || (card.match(/View weather data <span/g) || []).length !== 1)) {
  failures.push("networks.html: exactly nine concise network cards with one description each required");
}
const stationBrandSlugs = [
  "ecowitt", "wunderground", "windguru", "windy", "weathercloud",
  "awekas", "pwsweather", "cwop", "wowbe"
];
if (networkCardMarkup.length !== stationBrandSlugs.length ||
    networkCardMarkup.some((card,index) =>
      !card.includes('class="station-network-identity"') ||
      !card.includes('class="station-network-copy"') ||
      !card.includes('class="station-network-brand station-network-brand--'+stationBrandSlugs[index]+'" aria-hidden="true"') ||
      !card.includes('<svg viewBox="0 0 24 24"') ||
      !card.includes('focusable="false"') ||
      (card.match(/<svg\b/g) || []).length !== 1 ||
      (card.match(/<\/svg>/g) || []).length !== 1 ||
      !card.includes('<path') && !card.includes('<circle')
    ) ||
    !stationBrandSlugs.every(slug => networkDirectoryCss.includes(".station-network-brand--"+slug)) ||
    !networkDirectoryCss.includes("margin-left: 54px") ||
    !networkDirectoryCss.includes("flex-basis: 38px")) {
  failures.push("networks.html: all nine premium SVG badges must be distinct, decorative, correctly labelled and responsive");
}

const expectedStationNetworks = [
  ["stationEcowittLink", "https://www.ecowitt.net/home/share?authorize=RVM47S"],
  ["stationWeatherUndergroundLink", "https://www.wunderground.com/dashboard/pws/IARDAM6"],
  ["stationWindguruLink", "https://www.windguru.cz/station/16733"],
  ["stationWindyLink", "https://www.windy.com/station/pws-hdC7VHGr"],
  ["stationWeathercloudLink", "https://app.weathercloud.net/d3781994059"],
  ["stationAwekasLink", "https://www.awekas.at/en/instrument.php?id=54012"],
  ["stationPwsweatherLink", "https://www.pwsweather.com/station/pws/PARKNACROSSWX"],
  ["stationCwopLink", "https://www.findu.com/cgi-bin/wxpage.cgi?call=GW8205&amp;last=24"],
  ["stationWowBeLink", "https://wow.meteo.be/?id=01a1c11f-eef7-707d-9a26-361880281a7b&amp;lang=en&amp;zoomLevel=11&amp;lat=52.6&amp;long=-6.3"]
];
for (const [id, url] of expectedStationNetworks) {
  const pos = stationNetworksHtml.indexOf('id="' + id + '"');
  const anchor = pos >= 0 ? stationNetworksHtml.slice(stationNetworksHtml.lastIndexOf("<a", pos), stationNetworksHtml.indexOf(">", pos) + 1) : "";
  if (!anchor.includes('href="' + url + '"') || !anchor.includes('target="_blank"') ||
      !anchor.includes('rel="noopener noreferrer"') || !anchor.includes('aria-label=')) {
    failures.push("networks.html: invalid or inaccessible external network link " + id);
  }
}
if (stationNetworksHtml.includes("Upload status not yet checked.") ||
    stationNetworksHtml.includes("First live measurements were verified") ||
    stationNetworksHtml.includes("Station ID 16733 · Observations confirmed")) {
  failures.push("networks.html: visitor cards must not show unverified upload status or operational jargon");
}
const wowBeWorker = await readFile(join(root, "_worker/worker.mjs"), "utf8");
const wowBeStatusClient = await readFile(join(root, "wowbe-status.js"), "utf8");
const wowBeStatusHtml = await readFile(join(root, "status.html"), "utf8");
if (!wowBeWorker.includes('const WOWBE_SHORT_ID = "d8bbdb70"') ||
    (wowBeWorker.match(/scheduleWowBeFromGateway\(ctx, env, liveReading\);/g) || []).length !== 2 ||
    !wowBeWorker.includes("const wowbeResult = await publishWowBe(env, syncResult)") ||
    !wowBeWorker.includes('url.pathname === "/wowbe-status"') ||
    !wowBeWorker.includes("WOWBE_MIN_UPLOAD_INTERVAL_SECONDS = 60") ||
    !wowBeWorker.includes('WOWBE_AUTH_KEY') ||
    !wowBeWorker.includes('WOWBE_ENABLED') ||
    !wowBeWorker.includes('method:"POST"') ||
    !wowBeWorker.includes('api/v2/send/weatherunderground') ||
    !wowBeWorker.includes('body:JSON.stringify(body)') ||
    !wowBeWorker.includes('put("rainin",rate/25.4,4)') ||
    !wowBeWorker.includes('put("baromin",p*0.0295299830714,3)')) {
  failures.push("WOW-BE: secure opt-in GW3001 uploader, UTC time, rain rate, pressure and status endpoint required");
}
if (!wowBeStatusHtml.includes('id="wowbeHealth"') ||
    !wowBeStatusHtml.includes('wowbe-status.js?v=20261109-wowbe') ||
    !wowBeStatusClient.includes('api+"/wowbe-status"') ||
    !wowBeStatusClient.includes("accepted_not_display_verified")) {
  failures.push("WOW-BE: system status must separately report upload acknowledgement and public verification");
}
if (!stationNetworksHtml.includes('id="stationWowBeTitle">WOW-BE</h2>') ||
    stationNetworksHtml.includes("Registered · Upload status not yet checked.")) {
  failures.push("WOW-BE: simple public card must retain provider identity without unverified status claims");
}
const wowBeAppCache = await readFile(join(root, "service-worker.js"), "utf8");
if (!wowBeAppCache.includes('"./wowbe-status.js"')) {
  failures.push("WOW-BE: system status client must be cached for offline page shell");
}
const windguruWorker = await readFile(join(root, "_worker/worker.mjs"), "utf8");
if ((windguruWorker.match(/scheduleWindguruFromGateway\(ctx, env, liveReading\);/g) || []).length !== 2 ||
    !windguruWorker.includes("WINDGURU_MIN_UPLOAD_INTERVAL_SECONDS = 55") ||
    !windguruWorker.includes('reason:"rate_limited_to_minute"') ||
    !windguruWorker.includes("sent_readings:")) {
  failures.push("Windguru: both GW3001 upload paths must relay fresh samples at minute cadence and record sent values");
}
if (!stationNetworksHtml.includes('id="stationEcowittTitle">Ecowitt.net</h2>') ||
    stationNetworksHtml.includes("Ecowitt cloud sync not yet checked.")) {
  failures.push("networks.html: Ecowitt must link to the shared station without technical status clutter");
}
if (!stationNetworksHtml.includes('id="stationWowBeLink" href="https://wow.meteo.be/?id=01a1c11f-eef7-707d-9a26-361880281a7b&amp;lang=en&amp;zoomLevel=11&amp;lat=52.6&amp;long=-6.3"') ||
    !stationNetworksHtml.includes('aria-label="View Parknacross station on WOW-BE') ||
    stationNetworksHtml.includes('id="stationWowBeLink" href="https://wow.meteo.be/en/"')) {
  failures.push("networks.html: WOW-BE link must deep-link to registered Parknacross site rather than provider homepage");
}
if (!stationNetworksHtml.includes('id="stationCwopLink" href="https://www.findu.com/cgi-bin/wxpage.cgi?call=GW8205&amp;last=24"') ||
    stationNetworksHtml.includes('id="stationCwopRawLink"') ||
    stationNetworksHtml.includes("Verified · Upload status not yet checked.") ||
    stationNetworksHtml.includes("Registered · Upload status not yet checked.")) {
  failures.push("networks.html: CWOP must have a single direct station link without raw-table clutter");
}
if (stationPageHtml.includes('class="station-external-network-list"') ||
    stationPageHtml.includes('id="otherWeatherNetworks"') ||
    stationPageHtml.includes('<a href="networks.html">Other Networks</a>') ||
    !stationPageHtml.includes('class="station-jumps" aria-label="On this page"><a href="#meetSensors">')) {
  failures.push("station.html: remove redundant Other Networks quick link while preserving on-page section jumps");
}
const navScript = await readFile(join(root, "navigation.js"), "utf8");
if (!navScript.includes('networksLink.href = "networks.html"') ||
    !stationNetworksHtml.includes('href="networks.html" class="active" aria-current="page"')) {
  failures.push("navigation: new directory must appear as a correctly labelled, active More-menu option");
}
const networkAppCache = await readFile(join(root, "service-worker.js"), "utf8");
if (!networkAppCache.includes('"./networks.html"')) {
  failures.push("service-worker.js: network directory must be included in the offline site cache");
}
const networkClient = await readFile(join(root,"network-status.js"),"utf8");
const networkStatusIds = ["Ecowitt","WeatherUnderground","Windguru","Windy","Weathercloud","Awekas","Pwsweather","Cwop","WowBe"];
if (networkStatusIds.some(name => stationNetworksHtml.includes('id="station'+name+'Status"')) ||
    stationNetworksHtml.includes('src="network-status.js')) {
  failures.push("networks.html: operational telemetry belongs in System Status, not visitor cards");
}
if (!networkClient.includes('get("/wunderground-status")') ||
    !networkClient.includes('get("/cwop-status")') ||
    !networkClient.includes('get("/wowbe-status")') ||
    !networkAppCache.includes('"./network-status.js"')) {
  failures.push("network-status.js: provider diagnostic support must remain available for operators");
}
const providerWorker = await readFile(join(root,"_worker/worker.mjs"),"utf8");
if(!providerWorker.includes('url.pathname === "/pwsweather-status"') ||
   !providerWorker.includes('url.pathname === "/wunderground-status"') ||
   !providerWorker.includes("PWSWEATHER_LAST_ACCEPTED_AT_META_KEY") ||
   !providerWorker.includes("PWSWEATHER_LAST_ATTEMPT_META_KEY") ||
   !providerWorker.includes("PWSWEATHER_MIN_UPLOAD_INTERVAL_SECONDS") ||
   (providerWorker.match(/schedulePwsWeatherFromGateway\(ctx, env, liveReading\);/g)||[]).length!==2 ||
   !providerWorker.includes("await publishPwsWeather(env, cwopSyncResult)") ||
   !providerWorker.includes('putNumber("rainin", Number(rainHourlyMm) / 25.4, 4)')) {
  failures.push("Worker: provider acceptance timestamps and optional authenticated WU observation lookup required");
}

if (!stationPageHtml.includes("Linked weather networks may use their own terrain estimates")) {
  failures.push("station.html: explain the difference between approximate site elevation and network estimates");
}


/* November 2026 visitor experience regression checks. */
const visitorDashboard = await readFile(join(root, "index.html"), "utf8");
const visitorOrder = [
  'class="hero-main-card"',
  'class="station-bar"',
  'class="today-section"',
  'class="metrics-section"',
  'class="forecast-section"',
  'class="local-planning"',
  'class="today-sky-panel"'
].map(marker => visitorDashboard.indexOf(marker));
if (visitorOrder.some(pos => pos < 0) || visitorOrder.some((pos, i) => i > 0 && pos <= visitorOrder[i-1])) {
  failures.push("index.html: live readings and forecast must precede optional planning tools");
}
const visitorStyles = await readFile(join(root, "review-ui.css"), "utf8");
if (!visitorStyles.includes("--ui-small-text: .8125rem") || !visitorStyles.includes("body.dashboard-page .hero-stat span")) {
  failures.push("review-ui.css: shared readable type scale missing");
}
const visitorStation = await readFile(join(root, "station.html"), "utf8");
for (const id of ["alertsPermission", "alertsSaveStatus", "backgroundAlertStatus", "alertsTestButton", "alertsTestStatus"]) {
  if (!visitorStation.includes('id="' + id + '"')) failures.push("station.html: missing notification diagnostic " + id);
}
if (!visitorStation.includes("notification-test.js?v=20261101")) {
  failures.push("station.html: notification test script must be included");
}
const visitorNotificationTest = await readFile(join(root, "notification-test.js"), "utf8");
if (!visitorNotificationTest.includes('Notification.permission !== "granted"') ||
    !visitorNotificationTest.includes("Background delivery is not verified.")) {
  failures.push("notification-test.js: a local display test must not claim push delivery works");
}
const visitorGraphs = await readFile(join(root, "graphs.html"), "utf8");
const visitorGraphScript = await readFile(join(root, "graphs.js"), "utf8");
if (!visitorGraphs.includes('class="graph-data-note"') || !visitorGraphScript.includes("Chart.defaults.font.size=13")) {
  failures.push("graphs: readable labels and missing-data note required");
}
const visitorMonthly = await readFile(join(root, "monthly.html"), "utf8");
const visitorAnnual = await readFile(join(root, "annual.html"), "utf8");
if (visitorMonthly.indexOf('id="reportCoverageNote"') < 0 ||
    visitorMonthly.indexOf('id="reportCoverageNote"') > visitorMonthly.indexOf('id="meanTemp"') ||
    !visitorAnnual.includes('class="monthly-note report-coverage-emphasis"')) {
  failures.push("monthly/annual reports: archive coverage must be visible near the overview");
}
const visitorDownloads = await readFile(join(root, "downloads.js"), "utf8");
if (!visitorDownloads.includes("The export check timed out") ||
    !visitorDownloads.includes("There are no saved observations")) {
  failures.push("downloads.js: actionable large-export error handling missing");
}
/* Site-wide premium SVG artwork is decorative, compact, and source-local.
 * Every page must load the same library without rewriting existing SVG charts
 * or changing weather readings / navigation semantics. */
const iconPages = [
  "index.html", "station.html", "graphs.html", "rain.html", "coast.html",
  "status.html", "summary.html", "sky.html", "downloads.html"
];
const iconLibrary = await readFile(join(root, "weather-icons.js"), "utf8");
const iconStyles = await readFile(join(root, "weather-icons.css"), "utf8");
for (const page of iconPages) {
  const html = await readFile(join(root, page), "utf8");
  if (!html.includes('href="weather-icons.css?v=20261109-sitewide-svg1"') ||
      !html.includes('src="weather-icons.js?v=20261109-sitewide-svg1" defer') ||
      !iconLibrary.includes('"'+page+'": () =>')) {
    failures.push(page+": shared SVG icon library and page decoration required");
  }
}
const iconRequiredNames = [
  "thermometer", "drop", "wind", "cloudRain", "gauge", "zap",
  "sprout", "waves", "compass", "chart", "archive", "database",
  "radio", "shield", "download", "camera", "calendar", "bell"
];
if (!iconRequiredNames.every(name => iconLibrary.includes("    "+name+": [")) ||
    !iconLibrary.includes('svg.setAttribute("aria-hidden","true")') ||
    !iconLibrary.includes('svg.setAttribute("focusable","false")') ||
    !iconLibrary.includes('document.createElementNS(NS,"svg")') ||
    !iconLibrary.includes('if (kind==="label" && el.querySelector(":scope > svg")) return;') ||
    !iconLibrary.includes("DOMContentLoaded") ||
    !iconLibrary.includes('document.querySelectorAll(selector)') ||
    !iconStyles.includes("@media (max-width: 760px)") ||
    !iconStyles.includes(".health-group .card-head h2.wx-icon-small") ||
    !iconStyles.includes(".station-sensor-buttons .wx-icon-label") ||
    !iconStyles.includes(".dashboard-shortcuts a.wx-icon-nav")) {
  failures.push("shared SVG system: premium scalable accessible icons must preserve existing artwork and status colours");
}
const iconCache = await readFile(join(root, "service-worker.js"), "utf8");
if (!iconCache.includes('"./weather-icons.css"') ||
    !iconCache.includes('"./weather-icons.js"') ||
    !iconCache.includes("20261113-release-fixes")) {
  failures.push("shared SVG system: both assets and a rotated offline cache required");
}
const visitorServiceWorker = await readFile(join(root, "service-worker.js"), "utf8");
if (!visitorServiceWorker.includes('"./notification-test.js"')) {
  failures.push("service-worker.js: include notification-test.js in the offline app release");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Smoke test passed: ${htmlFiles.length} HTML pages and cleanup markers verified.`);
}

