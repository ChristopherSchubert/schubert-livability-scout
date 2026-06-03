#!/usr/bin/env node
// Push lat/lon for the 9 eastern-seaboard additions into Supabase so
// measure-new.mjs picks them up. Coords match the candidate_cities.csv
// pins — approximate core-of-neighborhood from general knowledge.
// After this, run: node measure-new.mjs

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const COORDS = [
  { name: "Old Town Alexandria, VA", lat: 38.8048, lon: -77.0469 },
  { name: "Lewes, DE",               lat: 38.7745, lon: -75.1394 },
  { name: "New Castle, DE",          lat: 39.6620, lon: -75.5660 },
  { name: "Mystic, CT",              lat: 41.3543, lon: -71.9665 },
  { name: "Litchfield, CT",          lat: 41.7475, lon: -73.1900 },
  { name: "Essex, CT",               lat: 41.3540, lon: -72.3915 },
  { name: "Newport, RI",             lat: 41.4870, lon: -71.3120 },
  { name: "Bristol, RI",             lat: 41.6770, lon: -71.2670 },
  { name: "Northampton, MA",         lat: 42.3170, lon: -72.6310 },
];

const env = await loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: authErr } = await sb.auth.signInWithPassword({ email: env.DEV_LOGIN_EMAIL, password: env.DEV_LOGIN_PASSWORD });
if (authErr) { console.error("Sign-in failed:", authErr.message); process.exit(1); }

for (const c of COORDS) {
  const { error, data } = await sb
    .from("cities")
    .update({ lat: c.lat, lon: c.lon, geo_source: "manual: approximate from CSV" })
    .eq("name", c.name)
    .select("name, lat, lon");
  if (error) console.log(`  - ${c.name} FAIL: ${error.message}`);
  else if (!data?.length) console.log(`  - ${c.name} NOT FOUND`);
  else console.log(`  ✓ ${c.name}  ${c.lat}, ${c.lon}`);
}

async function loadEnv() {
  const text = await readFile(".env.local", "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
