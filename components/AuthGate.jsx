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
        <span className="brand-dot" aria-hidden="true" />
        <h1>Check your email</h1>
        <p className="auth-muted">A sign-in link is on its way to <strong>{email}</strong>. Open it on this device and you’re in — and you’ll stay signed in.</p>
        <button type="button" className="auth-ghost" onClick={() => setSent(false)}>Use a different email</button>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={send}>
      <span className="brand-dot" aria-hidden="true" />
      <h1>Livability Scout</h1>
      <p className="auth-muted">Sign in with your email — we’ll send a one-tap link. No password.</p>
      <input
        type="email" required autoFocus
        className="auth-input"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {err ? <p className="auth-err">{err}</p> : null}
      <button type="submit" className="auth-primary" disabled={busy || !email.trim()}>
        {busy ? "Sending…" : "Send me a link"}
      </button>
    </form>
  );
}

function FullScreen({ children }) {
  return <div className="auth-screen">{children}</div>;
}
