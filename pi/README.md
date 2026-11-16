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

## The saved wifi network (recorded 2026-11-16, after six days of stale prices)

The Pi joins wifi from one NetworkManager profile, and that file is the only place
the wifi password lives:

```
/etc/NetworkManager/system-connections/<ssid>.nmconnection   # root, 0600, cleartext
/etc/netplan/90-NM-<uuid>.yaml                               # where the original was kept
/root/nm-backup/<ssid>.nmconnection                          # root-only spare copy
```

**What went wrong on 2026-11-10.** The Pi lost its connection at 08:35. At 08:40 the
watchdog restarted NetworkManager, and within moments the Pi reset — an unplanned
reset, not the watchdog's own reboot (it logs those). Both saved profile files in
`/etc/netplan/` were left at 0 bytes, stamped 08:40. With no profile there was nothing to
reconnect with, so every remedy the watchdog had then (restart networking, reboot) was
useless: it rebooted the Pi every 20 minutes for six days while the runner logged
"no network after 10 tries" every hour. The Pi never lost power and the SD card was
fine. Nothing in the repo, the token or the API was at fault.

**What the watchdog does about it now (since 2026-11-16).** Two rules were added to
[`net-watchdog.sh`](net-watchdog.sh), both aimed at exactly this outage:

- Offline with no saved wifi network → it puts the spare from `/root/nm-backup/` back
  and reloads NetworkManager. Proven on the Pi itself: with the profile deliberately
  removed, one watchdog run restored it and wifi was back in about four seconds,
  power-saving setting intact. An empty spare is never restored.
- Reboots are rationed: at most 3 in a row without a successful check between them,
  then one only once the Pi has been up 6 hours. Measured in uptime, not clock time
  (see the last note in this section). The count lives in `/var/lib/net-watchdog/reboots`
  and is cleared by the first successful check.

So the spare is now load-bearing: **if the wifi password ever changes, refresh the
spare** (last two commands below), or the watchdog will faithfully restore the old one.
The previous script is kept on the Pi as `~/fuel/net-watchdog.sh.bak-2026-11-16`.

To test a change to the watchdog without rebooting anything, the script reads a few
`WD_*` variables that root's crontab never sets: `WD_DRY_RUN=1` prints the
restart/reboot/restore instead of doing it, `WD_FORCE_OFFLINE=1` fails the check, and
`WD_STATE` / `WD_REBOOTS` / `WD_SPARE_DIR` / `WD_NM_DIR` / `WD_NMCLI` / `WD_UPTIME`
point it at stand-ins.

**How to recognise it, if it happens anyway** (no spare, or a stale one). The Pi is
powered but absent from the network. Plug it into
the router with a network cable — wired needs no saved profile, so it comes up by
itself at a *different* address from its wifi one. Then:

```sh
nmcli connection show            # no wifi row = the profile is gone
nmcli device wifi list           # ...while the radio still sees the network
```

**How to fix it.**

```sh
# put the spare back, if it's there:
sudo install -m 600 /root/nm-backup/*.nmconnection /etc/NetworkManager/system-connections/
sudo nmcli connection reload

# or re-enter the password (--ask prompts for it, so it stays out of shell history):
sudo nmcli --ask device wifi connect "<ssid>"
sudo nmcli connection modify "<ssid>" wifi.powersave 2     # power-saving off, as before

# afterwards, refresh the spare:
sudo install -d -m 700 /root/nm-backup
sudo install -m 600 /etc/NetworkManager/system-connections/*.nmconnection /root/nm-backup/
```

Then run the runner once by hand (the crontab line, verbatim) rather than waiting for
the top of the hour, and check `tail ~/fuel/fuel.log` ends in "prices updated and pushed".

**Leaving the cable in is the better setup** if the Pi can sit by the router: wired is
preferred automatically and wifi becomes the fallback, so losing either one no longer
takes the feed down.

**Check the power while you're there.** `vcgencmd get_throttled` should print
`throttled=0x0`. Any other value means the supply has sagged below 4.63V (bit 0 = right
now, bit 16 = at some point since boot); `sudo dmesg | grep -i voltage` shows how often.
On the day of the recovery it read `0x50005` on a 65W charger — the thin micro-USB
cable, not the charger. A reset mid-write is what emptied the profile files, and low
voltage is the likeliest cause of that reset (not proven: the logs from that boot are
gone). The Pi 3 wants the official 5.1V 2.5A supply with its fixed cable.

**Don't trust log timestamps from an offline stretch.** The Pi has no clock battery:
offline, every reboot restarts the clock from the last saved time, so it falls a little
further behind each time. By the end of the six days it was hours slow.

## The rest of the Pi setup

Crontab entries, the network watchdog, and the wifi power-save setting are documented
in the main README under "The Raspberry Pi". A reference copy of the watchdog is in
[`net-watchdog.sh`](net-watchdog.sh), next to the runner's.
