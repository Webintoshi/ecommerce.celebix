import type { ResolvedStoreHost } from "@celebix/saas-contracts";

import { normalizeStoreHostname, type TrustedHostPolicy } from "./host.ts";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function normalizeStorefrontPath(pathname: string): string {
  if (typeof pathname !== "string" || pathname.length === 0) {
    return "/";
  }

  if (
    CONTROL_CHARACTERS.test(pathname) ||
    pathname.includes("\\") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    pathname.includes("://") ||
    pathname.startsWith("//") ||
    !pathname.startsWith("/")
  ) {
    throw new TypeError("Canonical storefront path contains unsafe redirect syntax.");
  }

  const normalizedSegments: string[] = [];
  for (const rawSegment of pathname.split("/")) {
    if (rawSegment.length === 0) {
      continue;
    }

    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(rawSegment);
    } catch {
      throw new TypeError("Canonical storefront path contains invalid encoding.");
    }

    if (decodedSegment === "." || decodedSegment === ".." || decodedSegment.includes("/") || decodedSegment.includes("\\")) {
      throw new TypeError("Canonical storefront path contains traversal syntax.");
    }

    normalizedSegments.push(encodeURIComponent(decodedSegment));
  }

  return normalizedSegments.length === 0 ? "/" : `/${normalizedSegments.join("/")}`;
}

/** Builds a same-store URL from persisted canonical authority only. */
export function buildCanonicalStorefrontUrl(
  resolvedHost: Pick<ResolvedStoreHost, "canonicalHostname">,
  pathname = "/",
  policy: TrustedHostPolicy = {},
): string {
  const canonicalHost = normalizeStoreHostname(resolvedHost.canonicalHostname, policy);
  const protocol = canonicalHost.localTest ? "http" : "https";
  const normalizedPath = normalizeStorefrontPath(pathname);
  return `${protocol}://${canonicalHost.hostname}${normalizedPath}`;
}
