(() => {
  "use strict";
  const $ = id => document.getElementById(id);

  function labelDate(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-IE", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Dublin"
      });
    }
    if (/^\d{4}-\d{2}$/.test(value)) {
      return new Date(`${value}-15T12:00:00Z`).toLocaleDateString("en-IE", {
        month: "long",
        year: "numeric",
        timeZone: "Europe/Dublin"
      });
    }
    return value || "--";
  }

  function render() {
    const host = $("maintenanceLog");
    if (!host) return;
    const rows = Array.isArray(window.PARKNACROSS_MAINTENANCE_LOG)
      ? [...window.PARKNACROSS_MAINTENANCE_LOG]
      : [];

    host.innerHTML = "";
    if (!rows.length) {
      host.innerHTML = '<p class="info-note">No maintenance entries have been recorded yet.</p>';
      return;
    }

    rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    for (const item of rows) {
      const article = document.createElement("article");
      article.className = "maintenance-entry";

      const date = document.createElement("time");
      date.textContent = labelDate(item.date);
      date.dateTime = item.date || "";

      const copy = document.createElement("div");
      const type = document.createElement("span");
      type.className = "event-type";
      type.textContent = item.type || "Station";
      const title = document.createElement("strong");
      title.textContent = item.title || "Station update";
      const detail = document.createElement("p");
      detail.textContent = item.detail || "";
      copy.append(type, title, detail);

      article.append(date, copy);
      host.append(article);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const year = $("year");
    if (year) year.textContent = new Date().getFullYear();
    render();
  });
})();