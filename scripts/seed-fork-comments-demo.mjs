#!/usr/bin/env node
// seed-fork-comments-demo.mjs — Idempotent seed for the fork-comments demo
// (Janice feedback #8). Writes to Supabase via direct pg connection using
// the Keychain password (same pattern as scripts/.read-feedback.mjs).
//
// DO NOT RUN AUTOMATICALLY — the lead reviews and runs this manually.
//
// What it does:
//   1. On the REAL Slovenia trip (7e6fdb7b-64ed-4d8f-9ad2-8f761fca4841) and
//      its dev clone (72bfdc36-8212-46e5-979f-cc8f99088b14): merges a Piran vs
//      Trieste fork into trips.options without clobbering any existing options.
//   2. Inserts 2 example trip_fork_comments on each trip so the UI renders
//      non-empty on first open. Idempotent: skips if a fork with id='fork-piran'
//      already exists; skips comment rows that already exist by (trip_id,fork_id,body).

import { execFileSync } from "node:child_process";
import pg from "pg";

const TRIP_IDS = [
  "7e6fdb7b-64ed-4d8f-9ad2-8f761fca4841", // real Slovenia trip
  "72bfdc36-8212-46e5-979f-cc8f99088b14", // dev clone
];

const FORK = {
  id: "fork-piran",
  name: "Piran vs Trieste",
  range: { from: "2026-05-21", to: "2026-05-24" },
  choices: [
    { id: "A", label: "All-in Piran" },
    { id: "B", label: "Trieste + Piran" },
  ],
  activeChoiceId: "A",
};

// Example comments — two voices, two leans.
const SEED_COMMENTS = [
  {
    fork_id: "fork-piran",
    choice_id: "A",
    body: "Staying in Piran the whole stretch sounds perfect — we barely scratched the surface last time.",
    lean: "up",
    // author_id filled in per-trip from the trip's user_id (the owner)
  },
  {
    fork_id: "fork-piran",
    choice_id: "B",
    body: "Trieste has a great espresso culture — worth the ferry, but we'd need to check the May schedule.",
    lean: null,
    // author_id = same, just a note without a lean verdict
  },
];

async function run() {
  const dbpw = execFileSync(
    "security",
    ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"],
    { encoding: "utf8" }
  ).trim();

  const c = new pg.Client({
    host: "aws-1-us-west-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.fitjkrmiwkdolxhitroc",
    password: dbpw,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  for (const tripId of TRIP_IDS) {
    // ── 1. Fetch the trip's current options + user_id ─────────────────────
    const { rows: tripRows } = await c.query(
      `select options, user_id from trips where id = $1`,
      [tripId]
    );
    if (!tripRows.length) {
      console.log(`Trip ${tripId} not found — skipping.`);
      continue;
    }
    const { options: rawOptions, user_id: ownerId } = tripRows[0];
    const options = rawOptions ?? {};
    const existingForks = options.forks ?? [];

    // ── 2. Merge fork (idempotent — skip if already present by id) ────────
    const alreadyHasFork = existingForks.some((f) => f.id === FORK.id);
    if (alreadyHasFork) {
      console.log(`Trip ${tripId}: fork '${FORK.id}' already present — skipping fork write.`);
    } else {
      const merged = { ...options, forks: [...existingForks, FORK] };
      await c.query(`update trips set options = $1, updated_at = now() where id = $2`, [
        JSON.stringify(merged),
        tripId,
      ]);
      console.log(`Trip ${tripId}: merged fork '${FORK.id}'.`);
    }

    // ── 3. Seed example comments (idempotent by trip_id + fork_id + body) ─
    for (const cmt of SEED_COMMENTS) {
      const { rows: existing } = await c.query(
        `select id from trip_fork_comments where trip_id = $1 and fork_id = $2 and body = $3 limit 1`,
        [tripId, cmt.fork_id, cmt.body]
      );
      if (existing.length) {
        console.log(`Trip ${tripId}: comment already present — skipping.`);
        continue;
      }
      await c.query(
        `insert into trip_fork_comments (trip_id, fork_id, choice_id, author_id, body, lean)
         values ($1, $2, $3, $4, $5, $6)`,
        [tripId, cmt.fork_id, cmt.choice_id ?? null, ownerId, cmt.body, cmt.lean ?? null]
      );
      console.log(`Trip ${tripId}: inserted comment re: ${cmt.choice_id ?? "general"}.`);
    }
  }

  await c.end();
  console.log("Done.");
}

run().catch((e) => { console.error(e); process.exit(1); });
