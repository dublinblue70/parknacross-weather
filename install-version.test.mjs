import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const worker = await readFile(new URL("./service-worker.js", import.meta.url), "utf8");
const cacheVersion = worker.match(/const CACHE_NAME = "parknacross-v(\d+(?:-\d+)+)(?:-|"?)/)?.[1];
assert.ok(cacheVersion, "the service worker contains a versioned cache name");
const expectedVersion = cacheVersion.replace(/-/g, ".");
const handlers = new Map();
const self = { addEventListener: (type, callback) => handlers.set(type, callback) };
runInNewContext(worker, { self, URL, Request, fetch: async () => new Response(), caches: {} });

let reply;
handlers.get("message")({
  data: { type: "GET_SITE_VERSION" },
  ports: [{ postMessage: value => { reply = value; } }],
  source: null
});
assert.deepEqual(JSON.parse(JSON.stringify(reply)), { type: "SITE_VERSION", version: expectedVersion }, "the app release is derived from the active cache name");

const diagnostics = await readFile(new URL("./pwa-diagnostics.js", import.meta.url), "utf8");
assert.doesNotMatch(diagnostics, /v\d+\.\d+\.\d+/, "the diagnostics script has no hardcoded release number");
assert.match(diagnostics, /GET_SITE_VERSION/, "the diagnostics read the active service-worker release");

console.log("Installation version diagnostics derive the displayed release from the active service-worker cache.");
