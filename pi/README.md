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
4. If `data/prices.json` changed: commit and push. A failed push must fail the run.
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

## The rest of the Pi setup

Crontab entries, the network watchdog, and the wifi power-save setting are documented
in the main README under "The Raspberry Pi".
