# Changelog

Notable changes to Fill-Up. Newest first. Hourly `chore: update fuel prices` commits are
data, not changes, and aren't listed — there have been 64 of them so far.

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
