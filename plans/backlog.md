# Backlog

Everything known-but-not-done, as of **2026-07-30**. Nothing here is urgent; the app is
in a good state. Items are roughly in the order I'd tackle them, not in priority order —
see the note at the bottom of each for what it's actually worth.

Also see [price-history-plan.md](price-history-plan.md) for the price-history work, and
[monetisation.md](monetisation.md) for where this is all heading — including the SEO gap,
which is the largest single opportunity and needs `location.city` captured to start.

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

## 2. Trip fuel total

Journey mode already computes the route length (`route.miles`) and already knows your
mpg. So it can say what the **journey** costs, not just the fill-up:

> This 280 mile trip needs about **28 litres** — roughly **£44** at the best price on
> your route.

Today it reports `37.5 L @ 150.9p · fill £56.59 + detour £0.14`, which answers "what
will this fill-up cost" rather than "what will this journey cost". The second is usually
the question. It also pairs with the range warning: if you're told you need to stop,
knowing the trip burns 28 L tells you whether one stop is enough.

No new data, no new requests. Pure arithmetic on values already in memory.

*Smallest item here.*

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

## 5. Amend the price-history plan

[price-history-plan.md](price-history-plan.md) is **partly obsolete** and actively
misleading. It assumed change times had to be inferred by diffing hourly snapshots,
which is why sampling gaps were fatal, hour-of-day analysis was impossible, and the
revisit date was September.

Then `pu` landed (commit `0d844e0`) — the feed gives the exact minute each price moved.
Gaps stop mattering, hour-of-day becomes answerable now, and September was pessimistic.

The archive is already improving: every commit from the Pi's 19:19 run on 2026-07-30
onward carries real change timestamps.

*Documentation only, but cheap and it stops a trap being laid for future-you. A
superseded notice is already at the top of that file.*

---

## Robustness — needs Thomas, not code

Recorded 2026-07-31 alongside building the CI tests:

1. **Commit the Pi's scripts.** `update-fuel-prices.sh` and `net-watchdog.sh` exist only
   on the SD card — the component most likely to die. The README describes them but
   doesn't contain them. Paste sanitised copies into a `pi/` directory (secrets stay in
   `secrets.env`, recoverable from the GOV.UK portal) and an SD death becomes copy-paste
   instead of reconstruction from prose.
2. **Branch-protect `main`.** The git history IS the price archive — irreplaceable at
   any price and growing hourly. Settings → Branches → block force pushes and deletions.
   Two clicks; given three divergence incidents on 2026-07-30, not theoretical.
3. **Fire the healthchecks.io test notification.** The ping works, but no alert email
   has ever actually been sent (the one real outage recovered inside the grace window).
   Until the "Send test notification" button is pressed, the dead-man's switch is a
   switch nobody has heard ring.

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
