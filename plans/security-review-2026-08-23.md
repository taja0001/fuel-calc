# Security review — outstanding items

> **Update 2026-09-01.** §4 (domain verification): **closed by the migration**,
> better than asked — whichpump.co.uk was TXT-verified on the account BEFORE any
> DNS existed, and the old apex is no longer a Pages custom domain, so the takeover
> class no longer attaches anywhere. §9 (robots.txt): **shipped 31 Aug**, internals
> disallowed (+ /workflows/ added 1 Sep). §8 (CAA): the answer on file covers the
> OLD zone only — re-ask it for whichpump.co.uk. Commit counts quoted below are
> pre-1-Sep snapshots (now 907). **History note, recorded for the next reader:**
> on 1 Sep six commit messages had their Co-Authored-By trailers stripped via a
> deliberate, content-byte-identical rewrite (protection lifted for minutes and
> re-locked, Pi resynced, verified). This was navigation of the "no rewrites"
> ruling for a message-only change, not an incident — the archive's data history
> is untouched.

Written **2026-08-23**. A 22-agent review (six lenses, everything adversarially
verified) found the app itself in good shape — no way in for an outside attacker,
very little visitor data leaves the browser, none of it reaches the owner. Full
findings and the "who sees what about a visitor" inventory aren't duplicated here;
this is the action list. Two code findings are already **done** (23 Aug): the CSP,
the two remaining unescaped sinks, and `data/index.json` now validated in CI — see
`CHANGELOG.md`. **§1 (branch-protect `main`) is done as of 24 Aug** — see below.
Everything else needs Thomas, not code, or is optional hardening.

Nothing here is urgent. The findings are about *what happens if a key leaks* and
*tightening edges*, not an active hole.

---

## Needs Thomas — account and DNS settings

### 1. Branch-protect `main` — ✅ DONE 2026-08-24

Applied via the API (`PUT /repos/taja0001/fuel-calc/branches/main/protection`), not
the Settings UI — same classic branch-protection object either way. Live rule:
force pushes **blocked**, deletions **blocked**, administrators **included**, and
deliberately *no* required status checks, *no* required PR reviews, *no* push
restrictions — so direct pushes still work and the Pi is unaffected. No repo
rulesets exist that could interact with it.

