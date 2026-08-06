import type { CartCommand, CheckoutContact, CheckoutRequest, CheckoutShippingAddress } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+90[1-9][0-9]{9}$/;
const POSTAL = /^[A-Za-z0-9 -]{2,16}$/;
const IDENTITY_NUMBER = /^[1-9][0-9]{10}$/;
const MAXIMUM_BODY_BYTES = 32_768;

function cartInvalid(): never { throw new TypeError("storefront_cart_request_invalid"); }
function checkoutInvalid(): never { throw new TypeError("storefront_checkout_request_invalid"); }
type Invalid = () => never;

function exact(value: unknown, required: readonly string[], optional: readonly string[], invalid: Invalid): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors), allowed = new Set([...required, ...optional]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function text(value: unknown, minimum: number, maximum: number, invalid: Invalid, pattern?: RegExp): string {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value) || new TextEncoder().encode(value).byteLength < minimum || new TextEncoder().encode(value).byteLength > maximum || (pattern && !pattern.test(value))) invalid();
  return value;
}
function uuid(value: unknown, invalid: Invalid) { return text(value, 36, 36, invalid, UUID); }
function integer(value: unknown, minimum: number, maximum: number, invalid: Invalid) { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid(); return value as number; }

function canonicalOrigin(value: string, invalid: Invalid): string {
  try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.port || url.origin !== value) invalid(); return url.origin; } catch { return invalid(); }
}

async function jsonBody(request: Request, expectedPaths: readonly string[], publicOrigin: string, invalid: Invalid): Promise<{ path: string; body: unknown }> {
  let url: URL;
  try { url = new URL(request.url); } catch { return invalid(); }
  const origin = canonicalOrigin(publicOrigin, invalid);
  if (request.method !== "POST" || (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !expectedPaths.includes(url.pathname) || url.search || url.hash || request.headers.get("origin") !== origin) invalid();
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || request.headers.has("authorization") || request.body === null) invalid();
  for (const name of request.headers.keys()) if (name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy") invalid();
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) invalid();
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > MAXIMUM_BODY_BYTES) { await reader.cancel().catch(() => undefined); invalid(); } chunks.push(new Uint8Array(next.value)); }
    if (total === 0) invalid();
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return { path: url.pathname, body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }; } finally { bytes.fill(0); }
  } catch (error) {
    if (error instanceof TypeError && (error.message === "storefront_cart_request_invalid" || error.message === "storefront_checkout_request_invalid")) throw error;
    return invalid();
  }
  finally { for (const chunk of chunks) chunk.fill(0); }
}

export async function readCartMutationRequest(request: Request, publicOrigin: string): Promise<CartCommand> {
  let selected: { path: string; body: unknown };
  try { selected = await jsonBody(request, ["/api/cart/add", "/api/cart/quantity", "/api/cart/remove", "/api/cart/buy-now"], publicOrigin, cartInvalid); } catch { return cartInvalid(); }
  const operation = (row: Record<string, unknown>) => uuid(row.operationId, cartInvalid);
  if (selected.path === "/api/cart/add") { const row = exact(selected.body, ["operationId", "productId", "variantId", "quantity"], ["expectedVersion"], cartInvalid); return Object.freeze({ kind: "add", operationId: operation(row), productId: uuid(row.productId, cartInvalid), variantId: uuid(row.variantId, cartInvalid), quantity: integer(row.quantity, 1, 9_999, cartInvalid), ...(Object.hasOwn(row, "expectedVersion") ? { expectedVersion: integer(row.expectedVersion, 0, Number.MAX_SAFE_INTEGER, cartInvalid) } : {}) }); }
  if (selected.path === "/api/cart/quantity") { const row = exact(selected.body, ["operationId", "variantId", "quantity", "expectedVersion"], [], cartInvalid); return Object.freeze({ kind: "set_quantity", operationId: operation(row), variantId: uuid(row.variantId, cartInvalid), quantity: integer(row.quantity, 1, 9_999, cartInvalid), expectedVersion: integer(row.expectedVersion, 0, Number.MAX_SAFE_INTEGER, cartInvalid) }); }
  if (selected.path === "/api/cart/remove") { const row = exact(selected.body, ["operationId", "variantId", "expectedVersion"], [], cartInvalid); return Object.freeze({ kind: "remove", operationId: operation(row), variantId: uuid(row.variantId, cartInvalid), expectedVersion: integer(row.expectedVersion, 0, Number.MAX_SAFE_INTEGER, cartInvalid) }); }
  const row = exact(selected.body, ["operationId", "productId", "variantId", "quantity"], [], cartInvalid); return Object.freeze({ kind: "buy_now", operationId: operation(row), productId: uuid(row.productId, cartInvalid), variantId: uuid(row.variantId, cartInvalid), quantity: integer(row.quantity, 1, 9_999, cartInvalid) });
}

