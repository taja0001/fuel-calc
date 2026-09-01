# Changelog

Notable changes to Fill-Up. Newest first. Hourly `chore: update fuel prices` commits are
data, not changes, and aren't listed — there have been 64 of them so far.

---

## 2026-09-01

**The move finished.** The counter Worker now answers at `counter.whichpump.co.uk`
(routed under the domain, behind the zone's free rate-limiting) and the page's
`BEACON` and CSP moved together in one change — the last place a visitor's network
tab could learn a name. The old `workers.dev` URL stays alive for stale cached
shells.

**A two-test flake, root-caused after two days of ghosting.** The suite's shared
setup fires `run()` twice — the GPS callback runs a search and so does the Search
click — and the readiness gate only waited for rows, so two tests could read the
readout while the trailing run's £88.88 self-test had it blanked. Proven by catching
two beacons for one click sequence; the gate now waits for the search to settle.
Same investigation found a real (self-healing) app race — a quick double-search
shows stale rows under the self-test for up to 8 seconds — parked on the board.
64 tests, green three runs straight.

**Search engines formally invited.** whichpump.co.uk enrolled in Google Search
Console (domain property, TXT-verified), sitemap submitted, homepage put in the
priority crawl queue; Bing imported the lot. Until the index catches up, AI tools
grounded in it (Gemini, Copilot) will keep claiming the site doesn't exist — days,
not hours.

---

## 2026-08-31 (night) — the site moved house

**Fill-Up now lives at `whichpump.co.uk`.** The name won two blind panels of
simulated first-timers (24/30, then 43/100 against a field including four
AI-generated newcomers), bought at 21:45, live with a certificate by 23:30. The
order that mattered: domain verified on GitHub *before* any DNS existed, so the
takeover class the old domain lived with never touched the new one. The old
address is a permanent 301 that preserves paths and queries — every shared link
and installed app keeps working — and `www` folds into the bare domain.

**The scrub.** The page's own header, `og:url` (deliberately absent until a
permanent domain existed), README, and the analytics token all moved; a new
`robots.txt` keeps the name-bearing tracked files (plans, notes, LICENSE) out of
search results and crawlers off the 2 MB price file; a one-URL `sitemap.xml`
stands ready to grow with the town pages.

**A 404 page in the house voice.** GitHub's default overflowed phones and spoke
developer-speak. Now the pump display shows the one honest reading a missing page
has — 404 — with plain words and one button home. 1.7 KB gzipped, zero JavaScript,
renders even when everything else fails to deploy.

---

## 2026-08-31 (evening) — the header, five panels deep

**The glow dot is gone; a lamp took the job** (board item 2, shipped as C+). The
badge wears ⛽; a warn lamp and a plain sentence appear only while the hourly feed
is stale or you're offline, wired through the existing freshness check with the
same every-exit discipline as the readout snapshot. At rest the header shows
nothing, which is the point.

**The tagline and headline are panel-tested copy.** Five rounds of simulated
first-timer panels (20 → 100 → 50 → 75 → 30 voters) landed on the pair: "Where's
actually cheapest to fill up?" over "Type your postcode. Free, no sign-up: it
finds the cheapest fill-up near you, counting the fuel to drive there." The
findings that chose them: "free, no sign-up" is catch-removal, not price
information; instructions beat slogans; "forecourt" is trade jargon to half of
Britain; and the crowd's own rewrites converged on words no draft had. The pair
is load-bearing — the headline never travels without the tagline. `<title>`,
`og:title` and the meta description moved with them.

---

## 2026-08-31

**Three features from the board's previewed batch** (items 14, 15, 17; picked from the
"features pass" artifact — 13, 16, 18 stay open):

**The last search is remembered** (14). Postcode and radius — or the whole journey:
start, destination, detour, with the journey tab restored through its real click
handler — prefilled on the next visit from localStorage, device-only, same rule as the
car. Never auto-run: a search spends data and GPS consent, so it stays behind the
button. **A GPS search saves the radius but no location at all** — nothing about where
you are persists from 📍, and a test pins that.

**Costco rows say "members only"** (15). 22 Costco forecourts are routinely the
cheapest in their area and would win the ranking — and a stranger driving there gets
turned away at the barrier, which reads as the app's mistake. A neutral pill in the
motorway-services idiom on ranked rows, "· members only" in the brand sub-lists.
Flagged, never hidden — the closed-rows philosophy.

**Journey mode introduces itself** (17). The button reads "Price this journey" in
journey mode (including after searches — the reset in `finally` is mode-aware), and an
empty readout says what the mode uniquely answers: "Says what the whole trip costs in
fuel, and where on the route to stop."

