import test from "node:test";
import assert from "node:assert/strict";
import { appStatus } from "../lib/app-status.js";

const NOW = new Date("2026-06-29T12:00:00Z");
const opts = { now: NOW, baseUrl: "https://travel.example" };

function tripMissingHotel(startDate) {
  return {
    id: "t1",
    name: "Slovenia",
    startDate,
    endDate: "2026-08-10",
    legs: [{ name: "Ljubljana", arrive: startDate, depart: "2026-08-03" }],
    entries: [], // no confirmed stay ⇒ needs a hotel
  };
}

test("ok — cities but nothing needs attention", () => {
  const s = appStatus({ trips: [], visits: [], citiesCount: 12 }, opts);
  assert.equal(s.app, "travel");
  assert.equal(s.level, "ok");
  assert.equal(s.headline, "12 cities · 0 trips planned");
  assert.ok(s.deep_link.endsWith("/board"));
  assert.deepEqual(s.metrics.map((m) => m.label), ["Cities tracked", "Trips planned"]);
});

test("attention — a far-future trip is missing a hotel", () => {
  const s = appStatus({ trips: [tripMissingHotel("2026-08-01")], visits: [], citiesCount: 12 }, opts);
  assert.equal(s.level, "attention");
  assert.equal(s.headline, "Slovenia needs a hotel");
  assert.ok(s.deep_link.endsWith("/trips/t1"));
  // breakdown items are { label, count:int, level } per the contract
  assert.ok(s.breakdown.length >= 1);
  const hotel = s.breakdown.find((b) => b.label === "Needs a hotel");
  assert.equal(hotel.count, 1);
  assert.equal(hotel.level, "attention");
  assert.ok(s.breakdown.every((b) => typeof b.label === "string" && Number.isInteger(b.count)));
});

test("urgent — a trip departs within the window with an open blocker", () => {
  const s = appStatus({ trips: [tripMissingHotel("2026-07-02")], visits: [], citiesCount: 12 }, opts);
  assert.equal(s.level, "urgent");
  assert.match(s.headline, /Slovenia departs in 3 days/);
  assert.ok(s.headline.length <= 60);
});

test("single-city scheduled visit with empty plan slots → attention", () => {
  const visit = {
    name: "Newport, RI",
    slug: "newport-ri",
    arriveDate: "2026-08-05",
    departDate: "2026-08-08",
    lodgingDetails: "",
    flightDetails: "",
    carDetails: "",
  };
  const s = appStatus({ trips: [], visits: [visit], citiesCount: 12 }, opts);
  assert.equal(s.level, "attention");
  assert.match(s.headline, /Newport visit needs/);
  assert.equal(s.metrics.find((m) => m.label === "Trips planned").value, "1");
});

test("contract shape is always present", () => {
  const s = appStatus({ trips: [], visits: [], citiesCount: 0 }, opts);
  for (const k of ["app", "level", "headline", "metrics", "breakdown", "deep_link", "updated_at"]) {
    assert.ok(k in s, `missing ${k}`);
  }
  assert.ok(["ok", "attention", "urgent"].includes(s.level));
  assert.ok(s.headline.length <= 60);
});
