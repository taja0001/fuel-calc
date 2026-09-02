# Plan: count searches (first-party, private)

> **Update 2026-09-01.** The endpoint of record is now `counter.whichpump.co.uk`
> (Worker routed under the zone, 1 Sep; the workers.dev URL still answers for
> stale cached shells but is no longer what the app calls). BEACON and the CSP
> moved together in the same commit, per this plan's own rule. **Phase 2 (weekly
> digest) is unblocked** — the week of real traffic has elapsed; re-verify
> Cloudflare's Worker-to-email story at build time (flagged unstable in Aug).

Written **2026-07-31**. Cloudflare's beacon already answers "how many people"
(dashboard → Web Analytics). It cannot count events, and Zaraz (Cloudflare's event
tool) needs the site proxied — which would break the GitHub Pages certificate. So
search counting needs one small piece of our own.

## Design

```
phone taps search → navigator.sendBeacon("search,near,ok,NG1") → Cloudflare Worker
                  → one row in Workers Analytics Engine → SQL queries in dashboard
```

- **Payload is four words, ever** (was three; amended **2026-08-24**, Thomas's call,
  to answer "where is the app being used?"): event (`search`), mode (`near`|`journey`),
  outcome (`ok`|`err`), and the search **area** — the outward half of a typed postcode
  (`NG1`, never `NG1 5FS`), a typed place name (`nottingham`), or the literal word
  `gps` when the location button was used (nothing derived from coordinates is ever
  sent). Never the full postcode, GPS, radius or any identifier. An outward district
  is thousands of households, so a row still points at nowhere and no one — a tally,
  not telemetry, and the README's privacy stance stays true because there is still
  nothing that can identify a person. The area dimension is the demand-by-town data
  the SEO pages in monetisation.md are waiting on.
- **Worker (~25 lines):** validates the words against an allowlist — and the area
  word against shape, not a list: outward-code pattern or a length-capped lowercase
  place string; anything postcode-shaped-with-a-unit or coordinate-shaped is dropped
  server-side, so even a future client bug can't write precision into the tally.
  Calls `SEARCHES.writeDataPoint(...)`, stores nothing else — no IP, no user agent.
  Free tier ~100k requests/day vs our expected hundreds.
- **sendBeacon** is fire-and-forget: never slows a search, silently dropped when
  offline or ad-blocked. Slight undercount is accepted by design.
- **Privacy enforced by CI, not trust:** a browser test asserts the beacon fires on
  search AND that its payload never contains a full postcode, coordinates, the
  radius, or anything beyond the four allowlisted words — the area word must match
  the outward-code shape or the typed place name, nothing finer.

## Steps

| # | Who | What | State |
|---|-----|------|-------|
| 1 | Claude | Worker code (allowlist → `writeDataPoint`) | **Done 2026-08-24** — `workers/search-counter.js`, deploy notes in its header |
| 2 | Claude | Instrumentation in the search handler | **Done 2026-08-24** — `countSearch()` in index.html; inert until step 6 (`BEACON` is empty) |
| 3 | Claude | Tests (fires; payload clean) | **Done 2026-08-24** — two browser tests: 📍 searches say `gps`; typed postcodes are cut to district; every beacon any test fires is swept against the four-word grammar |
| 4 | Thomas | Dashboard → Workers & Pages → Create → paste `workers/search-counter.js` → Deploy (~5 min) | **Done 2026-08-24** — `search-counter.thomas-ainsworth1.workers.dev`, no Cloudflare Access (deliberate: the endpoint must be anonymously reachable) |
| 5 | Thomas | Worker → Settings → Bindings → Analytics Engine dataset named `SEARCHES` (~2 min) | **Done 2026-08-24** |
| 6 | Both | Thomas pastes the `*.workers.dev` URL; Claude wires it in, one push: the `BEACON` constant, the Worker's origin in the CSP `connect-src` (without it our own CSP blocks the beacon), and the README privacy bullet. | **Done 2026-08-24.** **Footer disclosure: Thomas ruled no** (2026-08-24) — no footer line; the README bullet and this plan are the documentation. Not legally required (no personal data is processed, no cookies set); don't re-add without his say-so. |

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

## Phase 2 — the weekly email (queued 2026-08-24, build once real data exists)

Thomas wants the counts *emailed*, not fetched from a dashboard SQL box. Right
instinct — the dashboard query is the clunkiest part of this design, and a number you
have to go and get is a number you stop looking at.

**Design:** a second tiny Worker on a Cron Trigger (weekly, Monday morning) queries
the tally via the Analytics Engine SQL API and emails a digest:

> 412 searches this week (+18% on last): Nottingham 210, Derby 61, gps 98, other 12 ·
> journey 22% · errors 1.9%

Aggregates only — the digest can't leak what the tally doesn't hold.

| Needs | Who | What |
|---|-----|------|
| Worker + cron + SQL query + formatting | Claude | ~40 lines; token read from a Worker secret, never the repo |
| API token (Account Analytics: Read) | Thomas | dashboard, ~2 min |
| Sending route | Both | **Verify at build time** — Cloudflare's Worker-to-email story has shifted (MailChannels' free tier died 2024; Email Routing's `send_email` binding to a verified destination is the current candidate). Fallback that definitely works: the Pi's weekly cron runs the same query and sends via SMTP — it already wakes hourly and holds secrets fine. |

**When:** after a week or two of real traffic — a digest of four test rows isn't
worth an email. Do not build before the counter has something to say.

## Why this route

GoatCounter would be quicker (one script tag) but adds a third party the ad-blockers
eat. A first-party Worker is barely blocked, free, private by construction — **and is
the same infrastructure the plate lookup needs** (see plate-lookup.md), so this is a
low-stakes rehearsal of that plan's main unknown.
