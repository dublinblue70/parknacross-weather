import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../downloads.js", import.meta.url), "utf8");
const requests = [], links = [];
const elements = {
  downloadStatus: { textContent: "", className: "" },
  exportFrom: { value: "2026-09-30", min: "2026-09-11" },
  exportTo: { value: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), min: "2026-09-11" }
};
const document = {
  addEventListener() {},
  getElementById(id) { return elements[id] || null; },
  createElement(tag) { return { tagName: tag, click() { links.push(this.href); }, remove() {} }; },
  body: { appendChild() {} }
};
const context = {
  window: {}, document, URL, URLSearchParams, Date, Intl, Number, Math, AbortSignal,
  Blob, setTimeout, clearTimeout,
  PARKNACROSS_API_BASE: "https://weather.test",
  fetch: async input => {
    const url = new URL(input); requests.push(url);
    return { ok: true, json: async () => ({ count: 100, coverage_percent: 95 }) };
  }
};
vm.runInNewContext(source, context);
await context.download(90, "90-day", { textContent: "Download", disabled: false });
await context.download(365, "365-day", { textContent: "Download", disabled: false });
await context.downloadCustom({ textContent: "Download", disabled: false, currentTarget: null });

assert.equal(links.length, 3, "long and custom exports should start browser downloads");
for (const href of links) assert.equal(new URL(href).searchParams.has("fresh"), false, "long direct-download URLs must not force no-store response handling");
assert.deepEqual(requests.map(url => url.pathname), ["/export-preview", "/export-preview", "/export-preview"]);
assert.equal(new URL(links[0]).searchParams.get("days"), "90");
assert.equal(new URL(links[1]).searchParams.get("days"), "365");
assert.equal(new URL(links[2]).searchParams.get("from"), "2026-09-30");
assert.equal(new URL(links[2]).searchParams.get("to"), elements.exportTo.value);

console.log("Long-window and custom CSV downloads avoid forced no-store responses.");