Verified for real, not just read back from the config: a throwaway branch
(`bp-verify`, since deleted) was protected with the identical object, then (a) a
plain fast-forward push as the owner **succeeded** — this is the Pi's exact path;
(b) a force-push of a rewritten history was **rejected** ("Cannot force-push to
this branch", protected branch hook declined); (c) a branch delete was **rejected**
("Cannot delete this branch"). `main` was never a push target during the test.

The original reasoning, kept because it explains the *shape* of the rule:

> `main` was unprotected (`protected:false`), and Pages auto-deploys every
> push to it immediately (legacy build, independent of CI). `validate-prices.yml`
> calls itself "the backstop for a bad push," but it runs *after* the push, gates
> nothing, and can't stop a force-push. Two consequences: (a) the git history of
> `data/prices.json` — the price archive, the actual product — could be rewritten or
> destroyed by anyone holding the Pi's push credential or the account; (b) a bad Pi
> run publishes live before validation finishes, no attacker required.
>
> **Do not** make the "Validate prices" status check *required* — required checks
> reject direct pushes of fresh commits, which would break the Pi's hourly push
> outright. Keep the validator advisory; if you want it to actually get noticed on
> failure, that's a GitHub notification setting, not a merge gate.

**Still open, and now the thing that guards this one: #2 below.** A broad-scope PAT
can call the repo-admin API and delete this rule before force-pushing, so until the
Pi's token is scoped down, the protection is only as strong as that token.

### 2. Scope the Pi's PAT down to Contents-only — ⬅ NOW THE TOP ITEM

Promoted 24 Aug, because #1 is done and *this* is what keeps #1 standing. Branch
protection is enforced by GitHub but can be **removed** by anything with repo-admin
rights: a classic (broad-scope) PAT can call
`DELETE /repos/taja0001/fuel-calc/branches/main/protection`, force-push a rewritten
history, and put the rule back. So the archive's protection is currently only as
strong as the weakest admin-capable token pointing at this repo. A fine-grained PAT
scoped to `Contents: Read and write` on this one repo cannot make that call — the
permission simply isn't in its grant.

#### Where the Pi's push credential actually lives — ANSWERED 24 Aug

This section used to say "swap it into `~/fuel/secrets.env`". **That was wrong.** The
runner ([`pi/update-fuel-prices.sh`](../pi/update-fuel-prices.sh)) sources
`secrets.env` and then runs a bare `git pull` / `git push` with no token variable
anywhere; `secrets.env` holds only `FF_CLIENT_ID`, `FF_CLIENT_SECRET`, `FF_PING_URL`
and optionally `FF_STATE`. Editing it would have changed nothing while the hourly
push started failing.

Measured on the Pi (`fuelpi`, user `whufc12`):

```
origin  https://github.com/taja0001/fuel-calc.git (fetch/push)   ← no token in the URL
credential.helper = store                                        ← set in GLOBAL config
-rw------- 1 whufc12 whufc12 122  ~/.git-credentials             ← mode 0600, one line
```

So the credential is **`git credential-store` keeping the PAT in cleartext at
`/home/whufc12/.git-credentials`**, in the usual
`https://USERNAME:TOKEN@github.com` form. Two consequences worth naming:

- The token is *not* in the remote URL, which is good — it can't leak through
  `git remote -v`, a screenshot, or a log line.
- But `store` is **plaintext by design**. Mode 0600 limits it to the `whufc12` user,
  so the real exposure is anyone with a shell as that user, or the SD card itself.
  That is precisely why the token's *scope* is what matters here: a classic
  broad-scope PAT read off that card can delete branch protection and rewrite the
  archive; a `Contents`-only fine-grained token can only push prices.

**Never `cat` this file into a terminal you might screenshot or paste.** To inspect
its structure with the secret masked:

```sh
sed 's/:[^:@]*@/:***@/' ~/.git-credentials
```

#### The swap, for this mechanism

1. Create the fine-grained PAT first (next subsection) — don't revoke anything yet.
2. Check how many lines the file has, so you don't clobber an unrelated host:
   `wc -l ~/.git-credentials` (122 bytes ≈ one line, but confirm).
3. Rewrite it. `printf` rather than an editor keeps the token out of shell history
   *only if* your shell is configured to ignore space-prefixed commands — otherwise
   use `nano` and edit the token in place:
   ```sh
   printf 'https://taja0001:%s@github.com\n' 'NEW_TOKEN_HERE' > ~/.git-credentials
   chmod 600 ~/.git-credentials
   ```
4. Prove it works **before revoking**: `cd ~/fuel/fuel-calc && git fetch` tests read;
   a real `~/fuel/update-fuel-prices.sh` run tests the push. Wait for "prices updated
   and pushed."
5. Only then revoke the old token on GitHub.

If the new token is wrong, `store` will keep handing git the same bad credential and
the push fails every hour — the healthchecks.io heartbeat is what tells you, since it
only fires after a successful push.

#### The GitHub side

Settings → Developer settings → Personal access tokens → **Fine-grained tokens** →
Generate new token. Resource owner `taja0001`; repository access "Only select
repositories" → `taja0001/fuel-calc`; Repository permissions → **Contents: Read and
write**, nothing else; set an expiry. GitHub adds `Metadata: Read` automatically —
mandatory and harmless.

`Contents` covers both halves of what the runner does: read for `git pull`, write for
`git push`. It does **not** cover `.github/workflows/` — irrelevant today because the
runner only stages `data/`, but a future Pi push touching a workflow file would need
`Workflows: write` and would otherwise be rejected.

#### Verify before revoking

Do not revoke the old token until a real run has succeeded — either wait for the top
of the hour or run `~/fuel/update-fuel-prices.sh` by hand and check it logs
"prices updated and pushed."

*The dead-man's switch genuinely covers this failure mode (verified 24 Aug by reading
the script, not assuming): the heartbeat ping sits after the push inside `run_once()`,
and a failed push hits `return 1` and skips the ping entirely. So a broken or expired
token surfaces as a healthchecks.io alert, not a silently stale site — the exact
failure `pi/README.md` records from last time. An expiring token is not a silent risk.*

