import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("./weather-window.js", import.meta.url), "utf8");
const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const css = await readFile(new URL("./weather-window.css", import.meta.url), "utf8");
assert.doesNotMatch(source, /AudioContext|createBufferSource|soundscape|birdsong|weatherSound/i, "the Weather Window script contains no weather-audio implementation");
assert.doesNotMatch(html, /weatherSoundToggle|weatherSoundVolume|weather-sound-controls|Hear the weather/i, "the Dashboard contains no weather-audio controls");
assert.doesNotMatch(css, /weather-sound|weatherSoundVolume/i, "the Weather Window stylesheet contains no audio-control styling");

const elements = new Map();
let observationListener = null;
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent: "",
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector() { return { style: {} }; },
    addEventListener() {}
  });
  return elements.get(id);
}
const document = { getElementById: element, addEventListener() {} };
const window = { addEventListener(name, callback) {
  if (name === "parknacross:weather-window-observation") observationListener = callback;
} };
runInNewContext(source, { document, window, console, Math, Date, Number, String, Intl, URLSearchParams, location:{search:""}, fetch:async()=>({ok:false}), setInterval() {} });
assert.equal(typeof observationListener, "function", "the visual component listens for isolated station updates");

observationListener({ detail: { current: {
  epoch: new Date("2026-10-06T08:00:00+01:00").getTime() / 1000,
  wind_speed_kmh: 18,
  wind_gust_kmh: 27,
  wind_direction_deg: 270,
  rain_rate_mm_h: 0.4,
  solar_w_m2: 450
}, rainDetected: true, isNight: false } });

assert.equal(element("weatherWindowScene").dataset.light, "day");
assert.equal(element("weatherWindowScene").dataset.wind, "breezy");
assert.equal(element("weatherWindowScene").dataset.rain, "measured");
assert.match(element("weatherWindowWind").textContent, /from W/);
assert.equal(element("weatherWindowRain").textContent, "0.4 mm/h");
assert.equal(element("weatherWindowSolar").textContent, "450 W/m²");
assert.match(element("weatherWindowObservation").textContent, /Rain is being measured at 0.4 mm\/h/);

observationListener({ detail: { current: {
  epoch: new Date("2026-10-06T14:00:00+01:00").getTime() / 1000,
  wind_speed_kmh: 2,
  wind_gust_kmh: 3,
  wind_direction_deg: 0,
  rain_rate_mm_h: 0,
  solar_w_m2: 0
}, rainDetected: true, isNight: true } });
assert.equal(element("weatherWindowScene").dataset.light, "night");
assert.equal(element("weatherWindowScene").dataset.wind, "calm");
assert.equal(element("weatherWindowScene").dataset.rain, "none", "recent rain is not drawn as current rainfall");
assert.match(element("weatherWindowObservation").textContent, /Recent rain was detected/);

observationListener({ detail: { current: {
  epoch: new Date("2026-10-06T11:00:00+01:00").getTime() / 1000,
  wind_speed_kmh: 4,
  wind_gust_kmh: 8,
  wind_direction_deg: 90,
  rain_rate_mm_h: 0,
  solar_w_m2: 250
}, rainDetected: false, isNight: false } });
assert.equal(element("weatherWindowScene").dataset.light, "day", "weak daylight does not determine forecast cloud cover");
assert.equal(element("weatherWindowScene").dataset.sky, "unknown", "missing forecast does not invent cloud cover");
assert.match(css, /\.weather-window-scene\[data-light="soft"\] \.ww-sun,\s*\.weather-window-scene\[data-light="soft"\] \.ww-sun-rays \{ display: none; \}/, "the subdued scene hides the sun and rays");

observationListener({ detail: { current: { wind_speed_kmh: null, rain_rate_mm_h: null }, rainDetected: false, isNight: false } });
assert.equal(element("weatherWindowScene").dataset.wind, "unknown");
assert.equal(element("weatherWindowScene").dataset.rain, "unknown");
assert.match(element("weatherWindowObservation").textContent, /Time unavailable/);

console.log("Weather Window visual readings pass; dashboard audio controls and implementation are absent.");

