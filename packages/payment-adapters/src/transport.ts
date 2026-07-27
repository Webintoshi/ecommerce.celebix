import { types as utilTypes } from "node:util";

import type { PaymentAdapterPacket } from "./contracts.ts";
import { parsePaymentAdapterPacket } from "./validation.ts";

const REQUEST_CONTENT_TYPES = Object.freeze([
  "application/x-www-form-urlencoded",
  "application/json",
  "application/json; charset=utf-8",
]);
const RESPONSE_CONTENT_TYPES = Object.freeze([
  "application/json",
  "application/json; charset=utf-8",
]);
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const MAXIMUM_REQUEST_BYTES = 1_048_576;
const REQUEST_KEYS = Object.freeze([
  "body",
  "environment",
  "headers",
  "method",
  "packet",
  "url",
]);
const UNKNOWN = Object.freeze({
  kind: "unknown" as const,
  code: "transport_outcome_unknown" as const,
});

export type ProviderTransportResult =
  | Readonly<{
      kind: "response";
      status: number;
      contentType: string;
      body: Uint8Array;
    }>
  | Readonly<{ kind: "unknown"; code: "transport_outcome_unknown" }>;

export type ProviderTransportRequest = Readonly<{
  packet: PaymentAdapterPacket;
  environment: "test" | "live";
  url: string;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  signal?: AbortSignal;
}>;

function invalid(): never {
  throw new TypeError("provider_transport_invalid");
}

function exactRequest(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    (keys.length !== REQUEST_KEYS.length && keys.length !== REQUEST_KEYS.length + 1) ||
    keys.some((key) => typeof key !== "string" || (!REQUEST_KEYS.includes(key) && key !== "signal")) ||
    REQUEST_KEYS.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

function exactHeaders(value: unknown): Headers {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length < 1 || keys.length > 32 || keys.some((key) => typeof key !== "string")) invalid();
  const headers = new Headers();
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      !HEADER_NAME.test(key) ||
      FORBIDDEN_REQUEST_HEADERS.has(key) ||
      typeof descriptor.value !== "string" ||
      descriptor.value.length < 1 ||
      descriptor.value.length > 4_096 ||
      descriptor.value.trim() !== descriptor.value ||
      CONTROL.test(descriptor.value)
    ) invalid();
    headers.set(key, descriptor.value);
  }
  const contentType = headers.get("content-type");
  if (
    contentType === null ||
    !REQUEST_CONTENT_TYPES.includes(contentType) ||
    keys.filter((key) => key === "content-type").length !== 1
  ) invalid();
  return headers;
}

function exactBody(value: unknown): Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype ||
    !(value.buffer instanceof ArrayBuffer) ||
    value.byteLength < 1 ||
    value.byteLength > MAXIMUM_REQUEST_BYTES
  ) invalid();
  return value;
}

function exactEndpoint(
  packetValue: unknown,
  environment: unknown,
  endpoint: unknown,
): string {
  const packet = parsePaymentAdapterPacket(packetValue);
  if (environment !== "test" && environment !== "live") invalid();
  if (typeof endpoint !== "string" || endpoint.length < 1 || endpoint.length > 2_048) invalid();
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return invalid();
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.toString() !== endpoint ||
    !packet.endpoints[environment].includes(endpoint)
  ) invalid();
  return endpoint;
}

function duplicateJsonKeys(text: string): boolean {
  let cursor = 0;
  let depth = 0;
  const whitespace = () => {
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
  };
  const string = (): string => {
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (text[cursor] === "\"") {
        cursor += 1;
        return JSON.parse(text.slice(start, cursor)) as string;
      }
      cursor += 1;
    }
    return invalid();
  };
  const value = (): boolean => {
    whitespace();
    if (text[cursor] === "{") return object();
    if (text[cursor] === "[") {
      depth += 1;
      if (depth > 64) return true;
      cursor += 1;
      whitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      while (cursor < text.length) {
        if (value()) return true;
        whitespace();
        if (text[cursor] === "]") {
          cursor += 1;
          depth -= 1;
          return false;
        }
        cursor += 1;
      }
      return true;
    }
    if (text[cursor] === "\"") {
      string();
      return false;
    }
    while (cursor < text.length && !/[\s,}\]]/.test(text[cursor]!)) cursor += 1;
    return false;
  };
  const object = (): boolean => {
    depth += 1;
    if (depth > 64) return true;
    cursor += 1;
    whitespace();
    if (text[cursor] === "}") {
      cursor += 1;
      depth -= 1;
      return false;
    }
    const keys = new Set<string>();
    while (cursor < text.length) {
      whitespace();
      const key = string();
      if (keys.has(key)) return true;
      keys.add(key);
      whitespace();
      cursor += 1;
      if (value()) return true;
      whitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      cursor += 1;
    }
    return true;
  };
  try {
    return value();
  } catch {
    return true;
  }
}

