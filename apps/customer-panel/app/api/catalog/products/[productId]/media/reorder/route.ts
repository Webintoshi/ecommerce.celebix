import { defaultProductMediaHttpHandlers } from "../../../../../../../lib/media-http/default.ts";
type Context = { params: Promise<{ productId: string }> };
export async function POST(request: Request, context: Context) { return defaultProductMediaHttpHandlers.reorder(request, (await context.params).productId); }
