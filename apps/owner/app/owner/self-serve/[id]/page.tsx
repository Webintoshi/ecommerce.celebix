import { SelfServeOwnerRequestDetail } from "@/components/self-serve/SelfServeOwnerRequestDetail";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { requireOwnerAuth } from "@/lib/owner-auth";
import { getSelfServeOnboardingRequest } from "@/lib/self-serve-request-store";

export const dynamic = "force-dynamic";

interface OwnerSelfServeRequestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OwnerSelfServeRequestDetailPage({ params }: OwnerSelfServeRequestDetailPageProps) {
  const { id } = await params;
  await requireOwnerAuth(`/owner/self-serve/${id}`);
  const flags = getSelfServeFeatureFlags();
  const request = getSelfServeOnboardingRequest(id);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Self-serve Basvuru Detayi</h1>
          <p>Basvuru bilgilerini incele; Phase 1'de onay/red butonlari production mutation yapmaz.</p>
        </div>
      </div>
      <SelfServeOwnerRequestDetail requestId={id} initialRequest={request} flags={flags} />
    </>
  );
}
