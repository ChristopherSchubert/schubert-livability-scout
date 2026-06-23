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
  // #91/#101 (epic #84): scope the client to the `travel` schema of the shared
  // schubert-family project, and scope the session cookie to the parent domain
  // so the family session is shared with the hub (true cross-app SSO). Env-driven
  // and matched to the hub: NEXT_PUBLIC_COOKIE_DOMAIN=.schubertfamily.com in prod,
  // unset in dev → host-only cookie on localhost. This MUST match the hub —
  // @supabase/ssr rewrites the auth cookie on every refresh, so a host-only
  // cookie here would shadow and silently drop the shared `.schubertfamily.com`
  // session over time (#101).
  const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
  client = createBrowserClient(url, key, {
    db: { schema: "travel" },
    ...(cookieDomain
      ? { cookieOptions: { domain: cookieDomain, sameSite: "lax", secure: true } }
      : {}),
  });
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
