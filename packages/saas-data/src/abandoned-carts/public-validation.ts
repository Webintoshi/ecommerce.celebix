import { PublicAbandonedCartRepositoryError } from "./public-errors.ts";
import type {
  CapturePublicAbandonedCartInput,
  ConvertPublicAbandonedCartInput,
  MarkStaleAbandonedCartsInput,
  PublicAbandonedCartCustomerInput,
  PublicAbandonedCartItemInput,
} from "./public-types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(): never { throw new PublicAbandonedCartRepositoryError("invalid_input"); }

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const parsed = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) fail();
  return parsed;
}

function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) fail(); return value; }
function digest(value: unknown): string { if (typeof value !== "string" || !DIGEST.test(value)) fail(); return value; }
function hostname(value: unknown): string {
  if (typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() || value !== value.toLowerCase() || !HOSTNAME.test(value)) fail();
  return value;
}
function date(value: unknown): Date {
  if (!(value instanceof Date)) fail();
  const milliseconds = Date.prototype.getTime.call(value);
  if (!Number.isFinite(milliseconds)) fail();
  return Object.freeze(new Date(milliseconds)) as Date;
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value)) fail();
  return value;
}

function customer(value: unknown): PublicAbandonedCartCustomerInput {
  const parsed = exact(value, [], ["name", "email", "phone"]);
  return Object.freeze({
    ...(Object.hasOwn(parsed, "name") ? { name: text(parsed.name, 1, 200) } : {}),
    ...(Object.hasOwn(parsed, "email") ? { email: text(parsed.email, 3, 320) } : {}),
    ...(Object.hasOwn(parsed, "phone") ? { phone: text(parsed.phone, 3, 32) } : {}),
  });
}

function items(value: unknown): readonly PublicAbandonedCartItemInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100 || Object.getPrototypeOf(value) !== Array.prototype) fail();
  const seen = new Set<string>();
  return Object.freeze(value.map((entry) => {
    const parsed = exact(entry, ["productId", "variantId", "quantity"]);
    const productId = uuid(parsed.productId);
    const variantId = uuid(parsed.variantId);
    if (seen.has(variantId) || !Number.isSafeInteger(parsed.quantity) || (parsed.quantity as number) < 1 || (parsed.quantity as number) > 9_999) fail();
    seen.add(variantId);
    return Object.freeze({ productId, variantId, quantity: parsed.quantity as number });
  }));
}

export function captureInput(value: unknown): CapturePublicAbandonedCartInput {
  const parsed = exact(value, ["hostname", "cartId", "credentialDigest", "now", "customer", "items"]);
  return Object.freeze({ hostname: hostname(parsed.hostname), cartId: uuid(parsed.cartId), credentialDigest: digest(parsed.credentialDigest), now: date(parsed.now), customer: customer(parsed.customer), items: items(parsed.items) });
}

export function convertInput(value: unknown): ConvertPublicAbandonedCartInput {
  const parsed = exact(value, ["hostname", "credentialDigest", "orderId", "now"]);
  return Object.freeze({ hostname: hostname(parsed.hostname), credentialDigest: digest(parsed.credentialDigest), orderId: uuid(parsed.orderId), now: date(parsed.now) });
}

export function staleInput(value: unknown): MarkStaleAbandonedCartsInput {
  const parsed = exact(value, ["now", "staleBefore"]);
  const now = date(parsed.now);
  const staleBefore = date(parsed.staleBefore);
  const delta = now.getTime() - staleBefore.getTime();
  if (delta < 5 * 60_000 || delta > 7 * 24 * 60 * 60_000) fail();
  return Object.freeze({ now, staleBefore });
}
