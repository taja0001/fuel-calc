// build-prices.mjs
// Fetches all UK fuel prices from the government Fuel Finder public API and
// writes a compact data/prices.json for the web app. Must run from a
// residential connection (the API firewall blocks datacenter IPs).
//
// Node 20+ (built-in global fetch). Env needed: FF_CLIENT_ID, FF_CLIENT_SECRET.

import { writeFile, mkdir, readFile } from "node:fs/promises";

const CLIENT_ID     = process.env.FF_CLIENT_ID;
const CLIENT_SECRET = process.env.FF_CLIENT_SECRET;
const BASE = process.env.FF_BASE || "https://www.fuel-finder.service.gov.uk/api/v1";
const TOKEN_URL = `${BASE}/oauth/generate_access_token`;
const INFO_URL  = `${BASE}/pfs`;
const PRICE_URL = `${BASE}/pfs/fuel-prices`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing FF_CLIENT_ID / FF_CLIENT_SECRET env vars.");
  process.exit(1);
}

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
    if (!r.ok) throw new Error(`${label} batch ${batch} failed: ${r.status} ${text.slice(0, 300)}`);
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : (j?.data ?? []);
    if (!arr.length) break;
    all.push(...arr);
    console.log(`  ${label}: batch ${batch} -> ${arr.length} (total ${all.length})`);
    if (arr.length < 500) break;
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
function extractPrices(fuelPrices) {
  const out = {};
  for (const fp of (fuelPrices || [])) {
    const key = GRADE[String(fp.fuel_type || "").toUpperCase()];
    const price = Number(fp.price) || 0;
    if (key && price > 0) out[key] = price;
  }
  return out;
}

const round5 = n => Math.round(n * 1e5) / 1e5;   // ~1 m, finer than any forecourt needs

function locOf(info) {
  const l = info.location || info;
  return {
    lat: round5(Number(l.latitude)),
    lng: round5(Number(l.longitude)),
    postcode: l.postcode || info.postcode || "",
  };
}

async function main() {
  const token = await getToken();

  console.log("Fetching station info...");
  const info = await fetchAll(INFO_URL, token, "info");
  console.log("Fetching fuel prices...");
  const prices = await fetchAll(PRICE_URL, token, "prices");

  const priceMap = new Map();
  for (const p of prices) priceMap.set(p.node_id, p.fuel_prices || []);

  const stations = [];
  for (const s of info) {
    if (s.permanent_closure || s.temporary_closure) continue;
    const { lat, lng, postcode } = locOf(s);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const fp = priceMap.get(s.node_id);
    if (!fp || !fp.length) continue;
    const pr = extractPrices(fp);
    if (!Object.keys(pr).length) continue;
    stations.push({
      id: s.node_id,          // for the stable sort only — stripped before writing
      brand: s.brand_name || s.trading_name || "",
      name: s.trading_name || "",
      postcode, lat, lng,
      prices: pr,
    });
  }

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

  // Only rewrite the file when the actual data changed. Otherwise the
  // generated_at timestamp alone would force a needless commit every run.
  const newBody = JSON.stringify(out);
  let oldBody = "";
  try {
    const prev = JSON.parse(await readFile("data/prices.json", "utf8"));
    oldBody = JSON.stringify(prev.stations || []);
  } catch { /* no existing file yet */ }

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
}

main().catch(e => { console.error(e); process.exit(1); });
