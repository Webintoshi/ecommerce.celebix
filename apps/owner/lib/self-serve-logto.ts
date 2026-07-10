const OWNER_PRODUCTION_ORIGIN = "https://ecommerce.celebix.co";

function requestOrigin(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.origin === OWNER_PRODUCTION_ORIGIN) return url.origin;
    if (process.env.NODE_ENV !== "production" && url.hostname === "localhost") return url.origin;
  } catch {
    // Fall through to the fixed production origin.
  }
  return OWNER_PRODUCTION_ORIGIN;
}

export function resolveSelfServePublicBaseUrl(request: Request) {
  return new URL(requestOrigin(request));
}

export function buildSelfServeOwnerPublicUrl(request: Request, pathname: string) {
  const safePath = pathname === "/kayit" ? pathname : "/kayit";
  return new URL(safePath, resolveSelfServePublicBaseUrl(request));
}

/**
 * Compatibility helper for the old route. Phase 1 never reads provider config,
 * constructs an authorization URL, or emits self-contained state.
 */
export function buildSelfServeLogtoStartUrl(request: Request, _returnTo: string) {
  const url = buildSelfServeOwnerPublicUrl(request, "/kayit");
  url.searchParams.set("auth", "disabled");
  url.searchParams.set("returnTo", "/kayit");
  return { url, configured: false as const };
}
