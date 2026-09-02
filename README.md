# Fill-Up — cheapest forecourt by true cost

A free web app that finds the cheapest place to fill up, ranked by
**true cost** — the pump price plus the fuel you'd actually burn getting there —
not just the sticker price. It runs on live UK prices from the government
[Fuel Finder](https://www.fuel-finder.service.gov.uk) scheme.

**Live site:** https://whichpump.co.uk

## Features

- **True-cost ranking** — forecourts scored on fill cost plus the fuel to drive there (and back), using **real road distances**, so a cheap-but-far station is judged fairly against a dearer one nearby.
- **Two modes:**
  - **Near me** — cheapest fill-ups within a radius of a postcode or your current location.
  - **Plan a journey** — enter a start and destination and it finds the cheapest fill-up **on the way**, ranked by pump price plus the small detour off your route. It also says what the trip itself will cost: "this 280 mile trip will burn about 33 L — around £50 at the best price on your route".
- **Minutes, not just miles** — every distance carries drive time ("2.6 mi · 7 min away"), from the same routing requests. When routing is unavailable and distances are estimates, minutes are omitted rather than invented.
- **What the search saved you** — "£0.75 cheaper than your nearest (Sainsbury's · 1.4 mi · 4 min)": the comparison against just driving to the closest open forecourt, which is what people do without the app.
- **Fuel level like the dash shows it** — quick buttons for the quarters, plus a slider marked like a real gauge (0–1, ticks at every eighth) with a live litres-to-fill readout. Feeds the fill cost and the journey range estimate alike.
- **Open now** — just under half of UK forecourts close at some point, so a closed one is greyed out, marked with when it opens, and can never be ranked best value. Motorway services are labelled too.
- **Cheapest by brand** — two lists, Supermarkets and Fuel brands, sorted cheapest-first. Brand-name variants are merged (e.g. `BP` / `BP OIL UK` / `BP HARVEST ENERGY` → one **BP**), and each brand row taps to expand its individual branches.
- **Directions** — one tap opens Google Maps navigation to any forecourt.
- **Location** — postcode, half postcode (NG1), town name (Nottingham), or current location — all via postcodes.io. A fuzzy match is announced ("Showing prices near …") rather than silently trusted.
- **Private saved car** — mpg / tank / fuel type are saved in your browser only (localStorage). Never uploaded, never in the repo, invisible to anyone else.
- **Freshness indicator** — the footer shows how long ago the prices last changed;
  if the hourly feed stops (3+ missed rounds) or you are offline, a warning lamp
  lights in the header badge and a plain sentence appears under the tagline saying so.
- **Price trend** — a small chart of the UK average over the last four weeks, drawn from `data/index.json`: one row per day, maintained by the Pi alongside the prices, ~400 bytes over the wire for a month. Hover for any day; a table view sits underneath for screen readers and sceptics.
- **Price confidence** — a price the feed hasn't confirmed in over a fortnight is badged with its age, rather than shown as though it were current.
- **Works with no signal** — opens instantly from cache and keeps the last prices you had, which is the situation you're actually in when deciding where to fill up. Location search still works offline; postcode lookup can't, and says so.
- **Announces its own updates** — a cached app can linger on an old version silently, so when a newer one exists a pill appears: "App updated — tap to refresh". Checked on load and whenever the app returns to the foreground.
- **Add to home screen** — installable web-app shortcut with its own icon, via `manifest.json` and `sw.js` on Android and the Apple meta tags on iOS.
- **Light & dark themes**, automatic.
- **Privacy-friendly analytics** — Cloudflare Web Analytics (no cookies, no consent banner).
- **First-party search counter** — one four-word tally per search (mode, outcome, and an
  area no finer than a postcode district like `NG1`, or the literal word `gps`). No IP
  stored, no identifier, nothing that can point at a person; the payload shape is
  enforced by browser tests and re-checked server-side (the Worker source lives in
  `workers/search-counter.js`, deployed at `counter.whichpump.co.uk`). Contract and
  rationale: [plans/search-counter.md](plans/search-counter.md).
- **Remembers your last search** — postcode/radius or the whole journey, prefilled on
  the next visit from localStorage only (same privacy rule as the saved car). Never
  auto-runs, and a GPS search saves the radius but no location at all.
- **Costco rows say "members only"** — flagged, never hidden.
- **Panel-tested copy** — the headline, tagline and their pairing won five rounds of
  blind simulated-first-timer panels (275 ballots) before shipping.
- **A 404 page in the house voice** — the pump display shows the status code; one
  button home; zero JavaScript, renders even mid-broken-deploy.

## How it works

The site is a single static page. The interesting part is the data pipeline:

1. A **Raspberry Pi at home** fetches prices from Fuel Finder every hour.
2. It writes `data/prices.json` and pushes it to this repo.
3. **GitHub Pages** serves that file to the app like any other static file.

**Why a Raspberry Pi?** The Fuel Finder API sits behind a firewall (AWS CloudFront)
that blocks datacenter/cloud IPs — GitHub Actions and cloud schedulers all get a
`403`. Only ordinary residential connections are accepted, so the fetch has to run
on a machine at home. The Pi does that and pushes the results here; the app then
reads them with no API key ever exposed in the browser.

In the browser, the app also calls two free services directly: **postcodes.io**
(turn a postcode into coordinates) and **OSRM** (real driving distances, and the
route for journey mode). Both are cookieless and need no key.

## Repository layout

| Path | Purpose |
|------|---------|
| `index.html` | The whole app — UI and logic in one file. |
| `data/prices.json` | Current prices for ~8,000 UK forecourts. Written by the Pi. |
| `data/index.json` | The daily price index — one national-average row per day. Written by the Pi, backfillable from git history (`node scripts/build-index.mjs --backfill`). |
| `scripts/build-index.mjs` | Maintains the daily index; called by the fetcher after each write. |
| `scripts/build-prices.mjs` | The fetcher: pulls Fuel Finder, merges, writes `prices.json`. |
| `scripts/validate-prices.mjs` | Sanity-checks `prices.json`; run by GitHub Actions on every push. |
| `.github/workflows/validate-prices.yml` | Live Action: validates data on every push — no API access. |
| `.github/workflows/test.yml` | Live Action: runs the browser test suite on app changes. |
| `404.html` | Custom 404 in the pump-display voice — served by Pages for any bad path. |
| `robots.txt` / `sitemap.xml` | Crawler rules (internals kept out of search) and the one-URL sitemap, submitted to Google + Bing. |
| `CNAME` | The custom domain (`whichpump.co.uk`) — read by GitHub Pages. |
| `workers/search-counter.js` | The search counter Worker, deployed at `counter.whichpump.co.uk`. |
| `workflows/update-prices.yml` | **Parked, does nothing.** Not in `.github/`, so GitHub never reads it. Kept as a record of why Actions can't do the fetch. |
| `pi/README.md` | The contract the Pi's off-repo runner must honour — step order and the post-push heartbeat. |
| `CHANGELOG.md` | What's changed and when. |
| `manifest.json` | Web app manifest — name, icon, standalone display, theme colour. |
| `sw.js` | Service worker: caches the shell, keeps the last prices for offline. |
| `icon-192.png` | App icon (browser tab + home screen). |

## The data pipeline (`scripts/build-prices.mjs`)

Node 20+, no dependencies (uses the built-in `fetch`). It:

1. Gets an OAuth token from Fuel Finder (`POST /api/v1/oauth/generate_access_token`).
2. Pages through two endpoints until a page comes back empty: `/api/v1/pfs` for
   station info (location, brand) and `/api/v1/pfs/fuel-prices` for prices.
3. Merges them by `node_id`, keeping open stations that have a location and at least
   one price.
4. Discards records the feed gets wrong (see **Bad records** below).
5. Refuses to publish if the station count has fallen more than 10% since the last
   run — a truncated fetch would otherwise overwrite the national list with a partial
   one. Override with `FF_ALLOW_SHRINK=1`, or move the floor with `FF_MIN_RATIO`.
6. Rewrites `data/prices.json` only when a price actually changed, so quiet hours
   produce no commit.

The fetcher deliberately does **not** send the `FF_PING_URL` heartbeat — the commit
and push happen in the Pi's runner, after the fetcher exits, and pinging before the
push kept the dead-man's switch green while a rejected push left the site serving
stale prices. The runner pings after its push step instead (see **Knowing when the
Pi dies** and [`pi/README.md`](pi/README.md)).

Only the app's own fields are written out: brand, name, postcode, lat/lng to 5 decimal
places, and prices for the grades a station actually sells. The `node_id` is used
internally for a stable sort but never published — it and the street address were
about 40% of the file and the app reads neither.

Three more fields ride along, all short because they're on every record:

| Field | Meaning |
|---|---|
| `o` | Opening hours. `1` = 24/7; otherwise seven `[open, close]` pairs in minutes from midnight, Monday first. A 24-hour day is `[0, 1440]`, and `close < open` means it shuts after midnight. **Absent means the feed didn't say, and the app treats unknown as open** — better to show a forecourt that might be shut than hide one that's serving. |
| `sm` | Present (`1`) if the feed flags it a supermarket forecourt. Omitted otherwise. |
| `mw` | Present (`1`) if it's motorway services. Omitted otherwise. |
| `pu` | When the price last moved, in **minutes since the epoch** (8 digits, versus 24 for an ISO string; a minute is finer than "changed 3 hours ago" needs). One number when every grade at the station moved together, or an object keyed by grade when they didn't — the fetcher picks whichever the data requires rather than assuming. Absent means no usable timestamp. |

Around 3% of the feed hasn't been repriced in over a month. The app marks anything
older than 14 days with a dashed "Price 3 weeks old" badge, so a figure nobody has
confirmed since last season doesn't get presented with the same confidence as one from
an hour ago. Each run logs the age spread, so a drift towards staleness is visible.

Roughly half of all forecourts close at some point, so without `o` the app would
cheerfully recommend a shut one at midnight.

### Bad records

A few of the ~8,000 records in the feed are malformed, and they matter more than their
number suggests:

- **Prices in pounds.** Around eight forecourts report `1.309` rather than `130.9`.
  Read as pence, that station is 100× cheaper than anything else and wins every
  ranking outright. Prices outside **50–400p per litre** are dropped.
- **Broken coordinates.** A handful have latitude and longitude swapped, or the
  longitude sign dropped (`+2.945` for Somerset, which is the North Sea). Anything
  outside a UK bounding box is dropped, station and all — guessing at what was meant
  would be inventing data.

Each run logs what it discarded, so a sudden jump is visible in `fuel.log`.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `FF_CLIENT_ID`, `FF_CLIENT_SECRET` | yes | Fuel Finder API credentials (never committed). |
| `FF_PING_URL` | no | Dead-man's-switch ping URL. Consumed by the **runner** after a successful push, not by the fetcher (see `pi/README.md`). |
| `FF_MIN_RATIO` | no | Minimum share of the previous run's station count. Default `0.9`. |
| `FF_ALLOW_SHRINK` | no | Set to `1` to publish a genuine large drop anyway. |
| `FF_BASE` | no | Override the API base URL. |

## Offline (`sw.js`)

Two jobs, so two strategies:

| What | Strategy | Why |
|---|---|---|
| Shell (`index.html`, icon, manifest) | stale-while-revalidate | Opens with no network round-trip. Changes propagate on the next load. |
| `data/prices.json` | network-first, cache fallback | Prices move hourly; serving them cache-first would mean confidently quoting yesterday's. |
| postcodes.io, OSRM, analytics | not touched | Cross-origin, and replaying a cached route or postcode lookup would be plain wrong. |

When the network fails and the worker falls back, it adds an `X-From-Cache` header so the
app can say **"Offline · prices from 1h 28m ago"** rather than guessing. It can't use
`navigator.onLine` for this — that reports whether a network interface is up, and stays
`true` on a cell that carries no data or when the server itself is down.

What still works offline: opening the app, all ~8,000 cached prices, and searching by
current location. Distances fall back to straight-line × 1.3 because OSRM is
unreachable. Postcode search can't work at all, and says so, pointing at the 📍 button.

**`VERSION` in `sw.js` only needs bumping to force the old shell cache out** — if the
precache list or these strategies change. The prices cache sits outside the versioning
(it's named `data`, unversioned) so a bump never deletes a user's cached prices — they
may be the only copy an offline user has, and the worker migrates any old versioned
data cache across on activate. Ordinary edits to `index.html` propagate by themselves:
the shell is served one load behind by design, and when the background refresh finds a
newer page than the one on screen, the worker tells the page and an **"App updated —
tap to refresh"** pill appears. Returning to the foreground triggers the same check, so
even an iOS home-screen app resumed from memory — which never navigates — finds out.
Before that pill existed, users sat on old versions for hours and re-reported
already-fixed bugs.

## Tests

`npm install` once, then `npm test` (or `PW_CHANNEL=chrome npm test` to reuse the
Chrome you already have instead of downloading Chromium). Three layers, all run by
GitHub Actions on every push that touches the app:

- **Unit** — the fetcher's pure functions against shapes the real feed has actually
  sent: the 00:00–00:00 junk hours, pounds-instead-of-pence prices, grades that
  reprice independently.
- **Browser** — Playwright drives the real `index.html` against fixture data with the
  external services mocked and the clock pinned to 23:15, asserting the things that
  once regressed by hand: a closed forecourt with the lowest total never taking the
  top spot, the greying and pills, brand folding ("Kirkby Motors" is not Moto), slider
  eighths reaching the maths, and a failed refresh keeping real data rather than
  swapping in samples. The service worker is blocked in this suite — Playwright's
  request interception and worker-controlled pages don't mix.
- **Service worker** — a separate suite with *no* request interception, so the real
  `sw.js` handles real fetches against the tests' own server (which sends ETags, since
  that's how the worker detects a changed shell): prices served from cache with the
  offline footer when the network drops or the server errors mid-deploy, and the "App
  updated" toast appearing when the shell changes.

`npm run lint` checks the constraints that have actually shipped bugs: the charset
declaration staying inside the first 1024 bytes (past it, every £ renders as Â£ on any
host that sends no charset header), and the inline script, `sw.js` and pipeline
scripts all parsing.

**The app itself still has no dependencies** — `package.json` is dev tooling only, and
Playwright never ships to a visitor.

## Validation (`scripts/validate-prices.mjs`)

`.github/workflows/validate-prices.yml` runs this on every push that touches
`data/prices.json`. It needs no API access, so unlike the fetcher it isn't blocked by
the Fuel Finder firewall — it just reads what was committed and fails the build on
corrupt JSON, a suspiciously short list, coordinates outside the UK, or prices that
aren't plausible pence-per-litre. It's the backstop for a bad push from the Pi.

Run it locally the same way:

```
node scripts/validate-prices.mjs
```

A handful of odd records is normal in a government feed, so it only fails past 1% of
the file, and prints the rest as notes.

## Knowing when the Pi dies

Without this the site keeps serving older and older prices and nothing says so. Two
things cover it:

- **In the app** — past 3 hours since the last update (the Pi pushes hourly), the
  footer turns amber, a warn lamp lights in the header badge, and a sentence appears
  under the tagline telling you to check the price at the pump.
- **By email** — create a check at [healthchecks.io](https://healthchecks.io) (free),
  set its period to 1 hour, and put its ping URL in `~/fuel/secrets.env`:

  ```
  export FF_PING_URL=https://hc-ping.com/your-uuid-here
  ```

  The **runner** pings it as its last step, *after* the commit and push (and after
  no-change runs, where there's nothing to push). The order matters: the ping used to
  be sent by the fetcher, before the push existed — so an expired PAT or a rejected
  push left the site serving stale prices while the switch stayed green, the one
  failure class it exists to catch. If the Pi loses power, loses its network, the
  fetch keeps failing, **or the push is refused**, the pings stop and healthchecks.io
  emails you. A failed ping never fails the run. The exact runner step is in
  [`pi/README.md`](pi/README.md).

## The Raspberry Pi

Three things live on the Pi, outside this repo (they hold secrets or are host-specific):

**`~/fuel/secrets.env`** — the API credentials:

```
export FF_CLIENT_ID=your_client_id
export FF_CLIENT_SECRET=your_client_secret
```

**`~/fuel/update-fuel-prices.sh`** — the hourly runner. Waits for the network (wakes
idle wifi), then pulls, runs the fetcher, commits/pushes, and finally pings
`FF_PING_URL` — the heartbeat comes *after* the push so a rejected push stops the
pings (the full contract is in [`pi/README.md`](pi/README.md)). Retries up to 3× on a
transient failure. Scheduled in the user crontab:

```
0 * * * * /usr/bin/flock -n /tmp/fuel.lock /home/USER/fuel/update-fuel-prices.sh >> /home/USER/fuel/fuel.log 2>&1
```

**`~/fuel/net-watchdog.sh`** — connectivity self-heal. Scheduled in root's crontab
every 5 minutes; after ~10 min offline it restarts networking, after ~20 min it
reboots the Pi:

```
*/5 * * * * /home/USER/fuel/net-watchdog.sh >> /home/USER/fuel/watchdog.log 2>&1
```

Health check (one line per run):

```
tail -n 20 ~/fuel/fuel.log
```

Wifi power-saving is disabled on the Pi so it doesn't drop off the network when idle:

```
nmcli connection modify <connection-name> wifi.powersave 2
```

## Fuel Finder API access

Register once at https://www.developer.fuel-finder.service.gov.uk (GOV.UK One Login)
to get a client ID and secret, then put them in `~/fuel/secrets.env` on the Pi.

## Custom domain

Served at `whichpump.co.uk` via GitHub Pages (Enforce HTTPS on; the domain is
verified on the GitHub account via a permanent TXT record, added BEFORE any DNS
existed so the takeover class never applied). DNS is a Cloudflare apex `CNAME`
(flattened) → `taja0001.github.io`, set to **DNS-only (grey cloud)** so GitHub can
issue its own HTTPS certificate. (Proxying through Cloudflare blocks the cert.)
`www` folds into the bare domain, and `whichpump.uk` is held defensively (both
registered via Cloudflare Registrar).
The old `fuel.thomasainsworth.co.uk` is a permanent Cloudflare 301 to the new
domain, path and query preserved — it stays that way for years so every old
link and installed app keeps working.

## Maintenance notes

- A brand not merging? Edit the `BRAND_CANON` list near the top of the script in
  `index.html`.
- A supermarket showing under "Fuel brands" is no longer a manual fix: the split now
  uses the feed's own `is_supermarket_service_station` flag. The old `SUPERMARKETS`
  name list survives only as a fallback for data written before the flag was captured,
  and it missed 30% of supermarket forecourts because plenty don't trade under a
  supermarket's name.
- Rotating the API secret? Update `~/fuel/secrets.env` on the Pi. Nothing in the repo
  changes.
- Analytics: the Cloudflare beacon `<script>` is in the `<head>` of `index.html`;
  stats appear under Cloudflare → Web Analytics.

## Data & services

- Fuel prices: UK Government **Fuel Finder** scheme (Open Government Licence v3.0).
- Postcode lookup: **postcodes.io** (Open Government Licence).
- Distances & routing: **OSRM** public demo (OpenStreetMap data, ODbL). Distances
  fall back to a straight-line × 1.3 estimate if OSRM is unavailable.
- Calculations use UK gallons (1 gallon = 4.54609 litres).

## Licence

**The code is not open source.** Copyright © 2026 Thomas Ainsworth, all rights
reserved — see [LICENSE](LICENSE). The repository is public and the app's source
reaches every browser that loads it, because that's how the web works; neither is a
grant of permission. Want to use some of it? Ask.

**The data is a different matter.** `data/prices.json` derives from the Fuel Finder
scheme and stays under Open Government Licence v3.0, reusable with attribution. That
isn't mine to restrict.

Worth being realistic about what a licence does and doesn't do here: the code is the
easy part to copy and the least valuable. Reproducing this app also needs a Fuel Finder
registration, a *residential* connection to fetch from — the API's firewall blocks
datacenter IPs, so it won't run on a VPS — hourly uptime, and a price history that only
accumulates with time.
