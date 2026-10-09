const CACHE_NAME = "parknacross-v38-4-179-visible-flowers";
const STATIC_ASSETS = [
  "./",
  "./site-request.js",
  "./weather-warnings.js",
  "./index.html",
  "./admin.html",
  "./admin-tools.js",
  "./site-enhancements.css",
  "./source-freshness.js",
  "./dashboard-enhancements.js",
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
  "./install.html",
  "./privacy.html",
  "./intelligence.html",
  "./offline.html",
  "./ardamine-weather.html",
  "./courtown-weather.html",
  "./north-wexford-weather.html",
  "./north-wexford-coastal-weather.html",
  "./styles.css",
  "./style.css",
  "./weather-window.css",
  "./chart.umd.min.js",
  "./app.js",
  "./weather-window.js",
  "./archive-quality.js",
  "./report-quality.js",
  "./site-help.js",
  "./visibility-refresh.js",
  "./graph-selection.js",
  "./download-preview.js",
  "./maintenance-markers.js",
  "./explore-weather.css",
  "./dashboard-preferences.js",
  "./chart-explorer.js",
  "./history-links.js",
  "./public-photo-calendar.js",
  "./action-feedback.js",
  "./website-usability.css",

  "./site-help.css",
  "./weather-window-preview.js",
  "./photo-calendar.js",
  "./weather-window-sky.js",
  "./social-admin.js",
  "./data-corrections.js",
  "./wind-rose.js",
  "./site-config.js",
  "./platform.js",
  "./summary.js",
  "./radar.js",
  "./graphs.js",
  "./lightning-charts.js",
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
  "./pwa-diagnostics.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./og-image.png",
  "./north-wexford-coast.jpg",
  "./pwa-dashboard-wide.jpg",
  "./pwa-graphs-wide.jpg",
  "./pwa-dashboard-narrow.jpg"
];

// Every advertised offline page must retain its local dependencies before activation.
const ESSENTIAL_ASSETS=STATIC_ASSETS;
async function verifyEssentialCache(){const cache=await caches.open(CACHE_NAME);for(const asset of ESSENTIAL_ASSETS){const response=await cache.match(new URL(asset,self.registration.scope).toString());if(!response?.ok)throw new Error(`Incomplete offline update: ${asset}`);}}
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(STATIC_ASSETS.map(async asset => {
      try {
        const absolute = new URL(asset, self.registration.scope).toString();
        const request = new Request(absolute, { cache: "reload" });
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let response;try{response=await fetch(request,{signal:controller.signal});}finally{clearTimeout(timer);}
        if (response.ok) await cache.put(request, response);
      } catch (_) {}
    }));
    /* Activate a fully cached release immediately. This prevents installed
       PWAs—especially iOS installations reopened after several days—from
       remaining indefinitely on an older application shell. */
    await verifyEssentialCache();
    await self.skipWaiting();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(verifyEssentialCache().then(()=>self.skipWaiting()));
  } else if (event.data?.type === "GET_SITE_VERSION") {
    const match = CACHE_NAME.match(/parknacross-v(\d+(?:-\d+)+)(?:-|$)/);
    const version = match ? match[1].replace(/-/g, ".") : "unknown";
    const reply = { type: "SITE_VERSION", version };
    if (event.ports?.[0]) event.ports[0].postMessage(reply);
    else event.source?.postMessage(reply);
  }
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await verifyEssentialCache();
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("parknacross-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
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
          (await caches.match("./offline.html"));
      }
    })());
    return;
  }

  const forceFreshLocalAsset =
    url.origin === self.location.origin &&
    (url.pathname.endsWith("/styles.css") ||
      url.pathname.endsWith("/app.js") ||
      url.pathname.endsWith("/graphs.js") ||
      url.pathname.endsWith("/navigation.js") ||
      url.pathname.endsWith("/downloads.js") ||
      url.pathname.endsWith("/alert-settings.js") ||
      url.pathname.endsWith("/pwa-update.js") ||
      url.pathname.endsWith("/pwa-diagnostics.js") ||
      url.pathname.endsWith("/platform.js"));

  const networkRequest = forceFreshLocalAsset
    ? new Request(request, { cache: "reload" })
    : request;

  event.respondWith(
    fetch(networkRequest).then(response => {
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).catch(()=>{}));
        return response;
      }
      // Keep the last working asset when the server temporarily returns an error.
      return caches.match(request,{ignoreSearch:url.origin===self.location.origin}).then(cached=>cached?.ok?cached:response);
    }).catch(() => caches.match(request, {
      // HTML references local assets with release query strings while the
      // install cache stores their canonical paths. Ignore only that query
      // component for same-origin fallback so unvisited pages work offline.
      ignoreSearch: url.origin === self.location.origin
    }))
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

