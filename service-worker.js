const CACHE_NAME = "p2p-social-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./p2p-logo.svg"
];

self.addEventListener("install", event => {

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
  );

  self.skipWaiting();
});


self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(cacheNames =>

      Promise.all(

        cacheNames
          .filter(
            name => name !== CACHE_NAME
          )
          .map(
            name => caches.delete(name)
          )

      )

    )

  );

  self.clients.claim();
});


self.addEventListener("fetch", event => {

  event.respondWith(

    caches.match(event.request)
      .then(cached => {

        return cached || fetch(event.request);

      })

  );

});