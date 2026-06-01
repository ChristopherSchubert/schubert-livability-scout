import CityDetailRoute from "../../../components/CityDetailRoute";

export default async function CityDetailPage({ params }) {
  const { slug } = await params;
  return <CityDetailRoute slug={slug} />;
}
