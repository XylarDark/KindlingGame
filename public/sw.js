/* Kindling installability + update shell.
 * Navigations bypass HTTP cache so GitHub Pages HTML cannot stick.
 * Non-document GETs are not intercepted — a blanket network-first respondWith put
 * every asset on the SW hop and made play choppy after the update work landed.
 * Do not skipWaiting on install — a mid-shift replace would reload under the player.
 * The page posts kindling-skip-waiting only while idle (title / shift ended).
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
  if (!navigate) return;
  event.respondWith(fetch(req, { cache: "no-store" }).catch(() => caches.match(req)));
});
