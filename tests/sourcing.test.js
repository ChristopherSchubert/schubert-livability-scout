// lib/sourcing.js — the Gather candidate-pool builder (issues #41, design in
// features/trip-planner-systems.md §1–2). The discipline under test: markers
// are HONESTLY derived (absent/false → no marker, never a guessed ✅).
import { describe, it, expect } from "vitest";
import {
  categorize,
  confidenceScore,
  deriveMarkers,
  openingHours,
  buildPool,
} from "../lib/sourcing.js";

describe("categorize", () => {
  it("maps each primaryType family", () => {
    expect(categorize("restaurant")).toEqual({ kind: "meal", category: "Eat & drink" });
    expect(categorize("hotel")).toEqual({ kind: "checkin", category: "Stay" });
    expect(categorize("museum")).toEqual({ kind: "flexible", category: "See" });
    expect(categorize("hiking_area")).toEqual({ kind: "flexible", category: "Outdoors" });
    expect(categorize("kayak")).toEqual({ kind: "booked", category: "Do" });
    expect(categorize("market")).toEqual({ kind: "todo", category: "Shop" });
  });
  it("falls back to Other for unknown / missing types", () => {
    expect(categorize("courthouse")).toEqual({ kind: "flexible", category: "Other" });
    expect(categorize(null)).toEqual({ kind: "flexible", category: "Other" });
  });
});

describe("confidenceScore", () => {
  it("rewards review volume so a thin 5.0 doesn't beat a deep 4.6", () => {
    const thin = confidenceScore({ rating: 5.0, user_rating_count: 12 });
    const deep = confidenceScore({ rating: 4.6, user_rating_count: 4000 });
    expect(deep).toBeGreaterThan(thin);
  });
  it("is 0 with no rating data", () => {
    expect(confidenceScore({})).toBe(0);
  });
});

describe("deriveMarkers — honest provenance", () => {
  it("derives a price marker from price_level", () => {
    const m = deriveMarkers({ price_level: "PRICE_LEVEL_MODERATE" });
    expect(m).toContainEqual({ type: "price", value: "€€", source: "Google Places" });
  });
  it("derives attribute markers from a fetched blob, each cited with the date", () => {
    const m = deriveMarkers({
      attributes: {
        allowsDogs: true,
        servesVegetarianFood: true,
        goodForChildren: true,
        outdoorSeating: true,
        accessibilityOptions: { wheelchairAccessibleEntrance: true },
        paymentOptions: { acceptsCashOnly: true },
      },
      attributes_fetched_at: "2026-06-08T00:00:00Z",
    });
    const types = m.map((x) => x.type);
    expect(types).toEqual(
      expect.arrayContaining(["dog", "veg", "kid", "patio", "accessible", "cashOnly"])
    );
    expect(m.find((x) => x.type === "dog").source).toBe("Google Places · 2026-06-08");
  });
  it("yields NO marker when an attribute is false or absent (never a guessed ✅)", () => {
    expect(deriveMarkers({ attributes: { allowsDogs: false } })).toEqual([]);
    expect(deriveMarkers({ attributes: {} })).toEqual([]);
    expect(deriveMarkers({})).toEqual([]);
  });
  it("omits the citation date when attributes_fetched_at is missing", () => {
    const m = deriveMarkers({ attributes: { allowsDogs: true } });
    expect(m[0].source).toBe("Google Places");
  });
});

describe("openingHours", () => {
  it("returns weekday descriptions when present, null otherwise", () => {
    expect(
      openingHours({ attributes: { regularOpeningHours: { weekdayDescriptions: ["Mon: 9–5"] } } })
    ).toEqual(["Mon: 9–5"]);
    expect(openingHours({})).toBe(null);
  });
});

describe("buildPool", () => {
  const raw = [
    {
      place_id: "a",
      name: "Cafe",
      primary_type: "cafe",
      lat: 46.37,
      lon: 14.11,
      rating: 4.8,
      user_rating_count: 900,
      formatted_address: "Main St",
    },
    {
      place_id: "b",
      name: "Shop",
      primary_type: "store",
      lat: 46.38,
      lon: 14.12,
      rating: 4.2,
      user_rating_count: 20,
    },
  ];
  it("shapes pois into pool candidates ranked by score desc", () => {
    const pool = buildPool(raw, { origin: { lat: 46.37, lon: 14.11 } });
    expect(pool[0].placeId).toBe("a"); // higher confidence ranks first
    expect(pool[0]).toMatchObject({ name: "Cafe", kind: "meal", category: "Eat & drink" });
    expect(pool[0].distanceKm).toBe(0);
    expect(pool[1].distanceKm).toBeGreaterThan(0);
  });
  it("leaves distanceKm null without an origin", () => {
    expect(buildPool(raw)[0].distanceKm).toBe(null);
  });
});
