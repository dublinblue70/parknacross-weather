/* Shared enhancements: progressive disclosure and understandable wayfinding.
   The weather service and existing chart rendering are not modified. */
(() => {
  "use strict";
  const ready = fn => document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn, {once:true}) : fn();
  const element = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const page = location.pathname.split("/").pop() || "index.html";
  function note(text) {
    return element("p", "site-context-note", text);
  }
  function quickNav(label, links, before) {
    if (!before || document.querySelector(".site-jump-nav")) return;
    const nav = element("nav", "site-jump-nav");
    nav.setAttribute("aria-label", label);
    nav.appendChild(element("strong", "", "Jump to"));
    for (const [text, id] of links) {
      const target = document.getElementById(id);
      if (!target) continue;
      const anchor = target.closest(".chart-card,.page-section,.rain-events-section") || target;
      if (!anchor.id) anchor.id = "jump-" + id;
      anchor.classList.add("site-jump-target");
      const a = element("a", "", text);
      a.href = "#" + anchor.id;
      nav.appendChild(a);
    }
    if (nav.querySelector("a")) before.before(nav);
  }
  ready(() => {
    if (page === "index.html") {
      // Collapse lower-priority background and record cards on narrow phones.
      // The main observations, forecast, soil, charts and all direct-page links remain visible.
      const climate = document.querySelector(".climate-section");
      const lower = [
        climate,
        document.querySelector(".signature-section"),
        document.querySelector(".records-section")
      ].filter(Boolean);
      if (climate && lower.length) {
        lower.forEach((section, i) => { if (!section.id) section.id = "weatherExtra" + i; });
        const toggle = element("button", "site-detail-toggle", "Show climate context and station records");
        toggle.type = "button";
        toggle.setAttribute("aria-controls", lower.map(section => section.id).join(" "));
        const desc = element("p", "site-detail-copy",
          "Live conditions and weather graphs remain visible. Open these additional panels when you need more detail.");
        climate.before(toggle, desc);
        const expandedForLink = lower.some(section => location.hash === "#" + section.id || (location.hash && section.contains(document.getElementById(decodeURIComponent(location.hash.slice(1))))));
        const setExpanded = expanded => {
          document.body.dataset.weatherDetails = expanded ? "expanded" : "collapsed";
          toggle.setAttribute("aria-expanded", String(expanded));
          toggle.textContent = expanded
            ? "Hide extra climate and record panels"
            : "Show climate context and station records";
        };
        setExpanded(expandedForLink);
        toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
        window.addEventListener("hashchange", () => {
          if (lower.some(section => location.hash && (location.hash === "#" + section.id || section.contains(document.getElementById(decodeURIComponent(location.hash.slice(1))))))) setExpanded(true);
        });
      }
    }
    if (page === "graphs.html") {
      const anchor = document.querySelector(".chart-grid");
      quickNav("Weather graph categories", [
        ["Temperature", "gTemp"], ["Wind", "gWind"], ["Rain", "gRain"],
        ["Sun & UV", "gSolar"], ["Lightning", "gLightningCount"],
        ["Soil", "gSoilMoisture"]
      ], anchor);
    }
    if (page === "rain.html") {
      const heading = document.querySelector("h1");
      const intro = heading?.closest("section") || heading?.parentElement;
      const legend = element("div", "site-source-legend");
      legend.setAttribute("aria-label", "Three different sources of rain information");
      for (const [cls, title, description] of [
        ["observed", "Station detected", "Measured by the dedicated WH40H tipping-bucket gauge. Traces below 0.1 mm may not register."],
        ["radar", "Radar echoes", "Estimated precipitation location. An echo does not prove rain reached the ground."],
        ["forecast", "Forecast rainfall", "Met Éireann model guidance for coming hours, not a live reading."]
      ]) {
        const article = element("article", cls);
        article.append(element("strong", "", title), element("p", "", description));
        legend.appendChild(article);
      }
      const first = document.querySelector(".local-planning");
      if (first) first.before(legend);
      else if (intro) intro.after(legend);
      const stats = document.getElementById("rainMonthDays");
      if (stats) stats.title = "Any recorded rain: more than 0 mm. A wet day in reports starts at 0.2 mm.";
    }
    if (page === "history.html") {
      const controls = document.querySelector(".archive-day-navigation");
      controls?.before(note("Calendar arrows change month. Previous/next available day skips archive dates without saved daily observations; missing data is never treated as a dry day."));
      for (const [id, label] of [
        ["previousArchiveDay", "Open the previous date with saved observations"],
        ["nextArchiveDay", "Open the next date with saved observations"]
      ]) {
        const button = document.getElementById(id);
        if (button) button.setAttribute("aria-label", label);
      }
    }
    if (page === "downloads.html") {
      const status = document.getElementById("downloadStatus");
      status?.setAttribute("role", "status");
      const custom = document.getElementById("customRangeLimit");
      if (custom) {
        custom.classList.add("site-download-note");
        custom.append(" At five-minute intervals, a complete 365-day year contains about 105,120 observations; the actual export may have fewer rows. Use Preview to see the saved count and coverage.");
      }
    }
    if (page === "coast.html") {
      const h = document.querySelector("main h1");
      h?.closest("section")?.after(note("Source matters: local station wind is observed, Met Éireann marine information is forecast, and nearby sea temperature is modelled unless an offshore buoy observation is explicitly identified."));
    }
    if (page === "records.html") {
      const title = document.querySelector("main h1");
      title?.closest("section")?.after(note("Records describe the available Parknacross archive, not a long-term regional climate record. A period with missing observations cannot establish a verified record."));
    }
  });
})();
