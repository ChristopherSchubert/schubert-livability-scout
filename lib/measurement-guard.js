// Measurement is LOCAL-ONLY (CLAUDE.md: "Production never measures"). The
// /api/measure route refuses to run when this returns false, so a deployed
// Vercel instance can't burn the metered Census/Walk Score/climate budget or
// merge partial, mixed-source metrics over the real measured values. Pure +
// importable so the policy is unit-tested without the Next route runtime.
export function measurementAllowed(env = process.env.NODE_ENV) {
  return env !== "production";
}
