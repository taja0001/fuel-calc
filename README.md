# Fill-Up — cheapest forecourt by true cost

A free web app that finds the cheapest place to fill up, ranked by
**true cost** — the pump price plus the fuel you'd actually burn getting there —
not just the sticker price. It runs on live UK prices from the government
[Fuel Finder](https://www.fuel-finder.service.gov.uk) scheme.

**Live site:** https://fuel.thomasainsworth.co.uk

## Features

- **True-cost ranking** — forecourts scored on fill cost plus the fuel to drive there (and back), using **real road distances**, so a cheap-but-far station is judged fairly against a dearer one nearby.
- **Two modes:**
  - **Near me** — cheapest fill-ups within a radius of a postcode or your current location.
  - **Plan a journey** — enter a start and destination and it finds the cheapest fill-up **on the way**, ranked by pump price plus the small detour off your route.
- **Open now** — just under half of UK forecourts close at some point, so a closed one is greyed out, marked with when it opens, and can never be ranked best value. Motorway services are labelled too.
- **Cheapest by brand** — two lists, Supermarkets and Fuel brands, sorted cheapest-first. Brand-name variants are merged (e.g. `BP` / `BP OIL UK` / `BP HARVEST ENERGY` → one **BP**), and each brand row taps to expand its individual branches.
- **Directions** — one tap opens Google Maps navigation to any forecourt.
- **Location** — postcode (via postcodes.io) or current location.
- **Private saved car** — mpg / tank / fuel type are saved in your browser only (localStorage). Never uploaded, never in the repo, invisible to anyone else.
- **Freshness indicator** — the footer shows how long ago the prices last changed.
- **Price confidence** — a price the feed hasn't confirmed in over a fortnight is badged with its age, rather than shown as though it were current.
- **Works with no signal** — opens instantly from cache and keeps the last prices you had, which is the situation you're actually in when deciding where to fill up. Location search still works offline; postcode lookup can't, and says so.
- **Add to home screen** — installable web-app shortcut with its own icon, via `manifest.json` and `sw.js` on Android and the Apple meta tags on iOS.
- **Light & dark themes**, automatic.
- **Privacy-friendly analytics** — Cloudflare Web Analytics (no cookies, no consent banner).

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
| `scripts/build-prices.mjs` | The fetcher: pulls Fuel Finder, merges, writes `prices.json`. |
| `scripts/validate-prices.mjs` | Sanity-checks `prices.json`; run by GitHub Actions on every push. |
| `.github/workflows/validate-prices.yml` | The one live Action. Validates data only — no API access. |
| `workflows/update-prices.yml` | **Parked, does nothing.** Not in `.github/`, so GitHub never reads it. Kept as a record of why Actions can't do the fetch. |
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
7. Pings `FF_PING_URL` on success, if set (see **Knowing when the Pi dies**).

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
| `FF_PING_URL` | no | Pinged after a successful run; drives the dead-man's switch. |
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

**`VERSION` in `sw.js` only needs bumping to force old caches out** — if the precache
list or these strategies change. Ordinary edits to `index.html` propagate by themselves.

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
  footer turns amber and a warning appears above the results telling you to check the
  price at the pump.
- **By email** — create a check at [healthchecks.io](https://healthchecks.io) (free),
  set its period to 1 hour, and put its ping URL in `~/fuel/secrets.env`:

  ```
  export FF_PING_URL=https://hc-ping.com/your-uuid-here
  ```

  The fetcher pings it after every successful run, including runs where prices hadn't
  moved. If the Pi loses power, loses its network, or the fetch keeps failing, the
  pings stop and healthchecks.io emails you. A failed ping never fails the run.

## The Raspberry Pi

Three things live on the Pi, outside this repo (they hold secrets or are host-specific):

**`~/fuel/secrets.env`** — the API credentials:

```
export FF_CLIENT_ID=your_client_id
export FF_CLIENT_SECRET=your_client_secret
```

**`~/fuel/update-fuel-prices.sh`** — the hourly runner. Waits for the network (wakes
idle wifi), then pulls, runs the fetcher, and commits/pushes, retrying up to 3× on a
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

Served at `fuel.thomasainsworth.co.uk` via GitHub Pages. DNS is a Cloudflare `CNAME`
`fuel` → `taja0001.github.io`, set to **DNS-only (grey cloud)** so GitHub can issue
its own HTTPS certificate. (Proxying through Cloudflare blocks the cert.)

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

## Data, services & licence

- Fuel prices: UK Government **Fuel Finder** scheme (Open Government Licence v3.0).
- Postcode lookup: **postcodes.io** (Open Government Licence).
- Distances & routing: **OSRM** public demo (OpenStreetMap data, ODbL). Distances
  fall back to a straight-line × 1.3 estimate if OSRM is unavailable.
- Calculations use UK gallons (1 gallon = 4.54609 litres).
