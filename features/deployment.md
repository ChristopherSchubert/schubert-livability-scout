# Deployment

How Livability Scout gets from a `git push` to the live site your wife sees.

## Where it lives

- **Host: Vercel.** Confirmed by the response headers on the live site
  (`server: Vercel`, `x-vercel-id`, `x-vercel-cache`).
- **URLs are being migrated** to a clean `schubert-travel` naming, in two
  stages. Today the app runs on Vercel-assigned `.vercel.app` hosts; once the
  `schubertfamily.com` domain registration completes, the custom domains take
  over. Both keep serving the same deployment through the transition.

  | Role | Today (`.vercel.app`) | Once DNS lands (custom) |
  |---|---|---|
  | **Production** (`main`) | `https://schubert-travel.vercel.app` | `https://travel.schubertfamily.com` |
  | **Preprod** (`preview`) | `https://schubert-travel-preview.vercel.app` | `https://travel-preview.schubertfamily.com` |

  The older `https://schubert-livability-scout.vercel.app` (the GitHub repo's
  `homepage` field) still resolves during the transition; retire it once
  `schubert-travel` is the settled name and update `homepage` to match.
- **Repo:** `ChristopherSchubert/schubert-livability-scout` (GitHub, public).

### Custom domains (pending DNS)

Both custom domains are subdomains of `schubertfamily.com`, whose DNS lives at
the **GoDaddy** registrar (not Vercel). Each is one `CNAME`:

| Type | Name (host) | Value | Vercel → Git Branch |
|---|---|---|---|
| `CNAME` | `travel` | `cname.vercel-dns.com` | `main` (production) |
| `CNAME` | `travel-preview` | `cname.vercel-dns.com` | `preview` |

GoDaddy: enter the **Name** as just `travel` / `travel-preview` (it appends the
zone automatically), no trailing dot on the value, TTL 1 hour or 600s. Add each
domain under Project → Settings → Domains and set its **Git Branch** as above —
that's what pins the preprod domain to the `preview` branch. HTTPS is
auto-provisioned by Vercel once each record validates. Nothing in the repo
configures the domains — like the rest of the Vercel setup, it's dashboard-side.

## How it deploys

- **Vercel's GitHub integration**, not the CLI. The Vercel project is linked to
  the GitHub repo through the Vercel GitHub App, configured in the Vercel
  dashboard — **not** through any file in the repo. That's why there is no
  `vercel.json` and no `.vercel/` directory: the deploy itself is
  dashboard-driven, not file-driven. (There is now one workflow file —
  `.github/workflows/sync-preview.yml` — but it only keeps the `preview` branch
  fast-forwarded to `main`; it does **not** drive deployment. There's still no
  `Dockerfile`.)
- **Auto-deploy on push to `main`.** Every push to `main` triggers a production
  build (`next build`) and deploy. So: **pushing to `main` == deploying.** There
  is no separate deploy step to run. A push typically goes live in ~1–3 minutes.
- Pushes to other branches / PRs get Vercel **preview** deployments at their own
  URLs (standard Vercel behaviour).

## Branching & preprod (`preview`)

The default path is **straight to `main`** — most changes deploy to production
the moment they're pushed. There is one long-lived branch besides `main`:

- **`preview`** — the **preproduction** branch. It exists so a *particularly
  complex or risky* feature can be exercised on a real, stable URL before it
  reaches production. It's pinned in Vercel to a stable preprod host
  (**`https://schubert-travel-preview.vercel.app`** today,
  **`https://travel-preview.schubertfamily.com`** once DNS lands), auto-deployed
  on every push to `preview`.

**`preview` tracks `main` by default.** A GitHub Action
([`.github/workflows/sync-preview.yml`](../.github/workflows/sync-preview.yml))
runs on every push to `main` and **fast-forwards `preview` to match** — so
preprod normally mirrors production with no manual effort. The sync is
**fast-forward-only**: if `preview` has diverged (because you pushed a feature
onto it for testing), the Action detects that and leaves it alone, so the
feature stays deployed to travel-preview until you're done.

**Workflow:**

- *Normal change* → push to `main`. It deploys to prod; the Action
  fast-forwards `preview` so preprod stays in sync. Nothing else to do.
- *Complex feature you want to soak first* → push it onto `preview`
  (`git push origin my-feature:preview`, or merge your feature branch into
  `preview`). Vercel deploys it to the preprod host. Because
  `preview` now leads `main`, the auto-sync skips it. Test there; when happy,
  merge to `main`. Once `main` catches up (preview becomes its ancestor again),
  the next push to `main` resumes auto-fast-forwarding `preview`.

> If `preview` ever gets stuck diverged and you want to slam it back into
> lockstep with `main`: `git push --force-with-lease origin main:preview`.
> `preview` is throwaway preprod, so a forced realign is safe — **never** do
> this to `main`.

