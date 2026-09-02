import { barcodeLabelHttpHandlers } from "@/lib/barcode-label-http/handler.ts";
type Context = Readonly<{ params: Promise<Readonly<{ templateId: string }>> }>;
export async function PATCH(request: Request, context: Context) {
  return barcodeLabelHttpHandlers.template(
    request,
    (await context.params).templateId,
  );
}
