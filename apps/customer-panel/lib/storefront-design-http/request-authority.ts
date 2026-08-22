import { hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";

const METHODS = Object.freeze(["GET", "PATCH", "POST"] as const);

export type StorefrontDesignRequestDecision = "approved" | "method_not_allowed" | "origin_denied" | "invalid_input";

export function approvedStorefrontMutationOrigin(request: Request, panelOrigin: string): boolean {
  return hasApprovedPanelMutationOriginShape(request, panelOrigin);
}

export function validateStorefrontDesignRequest(
  request: Request,
  input: Readonly<{ method: (typeof METHODS)[number]; pathname: string; panelOrigin: string }>,
): StorefrontDesignRequestDecision {
  if (!METHODS.includes(request.method as never) || request.method !== input.method) return "method_not_allowed";
  if (input.method !== "GET" && !approvedStorefrontMutationOrigin(request, input.panelOrigin)) return "origin_denied";
  try {
    const url = new URL(request.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== input.pathname || url.search || url.hash) return "invalid_input";
  } catch { return "invalid_input"; }
  return "approved";
}
