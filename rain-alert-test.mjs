import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = await readFile(new URL("./alert-settings.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
assert.match(source, /RAIN_ACTIVE_WINDOW_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
assert.match(appSource, /RAIN_ACTIVE_WINDOW_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
assert.match(source, /RAIN_CONFIRM_INCREMENT_MM\s*=\s*0\.2/);
assert.match(appSource, /recentIncreaseMm\s*<\s*0\.2/);

function makeAlerts(startTime) {
  let now = startTime;
  const store = new Map();
  const notices = [];
  class FixedDate extends Date {
    static now() { return now; }
  }
  class MockNotification {
    static permission = "granted";
    static async requestPermission() { return "granted"; }
  }
  const registration = { async showNotification(title, options) { notices.push({ title, ...options }); } };
  const document = {
    addEventListener() {},
    getElementById() { return null; }
  };
  const context = {
    window: { Notification: MockNotification },
    Notification: MockNotification,
    localStorage: {
      getItem(key) { return store.get(key) ?? null; },
      setItem(key, value) { store.set(key, value); }
    },
    navigator: { serviceWorker: { ready: Promise.resolve(registration) } },
    document,
    Date: FixedDate,
    Intl,
    console,
    Promise,
    Set,
    Number,
    Math,
    Object,
    String,
    JSON
  };
  vm.runInNewContext(source, context, { filename: "alert-settings.js" });
  context.window.PWAlerts.saveSettings({ enabled: true, rainStart: true });
  return {
    notices,
    enable(settings) { context.window.PWAlerts.saveSettings({ enabled: true, ...settings }); },
    tick(seconds = 60) { now += seconds * 1000; },
    async sample({ offset = 0, rate = 0, total = 0 }) {
      await context.window.PWAlerts.evaluateCurrent({
        epoch: Math.floor(now / 1000) + offset,
        rain_rate_mm_h: rate,
        rain_daily_mm: total,
        wind_gust_kmh: 5,
        temperature_c: 12
      });
    }
  };
}

const start = Date.parse("2026-10-04T18:00:00Z");
const light = makeAlerts(start);
await light.sample({ rate: 0, total: 0 });
light.tick();
await light.sample({ rate: 0.1, total: 0.1 });
assert.equal(light.notices.length, 0, "one 0.1 mm sensor pulse must not announce rain starting");
light.tick();
await light.sample({ rate: 0, total: 0.1 });
assert.equal(light.notices.length, 0, "a single sensor pulse must remain unconfirmed");
light.tick();
await light.sample({ rate: 0.1, total: 0.2 });
assert.equal(light.notices.length, 1, "two cumulative increments reaching 0.2 mm should confirm light rain");
assert.match(light.notices[0].body, /0\.2 mm/);
light.tick();
await light.sample({ rate: 0.1, total: 0.3 });
assert.equal(light.notices.length, 1, "confirmed ongoing rain must not send repeated start alerts");

const heavy = makeAlerts(start);
await heavy.sample({ rate: 2.5, total: 0 });
assert.equal(heavy.notices.length, 1, "dashboard-level rainy conditions should alert immediately");

const resumed = makeAlerts(start);
await resumed.sample({ rate: 0, total: 1.0 });
resumed.tick(30 * 60);
await resumed.sample({ rate: 0, total: 1.5 });
assert.equal(resumed.notices.length, 0, "rain accumulated while the page was asleep must not create a late start alert");

const stale = makeAlerts(start);
await stale.sample({ offset: -11 * 60, rate: 3, total: 0 });
assert.equal(stale.notices.length, 0, "stale observations must not trigger a rain-start alert");

const staleHeavyRain = makeAlerts(start);
staleHeavyRain.enable({ heavyRain: true });
await staleHeavyRain.sample({ offset: -11 * 60, rate: 12, total: 1.0 });
assert.equal(staleHeavyRain.notices.length, 0, "stale observations must not trigger a heavy-rain alert");

console.log("Rain alert tests passed.");
