// check-app.mjs
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
//
// Static checks for the constraints that have actually bitten this app. Runs in CI on
// every push and exits non-zero on failure. No dependencies, no network.
//
//   1. <meta charset> must sit inside the first 1024 bytes of index.html. Past that,
//      browsers may guess the encoding on any host that sends no charset header, and
//      every pound sign renders as "Â£" (this shipped once — caught by serving the
//      file from python http.server, which sends no charset).
//   2. The inline <script> must parse. It's 800+ lines that no bundler or compiler
//      ever looks at; a stray brace ships silently.
//   3. sw.js must parse — a broken service worker wedges updates for existing users,
//      which is far worse than never having had one.
//
// The .mjs pipeline scripts are checked with `node --check` in the workflow itself.

import { readFile } from "node:fs/promises";

const problems = [];

// --- 1. charset position ------------------------------------------------------------
const html = await readFile("index.html");
const charsetAt = html.indexOf(Buffer.from("<meta charset"));
if (charsetAt === -1) problems.push("index.html: no <meta charset> declaration at all");
else if (charsetAt > 1024 - 30)   // the tag itself must END inside 1024
  problems.push(`index.html: <meta charset> starts at byte ${charsetAt} — must sit fully inside the first 1024`);
else console.log(`charset declaration at byte ${charsetAt} (limit 1024) — ok`);

// --- 2. inline script parses ---------------------------------------------------------
const text = html.toString("utf8");
const open = text.indexOf("\n<script>\n");
const close = text.indexOf("\n</script>");
if (open === -1 || close === -1 || close < open) {
  problems.push("index.html: couldn't locate the inline <script> block");
} else {
  const body = text.slice(open + "\n<script>\n".length, close);
  try {
    new Function(body);
    console.log(`inline script parses (${body.split("\n").length} lines) — ok`);
  } catch (e) {
    problems.push(`index.html inline script does not parse: ${e.message}`);
  }
}

// --- 3. sw.js parses -----------------------------------------------------------------
try {
  new Function(await readFile("sw.js", "utf8"));
  console.log("sw.js parses — ok");
} catch (e) {
  problems.push(`sw.js does not parse: ${e.message}`);
}

if (problems.length) {
  console.error("\ncheck-app failed:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("all checks passed");
