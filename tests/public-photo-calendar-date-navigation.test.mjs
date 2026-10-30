import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public-photo-calendar.js", import.meta.url), "utf8");

class Element {
  constructor(tag = "div", id = "") {
    this.tagName = tag;
    this.id = id;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.open = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  before(node) { this.parent?.children.splice(this.parent.children.indexOf(this), 0, node); }
  replaceChildren(...nodes) { this.children = nodes; }
  replaceWith(node) { node.parent = this.parent; if (this.parent) this.parent.children[this.parent.children.indexOf(this)] = node; this.document?.elements.set(node.id, node); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelectorAll(selector) { return selector === "[data-day]" ? this.children.filter(child => child.dataset?.day) : []; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  async click() { if (!this.disabled) await this.listeners.click?.({ currentTarget: this }); }
}

function createPage(url) {
  const elements = new Map();
  const ids = ["publicPhotoCalendar", "publicPhotoViewer", "publicPhotoCaption", "publicPhotoDateControls", "publicPhotoDatePrev", "publicPhotoDateNext", "publicPhotoDatePosition", "publicArchivePhoto", "publicPhotoViewerTitle", "publicPhotoStatus", "publicPhotoImageRetry", "publicPhotoWeatherLink", "publicPhotoClose", "publicPhotoRetry", "publicPhotoMonthTitle", "publicPhotoMonthPrev", "publicPhotoMonthNext", "publicPhotoCalendarNote"];
  for (const id of ids) elements.set(id, new Element("div", id));
  const document = {
    elements,
    getElementById(id) { const value = elements.get(id); if (value) value.document = document; return value; },
    createElement(tag) { const value = new Element(tag); value.document = document; return value; }
  };
  const monthDays = {
    "2026-10": [{ day: "2026-10-01", count: 1 }, { day: "2026-10-12", count: 2 }, { day: "2026-10-28", count: 1 }],
    "2026-09": [{ day: "2026-09-29", count: 1 }]
  };
  const fetch = async input => {
    const requestUrl = new URL(input);
    if (requestUrl.pathname.endsWith("/dates")) {
      const month = requestUrl.searchParams.get("month");
      return { ok: true, json: async () => ({ month, days: monthDays[month] || [] }) };
    }
    const day = requestUrl.searchParams.get("day");
    const photo = { photo_id: `photo-${day}`, caption: "Sky", captured_at: "2026-10-01T08:00:00Z" };
    return { ok: true, json: async () => ({ day, photo, photos: [photo] }) };
  };
  const context = {
    document,
    window: { PARKNACROSS_CONFIG: { apiBase: "https://weather.test" } },
    location: { href: url },
    URL,
    Intl,
    Date,
    Map,
    AbortSignal,
    fetch,
    setTimeout: () => 1,
    clearTimeout() {}
  };
  vm.runInNewContext(source, context);
  return { document, elements };
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

{
  const { document } = createPage("https://weather.test/sky.html?day=2026-10-12");
  await settle();
  await document.getElementById("publicPhotoDateNext").click();
  await settle();
  assert.equal(document.getElementById("publicPhotoViewerTitle").textContent, "Sky over Parknacross · 2026-10-28", "next date skips directly to the next highlighted day");
  await document.getElementById("publicPhotoDatePrev").click();
  await settle();
  assert.equal(document.getElementById("publicPhotoViewerTitle").textContent, "Sky over Parknacross · 2026-10-12", "previous date returns to the preceding highlighted day");
}

{
  const { document } = createPage("https://weather.test/sky.html?day=2026-10-01");
  await settle();
  await document.getElementById("publicPhotoDatePrev").click();
  await settle();
  assert.equal(document.getElementById("publicPhotoViewerTitle").textContent, "Sky over Parknacross · 2026-09-29", "date navigation crosses into the preceding month");
  assert.match(document.getElementById("publicPhotoMonthTitle").textContent, /September 2026/);
}

console.log("Public sky calendar saved-date navigation tests passed.");
