import { StorefrontResolutionError } from "@celebix/saas-storefront-runtime";

import { createStorefrontRequestHandler } from "@/lib/storefront-app.ts";
import { toStorefrontResponse } from "@/lib/response.ts";

// The authority checkpoint deliberately resolves no tenant. Authenticated
// proxy traffic reaches the exact resolver boundary and returns 404; invalid
// proxy authority returns 503 before this resolver runs. Phase 3A4 replaces
// this rejecting adapter with the persisted exact-domain repository.
const handleStorefrontRequest = createStorefrontRequestHandler({
  resolver: {
    async resolveExactHostname() {
      return new StorefrontResolutionError("host_not_found");
    },
  },
  async loadStorefrontStore() {
    return null;
  },
});

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const result = await handleStorefrontRequest({
    headers: request.headers,
    pathname: url.pathname,
    requestId: crypto.randomUUID(),
  });

  return toStorefrontResponse(result);
}
