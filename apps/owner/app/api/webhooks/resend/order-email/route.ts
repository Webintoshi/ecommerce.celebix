import { getDefaultOrderEmailWebhookHandler } from "@/lib/order-email/webhook-default";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const handler = await getDefaultOrderEmailWebhookHandler();
    return handler(request);
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

