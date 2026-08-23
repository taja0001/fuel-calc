# Security review — outstanding items

Written **2026-08-23**. A 22-agent review (six lenses, everything adversarially
verified) found the app itself in good shape — no way in for an outside attacker,
very little visitor data leaves the browser, none of it reaches the owner. Full
findings and the "who sees what about a visitor" inventory aren't duplicated here;
this is the action list. Two code findings are already **done** (23 Aug): the CSP,
the two remaining unescaped sinks, and `data/index.json` now validated in CI — see
`CHANGELOG.md`. Everything below needs Thomas, not code, or is optional hardening.

Nothing here is urgent. The findings are about *what happens if a key leaks* and
*tightening edges*, not an active hole.

---

## Needs Thomas — account and DNS settings

### 1. Branch-protect `main` — the highest-value item on this list

`main` is currently unprotected (`protected:false`), and Pages auto-deploys every
push to it immediately (legacy build, independent of CI). `validate-prices.yml`
calls itself "the backstop for a bad push," but it runs *after* the push, gates
nothing, and can't stop a force-push. Two consequences: (a) the git history of
`data/prices.json` — the price archive, the actual product — could be rewritten or
destroyed by anyone holding the Pi's push credential or the account; (b) a bad Pi
run publishes live before validation finishes, no attacker required.

**Do:** Settings → Branches → add a rule for `main` → block force pushes and
deletions, "include administrators" on (the Pi pushes as the owner, so this must
cover them too). **Do not** make the "Validate prices" status check *required* —
required checks reject direct pushes of fresh commits, which would break the Pi's
hourly push outright. Keep the validator advisory; if you want it to actually get
noticed on failure, that's a GitHub notification setting, not a merge gate.

*Two minutes, breaks nothing, closes the one finding that could cost the archive.*

### 2. Scope the Pi's PAT down to Contents-only — pairs with #1

A classic (broad-scope) PAT can call the repo-admin API and simply delete branch
protection before force-pushing, which would silently defeat #1. A fine-grained PAT
scoped to `Contents: write` on this one repo, with an expiry, cannot.

**Do:** on GitHub, create a fine-grained PAT scoped to `taja0001/fuel-calc` only,
permission `Contents: Read and write`, nothing else, with an expiry date. Swap it
into `~/fuel/secrets.env` on the Pi. Confirm the next hourly run pushes fine, then
revoke the old token. *pi/README.md already notes an expired PAT once left the
site stale for days — the healthchecks.io dead-man's switch is the safety net for
this exact failure mode, so an expiring token is not a silent risk.*

### 3. Stop leaking the real email in commits

Both the Mac's global git config and the Pi's leak `thomas.ainsworth1@outlook.com`
into every commit — 653 so far, growing hourly — even though the GitHub account
itself uses the noreply address (38 commits already do). Ties the pseudonymous
`taja0001` identity to a real personal address, harvestable via the public API with
zero preconditions.

