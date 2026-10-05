(() => {
  "use strict";
  const cfg = window.PARKNACROSS_CONFIG || {};
  const API = String(cfg.apiBase || "").replace(/\/$/, "");
  const $ = id => document.getElementById(id);
  const likeRow = () => $("skyLikeRow");
  const likeButton = () => $("skyLikeButton");
  const likeCount = () => $("skyLikeCount");
  let currentPhotoId = "";
  const likeKey = id => `parknacrossSkyLiked:${id}`;
  function visitorId() {
    const key = "parknacrossSkyVisitorId:v1";
    let id = localStorage.getItem(key);
    if (!/^[0-9a-f]{32}$/i.test(id || "")) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(key, id);
    }
    return id;
  }
  function renderLikeState(count, liked) {
    const button = likeButton(), label = likeCount(), row = likeRow();
    if (!button || !label || !row) return;
    row.hidden = false;
    button.classList.toggle("is-liked", liked);
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.textContent = liked ? "♥ Liked" : "♡ Like";
    button.disabled = liked;
    const n = Math.max(0, Number(count) || 0);
    label.textContent = `${n} ${n === 1 ? "like" : "likes"}`;
  }
  async function loadLikes(photoId) {
    const button = likeButton(), label = likeCount();
    try {
      const id = visitorId();
      const response = await fetch(`${API}/sky-photo/likes?photo_id=${encodeURIComponent(photoId)}&visitor_id=${encodeURIComponent(id)}&_=${Date.now()}`, {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (photoId !== currentPhotoId) return;
      if (data.liked) localStorage.setItem(likeKey(photoId), "1");
      else localStorage.removeItem(likeKey(photoId));
      renderLikeState(data.likes, Boolean(data.liked));
    } catch (_) {
      if (photoId !== currentPhotoId) return;
      if (label) label.textContent = "Likes unavailable";
      if (button) button.disabled = true;
      if (likeRow()) likeRow().hidden = false;
    }
  }
  async function submitLike() {
    const photoId = currentPhotoId, button = likeButton();
    if (!photoId || !button) return;
    try {
      if (localStorage.getItem(likeKey(photoId)) === "1") {
        button.disabled = true;
        return;
      }
      button.disabled = true;
      const response = await fetch(`${API}/sky-photo/likes`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({photo_id:photoId,visitor_id:visitorId()})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      localStorage.setItem(likeKey(photoId), "1");
      if (photoId === currentPhotoId) renderLikeState(data.likes, true);
    } catch (_) {
      if (photoId === currentPhotoId) {
        button.disabled = false;
        if (likeCount()) likeCount().textContent = "Could not save like · try again";
      }
    }
  }
  const stationDay = value => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Dublin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${item.year}-${item.month}-${item.day}`;
  };
  const uploadedLabel = value => new Date(value).toLocaleString("en-IE", {timeZone:"Europe/Dublin",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  const showRetry = visible => { const button = $("skyRetryButton"); if (button) button.hidden = !visible; };

  function showMessage(title, detail) {
    currentPhotoId = "";
    if (likeRow()) likeRow().hidden = true;
    const media = $("skyObservationMedia");
    if (!media) return;
    const card = document.createElement("div"); card.className = "camera-placeholder";
    const heading = document.createElement("strong"), copy = document.createElement("p");
    heading.textContent = title; copy.textContent = detail; card.append(heading, copy); media.replaceChildren(card);
  }

  async function loadObservation() {
    const status = $("skyObservationStatus"), button = $("skyRetryButton");
    showRetry(false);
    if (button) button.disabled = true;
    if (status) status.textContent = "Checking today’s photograph…";
    try {
      if (!API) throw new Error("Weather-data connection is not configured");
      const response = await fetch(`${API}/sky-photo/meta?_=${Date.now()}`, {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data?.available || !data?.uploaded_at || stationDay(data.uploaded_at) !== stationDay()) {
        showMessage("No photo added today", "A new visual observation will appear here when today’s sky photo is uploaded.");
        if (status) status.textContent = "No photograph has been added today.";
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
        currentPhotoId = String(data.uploaded_at);
        if (likeRow()) likeRow().hidden = false;
        if (likeButton()) { likeButton().disabled = true; likeButton().textContent = "♡ Like"; }
        if (likeCount()) likeCount().textContent = "Loading likes…";
        loadLikes(currentPhotoId);
        showRetry(false);
      }, {once:true});
      image.addEventListener("error", () => {
        showMessage("Photo unavailable", "The latest sky photo could not be displayed just now.");
        if (status) status.textContent = "The photograph could not be displayed.";
        showRetry(true);
      }, {once:true});
      image.src = `${API}/sky-photo?v=${encodeURIComponent(data.uploaded_at)}`;
    } catch (_) {
      showMessage("Photo service unavailable", "The latest visual observation could not be loaded. Please try again.");
      if (status) status.textContent = "The photo service could not be reached just now.";
      showRetry(true);
    } finally { if (button) button.disabled = false; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("year").textContent = new Date().getFullYear();
    $("skyRetryButton")?.addEventListener("click", loadObservation);
    $("skyLikeButton")?.addEventListener("click", submitLike);
    loadObservation();
  });
})();
