import { redirect } from "next/navigation";

export default async function LegacyCityDecisionPage({ params }) {
  const { slug } = await params;
  redirect(`/cities/${slug}/decide`);
}
