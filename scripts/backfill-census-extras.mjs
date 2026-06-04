// scripts/backfill-census-extras.mjs — populate owner_occ_pct + pre1940_pct
// across every city, using the same Census ACS endpoint already wired in
// lib/measure.js#measureCensus.
//
// The onboard pipeline doesn't run a Census measurer (it's driven from the
// per-city /api/measure UI button instead), so the existing 75 cities only
// got Census data when someone clicked re-measure on them. This script does
// the same thing for the two new variables across the whole corpus in one
// pass.
//
// Reads CENSUS_API_KEY from .env.local. Throttles to ~1 req/sec to stay
// well under the Census API's documented 500-calls/day limit.
//
// Usage:
//   node scripts/backfill-census-extras.mjs                 # all cities
//   node scripts/backfill-census-extras.mjs --slug newport-ri
//   node scripts/backfill-census-extras.mjs --force         # overwrite

import { readFileSync } from "node:fs";
import { connect } from "../lib/measurers/_db.js";
import { measureCensus } from "../lib/measure.js";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}

function parseArgs(argv) {
  const args = { slug: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") args.slug = argv[++i];
    else if (argv[i] === "--force") args.force = true;
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadEnvLocal();
  const key = process.env.CENSUS_API_KEY;
  if (!key) {
    console.error("CENSUS_API_KEY missing from .env.local");
    process.exit(2);
  }
  const args = parseArgs(process.argv.slice(2));

  const client = await connect();
  try {
    const where = args.slug ? "where slug = $1" : "where lat is not null and lon is not null";
    const params = args.slug ? [args.slug] : [];
    const { rows } = await client.query(
      `select id, name, slug, lat, lon, measured_metrics from cities ${where} order by name`,
      params
    );

    let ok = 0, skipped = 0, errored = 0;
    for (const row of rows) {
      // Keys this script writes. measureCensus produces a superset; we forward
      // only the new tract-derived ones (everything else is already populated
      // via the per-city /api/measure path).
      const NEW_KEYS = ["owner_occ_pct", "pre1940_pct", "median_income_usd", "walk_transit_commute_pct", "price_to_income_ratio"];
      const mm = row.measured_metrics || {};
      const allPresent = NEW_KEYS.every((k) => mm[k] != null);
      if (!args.force && allPresent) {
        console.log(`${row.name.padEnd(36)} · already populated`);
        skipped++; continue;
      }
      if (row.lat == null || row.lon == null) {
        console.log(`${row.name.padEnd(36)} · no lat/lon`);
        skipped++; continue;
      }
      try {
        const { metrics } = await measureCensus(row.lat, row.lon, key, { asOf: new Date().toISOString().slice(0, 10) });
        const patch = {};
        for (const k of NEW_KEYS) if (metrics[k]) patch[k] = metrics[k];
        if (Object.keys(patch).length === 0) {
          console.log(`${row.name.padEnd(36)} ✗ no values returned`);
          errored++; continue;
        }
        await client.query(
          `update cities
             set measured_metrics = coalesce(measured_metrics, '{}'::jsonb) || $1::jsonb
           where id = $2`,
          [JSON.stringify(patch), row.id]
        );
        const ratio = patch.price_to_income_ratio?.value;
        const walk = patch.walk_transit_commute_pct?.value;
        console.log(`${row.name.padEnd(36)} ✓ walk+transit ${walk != null ? walk + "%" : "—"} · p/i ${ratio != null ? ratio + "×" : "—"}`);
        ok++;
      } catch (err) {
        console.log(`${row.name.padEnd(36)} ✗ ${err.message || err}`);
        errored++;
      }
      await sleep(800);
    }
    console.log(`\n${rows.length} cities | ok ${ok} | skipped ${skipped} | errored ${errored}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
