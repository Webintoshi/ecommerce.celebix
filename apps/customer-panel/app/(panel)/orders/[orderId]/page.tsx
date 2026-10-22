import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { OrderDetailConsole, type OrderUiCapabilities } from "@/components/orders/OrderDetailConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const [{ orderId }, access] = await Promise.all([params, requireServerPanelAccess()]);
  const role = access.tenantContext.membership.role;
  const cashierOrders = role === "cashier" && access.ordersAccess?.canManageOrders === true;
  const capabilities: OrderUiCapabilities = Object.freeze({
    providerShipping: isMerchantActionAllowed(role, "shipping.manage"),
    delete: isMerchantActionAllowed(role, "orders.delete"),
    fulfill: isMerchantActionAllowed(role, "orders.fulfill") || cashierOrders,
    manage: isMerchantActionAllowed(role, "orders.manage") || cashierOrders,
    payment: isMerchantActionAllowed(role, "orders.payment") || cashierOrders,
    shipping: isMerchantActionAllowed(role, "orders.fulfill") || cashierOrders,
    note: isMerchantActionAllowed(role, "orders.note") || cashierOrders,
  });
  return (
    <>
      <OrderDetailConsole orderId={orderId} capabilities={capabilities} />
    </>
  );
}
