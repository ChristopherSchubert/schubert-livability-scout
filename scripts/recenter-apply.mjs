// scripts/recenter-apply.mjs — apply the Tier-1 recenter fixes from the
// pin-placement audit (scripts/recenter-audit.mjs). For each city:
//   1. record the old pin (rollback log: scripts/.recenter-rollback.json)
//   2. move cities.lat/lon to the audited POI-density optimum
//   3. refetch Google POIs around the NEW pin (.fetch-pois.mjs --force)
//   4. re-run ONLY the walking-core measurer (force) → poi_positions + _score
//   5. print confirmed before→after in-plateau capture on fresh data
//
// A sub-1 km pin move is negligible for NOAA/census/terrain, so only
// walking-core is re-run. SF (Noe Valley) deliberately excluded — its pin is
// on the named heart; the "gain" was dense-city weight-chasing.
//
// Usage: node scripts/recenter-apply.mjs            (all 8)
//        node scripts/recenter-apply.mjs --slug jim-thorpe-pa   (one)
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { connect, listCities } from "../lib/measurers/_db.js";
import { pickMeasurers } from "../lib/measurers/_registry.js";
import { runForCity } from "../lib/measurers/_runner.js";

const CANDIDATES = {
  "jim-thorpe-pa":              { lat: 40.86700, lon: -75.73729 },
  "deep-creek-lake-mchenry-md": { lat: 39.56130, lon: -79.36021 },
  "berea-ky":                   { lat: 37.58188, lon: -84.28391 },
  "newport-vt":                 { lat: 44.93892, lon: -72.20598 },
  "sewickley-pa":               { lat: 40.54000, lon: -80.18532 },
  "abingdon-va":                { lat: 36.70827, lon: -81.97312 },
  "litchfield-ct":              { lat: 41.74550, lon: -73.19536 },
  "floyd-va":                   { lat: 36.91244, lon: -80.31536 },
};

const argv = process.argv.slice(2);
const only = argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : null;
const slugs = only ? [only] : Object.keys(CANDIDATES);
const asOf = new Date().toISOString().slice(0, 10);

const PLATEAU_KEYS = ["cafe_score", "bar_score", "rest_score", "daily_needs_score"];
const sumPlateau = (mm) => PLATEAU_KEYS.reduce((s, k) => s + (mm?.[k]?.meta?.in_plateau ?? 0), 0);

const client = await connect();
const walkingCore = pickMeasurers("walking_core");

const rollbackPath = new URL("./.recenter-rollback.json", import.meta.url).pathname;
const rollback = existsSync(rollbackPath) ? JSON.parse(readFileSync(rollbackPath, "utf8")) : {};

for (const slug of slugs) {
  const cand = CANDIDATES[slug];
  if (!cand) { console.error(`! ${slug}: not in candidate list`); continue; }

  // ── before ──
  const { rows: pre } = await client.query(
    "select id, name, lat, lon, measured_metrics, coalesce(jsonb_array_length(poi_positions),0) n from cities where slug=$1", [slug]);
  if (!pre.length) { console.error(`! ${slug}: not found`); continue; }
  const city0 = pre[0];
  const beforePlateau = sumPlateau(city0.measured_metrics);
  const beforeN = city0.n;

  // record rollback (don't clobber an earlier original if re-run)
  if (!rollback[slug]) rollback[slug] = { lat: city0.lat, lon: city0.lon, recordedAt: asOf };

  // ── move pin ──
  await client.query("update cities set lat=$1, lon=$2, geo_source=$3 where id=$4",
    [cand.lat, cand.lon, `recenter-audit ${asOf} (was ${city0.lat},${city0.lon})`, city0.id]);

  // ── refetch POIs around new pin ──
  process.stdout.write(`\n=== ${city0.name}  (${city0.lat},${city0.lon}) → (${cand.lat},${cand.lon})\n  refetching POIs… `);
  try {
    const out = execFileSync("node", ["scripts/.fetch-pois.mjs", "--slug", slug, "--force"], { encoding: "utf8" });
    process.stdout.write(out.trim().split("\n").pop() + "\n");
  } catch (e) { console.error(`  ! fetch failed: ${e.message}`); }

  // ── re-run walking-core ──
  const [city] = await listCities(client, { slug });
  const { results, patch } = await runForCity(client, city, walkingCore, { asOf, force: true });
  const wc = results.find((r) => r.id === "walking_core");
  const afterPlateau = sumPlateau(patch.measuredMetrics);
  const afterN = (patch.columns?.poi_positions || []).length;
  console.log(`  walking-core: ${wc?.status}`);
  console.log(`  in-plateau POIs:  ${beforePlateau} → ${afterPlateau}     total cached: ${beforeN} → ${afterN}`);
  if (wc?.note) console.log(`  ${wc.note}`);
}

writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2));
console.log(`\nrollback log → ${rollbackPath}`);
await client.end();
