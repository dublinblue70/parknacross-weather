import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../weather-window.js", import.meta.url), "utf8");
const callbacks = new Map();
const elements = new Map();

function element(id) {
  if (!elements.has(id)) elements.set(id, {
    id,
    textContent: "",
    value: id === "weatherSoundVolume" ? "55" : "",
    disabled: false,
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
    attributes: {},
    addEventListener(name, callback) { callbacks.set(`${id}:${name}`, callback); },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector() { return { style: {} }; }
  });
  return elements.get(id);
}

let contextsCreated = 0;
class FakeAudioContext {
  constructor() { contextsCreated++; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; this.suspended = false; this.state = "suspended"; this.calls = []; this.gains = []; FakeAudioContext.last = this; }
  createBuffer(_channels, length) { this.calls.push("buffer"); const samples = new Float32Array(length); return { getChannelData: () => samples }; }
  createGain() { const node = { gain: { value: 0, setTargetAtTime(value) { this.value = value; } }, connect() {} }; this.gains.push(node); return node; }
  createBiquadFilter() { return { frequency: { value: 0, setTargetAtTime(value) { this.value = value; } }, connect() {} }; }
  createBufferSource() { return { loop: false, buffer: null, starts: 0, connect() {}, start() { this.starts++; } }; }
  async resume() { this.calls.push("resume"); this.suspended = false; this.state = "running"; }
  async suspend() { this.suspended = true; }
}

const documentCallbacks = new Map();
const windowCallbacks = new Map();
const document = {
  hidden: false,
  getElementById: element,
  addEventListener(name, callback) { documentCallbacks.set(name, callback); }
};
const window = {
  AudioContext: FakeAudioContext,
  addEventListener(name, callback) { windowCallbacks.set(name, callback); }
};
runInNewContext(source, { document, window, console, Math, Date, Number, String });

const update = windowCallbacks.get("parknacross:weather-window-observation");
assert.equal(typeof update, "function", "the component listens for the isolated observation event");
update({ detail: { current: {
  epoch: Date.now() / 1000,
  wind_speed_kmh: 18,
  wind_gust_kmh: 27,
  wind_direction_deg: 270,
  rain_rate_mm_h: 0.4,
  solar_w_m2: 250
}, rainDetected: true, isNight: false } });

assert.equal(element("weatherWindowScene").dataset.light, "day");
assert.equal(element("weatherWindowScene").dataset.wind, "breezy");
assert.equal(element("weatherWindowScene").dataset.rain, "measured");
assert.match(element("weatherWindowWind").textContent, /from W/);
assert.equal(element("weatherWindowRain").textContent, "0.4 mm/h");
assert.equal(element("weatherSoundToggle").disabled, false);
assert.equal(contextsCreated, 0, "the sound engine is not created until the visitor presses Play");

await callbacks.get("weatherSoundToggle:click")();
assert.equal(contextsCreated, 1);
assert.equal(element("weatherSoundToggle").attributes["aria-pressed"], "true");
assert.match(element("weatherSoundStatus").textContent, /Playing a locally generated sound/);
assert.equal(FakeAudioContext.last.calls[0], "resume", "mobile audio resumes directly inside the user's tap before buffer work");
assert.ok(FakeAudioContext.last.gains[1].gain.value > 0.3, "the wind signal has usable speaker-level gain");
assert.ok(FakeAudioContext.last.gains[2].gain.value > 0.1, "measured rain has usable speaker-level gain");
await callbacks.get("weatherSoundToggle:click")();
assert.equal(element("weatherSoundToggle").attributes["aria-pressed"], "false");

update({ detail: { current: {
  epoch: Date.now() / 1000,
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

update({ detail: { current: { wind_speed_kmh: null, rain_rate_mm_h: null }, rainDetected: false, isNight: false } });
assert.equal(element("weatherSoundToggle").disabled, true, "sound is unavailable without usable wind or rain readings");
assert.match(element("weatherWindowObservation").textContent, /Time unavailable/);

console.log("Weather Window readings, measured-rain distinction, reduced side effects, and opt-in sound tests passed.");
