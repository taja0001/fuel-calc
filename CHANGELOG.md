# Changelog

Notable changes to Fill-Up. Newest first. Hourly `chore: update fuel prices` commits are
data, not changes, and aren't listed — there have been 64 of them so far.

---

## 2026-07-30

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
