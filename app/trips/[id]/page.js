import { redirect } from "next/navigation";
// A bare /trips/[id] resolves to its first view — every trip view is its own
// URL (project convention; no in-page tab state).
export default async function TripIndexPage({ params }) {
  const { id } = await params;
  redirect(`/trips/${id}/plan`);
}
