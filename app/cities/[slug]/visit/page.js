import VisitPlanRoute from "../../../../components/VisitPlanRoute";

export default async function CityVisitPage({ params }) {
  const { slug } = await params;
  return <VisitPlanRoute slug={slug} />;
}
