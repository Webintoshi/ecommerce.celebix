import { barcodeLabelHttpHandlers } from "@/lib/barcode-label-http/handler.ts";
type Context = Readonly<{ params: Promise<Readonly<{ templateId: string }>> }>;
export async function POST(request: Request, context: Context) {
  return barcodeLabelHttpHandlers.archive(
    request,
    (await context.params).templateId,
  );
}
