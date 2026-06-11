// lib/place-resolve.js (issue #13) — shaping + honest-null, against a mock fetch
// (no live Google call). The never-invent rule is the thing under test.
import { describe, it, expect, vi } from "vitest";
import { searchPlaces, resolvePlace } from "../lib/place-resolve.js";

const okResponse = (places) => ({ json: async () => ({ places }) });
const errResponse = (message) => ({ json: async () => ({ error: { message } }) });

const FRANKO = {
  id: "ChIJfranko",
  displayName: { text: "Hiša Franko" },
  location: { latitude: 46.23, longitude: 13.6 },
  formattedAddress: "Staro selo 1, Kobarid",
  primaryType: "restaurant",
  rating: 4.8,
  userRatingCount: 1200,
};

describe("searchPlaces", () => {
  it("shapes Google results into pois-compatible candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([FRANKO]));
    const out = await searchPlaces("Hiša Franko", { apiKey: "k", fetchImpl });
    expect(out[0]).toEqual({
      placeId: "ChIJfranko",
      name: "Hiša Franko",
      lat: 46.23,
      lon: 13.6,
      address: "Staro selo 1, Kobarid",
      primaryType: "restaurant",
      rating: 4.8,
      ratingCount: 1200,
    });
  });
  it("drops results with no id or coordinates (never fabricates)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse([{ displayName: { text: "ghost" } }, FRANKO]));
    const out = await searchPlaces("x", { apiKey: "k", fetchImpl });
    expect(out).toHaveLength(1);
  });
  it("returns [] for empty query without calling Google", async () => {
    const fetchImpl = vi.fn();
    expect(await searchPlaces("   ", { apiKey: "k", fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("throws without an api key", async () => {
    await expect(searchPlaces("x", {})).rejects.toThrow(/API key/);
  });
  it("surfaces Google errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errResponse("OVER_QUERY_LIMIT"));
    await expect(searchPlaces("x", { apiKey: "k", fetchImpl })).rejects.toThrow(/OVER_QUERY_LIMIT/);
  });
  it("passes a location bias when `near` is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([FRANKO]));
    await searchPlaces("Franko", { apiKey: "k", near: { lat: 46.2, lon: 13.6 }, fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.locationBias.circle.center).toEqual({ latitude: 46.2, longitude: 13.6 });
  });
});

describe("resolvePlace", () => {
  it("returns the top candidate", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([FRANKO]));
    expect((await resolvePlace("Hiša Franko", { apiKey: "k", fetchImpl })).placeId).toBe(
      "ChIJfranko"
    );
  });
  it("returns null for a nonsense query (honest blank)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([]));
    expect(await resolvePlace("asdkjfh qwoieu", { apiKey: "k", fetchImpl })).toBe(null);
  });
});
