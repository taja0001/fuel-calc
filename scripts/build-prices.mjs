// build-prices.mjs
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
// Fetches all UK fuel prices from the government Fuel Finder public API and
// writes a compact data/prices.json for the web app. Must run from a
// residential connection (the API firewall blocks datacenter IPs).
//
// Node 20+ (built-in global fetch). Env needed: FF_CLIENT_ID, FF_CLIENT_SECRET.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { updateIndex } from "./build-index.mjs";
import { resolveStatePath, loadState, saveState, recordCloses, attachHist, rebuildFromGit }
  from "./history.mjs";

const CLIENT_ID     = process.env.FF_CLIENT_ID;
const CLIENT_SECRET = process.env.FF_CLIENT_SECRET;
const BASE = process.env.FF_BASE || "https://www.fuel-finder.service.gov.uk/api/v1";
const TOKEN_URL = `${BASE}/oauth/generate_access_token`;
const INFO_URL  = `${BASE}/pfs`;
const PRICE_URL = `${BASE}/pfs/fuel-prices`;

// Guard against publishing a truncated fetch. A run holding fewer than this share of
// last run's stations is rejected; FF_ALLOW_SHRINK=1 overrides for a genuine drop.
// Number(...) || 0.9, not Number(... || 0.9): a typo'd value yields NaN, and every
// comparison against NaN is false, which would quietly switch the guard off.
const MIN_RATIO    = Number(process.env.FF_MIN_RATIO) || 0.9;
const ALLOW_SHRINK = process.env.FF_ALLOW_SHRINK === "1";
// The FF_PING_URL heartbeat is NOT sent from here. This script only writes the file;
// the commit and push live in the Pi's runner, and pinging before the push kept the
// dead-man's switch green through an expired PAT or a rejected push — the one failure
// class it exists to catch. The runner pings after its push step (see pi/README.md).

// The feed carries a few malformed records. A handful of forecourts report prices in
// pounds (1.309 instead of 130.9), and a few have latitude and longitude swapped or
// the longitude sign dropped. Left in, a "1.3p per litre" station wins every ranking
// outright, and a forecourt in the North Sea distorts journey searches. Drop what
// can't be trusted rather than guess at what was meant.
const PRICE_MIN = 50, PRICE_MAX = 400;                            // pence per litre
const UK = { minLat: 49.0, maxLat: 61.2, minLng: -8.8, maxLng: 2.1 };