function contact(value: unknown): CheckoutContact { const row = exact(value, ["name", "email", "phone"], [], checkoutInvalid); return Object.freeze({ name: text(row.name, 2, 200, checkoutInvalid), email: text(row.email, 3, 320, checkoutInvalid, EMAIL).toLowerCase(), phone: text(row.phone, 13, 13, checkoutInvalid, PHONE) }); }
function address(value: unknown): CheckoutShippingAddress { const row = exact(value, ["addressLine1", "city", "district"], ["addressLine2", "postalCode"], checkoutInvalid); return Object.freeze({ addressLine1: text(row.addressLine1, 3, 300, checkoutInvalid), ...(Object.hasOwn(row, "addressLine2") ? { addressLine2: text(row.addressLine2, 1, 300, checkoutInvalid) } : {}), city: text(row.city, 2, 100, checkoutInvalid), district: text(row.district, 2, 100, checkoutInvalid), ...(Object.hasOwn(row, "postalCode") ? { postalCode: text(row.postalCode, 1, 16, checkoutInvalid, POSTAL) } : {}) }); }

function identityNumber(value: unknown): string {
  const selected = text(value, 11, 11, checkoutInvalid, IDENTITY_NUMBER);
  if (/^([0-9])\1{10}$/u.test(selected) || selected === "12345678901") checkoutInvalid();
  const digits = [...selected].map(Number);
  const odd = digits[0]! + digits[2]! + digits[4]! + digits[6]! + digits[8]!;
  const even = digits[1]! + digits[3]! + digits[5]! + digits[7]!;
  const tenth = ((odd * 7 - even) % 10 + 10) % 10;
  const eleventh = digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10;
  if (digits[9] !== tenth || digits[10] !== eleventh) checkoutInvalid();
  return selected;
}

export async function readCheckoutRequest(request: Request, publicOrigin: string): Promise<CheckoutRequest> {
  let selected: { path: string; body: unknown };
  try { selected = await jsonBody(request, ["/api/checkout/quote", "/api/checkout/complete", "/api/checkout/payment/start"], publicOrigin, checkoutInvalid); } catch { return checkoutInvalid(); }
  if (selected.path === "/api/checkout/quote") { const row = exact(selected.body, ["intentKind"], [], checkoutInvalid); if (row.intentKind !== "cart" && row.intentKind !== "buy_now") checkoutInvalid(); return Object.freeze({ kind: "quote", intentKind: row.intentKind }); }
  if (selected.path === "/api/checkout/payment/start") {
    const row = exact(selected.body, ["operationId", "cartVersion", "intentKind", "contact", "shippingAddress", "shippingMethod", "paymentMethodId"], ["identityNumber", "note"], checkoutInvalid);
    if (row.intentKind !== "cart" && row.intentKind !== "buy_now" || row.shippingMethod !== "standard") checkoutInvalid();
    return Object.freeze({
      kind: "hosted_start", operationId: uuid(row.operationId, checkoutInvalid),
      cartVersion: integer(row.cartVersion, 1, Number.MAX_SAFE_INTEGER, checkoutInvalid),
      intentKind: row.intentKind, contact: contact(row.contact), shippingAddress: address(row.shippingAddress),
      shippingMethod: "standard", paymentMethodId: uuid(row.paymentMethodId, checkoutInvalid),
      ...(Object.hasOwn(row, "identityNumber") ? { identityNumber: identityNumber(row.identityNumber) } : {}),
      ...(Object.hasOwn(row, "note") ? { note: text(row.note, 1, 500, checkoutInvalid) } : {}),
    });
  }
  const row = exact(selected.body, ["operationId", "cartVersion", "intentKind", "contact", "shippingAddress", "shippingMethod", "paymentKind"], ["note"], checkoutInvalid);
  if (row.intentKind !== "cart" && row.intentKind !== "buy_now" || row.shippingMethod !== "standard" || row.paymentKind !== "bank_transfer" && row.paymentKind !== "cash_on_delivery") checkoutInvalid();
  return Object.freeze({ kind: "complete", operationId: uuid(row.operationId, checkoutInvalid), cartVersion: integer(row.cartVersion, 0, Number.MAX_SAFE_INTEGER, checkoutInvalid), intentKind: row.intentKind, contact: contact(row.contact), shippingAddress: address(row.shippingAddress), shippingMethod: "standard", paymentKind: row.paymentKind, ...(Object.hasOwn(row, "note") ? { note: text(row.note, 1, 500, checkoutInvalid) } : {}) });
}
