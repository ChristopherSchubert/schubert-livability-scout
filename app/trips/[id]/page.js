import TripDetail from "../../../components/TripDetail";

export default async function TripDetailPage({ params }) {
  const { id } = await params;
  return <TripDetail id={id} />;
}
