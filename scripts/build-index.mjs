// build-index.mjs
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
//
// Maintains data/index.json: one row per day, the national average pump price.
// The git history of prices.json is a month-and-counting diary of every price in
// Britain that nothing ever read; this file is its one-line-a-day summary, cheap
// enough to ship to every visitor (~2 KB gzipped per YEAR).
//
//   node scripts/build-index.mjs             append/refresh today's row from data/prices.json
//   node scripts/build-index.mjs --backfill  rebuild the whole file from git history
//                                            (last snapshot of each day; run on the Mac)
//
// Called from build-prices.mjs after each successful write, so the Pi needs no
// extra cron entry — but its runner must `git add data/` (not just prices.json),
// see pi/README.md. Rows are keyed by the snapshot's own generated_at date, and the
// last write of a day wins: the row is that day's closing average.

import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Same bounds the fetcher enforces since 2026-07-29. The backfill walks older
// snapshots where pounds-as-pence records (1.309 for 130.9) still lurk — averaged
// in, one of those drags a national mean visibly, so filter here too.
const PRICE_MIN = 50, PRICE_MAX = 400;
// The 2026-07-24 snapshot holds 8 sample stations; anything this thin is not Britain.
const MIN_STATIONS = 1000;

export function dayRow(doc) {
  const stations = doc.stations || [];
  if (stations.length < MIN_STATIONS) return null;
  const sums = { E10: [0, 0], B7: [0, 0] };
  for (const s of stations) {
    for (const g of ["E10", "B7"]) {
      const p = s.prices?.[g];
      if (p >= PRICE_MIN && p <= PRICE_MAX) { sums[g][0] += p; sums[g][1]++; }
    }
  }
  if (!sums.E10[1] || !sums.B7[1]) return null;
  return {
    d: doc.generated_at.slice(0, 10),
    E10: Math.round(sums.E10[0] / sums.E10[1] * 10) / 10,
    B7: Math.round(sums.B7[0] / sums.B7[1] * 10) / 10,
    n: stations.length,
  };
}

export async function updateIndex(pricesPath = "data/prices.json", indexPath = "data/index.json") {
  const row = dayRow(JSON.parse(await readFile(pricesPath, "utf8")));
  if (!row) return false;
  let index = { days: [] };
  try { index = JSON.parse(await readFile(indexPath, "utf8")); } catch { /* first run */ }
  const days = index.days.filter(x => x.d !== row.d);
  days.push(row);
  days.sort((a, b) => a.d < b.d ? -1 : 1);
  await writeFile(indexPath, JSON.stringify({ days }));
  return true;
}

async function backfill() {
  // Last commit of each day only — 26 reads instead of 600.
  const log = execFileSync("git", ["log", "--format=%H %ad", "--date=short", "--", "data/prices.json"],
    { encoding: "utf8" }).trim().split("\n");
  const lastOfDay = new Map();   // log is newest-first, so first seen per day wins
  for (const line of log) {
    const [sha, date] = line.split(" ");
    if (!lastOfDay.has(date)) lastOfDay.set(date, sha);
  }
  const days = [];
  for (const [date, sha] of lastOfDay) {
    try {
      const doc = JSON.parse(execFileSync("git", ["show", `${sha}:data/prices.json`],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
      const row = dayRow(doc);
      if (row) days.push(row);
      else console.log(`  ${date}: skipped (too thin or no usable prices)`);
    } catch { console.log(`  ${date}: unreadable, skipped`); }
  }
  days.sort((a, b) => a.d < b.d ? -1 : 1);
  await writeFile("data/index.json", JSON.stringify({ days }));
  console.log(`Backfilled ${days.length} days: ${days[0]?.d} → ${days[days.length - 1]?.d}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const job = process.argv.includes("--backfill") ? backfill() : updateIndex();
  job.then(r => { if (r === true) console.log("index.json updated"); })
     .catch(e => { console.error(e); process.exit(1); });
}
