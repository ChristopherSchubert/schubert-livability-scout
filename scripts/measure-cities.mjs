// scripts/measure-cities.mjs — batch driver over the shared measurement
// routine in lib/measure.js. Geocodes/recenters, measures, persists to
// Supabase via the pooler. The actual metric logic lives in lib/measure.js
// so the batch, the /api/measure route, and new-city onboarding all share it.
//
//   node scripts/measure-cities.mjs            # measure around stored/heart points
//   node scripts/measure-cities.mjs --recenter # move each pin to its best visit base first
import pg from "pg";
import { execSync } from "node:child_process";
import { geocodeHeart, findVisitCenter, measureAround } from "../lib/measure.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbpw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w", { encoding: "utf8" }).trim();
const recenter = process.argv.includes("--recenter");

const c = new pg.Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", password: dbpw, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query("select id, name, heart_intersection, lat, lon, geo_source from cities order by name");
const asOf = new Date().toISOString().slice(0, 10);

for (const city of rows) {
  process.stdout.write(`\n${city.name} … `);
  let geo = (city.lat != null && city.lon != null) ? { lat: city.lat, lon: city.lon } : null;
  if (!geo) {
    geo = await geocodeHeart(city.heart_intersection, city.name);
    await sleep(1100);
    if (!geo) { console.log("geocode failed — skipped"); continue; }
  }
  if (recenter && !(city.geo_source || "").startsWith("manual")) {
    const vc = await findVisitCenter(geo.lat, geo.lon);
    await sleep(1200);
    if (vc.moved > 30) {
      geo = { lat: vc.lat, lon: vc.lon };
      await c.query("update cities set lat=$1,lon=$2,geo_source=$3,geocoded_at=$4 where id=$5",
        [geo.lat, geo.lon, `visit center: densest walkable cluster (${vc.n} POIs, moved ${vc.moved}m)`, asOf, city.id]);
      process.stdout.write(`[recentered ${vc.moved}m → ${vc.n} POIs] `);
    }
  } else if (city.lat == null) {
    await c.query("update cities set lat=$1,lon=$2,geo_source=$3,geocoded_at=$4 where id=$5",
      [geo.lat, geo.lon, "Nominatim (heart intersection)", asOf, city.id]);
  }

  const { raw, metrics, measured } = await measureAround(geo.lat, geo.lon, { asOf });
  await sleep(1200);
  await c.query("update cities set measured_metrics = measured_metrics || $1::jsonb, measured = $2, measured_at = $3 where id = $4",
    [JSON.stringify(metrics), measured, asOf, city.id]);
  const social = (raw.cafe_n || 0) + (raw.rest_n || 0) + (raw.bar_n || 0);
  const flag = social === 0 ? "  ⚠ ZERO social POIs — review the pin" : "";
  console.log(`✓ composite ${measured ?? "?"} | café ${raw.cafe_n ?? "?"} rest ${raw.rest_n ?? "?"} bar ${raw.bar_n ?? "?"} | relief ${raw.relief_std_m ?? "?"}m water ${raw.water_dist_m ?? "?"}m${flag}`);
}
await c.end();
console.log("\ndone.");