### Env vars must be enabled for the Preview environment

Vercel scopes env vars per environment (Production / Preview / Development). For
travel-preview to work, every var the app needs at runtime
(`NEXT_PUBLIC_SUPABASE_*`, etc.) must have **Preview** checked under Project →
Settings → Environment Variables — not just Production. A preview deploy missing
`NEXT_PUBLIC_SUPABASE_*` boots but dies at auth.

> Preprod domain DNS + branch assignment live in the **Custom domains** table
> near the top of this doc. The Supabase redirect-allowlist entries for every
> host are in **Auth redirect allowlist** below.

## Environment variables

- Live env vars are set in the **Vercel dashboard** (Project → Settings →
  Environment Variables), NOT in the repo. `.env.local` is gitignored and only
  drives local dev. The contract is in `.env.local.example`:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `UNSPLASH_ACCESS_KEY`, `CENSUS_API_KEY`, `WALKSCORE_API_KEY`,
  `DEV_LOGIN_EMAIL`, `DEV_LOGIN_PASSWORD`.
- If you add a new env var, it must be added in **both** places (`.env.local`
  for dev, Vercel dashboard for prod) or the live build/runtime will break.
- `DEV_LOGIN_EMAIL` + `SUPABASE_SECRET_KEY` power the localhost-only
  `/api/dev-login` auth bypass — it mints a session for the dev user via the
  service-role admin API (`generateLink` → `verifyOtp`), so it survives
  email/password sign-in being disabled (#87). `DEV_LOGIN_PASSWORD` is now
  unused. The endpoint is hard-disabled in production
  (`NODE_ENV === "production"`), so it's inert live even though the vars exist
  there.

### Secrets: macOS Keychain (local pipeline) vs Vercel (prod runtime)

There are **two** secret stores, and they don't overlap — this trips people up:

- **Local measurement pipeline → macOS Keychain.** The Python/Node measurer
  scripts and `lib/measurers/_db.js` read secrets from the **macOS Keychain**,
  never `.env.local` (the direct Postgres password especially must not be
  committed or sit in a dotfile). Items live under account `livability-scout`:
  - `supabase-db-password` — the Supabase Postgres password (the canonical one;
    `_db.js` pulls it via `execFileSync("security", …)`).
  - `census-api-key`, `walkscore-api-key` — the two measurer API keys.

  Read one with:
  ```bash
  security find-generic-password -a livability-scout -s supabase-db-password -w
  ```
  Scripts that need it expect `DBPW` in the env, so the usual invocation is
  `DBPW=$(security find-generic-password -a livability-scout -s supabase-db-password -w) node scripts/…`
  (already-set env vars win, so a Keychain-sourced override always works).

- **Production runtime (Vercel) → dashboard env vars.** Vercel has **no access
  to your macOS Keychain.** Anything the live app needs at runtime must be a
  Vercel env var. The live Next.js app only uses the public Supabase client
  (`NEXT_PUBLIC_SUPABASE_*`), not the direct pg password — the
  Keychain-backed `_db.js` path is a **local-only** pipeline tool, not part of
  the deployed request path. So a missing Keychain item breaks *your local
  measurement scripts*, not the live site.

The short version: **Keychain = your laptop's pipeline; Vercel dashboard = the
live app.** Don't expect either one to see the other's secrets.

## Auth redirect allowlist (gotcha)

The magic-link sign-in uses `emailRedirectTo: window.location.origin` (so it
adapts to whichever host served the page — no env var pins the URL). For links
to work from every host the app is served from, the Supabase project's **Auth →
URL Configuration** must list them all. Because the URLs are mid-migration, the
allowlist should carry both today's `.vercel.app` hosts and the future custom
domains — Supabase ignores entries that aren't in use, so listing all of them is
safe and means nothing breaks at cutover.

**Site URL:** `https://schubert-travel.vercel.app` today; switch to
`https://travel.schubertfamily.com` once that DNS validates.

**Redirect URLs** allowlist:

- `https://schubert-travel.vercel.app` (production, today)
- `https://schubert-travel-preview.vercel.app` (preprod, today)
- `https://travel.schubertfamily.com` (production, after DNS)
- `https://travel-preview.schubertfamily.com` (preprod, after DNS)
- `https://schubert-livability-scout.vercel.app` (legacy host, until retired)
- `http://localhost:3000` (dev)

If sign-in links bounce to an error, check that allowlist first.

## Checking / operating it

- **Is the latest push live yet?** The served HTML / assets update when the
  build finishes. Quick smell test for "did my CSS/font work ship":
  `curl -s https://schubert-travel.vercel.app | grep -oE 'Fraunces|auth-scene'`
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
- ~~Consider a custom domain instead of the `*.vercel.app` URL.~~ Done:
  `travel.schubertfamily.com` (see Custom domain above).
