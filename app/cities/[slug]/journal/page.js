import JournalRoute from "../../../../components/JournalRoute";

export default async function CityJournalPage({ params }) {
  const { slug } = await params;
  return <JournalRoute slug={slug} />;
}
