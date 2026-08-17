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
// The update toast is therefore NOT covered here — verified manually 2026-07-30.

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
  S("CHEAP FAR", "FuelCo", at(3, 0), 140.0),
  S("DEAR NEAR", "NearGarage", at(0.5, 0), 155.9),
  S("NIGHT OFF", "NightOff", at(0.6, 0.1), 139.0, { o: DAY_HOURS }),  // cheapest total, but shut
  S("VILLAGE", "Kirkby Motors", at(1, -0.2), 150.0),
  S("STALE", "OldPrice", at(1.2, 0.3), 149.0, { pu: MIN(FIXED) - 30 * 1440 }),
  S("SUPERSTORE", "TESCO", at(2, 0.2), 145.0, { sm: 1 }),
  S("SERVICES", "Moto", at(2.5, -0.3), 152.0, { mw: 1 }),
];
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
  const html = await readFile(new URL("../index.html", import.meta.url));
  const icon = await readFile(new URL("../icon-192.png", import.meta.url));
  const manifest = await readFile(new URL("../manifest.json", import.meta.url));
  server = createServer((req, res) => {
    const p = req.url.split("?")[0];
    const send = (t, b) => { res.writeHead(200, { "Content-Type": t }); res.end(b); };
    if (p === "/" || p === "/index.html") return send("text/html; charset=utf-8", html);
    if (p === "/data/prices.json") return send("application/json", PRICES_JSON);
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
  await context.route("**/sw.js", r => r.abort());          // see header comment
  // "ZZ9 ..." geocodes to 20 mi north; anything else to the origin — enough to plan
  // a journey between two distinct places.
  await context.route("**/api.postcodes.io/**", r => {
    const p = r.request().url().includes("ZZ9") ? DEST : ORIGIN;
    return r.fulfill({ contentType: "application/json",
      body: JSON.stringify({ result: { latitude: p.lat, longitude: p.lng, postcode: "X" } }) });
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
  assert.match(r[0].name, /CHEAP FAR/, "best = cheapest total among OPEN forecourts");
  // predict its total with the same arithmetic the app uses (fill 37.5 L default car)
  const road = haversineMi(ORIGIN, STATIONS[0]) * ROAD;
  const expected = 37.5 * 1.40 + (road * 2) / 45 * 4.54609 * 1.40;
  assert.ok(Math.abs(r[0].total - expected) < 0.02, `${r[0].total} ≈ ${expected.toFixed(2)}`);
  assert.match(r[0].meta, /\d+ min/, "drive time shown when OSRM answered");
});

test("a closed forecourt with the lowest total never takes the top spot", async () => {
  const r = await rows();
  const shut = r.find(x => /NIGHT OFF/.test(x.name));
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

test("a month-old price is badged; motorway services are labelled", async () => {
  const r = await rows();
  assert.match(r.find(x => /STALE/.test(x.name)).pills.join(" "), /Price a month old/);
  assert.match(r.find(x => /SERVICES/.test(x.name)).pills.join(" "), /Motorway services/);
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
  // 20 mi at the default 45 mpg = 2.02 L; best OPEN price en route is 140.0p
  // (the 139.0p forecourt is closed at the pinned 23:15 and must not set the quote)
  const litres = 20 / 45 * 4.54609;
  const cost = litres * 1.40;
  assert.match(line, /This journey will cost you about £/);
  assert.match(line, new RegExp(`20 mi · ${litres.toFixed(0)} L`));
  assert.ok(Math.abs(parseFloat(line.match(/£([\d.]+)/)[1]) - cost) < 0.03, `${line} ≈ £${cost.toFixed(2)}`);
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
