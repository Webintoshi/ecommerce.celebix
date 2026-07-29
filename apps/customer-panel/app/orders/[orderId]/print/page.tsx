import { OrderPrintView } from "@/components/orders/OrderPrintView";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrderPrintPage({ params }: { params: Promise<{ orderId: string }> }) {
  const [{ orderId }] = await Promise.all([params, requireServerPanelAccess()]);
  return <OrderPrintView orderId={orderId} />;
}
