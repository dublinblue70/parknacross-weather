const CACHE_NAME = "parknacross-weather-v4-finish2";

const STATIC_ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./history.html",
  "./history.js",
  "./station.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./og-image.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Weather APIs and third-party libraries should always use the network.
  if (
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("met.ie")
  ) {
    return;
  }

  // Always request page navigations from the network first.
  // This prevents "/" and "/index.html" becoming different stale cached pages.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Static files: network first, cached fallback.
  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
