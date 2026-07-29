import { defaultProductMediaHttpHandlers } from "../../../../../../lib/media-http/default.ts";
type Context = { params: Promise<{ productId: string }> };
export async function GET(request: Request, context: Context) { return defaultProductMediaHttpHandlers.list(request, (await context.params).productId); }
export async function POST(request: Request, context: Context) { return defaultProductMediaHttpHandlers.upload(request, (await context.params).productId); }
