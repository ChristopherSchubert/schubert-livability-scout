import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// LOCAL-ONLY dev sign-in. Hard-disabled in production and when the dev creds
// aren't set (they live only in .env.local, never on Vercel).
//
// Mints the throwaway dev user's session via the service-role admin API
// (generateLink → verifyOtp) rather than password sign-in, so it keeps working
// with email/password auth disabled project-wide (sign-in is Google-only; #87).
// The secret key is read server-side only and never reaches the client.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production." }, { status: 404 });
  }
  const email = process.env.DEV_LOGIN_EMAIL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!email || !url || !anonKey || !secretKey) {
    return NextResponse.json({ error: "Dev login not configured." }, { status: 404 });
  }

  // 1. Admin-generate a magic-link token for the dev user (a service-role op,
  //    unaffected by the public login toggle).
  const admin = createClient(url, secretKey, { auth: { persistSession: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 401 });

  // 2. Exchange its token_hash for a real session.
  const sb = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