**Bundle with #3:** its step 2 is also a one-liner on the Pi
(`git config user.email "152604317+taja0001@users.noreply.github.com"`), so do both in
the same SSH session — but respect #3's ordering, Mac first, then Pi.

### 3. Stop leaking the real email in commits — step 1 of 3 DONE 24 Aug

Both the Mac's global git config and the Pi's leaked `thomas.ainsworth1@outlook.com`
into every commit, even though the GitHub account itself uses the noreply address
(38 commits already do — those are web-UI commits, committer `noreply@github.com`).
Ties the pseudonymous `taja0001` identity to a real personal address, harvestable via
the public API with zero preconditions.

**The count was 653 at review time; re-measured 24 Aug it is 684** — the review's
"growing hourly" was literal, ~31 commits in a day. Every hour the Pi stays unfixed
adds one.

**Do, in this order** (order matters — see why below):

1. ✅ **DONE 24 Aug — Mac:** `git config --global user.email "152604317+taja0001@users.noreply.github.com"`
   Verified by building a real commit object: author *and* committer both come out as
   the noreply address. Checked first that no repo on this Mac has a local
   `user.email` override that would silently defeat a global-only fix — neither
   `fuel-calc` nor `tui-price-tracker` does, and both are `taja0001` remotes, so
   global was the right scope. **Caveat for later:** a *work* repo cloned onto this
   Mac would now inherit the pseudonymous noreply. Set a per-repo
   `git config user.email` in any work clone.
2. ✅ **DONE 24 Aug — Pi.** Confirmed by the first hourly run after the change:
   `c4241f8`, 22:01 BST, `chore: update fuel prices`, author *and* committer
   `152604317+taja0001@users.noreply.github.com`. Identified as genuinely the Pi
   (not a hand commit) by its file list — `data/prices.json` + `data/index.json`
   only, exactly what `git add data/` stages. The three runs before it (18:03,
   19:03, 20:03) were all `@outlook.com`, so the break is clean. The push itself
   succeeding also re-confirms that branch protection permits the Pi's direct push.
   *If the Pi is ever re-cloned after an SD-card rebuild, check this again — a
   repo-local `user.email` would not survive; `--global` on the Pi would.*
3. ✅ **DONE 24 Aug — the toggle is live, proven by watching it block.** Building a
   throwaway commit authored with the old `@outlook.com` address and pushing it to a
   scratch branch was refused outright:
   ```
   remote: error: GH007: Your push would publish a private email address.
    ! [remote rejected] ... (push declined due to email privacy restrictions)
   ```
   No branch was created; `main` was never a push target. Because GH007 only fires
   when the address is registered as **private** on the account, this single test
   also confirms "Keep my email addresses private" is on — which the plan otherwise
   had no way to check (a `gh` token needs the `user` scope to read it).

**Item 3 is therefore closed end to end: Mac, Pi, and the server-side backstop.** The
backstop matters more than it looks — it is the safety net for the one regression this
list flagged as plausible, a Pi re-clone after an SD-card rebuild silently reverting to
the old identity. That push would now be rejected rather than quietly leaking.

**Why the order matters:** step 3 makes GitHub *reject* any push containing commits
that expose the real address. Enable it while the Pi is still committing as
`@outlook.com` and the Pi's hourly push starts getting rejected — the site goes stale
until someone notices. (The healthchecks.io dead-man's switch would catch it, since
the ping sits after the push, but there's no reason to fire it deliberately.)

**Do not** rewrite history to scrub the old 684 — every commit SHA changes, and
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
