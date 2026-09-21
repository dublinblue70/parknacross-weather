const CACHE_NAME = "parknacross-v38-4-54-like-consistency";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./summary.html",
  "./radar.html",
  "./graphs.html",
  "./rain.html",
  "./climate.html",
  "./monthly.html",
  "./annual.html",
  "./coast.html",
  "./sky.html",
  "./station.html",
  "./maintenance.html",
  "./status.html",
  "./history.html",
  "./records.html",
  "./downloads.html",
  "./styles.css",
  "./app.js",
  "./wind-rose.js",
  "./site-config.js",
  "./platform.js",
  "./summary.js",
  "./radar.js",
  "./graphs.js",
  "./rain.js",
  "./climate.js",
  "./monthly.js",
  "./annual.js",
  "./coast.js",
  "./sky.js",
  "./station-v2.js",
  "./maintenance-log.js",
  "./maintenance.js",
  "./status.js",
  "./history.js",
  "./records.js",
  "./downloads.js",
  "./offline.js",
  "./accessibility.js",
  "./navigation.js",
  "./alert-settings.js",
  "./pwa-update.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./og-image.png",
  "./north-wexford-coast.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(STATIC_ASSETS.map(async asset => {
      try {
        const absolute = new URL(asset, self.registration.scope).toString();
        const request = new Request(absolute, { cache: "reload" });
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response);
      } catch (_) {}
    }));
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    clients.forEach(client => client.postMessage({type:"PARKNACROSS_UPDATE_READY"}));
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Cache API only accepts safe idempotent resources here. Let non-GET
  // requests pass straight through instead of attempting cache.put().
  if (request.method !== "GET") return;

  if (
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("rainviewer.com") ||
    url.hostname.includes("openstreetmap.org") ||
    url.hostname.includes("met.ie") ||
    url.hostname.includes("marine.ie")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(new Request(request, {cache: "no-store"}));
      } catch (_) {
        /*
         * Ignore the query string for archived report pages so, for example,
         * monthly.html?month=2026-09 can still open from the offline cache.
         */
        const pathname = url.pathname.endsWith("/")
          ? "./index.html"
          : `.${url.pathname}`;
        return (await caches.match(pathname)) ||
          (await caches.match(request)) ||
          (await caches.match("./index.html"));
      }
    })());
    return;
  }

  const forceFreshLocalAsset =
    url.origin === self.location.origin &&
    (url.pathname.endsWith("/navigation.js") || url.pathname.endsWith("/downloads.js"));

  const networkRequest = forceFreshLocalAsset
    ? new Request(request, { cache: "reload" })
    : request;

  event.respondWith(
    fetch(networkRequest).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification?.data?.url || "./index.html";

  event.waitUntil((async () => {
    const openClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of openClients) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(target);
    }
  })());
});
