# Plan: the domain move — and getting the name off the site

> **EXECUTED 2026-08-31 → 09-01.** All ten steps and the verify-after list are done —
> the ticked record is [whichpump-cutover-runbook.md](whichpump-cutover-runbook.md).
> Step 9 went the route-under-domain way (`counter.whichpump.co.uk`); og:url shipped
> in the scrub. This file stays as the reasoning of record; nothing in it is still
> pending except the copyright/trading-name call it flags, which remains Tom's.

> **This plan now gates advertising too** (2026-08-25): Thomas wants to launch on
> local Facebook groups and MSE, and [forum-launch.md](forum-launch.md) makes this
> migration its first hard prerequisite — forum links are permanent, and posting a
> name-bearing URL into *local* groups deanonymises to neighbours in one click. Step 9
> (the Worker rename) is promoted from optional to required by the same logic, with a
> preference for moving the Worker behind the new domain as a route — that also puts
> it in a Cloudflare zone where the free WAF rate-limiting rule can apply.

Written **2026-08-24**. The domain idea dates from July (candidates, pricing, and the
buy-before-SEO reasoning live in [monetisation.md](monetisation.md) §"A domain of its
own" — the checklist there is superseded by this file). What's new is the motivation:
Thomas wants the site to **stop showing his name anywhere**, which widens the job from
"new address" to "new address plus a scrub of where the name leaks". Name choice is
his at checkout — `fuelmaths` was the July recommendation, `whichpump.co.uk` the
August favourite, and **`forecourtfinder` is Thomas's own 2026-08-25 candidate**
(.co.uk/.uk/.com all free that day; full read in monetisation.md §domain); re-check
availability before buying any (RDAP checks go stale).

## What "name off the site" can and cannot mean — read before buying

Where a visitor sees the name today:

| Where | What they see |
|---|---|
| The address bar | `fuel.thomasainsworth.co.uk` |
| View-source, line 5 | `Copyright (c) 2026 Thomas Ainsworth` + the old URL on line 4 |
| The network tab / view-source | the beacon URL `search-counter.thomas-ainsworth1.workers.dev` |
| Any tracked file fetched on the domain | `LICENSE` line 2, `plans/*`, `CHANGELOG.md` — Pages serves every tracked file with a 200 |

**Achievable:** a casual visitor — address bar, view-source, network tab — never sees
the name. **Not achievable:** anonymity from anyone who finds the GitHub repo *while it
stays public*. ~~The repo must stay public (free Pages requires it)~~ — **no longer
true as written** (2026-08-25): free Pages requires it only while GitHub hosts the
site. Three costed alternatives (GitHub Pro ~£46/yr; Cloudflare Pages free with branch
protection lapsing; a free public-site/private-archive split) are laid out in
[forum-launch.md](forum-launch.md) §1c — decide alongside this migration, since moving
hosting anyway is what makes the free paths available. The LICENSE names Thomas, and
680+ commits carry his author name; rewriting that history would destroy the price archive
— same ruling as the commit-email finding in
[security-review-2026-08-23.md](security-review-2026-08-23.md). Whether the LICENSE
and header keep his real name or switch to a trading name is a legal-identity call
only Thomas can make; the plan just flags the moment to make it.

## The move, in order

1. **Re-check availability and buy** (~£5–15/yr; registrar notes in monetisation.md).
   Put the DNS zone on the existing Cloudflare account — the redirect tooling, the
   analytics, and the Worker already live there.
2. **Verify the new domain on the GitHub account before pointing anything at it**
   (Settings → Pages → Verified domains, TXT record kept permanently). This closes
   the domain-takeover class from day one on the new name — the old domain never had
   it (security review #4).
3. **DNS**: new `CNAME` record → `taja0001.github.io`, **grey-cloud** (proxying
   breaks the Pages certificate — learned in July, recorded in monetisation.md).
4. **Repo `CNAME` file** → the new domain, one commit. Pull first — the Pi pushes
   hourly and this file rides in the same branch.
5. **Pages dashboard**: custom domain → new one; wait for the certificate; re-tick
   "Enforce HTTPS".
6. **index.html scrub**: header comment (old URL on line 4, name on line 5 — the
   trading-name decision above), OG tags citing the old URL. The CSP needs **no**
   change (only third-party hosts and `'self'`, which is relative), `manifest.json`
   and `sw.js` are origin-relative, the fuel data pipeline never touches the domain.
7. **Cloudflare Web Analytics**: create a site for the new hostname and swap the
   beacon token in index.html line 36 — the token is hostname-scoped, so the old one
   would silently count nothing.
8. **The old domain becomes a redirect and stays one for years**: orange-cloud the
   old `fuel` record, add a free Cloudflare 301 redirect rule to the new domain.
   Every shared link, bookmark, and installed app flows through it. It costs a few
   pounds a year to keep; drop it and someone else can eventually pick it up along
   with all that residual traffic.
9. **Optional, same intent**: the beacon URL still says `thomas-ainsworth1`. Either
   rename the account's `workers.dev` subdomain (Workers → account settings; the old
   URL dies instantly, so update `BEACON` **and** the CSP `connect-src` in the same
   push — stale cached shells beacon at the dead name and fail silently, which is
   harmless), or route the Worker under the new domain (`counter.<newdomain>`,
   orange-clouded — separate record from the grey-cloud Pages one, so no conflict).
10. **References**: README, plans that cite the old URL. Search Console enrolment
    belongs with the SEO work, not here.

## What existing users feel (small, one-time, worth knowing before)

- **Installed home-screen apps** are pinned to the old origin. They keep working
  through the redirect, but the installed wrapper itself won't transfer — users
  re-add to home screen once on the new domain.
- **Saved settings don't cross origins**: localStorage stays with the old domain, so
  mpg/tank/fuel get re-entered once (three fields). This is the strongest argument
  for migrating **before** saved home/work postcodes (backlog #1) ships — every
  origin-bound convenience added first is one more thing users lose in the move.
- **The service worker** starts clean on the new origin: first visit downloads
  everything fresh, then offline works as before. No `VERSION` bump needed; the old
  origin's caches die quietly behind the redirect.

## Verify after (the usual: in a real browser, against the live site)

- `curl -sI` old URL → 301 → new; new URL serves 200 with a valid cert; plain-http
  on the new domain redirects to https.
- `gh api repos/taja0001/fuel-calc/pages` shows the new cname; the account's
  verified-domains page lists the new apex.
- One real search on the new domain → the row lands in the counter's SQL (beacon
  passes CSP on the new origin — nothing in the policy is origin-specific, but
  verify rather than reason).
- New analytics token shows the visit; add-to-home-screen and an offline reload work.

**Sequencing:** do this before the SEO town pages (so authority accrues to the
permanent name — July's reasoning, still right) and ideally before saved postcodes
(above). *Roughly an hour of clicking spread around a certificate wait, plus the
domain fee. The name-scrub half is one commit of the migration anyway.*
