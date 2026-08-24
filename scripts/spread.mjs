// spread.mjs — how far apart are two places' CHEAPEST forecourts, really?
//
// Calibrates the journey-mode "which end is cheaper" line. That feature compares the
// cheapest open forecourt within a band of each end of a route, and on every live route
// tried it stayed silent because the two ends came out within ~1p. This asks the archive
// whether that is the market or the method:
//
//   1. COVERAGE  — how often is there no forecourt within R miles at all? (The 20-mile
//                  band came back empty leaving Ullapool, which is what forced thirds.)
//   2. SPREAD    — distribution of |cheapest(A,R) - cheapest(B,R)| for realistic pairs.
//   3. REMOTENESS— does being far from the nearest forecourt actually cost you?
//   4. PERSISTENCE — if A is cheaper than B today, is it still cheaper next week? A gap
//                  that flips week to week is noise, and advice built on it is worse
//                  than silence.
//
// Usage: node spread.mjs <snapshot.json> [older.json ...]   (newest first)

import { readFileSync } from "node:fs";

const GRADE = "E10";
const MI_PER_DEG_LAT = 69.0;
const RADII = [5, 10, 15, 20, 30, 40, 60];
const FILL_L = 37.5;                       // default car: 50 L tank, quarter full
const pencePerPound = 100 / FILL_L;        // 2.67p/L is £1 on that fill

const files = process.argv.slice(2);
if (!files.length) { console.error("need at least one prices.json"); process.exit(1); }

