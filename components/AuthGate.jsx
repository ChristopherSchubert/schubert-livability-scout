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
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setSent(true);
    } catch (e2) {
      setErr(e2.message || "Could not send the link.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-card">
        <span className="auth-eyebrow">Schubert Atlas</span>
        <h1 className="auth-title">Check your <em>email</em></h1>
        <p className="auth-muted">A sign-in link is on its way to <strong>{email}</strong>. Open it on this device to sign in. You’ll stay signed in afterward.</p>
        <button type="button" className="auth-ghost" onClick={() => setSent(false)}>Use a different email</button>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={send}>
      <span className="auth-eyebrow">Schubert Atlas</span>
      <h1 className="auth-title">Find your next <em>wonderful</em> place to go.</h1>
      <p className="auth-muted">A tool for finding wonderful places to go and enjoy. Sign in with your email — we’ll send a one-tap link. No password to remember.</p>
      <label className="auth-field">
        <span className="auth-field-label">Your email</span>
        <input
          type="email" required autoFocus
          className="auth-input"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {err ? <p className="auth-err">{err}</p> : null}
      <button type="submit" className="auth-primary" disabled={busy || !email.trim()}>
        {busy ? "Sending…" : "Send me a link →"}
      </button>
      {process.env.NODE_ENV !== "production" ? (
        <button type="button" className="auth-ghost" onClick={devSignIn}>Dev sign-in (localhost only)</button>
      ) : null}
    </form>
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
