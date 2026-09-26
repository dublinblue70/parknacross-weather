import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = await readdir(root);
const htmlFiles = files.filter(name => name.endsWith(".html"));
const failures = [];
const offlineReferences = new Set();

for (const obsoleteWorker of ["worker.js", "cloudflare-worker.js", "worker-v38.4.47-photo-likes.js", "Parknacross-worker-v38.4.47-photo-likes.txt", "Parknacross-worker-v38.4.48-like-once.txt"]) {
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
  ["history.js", "withoutDuplicateDiaryEvents"],
  ["status.js", "retained in the raw archive"],
  ["station.html", "Readings saved today"],
  ["navigation.js", "document.body.appendChild(menu)"],
  ["sitemap.xml", "2026-09-24"],
  ["app.js", "dashboardTooltipTime"],
  ["graphs.js", "Partial archive"],
  ["history.html", "previousArchiveDay"],
  ["maintenance.html", "noindex,follow"],
  ["privacy.html", "Privacy information"],
  ["install.html", "Install Parknacross Weather"],
  ["install.html", "Home Screen or browser mode"],
  ["install.html", "Version this page expects"],
  ["station.html", "diagInstalled"],
  ["station.html", "<option value=\"40\">Within 40 km</option>"],
  ["lightning-charts.js", "{min:0,max:40}"],
  ["lightning-charts.js", "{stepSize:5}"],
  ["lightning-charts.js", "Number(value) <= 40"],
  ["graphs.html", "WH57 range 0–40 km"],
  ["station-v2.js", "approximate range up to 40 km"],
  ["alert-settings.js", "LIGHTNING_DISTANCES"],
  ["alert-settings.js", "reportedDistance <= 40"],
  ["app.js", "function lightningDistance"],
  ["status.js", "PARTIAL"],
  ["pwa-diagnostics.js", "diagWorker"],
  ["service-worker.js", "parknacross-v38-4-93"],
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
  ["monthly.html", "shareMonthCard"],
  ["monthly.js", "shareMonthlyCard"],
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
const dashboardApp = await readFile(join(root, "app.js"), "utf8");
if ((dashboardHtml.match(/id="wearTodayHeading"/g)||[]).length !== 1) failures.push("index.html: expected exactly one Dashboard clothing guide");
if (!dashboardHtml.includes('data-corrections.js?v=20260924-v38-4-93')) failures.push("index.html: shared data corrections must load before the dashboard application");
if (!dashboardHtml.includes('id="wearForecast"')) failures.push("index.html: forecast-aware clothing note is missing");
if (!dashboardApp.includes('strikesToday===0?"None today"')) failures.push("app.js: zero-lightning wording is missing");
const coastScript = await readFile(join(root, "coast.js"), "utf8");
if (/Math\.(?:floor|ceil)\(Math\.(?:min|max)\(model,buoy\)\*2\)/.test(coastScript)) failures.push("coast.js: sea-temperature range still expands to half-degree bounds");
const statusScript = await readFile(join(root, "status.js"), "utf8");
if (!statusScript.includes("Informational historical coverage")) failures.push("status.js: partial historical coverage must be informational");
if ((dashboardApp.match(/updateDashboard\(current\);/g)||[]).length < 3) failures.push("app.js: dashboard progressive rendering is missing");
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