const toRad = d => d * Math.PI / 180;
function haversineMi(aLat, aLng, bLat, bLng) {
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function load(path) {
  const d = JSON.parse(readFileSync(path, "utf8"));
  const st = d.stations
    .filter(s => s.prices && s.prices[GRADE] > 0 && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    // The feed carries the odd pounds-as-pence slip; the app drops those upstream.
    .filter(s => s.prices[GRADE] > 80 && s.prices[GRADE] < 300)
    .map(s => ({ lat: s.lat, lng: s.lng, p: s.prices[GRADE] }));
  return { when: d.generated_at, st };
}

// Coarse cell index so a 3,000-point grid against 8,000 forecourts stays quick.
const CELL = 0.5;                                            // degrees
const keyOf = (lat, lng) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
function index(st) {
  const m = new Map();
  for (const s of st) {
    const k = keyOf(s.lat, s.lng);
    let a = m.get(k); if (!a) m.set(k, a = []);
    a.push(s);
  }
  return m;
}
function near(idx, lat, lng, rMi) {
  // Cell span needed to cover r miles at this latitude, with a cell of slop.
  const dLat = rMi / MI_PER_DEG_LAT;
  const dLng = rMi / (MI_PER_DEG_LAT * Math.max(0.2, Math.cos(toRad(lat))));
  const out = [];
  for (let i = Math.floor((lat - dLat) / CELL); i <= Math.floor((lat + dLat) / CELL); i++)
    for (let j = Math.floor((lng - dLng) / CELL); j <= Math.floor((lng + dLng) / CELL); j++) {
      const a = idx.get(`${i}:${j}`); if (!a) continue;
      for (const s of a) { const d = haversineMi(lat, lng, s.lat, s.lng); if (d <= rMi) out.push({ s, d }); }
    }
  return out;
}

const snaps = files.map(load);
const base = snaps[0];
const baseIdx = index(base.st);
console.log(`grade ${GRADE} · newest snapshot ${base.when} · ${base.st.length} priced forecourts`);
console.log(`£1 on a ${FILL_L} L fill = ${pencePerPound.toFixed(2)}p/L\n`);

// --- the sample of "places" ---------------------------------------------------------
// A grid over Britain rather than forecourt locations: sampling forecourts would make
// coverage 100% by construction and hide the exact failure this is investigating.
// Points are kept only if some forecourt lies within 60 miles, which crudely excludes
// sea and keeps inhabited Britain including the sparse bits.
const grid = [];
for (let lat = 50.0; lat <= 58.8; lat += 0.1)
  for (let lng = -6.2; lng <= 1.8; lng += 0.15) {
    const hit = near(baseIdx, lat, lng, 60);
    if (hit.length) grid.push({ lat, lng, nearest: Math.min(...hit.map(h => h.d)) });
  }
console.log(`sample: ${grid.length} land points across Britain\n`);

// --- 1. coverage --------------------------------------------------------------------
console.log("1. COVERAGE — places with no forecourt inside the band");
console.log("   band    no forecourt within it");
for (const r of RADII) {
  const empty = grid.filter(g => g.nearest > r).length;
  console.log(`   ${String(r).padStart(2)} mi   ${(empty / grid.length * 100).toFixed(1).padStart(5)}%  (${empty} of ${grid.length})`);
}

// --- cheapest within R, per grid point, per radius ----------------------------------
const cheapest = new Map();                                   // r -> Float64Array
for (const r of RADII) {
  const arr = new Float64Array(grid.length).fill(NaN);
  grid.forEach((g, i) => {
    const hit = near(baseIdx, g.lat, g.lng, r);
    if (hit.length) arr[i] = Math.min(...hit.map(h => h.s.p));
  });
  cheapest.set(r, arr);
}

// --- 2. spread between two ends of a realistic journey ------------------------------
// Deterministic pseudo-random pairs so the numbers reproduce run to run.
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const PAIRS = 20000;
const pairs = [];
while (pairs.length < PAIRS) {
  const a = Math.floor(rnd() * grid.length), b = Math.floor(rnd() * grid.length);
  if (a === b) continue;
  const d = haversineMi(grid[a].lat, grid[a].lng, grid[b].lat, grid[b].lng);
  if (d < 30 || d > 300) continue;                            // a plausible drive
  pairs.push([a, b, d]);
}

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
console.log("\n2. SPREAD — |cheapest at A − cheapest at B| for journeys of 30–300 mi");
console.log("   band   usable pairs   median    p75     p90     p99    >=£1    >=£2");
for (const r of RADII) {
  const c = cheapest.get(r);
  const gaps = [];
  for (const [a, b] of pairs) {
    if (Number.isNaN(c[a]) || Number.isNaN(c[b])) continue;   // an empty band = no answer
    gaps.push(Math.abs(c[a] - c[b]));
  }
  gaps.sort((x, y) => x - y);
  const over = t => (gaps.filter(g => g >= t).length / gaps.length * 100).toFixed(1) + "%";
  console.log(`   ${String(r).padStart(2)} mi  ${String(gaps.length).padStart(9)}   ` +
    [pct(gaps, .5), pct(gaps, .75), pct(gaps, .9), pct(gaps, .99)]
      .map(v => (v.toFixed(1) + "p").padStart(6)).join("  ") +
    `  ${over(pencePerPound).padStart(6)}  ${over(pencePerPound * 2).padStart(6)}`);
}

// --- 3. does remoteness cost you? ---------------------------------------------------
console.log("\n3. REMOTENESS — cheapest price within 20 mi, by distance to nearest forecourt");
const buckets = [[0, 2], [2, 5], [5, 10], [10, 20], [20, 40], [40, 999]];
const c20 = cheapest.get(20);
for (const [lo, hi] of buckets) {
  const vals = grid.map((g, i) => (g.nearest >= lo && g.nearest < hi) ? c20[i] : NaN)
                   .filter(v => !Number.isNaN(v)).sort((a, b) => a - b);
  if (!vals.length) { console.log(`   ${lo}-${hi} mi: no points with a priced band`); continue; }
  const med = pct(vals, .5);
  console.log(`   nearest ${String(lo).padStart(2)}-${String(hi).padStart(3)} mi  n=${String(vals.length).padStart(5)}  ` +
    `median cheapest ${med.toFixed(1)}p`);
}

// --- 4. persistence -----------------------------------------------------------------
// Advice is only worth giving if the fact survives to when the driver acts on it.
if (snaps.length > 1) {
  console.log("\n4. PERSISTENCE — of pairs with a >=£1 gap in the newest snapshot,");
  console.log("   how many still point the SAME way in each older snapshot?");
  const R = 20;
  const cNew = cheapest.get(R);
  const live = pairs.filter(([a, b]) =>
    !Number.isNaN(cNew[a]) && !Number.isNaN(cNew[b]) && Math.abs(cNew[a] - cNew[b]) >= pencePerPound)
    .slice(0, 4000);
  console.log(`   (${live.length} qualifying pairs, ${R} mi band)`);
  for (let k = 1; k < snaps.length; k++) {
    const idx = index(snaps[k].st);
    const memo = new Map();
    const cheapAt = i => {
      if (memo.has(i)) return memo.get(i);
      const hit = near(idx, grid[i].lat, grid[i].lng, R);
      const v = hit.length ? Math.min(...hit.map(h => h.s.p)) : NaN;
      memo.set(i, v); return v;
    };
    let same = 0, flipped = 0, gone = 0;
    for (const [a, b] of live) {
      const va = cheapAt(a), vb = cheapAt(b);
      if (Number.isNaN(va) || Number.isNaN(vb)) { gone++; continue; }
      const nowFar = cNew[b] < cNew[a], thenFar = vb < va;
      if (Math.abs(va - vb) < 0.05) gone++;
      else if (nowFar === thenFar) same++;
      else flipped++;
    }
    const tot = same + flipped || 1;
    console.log(`   vs ${snaps[k].when.slice(0, 10)}:  same direction ${(same / tot * 100).toFixed(1)}%  ` +
      `flipped ${(flipped / tot * 100).toFixed(1)}%  (level/absent ${gone})`);
  }
}
