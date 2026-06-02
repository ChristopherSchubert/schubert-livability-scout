// Backfill the elevation-based Setting layers across all cities:
//   • skyline_deg — for any city missing it
//   • horizon_features — visible named peaks + occupancy, for all
// Uses measure.js (which now falls back to opentopodata if Open-Meteo is
// capped). Paced to be gentle on the shared APIs. Run: node scripts/backfill-horizon.mjs
import pg from "pg";
import { execSync } from "node:child_process";
import { measureSkyline, measureHorizonPeaks, composite } from "../lib/measure.js";

const pw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w", { encoding: "utf8" }).trim();
const c = new pg.Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", password: pw, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const today = new Date().toISOString().slice(0, 10);
const { rows } = await c.query("select id,name,lat,lon,measured_metrics mm from cities where lat is not null order by name");

for (const city of rows) {
  const mm = { ...(city.mm || {}) };
  let note = [];

  if (!mm.skyline_deg) {
    let r = null;
    for (let i = 0; i < 2 && !r?.metrics?.skyline_deg; i++) { try { r = await measureSkyline(city.lat, city.lon, { asOf: today }); } catch {} if (!r?.metrics?.skyline_deg) await new Promise((s) => setTimeout(s, 3000)); }
    if (r?.metrics?.skyline_deg) { mm.skyline_deg = r.metrics.skyline_deg; note.push(`skyline ${r.metrics.skyline_deg.value}°`); }
    else note.push("skyline FAILED");
  }

  let horizon = null;
  for (let i = 0; i < 2 && !horizon; i++) { try { horizon = await measureHorizonPeaks(city.lat, city.lon, { asOf: today }); } catch {} if (!horizon) await new Promise((s) => setTimeout(s, 3000)); }
  note.push(horizon ? `${horizon.peaks.length} peaks, ${horizon.occupancyPct}% occ` : "peaks FAILED");

  const raw = {}; for (const [k, v] of Object.entries(mm)) raw[k] = v?.value;
  const measured = composite(raw);
  if (horizon) {
    await c.query("update cities set measured_metrics=$1::jsonb, measured=$2, horizon_features=$3::jsonb where id=$4",
      [JSON.stringify(mm), measured, JSON.stringify(horizon), city.id]);
  } else {
    // peaks failed — update metrics/composite but leave existing horizon_features untouched
    await c.query("update cities set measured_metrics=$1::jsonb, measured=$2 where id=$3",
      [JSON.stringify(mm), measured, city.id]);
  }
  console.log(`✓ ${city.name.padEnd(26)} ${note.join(" · ")}`);
  await new Promise((s) => setTimeout(s, 1500));
}
console.log("BACKFILLDONE");
await c.end();
