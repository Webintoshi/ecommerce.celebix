import { handleShippingShipmentLabel } from "@/lib/shipping-http/default";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<Readonly<{ orderId: string; shipmentId: string }>> }>;

export async function GET(request: Request, context: Context) { return handleShippingShipmentLabel(request, context); }
export async function POST(request: Request, context: Context) { return handleShippingShipmentLabel(request, context); }
