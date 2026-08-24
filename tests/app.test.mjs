// app.test.mjs — the real app, driven in a real browser.
// Copyright (c) 2026 Thomas Ainsworth. All rights reserved — see LICENSE.
//
// Serves the actual index.html against a synthetic prices.json built around a known
// origin, with the external services mocked at the network layer and the clock pinned
// to 23:15 — so every assertion is deterministic: no live prices, no OSRM weather, no
// "works after dark only". Each scenario here regressed or nearly regressed once:
//
//   - a closed forecourt with the lowest total must never take the top spot
//   - the shut partition, grey styling and "opens" pill
//   - the price-age badge
//   - "Kirkby Motors" staying its own brand (substring matching folded it into Moto)
//   - the slider's eighths reaching the maths (parseInt truncated them)
//   - a failed refresh keeping real data (it replaced 7,976 stations with 8 samples)
//
// The service worker is deliberately blocked: Playwright's request interception and
// SW-controlled pages don't mix reliably, and SW-less is also the app's worst case.
// The worker itself — offline fallback, the update toast — is covered by sw.test.mjs,
// which runs interception-free for exactly that reason.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------------
// Fixture: seven forecourts around a fixed origin, one of each interesting kind.
const ORIGIN = { lat: 52.95, lng: -1.15 };
const FIXED = new Date("2026-07-30T22:15:00Z").getTime();   // 23:15 BST
const MIN = ms => Math.round(ms / 60000);
const at = (miN, miE) => ({ lat: ORIGIN.lat + miN / 69, lng: ORIGIN.lng + miE / 41.6 });
const DAY_HOURS = Array(7).fill([360, 1320]);                // 06:00-22:00: shut at 23:15

const S = (name, brand, pos, price, extra = {}) => ({
  brand, name, postcode: "NG1 1AA", lat: pos.lat, lng: pos.lng,
  prices: { E10: price, B7: price + 12 }, o: 1, pu: MIN(FIXED) - 60, ...extra,
});
const STATIONS = [
  // CHEAP FAR wins on total but its price is 15 days STALE — and SUPERSTORE, the
  // fresh-priced runner-up, sits £0.57 behind: inside the plausible-drift window, so
  // the doubt arbitration notice must fire. (142.5, not lower: CHEAP FAR must stay
  // the winner on B7 too — the fuel-switch tests pin its 152.0p diesel figure.)
  // SUPERSTORE also fell 1p an hour ago to
  // its week low ([delta] with no "over"); DEAR NEAR rose 2p two days back —
  // 2026-07-28 was a Tuesday, so its badge must say so. SUPERSTORE and STALE carry
  // feed-style names to pin the caser: suffix stripped, apostrophe intact.
  S("CHEAP FAR", "FuelCo", at(3, 0), 140.0, { pu: MIN(FIXED) - 15 * 1440 }),
  S("DEAR NEAR", "NearGarage", at(0.5, 0), 155.9,
    { pu: MIN(FIXED) - 2 * 1440, hist: { E10: [2, 3] } }),
  S("NIGHT OFF", "NightOff", at(0.6, 0.1), 139.0, { o: DAY_HOURS }),  // cheapest total, but shut
  S("VILLAGE", "Kirkby Motors", at(1, -0.2), 150.0),
  S("STALE CORNER'S", "OldPrice", at(1.2, 0.3), 149.0, { pu: MIN(FIXED) - 30 * 1440 }),
  S("SUPERSTORE - PETROL FILLING STATION", "TESCO", at(2, 0.2), 142.5, { sm: 1, hist: { E10: [-1] } }),
  S("SERVICES", "Moto", at(2.5, -0.3), 152.0, { mw: 1 }),
];
// B7 dips on one mid-series day ON PURPOSE: the trend chart normalises each series to
// its own min/max, so two straight lines with the same slope render byte-identical
// polylines — without the dip, "the chart now plots the B7 series" would be untestable
// geometry. The endpoints (160.5 / 178.5) must not change; assertions pin them.
const INDEX_JSON = JSON.stringify({ days: Array.from({ length: 26 }, (_, i) => ({
  d: new Date(FIXED - (25 - i) * 86400e3).toISOString().slice(0, 10),
  E10: 158 + i * 0.1, B7: 176 + i * 0.1 - (i === 12 ? 1.5 : 0), n: 8000 })) });
const PRICES_JSON = JSON.stringify({
  generated_at: new Date(FIXED - 30 * 60000).toISOString(),
  count: STATIONS.length, stations: STATIONS,
});

