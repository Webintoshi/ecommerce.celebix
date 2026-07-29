import { defaultProductMediaHttpHandlers } from "../../../../../../../lib/media-http/default.ts";
type Context = { params: Promise<{ productId: string; mediaId: string }> };
export async function PATCH(request: Request, context: Context) { const params = await context.params; return defaultProductMediaHttpHandlers.updateAlt(request, params.productId, params.mediaId); }
