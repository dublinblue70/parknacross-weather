import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = await readdir(root);
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
    if (menuItems !== 11) failures.push(`${name}: expected 11 static More-menu destinations, found ${menuItems}`);
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
  ["station.html", "Readings saved today"],
  ["navigation.js", "document.body.appendChild(menu)"],
  ["sitemap.xml", "2026-09-29"],
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
  ["service-worker.js", "parknacross-v38-4-159-sky-social-admin"],
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
  ["tests/mobile-menu.spec.mjs", "More menu works"],
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
  ["coast.html", "Water Safety Ireland"],
  ["records.js", "under 0.2 mm/day"],
  ["monthly.html", "Under 0.2 mm"],
  ["sky.html", "Retry loading photo"],
  ["sky.js", "showRetry(true)"],
  ["styles.css", "#skyRetryButton[hidden]{display:none!important}"],
  ["styles.css", ".nav-more-menu a:visited"],
  ["downloads.html", ".nav-more-menu a:visited"],
  ["status.html", ".nav-more-menu a:visited"],
  ["downloads.html", ".nav-more-menu a.active:hover"],
  ["status.html", ".nav-more-menu a.active:hover"],
  ["navigation.js", "data-nav-more-popup"],
  ["navigation.js", "Site & app"],
  ["downloads.html", "archiveCoverage"],
  ["downloads.js", "&fresh=1"],
  ["downloads.js", "soil_moisture_pct"],
  ["downloads.js", "lightning_distance_km"],
  ["downloads.js", "lightning_last_strike_time_ireland"],
  ["downloads.js", "?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&fresh=1"],
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
const historyHtml = await readFile(join(root, "history.html"), "utf8");
const historyApp = await readFile(join(root, "history.js"), "utf8");
if (/Weather diary|weatherDiary|Notable Parknacross weather/.test(historyHtml + historyApp)) failures.push("history: removed Weather Diary content remains");
if (/garden soil\s+garden-soil/i.test(dashboardHtml)) failures.push("index.html: duplicated garden-soil wording remains");
const dashboardApp = await readFile(join(root, "app.js"), "utf8");
const platformApp = await readFile(join(root, "platform.js"), "utf8");
if (platformApp.includes('$("shareTodayButton")?.addEventListener')) failures.push("platform.js: obsolete duplicate weather-card click handler remains");
if ((dashboardApp.match(/\$\("shareTodayButton"\)\?\.addEventListener\("click",createWeatherCard\)/g) || []).length !== 1) failures.push("app.js: expected exactly one active weather-card click handler");
const alertSettings = await readFile(join(root, "alert-settings.js"), "utf8");
if (!alertSettings.includes('settings.enabled = false')) failures.push("alert-settings.js: notification disable branch is missing");
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
if (!dashboardHtml.includes('id="wearForecast"')) failures.push("index.html: forecast-aware clothing note is missing");
if (!dashboardHtml.includes('aria-label="Daily sun phases"') || !dashboardHtml.includes('aria-label="Eight phases of the Moon"')) failures.push("index.html: visual sun and moon phase cycles are missing");
if (!dashboardHtml.includes('id="seasonNextMarker"') || !dashboardHtml.includes("Typical dates for Ireland")) failures.push("index.html: approximate annual equinox and solstice outlook is missing");
if (!dashboardHtml.includes('id="todayTempArchive"')) failures.push("index.html: latest saved daily temperature summary is not shown beside live extrema");
if (!dashboardHtml.includes('id="weatherWindowScene"') || !dashboardHtml.includes('id="weatherWindowObservation"') || dashboardHtml.includes("weatherSoundToggle") || dashboardHtml.includes("weather-sound-controls") || dashboardHtml.includes("Illustrated from local readings")) failures.push("index.html: Weather Window should remain while all sound controls and the removed caption stay absent");
if (!dashboardHtml.includes('weather-window.css?v=20261006-v38-4-143') || !dashboardHtml.includes('weather-window.js?v=20261006-v38-4-143')) failures.push("index.html: isolated weather window assets must be versioned and loaded");
for (const page of ["install.html", "station.html"]) {
  const html = await readFile(new URL(page, import.meta.url), "utf8");
  if (/id="diagCache">v\d/i.test(html)) failures.push(`${page}: installation diagnostics must not hardcode a release number`);
  if (!html.includes('id="diagCache">Checking…')) failures.push(`${page}: installation diagnostics should load the active release dynamically`);
}
const diagnosticsSource = await readFile(new URL("pwa-diagnostics.js", import.meta.url), "utf8");
if (/v\d+\.\d+\.\d+/.test(diagnosticsSource)) failures.push("pwa-diagnostics.js: release number must be read dynamically");
if (!dashboardHtml.includes('class="ww-coastline"') || !dashboardHtml.includes('class="ww-sea-lines"') || !dashboardHtml.includes('class="ww-garden"')) failures.push("index.html: Ardamine Weather Window should include the added coastal, sea and garden illustration details");
if (dashboardHtml.indexOf('id="wearForecast"') > dashboardHtml.indexOf('id="todaySkyPanel"')) failures.push("index.html: forecast-only rain context must be near current conditions");
if (!dashboardApp.includes("This is a forecast, not rain measured at Parknacross")) failures.push("app.js: forecast rain must be distinguished from measured local rain");
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
  const render = Function("$", "TIME_ZONE", `${summaryApp.slice(start, end)}; return renderOfficialWarningStatus;`)(id => nodes.get(id), "Europe/Dublin");
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
if (!skyStyles.includes(".sky-page-photo{position:relative;width:min(100%,960px);aspect-ratio:3/2")) failures.push("styles.css: Today’s Sky page photo must use the landscape dashboard format");
if (!skyStyles.includes(".sky-page-photo .today-sky-caption-pill")) failures.push("styles.css: Today’s Sky caption pill must be styled on the photo");
if (!skyPageHtml.includes("sky.js?v=20261005-photo-layout-v132")) failures.push("sky.html: landscape photo and caption fix cache version is missing");
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
if (!coastHtml.includes('id="coastLocalFreshness"') || !coastScript.includes("Parknacross local readings · observed") || !coastScript.includes("formatSourceStamp(m.issued)")) failures.push("coastal observations and official marine forecasts must show source freshness");
if (!coastHtml.includes('id="marineForecastUpdated"')) failures.push("coast.html: marine forecast issue time must have a visible status field");
const graphHtml = await readFile(join(root, "graphs.html"), "utf8");
const graphScript = await readFile(join(root, "graphs.js"), "utf8");
const historyScript = await readFile(join(root, "history.js"), "utf8");
if (!graphHtml.includes("Units are printed on the axes") || !graphHtml.includes("Blank sections mean readings are missing, not zero") || !graphScript.includes("spanGaps:false")) failures.push("graphs must explain units and show archive gaps without connecting lines");
if (!historyScript.includes("Daily high °C") || !historyScript.includes("Daily low °C") || !historyScript.includes("spanGaps:false") || !historyScript.includes("no archived summary") || !historyHtml.includes('id="historyChartStatus"')) failures.push("history charts must leave missing calendar days visible as gaps");
const downloadsHtml = await readFile(join(root, "downloads.html"), "utf8");
const downloadsScript = await readFile(join(root, "downloads.js"), "utf8");
if (!downloadsHtml.includes('id="exportFrom"') || !downloadsHtml.includes('id="exportTo"') || !downloadsScript.includes("Date.parse(`${to}T12:00:00Z`)") || !downloadsScript.includes("&to=${encodeURIComponent(to)}&fresh=1")) failures.push("downloads must provide validated custom Irish-local date ranges");
const rainScript = await readFile(join(root, "rain.js"), "utf8");
if (!rainScript.includes("Rain-free calendar days · includes today so far")) failures.push("rain.js: dry spell must identify the current partial day");
if ((dashboardApp.match(/updateDashboard\(current\);/g)||[]).length < 3) failures.push("app.js: dashboard progressive rendering is missing");
if (!dashboardApp.includes('parknacross:weather-window-observation') || !dashboardApp.includes('publishWeatherWindowObservation(current, latestRainDetected, isNight)')) failures.push("app.js: optional weather-window update must use an isolated event");
try {
  const start = dashboardApp.indexOf("function publishWeatherWindowObservation(");
  const end = dashboardApp.indexOf("\n}\n", start) + 2;
  const events = [];
  const publish = Function("window", "CustomEvent", `${dashboardApp.slice(start, end)}; return publishWeatherWindowObservation;`)({ dispatchEvent: event => events.push(event) }, class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } });
  const observation = { epoch: 1 };
  publish(observation, true, false);
  if (events.length !== 1 || events[0].detail.current !== observation || !events[0].detail.rainDetected) failures.push("app.js: isolated weather-window event must carry readings without transforming them");
  const failureSafePublish = Function("window", "CustomEvent", `${dashboardApp.slice(start, end)}; return publishWeatherWindowObservation;`)({ dispatchEvent: () => { throw new Error("optional listener failure"); } }, class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } });
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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Smoke test passed: ${htmlFiles.length} HTML pages and cleanup markers verified.`);
}

