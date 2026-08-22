// history.mjs
// Copyright (c) 2026 Thomas Ainsworth. All rights reserved — see LICENSE.
//
// Per-station price history — the scalars behind the app's "▲ 2p since Tue" badges.
// The git archive of data/prices.json knows every answer, but reading it at fetch
// time means shelling out to git per snapshot (~1s each, measured), so the Pi keeps
// a rolling file of the last 8 days of daily closing prices and updates it each run:
//
//   ~/fuel/history-state.json            on the Pi — or wherever FF_STATE points
//   node scripts/history.mjs --rebuild   rebuild that file from git history: the
//                                        recovery path after an SD-card death, and
//                                        the bootstrap on first deploy. build-prices
//                                        runs it automatically when the file is missing.
//
// The state lives OUTSIDE the repo. It is derivable from the archive, so committing
// it would double the hourly churn to record nothing new.
//
// Stations are keyed postcode|brand|name. node_id would be stabler, but it was
// dropped from the published file (40% of the bytes for a field nothing read), and a
// rebuild can only use what the archive holds — so the live path must use the same
// key or the two would silently diverge. Measured 2026-08-22: 0 collisions across all
// 8,030 stations. A feed rename resets that one station's week — self-healing, and
// never wrong, just briefly silent.
//
// What gets published, per station, only for grades that moved in the last 7 days:
//
//   hist: { "E10": [delta, over] }
//     delta  today's price minus the most recent daily close that DIFFERS from it,
//            so three +1p days read as one "+3p". When the move landed is already
//            published (pu) — the app pairs the two.
//     over   how many pence today sits ABOVE this station's cheapest close of the
//            window; the week's low itself is price - over. Omitted when today IS
//            the week's low, which the app words as a badge. Shipping the offset
//            instead of the low was measured 2026-08-22 on the full file: +28 KB
//            gzipped against +40 — offsets are 1-2 digits where prices are 4-5.
//
//   Steady all week -> no entry, same convention as pu: absence means nothing to say.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const WINDOW = 7;          // days a "week" spans
const KEEP = WINDOW + 1;   // days of closes kept: the window plus today
// Same bounds the fetcher enforces. The live path only ever sees filtered prices,
// but the rebuild walks archive snapshots — cheap insurance against a dirty one.
const PRICE_MIN = 50, PRICE_MAX = 400;
const MIN_STATIONS = 1000; // the 2026-07-24 snapshot holds 8 sample stations

export const keyOf = s => `${s.postcode}|${s.brand}|${s.name}`;
export const addDays = (date, n) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);

// Record the day's closing price for every station and grade. Last write of a day
// wins, so after the final run of a day the entry is that day's close — the same
// rule build-index.mjs uses for the national row. Prunes closes older than the
// window needs, then any grade or station left empty (feed leavers age out).
export function recordCloses(state, stations, date) {
  const floor = addDays(date, -(KEEP - 1));
  for (const s of stations) {
    const k = keyOf(s);
    const grades = state.stations[k] || (state.stations[k] = {});
    for (const [g, p] of Object.entries(s.prices || {})) {
      if (!(p >= PRICE_MIN && p <= PRICE_MAX)) continue;
      (grades[g] || (grades[g] = {}))[date] = p;
    }
  }
  for (const [k, grades] of Object.entries(state.stations)) {
    for (const [g, closes] of Object.entries(grades)) {
      for (const d of Object.keys(closes)) if (d < floor || d > date) delete closes[d];
      if (!Object.keys(closes).length) delete grades[g];
    }
    if (!Object.keys(grades).length) delete state.stations[k];
  }
}

// The published scalars for one station, from the closes BEFORE today. The delta
// walks back from yesterday and compares against the first close that differs —
// walking PAST equal ones, so a dip-and-recover inside the week still reports the
// move since the dip rather than pretending nothing happened. Days the station was
// missing from the feed are simply skipped: a gap is not a price change.
export function histFor(grades, prices, date) {
  if (!grades) return undefined;
  const out = {};
  for (const [g, price] of Object.entries(prices || {})) {
    const closes = grades[g];
    if (!closes || !Number.isFinite(price)) continue;
    let prev = null, low = price;
    for (let i = 1; i <= WINDOW; i++) {
      const c = closes[addDays(date, -i)];
      if (!Number.isFinite(c)) continue;
      if (c < low) low = c;
      if (prev === null && c !== price) prev = c;
    }
    if (prev === null) continue;
    const delta = Math.round((price - prev) * 10) / 10;
    if (!delta) continue;                       // a sub-0.05p wobble is not a move
    const over = Math.round((price - low) * 10) / 10;
    out[g] = over > 0 ? [delta, over] : [delta];
  }
  return Object.keys(out).length ? out : undefined;
}

