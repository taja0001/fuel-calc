# Plan: the town pages — /petrol/<slug>/ 

Written **2026-09-02**, the day after whichpump.co.uk entered Google's index. This is
the concrete build plan for [monetisation.md](monetisation.md) §"Growth: the SEO gap"
— the highest-ceiling growth lever, now unblocked by the domain. Every figure below
was re-measured against the live data on 2 Sep, not inherited from the July/August
estimates. Legend as ever: **[TOM]** decisions and clicks · **[CLAUDE]** builds, Tom
commits.

## The measured ground (2 Sep, prices.json of 22:03)

- 8,026 stations, 124 postcode areas. **119 areas have ≥10 stations** (median 56):
  BT 575, B 195, PE 150, S 150, SA 142, NG 139, G 133, NE 132, LE 123, M 114 at the
  top. Four "areas" are malformed postcodes (C/BY/I/CY, one station each) — excluded.
- Districts stay dead: 2,478 of them, 604 with exactly one station (24.4%) — the
  doorway-page warning re-confirmed. **Skip districts entirely** (standing ruling).
- Fuel coverage: diesel B7 98.7%, unleaded E10 97.5%, E5 77.2%, B7P 51.5%. Diesel is
  effectively universal — the pages carry **unleaded and diesel side by side**
  (panel finding: ~20/50 asked whether diesel was even covered).
- No town/city field exists in published data (the fetcher drops `location.city`,
  97.2% populated at source) — that's what gates tier 2, not tier 1.
- Page weight is a non-issue: NG's full 139-station cheapest-first table is ~12 KB
  of HTML uncompressed.

## Phase 0 — decisions [TOM], before any build

- [ ] **Slugs.** Recommendation: curated city names for the ~18 unambiguous big
      areas (`/petrol/nottingham` = NG, `/petrol/leeds` = LS, `/petrol/birmingham`
      = B, London compass areas as `/petrol/london-n` etc.), area-code slugs for the
      rest (`/petrol/dl/`) until tier 2's real city data arrives. People type town
      names; the URL should match.
- [ ] **The repo-visibility fork closes here.** SEO pages must be public. Shipping
      them means the repo stays public on GitHub Pages (or the whole site moves to
      Cloudflare Pages first — path B, which also lifts the bandwidth cap). Decide
      before phase 2 ships; changing hosts after 119 URLs are indexed costs a
      redirect exercise.
- [ ] **Two copy sign-offs** (panel-driven, preview-rule territory): the page H1
      idiom ("Where's cheapest to fill up in Nottingham?" — the visitor's-question
      pattern that won the panels), and the "who runs this" sentence (item 21's
      one-person/no-ads/no-accounts line — wording adjacent to the pseudonymity
      ruling, so yours).

## Phase 1 — the preview board [CLAUDE, no commits]

- [ ] `scripts/build-pages.mjs`: reads `data/prices.json`, emits
      `petrol/<slug>/index.html` per qualifying area (gate: **≥10 stations**,
      malformed areas excluded → 119 pages) plus `petrol/index.html` (the A–Z index
      page) and rewrites `sitemap.xml` (single file — 50k-URL protocol limit is
      nowhere in sight — with `<lastmod>` from the data date).
- [ ] Render three samples: **Nottingham** (big, curated slug), **Leeds** (big), and
      one small-but-qualifying area (e.g. HX, 18 stations) to prove the gate and the
      small-page layout. Screenshot at 360px, both themes, publish the board, Tom
      picks. EC (2 stations) demonstrably excluded.

**What every page carries, all in static HTML (crawlers and humans see the same
thing, no JS needed to read it):**

1. H1 in the visitor's-question idiom + the free/no-sign-up sub-line.
2. The cheapest-first table: station, brand, postcode, **unleaded AND diesel**
   columns, the house pills where earned ("members only" on Costco, age badge on
   anything unconfirmed a fortnight — same honesty idiom as the app).
3. Computed summary: area averages per fuel, cheapest-vs-average spread, station
   count, delta vs UK average — real numbers per area, so no two pages share prose.
4. **An honest freshness stamp: "Prices as of <date>, retailer-reported to the
   government Fuel Finder scheme." Never "live", never minutes-ago** — the page
   regenerates daily; the app is the live path and the CTA says so: "For live
   prices and the true cost for *your* car →".
