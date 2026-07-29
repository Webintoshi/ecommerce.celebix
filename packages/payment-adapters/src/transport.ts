import { types as utilTypes } from "node:util";

import type { PaymentAdapterPacket } from "./contracts.ts";
import { parsePaymentAdapterPacket } from "./validation.ts";

const REQUEST_CONTENT_TYPES = Object.freeze([
  "application/x-www-form-urlencoded",
  "application/json",
  "application/json; charset=utf-8",
]);
const REQUEST_HEADER_KEYS = Object.freeze([
  "authorization",
  "content-type",
  "x-iyzi-rnd",
]);
const IYZICO_PROVIDER_CODE = "iyzico_iframe";
const IYZICO_CONTENT_TYPE = "application/json";
const RESPONSE_CONTENT_TYPES = Object.freeze([
  "application/json",
  "application/json; charset=utf-8",
]);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const MAXIMUM_REQUEST_BYTES = 1_048_576;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "buffer",
)?.get as (this: Uint8Array) => ArrayBufferLike;
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
)?.get as (this: Uint8Array) => number;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
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
  headers: ProviderTransportRequestHeaders;
  body: Uint8Array;
  signal?: AbortSignal;
}>;

type ProviderTransportContentType =
  | "application/x-www-form-urlencoded"
  | "application/json"
  | "application/json; charset=utf-8";

export type ProviderTransportRequestHeaders =
  | Readonly<{
      "content-type": ProviderTransportContentType;
      authorization?: never;
      "x-iyzi-rnd"?: never;
    }>
  | Readonly<{
      "content-type": "application/json";
      authorization: string;
      "x-iyzi-rnd": string;
    }>;

export interface ProviderTransport {
  request(input: ProviderTransportRequest): Promise<ProviderTransportResult>;
}

function invalid(): never {
  throw new TypeError("provider_transport_invalid");
}

function unproxiedUint8Array(value: unknown): value is Uint8Array {
  try {
    return !utilTypes.isProxy(value) && utilTypes.isUint8Array(value);
  } catch {
    return false;
  }
}

function wipe(value: unknown): void {
  try {
    if (unproxiedUint8Array(value)) Reflect.apply(UINT8_ARRAY_FILL, value, [0]);
  } catch {
    // Cleanup must never change the stable transport result.
  }
}

function byteLength(value: Uint8Array): number {
  return Reflect.apply(TYPED_ARRAY_BYTE_LENGTH, value, []) as number;
}

function backingBuffer(value: Uint8Array): ArrayBufferLike {
  return Reflect.apply(TYPED_ARRAY_BUFFER, value, []) as ArrayBufferLike;
}

function discoverRequestBody(value: unknown): Uint8Array | undefined {
  try {
    if (typeof value !== "object" || value === null || utilTypes.isProxy(value)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, "body");
    if (!descriptor || !("value" in descriptor) || !unproxiedUint8Array(descriptor.value)) {
      return undefined;
    }
    return descriptor.value;
  } catch {
    return undefined;
  }
}

function byteInAsciiToken(byte: number): boolean {
  return byte >= 0x21 && byte <= 0x7e && byte !== 0x26;
}

function byteInBase64Url(byte: number): boolean {
  return (
    (byte >= 0x30 && byte <= 0x39) ||
    (byte >= 0x41 && byte <= 0x5a) ||
    (byte >= 0x61 && byte <= 0x7a) ||
    byte === 0x2d ||
    byte === 0x5f
  );
}

function byteInLowerHex(byte: number): boolean {
  return (byte >= 0x30 && byte <= 0x39) || (byte >= 0x61 && byte <= 0x66);
}

function consumeAscii(bytes: Uint8Array, cursor: number, expected: string): number {
  if (cursor + expected.length > bytes.byteLength) invalid();
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[cursor + index] !== expected.charCodeAt(index)) invalid();
  }
  return cursor + expected.length;
}

function exactIyzicoAuthorizationPayload(bytes: Uint8Array, randomKey: string): void {
  let cursor = consumeAscii(bytes, 0, "apiKey:");
  const apiKeyStart = cursor;
  while (cursor < bytes.byteLength && byteInAsciiToken(bytes[cursor]!)) cursor += 1;
  if (cursor - apiKeyStart < 1 || cursor - apiKeyStart > 256) invalid();
  cursor = consumeAscii(bytes, cursor, "&randomKey:");
  const randomKeyStart = cursor;
  while (cursor < bytes.byteLength && byteInBase64Url(bytes[cursor]!)) cursor += 1;
  const randomKeyLength = cursor - randomKeyStart;
  if (randomKeyLength < 16 || randomKeyLength > 256 || randomKeyLength !== randomKey.length) invalid();
  for (let index = 0; index < randomKeyLength; index += 1) {
    if (bytes[randomKeyStart + index] !== randomKey.charCodeAt(index)) invalid();
  }
  cursor = consumeAscii(bytes, cursor, "&signature:");
  if (bytes.byteLength - cursor !== 64) invalid();
  while (cursor < bytes.byteLength) {
    if (!byteInLowerHex(bytes[cursor]!)) invalid();
    cursor += 1;
  }
}

