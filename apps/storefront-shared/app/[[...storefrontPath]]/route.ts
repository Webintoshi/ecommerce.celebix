import { createStorefrontRequestHandler } from "@/lib/storefront-app.ts";
import { toStorefrontResponse } from "@/lib/response.ts";

// Intentionally unconfigured in Phase 1. A later infrastructure adapter must
// inject an exact StoreDomainResolver and authoritative store loader.
const handleStorefrontRequest = createStorefrontRequestHandler();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const result = await handleStorefrontRequest({
    headers: request.headers,
    pathname: url.pathname,
    requestId: crypto.randomUUID(),
  });

  return toStorefrontResponse(result);
}
