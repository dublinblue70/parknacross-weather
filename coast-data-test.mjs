import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = await readFile(new URL("./coast.js", import.meta.url), "utf8");

async function runApi(api) {
  const nodes = new Map();
  const document = {
    addEventListener(name, callback) { if (name === "DOMContentLoaded") this.ready = callback; },
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: "", innerHTML: "" });
      return nodes.get(id);
    }
  };
  const context = {
    window: { PARKNACROSS_CONFIG: { apiBase: "https://weather.invalid" } },
    document,
    fetch: api,
    AbortController,
    Date,
    Intl,
    Math,
    Number,
    String,
    setTimeout,
    clearTimeout,
    setInterval() {},
    console: { error() {} }
  };
  vm.runInNewContext(source, context, { filename: "coast.js" });
  document.ready();
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setImmediate(resolve));
  return nodes;
}

const empty = await runApi(async url => ({
  ok: true,
  async json() {
    if (url.includes("/marine/tides")) return { events: [] };
    return {};
  }
}));
assert.equal(empty.get("tideList").textContent, "Arklow tide predictions are temporarily unavailable.");
assert.notEqual(empty.get("tideList").textContent, "Loading tide predictions…");
assert.equal(empty.get("localSeaTemp").textContent, "Unavailable");
assert.equal(empty.get("m2SeaTemp").textContent, "Unavailable");
assert.notEqual(empty.get("marineWind").textContent, "Loading…");

const failed = await runApi(async () => { throw new Error("offline"); });
assert.equal(failed.get("nextTide").textContent, "Unavailable");
assert.equal(failed.get("localSeaTempTime").textContent, "Coastal estimate temporarily unavailable");
assert.equal(failed.get("marineOutlook").textContent, "Marine forecast temporarily unavailable");

console.log("Coast data fallback tests passed.");
