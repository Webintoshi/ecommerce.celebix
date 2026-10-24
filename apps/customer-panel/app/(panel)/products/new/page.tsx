import { hasCommercialCapability } from '@celebix/saas-contracts';
import { isCatalogProductOperationAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { ProductCreateForm } from "@/components/catalog/ProductCreateForm";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewProductPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<{ mode?: string; kind?: string }>> }>) {
  const [query, { tenantContext }] = await Promise.all([searchParams, requireServerPanelAccess()]);
  if (!isCatalogProductOperationAllowed(tenantContext.membership.role, "create")) redirect("/unauthorized");
  const mode = query.mode === "advanced" ? "advanced" : query.mode === "quick" ? "quick" : "choose";
  const initialProductKind = query.kind === "simple" || query.kind === "variant" ? query.kind : undefined;
  return <ProductCreateForm initialMode={mode} initialProductKind={initialProductKind} aiAvailable={hasCommercialCapability(tenantContext.entitlements, "ai")} />;
}