Two test notes. The remembered-search prefill broke two tests that tap search
expecting an empty-postcode error — the field was no longer empty, which is the
feature working; they now clear-and-reload first. And the fuel-rerun test's
"text changed" wait could fire on the searching self-test's blank and read it — the
same race the mid-search test already solved — so it now waits for the B7 figure
itself. (63 tests green, run twice for flake confidence.)

---

## 2026-08-30 (later)

**Four fixes from the same review's user-friendly batch** (board items 7, 9, 10, 11 —
each previewed as a before/after artifact and picked by Thomas; 8 and 12 previewed and
still open):

**Errors appear at the button** (7). `#msg` moved from below the entire car card — a
measured 1,226px down an 844px first screen — to directly under the search button, with
a `scrollIntoView` in `setMsg` as belt-and-braces. The app no longer looks dead on a
stranger's most likely first tap.

**No results, in the user's own fuel** (9). "No forecourts with B7P prices within that
radius. Try a bigger radius." → "No forecourts selling premium diesel within 8 miles.
Try widening the search." — `FUEL_WORD` hoisted to module scope so the message can reach
it. The readout says "Nothing found" with a what-to-do sub-line instead of a blank. The
radius pluralises ("1 mile") — the preview's first draft reproduced the old "1 miles"
bug and got caught.

**The headline admits the winner is closed** (10). At 3am every forecourt can be shut
and rows[0] is still the right plan for the morning — but the readout crowned it without
comment while the caveat sat in the notice pile. Now the same dashed pill the stale
price earned: "closed — opens tomorrow 06:00", from the per-row `opensAt` logic.

**A successful search folds the car card** (11). First-timers got the verdict, then
~600px of untouched form, and were never told the ranked rows existed below. The fold
that returning visitors already get now happens at the end of any successful render —
never against the user's hand: pressing Change pins the card open for the session. The
fuel gauge stays outside the fold, matching the existing behaviour.

Test note: folding hides the fuel select, so shared-page tests now press Change before
switching fuel — exactly what a user does. Four new tests cover the batch (58 green).

---

## 2026-08-30

**Three fixes from the five-lens "does this look AI-made?" review** (fixes 4, 5 and 6 of
six; the emoji stay by Thomas's choice — he likes them):

**The searching spinner became the pump self-test.** The stock border-ring spinner is
deleted; while a search runs, the readout dims and shows **£88.88 — "Checking every
forecourt…"** — the self-test every UK driver has watched at a real pump. The readout is
aria-live, so the search now announces itself to screen readers too. The invariant that
makes this safe: every path out of `run()` that doesn't render — validation returns,
thrown errors — restores the exact previous reading via a snapshot, so eights can never
survive a failed search (pinned by a new test). Side effect: the self-test clears
`bestSave`/`bestEnds` at search start, which incidentally fixes the stale journey-ends
line surviving into a no-results readout.

**Elevation is hierarchy now.** One deep shadow on every surface read as a component
template. The readout (an instrument) and the winning row (with its green ring) keep
their lift; the form cards, beaten rows and trend chart sit on the page as paper with a
1px contact shadow.

**The body type stops being factory settings.** `system-ui` → a humanist local stack
(Seravek / Gill Sans Nova / Ubuntu / Calibri / DejaVu), zero bytes, no webfont, no CSP
change; the h1 loses its boilerplate negative tracking. The readout's `ui-monospace` is
deliberately untouched — that's the fingerprint.

Test note: the mid-search fuel-switch test now records `bestSub` values via a
MutationObserver reading each mutation record's added node — the E10 paint and the queued
rerun's wipe land in the same task, so polling (and even reading `textContent` in the
observer callback) sees only the wiped value. The test got stronger: it now asserts the
first paint *happened and happened in order*, not merely that the final state arrived.
(54 tests green; payload 33.1 → 34.1 KB gz.)

---

## 2026-08-25

**The trend chart follows your fuel.** It plotted the E10 national average for
everyone — a diesel driver comparing the line to the prices on their own screen saw a
~20p gap with no explanation (a nine-critic review finding; on the day this shipped the
two series sat at 161.5p vs 183.0p). The chart now plots the series for the selected
fuel, re-titles itself ("UK average diesel — last 4 weeks"), redraws on every fuel
change, and honours the remembered car's fuel on load. E5 rides the unleaded series and
premium diesel the diesel one — the index carries the two base grades, and the caption
names the series shown. The tooltip and the expandable table keep both series
regardless; only the line and titles switch. `data/index.json` had carried the diesel
series unused since it was built.

Test note for future fixture edits: the fixture's B7 series now dips on one mid-series
day *on purpose*. The chart normalises each series to its own min/max, so two straight
lines with the same slope render byte-identical polylines — without the dip, "the line
actually moved to the B7 series" is untestable geometry. (53 tests green.)

