/* Kindling installability + update shell.
 * Network-first. Navigations bypass HTTP cache so GitHub Pages HTML cannot stick.
 * Do not skipWaiting here — a mid-shift replace would reload the game under the player.
 * The page posts kindling-skip-waiting after it has checked for a waiting worker.
 */
self.addEventListener("install", () => {
  /* waiting is intentional until the page asks, or every client has closed */
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data === "kindling-skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const navigate = req.mode === "navigate" || req.destination === "document";
  const init = navigate ? { cache: "no-store" } : undefined;
  event.respondWith(fetch(req, init).catch(() => caches.match(req)));
});
