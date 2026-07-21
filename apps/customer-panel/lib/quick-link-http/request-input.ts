import {
  QUICK_ORDER_EXPIRY_HOURS,
  QUICK_ORDER_LINK_STATUSES,
  QUICK_ORDER_MAX_COMPONENT_CENTS,
  type QuickOrderAddress,
  type QuickOrderLinkStatus,
} from "@celebix/saas-contracts";

import { validatePersistentPanelSessionCredential } from "../panel-session-completion/cookie.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/;
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const BODY_MAXIMUM_BYTES = 32_768;
const QUERY_MAXIMUM_BYTES = 4_096;
const COOKIE_MAXIMUM_BYTES = 4_096;
const COOKIE_NAME = "__Host-celebix_panel";

type Invalid = Readonly<{ kind: "invalid" }>;
const INVALID = Object.freeze({ kind: "invalid" as const });

export type QuickLinkCreateBody = Readonly<{
  items: readonly Readonly<{ variantId: string; quantity: number }>[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: Readonly<QuickOrderAddress>;
  billingAddress: Readonly<QuickOrderAddress>;
  customerNote?: string;
  internalLabel?: string;
  shippingCents: number;
  discountCents: number;
  expiryHours: 4 | 12 | 24 | 48 | 72;
}>;

export type QuickLinkMutationKind =
  | "create"
  | "cancel"
  | "duplicate"
  | "reveal_url"
  | "activate_provider"
  | "revoke_provider";

export type QuickLinkMutationValue = QuickLinkCreateBody | Readonly<{ expectedVersion: number }> | Readonly<Record<never, never>>;

function record(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  const selected = record(value);
  if (selected === null) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(selected);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set([...required, ...optional]);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(descriptors, key))
    ) return null;
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      copy[key] = descriptor.value;
    }
    return copy;
  } catch { return null; }
}

function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string | null {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum &&
    value === value.trim() && !CONTROL.test(value) && (pattern === undefined || pattern.test(value))
    ? value
    : null;
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number
    : null;
}

function address(value: unknown): Readonly<QuickOrderAddress> | null {
  const selected = exact(value, ["recipientName", "phone", "line1", "city", "country"], ["line2", "district", "postalCode"]);
  if (selected === null) return null;
  const parsed = {
    recipientName: string(selected.recipientName, 1, 200),
    phone: string(selected.phone, 3, 32),
    line1: string(selected.line1, 1, 300),
    line2: Object.hasOwn(selected, "line2") ? string(selected.line2, 1, 300) : undefined,
    district: Object.hasOwn(selected, "district") ? string(selected.district, 1, 200) : undefined,
    city: string(selected.city, 1, 200),
    postalCode: Object.hasOwn(selected, "postalCode") ? string(selected.postalCode, 1, 32) : undefined,
    country: string(selected.country, 2, 2, /^[A-Z]{2}$/),
  };
  if (
    parsed.recipientName === null || parsed.phone === null || parsed.line1 === null || parsed.city === null ||
    parsed.country === null || parsed.line2 === null || parsed.district === null || parsed.postalCode === null
  ) return null;
  return Object.freeze({
    recipientName: parsed.recipientName,
    phone: parsed.phone,
    line1: parsed.line1,
    ...(parsed.line2 === undefined ? {} : { line2: parsed.line2 }),
    ...(parsed.district === undefined ? {} : { district: parsed.district }),
    city: parsed.city,
    ...(parsed.postalCode === undefined ? {} : { postalCode: parsed.postalCode }),
    country: parsed.country,
  });
}

function items(value: unknown): QuickLinkCreateBody["items"] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !("value" in lengthDescriptor)) return null;
    const length = integer(lengthDescriptor.value, 1, 100);
    if (length === null || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const result: Array<Readonly<{ variantId: string; quantity: number }>> = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      const selected = exact(descriptor.value, ["variantId", "quantity"]);
      const quantity = integer(selected?.quantity, 1, 9_999);
      if (selected === null || typeof selected.variantId !== "string" || !UUID.test(selected.variantId) || quantity === null) return null;
      result.push(Object.freeze({ variantId: selected.variantId, quantity }));
    }
    return Object.freeze(result);
  } catch { return null; }
}

