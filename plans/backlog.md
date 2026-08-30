# Backlog

Everything known-but-not-done, as of **2026-07-30**; **audited against the code
2026-08-24** — items found shipped are marked ✅ in place rather than deleted, so the
original reasoning stays readable. Nothing here is urgent; the app is in a good state.
Items are roughly in the order I'd tackle them, not in priority order — see the note at
the bottom of each for what it's actually worth.

Also see [price-history-plan.md](price-history-plan.md) for the price-history work,
[monetisation.md](monetisation.md) for where this is all heading — including the SEO gap,
which is the largest single opportunity and needs `location.city` captured to start —
and [security-review-2026-08-23.md](security-review-2026-08-23.md) for the outstanding
items from the 23 Aug security review (mostly account/DNS settings only Thomas can do;
two code findings already shipped). Newer arrivals: [domain-migration.md](domain-migration.md)
(move domains AND get Thomas's name off the site — do before the SEO pages and ideally
before saved postcodes), the weekly email digest queued as Phase 2 in
[search-counter.md](search-counter.md), and [forum-launch.md](forum-launch.md)
(2026-08-25: first users via Facebook groups + MSE — gated on the domain move, a repo
visibility decision, and venue-rules homework; MSE bans self-promotion outright, so the
route there is the forum team's blessing or an editorial pitch, never a self-post), and
[review-board-2026-08-30.md](review-board-2026-08-30.md) (the five-lens fresh-eyes
findings, items 7–24 plus two open AI-tells — **every batch from that board gets a
before/after preview artifact for Thomas BEFORE touching index.html**; fixes 4/5/6
shipped that way 30 Aug, fix 1 was rejected at preview, which is the system working).

---

## 0. Replace the OSRM demo server — blocks monetisation

**This is the gate on charging for anything.** Every road distance in the app — the
`/table` calls in "Near me", and both the route and the detour table in journey mode —
goes through `router.project-osrm.org`. That's the OSRM project's **public demo server**:
provided for testing and demonstration, no SLA, no commercial provision, and no support
if it slows down or disappears. Fine for a hobby project; not something to put revenue on
top of.

Options:

| Option | Cost | Notes |
|---|---|---|
| **Self-host OSRM** | A few pounds a month on a VPS with a UK OSM extract | Cheapest at volume, but yours to maintain and keep updated. |
| **Paid routing API** (Mapbox, OpenRouteService, Google) | Per-request | Simplest, but the bill grows with success — and the app makes up to 91 coordinates per search. |
| **Precompute** | Storage only | Distances between a user and ~8,000 fixed points can't be precomputed, but a cached grid of common origins might cut most calls. Unproven idea. |

Worth knowing the app already degrades gracefully: if routing fails it falls back to
straight-line × 1.3, so an outage makes answers less accurate rather than breaking the
app. That's what makes this a business risk rather than an availability one.

**Not a blocker: the fuel data itself.** Checked 2026-07-30 —
[The Motor Fuel Price (Open Data) Regulations 2025](https://www.legislation.gov.uk/uksi/2025/1356/introduction/made)
make this a statutory open-data scheme, published under **Open Government Licence v3.0**,
which permits commercial exploitation with attribution. The
[official guidance](https://www.gov.uk/guidance/access-the-latest-fuel-prices-and-forecourt-data-via-api-or-email)
names "comparison websites" and "app and website developers" among those who may use it.
Rate limits are **100 requests per minute** and **1 concurrent request** per client; a
fetcher run makes 34 requests sequentially, once an hour, so there's large headroom — and
because prices are served from a static file, user growth adds no API calls at all.

`postcodes.io` is the same class of dependency as OSRM: free, Open Government Licence, but
with fair-use expectations rather than a commercial tier. At volume, self-host from the ONS
Postcode Directory (free, and just a lookup table).

---

## 1. Saved home and work postcodes

mpg, tank size and fuel type already persist to `localStorage` (see the bottom of the
script in `index.html`). Locations don't, so **every search starts by typing a
postcode** — the main friction in daily use.

Two buttons, **Home** and **Work**, beside the postcode field, saved the same way the
car is. Tap and search.

*Small. Probably the biggest everyday improvement per line of code on this list.*

## 2. Trip fuel total — ✅ DONE (and then some)

Shipped exactly as proposed: journey mode's headline panel says *"This journey will
cost you about £19.54 in fuel (125 mi · 12 L)"*, priced at the cheapest OPEN forecourt
en route. It first shipped into the notice pile, went unseen, and was moved into the
headline panel — the code comment at the render site records the episode.

The "pairs with the range warning" half grew beyond the proposal (24 Aug): when the
tank can't cover the trip, the warning now sizes the stop — *"Put roughly 15 L in here
and fill up round Glasgow — about £1.40 better than filling right up now"* — using the
journey-ends comparison calibrated against the archive (`scripts/spread.mjs`).

## 3. Shareable search URLs

App state lives entirely in the form, so a good result can't be sent to anyone.

Encode the search in the URL (`?pc=NG1+5FS&r=8&fuel=E10`), read it on load, update it
when a search runs. Makes results shareable and the app bookmarkable — "my usual search"
becomes one tap.

The Open Graph tags added in `da53457` were half of this: a shared link already previews
properly rather than showing a bare URL. This is the other half.

*Moderate. Mind the back button — pushing state on every search would trap people.*

## 4. The delta column on closed rows — needs a decision, not work

Rows are ordered open-first, then by cost. The right-hand column shows each row's
difference from the best, and those no longer increase down the list:

```
7  Bp Lenton Boulevard    £59.94   +£1.79
8  Sainsbury's Castle Bd  £58.23   +£0.09   <- CLOSED
```

Every figure is accurate, and it arguably carries information — "this would have been
the better deal if it were open". But it reads oddly at a glance.

Options: leave it, hide the delta on closed rows, or grey it. **My inclination is to
leave it** — the Closed badge already explains the ordering. Thomas hasn't ruled.

## 5. Search counter — ✅ DONE, live since 24 Aug

Worker deployed (`workers/search-counter.js`), four words per search (mode, outcome,
area at district precision max), privacy enforced structurally — client cuts, server
re-checks the shape, browser tests sweep every beacon. Grew a fourth word (area) over
the original three, Thomas's call, made in the open in [search-counter.md](search-counter.md).
Phase 2 (weekly digest) waits on ~a week of real traffic: **~31 Aug earliest**.

## 6. Amend the price-history plan — ✅ OVERTAKEN by shipping the thing

The rewrite never happened and no longer needs to: the plan's build order (§8) is
**complete** — the trend chart and the per-station movement badges shipped 22 Aug
(`scripts/history.mjs`, `hist` in prices.json). The superseded notice plus the
"§8 complete" update at the top of [price-history-plan.md](price-history-plan.md)
defuse the trap this item existed to defuse. Still genuinely open from that plan:
only §7, the offline falling-market analysis, which waits on a falling market.

---

## Robustness — needs Thomas, not code

Recorded 2026-07-31 alongside building the CI tests:

1. **Commit the Pi's scripts — half done.** `pi/update-fuel-prices.sh` is committed
   (with a README recording the runner contract and, since 24 Aug, where the push
   credential lives). **`net-watchdog.sh` is still only on the SD card** — the surviving
   half of this item. Paste a sanitised copy into `pi/`.
2. ~~**Branch-protect `main`.**~~ ✅ **DONE 24 Aug** — force pushes and deletions
   blocked, admins included, verified by watching a force-push and a delete get
   rejected on a throwaway branch. Details in
   [security-review-2026-08-23.md](security-review-2026-08-23.md) §1; its §2 (scope the
   Pi's PAT down) is what keeps this held.
3. **Fire the healthchecks.io test notification.** The ping works, but no alert email
   has ever actually been sent (the one real outage recovered inside the grace window).
   Until the "Send test notification" button is pressed, the dead-man's switch is a
   switch nobody has heard ring. **Still open, still ~1 minute of Thomas's time.**

## Deliberately rejected — don't re-propose without new information

| Idea | Why not |
|---|---|
| **HVO and B10 in the fuel dropdown** | Thomas's call, 2026-07-30: too rare to be worth confusing everyone. ~55 forecourts each against 7,800 selling E10. |
| **Stop collecting HVO/B10 to save payload** | Measured: saves 677 bytes gzipped (0.18%), and three forecourts sell *only* those fuels so they'd vanish entirely. Not worth it. They stay in the data, just unselectable. |
| **`location.country` from the feed** | Unusable without heavy normalising — `ENGLAND` 3,942 vs `England` 1,132, plus 723 `UNITED KINGDOM`, 697 blank, 67 `E`, 10 `S`. ~18% ambiguous. Postcode prefixes give regions reliably and are already present. |
| **`public_phone_number`** | Nobody rings a petrol station. |
| **`amenities`** | Real data (`car_wash` 3,580, `lpg_pumps` 270, `adblue_pumps` 1,081) but no clear job in a price app. Possible filter later. |
| ~~**`location.city`**~~ | ~~Purely cosmetic.~~ **Reversed 2026-07-30** — it's the prerequisite for town-level SEO pages, which is the main growth lever in [monetisation.md](monetisation.md). Populated on 97.2% of records. Capture it. |

## Constraint to keep in mind

The payload is **376 KB gzipped** as of 2026-07-30. It was 744 KB that morning, dropped
to 257 KB after trimming unused fields, then rose again as opening hours and price
timestamps were added. Still roughly half where it started, and repeat visits cost
nothing (304, or instant from the service worker cache) — but it has drifted up twice
now. Measure before adding another per-station field.

## Verification setup

Node and a Playwright MCP browser are configured (`.mcp.json`), so anything here can be
verified properly rather than reasoned about:

- `node scripts/validate-prices.mjs` runs the real validator against real data.
- The fetcher can be exercised end-to-end without API credentials by pointing `FF_BASE`
  at a mock server — that's how the pagination and field-extraction work was checked.
- The browser can be driven at a real mobile viewport, taken genuinely offline
  (`context.setOffline`), given a fixed clock, and given a GPS position. Testing this way
  found four bugs that reasoning had missed: the `Â£0.00` charset corruption, the
  `navigator.onLine` false signal, the raw "Failed to fetch" shown offline, and the
  `Esson'S` title-casing.
