import { redirect } from "next/navigation";

export default async function LegacyCityDecideRedirect({ params }) {
  const { slug } = await params;
  redirect(`/cities/${slug}/assess`);
}
