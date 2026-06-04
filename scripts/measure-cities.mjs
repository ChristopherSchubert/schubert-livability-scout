// scripts/measure-cities.mjs — one-time bulk re-measure across the candidate
// list. The live app calls /api/measure for individual cities (which uses
// the same lib/measure routine), so this script is only needed for migration
// after a policy change (e.g. broader stay-zone boundaries).
//
// What it does, per city:
//   1. Ensures the stay-zone boundary is present (lazy-fetches if missing
//      via the Census Place → OSM → Tract → NRHP fallback chain in lib).
//   2. Calls measureAround(pin, { boundary }) — measureAround picks the
//      densest 700 m cluster INSIDE the boundary and measures there. The
//      saved pin is NOT moved; only the score reflects the adaptive center.
//   3. Writes back measured_metrics, measured, measured_at, boundary
//      metadata (if newly fetched), and geo_source.
//
// Usage:
//   node scripts/measure-cities.mjs
//   node scripts/measure-cities.mjs --only=Newport
import pg from "pg";
import { execFileSync } from "node:child_process";
import { fetchStayZoneBoundary, measureAround } from "../lib/measure.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbpw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"], { encoding: "utf8" }).trim();
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);

const c = new pg.Client({
  host: "aws-1-us-west-2.pooler.supabase.com",
  port: 5432,
  user: "postgres.fitjkrmiwkdolxhitroc",
  password: dbpw,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query("select id, name, stay_zone, stay_zone_boundary, boundary_source, lat, lon from cities where lat is not null and lon is not null order by name");
const cities = ONLY ? rows.filter((r) => r.name.toLowerCase().includes(ONLY.toLowerCase())) : rows;
const asOf = new Date().toISOString().slice(0, 10);
console.log(`re-measuring ${cities.length} cities\n`);

let n = 0;
for (const city of cities) {
  n++;
  process.stdout.write(`[${n}/${cities.length}] ${city.name} … `);
  const anchor = { lat: city.lat, lon: city.lon };

  // Ensure boundary. Reuse the saved one if present; otherwise fetch + persist.
  let boundary = city.stay_zone_boundary || null;
  let boundarySource = city.boundary_source || null;
  if (!boundary) {
    const r = await fetchStayZoneBoundary(city.stay_zone, city.name, anchor);
    if (r) {
      boundary = r.poly;
      boundarySource = r.source;
      await c.query(
        "update cities set stay_zone_boundary=$1, boundary_source=$2, boundary_set_at=$3 where id=$4",
        [boundary, boundarySource, asOf, city.id],
      );
      process.stdout.write(`[fetched boundary: ${boundarySource}] `);
    }
  }

  try {
    const { raw, metrics, measured, drift, clusterN } = await measureAround(anchor.lat, anchor.lon, { asOf, boundary });
    const geoSource = boundary
      ? `best 700 m inside stay zone (${clusterN ?? "?"} POIs, ${drift ?? 0} m from pin)`
      : null;
    // No `measured` column write — the live runtime recomputes the composite
    // from measured_metrics at render time via weightedAxisScore. A stored
    // scalar would just go stale.
    if (geoSource) {
      await c.query(
        "update cities set measured_metrics = measured_metrics || $1::jsonb, measured_at = $2, geo_source = $3 where id = $4",
        [JSON.stringify(metrics), asOf, geoSource, city.id],
      );
    } else {
      await c.query(
        "update cities set measured_metrics = measured_metrics || $1::jsonb, measured_at = $2 where id = $3",
        [JSON.stringify(metrics), asOf, city.id],
      );
    }
    const social = (raw.cafe_n || 0) + (raw.rest_n || 0) + (raw.bar_n || 0);
    const flag = social === 0 ? "  ⚠ ZERO social POIs — review the pin" : "";
    console.log(`✓ ${measured ?? "?"} · café ${raw.cafe_n ?? "?"} rest ${raw.rest_n ?? "?"} bar ${raw.bar_n ?? "?"} · drift ${drift ?? 0} m${flag}`);
  } catch (e) {
    console.log(`! ${e.message}`);
  }
  // Be polite to OSM/Overpass.
  await sleep(1200);
}
await c.end();
console.log("\ndone.");
