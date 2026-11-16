import { IYZICO_IFRAME_PACKET } from "./providers/iyzico/packet.ts";

type ProviderFetch = (request: Request) => Promise<Response>;

const LIVE_ENDPOINTS = new Set(IYZICO_IFRAME_PACKET.endpoints.live);
const JSON_CONTENT_TYPES = new Set(["application/json", "application/json; charset=utf-8"]);

function hasIyzicoAuthorization(headers: Headers): boolean {
  const authorization = headers.get("authorization");
  const randomKey = headers.get("x-iyzi-rnd");
  if (
    [...headers.keys()].length !== 3 ||
    headers.get("content-type") !== "application/json" ||
    headers.has("cookie") ||
    randomKey === null || !/^[A-Za-z0-9_-]{16,256}$/.test(randomKey) ||
    authorization === null || authorization.length > 4096 ||
    !/^IYZWSv2 [A-Za-z0-9+/]+={0,2}$/.test(authorization)
  ) return false;

  const encoded = authorization.slice("IYZWSv2 ".length);
  if (encoded.length % 4 !== 0) return false;
  const bytes = Buffer.from(encoded, "base64");
  try {
    if (bytes.toString("base64") !== encoded || bytes.indexOf("apiKey:") !== 0) return false;
    const separator = `&randomKey:${randomKey}&signature:`;
    const keyEnd = bytes.indexOf(separator, "apiKey:".length);
    const keyLength = keyEnd - "apiKey:".length;
    if (keyLength < 1 || keyLength > 256) return false;
    const key = bytes.subarray("apiKey:".length, keyEnd);
    const signature = bytes.subarray(keyEnd + separator.length);
    return key.every(byte => byte >= 0x21 && byte <= 0x7e && byte !== 0x26)
      && signature.length === 64
      && signature.every(byte => (byte >= 0x30 && byte <= 0x39) || (byte >= 0x61 && byte <= 0x66));
  } finally {
    bytes.fill(0);
  }
}

export function createIyzicoCheckoutFormCompatibleFetch(fetch: ProviderFetch): ProviderFetch {
  return async (request) => {
    const eligible = LIVE_ENDPOINTS.has(request.url) && request.method === "POST"
      && request.redirect === "manual" && request.credentials === "omit"
      && !request.signal.aborted && hasIyzicoAuthorization(request.headers);
    const response = await fetch(request);
    if (
      !eligible || response.status !== 200 || response.redirected ||
      response.type === "opaqueredirect" || response.type === "opaque" ||
      response.type === "error" || response.headers.has("location") ||
      !JSON_CONTENT_TYPES.has(response.headers.get("content-type") ?? "") ||
      !response.headers.has("set-cookie") || response.headers.has("set-cookie2")
    ) return response;
    const headers = new Headers(response.headers);
    headers.delete("set-cookie");
    // Keep the original stream for the bounded transport and provider checks.
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
