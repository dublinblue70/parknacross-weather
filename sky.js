(() => {
  "use strict";
  const cfg = window.PARKNACROSS_CONFIG || {};
  const API = String(cfg.apiBase || "").replace(/\/$/, "");
  const $ = id => document.getElementById(id);
  const stationDay = value => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${item.year}-${item.month}-${item.day}`;
  };
  const uploadedLabel = value => new Date(value).toLocaleString("en-IE", {timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});

  function showMessage(title, detail) {
    const media = $("skyObservationMedia");
    if (!media) return;
    const card = document.createElement("div"); card.className = "camera-placeholder";
    const heading = document.createElement("strong"), copy = document.createElement("p");
    heading.textContent = title; copy.textContent = detail; card.append(heading, copy); media.replaceChildren(card);
  }

  async function loadObservation() {
    const status = $("skyObservationStatus"), button = $("skyRetryButton");
    if (button) button.disabled = true;
    if (status) status.textContent = "Checking the latest visual observation…";
    try {
      if (!API) throw new Error("Weather-data connection is not configured");
      const response = await fetch(`${API}/sky-photo/meta?_=${Date.now()}`, {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data?.available || !data?.uploaded_at || stationDay(data.uploaded_at) !== stationDay()) {
        showMessage("No photo added today", "A new visual observation will appear here when today’s sky photo is uploaded.");
        if (status) status.textContent = "No visual observation has been added for today yet.";
        return;
      }
      const image = new Image(); image.className = "sky-image"; image.alt = "Today’s sky over Parknacross, Ardamine";
      image.addEventListener("load", () => {
        const figure = document.createElement("figure"); figure.className = "today-sky-photo-wrap sky-page-photo"; figure.append(image);
        const captionText = String(data.caption || "").trim();
        if (captionText) {
          const caption = document.createElement("figcaption"), pill = document.createElement("span");
          caption.className = "today-sky-caption"; pill.className = "today-sky-caption-pill"; pill.textContent = captionText;
          caption.append(pill); figure.append(caption);
        }
        $("skyObservationMedia")?.replaceChildren(figure);
        if (status) status.textContent = `Uploaded ${uploadedLabel(data.uploaded_at)} · Parknacross, Ardamine`;
      }, {once:true});
      image.addEventListener("error", () => {
        showMessage("Photo unavailable", "The latest sky photo could not be displayed just now.");
        if (status) status.textContent = "The visual observation is temporarily unavailable.";
      }, {once:true});
      image.src = `${API}/sky-photo?v=${encodeURIComponent(data.uploaded_at)}`;
    } catch (_) {
      showMessage("Photo service unavailable", "The latest visual observation could not be loaded. Please try again.");
      if (status) status.textContent = "The photo service could not be reached just now.";
    } finally { if (button) button.disabled = false; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("year").textContent = new Date().getFullYear();
    $("skyRetryButton")?.addEventListener("click", loadObservation);
    loadObservation();
  });
})();
