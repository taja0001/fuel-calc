# Fuel-calc ultra-review — synthesis

> **Status 2026-09-01:** bugs 1–6 and worth-building 1–3 are long since shipped
> (see CHANGELOG 22–25 Aug); the run() re-entrancy watch item proved prophetic —
> see the 1 Sep flake investigation on the review board (items 27/28). Live
> residue worth carrying: Pi fetch timeouts (pairs with backlog Robustness 1),
> the two unconfirmed contrast halves, and the watch-list checks. Historical
> record otherwise.

Seven findings were adversarially verified as real (one partially), none previously known, none overlapping the rejected list. Twelve more are plausible but unverified. Ranked by value per effort within each group. A sequencing note first: **fixing the service-worker bugs forces a `VERSION` bump, and an unverified finding says that bump deletes the user's cached prices** — verify and fix that before shipping any sw.js change.

## Bugs to fix (all verified)

1. **Escape station names in the lowest-pump-price notice** — `index.html:1008` pipes feed-supplied brand/trading names straight into `innerHTML`; every other sink in the file escapes them, this one path forgot. Today's 8,027 stations contain no markup, so it's latent — but the moment any forecourt operator's trading name contains a tag it executes script, and there's no CSP to stop it. *Tiny: reuse the escaper already at line 870.*

2. **Stop a valid-but-empty prices.json wiping real stations** — `loadStations` (index.html:606) assigns the global before the length check, so a forced refresh that gets 200-with-empty-stations destroys ~7,976 real stations and silently installs the 8-station sample — the exact disaster `fe1bc88` was meant to close, via a path that fix missed. Trigger is unlikely (the Pi's shrink guard and atomic deploys protect most routes) but the invariant in the code's own comment is violated. *Tiny: parse into a local, validate, then assign.*

3. **Unify the page's two service-worker cache keys** — sw.js caches the page under both `/` and `/index.html`, refreshed by disjoint paths (navigations vs the resume nudge), so after a deploy the "App updated — tap to refresh" toast serves the *old* page and reappears; two taps needed, in exactly the iOS home-screen scenario the toast was built for. Also causes spurious toasts in reverse and doubles the install download. *Small: normalise `isPage()` requests to one cache key, drop the duplicate from SHELL_FILES, make the nudge fetch `./`.*

4. **Fall back to cached prices when the network returns an HTTP error** — `networkFirst` (sw.js:50-53) returns a 404/503 (routine mid-deploy, ~24 deploys/day) without consulting the cache, so a returning user with perfectly good cached prices gets the sample set on a first-of-session load. Note: the finding's second claim (captive-portal cache poisoning) was **refuted** — HTTPS makes it unreachable — so only the narrow fallback fix is warranted. *Small.*

5. **Announce fuzzy place matches in journey mode** — the journey branch never reads geocode's `.approx`, so "Devon" as a destination silently routes to Crook of Devon, Perthshire — the 300-miles-wrong guess the 2026-08-17 feature exists to prevent, and the CHANGELOG's claim that it covers "both journey fields" is currently false. *Small: push an escaped note into the existing journey `notes` array and extend the existing Playwright test.*

6. **Move the heartbeat ping after the git push** — build-prices.mjs pings healthchecks.io before the off-repo runner commits and pushes, so an expired PAT or rejected push keeps the site serving stale prices while the dead-man's switch stays green — the one failure class the README says it exists to catch. *Small; extends backlog Robustness items 1 (commit the Pi's scripts — the ping must move into the runner) and 3 (test-fire the alert).*

## Worth building

1. **A service-worker test suite** — the toast, the `X-From-Cache` offline contract, and cache eviction have zero automated coverage; the test header's assumption that Playwright can't do this is wrong, since a second context with no `route()` calls against the tests' existing local server works fine. Two of the verified bugs above would have been caught by it, and it's the safety net for shipping their fixes. *Medium; extends the 2026-07-31 testing push. Three recipe corrections from verification: use connection-refusal or `setOffline` (a 500 won't trigger the fallback), give the test server ETags, and prime the DATA cache with one online reload first.*

2. **(Unverified) Protect the DATA cache across VERSION bumps** — plausibly, activating a new SW deletes the cached prices before fresh ones are fetched, meaning the very act of shipping the fixes above could hand offline users the sample set. Verify first, and if real it must land *in the same commit* as the first sw.js fix. *Tiny: unversion the data cache name or copy the entry across on activate.*

3. **(Unverified) `registration.update()` on foreground resume** — the resume path never re-checks sw.js itself, so SW fixes may only reach home-screen users on a cold start. If verified, it's the one line that makes every other sw.js fix actually deployable to the core audience. *Tiny.*

4. **(Unverified) Fetch timeouts in the Pi fetcher** — bare `fetch` with no AbortSignal plus `flock -n` plausibly turns one stalled connection into a permanent, silent outage. *Tiny (`AbortSignal.timeout` on each fetch, `timeout` wrapper in the runner); pairs naturally with bug 6 and backlog Robustness item 1.*

## Watch-list (unverified — check before acting)

- **Empty-200 page ends pagination silently** (build-prices.mjs) — a truncated fetch under the 10% shrink guard would publish; the 404-end-marker history makes this credible. Tiny fix if confirmed.
- **`run()` re-entrancy** — Enter key and the GPS callback bypass the disabled button; a slow search finishing late can paint the wrong city's results. Small.
- **Stale `userLoc` reuse** — an empty postcode search silently reuses an hours-old origin; worst on resumed home-screen apps after driving. Small.
- **Visibility-refresh racing an in-flight search** — stale prices can render under a fresh footer, destroying the "search again" warning. Small.
- **Two contrast failures** (closed-row opacity ~2.3:1 on the opening time; light-theme amber 3.85:1 on the primary button and links) — both fail WCAG AA, both come with pre-computed single-token fixes. Verify the ratios, then small.
- **Untested app logic** — the app's own overnight `isOpen`/`opensAt` math, geocode's three-way regex routing, and the OSRM-down fallback are all shipped behaviour with no coverage; cheapest wins are Playwright cases re-pinning the clock. Medium; extends the existing test suite.
- **No dedupe of stations by node_id** in fetcher or validator — duplicates would both reach the app and mask real losses from the shrink guard. Small.

Nothing above re-proposes backlog items 0-6, the price-history plan (correctly deferred per memory), or anything in the rejected table.