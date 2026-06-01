import { NextResponse } from "next/server";
import { saveImageToStorage } from "../../../../lib/image-manifest";

// Saves a chosen hero to Supabase Storage and returns its public URL. The
// client sends the user's access token (Authorization: Bearer …) so the
// upload runs under storage RLS as that user.
export async function POST(request) {
  try {
    const body = await request.json();
    const auth = request.headers.get("authorization") || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const slug = body.slug || (body.folder || "").split("/")[1]; // back-compat: cities/<slug>/hero
    const result = await saveImageToStorage({ slug, candidate: body.candidate, accessToken });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Save failed" }, { status: 500 });
  }
}
