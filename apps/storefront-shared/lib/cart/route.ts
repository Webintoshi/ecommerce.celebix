import { StorefrontCommerceRepositoryError } from "@celebix/saas-data";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { readCartMutationRequest, readCheckoutRequest } from "./request.ts";
import { StorefrontCommerceRuntimeError, type StorefrontCommerceRuntime } from "./runtime.ts";

type Dependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<Pick<StorefrontCommerceRuntime, "resolveCart" | "mutateCart" | "quote" | "complete"> | null>;
}>;

function json(body: unknown, status: number, headers?: HeadersInit): Response {
  const selected = new Headers(headers);
  selected.set("cache-control", "no-store");
  selected.set("x-content-type-options", "nosniff");
  return Response.json(body, { status, headers: selected });
}
function authority(dependencies: Dependencies, request: Request): Readonly<{ hostname: string; origin: string }> | null {
  try {
    const selected = dependencies.selectAuthority(request.headers);
    return selected.kind === "trusted" ? Object.freeze({ hostname: selected.hostname, origin: `https://${selected.hostname}` }) : null;
  } catch { return null; }
}
function failure(error: unknown): Response {
  const code = error instanceof StorefrontCommerceRepositoryError ? error.code : error instanceof StorefrontCommerceRuntimeError ? error.code : "unavailable";
  if (code === "invalid_input") return json({ code }, 400);
  if (code === "not_found") return json({ code }, 404);
  if (["cart_expired", "version_conflict", "cart_empty", "price_changed", "stock_unavailable", "shipping_unavailable", "payment_unavailable", "operation_mismatch"].includes(code)) return json({ code }, 409);
  return json({ code: "unavailable" }, 503);
}
async function runtime(dependencies: Dependencies) { try { return await dependencies.resolveRuntime(); } catch { return null; } }

export function createCartGetRoute(dependencies: Dependencies) {
  return async function GET(request: Request): Promise<Response> {
    const selected = authority(dependencies, request);
    let url: URL;
    try { url = new URL(request.url); } catch { return json({ code: "invalid_input" }, 400); }
    if (!selected) return json({ code: "unavailable" }, 503);
    if (request.method !== "GET" || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/api/cart" || url.search || url.hash) return json({ code: "invalid_input" }, 400);
    const selectedRuntime = await runtime(dependencies); if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try { return json({ cart: await selectedRuntime.resolveCart(selected.hostname, request.headers.get("cookie")) }, 200); } catch (error) { return failure(error); }
  };
}

export function createCartActionRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return json({ code: "unavailable" }, 503);
    let command;
    try { command = await readCartMutationRequest(request, selected.origin); } catch { return json({ code: "invalid_input" }, 400); }
    const selectedRuntime = await runtime(dependencies); if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try {
      const result = await selectedRuntime.mutateCart(selected.hostname, request.headers.get("cookie"), command);
      const headers = new Headers(); if (result.setCookie) headers.set("set-cookie", result.setCookie);
      return command.kind === "buy_now" ? json({ destination: result.destination }, 200, headers) : json({ cart: result.cart }, 200, headers);
    } catch (error) { return failure(error); }
  };
}

export function createCheckoutQuoteRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return json({ code: "unavailable" }, 503);
    let input; try { input = await readCheckoutRequest(request, selected.origin); } catch { return json({ code: "invalid_input" }, 400); }
    if (input.kind !== "quote") return json({ code: "invalid_input" }, 400);
    const selectedRuntime = await runtime(dependencies); if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try { return json({ quote: await selectedRuntime.quote(selected.hostname, request.headers.get("cookie"), input.intentKind) }, 200); } catch (error) { return failure(error); }
  };
}

export function createCheckoutCompleteRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    const selected = authority(dependencies, request); if (!selected) return json({ code: "unavailable" }, 503);
    let input; try { input = await readCheckoutRequest(request, selected.origin); } catch { return json({ code: "invalid_input" }, 400); }
    if (input.kind !== "complete") return json({ code: "invalid_input" }, 400);
    const selectedRuntime = await runtime(dependencies); if (!selectedRuntime) return json({ code: "unavailable" }, 503);
    try {
      const result = await selectedRuntime.complete(selected.hostname, request.headers.get("cookie"), input);
      const headers = new Headers({ "cache-control": "no-store", location: "/checkout/success", "x-content-type-options": "nosniff" });
      for (const cookie of result.setCookies) headers.append("set-cookie", cookie);
      return new Response(null, { status: 303, headers });
    } catch (error) { return failure(error); }
  };
}
