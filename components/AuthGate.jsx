"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

/**
 * AuthGate — magic-link sign-in. Shows the app only when there's a session;
 * otherwise a one-field email form that sends a sign-in link. The session is
 * persisted by Supabase (auto-refreshed), so this only appears the first time
 * on a device or after sign-out.
 */
export default function AuthGate({ children }) {
  const [status, setStatus] = useState("loading"); // loading | out | in
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setStatus("unconfigured"); return; }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setStatus(data.session ? "in" : "out");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
      setStatus(session ? "in" : "out");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (status === "loading") {
    return <FullScreen><p className="auth-muted">Loading…</p></FullScreen>;
  }
  if (status === "unconfigured") {
    return (
      <FullScreen>
        <h1>Setup needed</h1>
        <p className="auth-muted">Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.</p>
      </FullScreen>
    );
  }
  if (status === "out") {
    return <FullScreen><SignIn /></FullScreen>;
  }

  const displayName = user?.user_metadata?.full_name
    || user?.email?.split("@")[0]
    || "you";

  return (
    <AuthContext.Provider value={{ user, userId: user.id, displayName, signOut: () => getSupabase().auth.signOut() }}>
      {children}
    </AuthContext.Provider>
  );
}

function SignIn() {
  const [err, setErr] = useState("");
  const [gbusy, setGbusy] = useState(false);

  // Google OAuth is the only sign-in method (email magic-link is disabled in
  // Supabase). Redirects the whole page to Google; on return to
  // window.location.origin the browser client auto-exchanges the PKCE code and
  // onAuthStateChange flips the gate.
  async function google() {
    setErr(""); setGbusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // On success the page navigates away to Google and this unmounts.
    } catch (e2) {
      setErr(e2.message || "Could not start Google sign-in.");
      setGbusy(false);
    }
  }

  return (
    <div className="auth-card">
      <span className="auth-eyebrow">Schubert Atlas</span>
      <h1 className="auth-title">Find your next <em>wonderful</em> place to go.</h1>
      <p className="auth-muted">A tool for finding wonderful places to go and enjoy. Sign in with Google to pick up where you left off.</p>

      <button type="button" className="auth-google" onClick={google} disabled={gbusy}>
        <GoogleMark />
        <span>{gbusy ? "Connecting…" : "Continue with Google"}</span>
      </button>

      {err ? <p className="auth-err">{err}</p> : null}

      {process.env.NODE_ENV !== "production" ? (
        <button type="button" className="auth-ghost" onClick={devSignIn}>Dev sign-in (localhost only)</button>
      ) : null}
    </div>
  );

  // Local-only: adopt a session minted by the prod-disabled /api/dev-login.
  async function devSignIn() {
    setErr("");
    try {
      const r = await fetch("/api/dev-login", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "dev login unavailable");
      const { error } = await getSupabase().auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
      if (error) throw error;
      // onAuthStateChange in AuthGate flips the gate to "in".
    } catch (e2) {
      setErr(e2.message || "Dev sign-in failed");
    }
  }
}

// Official Google "G" mark, inlined so it stays crisp at 18px and needs no
// asset. The four brand colors are the one spot of non-palette color on the
// card — intentional against the green/cream auth screen.
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

// Two Slovenia heroes — the literal feeling the whole project is chasing.
// Public Supabase Storage URLs (no auth needed to render the gate).
const SCENES = [
  {
    src: "https://fitjkrmiwkdolxhitroc.supabase.co/storage/v1/object/public/city-images/cities/bled-si/6b5c0a37fdc7.jpg",
    place: "Bled",
    region: "Slovenia",
    note: "The lake, the island church, alpine paths from the village.",
  },
  {
    src: "https://fitjkrmiwkdolxhitroc.supabase.co/storage/v1/object/public/city-images/cities/piran-si/575e4232284d.jpg",
    place: "Piran",
    region: "Slovenia",
    note: "Tartini Square, the Punta, a town that stays alive in winter.",
  },
];

// Editorial split: a cinematic Slovenia scene on the left, the sign-in panel on
// the right. On the loading / setup states the panel still centers nicely.
function FullScreen({ children }) {
  // Stable per-load pick so the scene doesn't flicker between renders, but
  // varies visit-to-visit. Date-based so it's deterministic within a session.
  const scene = SCENES[new Date().getDate() % SCENES.length];
  return (
    <div className="auth-screen">
      <aside className="auth-scene" style={{ backgroundImage: `url(${scene.src})` }} aria-hidden="true">
        <div className="auth-scene-grad" />
        <div className="auth-scene-copy">
          <p className="auth-scene-kicker">The benchmark</p>
          <p className="auth-scene-place">{scene.place}<span>, {scene.region}</span></p>
          <p className="auth-scene-note">{scene.note}</p>
        </div>
      </aside>
      <main className="auth-panel">{children}</main>
    </div>
  );
}
