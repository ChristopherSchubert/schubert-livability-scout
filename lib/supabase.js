"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Reads public env vars (safe to expose — the
// publishable key is gated by Row-Level Security). Returns a singleton so we
// don't spin up a new client on every render. Required env is validated at
// server boot by lib/env.js (#88); we still check defensively here for the
// SSR/test edge where the validator hasn't run.
let client;

export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
  }
  client = createBrowserClient(url, key);
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
