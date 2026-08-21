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
// VERSION only needs bumping to force the old SHELL out — e.g. if the precache list
// or these strategies change. Ordinary edits to index.html propagate on their own via
// stale-while-revalidate, so day-to-day changes need nothing here. The DATA cache is
// deliberately outside the versioning: a bump must never cost a user their cached
// prices — they may be the only copy an offline user has.

const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const DATA = "data";
// "./" only — the page lives under one canonical key; see PAGE_KEY below.
const SHELL_FILES = ["./", "./icon-192.png", "./manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL)
      // Individually, so one 404 can't abandon the whole install.
      .then(c => Promise.all(SHELL_FILES.map(f => c.add(new Request(f, {cache: "reload"})).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // The data cache used to be versioned (data-v1), so the sweep below deleted the
    // cached prices on every bump — an offline user upgrading got the sample set.
    // Carry any old entries across before sweeping, never over newer ones.
    const legacy = names.filter(n => n !== DATA && n.startsWith("data-"));
    if (legacy.length) {
      const dst = await caches.open(DATA);
      for (const name of legacy) {
        const src = await caches.open(name);
        for (const req of await src.keys()) {
          if (await dst.match(req)) continue;
          const res = await src.match(req);
          if (res) await dst.put(req, res);
        }
      }
    }
    await Promise.all(names.filter(n => n !== SHELL && n !== DATA).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Rebuilds the cached copy with X-From-Cache set, so the page knows these prices came
// from cache because the network couldn't answer, rather than leaving it to infer
// that. navigator.onLine only reports whether an interface is up — it stays true when
// you're connected to a cell that carries no data, or when the server itself is down,
// so it can't answer this question. Undefined when nothing is cached.
async function fromCache(cache, request) {
  const cached = await cache.match(request, {ignoreSearch: true});
  if (!cached) return undefined;
  const headers = new Headers(cached.headers);
  headers.set("X-From-Cache", "1");
  return new Response(await cached.blob(),
    {status: cached.status, statusText: cached.statusText, headers});
}

// Network-first: try the network, cache whatever comes back, fall back to the last
// good copy — on a thrown fetch AND on an HTTP error. A 404/503 mid-deploy is routine
// (~24 deploys a day), and returning it while good prices sit cached would hand a
// returning user the sample set. The error response only escapes when there's nothing
// cached either, so the app's own error handling can take over.
async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) { cache.put(request, fresh.clone()); return fresh; }
    return (await fromCache(cache, request)) || fresh;
  } catch {
    return (await fromCache(cache, request)) || Response.error();
  }
}

// Stale-while-revalidate: answer from cache now, refresh in the background. When the
// refresh brings back a DIFFERENT page than the one just served, tell the open tabs —
// otherwise nobody ever learns the app updated: the shell is one load behind by design,
// and an iOS home-screen app resumes from memory without loading at all, so a user can
// sit on an old version indefinitely and report already-fixed bugs (it happened).
// "/" and "/index.html" are the same page. Cached under both keys, navigations and the
// resume nudge refreshed disjoint copies — so the update toast could serve the OLD
// page and reappear, needing two taps in exactly the iOS home-screen case it was built
// for. Every page request is cached under this one canonical key instead.
const PAGE_KEY = new URL("./", self.location).href;
// Exactly the scope root, nothing looser: matching any pathname ending in "/" or
// "/index.html" would answer every in-scope directory URL with the shell at the wrong
// base URL (its relative data/prices.json fetch 404s into the sample set), and would
// let any future same-origin page at /foo/ be cached OVER the shell under PAGE_KEY.
const isPage = url => {
  const u = new URL(url);
  return u.origin + u.pathname.replace(/index\.html$/, "") === PAGE_KEY;
};
function versionOf(res) {
  return res.headers.get("etag") || res.headers.get("last-modified") ||
         res.headers.get("content-length") || "";
}
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const key = isPage(request.url) ? PAGE_KEY : request;
  const hit = await cache.match(key, {ignoreSearch: true});
  const update = fetch(request)
    .then(async res => {
      if (res && res.ok) {
        const changed = hit && isPage(request.url) && versionOf(res) !== versionOf(hit);
        await cache.put(key, res.clone());
        if (changed) {
          const clients = await self.clients.matchAll({type: "window"});
          for (const c of clients) c.postMessage({type: "shell-updated"});
        }
      }
      return res;
    })
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
