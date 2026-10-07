// Offline shell. The app opens without a connection and shows what is saved on the device
// (scans, profile): analyzing a photo still needs the network, and says so.
//
// - Pages: network first, so an update is never held back; the last good home page is the
//   fallback when offline.
// - Hashed build files and icons: cache first (their URL changes when they do).
// - /api/*: never touched, never cached: an answer holds somebody's scan.
const VERSION = "1";
const PAGES = `fa-pages-${VERSION}`;
const ASSETS = `fa-assets-${VERSION}`;

self.addEventListener("install", (event) => {
  // best effort: have the home page ready before the first offline visit
  event.waitUntil(
    (async () => {
      try {
        await (await caches.open(PAGES)).add(new Request("/", { cache: "reload" }));
      } catch {
        // offline during install: the first online visit fills it
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("fa-") && name !== PAGES && name !== ASSETS) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

const isAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest" || /\.(?:woff2?|png|svg|ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && url.pathname === "/") (await caches.open(PAGES)).put("/", response.clone());
          return response;
        } catch {
          return (await caches.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) (await caches.open(ASSETS)).put(request, response.clone());
        return response;
      })(),
    );
  }
});

// a reminder tapped on opens the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (open[0]) return open[0].focus();
      return self.clients.openWindow("/");
    })(),
  );
});