const COMMON = {
  "User-Agent": "Mozilla/5.0 (compatible; FuelFinderPriceFetcher/1.0)",
  "Accept": "application/json",
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getToken() {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { ...COMMON, "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Token request failed: ${r.status} ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  const token = j?.data?.access_token || j.access_token;
  if (!token) throw new Error("No access_token in token response: " + text.slice(0, 300));
  return token;
}

async function fetchAll(url, token, label) {
  const all = [];
  for (let batch = 1; batch <= 100; batch++) {
    const r = await fetch(`${url}?batch-number=${batch}`, {
      headers: { ...COMMON, "Authorization": `Bearer ${token}` },
    });
    const text = await r.text();
    // Asked for a page past the end, the API answers 404 "Requested batch N is not
    // available" rather than an empty list — that's how it says "done", not a failure.
    // Only past batch 1, so a 404 on the endpoint itself is still a real error.
    if (r.status === 404 && batch > 1) {
      console.log(`  ${label}: no batch ${batch} — end of data (total ${all.length})`);
      break;
    }
    if (!r.ok) throw new Error(`${label} batch ${batch} failed: ${r.status} ${text.slice(0, 300)}`);
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : (j?.data ?? []);
    if (!arr.length) break;
    all.push(...arr);
    console.log(`  ${label}: batch ${batch} -> ${arr.length} (total ${all.length})`);
    // Deliberately not stopping on a short page: that assumed every page holds exactly
    // 500, so one short-but-not-last page would have silently truncated the run. The
    // 404 above is the real end marker, and it costs one extra request per endpoint.
    await sleep(150);
  }
  return all;
}

const GRADE = {
  E10: "E10", E5: "E5",
  B7: "B7", B7_STANDARD: "B7", B7_PREMIUM: "B7P",
  B10: "B10", HVO: "HVO",
};
// Grades a station doesn't sell are left out rather than written as 0. Most sell
// two to four of the six, and B10/HVO exist at barely 50 forecourts nationwide.
//
// The feed also says when each price last moved. Stations appear to reprice every
// grade at once, so rather than assume it, collect the timestamps and let the shape
// follow the data: one number when they agree, a per-grade object when they don't.
// Minutes since the epoch — a minute is finer than "changed 3 hours ago" needs, and
// it costs 8 digits instead of an ISO string's 24.
const toMinutes = t => {
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? Math.round(ms / 60000) : null;
};
function extractPrices(fuelPrices, dropped) {
  const out = {}, stamps = {};
  for (const fp of (fuelPrices || [])) {
    const key = GRADE[String(fp.fuel_type || "").toUpperCase()];
    const price = Number(fp.price) || 0;
    if (!key || price <= 0) continue;
    if (price < PRICE_MIN || price > PRICE_MAX) { dropped.prices++; continue; }
    out[key] = price;
    const at = toMinutes(fp.price_last_updated || fp.price_change_effective_timestamp);
    if (at !== null) stamps[key] = at;
  }
  const seen = [...new Set(Object.values(stamps))];
  // No timestamps at all -> omit. All grades agree -> one number. Otherwise per grade.
  const pu = seen.length === 0 ? undefined
           : seen.length === 1 && Object.keys(stamps).length === Object.keys(out).length ? seen[0]
           : stamps;
  return { prices: out, pu };
}

const round5 = n => Math.round(n * 1e5) / 1e5;   // ~1 m, finer than any forecourt needs

// Opening hours, compacted. Just under half of all forecourts close at some point, so
// without this the app happily recommends a shut one at midnight.
//   1                       -> open 24/7
//   [[open,close], x7]      -> minutes from midnight, Monday first; a 24-hour day is
//                              [0,1440], and close < open means it shuts after midnight
//   omitted                 -> unknown, and the app treats unknown as open
const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const toMins = t => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
function hoursOf(info) {
  const days = info.opening_times?.usual_days;
  if (!days) return undefined;
  const week = [];
  for (const name of DAYS) {
    const d = days[name];
    if (!d) return undefined;
    if (d.is_24_hours) { week.push([0, 1440]); continue; }
    const o = toMins(d.open), c = toMins(d.close);
    if (o === null || c === null) return undefined;
    // 00:00-00:00 with is_24_hours false is the feed's junk value (4 records
    // nationwide). It reads as "shut all week", which is never what's meant.
    if (o === 0 && c === 0) return undefined;
    week.push([o, c]);
  }
  return week.every(([o, c]) => o === 0 && c === 1440) ? 1 : week;
}

function locOf(info) {
  const l = info.location || info;
  return {
    lat: round5(Number(l.latitude)),
    lng: round5(Number(l.longitude)),
    postcode: l.postcode || info.postcode || "",
  };
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Missing FF_CLIENT_ID / FF_CLIENT_SECRET env vars.");
    process.exit(1);
  }
  const token = await getToken();

  console.log("Fetching station info...");
  const info = await fetchAll(INFO_URL, token, "info");
  console.log("Fetching fuel prices...");
  const prices = await fetchAll(PRICE_URL, token, "prices");

  const priceMap = new Map();
  for (const p of prices) priceMap.set(p.node_id, p.fuel_prices || []);

  const dropped = { closed: 0, noCoords: 0, offMap: 0, noPrices: 0, prices: 0, noHours: 0 };
  const stamp = { shared: 0, perGrade: 0, none: 0 };
  const stations = [];
  for (const s of info) {
    if (s.permanent_closure || s.temporary_closure) { dropped.closed++; continue; }
    const { lat, lng, postcode } = locOf(s);
    if (!isFinite(lat) || !isFinite(lng)) { dropped.noCoords++; continue; }
    if (lat < UK.minLat || lat > UK.maxLat || lng < UK.minLng || lng > UK.maxLng) {
      dropped.offMap++;
      console.warn(`  dropped (off-map): ${s.brand_name || s.trading_name || "?"} ${postcode} at ${lat},${lng}`);
      continue;
    }
    const fp = priceMap.get(s.node_id);
    if (!fp || !fp.length) { dropped.noPrices++; continue; }
    const { prices: pr, pu } = extractPrices(fp, dropped);
    if (!Object.keys(pr).length) { dropped.noPrices++; continue; }
    if (pu === undefined) stamp.none++;
    else if (typeof pu === "number") stamp.shared++;
    else stamp.perGrade++;
    // sm/mw are written only when true — cheaper than a 0 on every record. sm comes
    // from the feed rather than brand-name matching, which missed 30% of supermarket
    // forecourts because plenty don't trade under a supermarket's name.
    const hours = hoursOf(s);
    if (hours === undefined) dropped.noHours++;
    stations.push({
      id: s.node_id,          // for the stable sort only — stripped before writing
      brand: s.brand_name || s.trading_name || "",
      name: s.trading_name || "",
      postcode, lat, lng,
      prices: pr,
      ...(pu !== undefined ? { pu } : {}),
      ...(hours !== undefined ? { o: hours } : {}),
      ...(s.is_supermarket_service_station ? { sm: 1 } : {}),
      ...(s.is_motorway_service_station ? { mw: 1 } : {}),
    });
  }

  const h24 = stations.filter(s => s.o === 1).length;
  const timed = stations.filter(s => Array.isArray(s.o)).length;
  console.log(
    `Kept ${stations.length} stations. Dropped: ${dropped.closed} closed, ` +
    `${dropped.noCoords} without coordinates, ${dropped.offMap} outside the UK, ` +
    `${dropped.noPrices} without a usable price, plus ${dropped.prices} individual ` +
    `prices outside ${PRICE_MIN}-${PRICE_MAX}p.`
  );
  console.log(
    `Opening hours: ${h24} open 24/7, ${timed} with set hours, ${dropped.noHours} unknown. ` +
    `Flags: ${stations.filter(s => s.sm).length} supermarket, ` +
    `${stations.filter(s => s.mw).length} motorway services.`
  );
  // How old are the prices, and does every grade at a station really move together?
  const nowMin = Math.round(Date.now() / 60000);
  const ages = [];
  for (const s of stations) {
    if (s.pu === undefined) continue;
    for (const v of (typeof s.pu === "number" ? [s.pu] : Object.values(s.pu))) ages.push(nowMin - v);
  }
  const within = d => ages.filter(a => a < d * 1440).length;
  console.log(
    `Price timestamps: ${stamp.shared} stations share one across grades, ` +
    `${stamp.perGrade} differ per grade, ${stamp.none} have none. ` +
    `Age: ${within(1)} under a day, ${within(7) - within(1)} within a week, ` +
    `${ages.length - within(7)} older, of which ${ages.filter(a => a >= 30 * 1440).length} ` +
    `over a month.`
  );

  if (!stations.length) {
    throw new Error(
      `0 stations after merge (info=${info.length}, prices=${prices.length}). ` +
      `sampleInfo=${JSON.stringify(info[0]).slice(0, 400)} ` +
      `samplePrice=${JSON.stringify(prices[0]).slice(0, 400)}`
    );
  }

  // sort by id so the output (and the change-check) is stable run-to-run
  stations.sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));

  // The app never reads id (a 64-char hash) or the street address, so keep them
  // out of the file every visitor downloads — together they were ~40% of it.
  const out = stations.map(({ id, ...rest }) => rest);

  let oldBody = "", prevCount = 0;
  try {
    const prev = JSON.parse(await readFile("data/prices.json", "utf8"));
    const prevStations = prev.stations || [];
    oldBody = JSON.stringify(prevStations);
    prevCount = prevStations.length;
  } catch { /* no existing file yet */ }

  // A fetch that half-works is more dangerous than one that fails outright: it would
  // overwrite a good national list with a partial one and publish that. Anything
  // below MIN_RATIO of last run's total is treated as a broken fetch, not real news.
  if (prevCount && out.length < prevCount * MIN_RATIO && !ALLOW_SHRINK) {
    throw new Error(
      `Refusing to publish: ${out.length} stations, down from ${prevCount} last run ` +
      `(${((out.length / prevCount) * 100).toFixed(1)}%, floor is ${(MIN_RATIO * 100).toFixed(0)}%). ` +
      `Looks like a truncated fetch — prices.json left alone. ` +
      `If the drop is genuine, re-run with FF_ALLOW_SHRINK=1.`
    );
  }

  // Week-of-price-history scalars for the app's "up 2p since Tuesday" badges — see
  // scripts/history.mjs for the whole story. Sits after the shrink guard (a refused
  // run must not advance the state) and before the change-check (a slid window is a
  // real change worth publishing). The state file lives OUTSIDE the repo and is saved
  // every run, even no-change ones — each day needs its close recorded. Never fatal:
  // prices must still publish if history breaks, just badge-less.
  try {
    const statePath = resolveStatePath();
    if (statePath) {
      const today = new Date().toISOString().slice(0, 10);
      const state = (await loadState(statePath)) ?? rebuildFromGit(today);
      recordCloses(state, out, today);
      const n = attachHist(state, out, today);
      await saveState(statePath, state);
      console.log(
        `History: ${n.moved} stations moved this week ` +
        `(${n.up} grade rises, ${n.down} falls, ${n.atLow} at a week low).`
      );
    } else {
      console.log("History: skipped — no FF_STATE and no ~/fuel directory.");
    }
  } catch (e) {
    console.warn("History skipped (prices unaffected):", e.message);
  }

  // Only rewrite the file when the actual data changed. Otherwise the
  // generated_at timestamp alone would force a needless commit every run.
  const newBody = JSON.stringify(out);
  if (newBody === oldBody) {
    console.log(`No price changes (${out.length} stations) — prices.json left unchanged.`);
    return;
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/prices.json", JSON.stringify({
    generated_at: new Date().toISOString(),
    count: out.length,
    stations: out,
  }));
  console.log(`Wrote data/prices.json with ${out.length} stations (data changed).`);
  // The daily price index rides along — one row per day, last write wins, so the row
  // is the day's closing average. Never fatal: the prices are already safely written.
  try { if (await updateIndex()) console.log("index.json updated."); }
  catch (e) { console.warn("index update failed (ignored):", e.message); }
}

// Exported for the unit tests; the env check lives in main() so importing this file
// costs nothing and touches nothing. Run only when invoked directly — on the Pi,
// exactly as before.
export { extractPrices, hoursOf, toMinutes, locOf, round5 };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
