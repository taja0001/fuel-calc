# Plan: car presets — for people who don't know their mpg

Written **2026-08-24**, researched against the real code, real UK owner-reported
economy data, and the design space (three-agent pass; sources named per figure below).
**Status: planned, not built.** "What's your mpg?" is the app's biggest ask of a
stranger — most people don't know, and the unsure ones fear that guessing wrong breaks
the answer. One tap should fix both.

## What it is

A row of tappable chips at the top of the "Your car" card, above the mpg/tank inputs:

> *Not sure about the numbers? Tap the closest match — you can tweak them after.*
>
> **Small car · Family hatchback · SUV · 4x4 / big SUV · Hybrid · Van**

Tapping one fills the mpg and tank fields with honest typical figures and nothing
else. The inputs are the receipt — no numbers printed on the chips, no hidden state.

## The figures (real-world, not brochure)

All economy figures are owner-reported real-world averages (Honest John Real MPG per
engine variant, corroborated by Fuelly logs — mind Fuelly shows US mpg, ×1.20), never
WLTP, which flatters by 10–25%. Hybrids are the exception that meets its official
figure. Do **not** apply any further discount; the gap is already baked in.

| Chip | Like a… | Petrol mpg | Diesel mpg | Tank (L) |
|---|---|---|---|---|
| Small car | Fiesta, Corsa, Polo, Fiat 500 | 46 | 58 | 40 |
| Family hatchback | Golf, Focus, Astra | 46 | 54 | 50 |
| SUV | Qashqai, Kuga, Tiguan | 39 | 48 | 55 |
| 4x4 / big SUV | X5, Discovery, XC90 | 26 | 32 | 85 |
| Hybrid | Yaris/Corolla hybrid, Prius | 60 | — | 40 |
| Van | Transit Custom, Transporter | — | 36 | 70 |

Basis per row lives in the research pass: e.g. Fiesta 1.0T owners average 44.4
(84% of WLTP), Golf 2.0 TDI owners 53.6 (99%), Qashqai DIG-T 38.8, X5 30d ~32-34,
Corolla hybrid 57.5–61.6, Transit Custom mid-30s on mixed work. Small car merges
city cars and superminis (3 mpg apart — nobody misled). Figures reflect what's
actually on UK roads (the Fiesta still tops the parc), which is the right target.