async function boundedBytes(
  response: Response,
  maximumBytes: number,
  aborted: Promise<never>,
): Promise<Uint8Array> {
  if (response.body === null) invalid();
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (
      !/^(?:0|[1-9]\d*)$/.test(declared) ||
      !Number.isSafeInteger(Number(declared)) ||
      Number(declared) > maximumBytes
    )
  ) invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const selected = await Promise.race([reader.read(), aborted]);
      if (selected.done) break;
      if (!(selected.value instanceof Uint8Array)) invalid();
      total += selected.value.byteLength;
      chunks.push(selected.value);
      if (total > maximumBytes) {
        void reader.cancel().catch(() => undefined);
        invalid();
      }
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
}

function validateJson(bytes: Uint8Array): void {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  JSON.parse(text);
  if (duplicateJsonKeys(text)) invalid();
}

export function createBoundedProviderTransport(options: {
  fetch(request: Request): Promise<Response>;
  timeoutMs: number;
  maximumResponseBytes: number;
}) {
  if (
    typeof options !== "object" ||
    options === null ||
    typeof options.fetch !== "function" ||
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 60_000 ||
    !Number.isSafeInteger(options.maximumResponseBytes) ||
    options.maximumResponseBytes < 1 ||
    options.maximumResponseBytes > 1_048_576
  ) invalid();
  const fetch = options.fetch;
  const timeoutMs = options.timeoutMs;
  const maximumResponseBytes = options.maximumResponseBytes;

  return Object.freeze({
    async request(input: ProviderTransportRequest): Promise<ProviderTransportResult> {
      let callerBody: Uint8Array | undefined;
      let requestBody: Uint8Array | undefined;
      let requestBuffer: ArrayBuffer | undefined;
      let responseBody: Uint8Array | undefined;
      let externalSignal: AbortSignal | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let removeExternalAbort: (() => void) | undefined;
      const controller = new AbortController();
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("provider_transport_aborted")),
          { once: true },
        );
      });
      try {
        const selected = exactRequest(input);
        callerBody = exactBody(selected.body);
        requestBody = new Uint8Array(callerBody);
        requestBuffer = requestBody.buffer as ArrayBuffer;
        const endpoint = exactEndpoint(selected.packet, selected.environment, selected.url);
        if (selected.method !== "POST") invalid();
        const headers = exactHeaders(selected.headers);
        if (selected.signal !== undefined) {
          if (!(selected.signal instanceof AbortSignal)) invalid();
          externalSignal = selected.signal;
          const abort = () => controller.abort();
          if (externalSignal.aborted) abort();
          else {
            externalSignal.addEventListener("abort", abort, { once: true });
            removeExternalAbort = () => externalSignal?.removeEventListener("abort", abort);
          }
        }
        const providerRequest = new Request(endpoint, {
          method: "POST",
          headers,
          body: requestBuffer,
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await Promise.race([fetch(providerRequest), aborted]);
        if (
          !(response instanceof Response) ||
          response.type === "opaqueredirect" ||
          response.redirected ||
          response.status < 200 ||
          response.status > 599 ||
          (response.status >= 300 && response.status < 400) ||
          response.headers.has("location") ||
          response.headers.has("set-cookie") ||
          response.headers.has("set-cookie2")
        ) invalid();
        const contentType = response.headers.get("content-type");
        if (contentType === null || !RESPONSE_CONTENT_TYPES.includes(contentType)) invalid();
        responseBody = await boundedBytes(response, maximumResponseBytes, aborted);
        validateJson(responseBody);
        const resultBody = new Uint8Array(responseBody);
        return Object.freeze({
          kind: "response" as const,
          status: response.status,
          contentType,
          body: resultBody,
        });
      } catch {
        return UNKNOWN;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        removeExternalAbort?.();
        callerBody?.fill(0);
        requestBody?.fill(0);
        responseBody?.fill(0);
      }
    },
  });
}
