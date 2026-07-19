import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parseStorefrontDataConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS } from "./lib/runtime-config.ts";
import { selectTrustedStorefrontHostAuthority } from "./lib/trusted-host-authority.ts";

const FALLBACK_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";
const SECURITY_HEADERS = Object.freeze({ "cache-control": "private, no-store", "referrer-policy": "strict-origin-when-cross-origin", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains" });

function unavailable(): NextResponse {
  return new NextResponse("Storefront unavailable", { status: 503, headers: { ...SECURITY_HEADERS, "content-security-policy": FALLBACK_CSP, "content-type": "text/plain; charset=utf-8" } });
}

export function proxy(request: NextRequest): NextResponse {
  const authority = selectTrustedStorefrontHostAuthority(request.headers);
  if (authority.kind !== "trusted") return unavailable();
  let mediaOrigin: string;
  try {
    const snapshot = Object.fromEntries(STOREFRONT_DATA_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]));
    mediaOrigin = parseStorefrontDataConfig(snapshot).mediaOrigin;
  } catch { return unavailable(); }
  const nonce = randomBytes(18).toString("base64");
  const requestHeaders = new Headers(request.headers); requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const csp = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${mediaOrigin}; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; connect-src 'none'`;
  response.headers.set("content-security-policy", csp);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

export const config = { matcher: ["/((?!health|_next/static|_next/image|favicon.ico).*)"] };
