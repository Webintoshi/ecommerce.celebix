import { headers } from "next/headers";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

function normalizeHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function buildOriginFromHeaders(host: string, proto: string, port: string) {
  if (!host) {
    return "";
  }

  const normalizedProto = proto || (host.includes("localhost") ? "http" : "https");
  const hostIncludesPort = host.includes(":");
  const normalizedPort =
    port && !hostIncludesPort && port !== "80" && port !== "443" ? `:${port}` : "";

  return `${normalizedProto}://${host}${normalizedPort}`;
}

export async function getRequestOrigin() {
  try {
    const requestHeaders = await headers();
    const forwardedHost = normalizeHeaderValue(requestHeaders.get("x-forwarded-host"));
    const host = forwardedHost || normalizeHeaderValue(requestHeaders.get("host"));
    const proto = normalizeHeaderValue(requestHeaders.get("x-forwarded-proto"));
    const port = normalizeHeaderValue(requestHeaders.get("x-forwarded-port"));
    const origin = buildOriginFromHeaders(host, proto, port);

    if (origin) {
      return origin;
    }
  } catch {
    // Fall back to configured runtime site URL.
  }

  return STOREFRONT_RUNTIME.siteUrl;
}

export async function buildAbsoluteRequestUrl(pathname = "/") {
  return new URL(pathname, await getRequestOrigin()).toString();
}
