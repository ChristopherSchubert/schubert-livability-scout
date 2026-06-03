#!/usr/bin/env node
// Upsert the most recently added starterCities (the 9 east-coast additions)
// into the Supabase cities table via the signed-in dev user. Idempotent on
// name. Skips any city that's already present.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { defaultState } from "../lib/planner-data.js";
import { cityToRow } from "../lib/city-row.js";

const TARGET_NAMES = new Set([
  "Old Town Alexandria, VA",
  "Lewes, DE",
  "New Castle, DE",
  "Mystic, CT",
  "Litchfield, CT",
  "Essex, CT",
  "Newport, RI",
  "Bristol, RI",
  "Northampton, MA",
]);

const env = await loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: authErr } = await sb.auth.signInWithPassword({ email: env.DEV_LOGIN_EMAIL, password: env.DEV_LOGIN_PASSWORD });
if (authErr) { console.error("Sign-in failed:", authErr.message); process.exit(1); }

const existing = new Set(((await sb.from("cities").select("name")).data || []).map((r) => r.name));
const cities = defaultState().cities.filter((c) => TARGET_NAMES.has(c.name));
console.log(`Found ${cities.length}/${TARGET_NAMES.size} target cities in starterCities`);

for (const city of cities) {
  if (existing.has(city.name)) {
    console.log(`  - ${city.name}  [skip — already in Supabase]`);
    continue;
  }
  const row = cityToRow(city);
  const { error } = await sb.from("cities").insert(row);
  if (error) console.log(`  - ${city.name}  [FAIL] ${error.message}`);
  else console.log(`  ✓ ${city.name}`);
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
