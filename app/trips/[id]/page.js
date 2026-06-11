import TripWorkspace from "../../../components/TripWorkspace";
export const metadata = { title: "Trip — Schubert Atlas" };
export default async function TripPage({ params }) {
  const { id } = await params;
  return <TripWorkspace tripId={id} />;
}
