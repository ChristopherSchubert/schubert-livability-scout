"use client";

/**
 * Shared pre-hydration placeholder.
 *
 * PlannerProvider boots with `cities: []` and flips `hydrated` true only after
 * the Supabase load resolves. Every list page must render this (not its
 * "nothing here yet" empty state) while `!hydrated`, otherwise the page flashes
 * a false "no cities match" before the data arrives. Reuses the workspace-empty
 * card so the swap to real content (or a real empty state) doesn't jump.
 */
export function WorkspaceLoading({ label = "Loading…" }) {
  return (
    <section className="workspace-empty" aria-busy="true" role="status">
      <p>{label}</p>
    </section>
  );
}
