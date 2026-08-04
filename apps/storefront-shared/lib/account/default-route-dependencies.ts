import "server-only";
import { isIP } from "node:net";

import { resolveDefaultPublicStorefrontRuntime } from "../default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";

export const defaultAccountRouteDependencies = Object.freeze({
  selectAuthority: (headers: Headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.identity ?? null,
  resolveBrand: async (hostname: string) => {
    const runtime = await resolveDefaultPublicStorefrontRuntime(); if (!runtime) return null;
    const storefront = await runtime.repository.getPublicStorefront({ hostname, now: new Date() });
    const logo = "logo" in storefront.presentation ? storefront.presentation.logo : undefined;
    return Object.freeze({ storeName: storefront.name, logoUrl: logo?.url ?? null, primaryColor: null });
  },
  requestAuthority: (headers: Headers) => {
    const candidate = headers.get("cf-connecting-ip");
    return candidate && candidate === candidate.trim() && isIP(candidate) ? candidate : "unknown_client";
  },
});