5. The provenance + who-runs-this lines (item 21 wording pending Tom).
6. Internal links: app, the area index, 3–4 nearest neighbouring areas; breadcrumb.
7. Plain register: "petrol station" not "forecourt"; "unleaded (E10)" not bare codes.
8. Unique title/meta description built from the data ("139 petrol stations, cheapest
   unleaded 149.9p today"), the Cloudflare analytics snippet (token is
   hostname-scoped — same host, works as-is), and canonical. Schema.org: start with
   BreadcrumbList only; ItemList/Dataset are candidates once pages prove out —
   nothing that overclaims.

## Phase 2 — ship v1 [CLAUDE builds; TOM commits]

- [ ] Generator + the 119 pages + index page + sitemap rewrite, per the picked design.
- [ ] **The `?pc=` prefill handler in index.html** — new work, verified absent
      (zero `location.search`/hash handling exists). Hooks into the init block
      right after the LAST_KEY restore so an explicit URL param wins the prefill;
      sanitised; sets the field and **never auto-runs** (the house rule, verbatim
      in the code at the LAST_KEY comment). Storage untouched — LAST_KEY only
      writes on successful searches, so the interplay is naturally safe. Town-page
      CTAs then link `/?pc=NG18` style.
- [ ] Tests: a node test pinning the generator (deterministic output for a fixture,
      gate excludes thin areas, malformed postcodes dropped) and a browser test for
      `?pc=` (prefills, never auto-runs, beats LAST_KEY on screen).
- [ ] Verify: pages render at 360px; `curl` two live URLs post-deploy; sitemap
      lists 120 URLs; resubmit sitemap in GSC + URL-inspect one page.

## Phase 3 — the daily bake [CLAUDE writes the workflow; TOM commits]

`.github/workflows/build-pages.yml`, cron **daily off the top of the hour** (e.g.
`23 4 * * *` — the Pi owns the o'clock). Verified facts this leans on:

- A bot commit touching only `petrol/**` + `sitemap.xml` triggers **neither** live
  workflow (both path-filtered away — verified), and `GITHUB_TOKEN` pushes never
  trigger workflows anyway (GitHub's recursion guard). CI stays quiet.
- Branch protection blocks force-pushes only — plain pushes flow (the Pi's hourly
  proof). `permissions: contents: write` in the workflow, same shape as the parked
  `workflows/update-prices.yml` precedent (bot identity, concurrency group,
  porcelain changed-check). **Restate the old rule: no required status checks,
  ever** — they'd break the Pi and this Action alike.
- Pi race is benign and self-healing (its runner pulls, retries ×3 on rejected
  push, heartbeat alarms on persistent failure — verified in pi/update-fuel-prices.sh).
  The Action mirrors that courtesy: `git pull --rebase` immediately before push,
  one retry. File conflicts are impossible (Pi writes `data/` only, Action writes
  `petrol/**` + sitemap only).
- Service worker: verified safe in both directions — `isPage` matches the scope
  root only (the sw.js comment literally anticipated "any future same-origin page
  at /foo/"), town pages cache under their own URLs, the update toast won't spam.
  They're not precached, so a first-ever offline visit to a town page fails — fine.
- [ ] Watch the first week's repo growth (daily delta of 119 small HTML files —
      git delta-compresses same-shape changes well; measure, don't assume) and the
      GSC coverage report as pages enter the index.

## Phase 4 — tier 2: real town pages [after v1 proves out]

- [ ] `build-prices.mjs` starts capturing `city` (97.2% populated). The Pi runs the
      repo's own script and pulls before each run, so this deploys itself on the
      next hourly cycle — no hardware visit. Payload impact ~2–4% on prices.json;
      note it in the changelog when it lands.
- [ ] Town pages: centroid computed from stations grouped by city, radius match
      (people search "petrol in Mansfield", stations sit outside its label), same
      ≥10 gate so nothing thin ships. GSC query data from the area pages steers
      which towns get built first — the plan's original sequencing, now with a
      data source.

## Risks, named

**Doorway-page risk** — controlled by the gate, the per-area computed stats, real
tables, and skipping districts. **Freshness honesty** — the daily stamp, never
"live"; over-promising is what item 22 exists to prevent. **Repo growth** — daily
only, measured in week one. **The visibility fork** — phase 0's decision; this plan
makes the repo's public-ness load-bearing. **Ranking patience** — pages enter the
index in days; ranking for "cheapest petrol <town>" takes months and arrives with
the forum-launch backlinks; GSC impressions are the metric, not vibes.
