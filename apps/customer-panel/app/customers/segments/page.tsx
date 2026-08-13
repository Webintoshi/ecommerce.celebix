import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CustomerTaxonomyConsole } from "@/components/customers/CustomerTaxonomyConsole";
import { CustomerWorkspace } from "@/components/customers/CustomerWorkspace";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CustomerSegmentsPage() {
  const access = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(
    access.tenantContext.membership.role,
    "customers.manage",
  );
  return (
    <CustomerWorkspace canManage={canManage}>
      <CustomerTaxonomyConsole kind="segments" canManage={canManage} embedded />
    </CustomerWorkspace>
  );
}
