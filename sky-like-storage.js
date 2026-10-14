(() => {
  "use strict";

  const visitorKey = "parknacrossSkyVisitorId:v1";
  const likedPrefix = "parknacrossSkyLiked:";
  const likedInMemory = new Set();
  let transientVisitorId = "";

  function readStorage(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value) return value;
    } catch (_) {}
    try {
      const value = window.sessionStorage.getItem(key);
      if (value) return value;
    } catch (_) {}
    return "";
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (_) {}
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch (_) {}
    return false;
  }

  function removeStorage(key) {
    try { window.localStorage.removeItem(key); } catch (_) {}
    try { window.sessionStorage.removeItem(key); } catch (_) {}
  }

  function makeVisitorId() {
    const bytes = new Uint8Array(16);
    try {
      if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
        throw new Error("Secure random values are unavailable");
      }
      window.crypto.getRandomValues(bytes);
    } catch (_) {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes, byte => ("0" + byte.toString(16)).slice(-2)).join("");
  }

  function visitorId() {
    const stored = readStorage(visitorKey);
    if (/^[0-9a-f]{32}$/i.test(stored)) return stored;
    if (!transientVisitorId) transientVisitorId = makeVisitorId();
    writeStorage(visitorKey, transientVisitorId);
    return transientVisitorId;
  }

  function likedKey(photoId) {
    return likedPrefix + String(photoId || "");
  }

  function hasLiked(photoId) {
    const key = likedKey(photoId);
    return likedInMemory.has(key) || readStorage(key) === "1";
  }

  function setLiked(photoId, liked) {
    const key = likedKey(photoId);
    if (liked) {
      likedInMemory.add(key);
      writeStorage(key, "1");
    } else {
      likedInMemory.delete(key);
      removeStorage(key);
    }
  }

  
  async function loadLikes(api, photoId) {
    let lastError;
    for (let attempt=0;attempt<2;attempt+=1) {
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),10000);
      try {
        const response=await fetch(`${api}/sky-photo/likes?photo_id=${encodeURIComponent(photoId)}&visitor_id=${encodeURIComponent(visitorId())}&_=${Date.now()}`,{cache:"no-store",signal:controller.signal});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const data=await response.json();
        if(!Number.isFinite(Number(data.likes))||Number(data.likes)<0)throw new Error("Invalid like count");
        return data;
      } catch(error) { lastError=error; }
      finally { clearTimeout(timer); }
      if(attempt===0)await new Promise(resolve=>setTimeout(resolve,600));
    }
    throw lastError;
  }
  window.ParknacrossSkyLikesStorage = { visitorId, hasLiked, setLiked, loadLikes };
})();
