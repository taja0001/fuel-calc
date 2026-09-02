// Generates the /petrol/<slug>/ area pages, the /petrol/ index, and sitemap.xml
// from data/prices.json — plans/town-pages.md phase 2, previewed and picked
// 2026-09-03. Run by hand (`node scripts/build-pages.mjs`) or by the daily Action.
//
// Design rules this file enforces (the plan's words):
// - Gate: only areas with >= MIN_STATIONS stations get a page — nothing thin ships.
// - Every number on a page is computed from the data; no two pages share prose.
// - The freshness stamp says "as of <date>" and NEVER "live" — the page regenerates
//   daily; the app is the live path and the CTA says so.
// - Plain register: "petrol station", "unleaded (E10)", never bare fuel codes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const MIN_STATIONS = 10;
const FORTNIGHT_MIN = 14 * 24 * 60;
const ORIGIN = "https://whichpump.co.uk";

// ---- name calming, PORTED from index.html (~line 491). If the app's caseName
// changes, change this too — tests/pages.test.mjs pins the shared behaviour.
const NAME_SUFFIX = /[\s-]*(petrol\s*filling\s*station|filling\s*station|service[-\s]station|petrol\s*station|pfs)\s*$/i;
const NAME_SMALL = new Set(["the","and","of","on","at","in","by","sea","way","end"]);
export const caseName = raw => {
  const x = String(raw || "").replace(NAME_SUFFIX, "").trim();
  if (!x || x !== x.toUpperCase()) return x;
  return x.toLowerCase().replace(/(^|[^a-z0-9'])([a-z][^\s-]*)/g, (_, before, word) =>
    before + (word.length <= 3 && !NAME_SMALL.has(word) ? word.toUpperCase()
                               : word[0].toUpperCase() + word.slice(1)));
};
export const label = s => {
  const brand = caseName(s.brand || ""), place = caseName(s.name || s.postcode || "");
  if (!place) return brand;
  if (!brand) return place;
  if (place.toLowerCase().includes(brand.toLowerCase())) return place;
  const lead = brand.split(/\s+/)[0].toLowerCase();
  const rest = place.split(/\s+/);
  if (rest.length > 1 && rest[0].toLowerCase() === lead) return `${brand} ${rest.slice(1).join(" ")}`;
  return `${brand} ${place}`;
};

// Curated area -> city names: the areas whose city is unambiguous to a stranger.
// Everything else keeps its code as the slug until tier 2's real city data flows.
export const AREA_NAMES = {
  // Every UK postcode area, by its official post-town name — the area codes are
  // derived from these, so the mapping is canonical, not editorial. Unknown codes
  // fall back to the code slug (belt and braces for feed oddities).
  // England
  AL: "St Albans", B: "Birmingham", BA: "Bath", BB: "Blackburn", BD: "Bradford",
  BH: "Bournemouth", BL: "Bolton", BN: "Brighton", BR: "Bromley", BS: "Bristol",
  CA: "Carlisle", CB: "Cambridge", CH: "Chester", CM: "Chelmsford",
  CO: "Colchester", CR: "Croydon", CT: "Canterbury", CV: "Coventry", CW: "Crewe",
  DA: "Dartford", DE: "Derby", DH: "Durham", DL: "Darlington", DN: "Doncaster",
  DT: "Dorchester", DY: "Dudley", EN: "Enfield", EX: "Exeter", FY: "Blackpool",
  GL: "Gloucester", GU: "Guildford", HA: "Harrow", HD: "Huddersfield",
  HG: "Harrogate", HP: "Hemel Hempstead", HR: "Hereford", HU: "Hull",
  HX: "Halifax", IG: "Ilford", IP: "Ipswich", KT: "Kingston upon Thames",
  L: "Liverpool", LA: "Lancaster", LE: "Leicester", LN: "Lincoln", LS: "Leeds",
  LU: "Luton", M: "Manchester", ME: "Medway", MK: "Milton Keynes",
  NE: "Newcastle upon Tyne", NG: "Nottingham", NN: "Northampton", NR: "Norwich",
  OL: "Oldham", OX: "Oxford", PE: "Peterborough", PL: "Plymouth",
  PO: "Portsmouth", PR: "Preston", RG: "Reading", RH: "Redhill", RM: "Romford",
  S: "Sheffield", SG: "Stevenage", SK: "Stockport", SL: "Slough",
  SM: "Sutton", SN: "Swindon", SO: "Southampton", SP: "Salisbury",
  SR: "Sunderland", SS: "Southend-on-Sea", ST: "Stoke-on-Trent", TA: "Taunton",
  TF: "Telford", TN: "Tonbridge", TQ: "Torquay", TR: "Truro",
  TS: "Middlesbrough", TW: "Twickenham", UB: "Uxbridge", WA: "Warrington",
  WD: "Watford", WF: "Wakefield", WN: "Wigan", WR: "Worcester", WS: "Walsall",
  WV: "Wolverhampton", YO: "York",
  // Scotland
  AB: "Aberdeen", DD: "Dundee", DG: "Dumfries", EH: "Edinburgh", FK: "Falkirk",
  G: "Glasgow", HS: "Outer Hebrides", IV: "Inverness", KA: "Kilmarnock",
  KW: "Orkney", KY: "Kirkcaldy", ML: "Motherwell", PA: "Paisley", PH: "Perth",
  TD: "Galashiels", ZE: "Shetland",
  // Wales
  CF: "Cardiff", LD: "Llandrindod Wells", LL: "Llandudno", NP: "Newport",
  SA: "Swansea", SY: "Shrewsbury",
  // Northern Ireland is one postcode area; name it what people search.
  BT: "Northern Ireland",
  // London compass areas read as London, not as codes.
  E: "London (E)", EC: "London (EC)", N: "London (N)", NW: "London (NW)",
  SE: "London (SE)", SW: "London (SW)", W: "London (W)", WC: "London (WC)",
};
export const areaOf = pc => (String(pc || "").match(/^([A-Z]{1,2})\d/) || [])[1] || null;
export const slugOf = a => (AREA_NAMES[a] || a).toLowerCase().replace(/[() ]+/g, "-").replace(/-+$/, "").replace(/-+/g, "-");
const displayName = a => AREA_NAMES[a] || a;
const longName = a => AREA_NAMES[a] ? `${AREA_NAMES[a]} (${a})` : `the ${a} postcode area`;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

export function groupAreas(stations) {
  const byArea = new Map();
  for (const s of stations) {
    const a = areaOf(s.postcode);
    if (!a) continue;                      // malformed postcode: dropped, never paged
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a).push(s);
  }
  return new Map([...byArea].filter(([, list]) => list.length >= MIN_STATIONS));
}

const CSS = `
  :root{color-scheme:light dark;
    --ground:#f4f1ea;--panel:#fff;--ink:#221d16;--ink-soft:#6b6154;--hair:#e4ddd0;
    --amber:#b8720a;--warn:#b45309;--shadow:0 1px 2px rgba(34,29,22,.06),0 12px 28px rgba(34,29,22,.10);}
  @media (prefers-color-scheme: dark){
    :root{--ground:#141210;--panel:#201c17;--ink:#f2ece1;--ink-soft:#a89c89;
      --hair:#322c24;--amber:#ffb020;--warn:#e0a54a;
      --shadow:0 1px 2px rgba(0,0,0,.4),0 16px 34px rgba(0,0,0,.5);}}
  body{margin:0;background:var(--ground);color:var(--ink);line-height:1.5;
    font-family:Seravek,'Gill Sans Nova',Ubuntu,Calibri,'DejaVu Sans','Trebuchet MS',sans-serif;
    -webkit-font-smoothing:antialiased;}
  .wrap{max-width:640px;margin:0 auto;padding:26px 16px 60px;}
  .badge{display:flex;justify-content:center;align-items:center;gap:7px;font-size:11px;font-weight:700;
    letter-spacing:.14em;text-transform:uppercase;color:var(--amber);margin-bottom:8px;}
  .crumb{font-size:12px;color:var(--ink-soft);text-align:center;margin-bottom:14px;}
  .crumb a,a{color:var(--amber);}
  .crumb a{text-decoration:none;}
  h1{font-size:26px;margin:0;text-wrap:balance;text-align:center;}
  .tag{color:var(--ink-soft);font-size:14px;margin:4px 0 18px;text-align:center;}
  .sum{background:var(--panel);border:1px solid var(--hair);border-radius:14px;
    padding:14px 16px;margin:0 0 14px;box-shadow:var(--shadow);font-size:14.5px;}
  .sum b{font-variant-numeric:tabular-nums;}
  .stamp{font-size:12.5px;color:var(--ink-soft);margin:0 0 18px;text-align:center;}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--hair);
    border-radius:14px;overflow:hidden;box-shadow:var(--shadow);font-size:14px;}
  th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);
    text-align:left;padding:10px 10px 6px;border-bottom:1px solid var(--hair);}
  th.n,td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  td{padding:8px 10px;border-bottom:1px solid var(--hair);vertical-align:top;}
  tr:last-child td{border-bottom:none;}
  tbody tr:first-child td{background:color-mix(in srgb, var(--amber) 8%, transparent);}
  .st b{font-weight:600;}
  .st .pc{color:var(--ink-soft);font-size:12px;}
  .pill{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;
    text-transform:uppercase;border:1px dashed var(--warn);color:var(--warn);
    border-radius:99px;padding:0 7px;margin-left:5px;white-space:nowrap;}
  .cta{display:block;text-align:center;background:var(--amber);color:var(--ground);
    font-weight:700;font-size:16px;text-decoration:none;border-radius:12px;
    padding:13px 20px;margin:18px 0 8px;}
  .why{font-size:13px;color:var(--ink-soft);text-align:center;margin:0 0 22px;}
  .near{font-size:14px;margin:20px 0 0;}
  .idx{columns:2;font-size:14.5px;line-height:2;}
  footer{margin-top:26px;font-size:12px;color:var(--ink-soft);text-align:center;line-height:1.6;}
`;
const ANALYTICS = `<!-- Cloudflare Web Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "895bc6f8e681409ebd1e945ad5fafeb2"}'></script><!-- End Cloudflare Web Analytics -->`;

function head(title, desc, path, crumbs) {
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, url], i) => ({
      "@type": "ListItem", position: i + 1, name, item: ORIGIN + url })),
  };
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}${path}">
<link rel="icon" href="/icon-192.png">
<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
<style>${CSS}</style>
${ANALYTICS}
</head>`;
}

export function renderArea(a, list, ctx) {
  const name = displayName(a);
  const withE10 = list.filter(s => s.prices.E10).sort((x, y) => x.prices.E10 - y.prices.E10);
  const rows = withE10.concat(list.filter(s => !s.prices.E10)); // diesel-only stations still listed
  const avgE10 = mean(withE10.map(s => s.prices.E10));
  const withB7 = list.filter(s => s.prices.B7);
  const avgB7 = withB7.length ? mean(withB7.map(s => s.prices.B7)) : null;
  const cheap = withE10[0];
  const vsUk = avgE10 - ctx.ukE10;
  const vsUkWords = Math.abs(vsUk) < 0.05 ? "level with the UK average"
    : vsUk < 0 ? `${Math.abs(vsUk).toFixed(1)}p cheaper than the UK average`
    : `${vsUk.toFixed(1)}p dearer than the UK average`;

  const tr = rows.map(s => {
    const oldE10 = s.prices.E10 && s.pu && s.pu.E10 && (ctx.nowMin - s.pu.E10 > FORTNIGHT_MIN);
    const weeks = oldE10 ? Math.round((ctx.nowMin - s.pu.E10) / (7 * 24 * 60)) : 0;
    const pills = [
      /costco/i.test(s.brand || "") ? '<span class="pill">members only</span>' : "",
      oldE10 ? `<span class="pill">price ${weeks} wk${weeks === 1 ? "" : "s"} old</span>` : "",
    ].join("");
    return `<tr><td class="st"><b>${esc(label(s))}</b>${pills}<br><span class="pc">${esc(s.postcode)}</span></td>
