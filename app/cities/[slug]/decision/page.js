import { redirect } from "next/navigation";

// Legacy alias → straight to /assess (the old /decision → /decide → /assess
// two-hop chain is collapsed; /decide remains only for its own legacy links). #72
export default async function LegacyCityDecisionPage({ params }) {
  const { slug } = await params;
  redirect(`/cities/${slug}/assess`);
}
