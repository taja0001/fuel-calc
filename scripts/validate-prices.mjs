// validate-prices.mjs
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
// Sanity-checks data/prices.json and exits non-zero if it looks wrong.
//
// This runs in GitHub Actions on every push that touches the file. It needs no API
// access — it only reads what was committed — so unlike the fetcher it isn't blocked
// by the Fuel Finder firewall. It's the backstop for a bad push from the Pi: a
// truncated list, corrupt JSON, coordinates outside the UK, nonsense prices.
//
// Node 20+, no dependencies. Usage: node scripts/validate-prices.mjs [path]

import { readFile } from "node:fs/promises";

const FILE = process.argv[2] || "data/prices.json";
const MIN_STATIONS = Number(process.env.MIN_STATIONS || 5000);
// Great Britain and Northern Ireland, with a little slack at the edges.
const UK = { minLat: 49.0, maxLat: 61.2, minLng: -8.8, maxLng: 2.1 };
// Pence per litre. Wide enough to survive a price shock, tight enough to catch a
// unit mix-up (pounds instead of pence, or pence per gallon).
const PRICE = { min: 50, max: 400 };
const GRADES = ["E10", "E5", "B7", "B7P", "B10", "HVO"];

const problems = [];
const fail = msg => problems.push(msg);

const raw = await readFile(FILE, "utf8").catch(e => {
  console.error(`Cannot read ${FILE}: ${e.message}`);
  process.exit(1);
});

let doc;
try {
  doc = JSON.parse(raw);
} catch (e) {
  console.error(`${FILE} is not valid JSON: ${e.message}`);
  process.exit(1);
}

const stations = doc.stations;
if (!Array.isArray(stations)) {
  console.error(`${FILE} has no "stations" array.`);
  process.exit(1);
}

// --- file-level checks ------------------------------------------------------
if (stations.length < MIN_STATIONS) {
  fail(`only ${stations.length} stations, expected at least ${MIN_STATIONS} — looks truncated`);
}
if (doc.count !== undefined && doc.count !== stations.length) {
  fail(`count says ${doc.count} but there are ${stations.length} stations`);
}
const generated = new Date(doc.generated_at).getTime();
if (!Number.isFinite(generated)) {
  fail(`generated_at is not a usable date: ${JSON.stringify(doc.generated_at)}`);
} else if (generated > Date.now() + 60 * 60 * 1000) {
  fail(`generated_at is over an hour in the future: ${doc.generated_at}`);
}

// --- per-station checks -----------------------------------------------------
// Collect counts rather than one message per station, so a systemic problem reads as
// one line instead of 8,000.
const tally = { noName: 0, badLat: 0, badLng: 0, outsideUK: 0, noPrices: 0, oddPrice: 0,
                unknownGrade: 0, badHours: 0, badStamp: 0, badHist: 0 };
const nowMinutes = Math.round(Date.now() / 60000);
const EPOCH_FLOOR = Math.round(Date.parse("2020-01-01T00:00:00Z") / 60000);
const stampAges = [];
const examples = {};
const note = (key, detail) => { tally[key]++; if (!examples[key]) examples[key] = detail; };
let withPrices = 0;