<td class="n">${s.prices.E10 ? s.prices.E10.toFixed(1) + "p" : "—"}</td>
<td class="n">${s.prices.B7 ? s.prices.B7.toFixed(1) + "p" : "—"}</td></tr>`;
  }).join("\n");

  const near = ctx.neighbours(a).map(k =>
    `<a href="/petrol/${slugOf(k)}/">${esc(displayName(k))}</a>`).join(" · ");
  const path = `/petrol/${slugOf(a)}/`;
  const title = `Cheapest petrol in ${name} — ${list.length} stations compared | Fill-Up`;
  const desc = `All ${list.length} petrol stations in ${longName(a)}, cheapest first. ` +
    `Unleaded from ${cheap.prices.E10.toFixed(1)}p, area average ${avgE10.toFixed(1)}p. ` +
    `Free, no sign-up — prices from the government Fuel Finder scheme.`;

  return head(title, desc, path, [["Fill-Up", "/"], ["Petrol prices by area", "/petrol/"], [name, path]]) + `
<body>
<div class="wrap">
  <div class="badge"><span aria-hidden="true">⛽</span> Fill-Up</div>
  <nav class="crumb"><a href="/">Fill-Up</a> › <a href="/petrol/">Petrol prices by area</a> › ${esc(name)}</nav>
  <h1>Where's cheapest to fill up in ${esc(name)}?</h1>
  <p class="tag">All ${list.length} petrol stations in ${esc(longName(a))}, cheapest first. Free, no sign-up.</p>

  <div class="sum">Cheapest unleaded today is <b>${cheap.prices.E10.toFixed(1)}p</b> at
  ${esc(label(cheap))} — <b>${(avgE10 - cheap.prices.E10).toFixed(1)}p</b> under the area
  average of <b>${avgE10.toFixed(1)}p</b>.${avgB7 ? ` Diesel averages <b>${avgB7.toFixed(1)}p</b>.` : ""}
  ${esc(name)} is ${vsUkWords}.</div>

  <p class="stamp">Prices as of ${ctx.asOfWords}, retailer-reported to the government
  <a href="https://www.fuel-finder.service.gov.uk">Fuel Finder</a> scheme.</p>

  <table>
    <thead><tr><th>Petrol station</th><th class="n">Unleaded (E10)</th><th class="n">Diesel (B7)</th></tr></thead>
    <tbody>
