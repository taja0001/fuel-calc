// build-prices.mjs
// Fetches current UK fuel prices from the government Fuel Finder API and writes
// a compact data/prices.json that the web app reads. Runs server-side (in the
// GitHub Action) so the API secret is never exposed to the browser.
//
// Node 20+ only (uses the built-in global fetch — no npm install needed).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ FILL IN THE 4 THINGS MARKED  <<< TODO  BELOW.                             │
// │ Get them from https://www.developer.fuel-finder.service.gov.uk after     │
// │ you register (One Login). Put the two secrets in GitHub Actions Secrets,  │
// │ NOT in this file.                                                         │
// └─────────────────────────────────────────────────────────────────────────┘

import { writeFile, mkdir } from "node:fs/promises";

// --- credentials come from the environment (set as GitHub Actions Secrets) ---
const CLIENT_ID     = process.env.FF_CLIENT_ID;
const CLIENT_SECRET = process.env.FF_CLIENT_SECRET;

// --- endpoints & field mapping: copy these from the Fuel Finder API guide ---
const TOKEN_URL  = "<<< TODO: OAuth 2.0 token endpoint URL from the API guide";
const PRICES_URL = "<<< TODO: current-prices endpoint URL from the API guide";
const SCOPE      = "";  // <<< TODO: some APIs need a scope string; leave "" if not

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing FF_CLIENT_ID / FF_CLIENT_SECRET env vars.");
  process.exit(1);
}

// 1) Get an OAuth access token (client-credentials grant) ---------------------
async function getToken() {
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (SCOPE) body.set("scope", SCOPE);
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!r.ok) throw new Error(`Token request failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

// 2) Fetch the prices ----------------------------------------------------------
async function getPrices(token) {
  const r = await fetch(PRICES_URL, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
  });
  if (!r.ok) throw new Error(`Prices request failed: ${r.status} ${await r.text()}`);
  return r.json();
}

// 3) Normalise to the shape the web app expects -------------------------------
//    <<< TODO: adjust the field names on the right-hand side to match the real
//    API response (check the API fields guide). Each station in prices.json is:
//    { brand, name, address, postcode, lat, lng, prices: { E10, E5, B7, SDV } }
function normalise(raw) {
  // Many gov feeds nest the list under `stations`; adjust if yours differs.
  const list = raw.stations || raw.sites || raw.data || [];
  const out = [];
  for (const s of list) {
    const lat = Number(s.location?.latitude  ?? s.latitude  ?? s.lat);
    const lng = Number(s.location?.longitude ?? s.longitude ?? s.lng);
    if (!isFinite(lat) || !isFinite(lng)) continue;   // skip anything without coords
    const p = s.prices || {};
    out.push({
      brand:    s.brand || s.operator || "",
      name:     s.name || s.site_name || "",
      address:  s.address || "",
      postcode: s.postcode || "",
      lat, lng,
      prices: {
        E10: Number(p.E10 ?? p.e10 ?? 0) || 0,
        E5:  Number(p.E5  ?? p.e5  ?? 0) || 0,
        B7:  Number(p.B7  ?? p.b7  ?? 0) || 0,
        SDV: Number(p.SDV ?? p.sdv ?? 0) || 0,
      },
    });
  }
  return out;
}

// 4) Write the file ------------------------------------------------------------
async function main() {
  const token = await getToken();
  const raw = await getPrices(token);
  const stations = normalise(raw);
  if (!stations.length) throw new Error("Normalised 0 stations — check the field mapping in normalise().");

  await mkdir("data", { recursive: true });
  await writeFile("data/prices.json", JSON.stringify({
    generated_at: new Date().toISOString(),
    count: stations.length,
    stations,
  }));
  console.log(`Wrote data/prices.json with ${stations.length} stations.`);
}

main().catch(e => { console.error(e); process.exit(1); });
