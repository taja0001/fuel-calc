# The fresh-eyes board — 2026-08-30 five-lens review

Findings from a five-critic review of the live app (lenses: AI-tells, microcopy warmth,
stranger's first run, feature gaps, trust — every finding cited against real lines in
`index.html` on the day). This file is the queue to come back to.

> ## ⚠️ The working agreement: show before applying
> **Thomas wants every batch from this board demonstrated as a before/after preview
> BEFORE it touches `index.html`** — the way fixes 4/5/6 were done on 2026-08-30:
> apply the changes to a clone via a scripted transform (every replacement asserted —
> see `make-after.mjs` in that session's scratchpad for the pattern), screenshot both
> versions at 360px in identical states, publish the pairs as an artifact, and only
> implement after he's seen it and picked. Do not skip this because a change "is
> obviously fine" — the point of the preview is that he decides what the site feels
> like, not the reviewer. (Fix 1 below was rejected at exactly that stage: the critics
> called the emoji an AI-tell; Thomas likes the emoji. The emoji stay.)

## Status of the six AI-tells (the first batch through the preview flow)

| # | Fix | Status |
|---|---|---|
| 1 | Emoji → drawn SVG icons | **REJECTED 2026-08-30 — Thomas likes the emoji. Don't re-propose.** |
| 2 | Header dot → instrument light (warn colour when feed stale/offline) | ✅ Shipped 2026-08-31 as **C+**: dot deleted, ⛽ takes the badge (Tom's pick from the dot board), warn lamp + `#feednote` sentence appear ONLY when feed stale/offline — wired into `showFreshness()`, every exit syncs via `syncFeedFault()`. 64 tests green ×2. |
| 3 | Em-dash template copy pass (~6 strings, own shapes each) | Open — previewed; overlaps items 12 and 23 below |
| 4 | Humanist local font stack, untracked h1 | ✅ Shipped 2026-08-30 |
| 5 | Shadow hierarchy (instrument deep, paper flat, winner lifted) | ✅ Shipped 2026-08-30 |
| 6 | Spinner → £88.88 pump self-test with snapshot-restore | ✅ Shipped 2026-08-30 (54 tests green) |

---

## More user-friendly

> Items 7, 9, 10 and 11 ✅ **shipped 2026-08-30** after the "stranger pass" preview
> artifact — Thomas picked those four; items 8 and 12 were previewed in the same
> artifact and remain open, neither picked nor rejected. Ship notes: the fold (11)
> keeps the fuel gauge outside the fold, matching the existing returning-visitor
> behaviour — revisit only if Thomas asks; the no-results copy (9) pluralises the
> radius ("1 mile", not "1 miles" — the preview caught that bug in its own rewrite).

7. **Errors render ~700px below the fold.** `#msg` sits after the entire Your-car card,
   so tapping search with an empty postcode writes "Enter a postcode…" far below the
   viewport — the app looks dead on the stranger's most likely first tap. Fix: move the
   `<div id="msg">` markup to directly under the search button (nothing depends on its
   position; `setMsg` only writes innerHTML), plus a `scrollIntoView({block:"nearest"})`
   in `setMsg` when non-empty. *Best value-per-line on this board. Small.*
8. **Diesel drivers get unleaded answers silently** (~⅓ of UK drivers). The empty-state
   line invites searching without ever seeing the fuel dropdown below. Fix: name the
   assumption in that line — "we've assumed unleaded and a typical family car; change
   either below." *Small.*
9. **The no-results message speaks in fuel codes** ("No forecourts with B7P prices") and
   repeats "radius… Try a bigger radius". `FUEL_WORD` already exists but is declared
   below the early return that needs it. Fix: hoist it; reword near/journey variants;
   give the empty readout an honest bestSub instead of a blank. *Small.*
10. **At 3am the headline crowns a closed forecourt without saying so.** When everything
    is shut, rows[0] is closed but the readout presents it confidently; the caveat only
    appears in the notice pile. The readout's own stale-price principle ("the person who
    reads only the headline is the one who drives") applied to `shut`: one `.pill.old`-style
    pill in the panel — "closed — opens 06:00". *Small.*
11. **After the first successful search, fold the car card.** First-timers get the
    verdict, then ~600px of form, and may never find the ranked rows + Directions below.
    Fix: extract the fold logic (car summary) into `foldCar()` and call it at the end of
    a successful render; don't fold if the user pressed Change this session. *Small.*
12. **Small warmth beats** (three separate one-liners): returning visitors' empty-state
    sub-line acknowledges the remembered car ("your car's remembered from last time");
    "≈ Nottingham" becomes "Matched Nottingham" (the ≈ glyph reads as maths, and screen
    readers say "almost equal to"); "App updated — tap to refresh" becomes "Fill-Up
    updated · tap for the new version". *All small; overlaps fix 3's copy pass.*

## Features

> Previewed 2026-08-31 ("features pass" artifact); **items 14, 15 and 17 shipped
> 2026-08-31** — with journey-mode coverage for 14 (the preview was near-only) and a
> privacy rule the preview lacked: **a GPS search saves the radius but never any
> location**, pinned by a test. Items 13, 16 and 18 remain open: 13 works and fired on
> live data at preview (diesel +1.6p/fortnight) but carries an unanswered placement
> question — readout (shown, near capacity) vs under the trend chart; 16 previewed
> fine; 18 was posed only and depends on 14 (now shipped).

13. **"Fill today or wait."** The trend data already on every page, converted into the
    one decision every visitor faces. In the chart's `draw()`, compute the 14-day move
    for the selected grade; after a search, when |move| × litresFill clears ~50p, one
    sentence: "UK average diesel is up 1.5p in a fortnight — filling sooner beats
    waiting (~56p on this fill)". Money threshold, not pence — same idiom as the journey
    ends line. Nobody else answers this. *Small, high value.*
14. **Remember the last search.** Persist {mode, postcode/radius, start/dest} on
    success under a second localStorage key (same on-device-only comment idiom as
    CAR_KEY); prefill on load, never auto-run. Backlog #1 (Home/Work chips) is the
    fuller version. *Small.*
15. **Costco "members only" pill.** 22 Costco forecourts in the feed, routinely the
    cheapest, members-only — and unmarked, so a stranger drives there and is turned away
    at the barrier. Where rows render, if `canonBrand(...) === "Costco"` add a neutral
    pill in the existing `mway` idiom: "Costco members only". Flag, don't hide — the
    closed-rows philosophy. Also the natural hook for monetisation "More routes" #1.
    *Small.*
16. **Share-a-result** (backlog #3, reframed by monetisation as the word-of-mouth
    engine). URL state (`?pc=…&r=…&fuel=…`) parsed on load; `history.replaceState`
    (never push — back-button trap); a linkish "Share this result" near the panel using
    `navigator.share` with clipboard fallback. No CSP change, no new hosts. *Medium.*
17. **Journey mode undersells itself.** The button says "Find the cheapest fill-up" in
    both modes; nothing pre-search says journey mode prices the whole trip. Per-mode
    button text ("Price this journey") and one empty-state sub-line for journey mode.
    *Small.*
18. **"Since you last looked."** The no-account substitute for PetrolPrices' alerts: at
    render, persist {areaWord, fuel, bestPrice, date} in localStorage (never beaconed —
    the four-word grammar is untouched); on a later visit, one quiet notice: "Cheapest
    near NG5 was 145.9p when you last looked (Tue) — best today is 144.9p." Depends on
    item 14. *Medium.*

## Trust (launch-relevant — sequence with forum-launch.md)

19. ✅ **Closed 2026-09-03 as covered by the About section** (its "Where do the prices come
    from?" row carries the credential). The header line itself ("Live government prices,
    updated hourly.") was previewed and **declined by Tom** — the panel-tested header stays
    untouched. **Government-data credential invisible until the footer.** Extend the header tag
    line: "Pump price plus the fuel to drive there and back — live government prices,
    updated hourly." ("Hourly" is true and policed by STALE_HOURS.) *Small.*
20. ✅ **Shipped 2026-09-03** — static `#about` section after the trend chart (three
    collapsed `details.how`, Tom picked collapsed over open prose); render() no longer
    rebuilds it; the OSRM/OpenStreetMap provenance sentence added. Pinned by a test.
    **The methodology explainer only exists after a search.** `details.how` is appended
    at the end of render(); the sceptic audits before searching. Make it static markup
    present from first paint (under the car card or above the footer); stop rebuilding
    it per render; add one provenance sentence (retailers' own hourly reports; real road
    routes via OSRM/OpenStreetMap). *Small.*
21. ✅ **Shipped 2026-09-03 with Tom's wording:** "Built and run by one person, not a
    company. It stays free because it costs almost nothing to run. No ads, no accounts."
    He struck the Raspberry Pi from the draft; no name, no privacy line (the 24 Aug ruling
    stands, the optional privacy sentence was offered and not taken). **"Who runs this, and why is it free?"** A second static `<details>`: built and run
    by one person; stays free because a static page fed by a Raspberry Pi costs almost
    nothing; no ads, no accounts. Deliberately no personal name (forum-launch
    pseudonymity). NOTE: this is NOT the footer privacy disclosure Thomas ruled out on
    2026-08-24 — but it's adjacent; get his explicit yes on the wording. *Small.*
22. **Half shipped, half declined 2026-09-03.** The retailer-reported / age-badge sentence
    lives in the About section's prices row. The label change to "Price **feed** updated"
    was previewed and **declined by Tom — "Prices updated" stays. Don't re-propose.**
    **"Prices updated 8m ago" over-promises** — that's the feed timestamp, while ~3% of
    prices are weeks old. One word: "Price **feed** updated 8m ago", plus one footer
    sentence noting prices are retailer-reported and anything unconfirmed for a
    fortnight wears an age badge. *Small.*
23. ✅ **Shipped 2026-09-03, all three halves** — human wording ("Live prices couldn't be
    loaded just now…"), an empty result against the sample set says "Prices unavailable"
    instead of a false "No forecourts", and `loadStations()` retries on every run() while
    the sample is loaded. Pinned by a test that takes the feed down, searches twice, brings
    it back and watches the real rows arrive. **The sample-data fallback shows dev-speak and fails silently outside Nottingham.**
    (Two lenses hit this independently.) "…once the Fuel Finder fetcher is set up" reads
    as "this site isn't finished"; worse, the sample notice only renders on the has-rows
    path, so a Glasgow search against the 8-station sample shows a confident false "No
    forecourts". Fix: reword for humans; in render()'s empty branch check
    `dataGeneratedAt === "sample"` first and say "Live prices couldn't be loaded just
    now — try again in a minute"; let a sample-data load retry on the next run().
    *Small.*
24. **og:image / og:url.** The Facebook link preview — the campaign's actual first
    screen — is a bare grey text card. One 1200×630 PNG in the readout aesthetic
    (£-figure, tagline, "HM Government data"), `og:image` + `og:url` tags. Costs the
    shell nothing (scrapers only). **UNGATED 2026-09-01** (domain live; og:url shipped in the scrub — only the og:image PNG remains). ~~Sequence with the domain migration~~ — og:url is
    one more place the URL lives. *Small, but gated.*

25. **First-timer tagline** — ✅ **Shipped 2026-08-31, panel-tested.** The header tag is
    now "Type your postcode. Free, no sign-up: it finds the cheapest fill-up near you,
    counting the fuel to drive there." Chosen by three simulated-first-timer panels
    (20 → 100 → 50 head-to-head; this wording beat T3F 35–15 in the runoff; "free, no
    sign-up" cited by all 35). Panel by-products worth keeping: item 8's premise was
    independently raised by ~40 of 100 personas (loudest product complaint); freshness/
    provenance (~24/50) and diesel parity (~20/50) are the next conversion cliffs —
    feed items 19–23. Micro-edits the runoff suggested but that are NOT applied
    (Tom's call): "including" for "counting" (~23 of 50 double-took on "counting");
    dash for the colon; optional "petrol or diesel". The old tag lives on only in the
    meta description, which was deliberately left alone.

26. **H1** — ✅ **Shipped 2026-08-31, panel-tested (5 rounds total).** Now "Where's
    actually cheapest to fill up?" — the visitor's own question; the F2 tagline
    carries the USP (the pair is load-bearing — h1 must never travel without the tag:
    og:title, snippets, ads). Ballot history: four-way HC 36 · HB 25 · HA 14 · HD 0,
    then confirmation HB 20 · HE 10 · HC 0 (HE = the crowd-authored line; the
    differentiator vote split and the clarity vote consolidated). Synced: `<title>`,
    `og:title`, meta description (now carries free/no-sign-up); the results-panel
    explainer is where "true cost" gets introduced now. Tests: the 2-test flake was ROOT-CAUSED 1 Sep
    (before() double-fires run(); gate waited for rows only) and the gate fixed —
    64/64 green ×3 since. See items 27/28 for the app-side residue.
    Panel by-products: FILL-UP badge read as "ad label" by 6 of 75 (watch it);
    "fill-up" in any headline needs wrap protection (14 of 75 saw HD shatter).

## Also still open (older, same class)

The pre-review quick-win batch: trend chart `touch-action:none` scroll dead-zone
(`pan-y`), GPS button aria-labels, gauge ends "0/1" → "E/F", a `:focus-visible` rule,
"1 miles" pluralisation (✅ both halves now: no-results fixed 30 Aug, results-notice fixed 1 Sep), compass tap-target size. And the UX-board leftovers from the
24 Aug nine-critic review: the journey-mode cluster, area momentum line, trend chart
plotting the saved fuel (partly done — the chart follows the fuel select since 25 Aug).

## Protect list (from the same review — do not "improve" these)

The pump-display readout (scanlines, tabular numerals, dim £--.-- empty state), the
doubt-arbitration notice, the dashed stale pills in rows AND headline, the fuel gauge
with E/F ticks, the geocode "not where you meant?" confessions, and the copy at its
best: "One postcode is all it needs…", "Not sure about the numbers? Tap the closest
match…", the offline honesty note. The emoji (📍 🧭) are protected by owner ruling, not
by the critics.

---

## From the 1 Sep flake investigation (parked here per CHANGELOG)

27. **Double-search shows stale rows under the wiped self-test for up to 8 s.** A
    queued second run() (GPS-then-Search quickly, or two searches on a slow
    connection) paints £88.88/empty readout while the previous run's rows stand —
    the rows-vs-readout honesty rule broken on screen. Self-heals; fix is clearing
    or dimming #results when the self-test starts. Pin with a delayed-OSRM test.
    *Small.*
28. **`restoreReadout = null` sits at render() entry.** Any future throw between it
    and the readout writes strands the self-test with the old rows painted and
    nothing restores. Move the null to after the readout writes so "render paints
    the truth" is true by construction. *Tiny, pairs with 27's test.*
29. ✅ **Shipped 2026-09-03** — footer line "Petrol prices by area" → `/petrol/` (Tom picked
    the plain wording over the towns list). **The homepage never links to the area pages** (found 3 Sep, the day after they
    shipped: zero `/petrol/` mentions in index.html). The 119 pages link to the app;
    nothing flows back, so link authority stops at the homepage. One footer line
    ("Petrol prices by area") — visible copy, preview first. Sequenced with the
    trust batch in [seo-levers.md](seo-levers.md) §1. *Tiny.*

