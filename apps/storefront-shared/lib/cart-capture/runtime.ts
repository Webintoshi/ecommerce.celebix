import type { PublicAbandonedCartRepository } from "@celebix/saas-data";
import { PublicAbandonedCartRepositoryError } from "@celebix/saas-data";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { createCartCredential, digestCartCredential, readCartCredential, serializeCartCredential } from "./credential.ts";
import { readCartCaptureBody } from "./request.ts";

type Dependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<Readonly<{ abandonedCarts: Pick<PublicAbandonedCartRepository, "capture"> }> | null>;
  randomBytes(size: number): Uint8Array;
  randomUuid(): string;
  now(): Date;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function json(body: unknown, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");
  return Response.json(body, { status, headers: responseHeaders });
}

function privateAuthority(request: Request): boolean {
  for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-store-") || name.startsWith("x-tenant-") || (name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy")) return true;
  return false;
}

export function createCartCaptureRoute(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    let authority: TrustedStorefrontHostAuthority;
    try { authority = dependencies.selectAuthority(request.headers); } catch { return json({ code: "unavailable" }, 503); }
    if (authority.kind !== "trusted") return json({ code: "unavailable" }, 503);
    let url: URL;
    try { url = new URL(request.url); } catch { return json({ code: "invalid_input" }, 400); }
    if (request.method !== "POST" || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/api/cart/capture" || url.search || url.hash || request.headers.get("origin") !== `https://${authority.hostname}` || privateAuthority(request)) return json({ code: request.headers.get("origin") !== `https://${authority.hostname}` ? "origin_denied" : "invalid_input" }, request.headers.get("origin") !== `https://${authority.hostname}` ? 403 : 400);
    const body = await readCartCaptureBody(request); if (body === null) return json({ code: "invalid_input" }, 400);
    const cookie = readCartCredential(request.headers.get("cookie")); if (cookie.kind === "invalid") return json({ code: "invalid_input" }, 400);
    let created: Readonly<{ credential: string; digest: string }> | undefined;
    let recoveredRotation: Readonly<{ credential: string; digest: string }> | undefined;
    let digest: string;
    try {
      if (cookie.kind === "present") {
        digest = digestCartCredential(cookie.credential);
        recoveredRotation = createCartCredential(dependencies.randomBytes);
      } else {
        created = createCartCredential(dependencies.randomBytes);
        digest = created.digest;
      }
    } catch { return json({ code: "unavailable" }, 503); }
    let runtime; let now: Date; let cartId: string;
    try { runtime = await dependencies.resolveRuntime(); now = dependencies.now(); cartId = dependencies.randomUuid(); } catch { return json({ code: "unavailable" }, 503); }
    if (runtime === null || !(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(cartId)) return json({ code: "unavailable" }, 503);
    try {
      const result = await runtime.abandonedCarts.capture({ hostname: authority.hostname, cartId, credentialDigest: digest, now: new Date(now), customer: body.customer, items: body.items });
      const headers = new Headers();
      if (created !== undefined) headers.set("set-cookie", serializeCartCredential(created.credential));
      if (result.status === "recovered" && recoveredRotation !== undefined) headers.set("set-cookie", serializeCartCredential(recoveredRotation.credential));
      return json({ status: result.status, currency: result.currency, totalCents: result.totalCents, itemCount: result.itemCount, version: result.version }, 200, headers);
    } catch (error) {
      if (!(error instanceof PublicAbandonedCartRepositoryError)) return json({ code: "unavailable" }, 503);
      if (error.code === "invalid_input") return json({ code: error.code }, 400);
      if (error.code === "not_found") return json({ code: error.code }, 404);
      if (error.code === "catalog_item_unavailable" || error.code === "invalid_transition") return json({ code: error.code }, 409);
      return json({ code: "unavailable" }, 503);
    }
  };
}
