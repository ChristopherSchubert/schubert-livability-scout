#!/usr/bin/env node
// Sign in as the dev user (DEV_LOGIN_EMAIL/PASSWORD from .env.local) and
// print every city in the shared cities table with its hero_image status.
// Prints two grouped lists: HAS HERO, NEEDS HERO.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const env = await loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = env.DEV_LOGIN_EMAIL;
const password = env.DEV_LOGIN_PASSWORD;
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !(secret || anon) || (!secret && (!email || !password))) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD");
  process.exit(2);
}

const sb = createClient(url, secret || anon, { auth: { persistSession: false } });
if (!secret) {
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr) {
    console.error("Sign-in failed:", authErr.message, "(no SUPABASE_SECRET_KEY set)");
    process.exit(1);
  }
}

const { data, error } = await sb.from("cities").select("name, hero_image").order("name");
if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const hasHero = [];
const needsHero = [];
for (const row of data) {
  const v = row.hero_image;
  const real = v && !v.startsWith("commons-search:");
  (real ? hasHero : needsHero).push(row);
}

console.log(`Cities: ${data.length}`);
console.log(`Has hero: ${hasHero.length}`);
console.log(`Needs hero: ${needsHero.length}`);
console.log();
console.log("=== HAS HERO ===");
for (const r of hasHero) console.log(`  ${r.name.padEnd(45)} ${truncate(r.hero_image, 90)}`);
console.log();
console.log("=== NEEDS HERO ===");
for (const r of needsHero) console.log(`  ${r.name}`);

async function loadEnv() {
  const text = await readFile(".env.local", "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
