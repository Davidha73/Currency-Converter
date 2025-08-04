// 12345
const CACHE_NAME = "currency-converter-v2.31"; // Increment cache version for new changes
const urlsToCache = [
  "/", // Root path, typically your index.html
  "/index.html",
  "/manifest.json",
  // Add all icon paths here (ensure these exist in your /icons folder)
  "/icons/icon-72x72.png",
  "/icons/icon-96x96.png",
  "/icons/icon-128x128.png",
  // "/icons/icon-144x144.png",
  "/icons/icon-152x152.png",
  "/icons/icon-192x192.png",
  "/icons/icon-384x384.png",
  "/icons/icon-512x512.png",
  // Tailwind CSS CDN (cache this for offline styling)
  "https://cdn.tailwindcss.com",
];

// Install event: Caches all the necessary static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Opened cache");
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error("Service Worker: Failed to cache during install:", error);
      })
  );
});

// Activate event: Cleans up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Service Worker: Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: Handles network requests
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Strategy for API calls (Network-First):
  // Always try to fetch from the network for live exchange rates.
  // Fallback to cache only if network is unavailable (though for live data, this might mean stale data).
  if (requestUrl.hostname === "v6.exchangerate-api.com") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Optionally, cache the fresh response for future *offline* use
          // (though for live rates, we prioritize network)
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // If network fails, try to get from cache (might be stale)
          return caches.match(event.request);
        })
    );
  } else {
    // Strategy for other assets (Cache-First with Network Fallback):
    // Try to serve from cache first, then fall back to network.
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // No cache hit - fetch from network
        return fetch(event.request).catch((error) => {
          console.error(
            "Service Worker: Fetch failed for static asset:",
            error
          );
          // You could serve an offline page here if needed
          // For this simple app, we'll just let the fetch fail.
        });
      })
    );
  }
});