function create(value: unknown): QuickLinkCreateBody | null {
  const selected = exact(value, [
    "items", "customerName", "customerEmail", "customerPhone", "shippingAddress", "billingAddress",
    "shippingCents", "discountCents", "expiryHours",
  ], ["customerNote", "internalLabel"]);
  if (selected === null) return null;
  const parsedItems = items(selected.items);
  const shippingAddress = address(selected.shippingAddress);
  const billingAddress = address(selected.billingAddress);
  const customerName = string(selected.customerName, 1, 200);
  const customerEmail = string(selected.customerEmail, 3, 320, EMAIL);
  const customerPhone = string(selected.customerPhone, 3, 32);
  const customerNote = Object.hasOwn(selected, "customerNote") ? string(selected.customerNote, 1, 2_000) : undefined;
  const internalLabel = Object.hasOwn(selected, "internalLabel") ? string(selected.internalLabel, 1, 200) : undefined;
  const shippingCents = integer(selected.shippingCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
  const discountCents = integer(selected.discountCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
  if (
    parsedItems === null || shippingAddress === null || billingAddress === null || customerName === null ||
    customerEmail === null || customerPhone === null || customerNote === null || internalLabel === null ||
    shippingCents === null || discountCents === null ||
    !QUICK_ORDER_EXPIRY_HOURS.includes(selected.expiryHours as never)
  ) return null;
  return Object.freeze({
    items: parsedItems,
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    billingAddress,
    ...(customerNote === undefined ? {} : { customerNote }),
    ...(internalLabel === undefined ? {} : { internalLabel }),
    shippingCents,
    discountCents,
    expiryHours: selected.expiryHours as QuickLinkCreateBody["expiryHours"],
  });
}

async function boundedJson(request: Request): Promise<unknown | null> {
  if (
    request.headers.get("content-type") !== "application/json" ||
    request.headers.get("transfer-encoding") !== null || request.body === null
  ) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > BODY_MAXIMUM_BYTES)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      total += next.value.byteLength;
      if (total > BODY_MAXIMUM_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return null; }
}

export async function readQuickLinkMutationInput(
  request: Request,
  kind: QuickLinkMutationKind,
): Promise<Invalid | Readonly<{ kind: "valid"; operationId?: string; value: QuickLinkMutationValue }>> {
  const needsIdempotency = kind !== "reveal_url";
  const operationId = request.headers.get("idempotency-key");
  if (
    (needsIdempotency && (operationId === null || !UUID.test(operationId) || operationId.includes(","))) ||
    (!needsIdempotency && operationId !== null)
  ) return INVALID;
  const raw = await boundedJson(request);
  if (raw === null) return INVALID;
  let value: QuickLinkMutationValue | null;
  if (kind === "create") value = create(raw);
  else if (kind === "cancel") {
    const selected = exact(raw, ["expectedVersion"]);
    const expectedVersion = integer(selected?.expectedVersion, 1);
    value = selected === null || expectedVersion === null ? null : Object.freeze({ expectedVersion });
  } else value = exact(raw, []) === null ? null : Object.freeze({});
  return value === null
    ? INVALID
    : Object.freeze({ kind: "valid" as const, ...(operationId === null ? {} : { operationId }), value });
}

export type QuickLinkListInput = Readonly<{
  pageSize: number;
  cursor?: string;
  status?: QuickOrderLinkStatus;
}>;

export function readQuickLinkListInput(request: Request): Invalid | Readonly<{ kind: "valid"; value: QuickLinkListInput }> {
  try {
    const url = new URL(request.url);
    const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
    if (
      new TextEncoder().encode(raw).byteLength > QUERY_MAXIMUM_BYTES ||
      (raw !== "" && (raw.startsWith("&") || raw.endsWith("&") || raw.includes("&&")))
    ) return INVALID;
    const entries = [...url.searchParams.entries()];
    if (
      entries.some(([key]) => !["pageSize", "cursor", "status"].includes(key)) ||
      new Set(entries.map(([key]) => key)).size !== entries.length
    ) return INVALID;
    const rawPageSize = url.searchParams.get("pageSize");
    const pageSize = rawPageSize === null ? 20 : /^(?:[1-9]|[1-9]\d|100)$/.test(rawPageSize) ? Number(rawPageSize) : null;
    const cursor = url.searchParams.get("cursor");
    const status = url.searchParams.get("status");
    if (
      pageSize === null || (cursor !== null && !CURSOR.test(cursor)) ||
      (status !== null && !QUICK_ORDER_LINK_STATUSES.includes(status as QuickOrderLinkStatus))
    ) return INVALID;
    return Object.freeze({
      kind: "valid" as const,
      value: Object.freeze({
        pageSize,
        ...(cursor === null ? {} : { cursor }),
        ...(status === null ? {} : { status: status as QuickOrderLinkStatus }),
      }),
    });
  } catch { return INVALID; }
}

export function readQuickLinkPathId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export type QuickLinkPanelSessionCookieRead = Readonly<
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "present"; credential: string }
>;

export function readQuickLinkPanelSessionCookie(request: Request): QuickLinkPanelSessionCookieRead {
  try {
    const header = request.headers.get("cookie");
    if (header === null) return Object.freeze({ kind: "missing" as const });
    if (new TextEncoder().encode(header).byteLength > COOKIE_MAXIMUM_BYTES || CONTROL.test(header)) return INVALID;
    let credential: string | undefined;
    for (const rawPart of header.split(";")) {
      const part = rawPart.replace(/^[ \t]+/, "");
      const separator = part.indexOf("=");
      if (separator < 0 || part.slice(0, separator) !== COOKIE_NAME) continue;
      if (credential !== undefined) return INVALID;
      const value = part.slice(separator + 1);
      if (!value || value !== value.trim() || value.includes('"')) return INVALID;
      credential = value;
    }
    if (credential === undefined) return Object.freeze({ kind: "missing" as const });
    return Object.freeze({ kind: "present" as const, credential: validatePersistentPanelSessionCredential(credential) });
  } catch { return INVALID; }
}
