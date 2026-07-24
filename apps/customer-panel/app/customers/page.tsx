import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CustomerListConsole } from "@/components/customers/CustomerListConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CustomersPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <CustomerListConsole canManage={isMerchantActionAllowed(tenantContext.membership.role, "customers.manage")} />;
}
