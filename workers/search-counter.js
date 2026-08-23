// workers/search-counter.js
// Copyright (c) 2026 Thomas Ainsworth. All rights reserved — see LICENSE.
//
// Counts searches. The whole privacy contract in one sentence: a stored row is four
// words — "search", near|journey, ok|err, and an AREA no finer than a postcode
// district ("NG1") or a typed place name — plus Cloudflare's own timestamp. No IP,
// no user agent, no cookie, no identifier, nothing that can point at a person.
// plans/search-counter.md is the contract (amended 2026-08-24 to add the area word);
// the app's browser tests enforce the client half, and the shape checks below
// enforce it server-side even against a buggy or hostile client.
//
// Deploy (Thomas, ~7 min — plan steps 4 and 5):
//   1. Cloudflare dashboard -> Workers & Pages -> Create -> paste this file -> Deploy.
//   2. The new Worker -> Settings -> Bindings -> Add -> Analytics Engine dataset,
//      variable name SEARCHES.
//   3. Paste the *.workers.dev URL back to Claude — step 6 wires it into the app
//      (the BEACON constant AND the CSP connect-src list in index.html).
//
// Reading the numbers: dashboard -> Storage & Databases -> Analytics Engine -> SQL:
//   searches by area, last 7 days:
//     SELECT blob3 AS area, SUM(_sample_interval) AS searches FROM SEARCHES
//     WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY area ORDER BY searches DESC
//   near/journey split and error rate:
//     SELECT blob1 AS mode, blob2 AS outcome, SUM(_sample_interval) AS n
//     FROM SEARCHES GROUP BY mode, outcome

const MODES = new Set(["near", "journey"]);
const OUTCOMES = new Set(["ok", "err"]);
// A district ("NG1", "SW1A"), a lowercase place name, or the literal "gps"/"other".
// A full postcode ("NG1 5FS"), coordinates, or anything else fails the shape and is
// stored as "other" — precision cannot enter the tally, by construction.
const AREA = /^([A-Z]{1,2}\d[A-Z0-9]?|[a-z][a-z '-]{0,29})$/;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const body = (await request.text()).slice(0, 80);
    const [event, mode, outcome, area] = body.split(",");
    if (event !== "search" || !MODES.has(mode) || !OUTCOMES.has(outcome)) {
      return new Response(null, { status: 204 });   // junk: swallow it, write nothing
    }
    env.SEARCHES.writeDataPoint({
      blobs: [mode, outcome, AREA.test(area || "") ? area : "other"],
      doubles: [1],
    });
    return new Response(null, { status: 204 });
  },
};
