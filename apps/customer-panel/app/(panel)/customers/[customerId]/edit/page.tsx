import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CustomerEditConsole } from "@/components/customers/CustomerEditConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CustomerEditPage({ params }: { params: Promise<{ customerId: string }> }) {
  const [{ customerId }, access] = await Promise.all([params, requireServerPanelAccess()]);
  const canManage = isMerchantActionAllowed(access.tenantContext.membership.role, "customers.manage");
  if (!canManage) return <p role="alert">Bu müşteri işlemi için yetkiniz yok.</p>;
  return <CustomerEditConsole customerId={customerId} />;
}
