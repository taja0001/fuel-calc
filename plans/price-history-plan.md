# Plan: doing something with the price history

> **⚠ Partly superseded, 2026-07-30.** This plan assumes change times must be inferred
> by diffing hourly snapshots — which is why it treats sampling gaps as fatal, calls
> hour-of-day analysis impossible, and sets a September revisit date. Commit `0d844e0`
> then captured `pu` (`price_last_updated`), which gives the exact minute each price
> moved straight from the feed. Gaps no longer matter, hour-of-day is answerable now,
> and the timeline is earlier than stated below. Rewriting this is item 6 in
> [backlog.md](backlog.md). Everything about **what to publish** and **where to compute
> it** still holds.

Every hour the Pi commits `data/prices.json` only when a price actually changed. That
makes the git history an accidental archive of every price move on ~8,000 UK
forecourts. This is the plan for using it.

**Status: waiting for data.** Written 2026-07-29, when the archive held 43 snapshots
over 5.5 days (only ~2.2 of them unbroken). That was too short and covered a single
monotonically rising market, so nothing here is built yet. Revisit around **September
2026**. Nothing in this document needs doing before then.

---

## 1. What the first look found

From 43 snapshots, 1.1M price observations:

- The national average unleaded rose **158.29p → 159.39p** across 42 consecutive
  snapshots and **never fell once**.
- At station level, excluding gap-spanning transitions and bad records: **4,338 rises
  against 146 falls**. Rises arrived in median +1.0p steps, the rare falls in −2.0p.
- **62%** of forecourts changed price at least once in 5.5 days; median one change;
  busiest changed 37 times.
- Supermarkets sat **4–6p** below the oil brands, on samples large enough to trust
  (Tesco/Morrisons/Sainsbury's ~156.9p across 1,165 sites; Shell 162.9p across 906).

The rise/fall asymmetry is the interesting one — but two days of a rising market is a
measurement, not a law. It needs a falling market before it means anything.

## 2. What is not derivable yet, and why

**Hour-of-day.** A first pass showed a huge 09:00 spike. That was an artefact: any
change first *seen* at 09:54 could have happened anywhere in the preceding 11.9-hour
gap, so a gap's end absorbs everything before it. Needs the feed running unbroken.

**Day-of-week.** Needs weeks. Four weeks gives four samples per weekday, which is the
minimum worth plotting.

**Anything seasonal.** Needs months.

## 3. What to publish

Three artifacts. Sizes measured against the real 7,971-station file, gzipped as served:

| Artifact | Cost | Unlocks |
|---|---|---|
| National + per-brand daily index, **a full year** | **2 KB** | Trend chart on the site |
| Three derived scalars inline in `prices.json` | **+18 KB (+6%)** | Per-station badges |
| Full archive | already in git | Offline analysis |

### 3a. The index — do this one first

`data/index.json`, one row per day, appended once daily. A full year of national plus
twelve brands is **2 KB gzipped**. Effectively free, changes once a day so it barely
adds to commit churn, and it's enough for a trend chart on the site.

```json
{"days":[{"d":"2026-09-01","E10":158.3,"B7":166.1,"E5":171.0,
          "brands":{"BP":160.9,"Tesco":156.9}}]}
```

### 3b. The per-station scalars

Three numbers per station, inline in `prices.json` — no second request:

- `d1` — change versus 24 hours ago, in pence
- `w7` — lowest price seen here in the last 7 days
- `h` — days held at the current price

Measured cost: **275 KB → 293 KB gzipped, +6%.** A separate 7-day window file gzips to
~22 KB, which is about the same, so inline wins on having no extra request.

This is what powers the feature worth building:

> **↑ up 2p since Monday** · held at 156.9p for 3 days · *cheapest here this week: 154.9p*

Today the app answers "where is cheapest **now**". With these it can answer **"is now
a good time?"** — the natural extension of the true-cost idea, and nobody else does it.

## 4. Where the computation goes

**On the Pi, not in the browser, and not from git history at read time.** Extracting 43
commits took ~40 seconds of shelling out to `git show`. A year is 8,760 commits.

Keep a rolling state file at `~/fuel/history-state.json`, outside the repo:

- Holds the last 7 days of per-station daily closes plus the running index.
- Updated each run, before `prices.json` is written.
- **Not** in git, so it doesn't double the hourly commit churn.
- Rebuildable from the git archive if the Pi is ever reimaged — write
  `scripts/rebuild-history.mjs` for that, and treat it as the recovery path.

## 5. The station-identity problem

**Read this before writing the rollup.** On 2026-07-29 the 64-character `node_id` was
dropped from the published file to halve the download — it was 575 KB of the 2.3 MB and
the app never read it. Consequences:

- **Pi-side rollup is fine.** The fetcher still has `node_id` from the API and uses it
  for the stable sort, so keep the state file keyed on it.
- **Reconstructing history from published files alone is fragile after that date.**
  You'd have to key on `postcode + name`, and names drift in the feed.

If durable identity from the published file matters, publish a short stable id — the
first 8 hex characters of `node_id` costs **+13% over the wire** in total alongside the
scalars. Judgement call; the Pi-side route avoids needing it at all.

## 6. Retroactive cleaning

The fetcher only started rejecting malformed records on 2026-07-29, so **the archive
before that date is dirty**. Any analysis must apply the same filters:

- Prices outside 50–400p per litre. About 11 transitions in the current archive are
  pounds/pence artefacts — `173.9p → 1.739p` and similar — which would otherwise read
  as enormous price crashes.
- Coordinates outside the UK bounding box.
- Exclude the 2026-07-24 snapshot entirely: it holds 8 stations of sample data.

Known gaps and whether they were faults are recorded outside the repo. The 11.9-hour
gap on 28–29 July was a deliberate unplug, not an outage.

## 7. Analysis worth doing offline

Not shipped to the site — run locally against the archive:

1. **Rockets and feathers, properly.** Does the 30:1 asymmetry hold across a full
   cycle including a falling market? This is the finding with genuine public interest.
2. **Who moves first.** Cross-correlate brand price changes at lag. Do supermarkets
   lead and the oil brands follow, or the reverse? Needs weeks.
3. **Day-of-week and hour-of-day**, once the feed has run unbroken for a month.
4. **Regional spread.** Cheapest and dearest regions over time; is Northern Ireland
   persistently different?
5. **Backtest the app's own advice.** Given a fill every N days, how much would
   following the true-cost ranking actually have saved against filling up at the
   nearest forecourt? That's the number that justifies the whole project.

## 8. Build order, when the time comes

1. `data/index.json` and the daily append. Smallest, cheapest, unlocks a chart.
2. A trend chart on the site reading it.
3. The rolling state file on the Pi.
4. `d1` / `w7` / `h` into `prices.json`, and the badges in the UI.
5. `scripts/rebuild-history.mjs` as the recovery path.
6. Extend `scripts/validate-prices.mjs` to sanity-check the new fields.

## 9. Risks

- **Git growth.** Currently 3.3 MB of `.git` for 85 commits — delta compression is
  handling the 1.2 MB file well. Keep an eye on it, and keep the state file out of git.
- **A "prices are rising" banner would fire almost permanently** on the evidence so
  far. It needs a threshold, or it becomes wallpaper and gets ignored.
- **Survivorship.** Stations enter and leave the feed. A station absent for a day is
  not a price change; don't let gaps in a station's series read as movement.
