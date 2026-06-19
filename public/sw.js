const CACHE = "arizona-static-v18";
const STATIC = [
  "/style.css?v=28",
  "/ui.js?v=10",
  "/auth.js?v=3",
  "/fonts.css?v=3",
  "/img/logo.png",
  "/img/noavatar.png"
];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC).catch(() => {
  })));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(
      (keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.endsWith(".html") || url.pathname === "/") return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