${tr}
    </tbody>
  </table>

  <a class="cta" href="/?pc=${esc(a)}">Get the true cost for your car →</a>
  <p class="why">Live prices, plus the fuel you'd burn driving to each one — the bit
  that needs your mpg. Takes one postcode.</p>

  <p class="near"><b>Nearby:</b> ${near}</p>

  <footer>Built and run by one person. No ads, no accounts — this page is static and
  regenerates daily. Contains public sector information licensed under the
  <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>.</footer>
</div>
</body>
</html>`;
}

export function renderIndex(areas, ctx) {
  const links = [...areas.keys()].sort((x, y) => displayName(x).localeCompare(displayName(y)))
    .map(a => `<a href="/petrol/${slugOf(a)}/">${esc(displayName(a))}</a> <span style="color:var(--ink-soft)">(${areas.get(a).length})</span>`)
    .join("<br>\n");
  const path = "/petrol/";
  const title = `UK petrol prices by area — ${areas.size} areas compared | Fill-Up`;
  const desc = `Cheapest petrol and diesel in ${areas.size} UK postcode areas, from live government data. Free, no sign-up.`;
  return head(title, desc, path, [["Fill-Up", "/"], ["Petrol prices by area", path]]) + `
<body>
<div class="wrap">
  <div class="badge"><span aria-hidden="true">⛽</span> Fill-Up</div>
  <nav class="crumb"><a href="/">Fill-Up</a> › Petrol prices by area</nav>
  <h1>Petrol prices by area</h1>
  <p class="tag">${areas.size} UK postcode areas, each compared cheapest-first.
  Prices as of ${ctx.asOfWords}. Free, no sign-up.</p>
  <div class="idx">
