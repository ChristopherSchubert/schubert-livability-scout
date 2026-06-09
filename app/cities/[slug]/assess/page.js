import DecideRoute from "../../../../components/DecideRoute";

export default async function CityDecidePage({ params }) {
  const { slug } = await params;
  return <DecideRoute slug={slug} />;
}
