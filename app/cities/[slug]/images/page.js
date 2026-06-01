import ImagesPageRoute from "../../../../components/ImagesPageRoute";

export default async function CityImagesPage({ params }) {
  const { slug } = await params;
  return <ImagesPageRoute slug={slug} />;
}