${links}
  </div>
  <a class="cta" href="/">Get the true cost for your car →</a>
  <footer>Built and run by one person. No ads, no accounts. Contains public sector
  information licensed under the
  <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>.</footer>
</div>
</body>
</html>`;
}

export function renderSitemap(areas, isoDate) {
  const urls = ["/", "/petrol/"].concat([...areas.keys()].map(a => `/petrol/${slugOf(a)}/`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${isoDate}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;
}

function main() {
  const feed = JSON.parse(readFileSync(new URL("data/prices.json", ROOT), "utf8"));
  const areas = groupAreas(feed.stations);
  const asOf = new Date(feed.generated_at);
  const centroids = new Map([...areas].map(([a, list]) =>
    [a, { lat: mean(list.map(s => s.lat)), lng: mean(list.map(s => s.lng)) }]));
  const ctx = {
    ukE10: mean(feed.stations.filter(s => s.prices.E10).map(s => s.prices.E10)),
    asOfWords: asOf.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    nowMin: Math.floor(Date.now() / 60000),
    neighbours: a => {
      const c = centroids.get(a);
      return [...centroids].filter(([k]) => k !== a)
        .map(([k, v]) => ({ k, d: (v.lat - c.lat) ** 2 + (v.lng - c.lng) ** 2 }))
        .sort((x, y) => x.d - y.d).slice(0, 4).map(n => n.k);
    },
  };
  for (const [a, list] of areas) {
    const dir = new URL(`petrol/${slugOf(a)}/`, ROOT);
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL("index.html", dir), renderArea(a, list, ctx));
  }
  mkdirSync(new URL("petrol/", ROOT), { recursive: true });
  writeFileSync(new URL("petrol/index.html", ROOT), renderIndex(areas, ctx));
  writeFileSync(new URL("sitemap.xml", ROOT), renderSitemap(areas, asOf.toISOString().slice(0, 10)));
  console.log(`${areas.size} area pages + index + sitemap (as of ${ctx.asOfWords})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
