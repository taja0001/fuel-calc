# Runbook: the whichpump.co.uk cutover

Written **2026-08-31 ~22:15**, the evening the domain was bought (Nominet shows
registration 21:45, Cloudflare Registrar — so the DNS zone is already on the CF
account and the old plan's "move the zone" step is moot). This is the concrete,
tick-the-boxes version of [domain-migration.md](domain-migration.md), which stays the
reasoning of record. Name chosen with eyes open on the Which? adjacency
([monetisation.md](monetisation.md) §fourth batch: two-panel winner, 24/30 then
43/100; support explicitly Which?-borrowed; `.com` taken).

Legend: **[TOM]** = clicks only you can do · **[CLAUDE]** = repo commits on your word.
Do the phases in order — **phase 1 before any DNS exists** is what closes the
domain-takeover class from day one (security review #4).

---

## Phase 0 — same evening as purchase (5 min)

- [ ] **[TOM]** Buy **whichpump.uk** in the same Cloudflare account (~£5/yr). Free at
      21:55 tonight; it's the nearest typo to a name whose `.com` is already gone.
      No DNS needed — parked is fine; later it gets a redirect rule.

## Phase 1 — verify BEFORE pointing (10 min + a propagation wait)

- [ ] **[TOM]** GitHub → Settings → **Pages → Add a verified domain** →
      `whichpump.co.uk`. Copy the TXT record it issues.
- [ ] **[TOM]** Cloudflare → whichpump.co.uk zone → DNS → add that **TXT** record.
      Wait for GitHub to show ✅ Verified. **The TXT stays forever** — it is the
      protection, not scaffolding.

## Phase 2 — point DNS (5 min)

- [ ] **[TOM]** Same zone → add **CNAME** `@` → `taja0001.github.io`, **GREY cloud**
      (DNS only). Orange breaks the Pages certificate — July lesson, recorded in
      monetisation.md. Cloudflare flattens the apex CNAME automatically.
- [ ] **[TOM]** Optional: CNAME `www` → `taja0001.github.io`, grey cloud too.

## Phase 3 — repo cutover (Tom says go, Claude commits, Tom clicks)

- [ ] **[CLAUDE]** `git pull` (the Pi pushes hourly), then commit `CNAME` file:
      `fuel.thomasainsworth.co.uk` → `whichpump.co.uk`. One line, one commit.
- [ ] **[TOM]** GitHub repo → Settings → Pages: confirm custom domain shows
      `whichpump.co.uk`, wait for the certificate (minutes to ~an hour), then
      re-tick **Enforce HTTPS**.
- [ ] Sanity: `curl -sI https://whichpump.co.uk` → 200 with a valid cert.

## Phase 4 — analytics (5 min, then one commit)

- [ ] **[TOM]** Cloudflare → Web Analytics → **add site** `whichpump.co.uk` → copy the
      new beacon token (tokens are hostname-scoped; the old one would silently count
      nothing on the new domain).
- [ ] **[CLAUDE]** Swap the token in index.html line 44 (current token
      `3eed852c…` dies with the old hostname).

## Phase 5 — the scrub commit (Claude, one commit; needs one decision)

Every place the old name/URL lives in served files, found by grep tonight:

- [ ] index.html line 4: `https://fuel.thomasainsworth.co.uk` → new URL.
- [ ] index.html line 5 + LICENSE: the copyright line — **[TOM DECIDES]** real name
      or trading name (the "name off the site" scope call; git history is NOT
      rewritten either way — that would destroy the price archive, standing ruling).
- [ ] index.html og:title/title: already domain-free ✅; **add `og:url`** with the new
      domain (was deliberately absent pre-domain). og:image (board item 24) is now
      UNGATED — can ride this commit or follow.
- [ ] README.md lines 8 and 293: live-site URL and DNS description.
- [ ] plans/* references to the old URL — sweep at commit time.
- [ ] **[CLAUDE]** New `robots.txt` — added 2026-08-31 after Gemini couldn't "see"
      the site (no index presence, no sitemap). Also serves the name-off-site goal:
      Pages serves every tracked file with a 200, and the paths below name Tom, so
      keep them out of search results (robots can't stop fetching, only surfacing):

      ```
      User-agent: *
      Disallow: /plans/
      Disallow: /notes/
      Disallow: /pi/
      Disallow: /tests/
      Disallow: /scripts/
      Disallow: /workers/
      Disallow: /data/
      Disallow: /LICENSE
      Disallow: /README.md
      Disallow: /CHANGELOG.md
      Allow: /
      Sitemap: https://whichpump.co.uk/sitemap.xml
      ```

- [ ] **[CLAUDE]** New `sitemap.xml` — one URL today (`https://whichpump.co.uk/`),
      grows with the town pages. Submit it to Search Console/Bing in the SEO phase,
      not here.
- [ ] These two files are written AT phase 5, not before — their URLs reference the
      new domain and would dangle on the old one.
- [ ] NOT in this commit: BEACON/CSP (phase 7 moves them together).

## Phase 6 — the old domain becomes a redirect, for years (10 min)

Only after phase 3 verifies — the redirect must never race the cutover.

- [ ] **[TOM]** thomasainsworth.co.uk zone → the `fuel` record → **orange cloud** it.
- [ ] **[TOM]** Add the free Redirect Rule: `fuel.thomasainsworth.co.uk/*` → 301 →
      `https://whichpump.co.uk/$1` (preserve path + query — old shared links with
      `?postcode=` style params must survive).
- [ ] **[TOM]** whichpump.uk (once bought): redirect rule → `https://whichpump.co.uk/$1`.
- [ ] Keep both for years. £few/yr. Dropping the old name orphans every shared link
      and installed app, and lets a stranger inherit that traffic.

## Phase 7 — the Worker stops saying thomas-ainsworth1 (decision + one commit)

The beacon URL is the last name leak a visitor can see (network tab). Plan's
preference: **route the Worker under the new domain** — `counter.whichpump.co.uk`,
**orange-clouded** (separate record from the grey-cloud Pages one, no conflict) —
which also puts it behind the zone's free WAF rate-limiting.

- [ ] **[TOM]** Decide: route under domain (preferred) or rename the workers.dev
      subdomain (old URL dies instantly — same-commit rule below covers it).
- [ ] **[TOM]** Cloudflare → Worker → add the route/custom domain.
- [ ] **[CLAUDE]** One commit changing BOTH together: `BEACON` (index.html line 975)
      and the CSP `connect-src` (line 22). Stale cached shells will beacon at the old
      name and fail silently — harmless, by design.

## Phase 8 — verify (the usual: real browser, live site)

- [ ] `curl -sI https://fuel.thomasainsworth.co.uk/` → **301** → whichpump.co.uk.
- [ ] `curl -sI http://whichpump.co.uk` → redirects to **https**.
- [ ] `gh api repos/taja0001/fuel-calc/pages` → cname is whichpump.co.uk.
- [ ] GitHub verified-domains page lists the apex.
- [ ] One real search on the new domain → row lands in the counter SQL (nothing in
      the CSP is origin-specific, but verify, don't reason).
- [ ] New analytics token registers the visit.
- [ ] Add-to-home-screen works; airplane-mode reload works (SW starts clean on the
      new origin — first visit downloads fresh, that's expected).
- [ ] The 404 page renders at `https://whichpump.co.uk/nowhere` (404.html ships
      before or with the cutover).
- [ ] `curl -s https://whichpump.co.uk/robots.txt` serves the rules;
      `/sitemap.xml` fetches and lists the homepage.

## What users feel (one-time, small — say it in the changelog)

localStorage doesn't cross origins: mpg/tank/fuel re-entered once; the remembered
last search resets once. Home-screen installs keep working via the redirect but
re-add to pick up the new name. This is exactly why the migration goes BEFORE saved
postcodes ships.

## Unblocked the moment the cert is green

og:image (item 24) · forum-launch sequencing (Facebook locals, MSE approach) · SEO
town pages (whichpump.co.uk/petrol/nottingham) · support@ via Cloudflare Email
Routing (free forwarding — another Tom decision) · Search Console enrolment (with
the SEO work, per the plan).
