// workers/old-domain-rescue.js
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
//
// Rescues installed copies of the app still running from the OLD address,
// fuel.thomasainsworth.co.uk. The 301 that moves everyone to whichpump.co.uk is right
// for links and bookmarks, but it traps a service-worker shell (seen on a real phone,
// 8 Sep 2026: old URL bar, ten-day-old copy, Nottingham SAMPLE prices for a Sandy
// postcode, "No forecourts within that radius"):
//
//   - the browser's check for a new sw.js gets a 301, and a service-worker script is
//     not allowed to redirect, so the update fails and the old worker lives forever;
//   - the old worker's background refresh of the page gets the same 301, isn't "ok",
//     and is dropped — the cached shell never changes;
//   - the page's same-origin fetch of data/prices.json is redirected cross-origin,
//     which is a network error, so the app falls back to the 8-station sample set.
//
// Two routes on the old hostname fix both halves; everything else keeps redirecting.
//
//   /sw.js             → a kill-switch worker: on activate it deletes every cache,
//                        unregisters itself and sends every open tab to whichpump.co.uk.
//                        One visit to the old shell is enough to cure it.
//   /data/prices.json  → proxied from https://whichpump.co.uk/data/prices.json, so a
//                        shell that hasn't picked up the kill switch yet (an iOS
//                        home-screen app resumed from memory) still gets REAL prices
//                        on its very next search instead of the sample set.
//
// Deploy (Tom, ~6 min):
//   1. Cloudflare dashboard → Workers & Pages → Create → paste this file → Deploy.
//   2. The Worker → Settings → Domains & Routes → Add → Route, zone
//      thomasainsworth.co.uk, twice:
//        fuel.thomasainsworth.co.uk/sw.js
//        fuel.thomasainsworth.co.uk/data/prices.json
//   3. Redirect rules run BEFORE Workers, so the existing rule must skip those two
//      paths or the Worker never sees them. Zone thomasainsworth.co.uk → Rules →
//      Redirect Rules → edit the fuel rule → "Edit expression":
//        (http.host eq "fuel.thomasainsworth.co.uk" and
//         not http.request.uri.path in {"/sw.js" "/data/prices.json"})
//      Keep the action exactly as it is (301 → https://whichpump.co.uk${path}${query}).
//   4. Verify from a terminal:
//        curl -sI https://fuel.thomasainsworth.co.uk/sw.js | head -1            → 200
//        curl -sI https://fuel.thomasainsworth.co.uk/data/prices.json | head -1 → 200
//        curl -sI https://fuel.thomasainsworth.co.uk/ | head -1                 → 301
//      then open the old URL on the phone from the screenshots: it should land on
//      whichpump.co.uk by itself within a second or two.
//
// Leave it deployed for as long as the old domain redirects. It costs nothing idle.

const NEW_ORIGIN = "https://whichpump.co.uk";

// Served as the old origin's sw.js. Plain ES5-ish on purpose: it has to run on the
// oldest browser that ever installed the app. No fetch handler at all — nothing is
// intercepted, so the reload below reaches the network and follows the 301.
const KILL_SWITCH = `// Fill-Up moved to https://whichpump.co.uk — this worker only clears the old install.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    try { var keys = await caches.keys(); for (var i = 0; i < keys.length; i++) await caches.delete(keys[i]); } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    var clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (var j = 0; j < clients.length; j++) {
      try {
        var u = new URL(clients[j].url);
        await clients[j].navigate("${NEW_ORIGIN}" + u.pathname + u.search);
      } catch (e) {}
    }
  })());
});
`;

export function redirectTarget(url) {
  const u = new URL(url);
  return NEW_ORIGIN + u.pathname + u.search;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (url.pathname === "/sw.js") {
      return new Response(KILL_SWITCH, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          // Browsers already bypass the HTTP cache for worker scripts; this keeps any
          // intermediary honest too. The script never changes, but nor must it linger.
          "Cache-Control": "no-cache",
        },
      });
    }
    if (url.pathname === "/data/prices.json") {
      // Same method, same conditional headers (If-None-Match → 304s still work), new
      // host. The upstream answer goes back unchanged: the old shell's worker sees an
      // ordinary same-origin 200 and caches it exactly as it always did.
      const upstream = new Request(NEW_ORIGIN + url.pathname + url.search, request);
      return fetch(upstream);
    }
    // Belt and braces: the redirect rule normally answers everything else, but if a
    // route is ever drawn wider than the two paths above, behave like the rule does.
    return Response.redirect(redirectTarget(request.url), 301);
  },
};

export { KILL_SWITCH };
