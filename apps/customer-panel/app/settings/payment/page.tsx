import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { PaymentSettingsConsole } from "@/components/settings/payment/PaymentSettingsConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type PaymentSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

function paymentRouteHints(selected: PaymentSearchParams) {
  const keys = Object.keys(selected);
  if (keys.length === 1 && keys[0] === "dialog" && selected.dialog === "provider-catalog") {
    return Object.freeze({ initialDialog: "provider-catalog" as const, initialMethodId: null });
  }
  if (keys.length === 1 && keys[0] === "method" && typeof selected.method === "string" && LOWERCASE_UUID.test(selected.method)) {
    return Object.freeze({ initialDialog: null, initialMethodId: selected.method });
  }
  return Object.freeze({ initialDialog: null, initialMethodId: null });
}

export default async function SettingsPaymentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<PaymentSearchParams> }>) {
  const [access, selected] = await Promise.all([requireServerPanelAccess(), searchParams]);
  const { tenantContext } = access;
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")
    && isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage");
  const hints = paymentRouteHints(selected);
  return <PaymentSettingsConsole
    canManage={canManage}
    storefrontHostname={tenantContext.resolvedHost?.canonicalHostname ?? null}
    initialDialog={hints.initialDialog}
    initialMethodId={hints.initialMethodId}
  />;
}
