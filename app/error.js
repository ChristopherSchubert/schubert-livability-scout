"use client";

// Global error boundary (#51) — catches render errors in any route so a thrown
// component shows a recovery card, not a blank/white screen. `reset()` re-renders
// the segment. Logged to the console for observability (a real sink is a
// follow-up). Data writes have their own retry path: TripProvider/PlannerProvider
// debounced writers catch failures and surface saveState="error" without
// crashing the tree.
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => { console.error("Route error:", error); }, [error]);
  return (
    <div style={{ maxWidth: 480, margin: "12vh auto", padding: "0 1.2rem", fontFamily: "var(--font-ui, system-ui)", textAlign: "center" }}>
      <h1 style={{ fontFamily: "var(--font-display, Georgia)", fontSize: "1.6rem", marginBottom: ".4rem" }}>Something broke on this page.</h1>
      <p style={{ color: "var(--muted, #777)", fontSize: ".9rem" }}>
        It's been logged. Your saved work is in Supabase — nothing here is lost.
      </p>
      {error?.digest ? <p style={{ color: "var(--muted, #999)", fontSize: ".72rem" }}>ref: {error.digest}</p> : null}
      <div style={{ marginTop: "1.2rem", display: "flex", gap: ".6rem", justifyContent: "center" }}>
        <button onClick={() => reset()} style={{ border: "1px solid var(--accent, #0d4c44)", background: "var(--accent, #0d4c44)", color: "#fff", borderRadius: 100, padding: ".4rem 1.1rem", cursor: "pointer", fontWeight: 600 }}>Try again</button>
        <a href="/trips" style={{ border: "1px solid var(--border, #ccc)", borderRadius: 100, padding: ".4rem 1.1rem", color: "inherit" }}>Back to Trips</a>
      </div>
    </div>
  );
}
