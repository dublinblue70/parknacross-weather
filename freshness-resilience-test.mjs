import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const workerPath = process.env.PARKNACROSS_WORKER_SOURCE || join(root, "..", "..", "worker-source", "Parknacross-worker-v38.4.75-LIVE-FRESHNESS-RESILIENCE-NOTEPAD.txt");
try { await readFile(workerPath, "utf8"); }
catch {
  console.log("Worker freshness regression checks skipped: set PARKNACROSS_WORKER_SOURCE to the current Cloudflare Worker source.");
  process.exit(0);
}
const worker = await readFile(workerPath, "utf8");
const summary = await readFile(join(root, "summary.html"), "utf8");
const serviceWorker = await readFile(join(root, "service-worker.js"), "utf8");
const failures = [];

for (const marker of [
  "live_reading: liveReading",
  "readGatewayLiveReading(env, nowEpoch)",
  "source: \"gw3001_direct_live\"",
  "cachedJson(request, ctx, 300, () => buildRainEvents(env, url))",
  "v38.4.82-NONBLOCKING-CURRENT",
  "const johnstownLtaByMonth = { 9: 72.3, 10: 126.5 }",
  "const validatedTemps = day === todayKey"
]) {
  if (!worker.includes(marker)) failures.push(`Worker marker missing: ${marker}`);
}

if (!summary.includes("Average humidity since midnight")) failures.push("Summary humidity period is not explicit");
if (!summary.includes("Includes damp overnight and early-morning readings")) failures.push("Summary humidity context is missing");
if (!serviceWorker.includes("await self.skipWaiting()")) failures.push("PWA update does not activate automatically");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Freshness and resilience regression checks passed.");
