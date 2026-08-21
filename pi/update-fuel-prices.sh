#!/usr/bin/env bash
# Reference copy of ~/fuel/update-fuel-prices.sh on the Pi — the live one is there,
# scheduled from the user crontab (see main README). Kept in the repo so an SD card
# death is a copy-paste, not a reconstruction. secrets.env stays on the Pi only.
set -uo pipefail
export PATH="/usr/bin:/usr/local/bin:$PATH"
source "$HOME/fuel/secrets.env"
cd "$HOME/fuel/fuel-calc" || exit 1

log(){ echo "$(date): $*"; }

online(){ curl -sfI --max-time 10 https://github.com >/dev/null 2>&1; }
tries=0
while ! online; do
  tries=$((tries+1))
  if [ "$tries" -ge 10 ]; then
    log "no network after $tries tries, skipping this run."
    exit 0
  fi
  sleep 15
done

run_once(){
  git pull --quiet || return 1
  node scripts/build-prices.mjs || return 1
  if [ -n "$(git status --porcelain data/prices.json)" ]; then
    git add data/prices.json
    git commit -m "chore: update fuel prices" --quiet
    git push --quiet || return 1
    log "prices updated and pushed."
  else
    log "no price changes."
  fi
  # The dead-man's switch pings only after a fully successful run — after the push
  # when there was one. ${FF_PING_URL:-} not $FF_PING_URL: set -u would otherwise
  # turn a missing variable into "no prices" instead of "no ping".
  if [ -n "${FF_PING_URL:-}" ]; then
    curl -fsS --max-time 10 "$FF_PING_URL" > /dev/null \
      || log "heartbeat ping failed (ignored)"
  fi
  return 0
}

for attempt in 1 2 3; do
  run_once && exit 0
  log "attempt $attempt failed, retrying in 30s."
  sleep 30
done
log "all attempts failed this run."
exit 1
