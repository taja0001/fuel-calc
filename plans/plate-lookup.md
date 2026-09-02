# Future: mpg from a number plate

> **Update 2026-09-01:** sequence step 1 (car presets) shipped 24 Aug. DVLA key
> application (step 2) remains the live blocker.

Written **2026-07-31**. Most people don't know their car's mpg, and a wrong mpg quietly
corrupts every figure the app produces — true cost, range warnings, trip cost. This is
the plan for "type your reg, get a decent mpg".

## The derivation

The free [DVLA Vehicle Enquiry Service](https://developer-portal.driver-vehicle-licensing.api.gov.uk/apis/vehicle-enquiry-service/vehicle-enquiry-service-description.html)
returns no mpg — but it returns **fuel type and official CO₂ g/km**, and CO₂ is mpg in
disguise: burning a litre of petrol emits ~2.31 kg of CO₂, diesel ~2.68 kg, regardless
of the car. So the official-cycle mpg falls straight out:

```
petrol:  mpg ≈ 2310 g/L × 2.82481 (km/L → mpg UK) ÷ CO₂ g/km  ≈ 6525 ÷ CO₂
diesel:  mpg ≈ 2680 g/L × 2.82481                  ÷ CO₂ g/km  ≈ 7571 ÷ CO₂
```

The CO₂→official-mpg step is exact by construction — both numbers encode the same test
result. Only the official→real-world factor is empirical, and it doesn't need guessing:
the EU's **OBFCM programme** reads actual fuel-burn meters (mandatory on all new cars
since 2021, 600k+ vehicles in the first report) and publishes the gap — **~20–24% over
official for petrol, ~18% for diesel**
([first Commission report, COM(2024) 122](https://climate.ec.europa.eu/document/download/b644dafe-1385-4b56-98d9-21e7e9f3601b_en?filename=report.pdf),
[2022-data update](https://climate.ec.europa.eu/news-other-reads/news/publication-real-world-co2-emissions-and-fuel-consumption-cars-and-vans-collected-2022-2024-07-26_en)).

So: **petrol × 0.82, diesel × 0.85** for WLTP-era cars, presented as "roughly" and
editable. Two caveats from the same reports: the gap widens 1.5–2.5× for heavy SUVs
(a flat factor flatters those), and plug-in hybrids are off by ~3.5× — which is why
the hybrid guard below refuses rather than estimates.

## The accuracy ladder

Each rung is independent and cheap-to-cheapish; build in this order.

**Rung 1 — era-aware factor (the big one, zero extra input).** Official CO₂ on the V5
was measured under NEDC before ~2018 and WLTP after ~2020, and the real-world gap
differs hugely: **39% under NEDC** ([ICCT, 1.3M vehicles](https://theicct.org/real-world-vehicle-fuel-consumption-gap-in-europe-is-stabilizing/))
vs ~18–24% under WLTP (OBFCM, above). VES returns year of manufacture, so:
`year ≤ 2017 → ×0.72 · 2018–2020 → ×0.77 (transition, fuzzy) · ≥ 2021 → ×0.82/0.85`.
Without this, the average-age UK car (~9 years) gets flattered by ~15% — a systematic
error, not noise. **This rung is not optional.**

**Rung 2 — CO₂-dependent taper.** OBFCM shows the gap growing with vehicle size; a
small penalty above ~130 g/km (calibrate against the report's model-level annex when
building) stops SUVs looking more economical than they are.

**Rung 3 — personal calibration, the ceiling.** No model beats measuring: a "log this
fill-up" affordance (odometer + litres, two fields, localStorage like the car — never
uploaded) yields the user's true mpg after two fills. The estimate becomes the *seed*;
the measured figure quietly takes over. Also sharpens every trip-cost figure, and suits
the app's brand: honest numbers, privately kept.

**Rung 4 — full hybrids.** Refuse only plug-ins (their official figures are fantasy);
ordinary hybrids (the enormous Toyota fleet) can take a factor with a wider "roughly"
band once VES's hybrid `fuelType` strings are known.

Expected error: flat factor alone ±20% on older cars → rung 1 brings typical error to
±8–10% → rung 3 converges on ±3%, which is the seasonal noise floor of mpg itself.

Edge cases: hybrids report implausibly low CO₂ (plug-in WLTP figures are fantasy —
detect `fuelType` containing HYBRID and either refuse or use a milder divisor);
EVs have no mpg at all (out of scope until the EV branch, see ev-charging.md);
pre-2001 cars may have no CO₂ figure → fall back to presets.

**Tank size is not in any DVLA dataset** — stays manual. Presets remain the partner.

## The architecture change this forces

VES needs a **secret API key**, and the app is a static page where everything is
public. So this is the app's first server component: a ~30-line **Cloudflare Worker**
(already on Cloudflare for DNS + analytics; free tier ~100k req/day vs our dozens):

```
app --POST plate--> worker (holds key, rate-limits, CORS locked to our origin)
                     --> DVLA VES --> {fuelType, co2Emissions}
    <-- {fuelType, co2, suggestedMpg} --
```

- Worker stores nothing, logs nothing. The plate transits, is sent to DVLA, and is gone.
- Fails soft: lookup button greys out, manual entry and presets untouched — same
  degradation pattern as OSRM.

## The honesty cost

The app's stated stance is "never uploaded". A plate lookup sends the user's reg
through our Worker to DVLA. That must be said plainly at the point of use ("checked
against DVLA via our relay; never stored") and in the README. Plates are
quasi-personal data; the privacy stance is the brand.

## ⚠ Blocked at DVLA's end (checked 2026-08-17)

The VES guide says: **"Registration closed. We are currently not accepting new VES API
registrations while we make some system upgrades."** So the key cannot be obtained yet.
Check the portal periodically, or email dvlaapiaccess@dvla.gov.uk (subject "VES API
technical query") asking to be notified when it reopens. Everything else on the page
confirms the design: POST with `x-api-key`, response carries exactly the fields the
accuracy ladder needs (`fuelType`, `co2Emissions`, `yearOfManufacture`), a UAT
environment with canned test plates (e.g. ER19BAD → 400), and per-client throttling.
One key per customer.

**Portal and application notes** (from reviewing the portal 2026-08-17):
- The right listing is **"Vehicle Enquiry Service"** on the available-APIs page — the
  openly-registerable free tier. Ignore KADOE / driver-data APIs; those are restricted
  services for insurers and enforcement.
- Application wording, when it reopens: *"a free fuel price comparison web app; the
  plate lookup pre-fills a car's approximate mpg from its fuel type and CO₂ figure, so
  users don't need to know it."* Dozens of lookups/day, far under any limit.
- Endpoints: prod `https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles`,
  UAT `https://uat.driver-vehicle-licensing.api.gov.uk/...` — POST
  `{"registrationNumber":"AB12CDE"}` (no spaces), auth via `x-api-key` header only.
- Errors to surface honestly in the UI: **404 = vehicle not found** ("check the plate"),
  429 throttled, 5xx DVLA down → lookup greys out, presets/manual untouched.
- **Key discipline:** the key never touches the repo or any chat — it goes straight
  into the Worker's secret settings, same rule as the Fuel Finder credentials on the Pi.
- Buildable before any key exists: the Worker + UI can be written and CI-tested against
  a mock VES (same pattern as the fetcher's mock API), then pointed at UAT, then prod.

## Dependencies and sequence

With registration frozen, the sequence inverts: **presets are promoted from fallback
to the feature** — pure front-end, no permission needed, and they fix everyone
defaulting to 45 mpg today. The plate lookup slots in above them when DVLA reopens.

1. **Presets now** (small hatchback / family car / SUV / van) — one tap, editable,
   fallback forever (hybrids refused, pre-2001 no CO₂, offline, DVLA down).
2. **Email dvlaapiaccess@dvla.gov.uk** to queue for reopening; check the portal
   periodically.
3. Worker + UI + tests against mock VES, then UAT, then prod when the key lands.
   UI sketch: a "look up my car" plate field beside the mpg box → pre-fills
   "≈ 37 mpg (2019 Mazda, petrol)", editable as ever.

## Validating the formula

Spot-checks against cars whose real-world mpg is known: look up the plate on the
public [GOV.UK vehicle checker](https://vehicleenquiry.service.gov.uk) (same data VES
serves), take fuel type + CO₂, apply the formula, compare against the known real mpg.
First spot-check: see below.

| Car (no plates stored here) | Fuel | CO₂ | Formula says | Owner says | Verdict |
|---|---|---|---|---|---|
| 2019 Mazda, 2.0 petrol | Petrol | 150 g/km | **37.0** | **37.5–38** | Within 1.5% — formula validated for a plain petrol. Checked 2026-07-31 via the public GOV.UK vehicle enquiry page. |

With the OBFCM petrol factor (×0.82) the same car predicts 35.7 — within 5%, still
comfortably "roughly". The chemistry step needs no further validation, and **the diesel
question is closed without a diesel owner**: the ×0.85 diesel factor *is* the
fleet-measured number from 600k+ real cars (see the derivation section).

The one remaining pre-build check is behavioural, not numerical: confirm the exact
`fuelType` strings VES returns for hybrids (HYBRID ELECTRIC, PETROL/ELECTRIC, …) so the
guard matches them all — answerable once the API key exists.
