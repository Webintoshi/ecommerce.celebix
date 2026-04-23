import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type SecuritySurface = "admin" | "owner" | "storefront";

type SecurityHeaders = Record<string, string>;

type SameOriginResult = {
  allowed: boolean;
  reason?: "missing-origin" | "origin-mismatch";
};

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
}

function parseUrl(value: string | null | undefined): URL | null {
  if (!value || !value.trim()) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getAllowedHosts(request: Pick<NextRequest, "headers" | "nextUrl">): Set<string> {
  const hosts = new Set<string>();
  const requestHost = normalizeHost(request.nextUrl.host);
  if (requestHost) {
    hosts.add(requestHost);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    forwardedHost
      .split(",")
      .map((entry) => normalizeHost(entry))
      .filter((entry): entry is string => Boolean(entry))
      .forEach((entry) => hosts.add(entry));
  }

  return hosts;
}

function usesHttps(request: Pick<NextRequest, "headers" | "nextUrl">): boolean {
  if (request.nextUrl.protocol === "https:") {
    return true;
  }

  return request.headers.get("x-forwarded-proto")?.toLowerCase() === "https";
}

function buildContentSecurityPolicy(surface: SecuritySurface): string {
  const formAction = surface === "storefront" ? "form-action 'self' https:;" : "form-action 'self';";
  return ["base-uri 'self';", "frame-ancestors 'none';", "object-src 'none';", formAction]
    .join(" ")
    .trim();
}

function buildSecurityHeaders(
  request: Pick<NextRequest, "headers" | "nextUrl">,
  surface: SecuritySurface,
): SecurityHeaders {
  const headers: SecurityHeaders = {
    "Content-Security-Policy": buildContentSecurityPolicy(surface),
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "off",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
  };

  if (process.env.NODE_ENV === "production" && usesHttps(request)) {
    headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
  }

  return headers;
}

export function applySecurityHeaders<T extends NextResponse>(
  request: Pick<NextRequest, "headers" | "nextUrl">,
  response: T,
  surface: SecuritySurface,
): T {
  const headers = buildSecurityHeaders(request, surface);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

export function isMutationMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

export function validateSameOriginRequest(
  request: Pick<NextRequest, "headers" | "nextUrl">,
): SameOriginResult {
  const allowedHosts = getAllowedHosts(request);
  const originUrl = parseUrl(request.headers.get("origin"));
  const refererUrl = parseUrl(request.headers.get("referer"));
  const candidates = [originUrl, refererUrl].filter((entry): entry is URL => Boolean(entry));

  if (candidates.length === 0) {
    return { allowed: false, reason: "missing-origin" };
  }

  const matches = candidates.some((candidate) => {
    const candidateHost = normalizeHost(candidate.host);
    return candidateHost ? allowedHosts.has(candidateHost) : false;
  });

  return matches ? { allowed: true } : { allowed: false, reason: "origin-mismatch" };
}

export function readInternalApiToken(request: Pick<NextRequest, "headers">): string {
  const explicitToken = request.headers.get("x-celebix-internal-token")?.trim();
  if (explicitToken) {
    return explicitToken;
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

export function hasExpectedInternalApiToken(
  request: Pick<NextRequest, "headers">,
  expectedToken: string | undefined,
): boolean {
  const expected = expectedToken?.trim();
  if (!expected) {
    return false;
  }

  const provided = readInternalApiToken(request);
  return Boolean(provided) && provided === expected;
}

export function sanitizeInternalRedirectPath(
  value: string | null | undefined,
  fallbackPath: string,
): string {
  if (!value || !value.trim()) {
    return fallbackPath;
  }

  const normalized = value.trim();

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallbackPath;
  }

  return normalized;
}
