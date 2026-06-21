// Next.js instrumentation: register() runs ONCE at server boot (Node runtime).
// We import lib/env.js for its side effect — the zod parse at module top throws
// on missing/invalid required env, so the server refuses to start rather than
// 500 mid-request (the family platform env/config standard, #88).
//
// Skip the Edge runtime: lib/env.js is `import "server-only"` and not Edge-safe.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env.js");
  }
}
