import { isCatalogProductOperationAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { ProductCreateForm } from "@/components/catalog/ProductCreateForm";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewProductPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<{ mode?: string }>> }>) {
  const [query, { tenantContext }] = await Promise.all([searchParams, requireServerPanelAccess()]);
  if (!isCatalogProductOperationAllowed(tenantContext.membership.role, "create")) redirect("/unauthorized");
  const mode = query.mode === "advanced" ? "advanced" : "quick";
  return <ProductCreateForm initialMode={mode} />;
}
