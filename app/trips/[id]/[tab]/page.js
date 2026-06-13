import { redirect } from "next/navigation";
import TripWorkspaceRoute from "../../../../components/TripWorkspaceRoute";

// The trip sub-views, each its own URL (project convention; no in-page tabs).
// Defined here in the server module — importing a plain value from the
// "use client" AppShell turns it into a client-reference proxy, not the array.
const TRIP_TABS = ["plan", "days", "book", "shelf", "grid", "map", "frame", "forks"];

export const metadata = { title: "Trip — Schubert Atlas" };

export default async function TripTabPage({ params }) {
  const { id, tab } = await params;
  // An invalid tab redirects to a canonical URL rather than silently rendering
  // plan under a bad path (which would bookmark/share wrong). #72
  if (!TRIP_TABS.includes(tab)) redirect(`/trips/${id}/plan`);
  return <TripWorkspaceRoute id={id} activeTab={tab} />;
}
