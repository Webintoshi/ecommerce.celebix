import { SelfServeOwnerRequestsPanel } from "@/components/self-serve/SelfServeOwnerRequestsPanel";
import { getSelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { requireOwnerAuth } from "@/lib/owner-auth";
import { getSelfServeRequestAdapterMode, listSelfServeOnboardingRequests } from "@/lib/self-serve-request-store";

export const dynamic = "force-dynamic";

export default async function OwnerSelfServeRequestsPage() {
  await requireOwnerAuth("/owner/self-serve");
  const flags = getSelfServeFeatureFlags();
  const requests = listSelfServeOnboardingRequests();
  const persistenceMode = getSelfServeRequestAdapterMode();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Self-serve Mağaza Monitörü</h1>
          <p>otomatik mağaza kayıtlarını, paket durumunu, provisioning durumunu ve hata sinyallerini izle.</p>
        </div>
      </div>
      <SelfServeOwnerRequestsPanel
        initialRequests={requests}
        flags={flags}
        persistenceMode={persistenceMode}
      />
    </>
  );
}
