#!/usr/bin/env node
// PROOF: the Gather candidate pool is sourced from REAL cached data, and it
// surfaces the exact places Janice's plan chose (Pizzeria Rustika, Old Cellar
// Bled) — not hand entry. Queries the pois cache near Bled, runs lib/sourcing.js.

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { buildPool } from "../lib/sourcing.js";

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();

const bled = (await c.query("select lat, lon from cities where name ilike '%bled, slov%'")).rows[0];
const origin = { lat: bled.lat, lon: bled.lon };
// Box query ~±3 km, then sourcing ranks/categorises.
const raw = (await c.query(
  "select place_id, name, lat, lon, primary_type, rating, user_rating_count, price_level, formatted_address from pois where lat between $1 and $2 and lon between $3 and $4",
  [bled.lat - 0.03, bled.lat + 0.03, bled.lon - 0.045, bled.lon + 0.045]
)).rows;

const pool = buildPool(raw, { origin });
console.log(`\nSourced ${pool.length} candidates from the pois cache near Bled (${bled.lat}, ${bled.lon}).\n`);

const byCat = {};
for (const p of pool) (byCat[p.category] ||= []).push(p);
for (const cat of Object.keys(byCat)) {
  console.log(`── ${cat} (${byCat[cat].length}) ──`);
  for (const p of byCat[cat].slice(0, 4)) {
    const mk = p.markers.map((m) => m.value).join(" ");
    console.log(`   ${String(p.score).padStart(5)} · ${p.name} · ★${p.rating ?? "—"} (${p.ratingCount ?? 0}) ${mk} · ${p.distanceKm}km · kind=${p.kind}`);
  }
}

// The anti-vibes check: did the pool surface the real choices?
const wanted = ["Pizzeria Rustika", "Old Cellar Bled", "Bled Castle"];
console.log("\n── Did Gather surface Janice's actual picks? ──");
for (const w of wanted) {
  const hit = pool.find((p) => p.name.toLowerCase().includes(w.toLowerCase().split(" (")[0]));
  console.log(`   ${hit ? "✓" : "✗"} ${w}` + (hit ? ` — ranked #${pool.indexOf(hit) + 1}/${pool.length}, score ${hit.score}` : " — NOT in cache"));
}
console.log("\nNote: attribute markers (dog/veg/kid/patio) are absent by design — not cached;");
console.log("they need the FIELD_MASK re-fetch (systems §2). Never guessed.");

await c.end();
