import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// LOCAL-ONLY dev sign-in. Hard-disabled in production and when the dev creds
// aren't set (they live only in .env.local, never on Vercel). Signs in the
// throwaway dev user server-side and returns tokens for the client to adopt.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production." }, { status: 404 });
  }
  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "Dev login not configured." }, { status: 404 });
  }
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
