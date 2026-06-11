#!/usr/bin/env node
// Migrate the seeded Slovenia trip v1 → v2 (issue #14). The real trip (migration
// 0013) stores entries as a v1 blob on the `trips` row: `kind`, string/`{start,
// end}` time, `cost.cashOnly`. The v2 UI (entry-atom v2) wants orthogonal
// `category`×`status`, a `{mode}` time, `cost.payment`+`cashOnly`, a resolved
// `place.placeId`, and entries normalized into the `trip_entries` table
// (migration 0016). This is the one-shot that lands the canonical trip in v2.
//
// Idempotent: delete-then-insert this trip's trip_entries. The agent runs this
// (the owner never runs scripts — project memory). NOT runnable in the build
// sandbox (no Supabase / no Keychain) — it's written against the proven pg +
// Keychain pattern in scripts/migrate-slovenia-to-trip.mjs, to run on the Mac.
//
// Usage:  node scripts/migrate-slovenia-v2.mjs

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { kindToV2, entryToRow } from "../lib/trip.js";

const pw = execFileSync("security", [
  "find-generic-password",
  "-a",
  "livability-scout",
  "-s",
  "supabase-db-password",
  "-w",
])
  .toString()
  .trim();
const c = new Client({
  host: "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  user: "postgres.fitjkrmiwkdolxhitroc",
  database: "postgres",
  password: pw,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// The owner's Slovenia trip (the seeded v1 row).
const trip = (
  await c.query("select * from trips where name ilike 'Slovenia%' order by created_at limit 1")
).rows[0];
if (!trip) {
  console.error("No Slovenia trip found.");
  process.exit(1);
}
console.log(`Migrating trip ${trip.id} — ${trip.entries?.length || 0} v1 entries.`);

// ── Per-entry overrides for the `booked` cases (a booked meal is meal/booked, a
// booked tour is activity/booked) and the real cash-only-on-site venues. Keyed
// by a title substring so the mapping is legible + auditable.
const STATUS_OVERRIDE = [
  [/balloon|paraglid|vintgar|catamaran|pletna|vintage boat|boat to bled/i, "booked"],
  [/hiša franko|michelin|reservation/i, "reserved"],
];
const CASH_ON_SITE = [/pletna/i, /vintage boat/i, /paraglid/i]; // €36 + €511 + €380 = €927

function mapTime(t) {
  if (!t) return { mode: "bucket", bucket: "morning" };
  if (typeof t === "string") return { mode: "point", at: t };
  if (t.start && t.end) return { mode: "range", start: t.start, end: t.end };
  if (t.start) return { mode: "point", at: t.start };
  return { mode: "bucket", bucket: "morning" };
}
function mapCost(e) {
  const c0 = e.cost;
  if (!c0 || !Number.isFinite(c0.amount)) return undefined;
  const onSite = CASH_ON_SITE.some((re) => re.test(e.title || ""));
  return {
    amount: c0.amount,
    currency: c0.currency || "EUR",
    per: c0.per || "total",
    estimate: !!c0.estimate,
    payment: onSite || c0.cashOnly ? "onSite" : "prepaid",
    cashOnly: !!c0.cashOnly || onSite,
  };
}
function mapEntry(e) {
  const { category, status: baseStatus } = kindToV2(e.kind);
  let status = baseStatus;
  for (const [re, s] of STATUS_OVERRIDE)
    if (re.test(e.title || "")) {
      status = s;
      break;
    }
  return {
    id: e.id || undefined, // let the DB mint one if absent
    day: e.day,
    sort: 0,
    role: e.role || (category === "travel" || category === "stay" ? "connective" : "anchor"),
    category,
    status,
    title: e.title || "",
    note: e.note || "",
    time: mapTime(e.time),
    place: e.place?.placeId
      ? e.place
      : e.place
        ? { ...e.place, placeId: e.place.placeId ?? null }
        : null,
    cost: mapCost(e),
    booking: e.booking || undefined,
    markers: e.markers || [],
  };
}

// Idempotent: clear this trip's entries first.
await c.query("delete from trip_entries where trip_id = $1", [trip.id]);

let n = 0;
for (const e of trip.entries || []) {
  const v2 = mapEntry(e);
  const row = entryToRow(trip.id, v2);
  await c.query("insert into trip_entries (trip_id, day, payload, sort) values ($1, $2, $3, $4)", [
    row.trip_id,
    row.day,
    row.payload,
    row.sort,
  ]);
  n++;
}

// Backfill travelers + passes (the v2 frame columns, migration 0017).
const travelers = [
  { name: "Janice", kind: "person", chips: ["veg"] },
  { name: "Chris", kind: "person", chips: ["veg"] },
];
const passes = [
  { id: "ljubljana-city-card", name: "Ljubljana City Card" },
  { id: "julian-alps-card", name: "Julian Alps Card" },
  { id: "venice-day-visitor", name: "Venice day-visitor pass" },
];
await c.query("update trips set travelers = $1, passes = $2 where id = $3", [
  JSON.stringify(travelers),
  JSON.stringify(passes),
  trip.id,
]);

// Sanity: cash to carry should still total €927.
const cash = (trip.entries || []).map(mapEntry).reduce((sum, e) => {
  return e.cost?.payment === "onSite" && e.cost?.cashOnly && Number.isFinite(e.cost.amount)
    ? sum + e.cost.amount
    : sum;
}, 0);
console.log(`✓ migrated ${n} entries into trip_entries; cash-to-carry = €${cash} (expect €927).`);

await c.end();
