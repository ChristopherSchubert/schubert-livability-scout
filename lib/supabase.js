"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Reads public env vars (safe to expose — the anon
// key is gated by Row-Level Security). Returns a singleton so we don't spin
// up a new client on every render.
let client;

// Supabase's current convention is the "publishable" key; older projects call
// it the anon key. Accept either env name so the app works regardless.
function publishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = publishableKey();
  if (!url || !key) {
    // Surfaced clearly so a missing-env deploy fails loud, not silent.
    throw new Error("Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
  }
  client = createBrowserClient(url, key);
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publishableKey());
}
