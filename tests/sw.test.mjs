// sw.test.mjs — the real service worker, driven interception-free.
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
//
// app.test.mjs blocks sw.js because Playwright's route() interception and
// worker-controlled pages don't mix reliably. The worker still needs coverage — the
// update toast, the X-From-Cache offline contract and cache survival had none, and
// two shipped bugs (the 404-mid-deploy sample-set swap, the two-tap toast) lived
// exactly there. So this suite uses NO route() calls at all: the tests' own server
// plays the network, and the worker sees real fetches, real failures, real ETags —
// ETags matter because they're how the worker decides the shell changed.
//
// The three states exercised, in order (the worker's caches persist across tests):
//   1. network gone entirely (setOffline)     -> cached prices, offline footer
//   2. server up but erroring (503 mid-deploy) -> cached prices, offline footer
//   3. shell changed on the server             -> toast; one tap serves the NEW page

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const ORIGIN = { lat: 52.95, lng: -1.15 };
const at = (miN, miE) => ({ lat: ORIGIN.lat + miN / 69, lng: ORIGIN.lng + miE / 41.6 });
// o:1 (24/7) everywhere — this suite pins no clock, and opening hours are app.test's job.
const STATIONS = [
  { brand: "FuelCo", name: "ALPHA", postcode: "NG1 1AA", ...at(0.5, 0), prices: { E10: 140.0 }, o: 1 },
  { brand: "FuelCo", name: "BRAVO", postcode: "NG1 1AB", ...at(1, 0.2), prices: { E10: 142.0 }, o: 1 },
  { brand: "FuelCo", name: "CHARLIE", postcode: "NG1 1AC", ...at(2, -0.3), prices: { E10: 145.0 }, o: 1 },
];
const PRICES_JSON = JSON.stringify({
  generated_at: new Date().toISOString(), count: STATIONS.length, stations: STATIONS,
});

let server, base, browser, context, page;
// Mutable server state, flipped by the tests: a 503 on the prices (a deploy mid-swap),
// and a suffix that changes the shell (and with it, its ETag). htmlHits counts shell
// requests reaching the server, so a test can wait for a background revalidation to
// have completed before asserting that no toast followed it.
let pricesDown = false;
let htmlSuffix = "";
let htmlHits = 0;

before(async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const swjs = await readFile(new URL("../sw.js", import.meta.url));
  const icon = await readFile(new URL("../icon-192.png", import.meta.url));
  const manifest = await readFile(new URL("../manifest.json", import.meta.url));

  server = createServer((req, res) => {
    const p = req.url.split("?")[0];
    const send = (type, body, status = 200) => {
      const buf = Buffer.from(body);
      res.writeHead(status, {
        "Content-Type": type,
        "Content-Length": buf.length,
        // The worker's versionOf() reads this to detect a changed shell.
        "ETag": '"' + createHash("sha1").update(buf).digest("hex").slice(0, 16) + '"',
      });
      res.end(buf);
    };
    if (p === "/" || p === "/index.html") { htmlHits++; return send("text/html; charset=utf-8", html + htmlSuffix); }
    if (p === "/sw.js") return send("text/javascript", swjs);
    if (p === "/data/prices.json") {
      if (pricesDown) { res.writeHead(503); return res.end("mid-deploy"); }
      return send("application/json", PRICES_JSON);
    }
    if (p === "/icon-192.png") return send("image/png", icon);
    if (p === "/manifest.json") return send("application/json", manifest);
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/London",
    geolocation: { latitude: ORIGIN.lat, longitude: ORIGIN.lng },
    permissions: ["geolocation"],
  });
  // These tests run un-intercepted against the real index.html, whose BEACON is the
  // real Worker URL — stub sendBeacon or every test run would write rows into the
  // production search tally. (Today's only search here runs offline, but that's
  // luck, not a guarantee.)
  await context.addInitScript(() => { navigator.sendBeacon = () => true; });
  page = await context.newPage();

  // Prime: one fully-online load. /index.html deliberately — the worker must serve it
  // later from the single "./" cache key. skipWaiting + clients.claim mean waiting for
  // a controller is enough; no second navigation needed before priming.
  await page.goto(base + "/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null,
    null, { timeout: 15000 });
  // The page's own first price fetch ran before the worker took control, so it never
  // touched the DATA cache — route one through the worker and wait for it to land.
  await page.evaluate(() => fetch("data/prices.json", { cache: "no-cache" }).then(r => r.status));
  await page.waitForFunction(async () =>
    !!(await (await caches.open("data")).match("data/prices.json", { ignoreSearch: true })),
    null, { timeout: 15000 });
});

