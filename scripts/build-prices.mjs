// build-prices.mjs
// Fetches current UK fuel prices from the government Fuel Finder public API and
// writes a compact data/prices.json that the web app reads. Runs server-side
// (in the GitHub Action) so the API secret is never exposed to the browser.
//
// Node 20+ only (uses the built-in global fetch — no npm install needed).
//
// Endpoints, auth and field mapping are all set from the Fuel Finder API spec.
// You only need two GitHub Actions Secrets: FF_CLIENT_ID and FF_CLIENT_SECRET.

import { writeFile, mkdir } from "node:fs/promises";

// --- credentials: set these as GitHub Actions Secrets, NOT here ---
const CLIENT_ID     = process.env.FF_CLIENT_ID;
const CLIENT_SECRET = process.env.FF_CLIENT_SECRET;

// --- endpoints (confirmed from the Fuel Finder API spec — production server) ---
// Env vars override these if you ever switch to the sandbox environment.
const TOKEN_URL  = process.env.FF_TOKEN_URL  || "https://www.fuel-finder.service.gov.uk/api/v1/oauth/generate_access_token";
const PRICES_URL = process.env.FF_PRICES_URL || "https://www.fuel-finder.service.gov.uk/api/v1/prices";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing FF_CLIENT_ID / FF_CLIENT_SECRET env vars.");
  process.exit(1);
}

// Some gov.uk services sit behind a WAF that 403s requests with a bot-like or
// missing User-Agent. Send a normal UA + Accept on every request.
const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; FuelFinderPriceFetcher/1.0; +https://github.com)",
  "Accept": "application/json",
};

function failMsg(what, r, text) {
  return `${what} failed: ${r.status} ${r.statusText}` +
    ` [server=${r.headers.get("server")}, cf-ray=${r.headers.get("cf-ray")}]` +
    `\nbody: ${(text || "").slice(0, 800) || "(empty)"}`;
}

// 1) Get an access token. Fuel Finder's token endpoint is a custom JSON API:
//    POST { client_id, client_secret } -> { access_token, refresh_token, ... }
async function getToken() {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(failMsg("Token request", r, text));
  const j = JSON.parse(text);
  const token = j.access_token || j.accessToken;
  if (!token) throw new Error("No access_token in token response: " + text.slice(0, 800));
  return token;
}

// 2) Fetch the prices ----------------------------------------------------------
async function getPrices(token) {
  const r = await fetch(PRICES_URL, {
    headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${token}` },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(failMsg("Prices request", r, text));
  return JSON.parse(text);
}

// --- helpers to cope with either response shape (array-of-prices or object) ---
// Maps Fuel Finder grade codes -> the short keys the web app uses.
const GRADE = {
  E10: "E10", E5: "E5",
  B7_Standard: "B7", B7_STANDARD: "B7",
  B7_Premium: "B7P", B7_PREMIUM: "B7P",
  B10: "B10", HVO: "HVO",
};
function extractPrices(station) {
  const out = { E10: 0, E5: 0, B7: 0, B7P: 0, B10: 0, HVO: 0 };
  const raw = station.prices ?? station.fuel_prices ?? station.fuels ?? station.pricing;
  if (Array.isArray(raw)) {
    // e.g. [{ fuel_type: "E10", price: 123.9 }, ...]
    for (const item of raw) {
      const code = item.fuel_type ?? item.fuelType ?? item.grade ?? item.type;
      const key = GRADE[code] ?? GRADE[String(code).toUpperCase()];
      if (key) out[key] = Number(item.price ?? item.value ?? item.amount) || 0;
    }
  } else if (raw && typeof raw === "object") {
    // e.g. { E10: { price: 123.9 }, ... }  or  { E10: 123.9, ... }
    for (const [code, val] of Object.entries(raw)) {
      const key = GRADE[code] ?? GRADE[code.toUpperCase()];
      if (key) out[key] = Number(val?.price ?? val) || 0;
    }
  }
  return out;
}

// 3) Normalise to the shape the web app expects -------------------------------
function normalise(raw) {
  const list = raw.forecourts ?? raw.stations ?? raw.sites ?? raw.data ??
               (Array.isArray(raw) ? raw : []);
  const out = [];
  for (const s of list) {
    const lat = Number(s.latitude ?? s.location?.latitude ?? s.lat);
    const lng = Number(s.longitude ?? s.location?.longitude ?? s.lng);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const addr = [s.address_line_1, s.address_line_2].filter(Boolean).join(", ");
    out.push({
      id:       s.node_id ?? s.id ?? "",
      brand:    s.brand_name ?? s.brand ?? s.operator ?? "",
      name:     s.trading_name ?? s.name ?? "",
      address:  addr,
      postcode: s.postcode ?? "",
      lat, lng,
      prices:   extractPrices(s),
    });
  }
  return out;
}

// 4) Write the file ------------------------------------------------------------
async function main() {
  const token = await getToken();
  const raw = await getPrices(token);
  const stations = normalise(raw);
  if (!stations.length) throw new Error("Normalised 0 stations — check the response shape in normalise()/extractPrices().");

  await mkdir("data", { recursive: true });
  await writeFile("data/prices.json", JSON.stringify({
    generated_at: new Date().toISOString(),
    count: stations.length,
    stations,
  }));
  console.log(`Wrote data/prices.json with ${stations.length} stations.`);
}

main().catch(e => { console.error(e); process.exit(1); });
