#!/usr/bin/env node
// PROOF, not vibes: run the real Solve engine (lib/solve.js) on Janice's actual
// May 19 Bled day, using REAL coordinates from the pois cache, and print the
// generated plan beside her hand-built one. Strips her connectives (travel/free)
// and keeps only the anchors — Solve must re-derive the logistics.

import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { solveDay, travelMinutes } from "../lib/solve.js";

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"]).toString().trim();
const c = new Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", database: "postgres", password: pw, ssl: { rejectUnauthorized: false } });
await c.connect();

// Bled geometry + real POI coords for the day's places.
const bled = (await c.query("select lat, lon from cities where name ilike '%bled, slov%'")).rows[0];
async function poi(nameLike, fallback) {
  const r = await c.query("select name, lat, lon from pois where name ilike $1 order by user_rating_count desc nulls last limit 1", [nameLike]);
  if (r.rows.length) return { name: r.rows[0].name, lat: r.rows[0].lat, lon: r.rows[0].lon, src: "pois" };
  return { ...fallback, src: "fallback~Bled" };
}
const castle = await poi("%Bled Castle%", { lat: bled.lat, lon: bled.lon });
const rustika = await poi("%Pizzeria Rustika%", { lat: bled.lat, lon: bled.lon });
const lodging = { name: "Grand Hotel Toplice", lat: 46.3625, lon: 14.1075 }; // lakefront
const balloonField = { lat: bled.lat + 0.01, lon: bled.lon - 0.02 };        // launch field N of town
const viaFerrata = { lat: 46.3695, lon: 14.1142 };                          // Ljubljanska cesta 1, Bled

// ANCHORS only (the things they came for). Solve adds travel/meal/buffer/free.
const day = {
  date: "2026-05-19",
  lodging,
  dayStart: "05:00",
  dayEnd: "22:00",
  anchors: [
    { id: "balloon", title: "Hot-air balloon (private)", durationMin: 120, location: balloonField, fixedTime: "05:30", kind: "booked" },
    { id: "via", title: "Via Ferrata Hvadnik", durationMin: 90, location: viaFerrata, fixedTime: "16:00", kind: "booked" },
    { id: "castle", title: `${castle.name} (hike + tour)`, durationMin: 120, location: castle, kind: "flexible" },
    { id: "rustika", title: rustika.name, durationMin: 60, location: rustika, kind: "meal" },
  ],
  mealWindows: [{ name: "Lunch", from: "12:00", to: "14:30", durationMin: 60 }],
};

const solved = solveDay(day);

console.log("\n=== INPUT: anchors only (coords from " + castle.src + "/" + rustika.src + ") ===");
for (const a of day.anchors) console.log(`  ${a.fixedTime ? a.fixedTime + " FIXED" : "  float "} · ${a.title} (${a.durationMin}m)`);
console.log(`  lodging: ${lodging.name} | balloon→castle est ${travelMinutes(balloonField, castle)}min | castle→viaFerrata est ${travelMinutes(castle, viaFerrata)}min`);

console.log("\n=== SOLVE OUTPUT: the generated day ===");
for (const e of solved.entries) {
  const tag = e.role === "anchor" ? "◆ ANCHOR " : "  ·       ";
  console.log(`  ${e.start}–${e.end}  ${tag} [${e.kind}] ${e.title}`);
}
console.log(`  feasible: ${solved.feasible}` + (solved.flags.length ? ` | flags: ${solved.flags.join(" ")}` : ""));

// Janice's actual day for comparison.
const trip = (await c.query("select entries from trips where name='Slovenia' limit 1")).rows[0];
const actual = (trip.entries || []).filter((e) => e.day === "2026-05-19").sort((a, b) => a.time.start.localeCompare(b.time.start));
console.log("\n=== JANICE'S ACTUAL May 19 (hand-built) ===");
for (const e of actual) console.log(`  ${e.time.start}–${e.time.end}  [${e.kind}] ${e.title}`);

await c.end();
