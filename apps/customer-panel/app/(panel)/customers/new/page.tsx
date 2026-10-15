import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CustomerFormConsole } from "@/components/customers/CustomerFormConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function NewCustomerPage() {
  const { tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "customers.manage")) {
    return <p role="alert">Bu müşteri işlemi için yetkiniz yok.</p>;
  }
  return <CustomerFormConsole />;
}