---

## 2026-08-24 (evening)

**Journey mode now says how far along the trip each forecourt sits.** Every row gains
"68 mi in" beside "1.4 mi off route". The number was already computed on every journey
search — each candidate carried its distance along the route — and then thrown away
before rendering. Surfacing it is what lets a reader see for themselves that the top
two rows are three miles from home and the next two are seventy miles along, which is
the whole "should I fill up here or there?" question answered without the app having to
editorialise. Verified on live data, Nottingham to Leeds.

**Which end is cheaper, in the headline panel.** When the cheapest open forecourt in
the first third of the route and the last third differ by more than £1 *on the fill you
are actually buying*, the panel says so: "Round Leeds it's ~6.2p/L cheaper — £2.33 on
this fill". Threshold in money rather than pence per litre, because the saving is capped
by litres bought: 6p/L is £2.33 on a fill and 30p on a splash, and an app that shouts
about 30p teaches you to stop believing it. It shares the panel with the trip-cost line
rather than replacing it.

The end name comes from `admin_district`, which was already in the postcodes.io reply
and simply being discarded — so "round Leeds" rather than "round LS1", for free. A GPS
start or an unnamed district falls back to "at the far end" / "near the start".

**And it sizes the splash.** When the tank can't cover the trip, "you'll need to stop on
the way" now continues: "Put roughly 15 L in here and fill up round Edinburgh — about
£1.40 better than filling right up now." The comparison is deliberately computed
*before* the range filter, because that filter drops forecourts you can't reach — which
would erase the far end in exactly the case this advice exists for.

**The band comes from measuring the archive, and it corrected a wrong conclusion.**
The first three live routes tried — Nottingham→Leeds, London→Nottingham,
Ullapool→Glasgow — all stayed silent, and the tentative read was that Britain simply
has no regional spread worth reporting, because the cheapest option almost anywhere is
a supermarket and supermarkets price nationally. **That was wrong, and wrong because
three city-to-city routes are a biased sample.** `scripts/spread.mjs` put the question
to a month of hourly national prices over 20,000 sampled journey pairs:

- **The spread is real.** Between two places 30–300 miles apart the median gap between
  their cheapest forecourts is **4.0p/L**, and **66% of pairs exceed £1** on a 37.5 L
  fill, 35% exceed £2. The £1 floor is well placed — and since real journeys are more
  city-biased than a grid sample, the true rate of the line firing is lower than 66%.
- **Remoteness is the mechanism.** Median cheapest price is 153.7p where a forecourt
  sits within 2 miles, rising monotonically to 158.9p where the nearest is 10–20 miles
  away. The gap is a rural premium, which is exactly why two supermarket-rich cities
  show nothing — correctly.
- **A 20-mile band was the bug.** 24% of Britain has no forecourt inside it, which is
  precisely why leaving Ullapool produced no comparison. At 40 miles that falls to 9%.
- **Too wide washes it out.** Median gap is 4.0p at bands up to 20 miles, 3.2p at 40,
  3.0p at 60 — and uncapped thirds would make "the far end" of a 300-mile trip a third
  of the country. Hence `min(route/3, 40)`.
- **It's stable enough to act on.** Of pairs with a £1+ gap today, **95% still point
  the same way a week later**, 90% after two weeks, 87% after three. A gap that flipped
  week to week would have made the advice worse than silence.

With that band the line fires on live data as the archive predicts: *"Round Glasgow
it's ~3.2p/L cheaper — £1.20 on this fill"* leaving Ullapool, *"Round Birmingham it's
~6.3p/L cheaper — £2.36 on this fill"* leaving Aberystwyth, and still nothing between
Nottingham and Leeds, where there is genuinely nothing to say.

`scripts/spread.mjs` is kept, and is offline analysis rather than pipeline — nothing
runs it automatically. It exists so the two magic numbers in the band have a
reproducible derivation instead of a plausible-sounding comment.

Two new browser tests (53 green): the ends line names the district, states the gap and
the money, and coexists with the trip-cost line; and the splash sizing appears when the
tank can't reach the cheap end. Both serve their own prices fixture with a forecourt at
the destination end, leaving the shared fixture — load-bearing across both fuels —
untouched. No service-worker version bump.

---

## 2026-08-24 (later still)

**Car presets — six chips for the people who don't know their mpg.** "What's your
fuel economy?" was the app's biggest ask of a stranger: most people genuinely don't
know, and the unsure ones assumed guessing wrong would break the answer. A row of
chips at the top of "Your car" — Small car, Family hatchback, SUV, 4x4 / big SUV,
Hybrid, Van — fills the mpg and tank in one tap, under a line that pre-forgives the
imprecision: *"Not sure about the numbers? Tap the closest match — you can tweak them
after."*

