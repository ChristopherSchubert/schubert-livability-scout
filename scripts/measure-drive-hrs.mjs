// scripts/measure-drive-hrs.mjs — compute drive_hrs_from_pit for every city
// with lat/lon, using OSRM public (router.project-osrm.org). Origin is PIT
// airport (40.4915, -80.2329). Stores the actual hours as a string for any
// route OSRM returns; stores "FLY" when no route is available (typically
// out-of-country like Bled/Piran/Ljubljana).
//
//   node scripts/measure-drive-hrs.mjs           # measure every city
//   node scripts/measure-drive-hrs.mjs --only Annapolis,Newport
//   node scripts/measure-drive-hrs.mjs --refresh # overwrite existing values
//
// Source: OSRM driving profile (https://github.com/Project-OSRM/osrm-backend).
// Rate-limited to ~1 req/sec to be polite on the shared public instance.

import pg from "pg";
import { execFileSync } from "node:child_process";

const PIT = { lat: 40.4915, lon: -80.2329 };          // Pittsburgh International
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const args = new Set(process.argv.slice(2));
const refresh = args.has("--refresh");
const onlyIdx = process.argv.indexOf("--only");
const onlyList = onlyIdx >= 0
  ? new Set(process.argv[onlyIdx + 1].split(",").map((s) => s.trim().toLowerCase()))
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"], { encoding: "utf8" }).trim();
const c = new pg.Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", password: pw, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(
  "select id, name, lat, lon, drive_hrs_from_pit from cities where lat is not null and lon is not null order by name"
);

let ok = 0, fly = 0, skipped = 0, failed = 0;

for (const city of rows) {
  if (onlyList && !onlyList.has(city.name.toLowerCase().split(",")[0].trim())) continue;
  if (!refresh && city.drive_hrs_from_pit != null) {
    console.log(`· ${city.name.padEnd(28)} keep ${city.drive_hrs_from_pit}`);
    skipped++;
    continue;
  }

  // Anything outside CONUS is fly-only — OSRM will happily "route" across
  // the Atlantic by snapping each endpoint to its nearest road, giving a
  // nonsense duration (Slovenia came back as 28h before this guard).
  const outsideCONUS = city.lat < 24 || city.lat > 50 || city.lon < -125 || city.lon > -66;
  let val = null;
  if (outsideCONUS) {
    val = "FLY";
  } else {
    const url = `${OSRM}/${PIT.lon},${PIT.lat};${city.lon},${city.lat}?overview=false`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "livability-scout/1.0" } });
      const d = await r.json();
      if (d.code === "Ok" && d.routes?.[0]?.duration != null) {
        const hours = d.routes[0].duration / 3600;
        val = (Math.round(hours * 10) / 10).toString();
      } else if (d.code === "NoRoute" || d.code === "InvalidValue") {
        val = "FLY";
      } else {
        console.log(`⚠ ${city.name.padEnd(28)} unexpected: code=${d.code}`);
      }
    } catch (e) {
      console.log(`✗ ${city.name.padEnd(28)} fetch failed: ${e.message}`);
    }
  }

  if (val == null) { failed++; await sleep(1000); continue; }

  await c.query(
    "update cities set drive_hrs_from_pit = $1 where id = $2",
    [val, city.id]
  );
  if (val === "FLY") { fly++; console.log(`✈ ${city.name.padEnd(28)} FLY`); }
  else { ok++; console.log(`✓ ${city.name.padEnd(28)} ${val}h`); }
  await sleep(1000);
}

console.log(`\n${ok} drivable, ${fly} fly, ${skipped} skipped, ${failed} failed`);
await c.end();
