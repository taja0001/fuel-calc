// unit.test.mjs — the fetcher's pure functions, against the shapes the real API sends.
// Copyright (c) 2026 Thomas Ainsworth. All rights reserved — see LICENSE.
//
// Every awkward case here was seen in production data first: the 00:00-00:00 junk
// hours, the pounds-instead-of-pence prices, grades that reprice independently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPrices, hoursOf, toMinutes } from "../scripts/build-prices.mjs";
import { dayRow } from "../scripts/build-index.mjs";

const day = (open, close, h24 = false) => ({ open, close, is_24_hours: h24 });
const week = d => ({ opening_times: { usual_days: {
  monday: d, tuesday: d, wednesday: d, thursday: d, friday: d, saturday: d, sunday: d } } });

test("hoursOf: all-day is_24_hours collapses to 1", () => {
  assert.equal(hoursOf(week(day("00:00:00", "00:00:00", true))), 1);
});

test("hoursOf: the real Tesco junk record (00:00-00:00, not 24h) is unknown, not shut-all-week", () => {
  assert.equal(hoursOf(week(day("00:00:00", "00:00:00"))), undefined);
});

test("hoursOf: ordinary hours become minute pairs", () => {
  assert.deepEqual(hoursOf(week(day("06:00:00", "22:00:00"))),
    Array(7).fill([360, 1320]));
});

test("hoursOf: closes past midnight keeps close < open", () => {
  assert.deepEqual(hoursOf(week(day("06:00:00", "01:00:00")))[0], [360, 60]);
});

test("hoursOf: a missing weekday means unknown — no guessing", () => {
  assert.equal(hoursOf({ opening_times: { usual_days: { monday: day("06:00:00", "22:00:00") } } }),
    undefined);
});

test("hoursOf: garbage time strings mean unknown", () => {
  assert.equal(hoursOf(week(day("noonish", "22:00:00"))), undefined);
});

test("hoursOf: absent opening_times means unknown", () => {
  assert.equal(hoursOf({}), undefined);
});

const dropped = () => ({ prices: 0 });

test("extractPrices: grades agreeing on a timestamp collapse to one number", () => {
  const d = dropped();
  const { prices, pu } = extractPrices([
    { fuel_type: "E10", price: 158.9, price_last_updated: "2026-07-30T17:18:16.000Z" },
    { fuel_type: "B7_STANDARD", price: 175.9, price_last_updated: "2026-07-30T17:18:16.000Z" },
  ], d);
  assert.deepEqual(prices, { E10: 158.9, B7: 175.9 });
  assert.equal(typeof pu, "number");
});

test("extractPrices: grades that disagree keep per-grade timestamps", () => {
  const { pu } = extractPrices([
    { fuel_type: "E10", price: 158.9, price_last_updated: "2026-07-30T17:18:16.000Z" },
    { fuel_type: "B7", price: 175.9, price_last_updated: "2026-06-01T09:00:00.000Z" },
  ], dropped());
  assert.equal(typeof pu, "object");
  assert.notEqual(pu.E10, pu.B7);
});

test("extractPrices: no timestamps at all omits pu entirely", () => {
  assert.equal(extractPrices([{ fuel_type: "E10", price: 158.9 }], dropped()).pu, undefined);
});

test("extractPrices: the pounds-instead-of-pence slip is dropped, and its timestamp with it", () => {
  const d = dropped();
  const { prices, pu } = extractPrices([
    { fuel_type: "E10", price: 1.309, price_last_updated: "2026-07-30T17:18:16.000Z" },
    { fuel_type: "B7", price: 175.9, price_last_updated: "2026-07-30T17:18:16.000Z" },
  ], d);
  assert.deepEqual(prices, { B7: 175.9 });
  assert.equal(d.prices, 1);
  assert.equal(typeof pu, "number");   // only the surviving grade's stamp counts
});

test("extractPrices: unknown fuel types are ignored", () => {
  assert.deepEqual(extractPrices([{ fuel_type: "LPG", price: 99 }], dropped()).prices, {});
});

test("toMinutes: real ISO timestamps round-trip; garbage is null", () => {
  const m = toMinutes("2026-07-30T17:18:16.000Z");
  assert.equal(new Date(m * 60000).toISOString(), "2026-07-30T17:18:00.000Z");
  assert.equal(toMinutes("not a date"), null);
  assert.equal(toMinutes(undefined), null);
});

const doc = (stations, at = "2026-08-21T18:03:00Z") => ({ generated_at: at, stations });
const many = (n, prices) => Array.from({ length: n }, () => ({ prices }));

test("dayRow: averages the day and keys it by the snapshot date", () => {
  const stations = [...many(600, { E10: 150, B7: 170 }), ...many(600, { E10: 160, B7: 180 })];
  assert.deepEqual(dayRow(doc(stations)), { d: "2026-08-21", E10: 155, B7: 175, n: 1200 });
});

test("dayRow: a pounds-as-pence record cannot drag the national average", () => {
  const stations = [...many(1200, { E10: 150, B7: 170 })];
  stations[0] = { prices: { E10: 1.499, B7: 170 } };      // the archive's known artefact
  assert.equal(dayRow(doc(stations)).E10, 150);
});

test("dayRow: refuses a snapshot too thin to be Britain", () => {
  assert.equal(dayRow(doc(many(8, { E10: 150, B7: 170 }))), null);
});
