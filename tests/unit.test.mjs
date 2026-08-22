// unit.test.mjs — the fetcher's pure functions, against the shapes the real API sends.
// Copyright (c) 2026 Thomas Ainsworth. All rights reserved — see LICENSE.
//
// Every awkward case here was seen in production data first: the 00:00-00:00 junk
// hours, the pounds-instead-of-pence prices, grades that reprice independently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPrices, hoursOf, toMinutes } from "../scripts/build-prices.mjs";
import { dayRow } from "../scripts/build-index.mjs";
import { recordCloses, histFor, attachHist, keyOf, loadState, saveState } from "../scripts/history.mjs";

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

// --- the week-of-history scalars behind the "up 2p since Tuesday" badges ----------
// hist per grade is [delta] or [delta, over]: delta against the last DIFFERING daily
// close, over = pence above the week's low (absent when today IS the low).

const stn = prices => ({ postcode: "NG1 1AA", brand: "Bran", name: "Nam", prices });
const fresh = () => ({ v: 1, stations: {} });
const replay = (state, days) => {
  let s;
  for (const [date, prices] of days) recordCloses(state, [s = stn(prices)], date);
  return s;
};

test("history: a rise reads as +delta, sitting that far above the week's low; steady grades stay silent", () => {
  const state = fresh();
  const s = replay(state, [
    ["2026-08-18", { E10: 150.9, B7: 160.9 }],
    ["2026-08-19", { E10: 150.9, B7: 160.9 }],
    ["2026-08-20", { E10: 152.9, B7: 160.9 }],
  ]);
  assert.deepEqual(histFor(state.stations[keyOf(s)], s.prices, "2026-08-20"),
    { E10: [2, 2] });
});

test("history: a fall to the week's cheapest omits 'over' — today IS the low", () => {
  const state = fresh();
  const s = replay(state, [
    ["2026-08-18", { E10: 151.9 }],
    ["2026-08-19", { E10: 151.9 }],
    ["2026-08-20", { E10: 150.4 }],
  ]);
  assert.deepEqual(histFor(state.stations[keyOf(s)], s.prices, "2026-08-20"),
    { E10: [-1.5] });                      // float dust rounded away: not -1.5000000000000142
});

test("history: steady all week says nothing at all", () => {
  const state = fresh();
  const s = replay(state, [["2026-08-18", { E10: 150.9 }], ["2026-08-20", { E10: 150.9 }]]);
  assert.equal(histFor(state.stations[keyOf(s)], s.prices, "2026-08-20"), undefined);
});

test("history: a dip and recovery still reports the move since the dip", () => {
  const state = fresh();
  const s = replay(state, [
    ["2026-08-17", { E10: 152.9 }],
    ["2026-08-18", { E10: 150.9 }],       // the dip
    ["2026-08-19", { E10: 152.9 }],       // back up — yesterday's close equals today
    ["2026-08-20", { E10: 152.9 }],
  ]);
  assert.deepEqual(histFor(state.stations[keyOf(s)], s.prices, "2026-08-20"),
    { E10: [2, 2] });
});

test("history: days missing from the feed are skipped — a gap is not a price change", () => {
  const state = fresh();
  const s = replay(state, [
    ["2026-08-14", { E10: 150.9 }],       // then absent for five days
    ["2026-08-20", { E10: 152.9 }],
  ]);
  assert.deepEqual(histFor(state.stations[keyOf(s)], s.prices, "2026-08-20"),
    { E10: [2, 2] });
});

test("history: closes past the 7-day window are pruned and can't feed a badge", () => {
  const state = fresh();
  const s = replay(state, [
    ["2026-08-10", { E10: 150.9 }],       // 10 days before "today"
    ["2026-08-20", { E10: 152.9 }],
  ]);
  assert.equal(state.stations[keyOf(s)].E10["2026-08-10"], undefined);
  assert.equal(histFor(state.stations[keyOf(s)], s.prices, "2026-08-20"), undefined);
});

test("history: a station gone from the feed ages out of the state entirely", () => {
  const state = fresh();
  recordCloses(state, [stn({ E10: 150.9 })], "2026-08-10");
  recordCloses(state, [{ ...stn({ E10: 140 }), name: "Other" }], "2026-08-20");
  assert.equal(state.stations[keyOf(stn({}))], undefined);
});

test("history: the pounds-as-pence slip never enters the closes", () => {
  const state = fresh();
  recordCloses(state, [stn({ E10: 1.509, B7: 160.9 })], "2026-08-20");
  assert.deepEqual(Object.keys(state.stations[keyOf(stn({}))]), ["B7"]);
});

test("attachHist: badges the movers, counts them for the log, leaves steady stations alone", () => {
  const state = fresh();
  const moved = stn({ E10: 152.9 });
  const steady = { ...stn({ E10: 150.9 }), name: "Steady" };
  recordCloses(state, [{ ...moved, prices: { E10: 150.9 } }, steady], "2026-08-19");
  recordCloses(state, [moved, steady], "2026-08-20");
  const n = attachHist(state, [moved, steady], "2026-08-20");
  assert.deepEqual(moved.hist, { E10: [2, 2] });
  assert.equal(steady.hist, undefined);
  assert.deepEqual(n, { moved: 1, up: 1, down: 0, atLow: 0 });
});

test("history state: survives a save/load round-trip; corrupt or missing files signal a rebuild", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fuel-hist-"));
  const path = join(dir, "state.json");
  const state = fresh();
  recordCloses(state, [stn({ E10: 150.9 })], "2026-08-20");
  await saveState(path, state);
  assert.deepEqual(await loadState(path), state);
  assert.equal(await loadState(join(dir, "missing.json")), null);
  await writeFile(path, "{ torn mid-writ");
  assert.equal(await loadState(path), null);
});