**The figures are owner-reported, not brochure.** Every economy number is a
real-world average (Honest John Real MPG per engine variant, corroborated against
Fuelly), never WLTP, which flatters by 10–25%. A Fiesta 1.0T averages 44.4 in owners'
hands, not the 53 on the sticker. No further discount is applied — the gap is already
in the number. Sources per row live in `plans/car-presets.md`.

**Each chip knows both fuels.** One figure per body style would be ~20% out for half
the country, and in journey mode that error moves which forecourts are *reachable*,
not just the pennies. Tapping Small car fills 46 mpg on unleaded and 58 on diesel.
The chip never touches the fuel dropdown and a later fuel change never rewrites the
mpg — the chip quietly going dark is the honest nudge instead.

**The highlight is derived, never stored.** A chip is lit if and only if the fields
currently hold its exact pair, so hand-editing the mpg un-lights it on the keystroke.
There is no selection state to persist, desync, or lie about — the same idiom the fuel
gauge already used. The tap fires real `input` and `change` events rather than only
assigning `.value`, which is what keeps the "~N L to fill" readout honest and lets the
car save itself; a bare `.value` write fires nothing.

**The default mpg moved 45 → 46**, so a first visit truthfully lights Family
hatchback. A lit chip on arrival teaches what the chips do better than any copy could.
Two tests were reading the old 45 as a literal; they now read the value off the page,
because that default is a product decision and has now moved once.

Three new browser tests (51 green): a tap fills both fields and moves the litres
readout, the pair survives a reload with the chip re-derived against the restored
fuel, and no two chips can share a mpg+tank pair in either fuel — a collision would
light two chips with no way to tell them apart. No service-worker version bump: an
ordinary shell edit.

