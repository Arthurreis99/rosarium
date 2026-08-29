const CACHE = "rosarium-v4.0.0-r2";
const APP_SHELL = [
  "./", "./index.html", "./styles/app.css", "./scripts/app.js", "./scripts/data.js", "./scripts/agenda.js",
  "./scripts/agenda-store.js", "./scripts/agenda-native.js", "./manifest.webmanifest",
  "./assets/brand/rosarium-mark.png", "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
  "./assets/fonts/eb-garamond-400.woff2", "./assets/fonts/eb-garamond-500.woff2",
  "./assets/fonts/eb-garamond-400-italic.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
