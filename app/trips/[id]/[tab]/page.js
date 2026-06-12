import TripWorkspaceRoute from "../../../../components/TripWorkspaceRoute";

// The trip sub-views, each its own URL (project convention; no in-page tabs).
// Defined here in the server module — importing a plain value from the
// "use client" AppShell turns it into a client-reference proxy, not the array.
const TRIP_TABS = ["plan", "days", "book", "shelf", "grid", "map", "frame"];

export const metadata = { title: "Trip — Schubert Atlas" };

export default async function TripTabPage({ params }) {
  const { id, tab } = await params;
  const activeTab = TRIP_TABS.includes(tab) ? tab : "plan";
  return <TripWorkspaceRoute id={id} activeTab={activeTab} />;
}
