import { barcodeLabelHttpHandlers } from "@/lib/barcode-label-http/handler.ts";
type Context = Readonly<{ params: Promise<Readonly<{ jobId: string }>> }>;
export async function GET(request: Request, context: Context) {
  return barcodeLabelHttpHandlers.job(request, (await context.params).jobId);
}
