import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { CustomerDetailConsole } from "@/components/customers/CustomerDetailConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const [{ customerId }, access] = await Promise.all([
    params,
    requireServerPanelAccess(),
  ]);
  const role = access.tenantContext.membership.role;
  return (
    <CustomerDetailConsole
      customerId={customerId}
      canManage={isMerchantActionAllowed(role, "customers.manage")}
      canArchive={isMerchantActionAllowed(role, "customers.archive")}
    />
  );
}
