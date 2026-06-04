// lib/measurers/_db.js — Supabase pg client + shared write helper.
//
// One canonical place for the connection details and the city UPDATE shape.
// All measurer scripts go through here so a schema/credential change is a
// single edit, not a sweep across every batch script.

import pg from "pg";
import { execFileSync } from "node:child_process";

// Secrets live in macOS Keychain, never .env.local — see memory note.
// execFileSync (not execSync) — no shell, no injection surface even though
// every argument here is a literal.
function dbPassword() {
  return execFileSync(
    "security",
    ["find-generic-password", "-a", "livability-scout", "-s", "supabase-db-password", "-w"],
    { encoding: "utf8" }
  ).trim();
}

export async function connect() {
  const c = new pg.Client({
    host: "aws-1-us-west-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.fitjkrmiwkdolxhitroc",
    password: dbPassword(),
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
}

// One row per city, with whatever the onboarding pipeline needs.
export async function listCities(client, { slug, limit } = {}) {
  const where = slug ? "where slug = $1" : "";
  const params = slug ? [slug] : [];
  const lim = limit ? `limit ${Number(limit)}` : "";
  const { rows } = await client.query(
    `select id, name, slug, heart_intersection, lat, lon, geo_source,
            measured_metrics, visit_climate, horizon_features,
            blocks, block_geometries
       from cities ${where} order by name ${lim}`,
    params
  );
  return rows;
}

// Merge a patch produced by runMeasurers into the row.
// Patch shape (any subset):
//   { measuredMetrics: {key: envelope, ...}, visitClimate: [...], columns: {col: value} }
// `measured_metrics` is shallow-merged via Postgres `||`. `visit_climate`
// overwrites if present. Top-level columns in `columns` go through verbatim.
export async function writePatch(client, cityId, patch, asOf) {
  const sets = [];
  const params = [];
  const push = (frag, val) => { params.push(val); sets.push(frag.replace("$$", `$${params.length}`)); };

  if (patch.measuredMetrics && Object.keys(patch.measuredMetrics).length) {
    push("measured_metrics = coalesce(measured_metrics, '{}'::jsonb) || $$::jsonb",
         JSON.stringify(patch.measuredMetrics));
  }
  if (patch.visitClimate !== undefined) {
    push("visit_climate = $$::jsonb", patch.visitClimate ? JSON.stringify(patch.visitClimate) : null);
  }
  for (const [col, val] of Object.entries(patch.columns || {})) {
    // column names are author-controlled (measurer code, not user input); safe to interpolate.
    // Auto-cast arrays/objects to JSONB so measurers that produce structured
    // payloads (e.g. block_geometries) don't each have to special-case here.
    if (val !== null && typeof val === "object") {
      push(`${col} = $$::jsonb`, JSON.stringify(val));
    } else {
      push(`${col} = $$`, val);
    }
  }
  if (!sets.length) return false;

  push("measured_at = $$", asOf);
  params.push(cityId);
  await client.query(
    `update cities set ${sets.join(", ")} where id = $${params.length}`,
    params
  );
  return true;
}
