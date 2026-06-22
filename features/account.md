# Account surface

The signed-in user's account lives in the **top-right account menu** —
`AccountMenu` in [`components/AppShell.jsx`](../components/AppShell.jsx),
shipped under #82. It is the entry point *and*, for v1, the surface itself.

## What it shows

A round avatar trigger (the Google photo via `user_metadata.avatar_url` /
`picture`, or initials on the accent tint as fallback) opens a popover with:

- **Identity** — `displayName` (`user_metadata.full_name`) + email, read-only,
  read straight from the Supabase session via `useAuth()` in
  [`components/AuthGate.jsx`](../components/AuthGate.jsx). Never invented: if a
  field is absent it simply doesn't render.
- **Download backup** — exports the planner state (JSON).
- **Sign out** — `getSupabase().auth.signOut()`. (#82 fixed that there was no
  sign-out anywhere in the app.)

The menu reuses the `backup-menu` structural classes for positioning + the
responsive/scroll-condense chrome; `account-*` classes add the avatar +
identity visuals. Closes on outside-click / Escape.

## Decision: popover, not a route or modal (#83)

#83 imagined a larger "panel/page" the menu opens, with room for display
preferences and account-level info. **Decided 2026-06-22: keep the inline
popover; do not add a dedicated `/account` route or modal yet.** Rationale:

- The concrete v1 needs — see your identity, get out (sign out), grab a backup
  — are all glanceable, single-tap actions that suit a popover. A full page or
  modal for three items would be empty ceremony (YAGNI).
- There are **no real preferences to host yet** (the app has no theme toggle,
  no per-user display settings). A settings surface should arrive *with* its
  first real setting, not before it.

When a genuine preference appears, revisit: the natural next step is a
`/account` route (or a "Settings…" item in this menu opening one), reusing the
same `useAuth()` identity. Likely future tenants: display preferences, and —
once the family-hub identity lands (#84) — canonical profile / baseline-owner
controls.

## Follow-ups

- Identity shown here becomes canonical under **#84** (platform integration);
  v1 deliberately works against today's Supabase/Google auth.
- A dedicated settings route/modal is **deferred** until the first concrete
  preference exists (see decision above).
