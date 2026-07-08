import { redirect } from "next/navigation";

interface OnboardingStatusPageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function OnboardingStatusPage({ searchParams }: OnboardingStatusPageProps) {
  const params = await searchParams;
  const search = new URLSearchParams({ step: "status" });

  if (params.id) {
    search.set("id", params.id);
  }

  redirect(`/kayit?${search.toString()}`);
}
