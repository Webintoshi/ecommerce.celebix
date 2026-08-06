import { types as utilTypes } from "node:util";

import type { ShippingProviderTransportRequest } from "./transport.ts";

export const BASIT_KARGO_API_ORIGIN = "https://basitkargo.com/api" as const;

const TOKEN = /^[\x21-\x7e]{16,4096}$/;
const STATIC_ENDPOINTS = Object.freeze(new Map<string, ReadonlySet<string>>([
  ["GET", new Set(["/handlers", "/firm/brand", "/firm/address"])],
  ["POST", new Set(["/handlers/fee/packages", "/v2/order", "/v2/order/barcode", "/v2/order/filter"])],
  ["PUT", new Set(["/v2/order"])],
]));
const DYNAMIC_ENDPOINTS = Object.freeze([
  Object.freeze({ method: "GET", pattern: /^\/v2\/order\/[A-Za-z0-9_-]{1,200}$/ }),
  Object.freeze({ method: "GET", pattern: /^\/v2\/order\/barcode\/[A-Za-z0-9_-]{1,200}$/ }),
  Object.freeze({ method: "GET", pattern: /^\/v2\/order\/handler-shipment-code\/[A-Za-z0-9_-]{1,200}$/ }),
  Object.freeze({ method: "GET", pattern: /^\/v2\/order\/return\/barcode\/[A-Za-z0-9_-]{1,200}$/ }),
  Object.freeze({ method: "GET", pattern: /^\/label\/svg\/[A-Za-z0-9_-]{1,200}$/ }),
  Object.freeze({ method: "DELETE", pattern: /^\/order\/barcode\/[A-Za-z0-9_-]{1,200}$/ }),
] as const);
const REQUIRED_KEYS = Object.freeze(["method", "origin", "path", "signal", "token"]);
const OPTIONAL_KEYS = Object.freeze(["body"]);
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "byteLength")?.get as (this: Uint8Array) => number;

function invalid(): never {
  throw new TypeError("shipping_transport_invalid");
}

function ownDataObject(value: unknown): Record<string, unknown> {
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
    REQUIRED_KEYS.some((key) => !Object.hasOwn(descriptors, key)) ||
    keys.some((key) => typeof key !== "string" || (!REQUIRED_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key)))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

function isReviewedEndpoint(method: string, path: string): boolean {
  if (STATIC_ENDPOINTS.get(method)?.has(path) === true) return true;
  return DYNAMIC_ENDPOINTS.some((entry) => entry.method === method && entry.pattern.test(path));
}

function requestBody(value: unknown): Uint8Array {
  if (!utilTypes.isUint8Array(value) || utilTypes.isProxy(value)) invalid();
  const length = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH, value, []) as number;
  if (length < 1 || length > 1_048_576) invalid();
  return Uint8Array.from(value as Uint8Array);
}

export function parseShippingProviderTransportRequest(value: unknown): ShippingProviderTransportRequest {
  const parsed = ownDataObject(value);
  if (parsed.origin !== BASIT_KARGO_API_ORIGIN) invalid();
  if (typeof parsed.path !== "string" || !isReviewedEndpoint(String(parsed.method), parsed.path)) invalid();
  if (!(["GET", "POST", "PUT", "DELETE"] as const).includes(parsed.method as never)) invalid();
  if (typeof parsed.token !== "string" || !TOKEN.test(parsed.token)) invalid();
  if (!(parsed.signal instanceof AbortSignal)) invalid();
  const hasBody = Object.hasOwn(parsed, "body");
  if (hasBody !== (parsed.method === "POST" || parsed.method === "PUT")) invalid();
  return {
    origin: BASIT_KARGO_API_ORIGIN,
    path: parsed.path,
    method: parsed.method as ShippingProviderTransportRequest["method"],
    token: parsed.token,
    ...(hasBody ? { body: requestBody(parsed.body) } : {}),
    signal: parsed.signal,
  };
}

export function canonicalShippingResponseContentType(value: string | null): "application/json" | "image/svg+xml" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "application/json" || normalized === "application/json; charset=utf-8") return "application/json";
  if (normalized === "image/svg+xml" || normalized === "image/svg+xml; charset=utf-8") return "image/svg+xml";
  return null;
}

export function parseShippingRetryAfter(value: string | null): number | null {
  if (value === null || !/^[1-9][0-9]{0,2}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 900 ? parsed : null;
}