**Do, in this order** (order matters — reversed, the Pi's push starts failing):
1. On the Mac: `git config --global user.email "152604317+taja0001@users.noreply.github.com"`
2. On the Pi, in `~/fuel/fuel-calc`: `git config user.email "152604317+taja0001@users.noreply.github.com"`
3. *Only after both are done*, optionally enable GitHub's "Block command line
   pushes that expose my email" (Settings → Emails).

**Do not** rewrite history to scrub the old 653 — every commit SHA changes, and
main's history *is* the price archive. Those are sunk; this just stops new ones.

### 4. Verify the domain on the GitHub account

DNS confirmed: `_github-pages-challenge-taja0001.thomasainsworth.co.uk` returns
NXDOMAIN, meaning the domain is **not** verified at account level (the TXT record
must persist in DNS for verification to hold — it's currently absent). Today this
is not exploitable — the domain is actively bound to this repo and GitHub blocks
other repos from claiming an in-use domain. The exposure is a *future* one: if the
Pages mapping ever lapses (repo made private, the `CNAME` file lost in a bad merge
from an hourly Pi push, account issue), the hostname becomes claimable by anyone.

**Do:** GitHub account Settings → Pages → Verified domains → add
`thomasainsworth.co.uk` (verifying the apex covers the `fuel` subdomain too) →
publish the `_github-pages-challenge` TXT record Cloudflare gives you, and leave it
in DNS permanently.

### 5. Confirm 2FA is on, and check the parked apex/www DNS records

Two things nobody could check remotely:

- **2FA on the `taja0001` account** — GitHub's account requires it for
  code-contributing accounts already, so this is a confirmation, not a likely gap.
- **`thomasainsworth.co.uk` and `www.` both return Cloudflare error 530 ("origin
  DNS could not be resolved")** — the classic signature of a DNS record pointing
  at something no longer there. Only Thomas can see what the Cloudflare `@`/`www`
  records actually point to. If that hostname is a dead, re-registerable service
  (an old deleted app, a lapsed `*.github.io`, an expired domain), someone could
  claim it and serve content one label away from the fuel site under the same name.

**Do:** confirm 2FA in Settings → Password and authentication. Separately, open the
Cloudflare dashboard → `thomasainsworth.co.uk` → DNS, check what `@` and `www`
point to, and either fix the dead target or delete the records if that old site is
gone for good.

---

## Optional hardening — small, no urgency

### 6. Pin GitHub Actions to commit SHAs, not floating tags

`test.yml` and `validate-prices.yml` both use `actions/checkout@v4` and
`actions/setup-node@v4` — first-party GitHub actions, floating tags. Low risk today
(both workflows already run `permissions: contents: read`, no secrets are
referenced anywhere in `.github/`), but pinning is cheap and the risk grows the day
either workflow gains a secret or write permission.

**Do:** pin each `uses:` line to a full commit SHA with the version as a trailing
comment, and add Dependabot (`package-ecosystem: github-actions`) to manage bumps
deliberately. *CI-only change; cannot affect the served page.*

### 7. Cap the fetcher's response size

`fetchAll` and `getToken` in `scripts/build-prices.mjs` buffer each Fuel Finder API
response fully in memory with no size cap. A compromised or badly-behaving upstream
returning an unbounded body could exhaust memory on the Pi and stall the hourly
run. Blast radius is the owner's own hardware, not a bad publish — the shrink guard
and validator already stop a truncated or malformed feed from going live, and the
healthchecks.io ping surfaces a stalled fetcher.

**Do (optional):** stream the response body and abort past a sane ceiling (e.g.
64 MB) instead of `await r.text()` unconditionally.

### 8. Add a CAA DNS record

`dig +short CAA thomasainsworth.co.uk` returns nothing — any certificate authority
in the world can currently issue a cert for the domain to anyone who passes domain
validation. GitHub Pages uses Let's Encrypt.

**Do (optional):** in the Cloudflare DNS panel, add a CAA record allowing
`letsencrypt.org` (plus Cloudflare's own CAs if the apex/`www` stay proxied).

### 9. Add a `robots.txt`

Every tracked file is served on the live product domain, not just visible in the
repo — `plans/monetisation.md`, `CHANGELOG.md`, the Pi scripts, all of it 200s at
`fuel.thomasainsworth.co.uk/plans/...`. No `robots.txt` exists, so search engines
can index business/roadmap thinking under the product's own domain — a different
discoverability tier than a GitHub repo.

**Do (optional):** add a `robots.txt` disallowing `/plans/`, `/pi/`, `/scripts/`,
`/notes/` equivalents that are actually published (check what's tracked vs
gitignored first — `notes/` and `.claude/` are already excluded from the repo
entirely and never reach the domain).

### 10. Route `data/index.json` through the service worker's network-first path

The trend index currently falls through to the shell's stale-while-revalidate
strategy rather than the network-first path used for `prices.json`, so a returning
visitor sees yesterday's trend row until their *next* visit, and — because it lands
in the versioned shell cache rather than the unversioned data cache — a future
`VERSION` bump silently discards it. Not a security issue; a freshness/design nit
that surfaced during the review.

**Do (optional):** route `data/index.json` alongside `data/prices.json` in
`sw.js`'s fetch handler so it gets the same network-first treatment and lands in
the unversioned `DATA` cache.

---

## Still open — not yet actioned, needs a decision not a click

### 11. Coarsen GPS precision sent to OSRM, and disclose it

"Near me" searches forward the visitor's GPS fix to `router.project-osrm.org` — a
volunteer-run public demo server with no published privacy policy — rounded to
about 1 metre, essentially their front door. The footer says only "Driving
distances via OSRM," not that a precise location leaves the device. This is a real,
ongoing finding, distinct from #1-#5 above: it wasn't dismissed, it just wasn't
part of the two fixes shipped on 23 Aug (the CSP and the two unescaped sinks).

**Proposed fix, still to do:** round the coordinate to ~3 decimal places (~110 m,
street-level — the ranking result is unaffected since OSRM snaps to the road
network and the stations compared are miles away) before it's sent, and add one
footer sentence disclosing that searches send location/postcode coordinates to
OSRM and postcodes.io. The complete fix is backlog item 0 (self-hosted routing),
which removes the third party outright — this is the cheap interim step.

---

## Explicitly not worth doing (dismissed by the review, recorded so it isn't re-proposed)

- **Rewriting git history to scrub old commit emails** — see #3. The archive is
  the product; never rewrite it for this.
- **Requiring the CI status check before merge on `main`** — see #1. Would break
  the Pi's direct-push pipeline.
