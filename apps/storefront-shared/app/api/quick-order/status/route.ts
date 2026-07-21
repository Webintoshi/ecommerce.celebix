import { digestRedemptionCredential, parseRedemptionCookie } from "@/lib/checkout/redemption-cookie.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

const HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
});

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  let url: URL;
  try { url = new URL(request.url); } catch { return response({ kind: "unavailable" }, 404); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password ||
      url.pathname !== "/api/quick-order/status" || url.search || url.hash || request.headers.has("authorization") ||
      request.headers.has("content-length") || request.headers.has("transfer-encoding")) {
    return response({ kind: "unavailable" }, 404);
  }
  const authority = selectTrustedStorefrontHostAuthority(request.headers);
  const cookie = parseRedemptionCookie(request.headers.get("cookie"));
  if (authority.kind !== "trusted" || cookie.kind !== "valid") return response({ kind: "unavailable" }, 404);
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (runtime === null) return response({ kind: "unavailable" }, 503);
  try {
    const state = await runtime.checkout.quickOrderRepository.getStatus({
      hostname: authority.hostname,
      redemptionDigest: digestRedemptionCredential(cookie.credential),
      now: new Date(),
    });
    return response(state, 200);
  } catch {
    return response({ kind: "unavailable" }, 404);
  }
}
