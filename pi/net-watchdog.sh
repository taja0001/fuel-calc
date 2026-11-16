#!/usr/bin/env bash
# Self-heal the Pi's connectivity. Lives on the Pi at ~/fuel/net-watchdog.sh and runs
# from ROOT's crontab every 5 minutes (see main README). The copy in the repo
# (pi/net-watchdog.sh) is kept byte-identical to the live one, so `diff` shows drift
# and an SD card death is a copy-paste, not a reconstruction.
#
# What it does while offline, by consecutive failed checks (one check per 5 min):
#   every failure  if the saved wifi network has gone, put the spare copy back
#   failure 2      restart NetworkManager
#   failure 4+     reboot — at most 3 times in a row; after that, only once the Pi
#                  has been up 6 hours, until a check succeeds again
#
# Why the last two rules exist (2026-11-10, see pi/README.md "The saved wifi network"):
# a reset mid-write emptied the saved wifi profile, the only copy of the wifi
# password. Restarting and rebooting cannot bring a password back, so the old version
# rebooted the Pi every 20 minutes for six days and healed nothing.

STATE="${WD_STATE:-/tmp/net-watchdog-fails}"             # failed checks in a row; /tmp, so a reboot clears it
REBOOTS="${WD_REBOOTS:-/var/lib/net-watchdog/reboots}"   # reboots in a row that didn't help; survives a reboot
SPARE_DIR="${WD_SPARE_DIR:-/root/nm-backup}"             # root-only spare of the wifi profile
NM_DIR="${WD_NM_DIR:-/etc/NetworkManager/system-connections}"
NMCLI="${WD_NMCLI:-nmcli}"
MAX_FAST_REBOOTS=3
SLOW_REBOOT_AFTER=21600                                  # seconds of uptime: 6 hours

# The WD_* variables exist for testing only — root's crontab sets none of them.
# WD_DRY_RUN=1 prints the restart/reboot/restore instead of doing it;
# WD_FORCE_OFFLINE=1 makes the check fail; WD_UPTIME=<seconds> stands in for uptime.

log(){ echo "$(date): $*"; }
act(){ if [ -n "${WD_DRY_RUN:-}" ]; then log "DRY RUN, would run: $*"; else "$@"; fi; }

# A missing, empty or garbled counter file reads as 0 rather than breaking the sums.
read_num(){
  local v; v=$(cat "$1" 2>/dev/null)
  case "$v" in ''|*[!0-9]*) echo 0 ;; *) echo "$v" ;; esac
}

# Online = raw internet reachable AND DNS resolves (their failure mode was both).
check(){
  [ -z "${WD_FORCE_OFFLINE:-}" ] \
    && ping -c1 -W5 1.1.1.1 >/dev/null 2>&1 \
    && getent hosts github.com >/dev/null 2>&1
}

# Written via a temp file and a rename, then flushed: a reset mid-write must leave
# the old count or the new one, never an empty file — the failure this script is
# here to survive.
write_reboots(){
  local dir tmp
  dir=$(dirname "$REBOOTS"); tmp="$REBOOTS.tmp.$$"
  mkdir -p "$dir" && echo "$1" > "$tmp" && mv -f "$tmp" "$REBOOTS" && sync
}

# Uses the wall clock for nothing: offline, a Pi's clock restarts from its last saved
# time on every boot, so only uptime can be trusted to measure the 6 hours.
uptime_secs(){ echo "${WD_UPTIME:-$(cut -d. -f1 /proc/uptime)}"; }

restore_wifi(){
  local list f restored=0
  # NetworkManager not answering is a different fault; the restart below covers it.
  list=$("$NMCLI" -t -f TYPE connection show 2>/dev/null) || return 0
  printf '%s\n' "$list" | grep -q '^802-11-wireless$' && return 0
  for f in "$SPARE_DIR"/*.nmconnection; do
    [ -s "$f" ] || continue
    act install -m 600 "$f" "$NM_DIR/" && restored=$((restored + 1))
  done
  if [ "$restored" -eq 0 ]; then
    [ "$fails" -eq 1 ] && log "no saved wifi network, and no spare in $SPARE_DIR to restore"
    return 0
  fi
  log "no saved wifi network — put back $restored from $SPARE_DIR"
  act "$NMCLI" connection reload
}

if check; then
  echo 0 > "$STATE"
  [ -e "$REBOOTS" ] && rm -f "$REBOOTS"
  exit 0
fi

fails=$(read_num "$STATE")
fails=$((fails + 1))
echo "$fails" > "$STATE"
log "offline (failure $fails)"

restore_wifi

if [ "$fails" -eq 2 ]; then
  log "restarting NetworkManager"
  act systemctl restart NetworkManager
elif [ "$fails" -ge 4 ]; then
  reboots=$(read_num "$REBOOTS")
  if [ "$reboots" -lt "$MAX_FAST_REBOOTS" ] || [ "$(uptime_secs)" -ge "$SLOW_REBOOT_AFTER" ]; then
    write_reboots $((reboots + 1))
    log "rebooting after $fails failures (reboot $((reboots + 1)) in a row without recovery)"
    act /sbin/reboot
  elif [ "$fails" -eq 4 ]; then
    log "$reboots reboots in a row haven't helped — holding off, next one after 6 hours up"
  fi
fi
