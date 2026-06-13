#!/usr/bin/env node
// seed-booking-holds.mjs — sets real cancelBy + hold info on the Slovenia
// trip reservations matching the deck (Book page, slides 1808–1831).
//
// Data source: trip-walkthrough.html Book page (the canonical deck).
// Runs against BOTH:
//   prod trip: 7e6fdb7b-64ed-4d8f-9ad2-8f761fca4841
//   dev  clone: 72bfdc36-8212-46e5-979f-cc8f99088b14
//
// Idempotent — matches entries by title containing the hotel/activity name,
// only sets fields that are genuinely from the deck.
//
// DO NOT RUN — the LEAD (Claude Code main thread) runs this, not the user.
// Connection: pg pooler + Keychain password (same pattern as .read-feedback.mjs).

import { execFileSync } from "node:child_process";
import pg from "pg";

const TRIP_IDS = [
  "7e6fdb7b-64ed-4d8f-9ad2-8f761fca4841", // prod
  "72bfdc36-8212-46e5-979f-cc8f99088b14", // dev clone
];

// Hold data strictly from the deck (trip-walkthrough.html, section data-phase
// "Before you go · the book page"). Each entry:
//   matchTitle  — substring to match against entry title (case-insensitive)
//   booking     — the booking fields to merge into the existing booking object
// Fields NOT set: confirmation (already in DB from deck), status (already set).
// Only set what the deck actually states.
const HOLDS = [
  {
    matchTitle: "Hotel Union",
    // Deck: "free cancellation ends May 12" — Hotel Union Ljubljana
    booking: { cancelBy: "2026-05-12" },
  },
  {
    matchTitle: "Grand Hotel Toplice",
    // Deck: "held to arrival" — Toplice, Bled
    booking: { heldToArrival: true },
  },
  {
    matchTitle: "Hotel Piran",
    // Deck: "free-cancel 2 days prior" — trip departs May 23, Piran stay ends
    // May 23; 2 days prior = May 21. No absolute date stated in the deck,
    // so we set the relative phrase via a custom field. cancelBy left blank
    // (no absolute date given in the deck — honest null).
    booking: { freeCancelRelative: "2 days prior" },
  },
  {
    matchTitle: "Hot-air balloon",
    booking: { prepaid: true },
  },
  {
    matchTitle: "Canyoning",
    booking: { prepaid: true },
  },
  {
    matchTitle: "Via Ferrata",
    booking: { prepaid: true },
  },
];

async function seedTrip(client, tripId) {
  // Fetch all entry rows for this trip.
  const { rows } = await client.query(
    `SELECT id, payload FROM trip_entries WHERE trip_id = $1`,
    [tripId]
  );

  if (rows.length === 0) {
    console.log(`  [${tripId}] no entries — skipping`);
    return;
  }

  let updated = 0;
  for (const hold of HOLDS) {
    const match = rows.find((r) =>
      (r.payload?.title || "").toLowerCase().includes(hold.matchTitle.toLowerCase())
    );
    if (!match) {
      console.log(`  [${tripId}] no entry matching "${hold.matchTitle}" — skipping`);
      continue;
    }

    // Merge booking fields into the existing booking object (never overwrite
    // fields already set — only fill in gaps from the deck).
    const existing = match.payload?.booking || {};
    const merged = { ...existing };
    let changed = false;
    for (const [k, v] of Object.entries(hold.booking)) {
      if (merged[k] === undefined || merged[k] === null) {
        merged[k] = v;
        changed = true;
      }
    }
    if (!changed) {
      console.log(`  [${tripId}] "${match.payload?.title}" — already set, no-op`);
      continue;
    }

    const newPayload = { ...match.payload, booking: merged };
    await client.query(
      `UPDATE trip_entries SET payload = $1 WHERE id = $2`,
      [JSON.stringify(newPayload), match.id]
    );
    console.log(`  [${tripId}] updated "${match.payload?.title}" booking: ${JSON.stringify(hold.booking)}`);
    updated++;
  }
  console.log(`  [${tripId}] done — ${updated} entries updated`);
}

async function main() {
  const dbpw = execFileSync(
    "security",
    ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"],
    { encoding: "utf8" }
  ).trim();

  const client = new pg.Client({
    host: "aws-1-us-west-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.fitjkrmiwkdolxhitroc",
    password: dbpw,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to Supabase.");

  for (const tripId of TRIP_IDS) {
    console.log(`\nSeeding trip ${tripId}…`);
    await seedTrip(client, tripId);
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
