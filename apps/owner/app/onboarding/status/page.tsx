import { SelfServeStatusPanel } from "@/components/self-serve/SelfServeStatusPanel";

interface OnboardingStatusPageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function OnboardingStatusPage({ searchParams }: OnboardingStatusPageProps) {
  const params = await searchParams;

  return (
    <main className="self-serve-public-page">
      <SelfServeStatusPanel requestId={params.id} />
    </main>
  );
}