// The OSRM mock computes road distance from the coordinates actually in the request —
// haversine × 1.35, duration 2.4 min/mile — so tests can predict every figure the app
// will show using the same arithmetic.
const ROAD = 1.35, MIN_PER_MI = 2.4;
function haversineMi(a, b) {
  const R = 3958.8, toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function osrmTable(url) {
  const u = new URL(url);
  const coords = u.pathname.split("/").pop().split(";")
    .map(p => { const [lng, lat] = p.split(",").map(Number); return { lat, lng }; });
  // near-me uses sources=0 over all coords; journey names sources AND destinations
  const idx = s => (u.searchParams.get(s) || "").split(";").filter(x => x !== "").map(Number);
  const srcs = idx("sources").length ? idx("sources") : [0];
  const dsts = idx("destinations").length ? idx("destinations") : coords.map((_, i) => i);
  const distances = srcs.map(s => dsts.map(d => haversineMi(coords[s], coords[d]) * ROAD * 1609.344));
  const durations = srcs.map(s => dsts.map(d => haversineMi(coords[s], coords[d]) * ROAD * MIN_PER_MI * 60));
  return JSON.stringify({ code: "Ok", distances, durations });
}
// journey route: a straight line, enough points for the app to resample
function osrmRoute(url) {
  const [a, b] = new URL(url).pathname.split("/").pop().split(";")
    .map(p => { const [lng, lat] = p.split(",").map(Number); return { lat, lng }; });
  const n = 40, coordinates = [];
  for (let i = 0; i <= n; i++)
    coordinates.push([a.lng + (b.lng - a.lng) * i / n, a.lat + (b.lat - a.lat) * i / n]);
  return JSON.stringify({ code: "Ok", routes: [{ distance: haversineMi(a, b) * 1609.344,
    geometry: { type: "LineString", coordinates } }] });
}
const DEST = { lat: ORIGIN.lat + 20 / 69, lng: ORIGIN.lng };   // 20 mi due north

// ---------------------------------------------------------------------------------
let server, base, browser, page;

before(async () => {
  // Point the search counter at a test host so the privacy tests can watch what it
  // sends — navigator.sendBeacon is stubbed below, so nothing ever leaves the page.
  const html = (await readFile(new URL("../index.html", import.meta.url), "utf8"))
    .replace(/const BEACON = "[^"]*"/, 'const BEACON = "https://counter.test/c"');
  const icon = await readFile(new URL("../icon-192.png", import.meta.url));
  const manifest = await readFile(new URL("../manifest.json", import.meta.url));
  server = createServer((req, res) => {
    const p = req.url.split("?")[0];
    const send = (t, b) => { res.writeHead(200, { "Content-Type": t }); res.end(b); };
    if (p === "/" || p === "/index.html") return send("text/html; charset=utf-8", html);
    if (p === "/data/prices.json") return send("application/json", PRICES_JSON);
    if (p === "/data/index.json") return send("application/json", INDEX_JSON);
    if (p === "/icon-192.png") return send("image/png", icon);
    if (p === "/manifest.json") return send("application/json", manifest);
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/London",
    geolocation: { latitude: ORIGIN.lat, longitude: ORIGIN.lng },
    permissions: ["geolocation"],
  });
  await context.addInitScript(() => {
    window.__beacons = [];
    navigator.sendBeacon = (url, body) => { window.__beacons.push(String(body)); return true; };
  });
  await context.route("**/sw.js", r => r.abort());          // see header comment
  // "ZZ9 ..." geocodes to 20 mi north; anything else to the origin — enough to plan
  // a journey between two distinct places. Two place names for the same reason:
  // "Northtown" sits at the destination, anything else at the origin.
  await context.route("**/api.postcodes.io/**", r => {
    const url = r.request().url();
    if (url.includes("/places")) {
      const north = /northtown/i.test(new URL(url).searchParams.get("q") || "");
      return r.fulfill({ contentType: "application/json",
        body: JSON.stringify({ result: [{
          latitude: north ? DEST.lat : ORIGIN.lat, longitude: north ? DEST.lng : ORIGIN.lng,
          name_1: north ? "Northtown" : "Testville", county_unitary: "Testshire" }] }) });
    }
    // admin_district is what the real endpoint returns and what the app keeps as the
    // district name, so an end of a journey can be named in words ("round Northshire")
    // rather than by postcode. Distinct per end so a test can tell which one was picked.
    const north = url.includes("ZZ9");
    const p = north ? DEST : ORIGIN;
    return r.fulfill({ contentType: "application/json",
      body: JSON.stringify({ result: { latitude: p.lat, longitude: p.lng, postcode: "X",
        admin_district: north ? "Northshire" : "Testville" } }) });
  });
  await context.route("**/router.project-osrm.org/table/**", r =>
    r.fulfill({ contentType: "application/json", body: osrmTable(r.request().url()) }));
  await context.route("**/router.project-osrm.org/route/**", r =>
    r.fulfill({ contentType: "application/json", body: osrmRoute(r.request().url()) }));

  page = await context.newPage();
  await page.clock.setFixedTime(FIXED);
  await page.goto(base + "/index.html", { waitUntil: "load" });
  await page.locator("#useGps").click();
  await page.locator("#search").click();
  await page.waitForFunction(() => document.querySelectorAll("#results .station").length > 0,
    null, { timeout: 15000 });
});

after(async () => {
  await browser?.close();
  server?.close();
});

const rows = () => page.evaluate(() =>
  [...document.querySelectorAll("#results .station")].map(el => ({
    name: el.querySelector(".brand").textContent,
    shut: el.classList.contains("shut"),
    opacity: getComputedStyle(el).opacity,
    pills: [...el.querySelectorAll(".pill")].map(p => p.textContent.trim()),
    total: parseFloat(el.querySelector(".st-cost .total").textContent.replace("£", "")),
    meta: el.querySelector(".meta").textContent,
  })));

test("ranks by true cost: the cheap-but-far forecourt beats the dear-but-near one", async () => {
  const r = await rows();
  assert.equal(r.length, STATIONS.length, "every fixture station listed");
  assert.match(r[0].name, /cheap far/i, "best = cheapest total among OPEN forecourts");
  // predict its total with the same arithmetic the app uses (fill 37.5 L default car).
  // mpg is read from the page, not hardcoded: it is a product decision that has already
  // moved once (45 -> 46 with the car presets) and a literal here fails obscurely.
  const road = haversineMi(ORIGIN, STATIONS[0]) * ROAD;
  const mpg = await page.evaluate(() => parseFloat(document.getElementById("mpg").value));
  const expected = 37.5 * 1.40 + (road * 2) / mpg * 4.54609 * 1.40;
  assert.ok(Math.abs(r[0].total - expected) < 0.02, `${r[0].total} ≈ ${expected.toFixed(2)}`);
  assert.match(r[0].meta, /\d+ min/, "drive time shown when OSRM answered");
  const live = await page.evaluate(() => ({
    readout: document.querySelector(".readout").getAttribute("aria-live"),
    atomic: document.querySelector(".readout").getAttribute("aria-atomic"),
    msg: document.getElementById("msg").getAttribute("aria-live"),
  }));
  assert.deepEqual(live, { readout: "polite", atomic: "true", msg: "polite" },
    "results and errors must be announced to screen readers");
});

test("a closed forecourt with the lowest total never takes the top spot", async () => {
  const r = await rows();
  const shut = r.find(x => /night off/i.test(x.name));
  assert.ok(shut.shut, "tagged shut");
  assert.ok(shut.total < r[0].total, "it IS the cheapest — that's the trap");
  assert.equal(r.findIndex(x => x.shut) , r.filter(x => !x.shut).length, "all open rows rank above it");
  assert.match(shut.pills.join(" "), /Closed · opens/, "says when it opens");
  assert.equal(shut.opacity, "0.55", "greyed");
});

test("the savings line matches the arithmetic it claims", async () => {
  const r = await rows();
  const save = await page.evaluate(() => document.getElementById("bestSave").textContent);
  const open = r.filter(x => !x.shut);
  const nearest = open.reduce((a, b) =>
    parseFloat(a.meta.match(/([\d.]+) mi/)[1]) < parseFloat(b.meta.match(/([\d.]+) mi/)[1]) ? a : b);
  const expected = nearest.total - open[0].total;
  assert.match(save, /cheaper than your nearest/);
  assert.ok(Math.abs(parseFloat(save.replace("£", "")) - expected) < 0.02, `${save} ≈ £${expected.toFixed(2)}`);
});

test("a week's price moves are badged: risers dated, fallers marking the week low, steady quiet", async () => {
  const r = await rows();
  assert.match(r.find(x => /dear near/i.test(x.name)).pills.join(" "), /▲ up 2p since Tue/);
  const faller = r.find(x => /superstore/i.test(x.name)).pills.join(" ");
  assert.match(faller, /▼ down 1p today/);          // direction in words, never wraps
  assert.match(faller, /week low/i);                // its own short pill
  assert.doesNotMatch(r.find(x => /village/i.test(x.name)).pills.join(" "), /[▲▼]/);
});

test("the verdict carries the doubt: stale winner caveated in the panel and arbitrated", async () => {
  assert.match(await page.locator("#bestSub").textContent(), /37\.5 L of unleaded/,
    "the fuel is named where the numbers are");
  assert.match(await page.locator(".readout .pill.old").textContent(), /price 2 weeks old/i,
    "the winner's staleness reaches the headline, not just row 1");
  const notice = await page.locator("#results .notice").first().textContent();
  assert.match(notice, /last checked 2 weeks ago/i);
  assert.match(notice, /Tesco Superstore \(#2, £0\.5\d more\) was priced this week/);
});

test("feed names are calmed: suffix stripped, title-cased, apostrophes intact", async () => {
  const r = await rows();
  assert.equal(r.find(x => /superstore/i.test(x.name)).name, "Tesco Superstore");
  assert.equal(r.find(x => /stale corner/i.test(x.name)).name, "OldPrice Stale Corner's");
});

test("a month-old price is badged; motorway services are labelled", async () => {
  const r = await rows();
  assert.match(r.find(x => /stale corner/i.test(x.name)).pills.join(" "), /Price a month old/);
  assert.match(r.find(x => /services/i.test(x.name)).pills.join(" "), /Motorway services/);
});

test("brand grouping: Kirkby Motors is not Moto, and Tesco files under Supermarkets", async () => {
  const sections = await page.evaluate(() => {
    const out = []; let cur = null;
    for (const el of document.querySelectorAll("#results .sec-title, #results .brand-row")) {
      if (el.classList.contains("sec-title")) { cur = { title: el.textContent, brands: [] }; out.push(cur); }
      else cur.brands.push(el.querySelector(".bn").textContent.split(" · ")[0]);
    }
    return out;
  });
  const supers = sections.find(s => s.title === "Supermarkets");
  const fuels = sections.find(s => s.title === "Fuel brands");
  assert.ok(supers.brands.includes("Tesco"));
  assert.ok(fuels.brands.includes("Kirkby Motors"), "own brand, not folded into Moto");
  assert.ok(!fuels.brands.includes("Moto") || fuels.brands.includes("Kirkby Motors"));
});

test("slider eighths reach the maths: 62.5% means 18.8 L to fill", async () => {
  await page.evaluate(() => {
    const s = document.getElementById("levelSlider");
    s.value = "62.5"; s.dispatchEvent(new Event("input"));
  });
  await page.locator("#search").click();
  await page.waitForFunction(() =>
    document.getElementById("bestSub").textContent.startsWith("18.8 L"), null, { timeout: 15000 });
  assert.match(await page.evaluate(() => document.getElementById("levelOut").textContent),
    /62\.5% full/);
});

test("journey mode: the headline panel says what the whole trip costs", async () => {
  await page.locator('.mode-btn[data-mode="journey"]').click();
  await page.evaluate(() => {
    document.getElementById("startPc").value = "NG1 1AA";
    document.getElementById("destPc").value = "ZZ9 9ZZ";
  });
  await page.locator("#search").click();
  await page.waitForFunction(() =>
    document.getElementById("bestSave").textContent.startsWith("This journey"), null, { timeout: 15000 });
  const line = await page.evaluate(() => document.getElementById("bestSave").textContent);
  // 20 mi at the default mpg; best OPEN price en route is 140.0p (the 139.0p forecourt
  // is closed at the pinned 23:15 and must not set the quote). mpg read from the page —
  // see the note in the true-cost test.
  const mpg = await page.evaluate(() => parseFloat(document.getElementById("mpg").value));
  const litres = 20 / mpg * 4.54609;
  const cost = litres * 1.40;
  assert.match(line, /This journey will cost you about £/);
  assert.match(line, new RegExp(`20 mi · ${litres.toFixed(0)} L`));
  assert.ok(Math.abs(parseFloat(line.match(/£([\d.]+)/)[1]) - cost) < 0.03, `${line} ≈ £${cost.toFixed(2)}`);
});

test("journey mode announces a fuzzy destination match", async () => {
  // a place-name destination is the 300-miles-wrong trap ("Devon" -> Crook of Devon,
  // Perthshire) and must be announced, same as near-me announces its guesses
  await page.locator('.mode-btn[data-mode="journey"]').click();
  await page.evaluate(() => {
    document.getElementById("startPc").value = "NG1 1AA";
    document.getElementById("destPc").value = "Northtown";
  });
  await page.locator("#search").click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#results .notice")].some(n =>
      n.textContent.includes("Routing to")), null, { timeout: 15000 });
  const note = await page.evaluate(() =>
    [...document.querySelectorAll("#results .notice")].map(n => n.textContent).join(" "));
  assert.match(note, /Routing to Northtown, Testshire/,
    "a fuzzy destination must be announced, not silently trusted");
  assert.ok(await page.evaluate(() => document.querySelectorAll("#results .station").length) > 0,
    "the announcement rides with real results, not instead of them");
});

test("a town name geocodes, and the app says what it matched", async () => {
  await page.locator('.mode-btn[data-mode="near"]').click();
  await page.evaluate(() => { document.getElementById("postcode").value = "Testville"; });
  await page.locator("#search").click();
  // wait on the note itself — the previous test's rows are still on screen, so a
  // rows-exist wait passes before this search has even geocoded
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#results .notice")].some(n =>
      n.textContent.includes("Showing prices near")), null, { timeout: 15000 });
  const note = await page.evaluate(() =>
    [...document.querySelectorAll("#results .notice")].map(n => n.textContent).join(" "));
  assert.match(note, /Showing prices near Testville, Testshire/,
    "a fuzzy match must be announced, not silently trusted");
  assert.ok(await page.evaluate(() => document.querySelectorAll("#results .station").length) > 0);
  assert.match(await page.evaluate(() => document.getElementById("pcMatched").textContent),
    /≈ Testville, Testshire/, "the match shows under the input box itself");
});

