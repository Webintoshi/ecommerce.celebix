import { createHash } from "node:crypto";
import {
  FIXED_STOREFRONT_POLICIES,
  isMerchantActionAllowed,
  type StorefrontPolicyKey,
} from "@celebix/saas-contracts";
import { notFound } from "next/navigation";

import { PolicyConsole } from "@/components/content/PolicyConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function EditPolicyPage({ params }: { params: Promise<{ policyKey: string }> }) {
  const { policyKey } = await params;
  const definition = FIXED_STOREFRONT_POLICIES.find(({ key }) => key === policyKey);
  if (!definition) notFound();
  const { session, tenantContext } = await requireServerPanelAccess();
  // Opaque presentation scope for browser-memory drafts; never sent to a policy API.
  const recoveryScope = createHash("sha256").update(JSON.stringify([session.id, tenantContext.principal.id, tenantContext.store.id])).digest("hex");
  return <PolicyConsole key={recoveryScope} recoveryScope={recoveryScope} initialPolicyKey={definition.key as StorefrontPolicyKey} canManage={isMerchantActionAllowed(tenantContext.membership.role, "content.manage")} />;
}
