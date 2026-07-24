# Fill-Up

A free web app that finds the cheapest forecourt to fill up at — ranked by
**true cost** (pump price + the fuel you burn driving there and back), not just
the sticker price. Prices come from the UK Government
[Fuel Finder](https://www.fuel-finder.service.gov.uk) open-data scheme.

## What's in here

| File | What it does |
|------|--------------|
| `index.html` | The whole app. Runs on sample data out of the box. |
| `data/prices.json` | The price data the app reads. Sample now; overwritten live by the Action. |
| `scripts/build-prices.mjs` | Fetches real prices from Fuel Finder (server-side, holds the secret). |
| `.github/workflows/update-prices.yml` | Runs the fetcher every 30 min and commits the data. |

## Get it live (5 steps)

### 1. Put these files in a public GitHub repo
Create a repo (e.g. `fuel-calc`), then add every file here keeping the folder
layout (`data/`, `scripts/`, `.github/workflows/`).

### 2. Turn on GitHub Pages
Repo **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.
After a minute you'll get a URL like `https://<you>.github.io/fuel-calc/`.
**It already works here on sample data.**

### 3. Register for the Fuel Finder API
At <https://www.developer.fuel-finder.service.gov.uk> (sign in with GOV.UK One
Login). From the portal, collect:
- your **Client ID** and **Client secret**
- the **token URL** and the **prices endpoint** (from the API guide)
- the **response field names** (from the API fields guide)

### 4. Fill in the fetcher
- In `scripts/build-prices.mjs`, replace the three `<<< TODO` lines
  (`TOKEN_URL`, `PRICES_URL`, and `SCOPE` if needed), and adjust `normalise()`
  so the field names match the real API response.
- Add your secrets in **Settings → Secrets and variables → Actions → New
  repository secret**: `FF_CLIENT_ID` and `FF_CLIENT_SECRET`.

### 5. Run it once
**Actions tab → Update fuel prices → Run workflow.** It writes real prices into
`data/prices.json`, and from then on refreshes automatically every 30 minutes.
Your page picks up live prices with no further changes.

## Put it on your phone
Open the Pages URL in Safari → **Share → Add to Home Screen**. Behaves like an
app, no App Store, no fee.

## Notes
- Distances are straight-line × 1.3 (a rough road-distance estimate). Good
  enough for ranking; not turn-by-turn accurate.
- Calculations use UK gallons (1 gal = 4.54609 L). Enter mpg as miles per UK gallon.
- Everything is free: GitHub Pages hosting, GitHub Actions (unlimited on public
  repos), and the Fuel Finder data (Open Government Licence). A custom domain is
  the only optional paid extra (~£8–12/yr).
