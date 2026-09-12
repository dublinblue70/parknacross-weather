const CACHE_NAME = "parknacross-weather-v2-singleicon1-20260912";
const STATIC_ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./site-config.js", "./platform.js",
  "./radar.html", "./radar.js", "./graphs.html", "./graphs.js", "./rain.html", "./rain.js",
  "./climate.html", "./climate.js", "./coast.html", "./coast.js", "./sky.html", "./sky.js",
  "./station.html", "./station-v2.js", "./history.html", "./history.js",
  "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png",
  "./apple-touch-icon.png", "./og-image.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    Promise.all(STATIC_ASSETS.map(asset => cache.add(asset).catch(() => null)))
  ));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("rainviewer.com") ||
    url.hostname.includes("openstreetmap.org") ||
    url.hostname.includes("met.ie") ||
    url.hostname.includes("marine.ie")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(request).then(r => r || caches.match("./index.html"))));
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request))
  );
});