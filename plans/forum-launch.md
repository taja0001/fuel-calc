# Plan: first real users — local forums and money sites

> **Update 2026-09-01 — the domain gate is CLEARED.** Site live at
> `whichpump.co.uk`; the old URL is a permanent 301 (path+query preserved), so
> "links point at the old name" is handled, not a blocker. The Worker no longer
> bears a name (`counter.whichpump.co.uk`, behind the zone's WAF rate-limiting —
> §1b option 1, executed). `robots.txt` now keeps /plans/ and friends out of
> search, so the plans-expose concern is reduced to fetch-if-you-know-the-URL.
> support@ is now an open decision, not a gate. **Remaining real gates: repo
> visibility (§1c), the fine-grained PAT (§1d — still the top security item),
> and per-venue homework (§3).**

Written **2026-08-25**. Status: **planned, deliberately not started** — the order below
is the point of this document. The goal: Fill-Up's first strangers, via local Facebook
groups and the MoneySavingExpert audience, with the doors closed *before* the crowd
arrives rather than after.

One irony to hold in mind: **this plan currently lives in a public repo.** Until the
repo-visibility decision below is made, every strategy written here — including this
file — is readable by anyone. That is itself the first argument for the sequencing.

---

## 1. Why not today: the sequencing that can't be undone later

Forum posts are permanent. An MSE thread or a Facebook group post ranks on Google for
years, and every link in it points wherever it pointed on the day it was written. Three
things must therefore land **before** the first post, because they can't be retrofitted:

### 1a. The domain ([domain-migration.md](domain-migration.md)) — hard prerequisite

Two separate reasons, either sufficient alone:

- **Links are forever.** Advertise now and the permanent inbound links, bookmarks and
  shares all point at `fuel.thomasainsworth.co.uk` — the domain the migration plan
  exists to leave. Post-migration redirects lose some of every audience.
- **The name.** Posting into local Facebook groups with your own name in the URL
  deanonymises the pseudonymous `taja0001` identity to your own neighbours in one
  click — the exact thing the migration plan and the noreply-email work exist to
  prevent. The audience being *local* makes this worse, not better.

### 1b. The Worker URL leaks the name even after migration — new finding, 2026-08-25

`search-counter.thomas-ainsworth1.workers.dev` is visible to anyone who views source
(it appears in the CSP header and the beacon constant). Migrating the domain does not
fix this. Two options, in preference order:

1. **Move the Worker behind the new domain as a route** (e.g. `c.newdomain/...`) once
   it exists — which *also* puts it inside a Cloudflare zone, unlocking the free WAF
   rate-limiting rule (see the rate-limiting discussion, 2026-08-25: on `workers.dev`
   those rules can't apply, behind your own zone they're free configuration).
2. Or change the account's `workers.dev` subdomain to something pseudonymous.

Remember `BEACON` and the CSP `connect-src` must change together — comments at both
sites say so.

### 1c. The repo — decide visibility before inviting eyeballs

"No one can copy the app" needs honest scoping first:

- **The client code cannot be closed.** Every visitor's browser receives all of
  `index.html`; that is what a web app is. The LICENSE already reserves all rights,
  which is the available legal position. **Do not obfuscate** — it adds nothing real
  (the code still arrives in the browser), complicates the CSP story, and the true-cost
  *idea* isn't protectable anyway.
