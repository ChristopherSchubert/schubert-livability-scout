// lib/trip-merge.js — the real-time merge strategy (issues #36, #42). The
// edit-edit / edit-delete / reorder cases the spike specified, as pure tests.
import { describe, it, expect } from "vitest";
import { isOwnEcho, applyEntryChange, mergeEntryChange } from "../lib/trip-merge.js";

const entries = [
  { id: "a", title: "Balloon" },
  { id: "b", title: "Lunch" },
];

describe("isOwnEcho — own-write suppression", () => {
  it("suppresses an update for an in-flight id (our echo)", () => {
    const pending = new Map([["a", Date.now()]]);
    expect(isOwnEcho({ table: "trip_entries", eventType: "UPDATE", id: "a" }, pending)).toBe(true);
  });
  it("does not suppress a remote update for a different id", () => {
    const pending = new Map([["a", Date.now()]]);
    expect(isOwnEcho({ table: "trip_entries", eventType: "UPDATE", id: "z" }, pending)).toBe(false);
  });
  it("never suppresses a DELETE", () => {
    const pending = new Map([["a", Date.now()]]);
    expect(isOwnEcho({ table: "trip_entries", eventType: "DELETE", id: "a" }, pending)).toBe(false);
  });
});

describe("applyEntryChange — per-entry LWW", () => {
  it("inserts a new entry", () => {
    const out = applyEntryChange(entries, {
      eventType: "INSERT",
      entry: { id: "c", title: "Dinner" },
    });
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
  it("replaces an existing entry by id (last write wins)", () => {
    const out = applyEntryChange(entries, {
      eventType: "UPDATE",
      entry: { id: "a", title: "Balloon ride" },
    });
    expect(out.find((e) => e.id === "a").title).toBe("Balloon ride");
  });
  it("removes an entry on delete", () => {
    const out = applyEntryChange(entries, { eventType: "DELETE", id: "b" });
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("mergeEntryChange — suppress-then-apply", () => {
  it("returns the same array reference on a suppressed echo (no re-render)", () => {
    const pending = new Map([["a", Date.now()]]);
    const out = mergeEntryChange(
      entries,
      { table: "trip_entries", eventType: "UPDATE", id: "a", entry: { id: "a", title: "x" } },
      pending
    );
    expect(out).toBe(entries); // referential no-op
  });
  it("applies a genuine remote edit (edit-edit: other user wins the entry)", () => {
    const pending = new Map([["a", Date.now()]]);
    const out = mergeEntryChange(
      entries,
      {
        table: "trip_entries",
        eventType: "UPDATE",
        id: "b",
        entry: { id: "b", title: "Lunch @ Franko" },
      },
      pending
    );
    expect(out.find((e) => e.id === "b").title).toBe("Lunch @ Franko");
  });
  it("applies a remote delete even while we have a pending edit elsewhere", () => {
    const pending = new Map([["a", Date.now()]]);
    const out = mergeEntryChange(
      entries,
      { table: "trip_entries", eventType: "DELETE", id: "b" },
      pending
    );
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });
});
