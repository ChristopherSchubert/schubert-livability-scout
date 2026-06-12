# Security review (#50)

Audit of the live Supabase posture for the Trip Planner + the existing app
(2026-06-11). One real finding (fix written, **awaiting apply**); the rest
checks out.

## RLS posture (audited live)

| Table | RLS | Read | Write |
|---|---|---|---|
| profiles, cities, user_weights | ✅ | scoped | scoped |
| felt_surveys, baseline_ratings | ✅ | own-user | own-user |
| trips | ✅ | any authed (both travelers co-view) | owner only |
| trip_entries | ✅ | any authed | owner only |
| walkthrough_feedback | ✅ | authed read / anon insert (deck) | — |
| **pois, external_cache, nominatim_cache** | ❌ **OFF** | open | **OPEN — anon can write** |

### Finding (MEDIUM-HIGH) — writable shared caches
`pois`, `external_cache`, `nominatim_cache` had **RLS disabled** while `anon`
(the *public* key) and `authenticated` held full
`INSERT/UPDATE/DELETE/TRUNCATE`. Anyone with the publishable key could **poison
or `TRUNCATE` the 18k-row pois cache** — which feeds both the walking-core
measurements and the GatherBucket suggestions. Cache wipe → forced expensive
Google re-fetch; poisoning → corrupted scores/suggestions.

**Fix:** [migration 0018](../supabase/migrations/0018_cache_rls_hardening.sql)
— enable RLS + a `select using (true)` policy (reads stay open; the data is
public place/geocode data). No write policy → anon/authenticated writes are
blocked. The measurement pipeline writes via the `postgres` role (bypasses RLS),
so fetch-pois / measure scripts are unaffected. **Status: ✅ APPLIED to
production 2026-06-12** (owner-approved). Verified: all three cache tables show
`rls=true` with exactly one `SELECT` policy; reads still return (18,390 pois
rows); anon/authenticated writes are now denied (no write policy).

## Other checks — OK

- **Google Places key** — server-side only: `process.env.GOOGLE_PLACES_API_KEY`
  in `/api/places/search` + `lib/place-resolve.js`; the scripts use the Keychain
  key. Never the public key, never sent to the client. ✓ (Key still needs to be
  added to `.env.local`/Vercel for the live picker.)
- **Supabase keys** — the client uses the *publishable* (anon) key
  (`NEXT_PUBLIC_*`), correct; RLS is the gate. The service password is in the
  Keychain, used only by local scripts. ✓
- **Input validation** — API routes parse JSON and coerce types (`String()`,
  `Number()`), bounded `limit`. Place search passes `textQuery` to Google (no
  SQL). ✓
- **trips readable-by-authed** — intentional (Janice + Chris + 2 dev users share
  the workspace). Not multi-tenant; acceptable. Revisit if real external users
  are ever added.

## Follow-ups
- ~~Apply 0018~~ ✅ applied 2026-06-12.
- Add a periodic re-fetch guard so a (now-blocked) bad write can't silently
  persist.
- Consider revoking the unused `TRUNCATE`/`REFERENCES` grants on the caches as
  defence-in-depth (RLS already blocks them).