test("changing fuel type re-runs the search without pressing the button", async () => {
  // back to near-me with results on screen (fixture B7 = E10 price + 12)
  await page.locator('.mode-btn[data-mode="near"]').click();
  await page.locator("#useGps").click();
  await page.locator("#search").click();
  await page.waitForFunction(() =>
    document.getElementById("bestSub").textContent.includes("@"), null, { timeout: 15000 });
  const before = await page.evaluate(() => document.getElementById("bestSub").textContent);
  await page.selectOption("#fuel", "B7");                 // fires the change event
  await page.waitForFunction(b =>
    document.getElementById("bestSub").textContent !== b, before, { timeout: 15000 });
  const after = await page.evaluate(() => document.getElementById("bestSub").textContent);
  // cheapest open E10 is 140.0; its B7 is 152.0 — the headline must now quote a B7 price
  assert.match(after, /@ 152\.0p/, "headline reprices to the diesel figure");
});

test("the search counter: a 📍 search says gps and nothing more; no beacon ever carries precision", async () => {
  const beacons = await page.evaluate(() => window.__beacons);
  assert.ok(beacons.length > 0, "the counter fired for the searches so far");
  assert.equal(beacons[0], "search,near,ok,gps");   // before()'s GPS search
  // The whole privacy contract (plans/search-counter.md): four allowlisted words,
  // area no finer than a district or a place name — sweep EVERY beacon any test fired.
  for (const b of beacons){
    assert.match(b, /^search,(near|journey),(ok|err),(gps|other|[A-Z]{1,2}\d[A-Z0-9]?|[a-z][a-z '-]{0,29})$/,
      `beacon out of contract: ${b}`);
    assert.doesNotMatch(b, /\d[A-Z]{2}\b/, `full postcode leaked: ${b}`);   // inward unit
    assert.doesNotMatch(b, /\d+\.\d+/, `coordinate leaked: ${b}`);
  }
});

test("the search counter: a typed postcode is cut to its district before it leaves", async () => {
  await page.locator('.mode-btn[data-mode="near"]').click();
  const prev = await page.evaluate(() => window.__beacons.length);
  await page.locator("#postcode").fill("NG1 5FS");
  await page.locator("#search").click();
  await page.waitForFunction(n => window.__beacons.length > n, prev, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__beacons.at(-1)), "search,near,ok,NG1");
});

test("a fuel switch landing MID-search still takes effect once the search finishes", async () => {
  // One search at a time is right — but the loser used to be dropped silently, so on a
  // slow connection changing fuel during a search looked like the switch was broken.
  // Hold OSRM open long enough that the E10->B7 change is guaranteed to land in flight.
  const pattern = "**/router.project-osrm.org/table/**";
  const slow = async r => {
    await new Promise(res => setTimeout(res, 800));
    r.fulfill({ contentType: "application/json", body: osrmTable(r.request().url()) });
  };
  await page.context().route(pattern, slow);      // registered last, so it wins
  try {
    await page.selectOption("#fuel", "E10");      // re-runs: results are on screen
    await page.selectOption("#fuel", "B7");       // lands while that run awaits OSRM
    await page.waitForFunction(() =>              // the in-flight E10 search paints first
      document.getElementById("bestSub").textContent.includes("@ 140.0p"), null, { timeout: 15000 });
    await page.waitForFunction(() =>              // then the queued B7 run replaces it
      document.getElementById("bestSub").textContent.includes("@ 152.0p"), null, { timeout: 15000 });
  } finally {
    await page.context().unroute(pattern, slow);
  }
});

test("returning visitors: honest empty readout, car folded to one line, button above the car card", async () => {
  // A fresh page in the same context: localStorage carries the car saved by the
  // fuel-switch tests, so this is the returning-visitor cold open.
  const p2 = await page.context().newPage();
  await p2.goto(base + "/index.html", { waitUntil: "load" });
  assert.equal((await p2.locator("#bestTotal").textContent()).trim(), "£--.--",
    "an instrument with no reading shows dashes, not £0.00");
  assert.equal(await p2.locator(".readout.empty").count(), 1);
  assert.ok(await p2.locator("#carSummary").isVisible(), "remembered car folds to a summary");
  assert.match(await p2.locator("#carSummaryText").textContent(), /mpg/);
  assert.ok(await p2.locator("#carDetails").isHidden(), "full controls hidden until Change");
  await p2.locator("#carChange").click();
  assert.ok(await p2.locator("#carDetails").isVisible(), "Change expands the controls");
  assert.ok(await p2.evaluate(() =>
    !!(document.getElementById("search").compareDocumentPosition(document.getElementById("mpg"))
       & Node.DOCUMENT_POSITION_FOLLOWING)),
    "the search button sits above the car card");
  // And the FIRST-visit case: no saved car -> full controls, no summary bar. This
  // exact state shipped broken once (display:flex beat the hidden attribute).
  await p2.evaluate(() => localStorage.clear());
  await p2.reload({ waitUntil: "load" });
  assert.ok(await p2.locator("#carSummary").isHidden(), "fresh visitors get no empty summary bar");
  assert.ok(await p2.locator("#carDetails").isVisible(), "fresh visitors get the full controls");
  await p2.close();
});

test("the price trend renders from the daily index, and follows the selected fuel", async () => {
  await page.waitForFunction(() => !document.getElementById("trend").hidden, null, { timeout: 10000 });
  // Fuel is set explicitly because earlier tests leave the select on B7 — the chart
  // following the select is the behaviour under test, so the start state can't be luck.
  await page.selectOption("#fuel", "E10");
  const grab = () => page.evaluate(() => ({
    label: document.getElementById("trendSvg").getAttribute("aria-label"),
    title: document.getElementById("trendTitle").textContent,
    points: document.querySelector("#trendSvg polyline").getAttribute("points"),
    tip: document.getElementById("trendTip").textContent,
    tableRows: document.querySelectorAll("#trendTable tr").length,
  }));
  const t = await grab();
  assert.match(t.label, /UK average unleaded/);
  assert.match(t.title, /UK average unleaded/);
  assert.match(t.label, /160\.5p per litre/, "ends at the fixture's last E10 value");
  assert.equal(t.points.split(" ").length, 26, "one point per fixture day");
  assert.match(t.tip, /160\.5p unleaded/, "rest state shows the latest day");
  assert.equal(t.tableRows, 27, "table view: header + 26 days");

  // A diesel driver gets the diesel series, not a ~20p-off unleaded line (9-critic
  // review finding). The fixture's B7 runs 176.0->178.5, distinct from E10's 158->160.5.
  await page.selectOption("#fuel", "B7");
  const d = await grab();
  assert.match(d.label, /UK average diesel/);
  assert.match(d.title, /UK average diesel/);
  assert.match(d.label, /178\.5p per litre/, "ends at the fixture's last B7 value");
  assert.notEqual(d.points, t.points, "the plotted line actually moved to the B7 series");
  assert.match(d.tip, /178\.5p diesel/, "tooltip still carries both series");
  assert.match(d.tip, /160\.5p unleaded/, "tooltip still carries both series");
});

test("a failed refresh keeps the real stations instead of swapping in sample data", async () => {
  await page.context().route("**/data/prices.json", r => r.abort());
  await page.clock.setFixedTime(FIXED + 10 * 60000);        // past the 5-minute throttle
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() =>
    document.getElementById("freshness").textContent.startsWith("Offline"), null, { timeout: 5000 });
  const state = await page.evaluate(() => ({
    sampleNote: document.getElementById("msg").textContent.includes("sample"),
    rows: document.querySelectorAll("#results .station").length,
  }));
  assert.equal(state.sampleNote, false, "no sample-data note");
  assert.ok(state.rows > 0, "results still on screen");
  await page.context().unroute("**/data/prices.json");
});

