const CACHE_NAME = "p2p-social-v2";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./p2p-logo.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
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
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    }).then(async response => {
      if (!response || !response.ok) return response;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) return response;
      const html = await response.clone().text();
      if (html.includes("/js/theme.js") || html.includes("p2p-global-theme-script")) return response;
      const bodyIndex = html.toLowerCase().lastIndexOf("</body>");
      if (bodyIndex < 0) return response;
      const injected = html.slice(0, bodyIndex) + '<script src="/js/theme.js" defer></script>\n' + html.slice(bodyIndex);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      headers.delete("etag");
      return new Response(injected, { status: response.status, statusText: response.statusText, headers });
    })
  );
});
