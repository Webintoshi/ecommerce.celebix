import type { StoreDomainOriginHealthRepository } from "@celebix/saas-data";
import { StoreDomainRepositoryError } from "@celebix/saas-data";

import { resolveDefaultPublicStorefrontRuntime } from "./default-runtime.ts";
import { selectTrustedStorefrontHostAuthority, type TrustedStorefrontHostAuthority } from "./trusted-host-authority.ts";

const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
});

type Dependencies = Readonly<{
  selectAuthority: (headers: Headers) => TrustedStorefrontHostAuthority;
  resolveRepository: () => Promise<StoreDomainOriginHealthRepository | null>;
  now: () => Date;
}>;

function response(status: 404 | 503, code: "storefront_not_found" | "storefront_unavailable"): Response {
  return Response.json({ code }, { status, headers: SECURITY_HEADERS });
}

const DEFAULT_DEPENDENCIES: Dependencies = Object.freeze({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRepository: async () => (await resolveDefaultPublicStorefrontRuntime())?.domainHealth ?? null,
  now: () => new Date(),
});

export function createStoreDomainOriginHealthRoute(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/health" || url.search !== "" || url.hash !== "") {
      return response(404, "storefront_not_found");
    }
    const authority = dependencies.selectAuthority(request.headers);
    if (authority.kind !== "trusted") return response(404, "storefront_not_found");
    const repository = await dependencies.resolveRepository().catch(() => null);
    if (repository === null) return response(503, "storefront_unavailable");
    try {
      const marker = await repository.get({ hostname: authority.hostname, now: dependencies.now() });
      return Response.json(marker, { status: 200, headers: SECURITY_HEADERS });
    } catch (error) {
      if (error instanceof StoreDomainRepositoryError && error.code === "not_found") {
        return response(404, "storefront_not_found");
      }
      return response(503, "storefront_unavailable");
    }
  };
}

export const storeDomainOriginHealthRoute = createStoreDomainOriginHealthRoute(DEFAULT_DEPENDENCIES);
