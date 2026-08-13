import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CustomerListConsole } from "@/components/customers/CustomerListConsole";
import { CustomerWorkspace } from "@/components/customers/CustomerWorkspace";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CustomersPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "customers.manage");
  return (
    <CustomerWorkspace canManage={canManage}>
      <CustomerListConsole canManage={canManage} embedded />
    </CustomerWorkspace>
  );
}
