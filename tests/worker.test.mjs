// worker.test.mjs — the old-domain rescue Worker, driven with a stubbed fetch.
// Copyright (c) 2026 the owner of whichpump.co.uk. All rights reserved — see LICENSE.
//
// The Worker exists because a real phone was found running a ten-day-old shell from
// fuel.thomasainsworth.co.uk with sample prices (8 Sep 2026). These pin the contract:
// /sw.js is a valid kill switch that never intercepts, /data/prices.json is proxied
// to the new origin with the conditional headers intact, and everything else 301s
// with path and query preserved — exactly what the Cloudflare rule does.

import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { KILL_SWITCH, redirectTarget } from "../workers/old-domain-rescue.js";

const OLD = "https://fuel.thomasainsworth.co.uk";
const get = (path, headers = {}) => worker.fetch(new Request(OLD + path, { headers }));

test("/sw.js is a kill switch: valid script, clears caches, unregisters, sends tabs to whichpump", async () => {
  const res = await get("/sw.js");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^application\/javascript/);
  const body = await res.text();
  assert.equal(body, KILL_SWITCH);
  assert.doesNotThrow(() => new Function(body), "the kill switch must parse");
  assert.match(body, /caches\.delete\(/, "empties every cache");
  assert.match(body, /registration\.unregister\(\)/, "removes itself");
  assert.match(body, /skipWaiting\(\)/, "takes over without waiting for tabs to close");
  assert.match(body, /navigate\("https:\/\/whichpump\.co\.uk"/, "moves open tabs to the new origin");
  assert.doesNotMatch(body, /addEventListener\("fetch"/, "never intercepts — the reload must reach the network");
});

test("/data/prices.json is proxied to the new origin with conditional headers, answer passed through", async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async req => {
    seen.push({ url: req.url, method: req.method, inm: req.headers.get("if-none-match") });
    return req.headers.get("if-none-match") === '"abc"'
      ? new Response(null, { status: 304, headers: { etag: '"abc"' } })
      : new Response('{"stations":[1]}', { status: 200, headers: { "content-type": "application/json", etag: '"abc"' } });
  };
  try {
    const fresh = await get("/data/prices.json?x=1");
    assert.equal(fresh.status, 200);
    assert.equal(await fresh.text(), '{"stations":[1]}');
    assert.equal(seen[0].url, "https://whichpump.co.uk/data/prices.json?x=1", "same path and query, new host");
    assert.equal(seen[0].method, "GET");

    const cond = await get("/data/prices.json", { "If-None-Match": '"abc"' });
    assert.equal(cond.status, 304, "a 304 from upstream reaches the old shell unchanged");
    assert.equal(seen[1].inm, '"abc"', "the conditional header travels with the request");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("everything else 301s to whichpump.co.uk with path and query preserved, like the rule", async () => {
  const res = await get("/petrol/leeds/?pc=LS1");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://whichpump.co.uk/petrol/leeds/?pc=LS1");
  assert.equal(redirectTarget(OLD + "/"), "https://whichpump.co.uk/");
});

test("non-GET methods are refused, never proxied", async () => {
  const res = await worker.fetch(new Request(OLD + "/data/prices.json", { method: "POST", body: "x" }));
  assert.equal(res.status, 405);
});
