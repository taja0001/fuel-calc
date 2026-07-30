// sw.js — makes the app open instantly and keep working with no signal.
// Copyright (c) 2026 Thomas Ainsworth. All rights reserved — see LICENSE.
//
// Two different jobs, so two different strategies:
//
//   The shell (index.html, icon, manifest) — stale-while-revalidate. Served from cache
//   immediately, then refreshed in the background for next time. The shell changes
//   rarely and a one-load delay in picking up a new version is a fair trade for
//   opening with no network round-trip at all.
//
//   The prices (data/prices.json) — network-first, falling back to cache. Fuel prices
//   move hourly; serving them cache-first would mean confidently quoting yesterday's.
//   So always try the network, and only reach for the cached copy when that fails.
//   The app already warns when prices are stale, so a fallback explains itself.
//
// Cross-origin requests (postcodes.io, OSRM, the analytics beacon) are left alone.
// Caching a route or a postcode lookup would mean replaying the wrong answer.
//
// VERSION only needs bumping to force old caches out — e.g. if the precache list or
// these strategies change. Ordinary edits to index.html propagate on their own via
// stale-while-revalidate, so day-to-day changes need nothing here.

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const SHELL_FILES = ["./", "./index.html", "./icon-192.png", "./manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL)
      // Individually, so one 404 can't abandon the whole install.
      .then(c => Promise.all(SHELL_FILES.map(f => c.add(new Request(f, {cache: "reload"})).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== SHELL && n !== DATA).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Network-first: try the network, cache whatever comes back, fall back to the last
// good copy. Returns undefined if there's nothing cached either, so the caller can
// let the app's own error handling take over.
async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request, {ignoreSearch: true});
    if (!cached) return Response.error();
    // Tell the page these prices came from cache because the network refused, rather
    // than leaving it to infer that. navigator.onLine only reports whether an
    // interface is up — it stays true when you're connected to a cell that carries no
    // data, or when the server itself is down, so it can't answer this question.
    const headers = new Headers(cached.headers);
    headers.set("X-From-Cache", "1");
    return new Response(await cached.blob(),
      {status: cached.status, statusText: cached.statusText, headers});
  }
}

// Stale-while-revalidate: answer from cache now, refresh in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request, {ignoreSearch: true});
  const update = fetch(request)
    .then(res => { if (res && res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => undefined);
  return hit || (await update) || Response.error();
}

self.addEventListener("fetch", event => {
  const {request} = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // postcodes.io, OSRM, analytics

  if (url.pathname.endsWith("/data/prices.json")) {
    event.respondWith(networkFirst(request));
    return;
  }
  // Everything else same-origin is shell: the page itself, the icon, the manifest.
  event.respondWith(staleWhileRevalidate(request));
});
