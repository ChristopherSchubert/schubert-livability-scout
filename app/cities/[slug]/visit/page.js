import { redirect } from "next/navigation";

export default async function LegacyCityVisitRedirect({ params }) {
  const { slug } = await params;
  // #107: the per-city Plan tab was removed (Trip Composer P1) — trip
  // composition now lives in /planning/calendar + /trips. Land legacy /visit
  // bookmarks on the Detail page; "When to visit" is in Chapter V there.
  redirect(`/cities/${slug}`);
}