Deliberately not built: a motorbike chip (real mpg spans 30–130, and a ~14 L tank
makes forecourt differences pennies, against the app's own premise) and a make/model
database (megabytes against a watched payload, for a job six chips do).

---

## 2026-08-24 (later)

**The four consensus wins from the nine-critic UX review.** Nine independent
reviewers (three lenses × three personas) critiqued the live app; these are the
findings five or more hit independently, shipped together:

**The verdict carries the doubt.** The headline panel used to crown a winner its own
row disputed below the fold. Now it names the fuel ("37.5 L of unleaded" — diesel
drivers were re-checking the dropdown before believing any number), wears the same
dashed stale-price caveat as its row, and — when a stale winner leads a fresh-priced
runner-up by less than plausible drift (~1p/L per week of staleness on the litres
bought) — says so in one plain sentence: "Tesco (2nd, £0.04 more) was priced this
week — it may really be the cheaper one." The app already knew all three facts; the
headline just never asked.

**Dashes, not a fabricated reading.** The empty and no-results states showed a
glowing £0.00 — a made-up number in the flagship slot of an app whose whole pitch is
honest numbers. Now: dim £--.-- in the pump-display idiom, using the `--readout-dim`
token that had been defined in all four theme blocks since July and never used once.

**The action above the fold.** The search button first painted at 1007px on an
844px phone. Two compatible fixes: it now sits directly under "Where to?" (the car
card is optional reading — defaults and localStorage do the work), and a remembered
car folds to one line ("45 mpg · 50 L · Diesel (B7) — Change"), controls hidden but
alive so every listener still works. Cold open now fits one screen (button at
684px). Plus `enterkeyhint="search"` so the phone keyboard advertises the Enter
shortcut that always existed. Shipped one real bug along the way and caught it in
verification: `display:flex` on the summary bar silently beat the `hidden`
attribute, showing first-time visitors an empty bar — pinned by a test now.

**Rows that rank, not shout.** Feed names arrive as ALL-CAPS plumbing; now
fully-uppercase names are title-cased (apostrophe-safe — the Esson'S rule; tokens
≤3 letters stay verbatim for BP/EG/MFG; -on-Sea survives) and generic suffixes are
stripped ("PETROL FILLING STATION" carries nothing in a list made of petrol filling
stations). The delta — the number that actually decides — is promoted to bold ink
while non-winner totals step down a notch; ranks and prices align to the top of
each card; movement badges read in words ("▼ down 1p since Thu") with "week low"
as its own pill, so no capsule can wrap; and the Best value pill's ink darkened to
clear WCAG AA (the old green measured 3.84:1 — a new find beyond the watch-list).

48 tests green (three new: the doubt arbitration, the name caser, the returning-
visitor cold open). No service-worker VERSION bump — ordinary shell edits.

---

## 2026-08-24

**The search counter is built — inert until its Worker deploys.** Answers "where is
the app being used?" at the only precision that question needs: a stored row is four
words — `search`, `near`|`journey`, `ok`|`err`, and an area no finer than a postcode
district (`NG1`, never `NG1 5FS`), a typed place name, or the literal word `gps` for
location-button searches (nothing derived from coordinates is ever sent). No IP, no
identifier, nothing that can point at a person — the search-counter plan was amended
in the open to add the fourth word, and the rule is enforced twice: browser tests
sweep every beacon the suite fires against the four-word grammar, and the Worker
re-checks the area's *shape* server-side, so even a buggy client can't write
precision into the tally. Went live the same day: Worker deployed and bound, URL
wired in alongside its CSP `connect-src` entry (our own policy would have silently
blocked the beacon otherwise). Disclosure lives in the README and the plan — a
footer line was considered and Thomas ruled it out. This is the demand-by-town
data the SEO pages in monetisation.md are waiting on.

---

## 2026-08-23

**A second line of defence against script injection.** A full security review (22
adversarially-verified checks; 67 things examined and found solid, no way in for an
outside attacker) confirmed the app's escaping discipline held everywhere — and that
it was the ONLY line of defence, as the code's own comment admitted. Three changes:

- **A Content-Security-Policy** now sits in the page head: even if an escaping slip
  ever let hostile markup in, the browser refuses to load outside scripts or send
  data anywhere except the four services the app actually uses. Verified live both
  ways — a real search and the trend chart work untouched, and probe requests to a
  disallowed host are refused with the policy named in the console. `'unsafe-inline'`
  is a deliberate trade, documented in the tag's comment: a script hash would be
  stronger but goes stale on every hand-edit and a stale hash blanks the app.
- **The last two unescaped sinks are closed**: the trend table's date cells
  (`esc(x.d)`) and run()'s error messages — where a malformed 2xx reply from
  postcodes.io could bounce ~10 response bytes into the page via the browser's own
  SyntaxError text. Mind the fix shape: `esc(e.message || fallback)`, because
  `esc(undefined)` is the string "undefined".
- **data/index.json is now validated in CI** — it fed the trend table yet nothing
  checked it; the workflow's path filter watched only prices.json. Schema-checked
  (ISO dates, prices in the sane band, station floor, strictly ascending days).

The review's remaining actions are account settings, not code — branch protection,
a fine-grained Pi PAT, the noreply commit email, domain verification.

---

## 2026-08-22

**Every price now carries its week.** Result rows gain a movement badge — green
"▼ 1p since Mon · lowest this week", amber "▲ 2p since Thu" — so the app answers
"is now a good time?" as well as "where is cheapest?". The delta compares today
against the station's last daily close that *differed*, so three +1p days read as
one +3p; the day names come from the feed's own change timestamps (`pu`), already
published. "Lowest this week" appears when today's price is the cheapest that
forecourt has been in 7 days. Steady stations stay quiet — no badge is itself the
message. On the day it shipped, 5,164 of 8,030 stations (64%) had moved within the
week: 8,345 grade-level rises against 3,618 falls, July's rising-market asymmetry
still plainly visible.

**How it's fed:** the Pi keeps a rolling 8-day file of daily closing prices
(`~/fuel/history-state.json` — outside the repo, since it's derivable and would
double the hourly churn for nothing). A missing or corrupt file rebuilds itself
from the git archive in about eight `git show`s; that's the first-deploy bootstrap
and the SD-card-death recovery in one, and it was exercised against the real
archive. Payload was measured before shipping, per the standing rule: **+28 KB
gzipped (+7.1%)**, by publishing "pence above the week's low" instead of the low
itself (which measured +40 KB) — small offsets compress where prices don't. The CI
validator now checks the new field's shape: a zero delta, an unknown grade, or a
week-low outside the sane price band fails the push. Eleven new unit tests cover
the maths (gaps are not price moves, dips-and-recoveries still report, the window
prunes); two new browser tests cover the pills.

**A fuel switch landing mid-search is honoured, not dropped.** Yesterday's
one-search-at-a-time guard had a quiet cost: a fuel change arriving while a search
was still in flight was silently swallowed — on a slow connection the switch just
looked broken. It surfaced here as a once-in-seven test flake, was traced to the
guard, and is fixed by queueing the trigger and re-running when the search
finishes. A regression test now forces the overlap with a deliberately slow OSRM
response; it fails on the old code and passes on the new (verified both ways).

Also: the green badge text gets its own `--go-ink` token (light `#1b7f44`, 5.0:1 on
white) — the existing `--go` measures 4.38:1, under the 4.5:1 small-text floor the
ultra-review's contrast watch-list is about. No service-worker version bump: the
shell picks this up on its own, and new data fields are ignored by old shells.

---

## 2026-08-21

**The price trend — the archive finally speaks.** Every hour since July the Pi has
saved a snapshot of every price in Britain into git, and nothing ever read them. Now
a daily index (`data/index.json`, ~300 bytes gzipped for a month) is distilled from
that history and drawn as a small chart on the site: UK average unleaded, last four
weeks, hover for any day, table view underneath. Backfilled from the archive in one
command; the Pi appends a row a day from here. The known pounds-as-pence artefacts in
the older archive are filtered before averaging, and the 8-station sample snapshot is
refused outright — both covered by unit tests.

**Changing fuel type re-runs the search** — comparing unleaded against diesel no
longer costs a button press per grade. A full re-rank, not a reprice of visible rows
(different forecourts sell different grades). Forced two fixes along the way: a
one-search-at-a-time guard on `run()` (a watch-listed race), and a geocode cache so
grade-flicking doesn't repeat identical postcode lookups.

---

## 2026-08-19

Fixes from an adversarial review of the whole codebase — seven findings verified
against the running app before anything was changed, then fixed together because the
service-worker ones interlock: shipping any `sw.js` change bumps `VERSION`, and until
today a bump had a cost of its own (below).

**A service-worker update can no longer delete your cached prices.** The prices cache
was versioned like the shell, so activating a new worker deleted the old one — the only
copy an offline user had — and the replacement sat empty until the next successful
fetch. Upgrade offline, get the 8-station sample set. The prices cache is now
unversioned (`data`), version bumps never touch it, and the worker migrates any old
versioned cache across on activate. This landed in the same change as the first
`VERSION` bump, deliberately.

**Cached prices now survive a server error, not just a dead network.** The worker fell
back to cache only when the fetch *threw*; an HTTP 404/503 — routine for a static host
mid-deploy, and this repo deploys ~24 times a day — was passed straight through, so a
returning user with perfectly good cached prices got the sample set on a
first-of-session load. An error response now falls back to cache too, marked offline,
and only escapes when there's nothing cached at all.

**The update toast now updates in one tap.** The page was cached under two keys — `/`
and `/index.html` — refreshed by disjoint paths (navigations vs the foreground-resume
nudge), so after a deploy the "App updated — tap to refresh" toast could reload the
*old* copy and reappear: two taps to actually update, in exactly the iOS home-screen
scenario the toast was built for. One canonical cache key now, which also halves the
install download.

**Worker fixes now reach resumed apps.** Browsers only re-check `sw.js` itself on
navigation or ~24 hours after a functional event — and a home-screen app resumed from
memory never navigates, so everything above could sit undelivered for days. The
foreground-resume path now calls `registration.update()` alongside its existing checks,
behind the same 5-minute throttle.

**Journey mode announces fuzzy place matches.** The 2026-08-17 entry below claims the
announcement covers "both journey fields" — it didn't; only near-me read the geocoder's
`approx`. A journey to "Devon" silently routed to Crook of Devon, Perthshire — the
300-miles-wrong guess the feature exists to prevent. Both journey fields now announce
("Routing to Crook of Devon, Perth and Kinross — not where you meant? Try a
postcode."), with a regression test.

**Escaped the one forgotten innerHTML sink.** The "lowest pump price" notice piped
feed-supplied station names into `innerHTML` unescaped — every other sink escapes them,
this one path forgot. Latent today (no forecourt's trading name contains markup), but
the day one does, it's script execution with no CSP behind it. The escaper is now a
shared helper used by every sink.

**A valid-but-empty prices.json can no longer wipe the real stations.** `loadStations`
assigned the global before checking the length, so a 200 with an empty list destroyed
~7,976 real stations on the way to the very catch block that exists to keep them
(`fe1bc88`'s fix, missed via this path). Parse into a local, validate, then assign.

**The heartbeat can no longer vouch for a push that never happened.** The fetcher
pinged healthchecks.io on success — but the commit and push live in the Pi's runner,
*after* the fetcher exits, so an expired PAT or rejected push kept the site serving
stale prices while the dead-man's switch stayed green: the one failure class it exists
to catch. The fetcher no longer pings at all; the runner pings as its last step, after
the push (and after clean no-change runs). The runner's contract is now written down in
`pi/README.md`.

**The service worker finally has tests.** A third suite (`tests/sw.test.mjs`) drives
the real worker with no request interception — the tests' own server plays the network,
sending the ETags the worker uses to detect a changed shell. Covered: prices served
from cache with the offline footer when the network drops *and* when the server errors
mid-deploy, and the update toast: it appears when the shell changes, one tap serves
the new page, and no second toast follows. Two of the bugs above would have been
caught by it — verified by running the suite against the pre-fix worker, which fails
on exactly the one-tap assertions.

---

## 2026-08-17

**Search by town name or half postcode.** "Nottingham" or "NG1" now works anywhere a
postcode did — near-me and both journey fields — via postcodes.io's places endpoint
(OS Open Names, same licence, same already-preconnected host). Because that dataset
only knows populated places ("Devon" matches a Scottish village called Crook of
Devon), the app announces what it matched — "Showing prices near Testville,
Testshire — not where you meant? Try a postcode" — rather than silently guessing.

**The trip cost moved into the headline panel.** Journey mode has said what the whole
trip costs since 2026-07-31 — but as one of up to five identical stacked notices, it
went unseen (it was requested again a fortnight after it shipped, which is its own
review). It now sits in the headline panel, in the slot near-me uses for savings:
"This journey will cost you about £50.56 in fuel (280 mi · 33 L)". This also gave
journey mode its first automated test, including that a closed forecourt's cheaper
price never sets the quote.

---

## 2026-07-31

**Tests, at last.** Twenty of them, run by GitHub Actions on every push: unit tests for
the fetcher's pure functions against shapes the real feed has sent, and Playwright
driving the actual app in a real browser — mocked routing, pinned clock — asserting
everything that previously regressed or nearly regressed by hand. Three bugs on
2026-07-30 alone lived in exactly the places only regression tests catch. Plus a lint
job for the constraints that shipped bugs: the charset-within-1024-bytes rule and all
scripts parsing. The app itself remains dependency-free; Playwright is dev tooling only.

---

## 2026-07-30

**Journey mode says what the trip itself will cost.** "This 280 mile trip will burn
about 33 L of E10 — around £50.56 at the best price on your route" — the question
behind most journey searches, answered from numbers already in hand. Priced at the
lowest pence-per-litre among open forecourts en route; the first draft quoted the
best-value stop instead, which at a full tank is merely the nearest and overstated a
280-mile trip by £3. (`586effd`)

**Faster first search.** The connections to the postcode and routing services now open
while you're still typing, instead of after you tap search — saving the 100–300ms of
connection setup mobile networks charge for talking to a new server. (`fdb59af`)

**The app announces its own updates.** The offline cache serves the page one load
behind, and an iPhone home-screen app resumes from memory without loading at all — so
users lingered on old versions indefinitely and re-reported already-fixed bugs (it
happened within the hour). When a newer version exists, a pill appears: "App updated —
tap to refresh". Checked on load and every return to the foreground. (`9bfd182`)

**Honest messaging when closed forecourts don't make the list.** In dense areas the
closed ones all rank below the 15 shown, and the note still promised "greyed out" rows
nobody could see — reported as a bug at TW15 2AG, where all 10 closed forecourts sat at
rank 16+. The note now says open ones outranked them, and the brand lists — which show
every result — mark closed branches greyed with "· closed". (`8852c6b`)

**Set your fuel level like the gauge shows it.** A slider under the level buttons,
marked like a real dash gauge — 0 to 1 with ticks at every eighth, quarters taller —
stepping in 2.5% so a needle between two marks is expressible. Live readout of litres
to fill ("70% full · ~17 L to fill"), synced both ways with the buttons, feeding the
fill cost and journey range alike. (`120ecaf`, `fbef0ee`)

**Minutes, not just miles.** Every distance now carries drive time — "2.6 mi · 7 min
away", "0.3 mi · 1 min off route" — from the same routing requests the app already made.
Minutes are the unit people plan in; when routing is unavailable and distances are
estimates, minutes are omitted rather than invented. (`43343e8`)

**What did the search save you?** A green line under the headline: "£0.75 cheaper than
your nearest (Sainsbury's · 1.4 mi · 4 min)" — the comparison against just driving to
the closest forecourt, which is what people do without the app. Judged among open
forecourts only, and when your nearest is also the best value it says that instead.
(`43343e8`)

**A failed refresh can no longer wipe the real prices.** Resuming the home-screen app
with no signal and an evicted cache could replace all ~7,976 stations with the 8-station
sample set, then invite a re-search against the fakes. A failed refresh now keeps what it
has and marks the footer offline. Found by reviewing the interaction between the two
fixes below. (`fe1bc88`)

**The freshness label stays honest.** "Prices updated 8m ago" was computed once and
frozen, and a session never refetched — so an iOS home-screen app resumed from memory
showed older prices *and* a wrong label, disagreeing with Safari on the same phone. The
label now recomputes every minute, and returning to the foreground rechecks for newer
prices, telling you if results on screen are out of date rather than swapping them
silently. (`10a1149`)

**Formal attribution.** The footer now carries the Open Government Licence v3.0 wording
and credits OpenStreetMap alongside OSRM — the latter is required by ODbL and naming OSRM
alone didn't discharge it. (`9aa5476`)

**Open now.** Just under half of UK forecourts close at some point — 4,025 are 24/7,
3,527 aren't. A closed one is now greyed out, badged with when it opens, and can never be
ranked best value. Before this, a search at midnight could confidently recommend
somewhere shut. Motorway services are labelled too. (`af919b5`)

**Supermarket grouping now comes from the feed.** The Supermarkets/Fuel brands split used
to match brand names against a hardcoded list, which missed 676 forecourts (30%) because
plenty don't trade under a supermarket's name. Uses the feed's own flag instead.
(`af919b5`)

**Price age.** The feed says when each price last moved; that's now captured and anything
unconfirmed for over a fortnight carries a "Price 3 weeks old" badge. Roughly 3% of the
country hasn't been repriced in over a month and was previously shown with the same
confidence as an hour-old price. (`0d844e0`)

**Works with no signal.** Added a service worker: the app opens instantly from cache and
keeps the last prices you had. Searching by location still works offline; postcode lookup
can't, and now says so instead of showing a raw browser error. (`e1e27b7`)

**Installable on Android.** Added `manifest.json`, so the home-screen shortcut the README
had always claimed actually works outside iOS. (`0d844e0`)

**Brand names matched as words, not substrings.** The rule for "Moto" was matching the
word "Motors", folding two dozen unrelated village garages — Kirkby Motors, Cedar Motors
Ltd — into the motorway services chain. 27 forecourts were misfiled. (`08256bc`)

**Declared a doctype and character set.** The page had neither, so it rendered correctly
only because GitHub Pages happens to send a charset header — served anywhere else, the
headline price read `Â£0.00`. Also added `lang`, a description, and Open Graph tags so a
shared link previews. (`da53457`)

**Keyboard access to brand rows.** They claimed to be buttons but had no `tabindex` or key
handler, so keyboard and screen-reader users were told they were interactive and then
couldn't operate them. (`af919b5`)

**Licensed.** All rights reserved on the code, with `data/prices.json` explicitly carved
out as Open Government Licence v3.0. (`e89a263`)

---

## 2026-07-29

**Halved the download.** `data/prices.json` was 2.3 MB, of which 46% was data the app
never read — a 64-character ID per station, the street address, and "price: 0" for fuel a
station doesn't sell. Removed those, rounded coordinates to about a metre, and stopped
telling browsers never to cache the file. **744 KB → 257 KB over the wire**, and repeat
visits within the hour now cost nothing. (`b7d99f3`)

**Journey mode uses real driving distances.** It had been measuring in straight lines
while "Near me" used real roads. A point 0.8 miles from a route measured 4.9 miles by
road, so detours were badly under-counted. Also replaced a bounding box round the whole
journey with a spatial index — London→Edinburgh went from 2.6 million distance
calculations to 29,000. (`6685768`)

**Range awareness.** Journey mode now works out how far your remaining fuel will take you
and leaves out forecourts you couldn't reach, saying plainly whether the trip needs a
stop at all. (`6685768`)

**Rejected bad records from the feed.** Eight forecourts report prices in pounds rather
than pence — read as pence, that station is 100× cheaper than anything real and wins
every ranking near it. Five more had swapped or sign-flipped coordinates, placing a
Somerset forecourt in the North Sea. Both are now dropped at ingest. (`aba518f`)

**Made pipeline failure visible.** The fetcher refuses to publish if the station count
drops more than 10% since the last run, so a half-finished fetch can't overwrite the
national list. Added a data validator that runs in GitHub Actions on every push, a
warning in the app once prices are over three hours old, and an optional heartbeat so a
dead Raspberry Pi raises an alert instead of quietly serving stale prices. (`aba518f`)

**Fixed "Near me" shortlisting.** It measured road distances for the 60 straight-line
nearest forecourts — a shortlist drawn before price was considered — so a cheap station
just beyond them could never win. Now ranked by estimated true cost, and raised to 90.
(`5455972`)

**Fixed a pagination bug of my own making.** A same-day change assumed the API signals
"no more data" with an empty page; it actually returns a 404. Every run failed for about
twenty minutes until this landed. (`eae6751`)

---

## 2026-07-24 to 2026-07-28 — initial build

Commits in this period were made through the GitHub web editor with generic messages
("Update index.html"), so the detail isn't recoverable from history. Broadly, this is when
the app came into being:

- True-cost ranking — pump price plus the fuel burned getting there and back
- "Near me" and "Plan a journey" modes
- Cheapest-by-brand lists, split between supermarkets and fuel brands
- The Fuel Finder data pipeline, and the move to running it on a Raspberry Pi after
  GitHub Actions turned out to be blocked by the API's firewall
- Custom domain at fuel.thomasainsworth.co.uk, light and dark themes, saved car details,
  Cloudflare analytics
