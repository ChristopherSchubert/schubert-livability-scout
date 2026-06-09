import { redirect } from "next/navigation";

export default async function LegacyCityVisitRedirect({ params }) {
  const { slug } = await params;
  redirect(`/cities/${slug}/plan`);
}
