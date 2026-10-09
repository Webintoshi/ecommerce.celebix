import { parseOrderBumpPublicOffers } from "@celebix/saas-contracts";
import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import type { OrderBumpRuntime } from "./runtime.ts";

type Dependencies = Readonly<{ selectAuthority(headers: Headers): TrustedStorefrontHostAuthority; resolveRuntime(): Promise<OrderBumpRuntime | null> }>;
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }

export function createOrderBumpGet(dependencies: Dependencies) {
  return async function GET(request: Request): Promise<Response> {
    let selected: TrustedStorefrontHostAuthority;
    try { selected = dependencies.selectAuthority(request.headers); } catch { return json({ code: "unavailable" }, 503); }
    if (selected.kind !== "trusted") return json({ code: "unavailable" }, 503);
    let url: URL;
    try { url = new URL(request.url); } catch { return json({ code: "invalid_input" }, 400); }
    const placement = url.searchParams.get("placement");
    if (request.method !== "GET" || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/api/order-bumps" || url.hash || [...url.searchParams].length !== 1 || !["side_cart", "checkout"].includes(placement ?? "")) return json({ code: "invalid_input" }, 400);
    for (const name of request.headers.keys()) if (name === "authorization" || ["x-store-id", "x-tenant-id", "x-principal-id", "x-customer-id"].includes(name) || name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy") return json({ code: "invalid_input" }, 400);
    try {
      const runtime = await dependencies.resolveRuntime();
      if (!runtime) return json({ code: "unavailable" }, 503);
      return json(parseOrderBumpPublicOffers(await runtime.offers(selected.hostname, request.headers.get("cookie"), placement as "side_cart" | "checkout")));
    } catch { return json({ code: "unavailable" }, 503); }
  };
}