for (const s of stations) {
  if (!s || typeof s !== "object") { note("noName", "non-object entry"); continue; }
  if (!s.brand && !s.name) note("noName", JSON.stringify(s).slice(0, 120));
  const where = `${s.brand || ""} ${s.name || ""} ${s.postcode || ""}`.trim() || "(unnamed)";

  if (!Number.isFinite(s.lat)) note("badLat", `${where}: lat=${JSON.stringify(s.lat)}`);
  if (!Number.isFinite(s.lng)) note("badLng", `${where}: lng=${JSON.stringify(s.lng)}`);
  if (Number.isFinite(s.lat) && Number.isFinite(s.lng) &&
      (s.lat < UK.minLat || s.lat > UK.maxLat || s.lng < UK.minLng || s.lng > UK.maxLng)) {
    note("outsideUK", `${where}: ${s.lat},${s.lng}`);
  }

  // Opening hours: 1 for 24/7, or seven [open, close] pairs in minutes from midnight.
  // Absent is fine — the app treats unknown hours as open.
  if (s.o !== undefined) {
    if (s.o !== 1) {
      const bad = !Array.isArray(s.o) || s.o.length !== 7 || s.o.some(d =>
        !Array.isArray(d) || d.length !== 2 ||
        !d.every(v => Number.isInteger(v) && v >= 0 && v <= 1440));
      if (bad) note("badHours", `${where}: ${JSON.stringify(s.o).slice(0, 60)}`);
    }
  }

  // Price timestamps: minutes since the epoch, as one number or an object keyed by
  // grade. Reject anything in the future or implausibly old — a unit slip (seconds or
  // milliseconds instead of minutes) would land far outside this window.
  if (s.pu !== undefined) {
    const vals = typeof s.pu === "number" ? [s.pu]
               : (s.pu && typeof s.pu === "object") ? Object.values(s.pu) : null;
    if (!vals || !vals.length) note("badStamp", `${where}: ${JSON.stringify(s.pu).slice(0, 50)}`);
    else for (const v of vals) {
      if (!Number.isFinite(v) || v > nowMinutes + 60 || v < EPOCH_FLOOR) {
        note("badStamp", `${where}: ${v}`); break;
      }
      stampAges.push((nowMinutes - v) / 1440);
    }
  }

  // Week-of-history scalars: per grade, [delta] or [delta, over] where over is how
  // far today's price sits above the week's low (see scripts/history.mjs). A zero
  // delta, an "over" that puts the low outside the sane price band, or a grade the
  // station doesn't sell would mean the Pi's state file is feeding nonsense badges.
  if (s.hist !== undefined) {
    if (!s.hist || typeof s.hist !== "object" || Array.isArray(s.hist)) {
      note("badHist", `${where}: ${JSON.stringify(s.hist).slice(0, 60)}`);
    } else for (const [g, v] of Object.entries(s.hist)) {
      const price = s.prices?.[g];
      const bad = !GRADES.includes(g) || !Number.isFinite(price)
        || !Array.isArray(v) || v.length < 1 || v.length > 2 || !v.every(Number.isFinite)
        || v[0] === 0 || Math.abs(v[0]) > PRICE.max - PRICE.min
        || (v.length === 2 && (v[1] <= 0 || price - v[1] < PRICE.min));
      if (bad) { note("badHist", `${where}: ${g}=${JSON.stringify(v)}`); break; }
    }
  }

  const prices = s.prices;
  if (!prices || typeof prices !== "object") { note("noPrices", where); continue; }
  let any = false;
  for (const [grade, value] of Object.entries(prices)) {
    if (!GRADES.includes(grade)) note("unknownGrade", `${where}: ${grade}`);
    if (!Number.isFinite(value)) { note("oddPrice", `${where}: ${grade}=${JSON.stringify(value)}`); continue; }
    if (value === 0) continue;                       // tolerated: older files wrote zeros
    if (value < PRICE.min || value > PRICE.max) note("oddPrice", `${where}: ${grade}=${value}p`);
    else any = true;
  }
  if (!any) note("noPrices", where);
  else withPrices++;
}

const LABEL = {
  noName: "stations with neither brand nor name",
  badLat: "stations with an unusable latitude",
  badLng: "stations with an unusable longitude",
  outsideUK: "stations outside the UK bounding box",
  noPrices: "stations with no usable price",
  oddPrice: `prices outside ${PRICE.min}-${PRICE.max}p per litre`,
  unknownGrade: "unrecognised fuel grades",
  badHours: "malformed opening hours",
  badStamp: "price timestamps in the future or absurdly old",
  badHist: "malformed week-of-history scalars",
};
// A handful of bad records is normal in an 8,000-row government feed; a systemic
// problem is not. Only fail past 1% of the file.
const tolerance = Math.max(10, Math.floor(stations.length * 0.01));
for (const [key, n] of Object.entries(tally)) {
  if (!n) continue;
  const line = `${n} ${LABEL[key]} (e.g. ${examples[key]})`;
  if (n > tolerance) fail(line);
  else console.log(`note: ${line}`);
}

