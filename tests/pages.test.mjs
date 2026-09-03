// pages.test.mjs — the /petrol/ area-page generator's pure functions.
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
//
// The rules pinned here are the plan's promises (plans/town-pages.md): the thin-page
// gate, honest freshness wording, both fuels side by side, and name-calming parity
// with the app (the caseName port must not drift from index.html's).

import { test } from "node:test";
import assert from "node:assert/strict";
import { caseName, label, areaOf, slugOf, groupAreas, renderArea, renderSitemap } from "../scripts/build-pages.mjs";

const st = (pc, e10, b7, extra = {}) => ({
  brand: "FuelCo", name: "TEST STATION", postcode: pc, lat: 53, lng: -1,
  prices: { ...(e10 && { E10: e10 }), ...(b7 && { B7: b7 }) },
  pu: { E10: 29000000, B7: 29000000 }, ...extra,
});
const NOW_MIN = 29000000 + 60;   // an hour after the fixture prices updated
const CTX = { ukE10: 160, asOfWords: "2 September 2026", nowMin: NOW_MIN, neighbours: () => [] };

test("gate: 10 stations page, 9 don't, malformed postcodes never count", () => {
  const nine = Array.from({ length: 9 }, (_, i) => st(`AB1 ${i}XX`, 150 + i, 170));
  const ten = Array.from({ length: 10 }, (_, i) => st(`CD1 ${i}XX`, 150 + i, 170));
  const junk = [st("C1 1AA", 140, 160), st("!!", 141, 161)]; // C1 is not a real UK area shape here: no letters+digit boundary issue — areaOf accepts C; keep the truly malformed one
  const areas = groupAreas(nine.concat(ten, junk));
  assert.ok(areas.has("CD"), "10 stations qualify");
  assert.ok(!areas.has("AB"), "9 stations stay unpaged");
  assert.ok(![...areas.keys()].includes(null), "malformed postcodes never form an area");
});

test("name calming matches the app: suffixes stripped, caps tamed, apostrophes intact", () => {
  assert.equal(caseName("TESCO BULWELL EXTRA - PETROL FILLING STATION"), "Tesco Bulwell Extra");
  assert.equal(caseName("ESSON'S GARAGE"), "Esson's Garage");
  // Small words escape the ACRONYM rule (never "Southend-ON-SEA"), but still
  // title-case — the app's own behaviour, per its NAME_SMALL comment.
  assert.equal(caseName("BP SOUTHEND-ON-SEA"), "BP Southend-On-Sea");
  assert.equal(label({ brand: "EG", name: "EG TRENT BRIDGE" }), "EG Trent Bridge");
});

test("slugs: curated areas get city names, the rest keep their code, London stays London", () => {
  assert.equal(slugOf("NG"), "nottingham");
  assert.equal(slugOf("TD"), "galashiels");    // every real area carries its post-town name
  assert.equal(slugOf("XX"), "xx");            // unknown codes fall back safely
  assert.equal(slugOf("AB"), "aberdeen");      // Scotland is named, not hidden as codes
  assert.equal(slugOf("CR"), "croydon");
  assert.equal(slugOf("BH"), "bournemouth");
  assert.equal(slugOf("BT"), "northern-ireland");
  assert.equal(slugOf("SE"), "london-se");
  assert.equal(areaOf("NG1 5FS"), "NG");
  assert.equal(areaOf("nonsense"), null);
});

test("an area page carries both fuels, the honest stamp, and never claims to be live", () => {
  const list = Array.from({ length: 12 }, (_, i) => st(`NG${i + 1} 1AA`, 149 + i, 171 + i));
  list.push(st("NG9 9ZZ", 148, 170, { brand: "COSTCO", name: "COSTCO NOTTINGHAM" }));
  list.push(st("NG8 8YY", 147.5, null, { pu: { E10: 29000000 - 30 * 24 * 60 } })); // a month stale
  const html = renderArea("NG", list, CTX);
  assert.match(html, /Unleaded \(E10\)/);
  assert.match(html, /Diesel \(B7\)/, "diesel column always present — panel finding");
  assert.match(html, /Prices as of 2 September 2026/);
  assert.doesNotMatch(html, /\blive prices are\b|\bupdated \d+m ago\b/i, "no live-ness the page doesn't have");
  assert.match(html, /members only/, "Costco flagged, never hidden");
  assert.match(html, /price 4 wks old/, "stale prices wear their age");
  assert.match(html, /\?pc=NG"/, "CTA prefills the app, which never auto-runs");
});

test("sitemap lists root, index, and one URL per paged area, all with lastmod", () => {
  const areas = groupAreas(Array.from({ length: 10 }, (_, i) => st(`NG${i + 1} 1AA`, 150, 170)));
  const xml = renderSitemap(areas, "2026-09-02");
  assert.equal((xml.match(/<url>/g) || []).length, 3, "root + /petrol/ + NG");
  assert.match(xml, /petrol\/nottingham\//);
  assert.match(xml, /<lastmod>2026-09-02<\/lastmod>/);
});
