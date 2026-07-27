# Fill-Up — cheapest forecourt by true cost

A free web app that finds the cheapest place to fill up near you, ranked by
**true cost** — the pump price *plus* the fuel you'd burn driving there and back —
not just the sticker price. It runs on live UK prices from the government
[Fuel Finder](https://www.fuel-finder.service.gov.uk) scheme.

**Live site:** https://taja0001.github.io/fuel-calc/

## Features

- **True-cost ranking** — every nearby forecourt scored on fill cost + the fuel to
  drive there and back, so a cheap-but-far station is judged fairly against a
  dearer one round the corner.
- **Cheapest by brand** — two lists, Supermarkets and Fuel brands, each sorted
  cheapest-first.
- **Directions** — one tap opens Google Maps navigation to any forecourt.
- **Location** — search by postcode (via [postcodes.io](https://postcodes.io)) or
  tap to use your current location.
- **Your car, remembered privately** — mpg / tank / fuel type are saved in your
  browser only (localStorage). Never uploaded, never in the repo, invisible to
  anyone else.
- **Freshness indicator** — footer shows how long ago the prices were updated.
- **Add to home screen** — works as a normal web-app shortcut on your phone.
- **Light & dark themes**, automatic.

## How it works

The site itself is a single static page. The interesting part is the data.

