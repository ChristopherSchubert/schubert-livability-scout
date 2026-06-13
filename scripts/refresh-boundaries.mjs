// scripts/refresh-boundaries.mjs — refresh off-center stay_zone_boundary
// polygons for cities whose pin moved in the 2026-06-08 recenter pass but whose
// approximate boundary did not follow (#6). For each target slug:
//   1. re-fetch a real boundary keyed to the CORRECTED pin via the
//      Census Place → OSM → Tract → NRHP cascade (fetchStayZoneBoundary)
//   2. audit: new source, area, contains-pin, vertex count vs the old polygon
//   3. with --apply: record the old polygon to scripts/.boundary-rollback.json,
//      then UPDATE stay_zone_boundary + boundary_source + boundary_set_at
//
// Audit-only by default (writes nothing). Usage:
//   node scripts/refresh-boundaries.mjs            (audit the 3 targets)
//   node scripts/refresh-boundaries.mjs --apply    (audit + persist)
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import pg from "pg";
import { fetchStayZoneBoundary, polygonAreaKm2, pointInGeoJSON } from "../lib/measure.js";

const TARGETS = ["jim-thorpe-pa", "litchfield-ct", "sewickley-pa"];
const APPLY = process.argv.includes("--apply");
const asOf = new Date().toISOString().slice(0, 10);
const ROLLBACK = "scripts/.boundary-rollback.json";

const vertexCount = (geo) => {
  const rings = geo?.type === "Polygon" ? geo.coordinates
    : geo?.type === "MultiPolygon" ? geo.coordinates.flat() : [];
  return rings.reduce((s, r) => s + (r?.length || 0), 0);
};

const pw = execFileSync("security", ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"], { encoding: "utf8" }).trim();
const c = new pg.Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", password: pw, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(
  "select id, name, slug, lat, lon, stay_zone, stay_zone_boundary, boundary_source from cities where slug = any($1)",
  [TARGETS],
);

const rollback = existsSync(ROLLBACK) ? JSON.parse(readFileSync(ROLLBACK, "utf8")) : {};
console.log(`\n${APPLY ? "APPLY" : "AUDIT (no writes)"} · refreshing ${rows.length} boundaries\n`);

for (const row of rows) {
  const anchor = { lat: row.lat, lon: row.lon };
  const oldPoly = row.stay_zone_boundary;
  const oldContains = oldPoly ? pointInGeoJSON(row.lat, row.lon, oldPoly) : null;
  const oldArea = oldPoly ? polygonAreaKm2(oldPoly).toFixed(3) : "—";

  process.stdout.write(`${row.name} (${row.slug}) … `);
  const r = await fetchStayZoneBoundary(row.stay_zone, row.name, anchor);
  if (!r || !r.poly) { console.log("✗ no boundary found — leaving as-is"); continue; }

  const newContains = pointInGeoJSON(row.lat, row.lon, r.poly);
  const newArea = polygonAreaKm2(r.poly).toFixed(3);
  console.log(`\n   old: ${row.boundary_source || "approx(null)"}  ${oldArea} km²  pin-inside=${oldContains}  (${vertexCount(oldPoly)} pts)`);
  console.log(`   new: ${r.source}  ${newArea} km²  pin-inside=${newContains}  (${vertexCount(r.poly)} pts)`);

  if (!newContains) { console.log("   ⚠ new polygon does NOT contain the pin — skipping (won't apply a worse boundary)"); continue; }

  if (APPLY) {
    if (!(row.slug in rollback)) rollback[row.slug] = { stay_zone_boundary: oldPoly, boundary_source: row.boundary_source, recordedAt: asOf };
    await c.query("update cities set stay_zone_boundary=$1, boundary_source=$2, boundary_set_at=$3 where id=$4", [r.poly, r.source, asOf, row.id]);
    console.log(`   ✓ applied (old polygon saved to ${ROLLBACK})`);
  }
}

if (APPLY) writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2));
await c.end();
console.log(APPLY ? "\nDone." : "\nAudit only — re-run with --apply to persist.\n");
