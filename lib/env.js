import { z } from "zod";

// Env validator (#88, family platform env/config standard). Runs once at server
// boot via instrumentation.js: a missing/invalid required key throws with the
// offending names — refuse to start rather than 500 mid-request. Adapted from
// finance's src/env.ts so every app in the family uses the same shape.
//
// Server-only by usage (instrumentation.js is the sole importer; Node runtime
// only). The runtime guard below makes the "no client imports" rule explicit
// without depending on `server-only`, which interferes with node:test.
if (typeof window !== "undefined") {
  throw new Error("lib/env.js must not be imported in client code (SUPABASE_SECRET_KEY would be bundled).");
}
//
// Anything OPTIONAL here is genuinely optional at runtime (the dev-login,
// measurement pipeline, hero search, etc. each fail loud on their own when used
// without their secrets). The four REQUIRED keys are the ones the app cannot
// boot without.

const Schema = z.object({
  // ── App ──
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_HUB_URL: z.string().url(),

  // ── Supabase ──
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),

  // ── Integrations (optional; pipelines/routes that need them fail loud on use) ──
  UNSPLASH_ACCESS_KEY: z.string().min(1).optional(),
  CENSUS_API_KEY: z.string().min(1).optional(),
  WALKSCORE_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),

  // ── Local/dev only (the /api/dev-login bypass is hard-disabled in production) ──
  DEV_LOGIN_EMAIL: z.string().email().optional(),
  OVERPASS_URL: z.string().url().optional(),
});

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues
    .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.error(`Invalid environment — refusing to start:\n${lines}`);
  throw new Error(
    "Invalid environment — refusing to start. Set the missing keys in .env.local (dev) or the Vercel project's Environment Variables (prod/preview). See .env.example for the contract.",
  );
}

export const env = parsed.data;
