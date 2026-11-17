import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("./app.js", import.meta.url), "utf8");
const declaration = source.match(/async function getJSON\(url, cacheMode = "default", timeoutMs = 12000\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(declaration, "the shared JSON request helper includes an explicit timeout");

let attempts = 0;
const getJSON = runInNewContext(`(${declaration})`, {
  AbortController,
  URL,
  location: {href: 'https://weather.example/'},
  setTimeout,
  clearTimeout,
  fetch: (_url, options) => {
    attempts++;
    return new Promise((_resolve, reject) => {
      if (options.signal.aborted) reject(new Error("aborted"));
      else options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  }
});

let failure;
try { await getJSON("https://weather.example/current", "no-store", 5); }
catch (error) { failure = error; }
assert.equal(failure?.message, "Weather request timed out after 1 seconds", "a stalled request returns a clear timeout error");
assert.equal(attempts, 1, "the current-reading request has one fast attempt, avoiding serial retry delay");

console.log("PASS: Dashboard API requests time out, and the live current feed does not stall on serial retries.");
