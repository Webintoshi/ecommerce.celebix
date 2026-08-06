import { handleShippingShipmentAction } from "@/lib/shipping-http/default";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: Readonly<{ params: Promise<Readonly<{ orderId: string; shipmentId: string }>> }>) {
  return handleShippingShipmentAction(request, context, "cancel");
}
