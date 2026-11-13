/* Cahore Pier measured water level (OPW) — shown separately from Arklow tide predictions. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const api = (window.PARKNACROSS_CONFIG || {}).apiBase;
  const MAX_AGE_MS = 90 * 60 * 1000;
  const SOURCE_URL = "https://waterlevel.ie/0000011061/";
  const timeText = raw => new Date(raw).toLocaleString("en-IE", {
    timeZone: "Europe/Dublin", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit"
  });
  const set = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const current = result => {
    const ms = Date.parse(result?.observed_at || "");
    return result?.status === "ok" &&
      Number.isFinite(ms) && ms <= Date.now() + 10 * 60 * 1000 &&
      Date.now() - ms <= MAX_AGE_MS &&
      Number.isFinite(result?.water_level_m) &&
      result.water_level_m >= -10 && result.water_level_m <= 30;
  };
  function drawChart(rows) {
    const target = $("cahoreWaterChart");
    if (!target) return;
    const now = Date.now();
    const points = (Array.isArray(rows) ? rows : [])
      .map(row => ({ ms: Date.parse(row.time || ""), y: Number(row.water_level_m) }))
      .filter(p => Number.isFinite(p.ms) && Number.isFinite(p.y) &&
        p.ms >= now - 24 * 3600000 && p.ms <= now + 10 * 60000 &&
        p.y >= -10 && p.y <= 30).sort((a,b) => a.ms-b.ms);
    if (points.length < 2) {
      target.textContent = "Not enough recent observations for a 24-hour graph.";
      return;
    }
    const values = points.map(p => p.y);
    const lo = Math.min(...values), hi = Math.max(...values);
    const padding = Math.max(0.08, (hi - lo) * 0.15);
    const yMin = lo - padding, yMax = hi + padding;
    const first = Math.min(now - 24 * 3600000, points[0].ms);
    const x = p => 48 + ((p.ms - first) / (now - first || 1)) * 626;
    const y = p => 160 - ((p.y - yMin) / (yMax - yMin)) * 134;
    const path = points.map((p,i) => `${i ? "L" : "M"}${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
    const area = `${path} L ${x(points[points.length-1]).toFixed(1)} 160 L ${x(points[0]).toFixed(1)} 160 Z`;
    target.innerHTML = `<svg viewBox="0 0 720 204" role="img" aria-label="Observed Cahore Pier water level over the past 24 hours, in metres above the local gauge zero">
      <defs><linearGradient id="cahoreChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#65c4da" stop-opacity=".32"/><stop offset="1" stop-color="#65c4da" stop-opacity="0"/></linearGradient></defs>
      <path d="M48 26H674 M48 93H674 M48 160H674" stroke="#456174" stroke-opacity=".45" stroke-dasharray="4 5" fill="none"/>
      <path d="${area}" fill="url(#cahoreChartFill)"/>
      <path d="${path}" stroke="#74d4e5" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(points[points.length-1]).toFixed(1)}" cy="${y(points[points.length-1]).toFixed(1)}" r="4" fill="#c6f5ff"/>
      <g fill="#afc1cd" font-size="12" font-family="system-ui,sans-serif">
        <text x="42" y="29" text-anchor="end">${hi.toFixed(2)} m</text>
        <text x="42" y="163" text-anchor="end">${lo.toFixed(2)} m</text>
        <text x="48" y="187">24h ago</text>
        <text x="674" y="187" text-anchor="end">Now</text>
      </g>
    </svg>`;
  }
  function unavailable(message) {
    set("cahoreWaterLevel", "Unavailable");
    set("cahoreWaterTrend", "No verified current measurement");
    set("cahoreWaterUpdated", message);
    set("cahoreWaterChart", "A fresh reading is needed to show the 24-hour trend.");
  }
  async function load() {
    if (!api) { unavailable("Cahore Pier feed is not configured."); return; }
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${api}/marine/cahore-water-level`, { cache:"no-store", signal:controller.signal });
      if (!response.ok) throw Error("Cahore feed unavailable");
      const data = await response.json();
      if (!current(data)) {
        const stamp = Number.isFinite(Date.parse(data?.observed_at || "")) ?
          `Last reading: ${timeText(data.observed_at)} Irish time — not current.` :
          "No recent observations have been reported.";
        unavailable(stamp + " See official OPW readings.");
        return;
      }
      set("cahoreWaterLevel", `${data.water_level_m.toFixed(2)} m`);
      const trend = { rising:"Rising ↑", falling:"Falling ↓", steady:"Little change →" };
      set("cahoreWaterTrend", trend[data.trend] || "Trend unavailable");
      set("cahoreWaterUpdated", `Observed ${timeText(data.observed_at)} Irish time · OPW Cahore Pier`);
      drawChart(data.readings);
    } catch (_) {
      unavailable("Cahore Pier observations are temporarily unavailable. See official OPW readings.");
    } finally {
      clearTimeout(timeout);
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    const sourceLink = $("cahoreWaterSource");
    if (sourceLink) sourceLink.href = SOURCE_URL;
    load();
    (window.ParknacrossRefresh?.every || setInterval)(load, 15 * 60 * 1000);
  });
})();
