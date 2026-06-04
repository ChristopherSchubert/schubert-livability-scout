// scripts/onboard.mjs — single entrypoint for measuring cities.
//
// Replaces the bespoke measure-*/backfill-* scripts with one runner over the
// measurer registry. Idempotent: by default, a measurer is skipped for a city
// that already has all of its outputs. --force re-runs everything.
//
// Usage:
//   node scripts/onboard.mjs                              # all cities, all measurers (missing only)
//   node scripts/onboard.mjs --slug newport-ri            # one city
//   node scripts/onboard.mjs --measurer climate,water     # selected measurers, all cities
//   node scripts/onboard.mjs --slug newport-ri --force    # one city, refresh everything
//   node scripts/onboard.mjs --dry-run                    # show what would be written
//   node scripts/onboard.mjs --limit 3                    # cap city count (test runs)
//
// To use the local Overpass container instead of the public mirror, run with:
//   OVERPASS_URL=http://localhost:12345/api/interpreter node scripts/onboard.mjs
//
// TODO(local-nominatim): once the local Nominatim container is up, add
// NOMINATIM_URL handling to lib/measure.js#geocodeHeart (and any future
// reverse-geocoding) the same way OVERPASS_URL is wired today.

// Load .env.local so CENSUS_API_KEY, WALKSCORE_API_KEY, UNSPLASH_ACCESS_KEY,
// etc. are visible to the measurers without forcing every invocation to
// re-export them. Mirrors Next.js's auto-load behavior so the API route and
// this script see the same secrets. Existing process.env wins so callers can
// override (e.g. DBPW from Keychain via `DBPW=$(security ...) node ...`).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
{
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] == null) process.env[m[1]] = v;
    }
  }
}

import { connect, listCities } from "../lib/measurers/_db.js";
import { pickMeasurers } from "../lib/measurers/_registry.js";
import { runForCity, formatResultRow } from "../lib/measurers/_runner.js";

function parseArgs(argv) {
  const args = { measurer: "all", slug: null, force: false, dryRun: false, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--measurer") args.measurer = argv[++i];
    else if (a === "--slug") args.slug = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else { console.error(`unknown arg: ${a}`); printHelp(); process.exit(2); }
  }
  return args;
}

function printHelp() {
  console.error(`onboard.mjs — measure cities into Supabase

  --slug <slug>              one city only
  --measurer <id[,id,...]>   subset of measurers (default: all)
  --force                    re-run measurers even if outputs already present
  --dry-run                  run measurers but skip the DB write
  --limit <n>                cap city count (test runs)

  measurers: climate, snowfall, water, osm_context, osm_core, terrain,
             horizon, skyline, admin, blocks, census, walkscore
`);
}

const args = parseArgs(process.argv.slice(2));
const measurers = pickMeasurers(args.measurer);
const asOf = new Date().toISOString().slice(0, 10);

console.log(`# onboard ${asOf} | measurers: ${measurers.map((m) => m.id).join(", ")}` +
  (args.force ? " | --force" : "") + (args.dryRun ? " | --dry-run" : "") +
  (process.env.OVERPASS_URL ? ` | OVERPASS_URL=${process.env.OVERPASS_URL}` : ""));

const client = await connect();
try {
  const cities = await listCities(client, { slug: args.slug, limit: args.limit });
  if (!cities.length) { console.log("no cities matched"); process.exit(0); }
  let ok = 0, skipped = 0, errored = 0;
  for (const city of cities) {
    if (city.lat == null || city.lon == null) {
      console.log(`${city.name.padEnd(36)} — no lat/lon, skipped`);
      continue;
    }
    const { results } = await runForCity(client, city, measurers, {
      asOf, force: args.force, dryRun: args.dryRun,
    });
    console.log(formatResultRow(city, { results }));
    for (const r of results) {
      if (r.status === "ok") ok++;
      else if (r.status === "skipped") skipped++;
      else if (r.status === "error") errored++;
    }
  }
  console.log(`\n${cities.length} cities | ok ${ok} | skipped ${skipped} | errored ${errored}`);
} finally {
  await client.end();
}
