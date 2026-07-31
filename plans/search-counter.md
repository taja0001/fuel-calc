# Plan: count searches (first-party, private)

Written **2026-07-31**. Cloudflare's beacon already answers "how many people"
(dashboard → Web Analytics). It cannot count events, and Zaraz (Cloudflare's event
tool) needs the site proxied — which would break the GitHub Pages certificate. So
search counting needs one small piece of our own.

## Design

```
phone taps search → navigator.sendBeacon("search,near,ok") → Cloudflare Worker
                  → one row in Workers Analytics Engine → SQL queries in dashboard
```

- **Payload is three words, ever:** event (`search`), mode (`near`|`journey`), outcome
  (`ok`|`err`). Never the postcode, GPS, radius or any identifier. A tally, not
  telemetry — the README's privacy stance stays true because there is nothing to track.
- **Worker (~25 lines):** validates the words against an allowlist (nobody can write
  junk into the tally), calls `SEARCHES.writeDataPoint(...)`, stores nothing else.
  Free tier ~100k requests/day vs our expected hundreds.
- **sendBeacon** is fire-and-forget: never slows a search, silently dropped when
  offline or ad-blocked. Slight undercount is accepted by design.
- **Privacy enforced by CI, not trust:** a browser test asserts the beacon fires on
  search AND that its payload never contains the postcode or coordinates.

## Steps

| # | Who | What |
|---|-----|------|
| 1 | Claude | Worker code (allowlist → `writeDataPoint`) |
| 2 | Claude | Two-line instrumentation in the search handler |
| 3 | Claude | Tests (fires; payload clean) + README privacy wording |
| 4 | Thomas | Dashboard → Workers & Pages → Create → paste → Deploy (~5 min) |
| 5 | Thomas | Worker Settings → Bindings → Analytics Engine dataset named `SEARCHES` (~2 min) |
| 6 | Both | Thomas pastes the `*.workers.dev` URL; Claude wires it in, one push |

## Reading the numbers

Analytics Engine is queried via a SQL box in the dashboard — the clunkiest part.
Three ready-made queries to supply with step 6: searches per day, near/journey split,
error rate. If pasting queries grates, a tiny private stats page is a later option —
start without it.

## What it unlocks

- **Searches-per-visitor** — the engagement ratio, which is the number the
  monetisation question actually turns on (100 visits/30 searches = landing-page
  problem; 100/300 = habit).
- Whether journey mode earns its complexity.
- First sight of real-world failure rate (OSRM flaking for actual users) without
  collecting anything about them.

## Why this route

GoatCounter would be quicker (one script tag) but adds a third party the ad-blockers
eat. A first-party Worker is barely blocked, free, private by construction — **and is
the same infrastructure the plate lookup needs** (see plate-lookup.md), so this is a
low-stakes rehearsal of that plan's main unknown.
