import { NextResponse } from "next/server";
import { saveImageSelection } from "../../../../lib/image-manifest";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await saveImageSelection(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Save failed" }, { status: 500 });
  }
}
