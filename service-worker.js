const CACHE_NAME = "p2p-social-v6";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./p2p-logo.svg",
  "./js/logo.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Always try the network first for HTML so profile/name fixes appear after deployment.
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("text/html")) {
            const html = await response.clone().text();
            const bodyIndex = html.toLowerCase().lastIndexOf("</body>");
            if (bodyIndex >= 0) {
              let additions = "";
              if (!html.includes("/js/theme.js") && !html.includes("p2p-global-theme-script")) {
                additions += '<script src="/js/theme.js" defer></script>\n';
              }
              if (!html.includes("/js/logo.js")) {
                additions += '<script src="/js/logo.js" defer></script>\n';
              }
              if (additions) {
                const injected = html.slice(0, bodyIndex) + additions + html.slice(bodyIndex);
                const headers = new Headers(response.headers);
                headers.delete("content-length");
                headers.delete("content-encoding");
                headers.delete("etag");
                return new Response(injected, { status: response.status, statusText: response.statusText, headers });
              }
            }
          }
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Cache static assets; refresh them in the background when online.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async response => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    return cached || await network || Response.error();
  })());
});
