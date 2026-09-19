import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = await readdir(root);
const htmlFiles = files.filter(name => name.endsWith(".html"));
const failures = [];

for (const name of htmlFiles) {
  const html = await readFile(join(root, name), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) failures.push(`${name}: duplicate IDs ${[...new Set(duplicateIds)].join(", ")}`);
  if (!/<meta name="description"/i.test(html)) failures.push(`${name}: missing meta description`);
  if (!/<link rel="canonical"/i.test(html)) failures.push(`${name}: missing canonical URL`);
  if (!/<h1\b/i.test(html)) failures.push(`${name}: missing H1`);

  for (const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)) {
    const ref = match[1];
    if (/^(?:https?:|mailto:|#|data:)/i.test(ref) || !ref) continue;
    try { await access(join(root, ref)); }
    catch { failures.push(`${name}: missing local reference ${ref}`); }
  }
}

const requiredChecks = [
  ["history.js", "/coverage?days=371"],
  ["history.js", "Weather observations for"],
  ["status.js", "flagged"],
  ["station.html", "Estimated database writes today"],
  ["navigation.js", "climate.html"],
  ["sitemap.xml", "2026-09-19"]
];

for (const [name, text] of requiredChecks) {
  const content = await readFile(join(root, name), "utf8");
  if (!content.includes(text)) failures.push(`${name}: expected marker missing: ${text}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Smoke test passed: ${htmlFiles.length} HTML pages and cleanup markers verified.`);
}
