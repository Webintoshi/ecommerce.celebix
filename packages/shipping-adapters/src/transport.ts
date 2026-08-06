import {
  canonicalShippingResponseContentType,
  parseShippingProviderTransportRequest,
  parseShippingRetryAfter,
} from "./validation.ts";

const JSON_LIMIT = 1_048_576;
const SVG_LIMIT = 2_097_152;
const TIMEOUT_MS = 10_000;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export type ShippingProviderTransportRequest = Readonly<{
  origin: "https://basitkargo.com/api";
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  token: string;
  body?: Uint8Array;
  signal: AbortSignal;
}>;

export type ShippingProviderTransportResult =
  | Readonly<{
      kind: "response";
      status: number;
      contentType: "application/json" | "image/svg+xml";
      body: Uint8Array;
      retryAfterSeconds: number | null;
    }>
  | Readonly<{
      kind: "failure";
      code: "network" | "timeout" | "redirect" | "invalid_content_type" | "response_too_large" | "invalid_response";
    }>;

export interface ShippingProviderTransport {
  request(input: ShippingProviderTransportRequest): Promise<ShippingProviderTransportResult>;
}

export type ShippingProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function frozenFailure(code: Extract<ShippingProviderTransportResult, { kind: "failure" }>["code"]): ShippingProviderTransportResult {
  return Object.freeze({ kind: "failure" as const, code });
}

async function readBounded(response: Response, maximum: number): Promise<Uint8Array | null> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength) || Number(contentLength) > maximum) return null;
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } catch {
    return null;
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function createShippingProviderTransport(
  dependencies: Readonly<{ fetch: ShippingProviderFetch }> = { fetch: globalThis.fetch },
): ShippingProviderTransport {
  if (typeof dependencies?.fetch !== "function") throw new TypeError("shipping_transport_invalid");
  return Object.freeze({
    async request(input: ShippingProviderTransportRequest): Promise<ShippingProviderTransportResult> {
      const parsed = parseShippingProviderTransportRequest(input);
      const expectsSvg = parsed.path.startsWith("/label/svg/");
      const tokenBytes = ENCODER.encode(parsed.token);
      const authorization = `Bearer ${DECODER.decode(tokenBytes)}`;
      const requestBody = parsed.body === undefined ? undefined : parsed.body.slice().buffer;
      const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
      const signal = AbortSignal.any([parsed.signal, timeoutSignal]);
      let response: Response;
      try {
        response = await dependencies.fetch(`${parsed.origin}${parsed.path}`, {
          method: parsed.method,
          headers: {
            accept: expectsSvg ? "image/svg+xml" : "application/json",
            authorization,
            ...(parsed.body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(requestBody === undefined ? {} : { body: requestBody }),
          redirect: "manual",
          signal,
        });
      } catch {
        return frozenFailure(signal.aborted ? "timeout" : "network");
      } finally {
        tokenBytes.fill(0);
        parsed.body?.fill(0);
      }
      if (!(response instanceof Response)) return frozenFailure("invalid_response");
      if (response.status >= 300 && response.status <= 399) return frozenFailure("redirect");
      const contentType = canonicalShippingResponseContentType(response.headers.get("content-type"));
      if (contentType === null || (expectsSvg ? contentType !== "image/svg+xml" : contentType !== "application/json")) {
        return frozenFailure("invalid_content_type");
      }
      const body = await readBounded(response, contentType === "image/svg+xml" ? SVG_LIMIT : JSON_LIMIT);
      if (body === null) return frozenFailure("response_too_large");
      return Object.freeze({
        kind: "response" as const,
        status: response.status,
        contentType,
        body,
        retryAfterSeconds: parseShippingRetryAfter(response.headers.get("retry-after")),
      });
    },
  });
}