**Deliberately excluded: Motorbike.** Real mpg spans 30–130 by engine size so one
figure is barely honest, a ~14 L tank makes forecourt differences pennies (against
the app's own premise), and it forces a petrol-only special case. Don't re-add
without new reasoning. Also rejected: a make/model database (megabytes against a
watched 376 KB payload for a job six chips do) and printing mpg on the chip faces
(duplicates live state; doubles chip width; the filled inputs are the receipt).

## Design decisions (made — don't relitigate without new information)

1. **Chips are one-shot fillers; the highlight is derived, never stored.** A chip
   shows pressed if and only if the current mpg+tank numerically equal its figures
   for the selected fuel — the same derivation idiom `setLevel()` already uses for
   the gauge segs. No selection state to persist, desync, or lie. Hand-editing mpg
   un-lights the chip mid-keystroke (re-derive on `input`, not just `change`).
   Compare with `parseFloat` — localStorage holds strings.
2. **Fuel-adaptive: each chip carries a petrol and a diesel figure** (E10/E5 →
   petrol, B7/B7P → diesel; one shared tank). Single numbers would be ~20% wrong
   for diesel drivers, and that error scales journey-mode *reachability*, not just
   pennies. The chip **never touches the fuel select** (no surprise field changes,
   no surprise auto-rerun), and changing fuel later never rewrites mpg — the
   highlight going off is the honest nudge. Hybrid fills 60 even with diesel
   selected (diesel hybrids are effectively extinct); Van fills 36 even on petrol —
   accepted, recorded here so neither is rediscovered as a bug.
3. **No auto-rerun on tap.** The analogue is a manual mpg edit (which doesn't rerun),
   not a fuel change (which reruns for grade-comparison, a different job). Rerunning
   on tap but not on the keystroke after would be inexplicable. The *underlying*
   staleness gap — mpg/tank edits leave an on-screen ranking stale with no warning —
   is real but pre-existing; it's logged below as its own item, not bundled.
4. **The tap dispatches real `input` and `change` events** on both fields instead of
   only assigning `.value` — programmatic writes fire nothing, which would silently
   skip the localStorage save (`change` listeners, index.html:1305) and leave the
   "~N L to fill" readout stale (tank `input` listener, :537). This also means any
   future fix to decision 3's gap covers presets automatically.
5. **Markup and styling reuse the house chip pattern**: native `<button type="button">`
   in a `role="group"` container, `aria-pressed` for state, class `.seg` — which
   inherits the contrast-vetted amber selected state in BOTH theme paths (the
   `@media` + `[data-theme]` double, index.html:145-147). One new rule only: a
   wrapping flex row, NOT the existing 5-column `.segs` grid (built for one-glyph
   labels; six worded chips need to wrap at 360 px). New data attribute
   (`data-preset`) so `setLevel()`'s `.seg[data-level]` wiring never sees them.
6. **Helper line above the chips**, linked via `aria-describedby`:
   "Not sure about the numbers? Tap the closest match — you can tweak them after."
   Plain words, pre-forgives imprecision, sits where the unsure user stalls.
   Example models ("like a Fiesta or Corsa") go in each chip's `aria-label`/`title`,
   not on its face. A tap announces itself via the existing polite live region
   ("Filled in typical figures: 46 mpg, 50 litre tank") — mutated inputs elsewhere
   in the DOM are invisible to screen-reader users otherwise.
7. **Nudge the mpg default from 45 → 46** in the same change, so a first visit
   truthfully lights "Family hatchback" (the default has always meant "a typical
   family car"; 46 is the sourced figure). A lit chip on arrival teaches what the
   chips do better than any copy. If this feels wrong at build time, the fallback
   is defaults lighting nothing — never fudge the sourced figures to force a match.

## Edge cases the build must cover (tests in brackets)

- Restore from localStorage that matches a chip → chip lights on load; numeric
  compare against the *restored* fuel's variant. [Playwright: reload, assert pressed]
- Tap then hand-edit mpg → highlight clears immediately. [test]
- Tap with results on screen → ranking goes stale exactly like a manual edit today;
  no new behaviour. [no test needed; see logged gap below]
- 100% full tank → litres-to-fill stays 0, ranking by trip cost alone, preset tank
  still extends journey range; no divide-by-zero. [test exists for the slider; add
  preset variant]
- Two chips must never share an identical (mpg, tank) pair within one fuel — the
  derived highlight would light both. Current set has no collisions (Small car and
  hatchback share 46 petrol mpg but differ on tank). Keep it that way when figures
  are ever updated.
- Values respect input constraints (mpg step 0.1, tank step 0.5, min 1); one decimal
  place max in figures so float equality stays exact.
- Payload: six buttons, ~40 lines JS, a few CSS rules — well under 1 KB gzipped.
  Pre-answered so the size check doesn't block the build.

## Build checklist

1. Chip row + helper line in the "Your car" card (between h2 at :295 and the mpg/tank
   `.row` at :296); PRESETS array inline (name, examples, petrol, diesel, tank).
2. Click handler: fill fields → dispatch `input` + `change` on both → announce via
   live region. Highlight derivation function; call it on load (after the CAR_KEY
   restore block), on chip tap, on mpg/tank `input`, and on fuel `change`.
3. mpg default 45 → 46 (decision 7).
4. CSS: `.segs.presets` flex-wrap override + nothing else new.
5. Playwright tests: tap fills both fields and readout updates; localStorage
   persists across reload with chip lit; hand-edit un-lights; fuel switch changes
   which variant a fresh tap fills; first-visit hatchback chip lit.
6. CHANGELOG entry. No service-worker VERSION bump (ordinary shell edit).

## Logged separately (do not bundle into this build)

- **Stale-results gap**: editing mpg/tank (or tapping a preset) with results on
  screen leaves the true-cost ranking stale with no indication. Options when picked
  up: rerun-on-change (respends OSRM calls in journey mode) or a "figures changed —
  search again" nudge. Presets neither worsen nor fix this; they inherit whatever
  lands.
- **The reassurance measurement** (item 2 of the original idea): before writing
  "close is fine — this only fine-tunes the drive cost" into UI copy, measure on
  real data how often ±10 mpg changes the winning forecourt. Belongs with the
  helper-copy polish, not blocking the chips.
- **Plate lookup** ([plate-lookup.md](plate-lookup.md)) remains the deluxe path on
  top of presets when the DVLA key unblocks — presets stay as the offline/no-plate
  fallback either way.