function exactIyzicoAuthorization(value: string, randomKey: string): void {
  if (
    value.length > 4_096 ||
    !/^IYZWSv2 [A-Za-z0-9+/]+={0,2}$/.test(value)
  ) invalid();
  const encoded = value.slice("IYZWSv2 ".length);
  let decoded: Buffer | undefined;
  try {
    if (encoded.length % 4 !== 0) invalid();
    decoded = Buffer.from(encoded, "base64");
    if (decoded.toString("base64") !== encoded) invalid();
    exactIyzicoAuthorizationPayload(decoded, randomKey);
  } finally {
    try {
      decoded?.fill(0);
    } catch {
      // Decoded authorization bytes are best-effort wiped on every path.
    }
  }
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

function exactHeaders(
  value: unknown,
  providerCode: string,
): Readonly<Record<string, string>> {
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
    keys.length < 1 ||
    keys.length > REQUEST_HEADER_KEYS.length ||
    keys.some((key) => typeof key !== "string" || !REQUEST_HEADER_KEYS.includes(key)) ||
    !Object.hasOwn(descriptors, "content-type")
  ) invalid();
  const selected: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      descriptor.value.length < 1 ||
      descriptor.value.trim() !== descriptor.value ||
      CONTROL.test(descriptor.value) ||
      /[^\x20-\x7e]/.test(descriptor.value)
    ) invalid();
    selected[key] = descriptor.value;
  }
  const contentType = selected["content-type"];
  if (
    contentType.length > 128 ||
    !REQUEST_CONTENT_TYPES.includes(contentType)
  ) invalid();
  const authorization = selected.authorization;
  const randomKey = selected["x-iyzi-rnd"];
  if (providerCode === IYZICO_PROVIDER_CODE) {
    if (
      keys.length !== REQUEST_HEADER_KEYS.length ||
      contentType !== IYZICO_CONTENT_TYPE ||
      authorization === undefined ||
      randomKey === undefined ||
      randomKey.length > 256 ||
      !/^[A-Za-z0-9_-]{16,256}$/.test(randomKey)
    ) invalid();
    exactIyzicoAuthorization(authorization, randomKey);
  } else if (keys.length !== 1 || authorization !== undefined || randomKey !== undefined) invalid();
  return selected;
}

function exactBody(value: unknown): Uint8Array {
  if (
    !unproxiedUint8Array(value) ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype ||
    !(backingBuffer(value) instanceof ArrayBuffer)
  ) invalid();
  const length = byteLength(value);
  if (length < 1 || length > MAXIMUM_REQUEST_BYTES) invalid();
  return value;
}

function exactEndpoint(
  packet: PaymentAdapterPacket,
  environment: unknown,
  endpoint: unknown,
): string {
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
    for (const chunk of chunks) wipe(chunk);
    try {
      reader.releaseLock();
    } catch {
      // Cleanup remains opaque and cannot replace the transport result.
    }
  }
}

function discardResponse(response: Response | undefined, controller: AbortController): void {
  try {
    controller.abort();
  } catch {
    // The locally created controller is best-effort cleanup authority.
  }
  try {
    if (response?.body !== null && response?.body !== undefined) {
      void response.body.cancel().catch(() => undefined);
    }
  } catch {
    // Response cleanup never exposes provider-controlled failures.
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
}): ProviderTransport {
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
      let callerBody: Uint8Array | undefined = discoverRequestBody(input);
      let requestBody: Uint8Array | undefined;
      let requestBuffer: ArrayBuffer | undefined;
      let responseBody: Uint8Array | undefined;
      let providerResponse: Response | undefined;
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
      void aborted.catch(() => undefined);
      try {
        const selected = exactRequest(input);
        callerBody = exactBody(selected.body);
        requestBody = new Uint8Array(byteLength(callerBody));
        Reflect.apply(UINT8_ARRAY_SET, requestBody, [callerBody]);
        requestBuffer = requestBody.buffer as ArrayBuffer;
        const packet = parsePaymentAdapterPacket(selected.packet);
        const endpoint = exactEndpoint(packet, selected.environment, selected.url);
        if (selected.method !== "POST") invalid();
        const headers = exactHeaders(selected.headers, packet.providerCode);
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
        if (!(response instanceof Response)) invalid();
        providerResponse = response;
        if (
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
        discardResponse(providerResponse, controller);
        return UNKNOWN;
      } finally {
        try {
          if (timer !== undefined) clearTimeout(timer);
        } catch {
          // Cleanup cannot replace the stable transport result.
        }
        try {
          removeExternalAbort?.();
        } catch {
          // External signal cleanup remains opaque.
        }
        wipe(callerBody);
        wipe(requestBody);
        wipe(responseBody);
      }
    },
  });
}
