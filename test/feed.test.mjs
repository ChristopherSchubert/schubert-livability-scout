// Feed contract tests (#93, epic #84) — the hub pulls GET /api/feed and expects
// cards matching feed-contract v1 (key / kind∈{status,countdown,deadline,summary}
// / title required; member_id uuid-or-null; ISO dates; summaries, never raw rows).
// These cover the two unblocked, pure pieces: the trip→card mapping (lib/feed.js)
// and HS256 service-token verification (lib/feed-token.js). The household-scoped
// DB query is wired in the route once identity (#90) + data land.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { tripToFeedCard, feedFromTrips } from "../lib/feed.js";
import { verifyServiceToken } from "../lib/feed-token.js";

// Mirror of conformance/check-feed.mjs validateCard — keep the unit suite honest
// against the same rules the hub harness enforces.
const KINDS = ["status", "countdown", "deadline", "summary"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertContractValid(c) {
  assert.ok(c && typeof c === "object", "card is an object");
  assert.ok(typeof c.key === "string" && c.key, "key non-empty string");
  assert.ok(KINDS.includes(c.kind), `kind in ${KINDS.join("|")}`);
  assert.ok(typeof c.title === "string" && c.title, "title non-empty string");
  for (const f of ["body", "metric", "delta", "event_at", "expires_at", "deep_link"]) {
    if (c[f] != null) assert.equal(typeof c[f], "string", `${f} string-or-null`);
  }
  if (c.member_id != null) assert.ok(UUID.test(c.member_id), "member_id uuid-or-null");
  if (c.priority != null) assert.ok(Number.isInteger(c.priority), "priority int-or-null");
  if (c.deep_link != null) assert.ok(/^https?:\/\//.test(c.deep_link), "deep_link is a URL");
}

const NOW = "2026-06-22";
const baseUrl = "https://travel.schubertfamily.com";
const MEMBER = "11111111-2222-3333-4444-555555555555";

const upcoming = { id: "t-up", name: "Slovenia", startDate: "2026-09-10", endDate: "2026-09-20",
  legs: [{ cityId: "c1", name: "Ljubljana, SI" }, { cityId: "c2", name: "Bled, SI" }, { cityId: "c3", name: "Piran, SI" }] };
const ongoing = { id: "t-on", name: "Coast week", startDate: "2026-06-20", endDate: "2026-06-27", legs: [{ name: "Camden, ME" }] };
const past = { id: "t-pa", name: "Spring trip", startDate: "2026-04-01", endDate: "2026-04-05", legs: [{ name: "Athens, GA" }] };
const undated = { id: "t-nd", name: "Someday", startDate: null, endDate: null, legs: [{ name: "Marfa, TX" }] };

test("upcoming trip → countdown card, contract-valid, dated + deep-linked", () => {
  const c = tripToFeedCard(upcoming, { now: NOW, memberId: MEMBER, baseUrl });
  assertContractValid(c);
  assert.equal(c.kind, "countdown");
  assert.equal(c.key, "travel:trip:t-up");
  assert.equal(c.title, "Slovenia");
  assert.equal(c.member_id, MEMBER);
  assert.equal(c.event_at, "2026-09-10T00:00:00Z");
  assert.equal(c.expires_at, "2026-09-20T00:00:00Z");
  assert.equal(c.deep_link, `${baseUrl}/trips/t-up`);
  assert.match(c.metric, /\b80\b/); // 2026-06-22 → 2026-09-10 is 80 days
  assert.match(c.body, /Ljubljana/); // summary, not raw entry rows
});

test("ongoing trip → status; past → summary; undated → status", () => {
  assert.equal(tripToFeedCard(ongoing, { now: NOW }).kind, "status");
  assert.equal(tripToFeedCard(past, { now: NOW }).kind, "summary");
  assert.equal(tripToFeedCard(undated, { now: NOW }).kind, "status");
});

test("member_id defaults to null (household-wide) and stays contract-valid", () => {
  const c = tripToFeedCard(upcoming, { now: NOW, baseUrl });
  assert.equal(c.member_id, null);
  assertContractValid(c);
});

test("feedFromTrips returns {cards} ~1 per trip, all contract-valid", () => {
  const out = feedFromTrips([upcoming, ongoing, past, undated], { now: NOW, baseUrl });
  assert.ok(Array.isArray(out.cards));
  assert.equal(out.cards.length, 4);
  out.cards.forEach(assertContractValid);
  const keys = out.cards.map((c) => c.key);
  assert.equal(new Set(keys).size, 4, "keys are unique per trip");
});

test("never emits raw rows — no entries/legs arrays leak into the card", () => {
  const withEntries = { ...upcoming, entries: [{ id: "e1", note: "secret" }], travelers: [{ name: "Chris" }] };
  const c = tripToFeedCard(withEntries, { now: NOW, baseUrl });
  const json = JSON.stringify(c);
  assert.equal(json.includes("secret"), false);
  assert.equal(Array.isArray(c.entries), false);
  assert.equal(Array.isArray(c.legs), false);
});

// ── HS256 service-token verification ────────────────────────────────────────
const KEY = "test-signing-key-please-rotate";
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sign(payload, key = KEY, alg = "HS256") {
  const h = b64url(JSON.stringify({ alg, typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", key).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

test("verifyServiceToken: a valid HS256 token passes and returns claims", () => {
  const tok = sign({ iss: "hub", sub: "feed", exp: Math.floor(Date.UTC(2026, 11, 1) / 1000) });
  const r = verifyServiceToken(`Bearer ${tok}`, KEY, { now: Date.UTC(2026, 5, 22) });
  assert.equal(r.ok, true);
  assert.equal(r.payload.iss, "hub");
});

test("verifyServiceToken: rejects missing token, bad signature, wrong key, expired, wrong alg", () => {
  const good = sign({ sub: "feed" });
  assert.equal(verifyServiceToken("", KEY).ok, false, "missing");
  assert.equal(verifyServiceToken("Bearer not.a.jwt", KEY).ok, false, "malformed");
  assert.equal(verifyServiceToken(`Bearer ${good}`, "wrong-key").ok, false, "wrong key");
  assert.equal(verifyServiceToken(`Bearer ${good.slice(0, -3)}xyz`, KEY).ok, false, "tampered sig");
  const exp = sign({ sub: "feed", exp: Math.floor(Date.UTC(2026, 0, 1) / 1000) });
  assert.equal(verifyServiceToken(`Bearer ${exp}`, KEY, { now: Date.UTC(2026, 5, 22) }).ok, false, "expired");
  const none = sign({ sub: "feed" }, KEY, "none");
  assert.equal(verifyServiceToken(`Bearer ${none}`, KEY).ok, false, "alg none rejected");
});

test("verifyServiceToken: no signing key configured → fails closed", () => {
  const tok = sign({ sub: "feed" });
  assert.equal(verifyServiceToken(`Bearer ${tok}`, "").ok, false);
});
