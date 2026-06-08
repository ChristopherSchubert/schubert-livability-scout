import WalkingCoreRoute from "../../../../components/WalkingCoreRoute";

export default async function WalkingCorePage({ params }) {
  const { slug } = await params;
  return <WalkingCoreRoute slug={slug} />;
}
