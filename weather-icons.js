/* Parknacross Weather — premium shared inline SVG icon system.
 * Decorative iconography for nine existing pages. Does not alter data, labels,
 * status colour semantics, anchors, interactive controls or existing icons. */
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const I = (tag, attributes) => [tag, attributes];
  const PATHS = {
    sun: [I("circle",{cx:12,cy:12,r:4}), I("path",{d:"M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"})],
    moon: [I("path",{d:"M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"})],
    thermometer: [I("path",{d:"M14 14.8V5a4 4 0 0 0-8 0v9.8a6 6 0 1 0 8 0Z"}), I("path",{d:"M10 6v10"}),I("circle",{cx:10,cy:19,r:1.5})],
    wind: [I("path",{d:"M3 8h12c2.6 0 4-1.5 4-3.2 0-1.2-.9-2.2-2.1-2.2-1.3 0-2.2.9-2.2 2.1M3 12h15c2.4 0 4 1.4 4 3.2 0 1.3-.9 2.3-2.1 2.3-1.2 0-2.1-.8-2.1-2M3 16h8.8c2 0 3.2 1.2 3.2 2.7 0 1.3-.9 2.3-2.2 2.3-1.3 0-2.1-.9-2.1-2"})],
    drop: [I("path",{d:"M12 2C9.8 5.4 5.5 10 5.5 14.3a6.5 6.5 0 0 0 13 0C18.5 10 14.2 5.4 12 2Z"}),I("path",{d:"M9 15.5c0 1.5 1 2.5 2.5 2.8"})],
    cloudRain: [I("path",{d:"M5.6 16h11.8a3.6 3.6 0 0 0 .3-7.2 5.5 5.5 0 0 0-10.2.1A3.7 3.7 0 0 0 5.6 16Z"}),I("path",{d:"m8 19-1 2m5-2-1 2m5-2-1 2"})],
    cloudSun: [I("circle",{cx:7.2,cy:7.2,r:2.4}),I("path",{d:"M7.2 1.6v1.5M2 7.2h1.5m.1-3.6 1.1 1.1M16.8 17.5h1a3.4 3.4 0 0 0 .3-6.8 5.3 5.3 0 0 0-9.8-.1 3.5 3.5 0 0 0-.8 6.9Z"})],
    gauge: [I("path",{d:"M4.2 18a8 8 0 1 1 15.6 0"}),I("path",{d:"M12 17.9 16.9 10.1"}),I("circle",{cx:12,cy:18,r:1.5}),I("path",{d:"M12 4v2m-6.2 4.1 1.5 1.2m10.9-1.2-1.5 1.2"})],
    zap: [I("path",{d:"m13 2-9 11h7l-1 9 10-12h-7l0-8Z"})],
    leaf: [I("path",{d:"M21 3C10.5 3 5 5.5 5 13a7 7 0 0 0 7 7c7.5 0 9-7.6 9-17Z"}),I("path",{d:"M3 21c2-5.2 5.6-9 12-12"})],
    sprout: [I("path",{d:"M12 22V11m0 3C5 14 4 10 4 6c4 0 8 1.6 8 8Zm0-2c0-4 3.5-6.8 8-7-1 5.6-3.5 8-8 8Z"})],
    waves: [I("path",{d:"M2 8c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 14c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2M2 20c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"})],
    compass: [I("circle",{cx:12,cy:12,r:9}),I("path",{d:"m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3 5.3-2.3Z"})],
    chart: [I("path",{d:"M3 3v18h18"}),I("polyline",{points:"6,16 11,11 14,14 20,7"})],
    database: [I("ellipse",{cx:12,cy:5,rX:8,rY:3}),I("path",{d:"M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"})],
    activity: [I("polyline",{points:"2,12 6,12 9,5 13,19 16,10 18,12 22,12"})],
    clock: [I("circle",{cx:12,cy:12,r:9}),I("path",{d:"M12 7v5l3 2"})],
    calendar: [I("rect",{x:3,y:5,width:18,height:16,rx:2}),I("path",{d:"M7 3v4m10-4v4M3 10h18m-12 5h2m3 0h2"})],
    camera: [I("path",{d:"M4 7h4l2-3h5l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"}),I("circle",{cx:12,cy:14,r:3.5})],
    download: [I("path",{d:"M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"})],
    archive: [I("rect",{x:3,y:4,width:18,height:5,rx:1}),I("path",{d:"M5 9v12h14V9m-10 5h6"})],
    radio: [I("path",{d:"m7 21 5-13 5 13M9 16h6M12 8V3"}),I("circle",{cx:12,cy:7,r:1}),I("path",{d:"M7 4a6 6 0 0 0 0 8m10-8a6 6 0 0 1 0 8"})],
    shield: [I("path",{d:"M12 2 20 5v6c0 5-2.5 8.5-8 11-5.5-2.5-8-6-8-11V5l8-3Z"}),I("path",{d:"m8 12 2.5 2.5L16 9"})],
    bell: [I("path",{d:"M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4"})],
    map: [I("path",{d:"m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"}),I("path",{d:"M9 3v15m6-12v15"})],
    umbrella: [I("path",{d:"M3 12a9 9 0 0 1 18 0H3ZM12 12v8a2 2 0 0 0 4 0"})],
    check: [I("circle",{cx:12,cy:12,r:9}),I("path",{d:"m7.5 12 3 3 6-6"})],
    globe: [I("circle",{cx:12,cy:12,r:9}),I("path",{d:"M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"})],
    battery: [I("rect",{x:2,y:7,width:18,height:10,rx:2}),I("path",{d:"M22 10v4M6 10v4m4-4v4"})]
  };
  const normalize = text => String(text || "").toLowerCase().replace(/\s+/g," ").trim();
  const choose = (label, fallback = "chart") => {
    const t = normalize(label);
    const rules = [
      [/wind rose|wind direction|compass/, "compass"],
      [/wind|gust|drying window/, "wind"],
      [/lightning|strike|thunder/, "zap"],
      [/humidity|moisture|dew point/, "drop"],
      [/rain|precip|wet/, "cloudRain"],
      [/soil|hydrangea|root|conductivity|plant/, "sprout"],
      [/tide|marine|sea|swim|coast|buoy|water safety|water temperature/, "waves"],
      [/temperature|warm|cold|heat|battery/, "thermometer"],
      [/pressure|barometric/, "gauge"],
      [/sun|solar|uv|daylight/, "sun"],
      [/forecast|outlook|cloud|weather window/, "cloudSun"],
      [/photo|sky|picture/, "camera"],
      [/record|backup|storage|archive|database/, "archive"],
      [/data feed|uptime|monitor|website|service|upload|connection/, "radio"],
      [/alert|warning|attention/, "bell"],
      [/location|map/, "map"],
      [/calendar|date|today|yesterday|summary|day/, "calendar"],
      [/graph|chart|trend|comparison|statistic/, "chart"],
      [/reading|observation|quality|reliability|health|sensor/, "activity"],
      [/notification/, "bell"],
      [/download|export|csv/, "download"]
    ];
    for (const [pattern,name] of rules) if (pattern.test(t)) return name;
    return fallback;
  };
  const makeIcon = (name) => {
    const type = Object.prototype.hasOwnProperty.call(PATHS,name) ? name : "chart";
    const svg = document.createElementNS(NS,"svg");
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","1.75");
    svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");
    svg.setAttribute("aria-hidden","true");
    svg.setAttribute("focusable","false");
    svg.classList.add("wx-svg-icon","wx-svg-icon--"+type);
    PATHS[type].forEach(([tag, attrs]) => {
      const node=document.createElementNS(NS,tag);
      Object.entries(attrs).forEach(([key,value]) => node.setAttribute(key==="rX"?"rx":key==="rY"?"ry":key,String(value)));
      svg.appendChild(node);
    });
    return svg;
  };
  const install = (el, icon, kind="heading") => {
    if (!el || el.querySelector(":scope > .wx-svg-icon")) return;
    // Several Dashboard metric cards already contain weather SVG artwork.
    if (kind==="label" && el.querySelector(":scope > svg")) return;
    el.insertBefore(makeIcon(icon), el.firstChild);
    el.classList.add("wx-icon-"+kind);
  };
  const group = (selector, type, kind="heading") => {
    document.querySelectorAll(selector).forEach(el => {
      const icon = typeof type==="function" ? type(el) : type;
      if (icon) install(el, icon, kind);
    });
  };
  const byText = (selector, fallback, kind="heading") => group(selector, el=>choose(el.textContent, fallback),kind);
  const file = String(window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const page = {
    "index.html": () => {
      const nav = {
        "#todayHeading":"calendar", "#observationsHeading":"thermometer",
        "#forecast":"cloudSun", "#planning":"compass",
        "#graphs":"chart", "#soilPanel":"sprout",
        "rain.html":"cloudRain", "coast.html":"waves", "summary.html":"calendar"
      };
      group(".dashboard-shortcuts a", el=>nav[el.getAttribute("href")], "nav");
      group(".hero-stat > span",el=>choose(el.textContent,"activity"),"label");
      group("#todayHeading","calendar");
      group("#observationsHeading","thermometer");
      group("#planningHeading","compass");
      group("#rainOutlookHeading","cloudRain");
      group("#coastalCompassHeading","wind");
      group("#laundryDryingHeading","wind");
      group("#todaySkyHeading","camera");
      group("#weatherWindowHeading","cloudSun");
      group("#wearTodayHeading","umbrella");
      group("#soilHeading","sprout");
      group("#soilWateringHeading","drop","small");
      group("#climateHeading","archive");
      group("#trendsHeading","chart");
      group("#recordsHeading","archive");
      byText(".chart-grid .chart-title h3","chart","small");
    },
    "station.html": () => {
      group("#meetSensorsHeading","radio");
      group("#understandingHeading","activity");
      group("#alertsHeading","bell");
      group("#technicalMonitoringHeading","radio");
      group("#appDiagnosticsHeading","shield");
      byText(".station-context-grid h3","activity","small");
      byText(".station-specs .station-spec > span","radio","label");
      group(".station-sensor-buttons button > span",el=>choose(el.textContent,"radio"),"label");
      byText(".station-page-hero .station-jumps a","compass","nav");
    },
    "graphs.html": () => {
      byText(".v2-chart-grid .chart-title h3","chart","small");
      group("#comparisonHeading","calendar");
      group(".chart-guide h2","chart");
    },
    "rain.html": () => {
      group(".rain-primary > .section-eyebrow","cloudRain","label");
      byText(".rain-hero-grid .context-card > span:first-child","cloudRain","label");
      byText(".rain-stat-grid .climate-card > span:first-child","drop","label");
      group("#rainOutlookHeading","cloudRain");
      group("#rainAnalyticsHeading","clock");
      group(".page-section.chart-card .chart-title h2","cloudRain");
    },
    "coast.html": () => {
      group("#swimOverviewTitle","waves");
      group("#coastalCompassHeading","compass");
      group("#marineArea","waves");
      byText(".coastal-grid .climate-card > span:first-child","waves","label");
      byText(".two-column-cards h2","waves");
      byText(".page-section .section-heading h2","waves");
    },
    "status.html": () => {
      byText(".health-group-heading h2","activity");
      byText(".health-group .card-head h2","activity","small");
      group("#attentionHeading","bell");
    },
    "summary.html": () => {
      byText(".section-heading h2","calendar");
      byText(".rain-stat-grid .climate-card > span:first-child","chart","label");
      group("#summarySoilHeading","sprout");
      group("#summarySoilWateringHeading","drop","small");
    },
    "sky.html": () => {
      group("#skyObservationHeading","camera");
      group("#publicPhotoHeading","calendar");
    },
    "downloads.html": () => {
      group(".grid > article.card > h2","download","small");
      group("#downloadPreviewHeading","chart");
      group("#customRangeHeading","calendar");
    }
  };
  const run=()=>{ try { if(page[file])page[file](); } catch(error) {console.warn("Weather icon enhancement skipped:",error?.message||error);} };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});
  else run();
})();
