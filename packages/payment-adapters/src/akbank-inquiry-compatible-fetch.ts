import { AKBANK_JSON_PACKET } from "./providers/akbank/packet.ts";

type ProviderFetch = (request: Request) => Promise<Response>;

const INQUIRY_URLS = new Set([
  ...AKBANK_JSON_PACKET.endpoints.test,
  ...AKBANK_JSON_PACKET.endpoints.live,
]);
const JSON_CONTENT_TYPES = new Set(["application/json", "application/json; charset=utf-8"]);
const MAXIMUM_INQUIRY_BYTES = 4_096;

function canonicalMac(value: string | null): boolean {
  if (value === null || !/^[A-Za-z0-9+/]{86}==$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  try {
    return bytes.byteLength === 64 && bytes.toString("base64") === value;
  } finally { bytes.fill(0); }
}

async function isStatelessInquiry(request: Request): Promise<boolean> {
  if (
    !INQUIRY_URLS.has(request.url) || request.method !== "POST" ||
    request.redirect !== "manual" || request.credentials !== "omit" ||
    request.headers.get("content-type") !== "application/json" ||
    [...request.headers.keys()].length !== 2 ||
    !canonicalMac(request.headers.get("auth-hash")) || request.signal.aborted
  ) return false;
  const bytes = new Uint8Array(MAXIMUM_INQUIRY_BYTES);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.clone().body?.getReader();
    if (reader === undefined) return false;
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (request.signal.aborted || length + part.value.byteLength > bytes.byteLength) return false;
      bytes.set(part.value, length);
      length += part.value.byteLength;
    }
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
    const value: unknown = JSON.parse(source);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const inquiry = value as Record<string, unknown>;
    // Bind this exception to the adapter's compact inquiry serialization. This
    // also excludes duplicate JSON keys without changing the outgoing bytes.
    return JSON.stringify(inquiry) === source && inquiry.version === "1.00" &&
      inquiry.txnCode === "1010" &&
      Object.keys(inquiry).sort().join(",") === "order,randomNumber,requestDateTime,terminal,txnCode,version";
  } catch { return false; } finally {
    bytes.fill(0);
    if (reader !== undefined) {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

/** Discard an unused bank session cookie only for stateless, signed inquiries. */
export function createAkbankInquiryCompatibleFetch(fetch: ProviderFetch): ProviderFetch {
  return async (request) => {
    const inquiry = await isStatelessInquiry(request);
    const response = await fetch(request);
    if (
      !inquiry || response.status !== 200 || response.redirected ||
      response.type === "opaqueredirect" || response.type === "opaque" ||
      response.type === "error" || response.headers.has("location") ||
      !JSON_CONTENT_TYPES.has(response.headers.get("content-type") ?? "") ||
      !canonicalMac(response.headers.get("auth-hash")) ||
      !response.headers.has("set-cookie") || response.headers.has("set-cookie2")
    ) return response;
    const headers = new Headers(response.headers);
    headers.delete("set-cookie");
    // Reuse the untouched stream: the bounded transport and adapter still enforce
    // size, timeout, HMAC, terminal binding and the authenticated response fields.
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
