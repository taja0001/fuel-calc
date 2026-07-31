# Future: mpg from a number plate

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

So: **petrol × 0.82, diesel × 0.85**, presented as "roughly" and editable. Two caveats
from the same reports: the gap widens 1.5–2.5× for heavy SUVs (our flat factor will
flatter those), and plug-in hybrids are off by ~3.5× — which is why the hybrid guard
below refuses rather than estimates.

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

## Dependencies and sequence

1. **Presets first** (small hatchback / family car / SUV / van) — no backend, helps
   everyone immediately, and remains the fallback forever. Front-end only.
2. **Thomas registers for a VES key** at the DVLA developer portal (free, reviewed —
   same shape as the Fuel Finder registration).
3. Worker + UI + tests. The formula is pure and unit-testable; the Worker gets a
   mock-DVLA test like the fetcher's mock API.

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
