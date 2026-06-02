// Re-measure skyline (now with 400m rise filter) for all 69 cities, and water
// extent (now with elevation-width detector + MAJOR_RIVERS safety net) for any
// city with water. Recompute composites at the end.
import pg from "pg";
import { execSync } from "node:child_process";
import { measureSkyline, nearestWater, distanceToTarget, composite } from "../lib/measure.js";

const pw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w", { encoding: "utf8" }).trim();
const c = new pg.Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", password: pw, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const today = new Date().toISOString().slice(0, 10);

const { rows } = await c.query("select id, name, lat, lon, water_target wt, measured_metrics mm from cities where lat is not null order by name");
console.log(`Backfilling ${rows.length} cities (skyline + grandeur where applicable)\n`);

for (const city of rows) {
  const mm = { ...(city.mm || {}) };
  const oldSky = mm.skyline_deg?.value;
  const oldExt = mm.water_extent_km2?.value;
  let parts = [];

  // Skyline — every city
  let s = null;
  for (let i = 0; i < 2 && !s?.metrics?.skyline_deg; i++) {
    try { s = await measureSkyline(city.lat, city.lon, { asOf: today }); } catch {}
    if (!s?.metrics?.skyline_deg) await new Promise((r) => setTimeout(r, 3000));
  }
  if (s?.metrics?.skyline_deg) {
    mm.skyline_deg = s.metrics.skyline_deg;
    const v = s.metrics.skyline_deg.value;
    parts.push(`sky ${v}° (was ${oldSky ?? "—"})`);
  } else {
    parts.push(`sky FAILED`);
  }

  // Grandeur — only cities that already have water_extent (so we're updating, not adding)
  if (oldExt != null) {
    let r = null;
    for (let i = 0; i < 2 && (r == null || r.extentKm2 == null); i++) {
      try {
        r = city.wt
          ? await distanceToTarget(city.lat, city.lon, city.wt)
          : await nearestWater(city.lat, city.lon);
      } catch {}
      if (r == null || r.extentKm2 == null) await new Promise((rs) => setTimeout(rs, 3000));
    }
    if (r != null && r.extentKm2 != null) {
      mm.water_extent_km2 = { value: r.extentKm2, asOf: today, source: "OpenStreetMap (Overpass) + elevation-width" };
      parts.push(`grandeur ${r.extentKm2} km² (was ${oldExt})`);
    } else {
      parts.push(`grandeur FAILED`);
    }
  }

  // Recompute composite from updated metrics
  const raw = {}; for (const [k, v] of Object.entries(mm)) raw[k] = v?.value;
  const measured = composite(raw);
  await c.query("update cities set measured_metrics=$1::jsonb, measured=$2 where id=$3", [JSON.stringify(mm), measured, city.id]);
  console.log(`✓ ${city.name.padEnd(30)} ${parts.join(" · ")}`);
  await new Promise((r) => setTimeout(r, 1500));
}
console.log("\nBACKFILLDONE");
await c.end();
