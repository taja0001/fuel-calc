# Future branch: EV charging

Written **2026-07-30** after Thomas asked whether the true-cost approach could extend to
"cheapest place to charge". Short answer: **yes, and the concept fits EV charging even
better than fuel — but the data ingestion is genuinely harder, and it's a bigger build
than the fuel app was.** Not started; this records the research so it doesn't need
redoing.

---

## Why the concept transfers better

- **The price spread is enormous.** Petrol varies by ~10–15p/L around a ~150p mean.
  Public charging runs from ~25p/kWh (cheap AC overnight tariffs) to ~85p+/kWh (premium
  rapids) — a 3× spread. True-cost ranking has far more to bite on.
- **Time is a first-class cost, and we already show minutes.** A charge takes 20–40+
  minutes, so "true cost" for EV = energy price + drive there + **time charging at this
  charger's speed for your car**. The minutes work (`43343e8`) becomes central rather
  than a nicety.
- **Journey mode is the killer use case.** Most EV owners charge at home; public
  charging is dominated by en-route rapid charging on longer trips. Our route-corridor
  geometry, range awareness and detour maths are exactly the right machinery.
- **The savings line writes itself** — "£4.10 cheaper than the nearest rapid" is a
  bigger, more shareable number than fuel's pennies.

## The legal/data position (checked 2026-07-30)

- [The Public Charge Point Regulations 2023](https://www.legislation.gov.uk/uksi/2023/1168/pdfs/uksiod_20231168_en_001.pdf)
  — in force, with the data duties live since **24 Nov 2024**: operators must make
  **reference data and availability data** publicly available, **free, machine-readable
  (OCPI), and without T&Cs**. Pricing transparency is mandated: the maximum total price
  in p/kWh must be disclosed, including fixed fees.
- **But there is no single government API.** This is the big difference from Fuel
  Finder. The data lives in **per-operator OCPI feeds** — dozens of CPOs, each their own
  endpoint. The DfT appointed **Zapmap** as its aggregation provider (contract from Dec
  2024, extendable to end-2027), but that aggregation is *for the DfT*; Zapmap's own API
  is commercial. Ingestion for us would mean maintaining a registry of operator feeds
  and polling them all — the Pi's job gets an order of magnitude more plumbing.
- Worth re-checking before starting: whether DfT/Zapmap publish a consolidated open
  dataset by then (the consumer-experience consultation hints that way), which would
  collapse the ingestion problem back to Fuel Finder shape.

## What's genuinely harder than fuel

1. **"The price" isn't one number.** Tariffs have connection fees, idle fees,
   subscription vs ad-hoc rates, and vary by charging speed. Modelling a session cost
   honestly is real work; the fuel app's `prices.E10` becomes a tariff structure.
2. **The car matters much more.** mpg + tank becomes battery kWh, efficiency (mi/kWh),
   **max charge rate** (a 50kW car gains nothing from a 350kW charger) and **connector
   type**. The car form grows, and presets (see backlog idea) become near-essential.
3. **Real-time availability matters.** A cheap charger that's occupied or broken is
   worthless. PCPR mandates availability data, but our hourly-static-file architecture
   only suits *planning*, not live "is it free now". Honest scope: journey planning and
   tariff comparison, with availability shown as "as of X" — not live navigation.
4. **Scale**: ~80k public connectors vs 8k forecourts. Payload discipline (see
   backlog) matters from day one.

## What carries over from this codebase

The grid index, route-corridor search, range/reachability logic, open-now decoding,
minutes display, savings line, service worker, validator-in-CI pattern, and the whole
Pi → static JSON → static app pipeline. The fuel app is effectively the prototype for
this — most of the hard geometry is already written and browser-tested.

Also: if a domain is bought (see monetisation.md), **prefer a name that survives an EV
branch** — "fuelmaths" stretches to charging; "cheapestfill" doesn't really.

## What would need to be true to start

1. A tractable ingestion path — ideally a consolidated open dataset from DfT/Zapmap, or
   a maintained registry of the major CPOs' OCPI endpoints (the top ~10 operators cover
   the large majority of rapids).
2. The fuel app stable and not competing for the same hands (it is one person and a Pi).
3. A decision on scope: journey-mode rapid comparison first — it's the strongest use
   case and needs the least real-time data.
