# Fill-Up — cheapest forecourt by true cost

A free web app that finds the cheapest place to fill up near you, ranked by
**true cost** — the pump price plus the fuel you'd burn driving there and back —
not just the sticker price. It runs on live UK prices from the government
[Fuel Finder](https://www.fuel-finder.service.gov.uk) scheme.

**Live site:** https://taja0001.github.io/fuel-calc/

## Features

- **True-cost ranking** — forecourts scored on fill cost plus the fuel to drive there and back, so a cheap-but-far station is judged fairly against a dearer one nearby.
- **Cheapest by brand** — two lists, Supermarkets and Fuel brands, each sorted cheapest-first.
- **Directions** — one tap opens Google Maps navigation to any forecourt.
- **Location** — search by postcode (via postcodes.io) or use your current location.
- **Private saved car** — mpg / tank / fuel type are saved in your browser only (localStorage). Never uploaded, never in the repo, invisible to anyone else.
- **Freshness indicator** — the footer shows how long ago the prices were updated.
- **Add to home screen** — works as a web-app shortcut on your phone.
- **Light & dark themes**, automatic.

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

## Repository layout

| Path | Purpose |
|------|---------|
| `index.html` | The whole app — UI and logic in one file. |
| `data/prices.json` | Current prices for ~8,000 UK forecourts. Written by the Pi. |
| `scripts/build-prices.mjs` | The fetcher: pulls Fuel Finder, merges, writes `prices.json`. |

## The data pipeline (`scripts/build-prices.mjs`)

Node 20+, no dependencies (uses the built-in `fetch`). It:

1. Gets an OAuth token from Fuel Finder (`POST /api/v1/oauth/generate_access_token`).
2. Pages through two endpoints (500 records per batch, looped): `/api/v1/pfs` for
   station info (location, brand) and `/api/v1/pfs/fuel-prices` for prices.
3. Merges them by `node_id`, keeping open stations that have a location and at least
   one price.
4. Rewrites `data/prices.json` only when a price actually changed, so quiet hours
   produce no commit.

Credentials come from the environment variables `FF_CLIENT_ID` and `FF_CLIENT_SECRET`
(never committed).

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

## Maintenance notes

- A supermarket showing under "Fuel brands"? Add its name to the `SUPERMARKETS` list
  near the bottom of `index.html`.
- Rotating the API secret? Update `~/fuel/secrets.env` on the Pi. Nothing in the repo
  changes.

## Data & licence

Fuel prices come from the UK Government **Fuel Finder** scheme (Open Government
Licence v3.0). Postcode lookup uses **postcodes.io** (Open Government Licence).
Distances are straight-line × 1.3 as a road-distance estimate, and calculations use
UK gallons (1 gallon = 4.54609 litres).
