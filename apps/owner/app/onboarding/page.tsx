import { headers } from "next/headers";
import { SelfServeOnboardingForm } from "@/components/self-serve/SelfServeOnboardingForm";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { readSelfServeSessionFromHeaders } from "@/lib/self-serve-logto";

export default async function OnboardingPage() {
  const requestHeaders = await headers();
  const flags = getSelfServeFeatureFlags();
  const applicantSession = readSelfServeSessionFromHeaders(requestHeaders);

  return (
    <main className="self-serve-public-page">
      <SelfServeOnboardingForm flags={flags} applicantSession={applicantSession} />
    </main>
  );
}
