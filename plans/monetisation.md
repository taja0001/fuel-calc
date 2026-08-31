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

### Growth beyond SEO — added 2026-08-25

All sequenced after the domain ([domain-migration.md](domain-migration.md)) for the same
permanent-links reason as everything else. Cheapest-per-visitor first:

- **Make results shareable — the word-of-mouth engine.** Backlog #3 (shareable URLs)
  reframed: it isn't a convenience feature, it's the growth feature. A "share this"
  button using the native share sheet turns every "I saved £4" into a link in a family
  group chat — and *other people* sharing the app is the one MSE-legal route
  ([forum-launch.md](forum-launch.md) §3). The OG tags are already done; this is the
  other half, plus one button.
- **One launch post each on Show HN, r/InternetIsBeautiful, Product Hunt.** The app is
  exactly what those audiences celebrate: free, clean, no ads, real data. The dev-side
  story ("every UK fuel price, hourly, in git, from a Raspberry Pi — because the
  government API only accepts residential IPs") is genuinely unusual and does the work
  by itself. Fine under a pseudonym; needs the repo-visibility decision made first,
  since dev audiences will go looking for the repo.

  **The launch-site shortlist** (landscape checked 2026-08-25 — these churn, re-verify
  at launch time). Two tiers, honestly labelled: the first gives real humans, the
  second gives permanent dofollow backlinks — which for this app are not a consolation
  prize but the domain-authority seed the town pages will rank on.

  | Tier | Where | Fit note |
  |---|---|---|
  | Humans | **Show HN** | Strongest fit; the Pi/git-archive story is the draw. Global audience reads for the story. |
  | Humans | **r/InternetIsBeautiful**, **r/SideProject** | Built for free/no-signup tools; read each sub's self-promo rules, disclose, participate first. |
  | Humans | **Product Hunt** | US-heavy — expect the badge and backlink more than UK users. One tidy launch day. |
  | Humans | **Indie Hackers** | Community, not launchpad; the build story fits its genre. Compounds if milestones get shared. |
  | Backlinks | **AlternativeTo** | The keeper: get listed as a PetrolPrices alternative — a comparison people actually search. |
  | Backlinks | Uneed, Fazier, Smol Launch, TinyLaunch, MicroLaunch, Launching Next, SaaSHub | Current crop of free-submission directories, ~15 min each, mostly permanent dofollow links. |

  Skip: BetaList (pre-launch only), DevHunt (dev tools), G2/Capterra (B2B). **Stagger
  the launches a week or more apart** — each spike then shows up separately in the
  search counter's district data, so the venues can be compared on searches actually
  run, not impressions claimed.
- **The archive as a PR engine.** The newsletter/digest (More routes §4) doubles as
  this: journalists writing fuel-price stories need numbers with history, and nobody
  else has hourly. React fast to news cycles (duty changes, price spikes) with a chart
  and a quote — every citation is a link. Data-journalism pitches to the money pages
  beat any advertising the app could buy.
- **Creator outreach.** UK money-saving and car-cost YouTubers/TikTokers cover free
  tools readily — free + no-ads + no-signup makes the pitch trivial. One mid-sized
  video outdraws months of forum posts. A short list of who covers fuel prices, one
  honest email each.
- **Get into the listicles.** "Best fuel price apps UK" articles exist and rank
  (MSE's own guide included). Post-domain, email each author — being the only entry
  that's free with no ads and no signup is the differentiator they'll quote.
- **Search-engine hygiene at migration time.** Submit the new domain to Google Search
  Console and Bing Webmaster with the sitemap when it exists — costs nothing, and GSC's
  query data feeds the town-page tiering above.
- **Retention is also traffic.** Saved home/work postcodes (backlog #1) and the
  installed-PWA path turn one-time forum visitors into weekly habits — the same work
  that serves daily users compounds every acquisition idea above.

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

**Third batch, 2026-08-25 — Thomas's own candidate:** `forecourtfinder` —
**.co.uk, .uk and .com all free** (RDAP, point-in-time as ever). Honest read: plainly
descriptive and instantly understood; town pages read naturally
(`forecourtfinder.co.uk/petrol/nottingham`); the word "forecourt" is pleasingly
British. Against: at 15 characters it's the longest candidate; it says "find a
forecourt", not the true-cost maths that is the app's actual difference (same critique
as `cheapestfill`); and "— Finder" sits nearer the government's *Fuel Finder* scheme
name than any other candidate — it does NOT contain the forbidden string and the first
word differs, so the July rule is satisfied, but it's the closest orbit of the lot.
EV-proof, unlike `petrolmaths`. If chosen, buy all three and let .co.uk lead.

**Fourth batch, 2026-08-31 — generated + blind-voted.** 40 AI-generated candidates
(5 lenses), screened to 7, live-RDAP-checked, then a blind 30-persona panel voted on
the 5 with a free .co.uk alongside the incumbents. Results:

- **whichpump won 24/30 (80%)** — top-two on every ballot, ZERO mistypes. But the
  trust is borrowed: nearly every winning reason cites "sounds like Which? magazine",
  which is also its legal/brand risk. **.com is TAKEN** (new since Aug 17).
- **fuelmaths: clean runner-up** — 6 firsts, 13 seconds, 4 mistypes ("fuelmath"),
  trusted on its own merits ("says exactly what it does, no flannel"). Both TLDs free.
- **forecourtfinder: collapsed** — zero firsts, zero seconds, "a mouthful"; also
  carries the panel finding that "forecourt" is trade jargon.
- **fuelfindr (Tom's 31 Aug candidate): TAKEN** — .co.uk and .com both registered
  before we could test it.
- New candidates truefill (12/30 would mistype "trufill") and countthedrive (10/30)
  died on the radio test. Also taken as of today: wherescheapest.co.uk, cheapfill,
  cheapestpetrol, drivedown, downtheroad.
- Panel recommendation: buy whichpump.co.uk after a passing-off sanity check on the
  Which? proximity, and buy the fuelmaths pair (~£15) as the clean fallback either way.
- Note: this file is served publicly by Pages, so the candidate list (and now this
  verdict) is readable at the live URL — cheap names sitting unbought can be squatted.

**Round 2, same day — 100 voters, generator originals added.** RDAP first: of the 10
never-balloted originals, petrolmoney, quidsin, brimly, honestfuel and itaddsup are
ALL already taken; free were cannyfill (both TLDs), milemaths (both), netfill,
fillwise, fuelrun (.co.uk only). Vote on 10 names: **whichpump 43** · **cannyfill 23**
· **fuelmaths 23** · fillwise 10 · fuelrun 1; forecourtfinder again zero.
whichpump's zero-mistype record broke at scale ("witchpump" ×7); milemaths was the
field's worst (38 mistypes, muddled with fuelmaths); truefill's "trufill" problem
confirmed (14). Write-ins: essentially none — the space is picked over.
**Standing recommendation: buy fuelmaths.co.uk + .com** (fully ownable, near-best
mistypes, no legal shadow); **cannyfill pair as the warm-brand hedge** (joint second,
both TLDs free, slight north/Scotland skew); whichpump.co.uk only with eyes open —
its support is explicitly Which?-borrowed and its .com is gone.

**DECIDED 2026-08-31 ~21:45: Tom bought `whichpump.co.uk`** (Cloudflare Registrar —
zone already on the CF account, so the plan's move-DNS-to-Cloudflare step is moot).
Two-panel winner (24/30, then 43/100), eyes open on the Which? adjacency. `.com`
taken; `whichpump.uk` still free at purchase time — recommended defensive buy.
Migration proceeds per [domain-migration.md](domain-migration.md).

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

## More routes — added 2026-08-25

The four routes in the traffic-worth table monetise *traffic*, which doesn't exist yet.
These monetise the **archive** or the **trust**, which do. Roughly nearest-first:

1. **Native referrals that are also honest UX — the Costco move.** Costco fuel is
   routinely among the cheapest in a town, already appears in the rankings, and is
   members-only — which the app doesn't currently say. A "membership required" pill on
   those rows is a genuine UX improvement *and* the natural home for a referral link.
   Unlike insurance/breakdown affiliates (intent-adjacent), this sits exactly on the
   user's intent at the moment of decision. Same pattern later for EV charging networks.
   The only route on this list that makes the product better.
2. **A tip jar.** One footer line (Ko-fi or similar). Pennies, but it fits the
   "free, no catch" forum positioning exactly — the MSE crowd rewards it — and it's a
   live measure of goodwill before pricing anything. Note the footer-disclosure ruling
   (2026-08-24) was about privacy copy, not this; still Thomas's call to add any footer line.
3. **Price-drop alerts as the premium wedge.** The table above dismisses premium because
   "the free version already answers the question" — but alerts answer a *different*
   question: not "where is cheapest" but "**should I fill today or wait**". That's
   exactly what PetrolPrices' paid tier sells. The analytical half is part-built (the
   history pipeline, badges, the calibrated ends comparison); the delivery half needs a
   contact channel and a Worker, both now rehearsed. £1/month needs only hundreds of
   subscribers to beat every consumer route in the table.
4. **The weekly digest, grown into a sponsorable newsletter.** The counter's Phase 2
   digest ([search-counter.md](search-counter.md)) pointed at the *archive* instead:
   "UK fuel this week" — movement, rocket-and-feather watch, cheapest regions. Nobody
   else can write it, because nobody else has the hourly history. Newsletters take a
   single flat-fee sponsor line at small audiences, and every journalist citation is
   free marketing for the app. Converts the archive to money without selling it.
5. **Licensing to local news.** Local outlets hand-write "cheapest petrol in X" pieces
   constantly because they draw local search traffic. A licensed daily widget or feed
   per town is the SEO-page content sold to people who already prove they want it.
   One title at £50–100/month beats a year of display ads. Pitch once our own town
   pages exist as the demo.
6. **Direct local sponsorship on town pages.** The "not worth the interface" verdict
   above was about programmatic display. One flat-fee line — "supported by [local
   garage]" — per town page is a different animal: no tracking, no auction, keeps the
   clean UI. Gated on the SEO pages existing.
7. **The true-cost API** — selling the *algorithm*, not the data: ranking-as-a-service
   for fleet software and fuel-card apps. A different SKU from the data feed above.
   Hard-gated on replacing OSRM ([backlog.md](backlog.md) #0).
8. **The endgame variant: acquisition.** The archive + traffic + trust is an acquirable
   asset (comparison sites, fuel-card companies, PetrolPrices-class apps). Not revenue,
   but it's what makes "do nothing and let the history accumulate" a strategy.

**Rejected, on purpose:** sponsored placement in the rankings (one paid reorder kills
the app's reason to exist), selling user data (there is none, by design — and that
absence is a selling point for everything above), a paid app.

---

## Decision points

1. **Do nothing yet** and let the history accumulate — the lowest-effort route to the
   strongest asset.
2. **Build the SEO surface** — highest ceiling, makes every other option viable later,
   and needs `city` captured as its first step.
3. **Chase one B2B customer** — the only route where 100 visitors a day doesn't matter.

Not mutually exclusive. Option 2 is the one worth real thought; option 1 happens by
itself as long as the Pi keeps running.

*2026-08-25 addendum: "More routes" above adds the archive- and trust-based options
(Costco referral, alerts, newsletter, local-news licensing) that sit between options 1
and 3, and "Growth beyond SEO" adds the acquisition levers (share button, launch posts,
PR, creators) that feed option 2 without waiting for it.*