if (withPrices < MIN_STATIONS) {
  fail(`only ${withPrices} stations have a usable price, expected at least ${MIN_STATIONS}`);
}

// --- the daily index rides along ----------------------------------------------
// data/index.json feeds the trend chart and its table. The app escapes each row's
// date before rendering, but validate here too: until 2026-08-23 NOTHING checked
// this file — the workflow's path filter watched only prices.json. Absent is fine,
// the app just hides the trend.
const INDEX_FILE = process.argv[3] || "data/index.json";
const indexRaw = await readFile(INDEX_FILE, "utf8").catch(() => null);
if (indexRaw !== null) {
  let idx = null;
  try { idx = JSON.parse(indexRaw); } catch (e) { fail(`${INDEX_FILE} is not valid JSON: ${e.message}`); }
  if (idx && !Array.isArray(idx.days)) fail(`${INDEX_FILE} has no "days" array`);
  if (idx && Array.isArray(idx.days)) {
    let badRows = 0, example = "";
    for (const r of idx.days) {
      const ok = r && typeof r === "object"
        && /^\d{4}-\d{2}-\d{2}$/.test(String(r.d))          // an ISO date, nothing else
        && [r.E10, r.B7].every(v => Number.isFinite(v) && v >= PRICE.min && v <= PRICE.max)
        && Number.isInteger(r.n) && r.n >= 1000;            // build-index's own floor
      if (!ok) { badRows++; if (!example) example = JSON.stringify(r).slice(0, 80); }
    }
    if (badRows) fail(`${INDEX_FILE}: ${badRows} malformed day rows (e.g. ${example})`);
    for (let i = 1; i < idx.days.length; i++) {
      if (!(idx.days[i]?.d > idx.days[i - 1]?.d)) {         // sorted + deduped, as updateIndex writes it
        fail(`${INDEX_FILE}: day rows not strictly ascending at index ${i}`); break;
      }
    }
    if (!badRows) console.log(`${INDEX_FILE}: ${idx.days.length} day rows, all well-formed`);
  }
}

// --- report -----------------------------------------------------------------
const h24 = stations.filter(s => s.o === 1).length;
const timed = stations.filter(s => Array.isArray(s.o)).length;
console.log(`${FILE}: ${stations.length} stations, ${withPrices} with a usable price, generated ${doc.generated_at}`);
console.log(`  opening hours: ${h24} open 24/7, ${timed} with set hours, ` +
            `${stations.length - h24 - timed} unknown; ` +
            `${stations.filter(s => s.sm).length} supermarket, ` +
            `${stations.filter(s => s.mw).length} motorway services`);
if (stampAges.length) {
  const under = d => stampAges.filter(a => a < d).length;
  console.log(`  price ages: ${under(1)} under a day, ${under(7) - under(1)} within a week, ` +
              `${stampAges.length - under(7)} older (${stampAges.filter(a => a >= 30).length} ` +
              `over a month), oldest ${Math.round(Math.max(...stampAges))} days`);
} else {
  console.log(`  price ages: no timestamps present`);
}
const movers = stations.filter(s => s.hist && typeof s.hist === "object");
if (movers.length) {
  let up = 0, down = 0, atLow = 0;
  for (const s of movers) for (const v of Object.values(s.hist)) {
    if (!Array.isArray(v)) continue;
    if (v[0] > 0) up++; else down++;
    if (v.length === 1) atLow++;
  }
  console.log(`  week movement: ${movers.length} stations moved ` +
              `(${up} grade rises, ${down} falls, ${atLow} at a week low)`);
}
if (problems.length) {
  console.error(`\n${FILE} failed validation:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("Looks good.");
