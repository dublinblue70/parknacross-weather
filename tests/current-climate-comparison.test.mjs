import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const window = {};
vm.runInNewContext(
  fs.readFileSync(new URL("../comparison-alignment.js", import.meta.url), "utf8"),
  { window, Date, Intl, Number, Object, Array }
);
const latest = window.ParknacrossComparison.latest;
const result = latest(
  { temperature_c: 15.0, report_time: "2026-10-28T12:50:00Z" },
  { temperature_c: 14.9, received_at: "2026-10-28T13:30:00Z" }
);
assert.equal(Number(result.delta.toFixed(1)), -0.1, "current difference uses latest values even when report times differ");
assert.equal(result.local, 14.9);
assert.equal(result.official, 15.0);
assert.notEqual(result.localEpoch, result.officialEpoch);
assert.equal(latest({ temperature_c: null }, { temperature_c: 14.9 }), null);
console.log("PASS: current climate difference uses the latest local and official temperatures and retains both timestamps.");
