# The Raspberry Pi runner

The hourly fetch runs on a Pi at home because the Fuel Finder firewall only accepts
residential IPs (see the main README). The runner script itself lives on the Pi at
`~/fuel/update-fuel-prices.sh`, outside this repo — it's host-specific and sits next
to `~/fuel/secrets.env`, which holds the API credentials. This note records the
contract the runner must honour, so the repo stays the source of truth for it.

## What the runner does, in order

1. Wait for the network (wakes idle wifi).
2. `git pull` this repo.
3. Run `node scripts/build-prices.mjs` (sourcing `~/fuel/secrets.env` first).
4. If anything under `data/` changed: commit and push (`git add data/`, and the
   changed-check is `git status --porcelain data/` — since 2026-08-21 the fetcher
   also maintains `data/index.json`, the daily price index; checking only
   prices.json would leave it permanently uncommitted). A failed push must fail
   the run.
5. **Only after all of that succeeded**: ping the heartbeat.

## The heartbeat ping (step 5)

```sh
# Last step of the runner, after the push (or after a clean no-change run).
# The order is the whole point: the ping is a dead-man's switch for the SITE being
# fed, not for the fetch finishing — pinging before the push kept healthchecks.io
# green while an expired PAT left the site serving stale prices for days.
if [ -n "$FF_PING_URL" ]; then
  curl -fsS --max-time 10 "$FF_PING_URL" > /dev/null \
    || echo "heartbeat ping failed (ignored — the prices are already pushed)"
fi
```

`FF_PING_URL` comes from `~/fuel/secrets.env`, same as the credentials:

```
export FF_PING_URL=https://hc-ping.com/your-uuid-here
```

The ping fires on every successful run, including no-change runs where nothing was
pushed — quiet hours are still proof of life. A failed ping never fails the run: by
then the prices are already safely pushed, and the worst case is one spurious alert.

Until 2026-08-19 the fetcher (`scripts/build-prices.mjs`) sent this ping itself,
before the runner had committed or pushed anything. It no longer pings at all — if
the alert fires after updating the repo on the Pi, the runner is missing step 5.

## How the Pi authenticates to GitHub (recorded 2026-08-24)

This was undocumented until a security review went looking for it, and the wrong
guess (that the PAT lives in `secrets.env`) would have broken the hourly push. The
runner deliberately has no token in it — `git push` gets the credential from git:

```
origin  https://github.com/taja0001/fuel-calc.git   # HTTPS, no token in the URL
credential.helper = store                            # in the Pi's GLOBAL git config
~/.git-credentials                                   # mode 0600, one line, cleartext
```

`git credential-store` keeps the PAT as `https://USERNAME:TOKEN@github.com`. Keeping
it out of the remote URL is deliberate: `git remote -v`, logs and screenshots stay
clean. The trade-off is that the file is **plaintext**, so its 0600 mode and the SD
card are the only things protecting it — which is why the token should be a
fine-grained `Contents: Read and write` PAT scoped to this one repo and nothing more.
A broad-scope PAT read off that card could delete branch protection and rewrite the
price archive; a Contents-only one can only push prices.

To inspect the file without exposing the token:
`sed 's/:[^:@]*@/:***@/' ~/.git-credentials`. To rotate it, replace the token in that
line, then confirm a real run pushes **before** revoking the old token — a bad
credential fails silently every hour except for the missing healthchecks.io ping.

## The history state file (nothing to do — recorded so it isn't a mystery)

Since 2026-08-22 the fetcher also maintains `~/fuel/history-state.json`: the last
8 days of daily closing prices per station, feeding the app's "up 2p since Tuesday"
badges. It deliberately lives outside the repo — it's derivable from the git
archive, so committing it would double the hourly churn to record nothing new.

The runner doesn't change: the fetcher finds `~/fuel` on its own (a different spot
can be forced with `FF_STATE` in `secrets.env`). If the file is missing or corrupt —
first deploy, reimaged SD card — the fetcher rebuilds it from git history
automatically and says so in the run log, so deleting it is always safe. To rebuild
by hand: `node scripts/history.mjs --rebuild` from the repo directory.

## The rest of the Pi setup

Crontab entries, the network watchdog, and the wifi power-save setting are documented
in the main README under "The Raspberry Pi".