// --- car presets -------------------------------------------------------------------
// These run on their own pages with localStorage explicitly cleared: the
// returning-visitor test above clears it for the whole context, so neither a saved car
// nor the absence of one can be assumed by position in the file.
const freshPage = async () => {
  const p = await page.context().newPage();
  await p.goto(base + "/index.html", { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  return p;
};
const pressed = (p, name) => p.locator(`.seg[data-preset="${name}"]`).getAttribute("aria-pressed");

test("car presets: a tap fills both fields for real, and the chip lights only while they hold", async () => {
  const p = await freshPage();
  // The 46 mpg default is chosen so a first visit truthfully lights one chip — that is
  // what teaches the feature, so it is a behaviour, not a coincidence.
  assert.equal(await pressed(p, "hatch"), "true", "a first visit arrives on the family-hatchback figures");

  await p.locator('.seg[data-preset="big4x4"]').click();
  assert.deepEqual(await p.evaluate(() => ({
    mpg:  document.getElementById("mpg").value,
    tank: document.getElementById("tank").value,
    out:  document.getElementById("levelOut").textContent,
    said: document.getElementById("presetSaid").textContent,
  })), {
    mpg: "26", tank: "85",
    // 85 L tank at the default quarter full. The readout only moves if the tap
    // dispatched a real input event instead of just assigning .value — that write is
    // also what saves the car, so this one string covers both.
    out: "25% full · ~64 L to fill",
    said: "Filled in typical figures: 26 mpg, 85 litre tank.",
  });
  assert.equal(await pressed(p, "big4x4"), "true");
  assert.equal(await pressed(p, "hatch"), "false", "only the matching chip is lit");

  // Hand-editing the mpg un-lights it: the highlight is derived from the fields, so the
  // chips can never claim figures the car doesn't have.
  await p.locator("#mpg").fill("31");
  assert.equal(await pressed(p, "big4x4"), "false");
  await p.close();
});

test("car presets are fuel-adaptive, never rewrite the car, and survive a reload", async () => {
  const p = await freshPage();
  // One figure per chip would be ~20% out for a diesel driver, and in journey mode that
  // error moves which forecourts are reachable, not just the pennies.
  await p.selectOption("#fuel", "B7");
  await p.locator('.seg[data-preset="small"]').click();
  assert.equal(await p.locator("#mpg").inputValue(), "58", "the diesel variant, not the petrol one");

  // Changing fuel afterwards must not rewrite the numbers — no surprise field edits.
  // The chip going dark is the honest nudge that the figures no longer match.
  await p.selectOption("#fuel", "E10");
  assert.equal(await p.locator("#mpg").inputValue(), "58", "a fuel change never overwrites mpg");
  assert.equal(await pressed(p, "small"), "false");

  // The tap dispatched change, so the car persisted; on reload the chip re-derives from
  // the restored pair, compared against the restored fuel.
  await p.selectOption("#fuel", "B7");
  await p.reload({ waitUntil: "load" });
  assert.ok(await p.locator("#carSummary").isVisible(), "the tap saved a car to remember");
  await p.locator("#carChange").click();
  assert.equal(await pressed(p, "small"), "true", "a restored car re-lights its chip");

  // A hybrid has no diesel figure and a van no petrol one; the single figure serves both
  // fuels rather than the chip filling a blank.
  await p.locator('.seg[data-preset="hybrid"]').click();
  assert.equal(await p.locator("#mpg").inputValue(), "60", "hybrid fills its petrol figure on diesel");
  await p.selectOption("#fuel", "E10");
  await p.locator('.seg[data-preset="van"]').click();
  assert.equal(await p.locator("#mpg").inputValue(), "36", "van fills its diesel figure on petrol");

  await p.evaluate(() => localStorage.clear());
  await p.close();
});

// --- which end of the journey is cheaper -------------------------------------------
// These need a forecourt near the DESTINATION end of the route, which the shared
// fixture deliberately doesn't have (every station there sits within 3 miles of the
// origin, and the near-me radius test counts on that). So they serve their own prices
// for the duration and unroute afterwards, leaving the shared fixture untouched — see
// the load-bearing-fixture note in the file header.
const FAR_STATIONS = JSON.stringify({
  generated_at: new Date(FIXED - 30 * 60000).toISOString(),
  count: STATIONS.length + 1,
  stations: [...STATIONS, S("FAR END", "CheapCo", at(18.5, 0), 132.0)],
});
const withFarEnd = async fn => {
  const pattern = "**/data/prices.json";
  const serve = r => r.fulfill({ contentType: "application/json", body: FAR_STATIONS });
  await page.context().route(pattern, serve);                 // registered last, so it wins
  const p = await page.context().newPage();
  await p.clock.setFixedTime(FIXED);
  try {
    await p.goto(base + "/index.html", { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "load" });
    await fn(p);
  } finally {
    await p.close();
    await page.context().unroute(pattern, serve);
  }
};
const runJourney = async p => {
  await p.locator('.mode-btn[data-mode="journey"]').click();
  await p.evaluate(() => {
    document.getElementById("startPc").value = "NG1 1AA";
    document.getElementById("destPc").value = "ZZ9 9ZZ";
  });
  await p.locator("#search").click();
  await p.waitForFunction(() => document.querySelectorAll("#results .station").length > 0,
    null, { timeout: 15000 });
};

test("journey mode names which end of the trip is cheaper, and how far along each row sits", async () => {
  await withFarEnd(async p => {
    await runJourney(p);
    // Cheapest OPEN in the near band is CHEAP FAR at 140.0 (NIGHT OFF is 139.0 but shut
    // at the pinned 23:15, so it can't set the quote); the far band has FAR END at
    // 132.0. 8.0p across the default 37.5 L fill is £3.00 — over the £1 floor.
    const line = await p.locator("#bestEnds").textContent();
    assert.match(line, /Round Northshire/,
      "the cheaper end is named from admin_district, not by postcode");
    assert.match(line, /~8\.0p\/L cheaper/);
    assert.match(line, /£3\.00 on this fill/,
      "the saving is stated in money, capped by the litres actually bought");
    // The trip-cost line keeps its own slot: both are shown, neither replaces the other.
    assert.match(await p.locator("#bestSave").textContent(), /This journey will cost you about/);
    // Position along the route is what lets a reader see the pattern for themselves.
    const metas = await p.evaluate(() =>
      [...document.querySelectorAll("#results .station .meta")].map(m => m.textContent));
    // 1[89], not an exact figure: the station sits at 18.5 mi and the route is sampled
    // every half mile, so which side it rounds to is an implementation detail.
    assert.ok(metas.some(m => /1[89] mi in/.test(m)), `expected a far-end row: ${metas.join(" | ")}`);
    assert.ok(metas.some(m => /3 mi in|at the start/.test(m)), "and a near-end row");
    assert.ok(metas.every(m => /off route/.test(m)), "off-route distance is still there");
  });
});

test("journey mode sizes the splash when the tank can't reach the cheap end", async () => {
  await withFarEnd(async p => {
    // A 20-mile fixture route only outruns a 50 L tank at an implausible mpg, so this
    // uses 10 mpg at 7.5% full: ~8 miles of range against a 15-mile-away cheap end.
    // The figures are a lever for the branch, not a claim about real cars.
    await p.locator('.mode-btn[data-mode="journey"]').click();
    await p.locator("#mpg").fill("10");
    await p.evaluate(() => {
      const s = document.getElementById("levelSlider");
      s.value = "7.5";
      s.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await runJourney(p);
    const notes = await p.evaluate(() =>
      [...document.querySelectorAll("#results .notice")].map(n => n.textContent).join(" | "));
    assert.match(notes, /you'll need to stop on the way/,
      "the pre-existing range warning still fires");
    // The advice this feature adds: buy little at the dear end, fill up at the cheap one.
    // It can only appear because the end comparison is computed BEFORE the range filter —
    // that filter drops the unreachable far end, which is the very case this covers.
    assert.match(notes, /Put roughly \d+ L in here and fill up round Northshire/,
      `expected the splash sizing: ${notes}`);
    assert.match(notes, /better than filling right up now/);
  });
});

test("no two preset chips share a mpg+tank pair, in either fuel", async () => {
  // The highlight is derived, so a collision would light two chips at once and there is
  // no way to tell them apart. Guards the figures against a future well-meaning edit.
  const p = await freshPage();
  for (const fuel of ["E10", "B7"]) {
    await p.selectOption("#fuel", fuel);
    const pairs = [];
    for (const name of ["small","hatch","suv","big4x4","hybrid","van"]) {
      await p.locator(`.seg[data-preset="${name}"]`).click();
      pairs.push(await p.evaluate(() =>
        document.getElementById("mpg").value + "/" + document.getElementById("tank").value));
    }
    assert.equal(new Set(pairs).size, pairs.length, `${fuel}: duplicate pair in ${pairs.join(" ")}`);
  }
  await p.evaluate(() => localStorage.clear());
  await p.close();
});
