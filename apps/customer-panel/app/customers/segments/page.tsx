import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CustomerTaxonomyConsole } from "@/components/customers/CustomerTaxonomyConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CustomerSegmentsPage() {
  const access = await requireServerPanelAccess();
  return (
    <CustomerTaxonomyConsole
      kind="segments"
      canManage={isMerchantActionAllowed(
        access.tenantContext.membership.role,
        "customers.manage",
      )}
    />
  );
}
