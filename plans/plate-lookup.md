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

Official figures flatter reality by ~10–20% (test cycle vs traffic), so the app should
apply **× 0.85** and present it as "roughly", editable. Examples: petrol 120 g/km →
54 official → **~46 suggested**; diesel 110 g/km → 69 official → **~59 suggested**.

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

One car doesn't prove the constant, but it strongly suggests the ×0.85 real-world
factor is about right for petrol. Before building: spot-check **a diesel** (different
carbon constant, 7571) and **a hybrid** (expected to fail — that's what the guard is
for). If the diesel lands within ~5% too, the formula ships as-is.
