// Feed contract tests (#93, epic #84) — the hub pulls GET /api/feed and expects
// cards matching feed-contract v1 (key / kind∈{status,countdown,deadline,summary}
// / title required; member_id uuid-or-null; ISO dates; summaries, never raw rows).
// These cover the two unblocked, pure pieces: the trip→card mapping (lib/feed.js)
// and HS256 service-token verification (lib/feed-token.js). The household-scoped
// DB query is wired in the route once identity (#90) + data land.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { tripToFeedCard, cityVisitToFeedCard, feedFromTrips, feedFromTripsAndVisits } from "../lib/feed.js";
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

test("ongoing trip → status; undated → status; PAST → null (dropped from the hub feed)", () => {
  assert.equal(tripToFeedCard(ongoing, { now: NOW }).kind, "status");
  assert.equal(tripToFeedCard(undated, { now: NOW }).kind, "status");
  // Past trips don't surface on the hub — the family feed is "what's
  // happening / coming up," not history. Visited/Assessed handle history.
  assert.equal(tripToFeedCard(past, { now: NOW }), null);
});

test("member_id defaults to null (household-wide) and stays contract-valid", () => {
  const c = tripToFeedCard(upcoming, { now: NOW, baseUrl });
  assert.equal(c.member_id, null);
  assertContractValid(c);
});

test("feedFromTrips returns {cards}, drops past trips, all contract-valid", () => {
  const out = feedFromTrips([upcoming, ongoing, past, undated], { now: NOW, baseUrl });
  assert.ok(Array.isArray(out.cards));
  assert.equal(out.cards.length, 3, "past trip filtered out");
  out.cards.forEach(assertContractValid);
  const keys = out.cards.map((c) => c.key);
  assert.equal(new Set(keys).size, 3, "keys unique per surviving trip");
  assert.equal(keys.includes("travel:trip:t-pa"), false, "past trip key absent");
});

test("never emits raw rows — no entries/legs arrays leak into the card", () => {
  const withEntries = { ...upcoming, entries: [{ id: "e1", note: "secret" }], travelers: [{ name: "Chris" }] };
  const c = tripToFeedCard(withEntries, { now: NOW, baseUrl });
  const json = JSON.stringify(c);
  assert.equal(json.includes("secret"), false);
  assert.equal(Array.isArray(c.entries), false);
  assert.equal(Array.isArray(c.legs), false);
});

// ── Single-city scheduled visits (the second feed source) ───────────────────
const newport = { id: "ci-1", name: "Newport, RI", slug: "newport-ri",
  stayZone: "Historic Hill / Thames Street", heartIntersection: "Thames St & Bowen's Wharf",
  arriveDate: "2026-08-05", departDate: "2026-08-08" };
const salemUpcoming = { id: "ci-2", name: "Salem, MA", slug: "salem-ma",
  stayZone: "Downtown Salem", arriveDate: "2026-10-26", departDate: "2026-11-01" };
const visitedPast = { id: "ci-3", name: "Allison Park, PA", slug: "allison-park-pa",
  stayZone: "Allison Park", arriveDate: "2026-04-01", departDate: "2026-04-05" };
const visitNoDates = { id: "ci-4", name: "Burlington, VT", slug: "burlington-vt", stayZone: "Church Street" };

test("cityVisitToFeedCard: upcoming → countdown, contract-valid, deep-links to /cities", () => {
  const c = cityVisitToFeedCard(newport, { now: NOW, memberId: MEMBER, baseUrl });
  assertContractValid(c);
  assert.equal(c.kind, "countdown");
  assert.equal(c.key, "travel:visit:ci-1");
  assert.equal(c.title, "Newport, RI");
  assert.equal(c.body, "Thames St & Bowen's Wharf");
  assert.equal(c.event_at, "2026-08-05T00:00:00Z");
  assert.equal(c.expires_at, "2026-08-08T00:00:00Z");
  assert.equal(c.deep_link, `${baseUrl}/cities/newport-ri`);
  assert.equal(c.member_id, MEMBER);
  assert.match(c.metric, /\b44\b/); // 2026-06-22 → 2026-08-05 = 44 days
});

test("cityVisitToFeedCard: flags missing flight/lodging/car in the countdown metric", () => {
  // No detail fields set on this fixture (matches Newport's actual state today)
  const noDetails = cityVisitToFeedCard(newport, { now: NOW, baseUrl });
  assert.match(noDetails.metric, /3 to plan/, "all three slots empty → '3 to plan'");

  const partial = cityVisitToFeedCard(
    { ...newport, flightDetails: "Delta DL 123", lodgingDetails: "" },
    { now: NOW, baseUrl },
  );
  assert.match(partial.metric, /2 to plan/, "two slots empty → '2 to plan'");

  const ready = cityVisitToFeedCard(
    { ...newport, flightDetails: "Delta DL 123", lodgingDetails: "Hotel Viking", carDetails: "Hertz" },
    { now: NOW, baseUrl },
  );
  assert.match(ready.metric, /\bready\b/, "all three filled → 'ready'");
  assert.equal(ready.metric.includes("to plan"), false, "no 'to plan' when ready");

  // Whitespace-only counts as empty (don't false-positive "ready")
  const whitespace = cityVisitToFeedCard(
    { ...newport, flightDetails: "  ", lodgingDetails: "Hotel Viking", carDetails: "Hertz" },
    { now: NOW, baseUrl },
  );
  assert.match(whitespace.metric, /1 to plan/);
});

test("cityVisitToFeedCard: 'to plan' hint only on countdown — ongoing/undated metrics stay clean", () => {
  // No detail fields, but trip is ongoing today — don't nag mid-trip.
  const ongoingNow = cityVisitToFeedCard(
    { ...newport, arriveDate: "2026-06-20", departDate: "2026-06-30" },
    { now: NOW, baseUrl },
  );
  assert.equal(ongoingNow.kind, "status");
  assert.equal(ongoingNow.metric, "on the trip");
  assert.equal(ongoingNow.metric.includes("to plan"), false);
});

test("cityVisitToFeedCard: past → null (dropped); undated → status placeholder", () => {
  assert.equal(cityVisitToFeedCard(visitedPast, { now: NOW }), null);
  assert.equal(cityVisitToFeedCard(visitNoDates, { now: NOW }).kind, "status");
});

test("cityVisitToFeedCard: keys never collide with trip keys (different prefix)", () => {
  const visitCard = cityVisitToFeedCard({ ...newport, id: "ABC" }, { now: NOW, baseUrl });
  const tripCard = tripToFeedCard({ ...upcoming, id: "ABC" }, { now: NOW, baseUrl });
  assert.notEqual(visitCard.key, tripCard.key);
  assert.equal(visitCard.key, "travel:visit:ABC");
  assert.equal(tripCard.key, "travel:trip:ABC");
});

test("feedFromTripsAndVisits: merges both sources, all cards contract-valid", () => {
  const out = feedFromTripsAndVisits([upcoming, ongoing], [newport, salemUpcoming], { now: NOW, baseUrl });
  assert.equal(out.cards.length, 4);
  out.cards.forEach(assertContractValid);
  const keys = out.cards.map((c) => c.key);
  assert.ok(keys.includes("travel:trip:t-up"));
  assert.ok(keys.includes("travel:visit:ci-1")); // Newport
  assert.equal(new Set(keys).size, 4, "keys unique across both sources");
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