- **What can be closed is the playbook and the archive.** The repo currently exposes
  `plans/` (monetisation strategy, the domain shortlist — which names the domain to
  buy before it's bought), and the full price-archive history, the actual banked
  asset. Finding the repo from the site is trivial: a GitHub code search for the
  domain string lands on it. More visitors means more such searches.
- The three costed paths (analysed 2026-08-25, in conversation):
  **A** — GitHub Pro, ~£46/yr: repo private, Pages and branch protection keep working
  unchanged. **B** — free: hosting to Cloudflare Pages, repo private, but branch
  protection lapses (Pro-only on private repos). **C** — free, most work, best fit to
  the threat: public repo carries the site + only the latest snapshot (the live
  `prices.json` *must* stay public — the app fetches it, and it's OGL data anyone can
  get from the feed anyway); a second, private repo accumulates the history. The moat
  was never the current prices; it's the history.
- **What a copycat can't clone regardless:** the archive history they didn't collect,
  the data pipeline (the Fuel Finder firewall only accepts residential IPs — a
  copycat needs their own Pi-class setup, not a cloud box), hourly freshness, and
  first-mover trust in the very threads this plan is about.

### 1d. While the doors are being closed

Security item ② ([security-review-2026-08-23.md](security-review-2026-08-23.md)) — the
fine-grained PAT — is the one remaining credential job and pairs with any repo change.

---

## 2. Readiness — what strangers will hit that regulars don't

- **The OSRM demo server** ([backlog.md](backlog.md) #0) has no SLA. A busy MSE thread
  is exactly the traffic shape that could degrade it. The app degrades gracefully
  (straight-line ×1.3 fallback), so this is a quality risk, not an outage risk —
  but a first impression made on fallback estimates is a worse first impression.
  Not a blocker; know it's there; it is the gate on *monetisation* regardless.
- **First-impression polish:** the remaining quick-win UX batch (chart `touch-action`
  scroll dead-zone, GPS aria-labels, E/F gauge ends, `:focus-visible`, ~~"1 miles"~~ ✅ 1 Sep) —
  small, and forum-driven phone users are precisely who hits them.
- **A feedback channel — DECIDED 2026-08-25:** `support@<the chosen domain>`, created
  once the domain exists. Mechanics: **Cloudflare Email Routing** — free, the DNS zone
  will already be on Cloudflare per the migration plan, and it forwards to the real
  inbox without hosting a mailbox or exposing it. Two care-points: (1) set it up
  *after* the domain purchase, and put the address in the site footer only alongside
  the other launch changes; (2) **replying from the personal inbox exposes the real
  address** — Email Routing is receive-only, so either configure a send-as alias
  (e.g. via the mail provider's SMTP alias support) before answering anyone, or treat
  it as inbound-only and answer in the forum thread instead. The forum threads
  themselves remain the first-line channel at launch.
- **The privacy question WILL be asked** — "what's the catch, what does it track?" is
  a reflex on MSE. The honest answer is genuinely excellent (no accounts, no ads, no
  personal data; search counter stores four words with the area cut to postcode
  district — enforced structurally, tested). **Note: a footer privacy disclosure was
  considered and ruled NO by Thomas, 2026-08-24. That ruling stands unless he
  revisits it** — but advertising changes the audience from "people Thomas knows" to
  "strangers primed for scepticism", so the options are: (a) revisit the ruling and
  add a small /privacy note, or (b) keep the site as-is and hold a prepared,
  copy-paste forum reply for when it's asked. Either works; pick one *before* the
  first thread, not during it.
- **Prepared copy.** One honest paragraph, written once, reused: what it does (true
  cost, not just pump price), what it doesn't do (no ads, no accounts, no tracking
  beyond an anonymous search count), that you built it, and a screenshot. Disclosure
  that you're the builder is both several venues' rules and the credibility play.

---

## 3. Venue rules — verified 2026-08-25, re-verify before posting

- **MoneySavingExpert forum: blanket self-promotion ban.** Confirmed against the forum
  FAQ and moderator posts: promoting your own website is against the rules, in posts,
  signatures and avatars, with no free-tool exception. **Do not post the app there
  yourself** — it gets removed and the account marked, which poisons the well for the
  organic route. The legitimate MSE routes:
  1. **Email the forum team** (forumteam@moneysavingexpert.com) and ask — free,
     ad-free, OGL-data tools are the best possible case for a yes.
  2. **Pitch MSE editorially** — the site covers fuel-price tools in its guides and
     weekly email; being *featured* is worth a hundred forum posts and is their model
     for exactly this kind of tool.
  3. **Organic sharing** — other users posting it is within the rules. That happens
     only if the app is easy to name and link, which the domain migration feeds.
- **Facebook local groups: rules vary per group.** Many ban promo outright, many have
  "promo Friday" threads, most tolerate a genuine local recommendation phrased as one.
  The route: read each group's pinned rules, **message the admins first** asking to
  share a free local tool, post only where welcomed. One good post in a group that
  welcomes it beats five deleted ones.
- **Also worth a look, same etiquette:** local subreddits (heavy self-promo norms —
  contribute before posting), Nextdoor (recommendations are its native genre).

## 4. Measuring whether it worked — already built, luckily

The search counter went live 2026-08-24, just in time to be the campaign instrument:

- **Searches-per-visitor** (counter vs Cloudflare Insights visits) says whether forum
  traffic actually *uses* the app or bounces.
- **The area word** (postcode district) says *which towns* respond — post in a
  Nottingham group, watch for NG districts. This is the measurement the four-word
  design accidentally optimised for.
- Keep a small posting log here (date, venue, thread link) so spikes can be attributed.
  The counter's Phase 2 weekly digest ([search-counter.md](search-counter.md)) becomes
  the campaign report.

## 5. Explicitly not doing

- **Obfuscation or "source protection"** — see 1c; theatre, with real costs.
- **Paid advertising** — nothing here supports a cost per click yet; that's a
  post-monetisation question.
- **SEO town pages** — the bigger lever, own plan ([monetisation.md](monetisation.md)),
  still sequenced after the domain and explicitly after this.

## The order, in one list

1. Buy the domain, migrate (existing plan) — includes moving the Worker behind it.
2. Decide repo visibility (A/£46yr, B/free-less-protection, C/free-split) and do it.
3. Security ② (PAT) alongside.
4. Quick-win UX batch; pick the feedback channel; settle the privacy answer.
5. Email MSE forum team + editorial pitch; admin-cleared Facebook posts.
6. Watch the counter; log posts; iterate on what the districts say.