after(async () => {
  await browser?.close();
  server?.close();
});

const freshness = () => page.evaluate(() => document.getElementById("freshness").textContent);

test("offline: the shell and the last prices are served from cache, and a search works", async () => {
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "load" });
    // networkFirst fell back and set X-From-Cache, so the footer says offline — not stale.
    await page.waitForFunction(() =>
      document.getElementById("freshness").textContent.startsWith("Offline · prices from"),
      null, { timeout: 15000 });
    // A search still works: geolocation needs no network, and OSRM being unreachable
    // must degrade to straight-line estimates, not to an error.
    await page.locator("#useGps").click();
    await page.waitForFunction(() => document.querySelectorAll("#results .station").length > 0,
      null, { timeout: 15000 });
    const state = await page.evaluate(() => ({
      rows: document.querySelectorAll("#results .station").length,
      // the sample-data note renders into #msg; the string also sits in the app's own
      // inline script, so body.textContent would always contain it
      sample: document.getElementById("msg").textContent.includes("sample"),
      firstMeta: document.querySelector("#results .station .meta").textContent,
    }));
    assert.equal(state.rows, STATIONS.length, "the real cached stations, all of them");
    assert.equal(state.sample, false, "never the sample set while real prices are cached");
    assert.doesNotMatch(state.firstMeta, /min/, "estimated distances carry no invented minutes");
  } finally {
    await context.setOffline(false);      // the remaining tests need the server back
  }
});

test("an HTTP error on the prices falls back to cached prices, not the sample set", async () => {
  pricesDown = true;                       // 503, as during the ~24 deploys a day
  try {
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() =>
      document.getElementById("freshness").textContent.startsWith("Offline · prices from"),
      null, { timeout: 15000 });
    // With the sample set loaded, generated_at is "sample" and the footer goes BLANK —
    // so the Offline wording above is itself proof the real cached prices survived.
    assert.match(await freshness(), /^Offline · prices from/);
    assert.equal(await page.evaluate(() =>
      document.getElementById("msg").textContent.includes("sample")), false,
      "a routine mid-deploy 503 must never swap in the 8-station sample");
  } finally {
    pricesDown = false;
  }
});

test("a changed shell raises the update toast, and ONE tap serves the new page", async () => {
  await page.reload({ waitUntil: "load" });        // settle the cache on the current shell
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null,
    null, { timeout: 15000 });
  htmlSuffix = "\n<!-- deployed: a newer shell -->";
  // The foreground-resume nudge, verbatim: fetch "./" — the worker's one page key —
  // compare ETags, and tell the page. Before the keys were unified this could compare
  // against the copy navigations never refreshed and toast twice (or serve the old page).
  await page.evaluate(() => fetch("./", { cache: "no-cache" }));
  await page.waitForSelector("#updateToast", { timeout: 15000 });
  assert.equal(await page.evaluate(() => document.getElementById("updateToast").textContent),
    "App updated — tap to refresh");

  // The toast's promise is that ONE tap loads the new version. The two-key worker also
  // raised the toast — its bug was the tap: the reload hit the copy the nudge never
  // refreshed, served the OLD page, and toasted again. So the toast assertions above
  // can't regress that bug; the two below are the ones that fail on it.
  const hitsBeforeTap = htmlHits;
  const loaded = page.waitForNavigation({ waitUntil: "load", timeout: 15000 });
  await page.locator("#updateToast").click();
  await loaded;
  // The suffix survives parsing as a comment node (the parser folds trailing content
  // into <body>), so the serialized DOM says which shell was served.
  assert.match(await page.content(), /a newer shell/,
    "the tap must serve the already-cached NEW page, not the old copy");
  // No second toast: the reload's own background revalidation fetches the same shell
  // the cache now holds, so the ETags match and no message is sent. Wait for that
  // revalidation to reach the server before declaring the toast absent.
  await new Promise((resolve, reject) => {
    const gaveUp = setTimeout(() => { clearInterval(poll); reject(new Error("no revalidation fetch")); }, 15000);
    const poll = setInterval(() => {
      if (htmlHits > hitsBeforeTap) { clearTimeout(gaveUp); clearInterval(poll); resolve(); }
    }, 50);
  });
  await page.waitForTimeout(500);                  // the postMessage, had one been sent
  assert.equal(await page.evaluate(() => !!document.getElementById("updateToast")), false,
    "an up-to-date page must not toast again — the two-tap bug, verbatim");
});
