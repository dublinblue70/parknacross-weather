import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = await readdir(root);
const htmlFiles = files.filter(name => name.endsWith(".html"));
const failures = [];
const offlineReferences = new Set();

for (const name of htmlFiles) {
  const html = await readFile(join(root, name), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) failures.push(`${name}: duplicate IDs ${[...new Set(duplicateIds)].join(", ")}`);
  if (!/<meta\s+name="description"/i.test(html)) failures.push(`${name}: missing meta description`);
  if (!/<link\s+rel="canonical"/i.test(html)) failures.push(`${name}: missing canonical URL`);
  if (!/<h1\b/i.test(html)) failures.push(`${name}: missing H1`);
  if (name !== "offline.html") {
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
  ["status.js", "flagged"],
  ["station.html", "Readings saved today"],
  ["navigation.js", "document.body.appendChild(menu)"],
  ["sitemap.xml", "2026-09-24"],
  ["app.js", "dashboardTooltipTime"],
  ["graphs.js", "Partial archive"],
  ["history.html", "previousArchiveDay"],
  ["maintenance.html", "noindex,follow"],
  ["privacy.html", "Privacy information"],
  ["install.html", "Install Parknacross Weather"],
  ["station.html", "diagInstalled"],
  ["status.js", "PARTIAL"],
  ["pwa-diagnostics.js", "diagWorker"],
  ["service-worker.js", "parknacross-v38-4-66"],
  ["service-worker.js", "./offline.html"],
  ["manifest.webmanifest", "icon-maskable-512.png"],
  ["manifest.webmanifest", "pwa-dashboard-narrow.jpg"],
  ["graphs.html", "chart-highlights"],
  ["privacy.html", "Mostly weather, very little personal data"],
  ["playwright.config.mjs", "mobile-safari"],
  ["tests/mobile-menu.spec.mjs", "More menu works"],
  ["coast.html", "Sea &amp; Swim Conditions"],
  ["coast.js", "renderSwimSummary"],
  ["monthly.html", "shareMonthCard"],
  ["monthly.js", "shareMonthlyCard"],
  ["navigation.js", "data-nav-more-popup"]
];

for (const [name, text] of requiredChecks) {
  const content = await readFile(join(root, name), "utf8");
  if (!content.includes(text)) failures.push(`${name}: expected marker missing: ${text}`);
}

const navigation = await readFile(join(root, "navigation.js"), "utf8");
if (/window\.addEventListener\("scroll",\s*\(\)\s*=>\s*closeAll/.test(navigation)) {
  failures.push("navigation.js: scrolling must not immediately close the mobile More menu");
}
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
