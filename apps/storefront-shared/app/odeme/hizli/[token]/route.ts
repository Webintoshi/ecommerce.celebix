import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { processPublicQuickOrderTokenRequest } from "@/lib/checkout/public-quick-link.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
});

function denied(status = 404): Response {
  return new Response("Not found", { status, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request, context: Readonly<{ params: Promise<Readonly<{ token: string }>> }>): Promise<Response> {
  const authority = selectTrustedStorefrontHostAuthority(request.headers);
  if (authority.kind !== "trusted") return denied(503);
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (runtime === null) return denied(503);
  const { token } = await context.params;
  const result = await processPublicQuickOrderTokenRequest({
    request,
    routeToken: token,
    trustedHostname: authority.hostname,
    now: new Date(),
    runtime: runtime.checkout,
  });
  if (result.kind === "claimed") {
    return new Response(null, { status: 303, headers: { ...SECURITY_HEADERS, Location: result.location, "Set-Cookie": result.setCookie } });
  }
  if (result.kind === "canonical_redirect") {
    return new Response(null, { status: 308, headers: { ...SECURITY_HEADERS, Location: result.location } });
  }
  return denied(result.status);
}