// Attach hist to every station that has one. Returns counts for the run log —
// "numbers first" is house style, and this is how a badge-less day gets explained.
export function attachHist(state, stations, date) {
  const n = { moved: 0, up: 0, down: 0, atLow: 0 };
  for (const s of stations) {
    const h = histFor(state.stations[keyOf(s)], s.prices, date);
    if (!h) continue;
    s.hist = h;
    n.moved++;
    for (const v of Object.values(h)) {
      if (v[0] > 0) n.up++; else n.down++;
      if (v.length === 1) n.atLow++;
    }
  }
  return n;
}

// Missing OR unreadable both return null — the caller rebuilds from git either way,
// and the next save repairs the file. A corrupt state must never kill a price run.
export async function loadState(path) {
  try {
    const j = JSON.parse(await readFile(path, "utf8"));
    if (j && j.v === 1 && j.stations && typeof j.stations === "object") return j;
    console.warn(`history state at ${path} has an unexpected shape — will rebuild`);
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`history state unreadable (${e.message}) — will rebuild`);
  }
  return null;
}

// Write-then-rename: the Pi gets unplugged, and a torn JSON here would cost a
// rebuild on every run until someone noticed the warning.
export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  await writeFile(tmp, JSON.stringify(state));
  await rename(tmp, path);
}

// Rebuild the state from the git archive: the last snapshot of each of the last 8
// days, replayed oldest-first through the same recordCloses the live path uses.
// Reads at most KEEP snapshots (~1s each), not the ~190 hourly commits they sit in.
// Never throws — a machine without the archive just starts with an empty state and
// warms up over a week.
export function rebuildFromGit(date) {
  const state = { v: 1, stations: {} };
  let picked = [];
  try {
    const floor = addDays(date, -(KEEP - 1));
    const log = execFileSync("git", ["log", "--format=%H %cI", "--", "data/prices.json"],
      { encoding: "utf8" }).trim();
    const lastOfDay = new Map();   // newest-first, so first seen per UTC day wins
    for (const line of log ? log.split("\n") : []) {
      const [sha, iso] = line.split(" ");
      const day = new Date(iso).toISOString().slice(0, 10);
      if (day < floor) break;
      if (!lastOfDay.has(day)) lastOfDay.set(day, sha);
    }
    picked = [...lastOfDay].reverse();          // oldest first: last write of a day wins
  } catch (e) {
    console.warn(`history rebuild: git history unavailable (${e.message}) — starting empty`);
    return state;
  }
  let used = 0;
  for (const [, sha] of picked) {
    try {
      const doc = JSON.parse(execFileSync("git", ["show", `${sha}:data/prices.json`],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
      const stations = doc.stations || [];
      if (stations.length < MIN_STATIONS) continue;
      recordCloses(state, stations, doc.generated_at.slice(0, 10));
      used++;
    } catch { /* one unreadable snapshot shouldn't sink the rebuild */ }
  }
  console.log(`history rebuilt from git: ${used} daily snapshots, ` +
    `${Object.keys(state.stations).length} stations`);
  return state;
}

// Where the state lives: FF_STATE wins; otherwise ~/fuel (the Pi's home for
// everything off-repo) if it exists; otherwise nowhere — a dev Mac without FF_STATE
// deliberately skips history rather than scattering files into $HOME.
export function resolveStatePath() {
  if (process.env.FF_STATE) return process.env.FF_STATE;
  const dir = join(homedir(), "fuel");
  return existsSync(dir) ? join(dir, "history-state.json") : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes("--rebuild")) {
    console.error("Usage: node scripts/history.mjs --rebuild   (honours FF_STATE)");
    process.exit(1);
  }
  const path = resolveStatePath();
  if (!path) {
    console.error("Nowhere to write: set FF_STATE or create ~/fuel first.");
    process.exit(1);
  }
  const state = rebuildFromGit(new Date().toISOString().slice(0, 10));
  saveState(path, state)
    .then(() => console.log(`state -> ${path}`))
    .catch(e => { console.error(e); process.exit(1); });
}
