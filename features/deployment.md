# Deployment

How Livability Scout gets from a `git push` to the live site your wife sees.

## Where it lives

- **Host: Vercel.** Confirmed by the response headers on the live site
  (`server: Vercel`, `x-vercel-id`, `x-vercel-cache`).
- **Production URL: https://schubert-livability-scout.vercel.app**
  (this is also the GitHub repo's `homepage` field, which is how you can
  rediscover it: `curl -s https://api.github.com/repos/ChristopherSchubert/schubert-livability-scout | jq .homepage`).
- **Repo:** `ChristopherSchubert/schubert-livability-scout` (GitHub, public).

## How it deploys

- **Vercel's GitHub integration**, not the CLI. The Vercel project is linked to
  the GitHub repo through the Vercel GitHub App, configured in the Vercel
  dashboard — **not** through any file in the repo. That's why there is no
  `vercel.json`, no `.vercel/` directory, no `.github/workflows/`, and no
  `Dockerfile`. Don't go looking for them; their absence is expected.
- **Auto-deploy on push to `main`.** Every push to `main` triggers a production
  build (`next build`) and deploy. So: **pushing to `main` == deploying.** There
  is no separate deploy step to run. A push typically goes live in ~1–3 minutes.
- Pushes to other branches / PRs get Vercel **preview** deployments at their own
  URLs (standard Vercel behaviour).

## Environment variables

- Live env vars are set in the **Vercel dashboard** (Project → Settings →
  Environment Variables), NOT in the repo. `.env.local` is gitignored and only
  drives local dev. The contract is in `.env.local.example`:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `UNSPLASH_ACCESS_KEY`, `CENSUS_API_KEY`, `WALKSCORE_API_KEY`,
  `DEV_LOGIN_EMAIL`, `DEV_LOGIN_PASSWORD`.
- If you add a new env var, it must be added in **both** places (`.env.local`
  for dev, Vercel dashboard for prod) or the live build/runtime will break.
- `DEV_LOGIN_*` powers the localhost-only `/api/dev-login` auth bypass. The
  endpoint is hard-disabled in production (`NODE_ENV === "production"`), so it's
  inert live even though the vars exist there.

## Auth redirect allowlist (gotcha)

The magic-link sign-in uses `emailRedirectTo: window.location.origin`. For links
sent from production to work, the Supabase project's **Auth → URL Configuration
→ Redirect URLs** must include `https://schubert-livability-scout.vercel.app`
(and `http://localhost:3000` for dev). If sign-in links bounce to an error,
check that allowlist first.

## Checking / operating it

- **Is the latest push live yet?** The served HTML / assets update when the
  build finishes. Quick smell test for "did my CSS/font work ship":
  `curl -s https://schubert-livability-scout.vercel.app | grep -oE 'Fraunces|auth-scene'`
  (the root route is the auth gate, so workspace-page markup won't appear in the
  SSR HTML — it's client-rendered behind auth).
- **"The live site looks unchanged" almost always means** the deploy hasn't
  finished, a stale tab/CDN cache is showing (`x-vercel-cache: HIT`), or the
  change was genuinely subtle. It does **not** mean a deploy step was skipped —
  there is no manual step.
- **Build failures / logs / rollback:** the Vercel dashboard for this project.
  Rolling back = promote a previous deployment in the dashboard (or revert the
  commit and push).

## Status

- Live, auto-deploying from `main`. No CI gating the deploy — `next build` on
  Vercel is the only check. (A pre-deploy lint/test gate is a future-direction
  item once a test suite exists — see `ARCHITECTURE.md` P5.)

## TODOs / future direction

- Add a GitHub Actions check (lint + `next build` + future tests) so a broken
  push is caught before Vercel promotes it.
- Consider a custom domain instead of the `*.vercel.app` URL.
