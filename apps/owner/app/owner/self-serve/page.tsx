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
          <h1>Self-serve Basvurular</h1>
          <p>Kontrollu self-serve akisiyle gelen magaza taleplerini production provisioning baslatmadan incele.</p>
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
