import VisitReviewRoute from "../../../../components/VisitReviewRoute";

export default async function CityAssessPage({ params }) {
  const { slug } = await params;
  return <VisitReviewRoute slug={slug} />;
}
