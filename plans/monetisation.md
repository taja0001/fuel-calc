# Monetisation

Written **2026-07-30**, at ~100 visitors a day (~3,000 a month).

**Conclusion up front: don't monetise yet.** At this traffic every consumer option earns
pocket money and costs more than it returns — ads would damage the product for the price
of a coffee. The work worth doing now is growing traffic, and the asset worth protecting
is the price history. Revisit when traffic is an order of magnitude higher, or when a B2B
conversation appears.

---

## The legal position — clear

Checked 2026-07-30. **Commercial use is permitted**, on a firmer footing than most
government APIs:

- [The Motor Fuel Price (Open Data) Regulations 2025](https://www.legislation.gov.uk/uksi/2025/1356/introduction/made)
  (SI 2025/1356, under the Data (Use and Access) Act 2025) make this a **statutory**
  open-data scheme. Retailers are legally required to publish. It isn't an API someone can
  withdraw on a whim.
- Published under **Open Government Licence v3.0**, which permits commercial exploitation
  with attribution. The formal attribution line is now in the site footer.
- The [official guidance](https://www.gov.uk/guidance/access-the-latest-fuel-prices-and-forecourt-data-via-api-or-email)
  names "comparison websites" and "app and website developers" among intended users.
- Rate limits: **100 requests/minute, 1 concurrent** per client. A fetcher run makes 34
  sequential requests hourly, so there's large headroom — and because prices are served
  from a static file, **user growth adds no API calls at all**. Anyone proxying the API
  per request would hit the limit almost immediately.

**The blocker is OSRM, not the data.** See [backlog.md](backlog.md) item 0. Every road
distance goes through the project's public demo server, which has no SLA and no commercial
provision. Replacing it is the first real cost of charging for anything — but it stays
queued *behind* revenue, not ahead of it. The free server is fine for 100 visitors a day.

---

## What the current traffic is worth

| Route | Realistic at 3,000/month | Verdict |
|---|---|---|
| Display ads | £10–25/month | Not worth the interface. The clean UI is the app's best quality. |
| Affiliate (insurance, breakdown, fuel cards) | A handful of conversions | Pays on intent rather than volume, so better — but not a business yet. |
| Premium tier | Very few subscribers | Hardest sell: the free version already answers the question. |
| B2B / data | £100–500/month per customer | **Volume-independent.** One customer beats all of the above. |

The asymmetry is the point: consumer routes scale with traffic you don't have, B2B doesn't
care about traffic at all.

---

## Growth: the SEO gap

**The app currently has 112 words of indexable text and mentions not one town.** It holds
live prices for 7,976 forecourts in every town in Britain, and a search engine sees an
empty form — every price arrives via JavaScript after render. There's no `robots.txt` and
no `sitemap.xml`.

Someone searching "cheapest petrol in Nottingham" cannot find this site. That's the
biggest untapped lever, and it uses assets that already exist.

### What the data can and can't support

Measured against the live file:

| Grouping | Count | Viable? |
|---|---|---|
| Postcode **districts** (NG1, NG2…) | 4,469 | **No.** Median 1 forecourt each; 3,136 have exactly one. Thin, near-duplicate pages — the classic doorway-page pattern Google penalises. |
| Postcode **areas** (NG, LS, BT…) | 123 | **Yes.** Substantial: BT 531 forecourts, B 193, S 152, PE 150, SA 142, NG 138. |
| **Towns** | needs work | **Best for search intent** — people search town names, not postcodes. But see below. |

### Town pages need a field we're currently dropping

`location.city` is populated on **97.2%** of feed records and we don't publish it. I
earlier dismissed it as cosmetic in [backlog.md](backlog.md); with SEO in mind it becomes
load-bearing. Capturing it is a small change to `build-prices.mjs`.

Town pages should show forecourts **within a radius of the town** rather than only those
labelled with it — that matches how people actually search and avoids thin pages. Town
centroids can be computed from the forecourts' own coordinates, grouped by `city`.

### Design sketch

- **Tier 1: 123 postcode-area pages.** Buildable with data we already publish.
- **Tier 2: town pages**, gated on a minimum number of forecourts within radius so nothing
  thin ships. Needs `city` captured first.
- **Skip per-district pages entirely.**

Each page must be genuinely useful, not a doorway: the actual forecourts and current
prices in the HTML, cheapest-first, with the true-cost calculator linked for the bit that
needs your inputs. Plus `sitemap.xml` and `robots.txt`.

**Generate daily, not hourly.** SEO doesn't need hourly freshness, and regenerating
hundreds of pages every hour would make the repo grow fast — see the payload/growth note
in [backlog.md](backlog.md). Daily caps the churn while keeping pages current enough.

**Note this conflicts with making the repo private.** SEO pages have to be public, so if
the split-repo idea ever happens, generated pages live on the public side.

*This is a proper project, not an afternoon. But it's the difference between 100 visitors
a day and a number where monetisation is a real conversation.*

---

## A domain of its own

Decided worth doing **before** the SEO work, so page authority accrues to the permanent
name from day one. Not bought yet.

Availability checked against the registries via RDAP on **2026-07-30** — point-in-time
only, so re-check before buying:

| Domain | .co.uk / .uk | .com twin | Notes |
|---|---|---|---|
| **fuelmaths** | both free | free | **First choice.** The app in one word — the true-cost sums, the minutes, the savings line are the maths nobody else does. British spelling says UK. Brandable; ~£20/yr secures the pair. |
| **worththedrive** | .uk only | taken | Best phrase of the lot, but the .co.uk/.com twins belong to others — typed traffic would leak forever. |
| **cheapestfill** | free | free | Plainly descriptive; `cheapestfill.co.uk/petrol/nottingham` reads perfectly for town pages. Generic as a brand. |
| **brimthetank** | free | free | Charming idiom, brandable; says nothing about price comparison. |
| **truecostfuel** | free | free | Accurate but clunky. |

**Second batch, checked 2026-08-17** (first batch all still free that day too):
`perlitre.uk` (stylish — the unit itself; but EV is per kWh), `whichpump.co.uk`
(memorable; mild *Which?* brand adjacency), `pumpmaths.co.uk`, `petrolmaths.co.uk`
(excludes diesel semantically), `litrewise.co.uk`, `fillforless.co.uk`,
`cheapertank.co.uk`, `fillwise.co.uk`. Taken: pumpwise, tankwise, perlitre.co.uk,
drivecheaper. Recommendation unchanged: **fuelmaths** — broadest, EV-proof.

Taken as of the check: `fillup` in every form, `truefuel`, `tankful`, `fillsmart`.
**Avoid anything containing "fuelfinder"** — it's the government scheme's name, and
trading under it invites confusion in both directions.

Cost ballpark: £5–10/yr for .co.uk/.uk, £10–15 for .com (Porkbun/Namecheap both handle
.uk; confirm Cloudflare Registrar's .uk support before assuming it).

### Migration checklist when bought

> **Superseded 2026-08-24** by [domain-migration.md](domain-migration.md), which
> carries the full sequence — including the new requirement that drove it (getting
> Thomas's name off the site), the CSP/search-counter consequences that didn't exist
> when this was written, and the user-facing costs. The candidates table above stays
> the place to pick a name. The original checklist below is kept for the record.

Repo side (small, verifiable in the browser): `CNAME` file, the licence header and OG
tags in `index.html` that cite the old URL, README. `manifest.json` and `sw.js` are
origin-relative and need nothing. Outside the repo: GitHub Pages custom-domain setting
(cert reissues automatically), new DNS CNAME → `taja0001.github.io` **grey-cloud** (as
now — proxying blocks the Pages cert), a new Cloudflare Web Analytics site/token, and —
once Pages is off `fuel.thomasainsworth.co.uk` — orange-cloud that subdomain and add a
free Cloudflare redirect rule to the new domain, which keeps existing users and every
previously shared link working.

## B2B, which ignores traffic

What you'd sell isn't the data — that's free and statutory — it's the work on top:

- Rejecting malformed records (pounds-as-pence, broken coordinates)
- Canonicalised brand names
- Opening hours, decoded and usable
- Price-change timestamps
- True-cost calculation
- **A clean hourly archive nobody else is keeping**

Fleet operators, logistics, anyone whose costs are mostly diesel. The archive is the asset
that compounds: it only gets more valuable and can't be replicated retrospectively at any
price. See [price-history-plan.md](price-history-plan.md).

---

## Decision points

1. **Do nothing yet** and let the history accumulate — the lowest-effort route to the
   strongest asset.
2. **Build the SEO surface** — highest ceiling, makes every other option viable later,
   and needs `city` captured as its first step.
3. **Chase one B2B customer** — the only route where 100 visitors a day doesn't matter.

Not mutually exclusive. Option 2 is the one worth real thought; option 1 happens by
itself as long as the Pi keeps running.
