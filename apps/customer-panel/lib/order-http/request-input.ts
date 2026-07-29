import {
  ORDER_PAYMENT_STATUSES,
  ORDER_SORTS,
  ORDER_STATUSES,
  parseOrderDetail,
  type OrderAddress,
  type OrderPaymentStatus,
  type OrderSort,
  type OrderStatus,
  type OrderTracking,
} from "@celebix/saas-contracts";

import { validatePersistentPanelSessionCredential } from "../panel-session-completion/cookie.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const BODY_MAXIMUM_BYTES = 32_768;
const QUERY_MAXIMUM_BYTES = 4_096;
const COOKIE_MAXIMUM_BYTES = 4_096;
const PANEL_SESSION_COOKIE_NAME = "__Host-celebix_panel";
const SYNTHETIC_ID = "11111111-1111-4111-8111-111111111111";
const SYNTHETIC_TIME = "2026-01-01T00:00:00.000Z";

export type OrderMutationKind =
  | "transition_status"
  | "transition_payment"
  | "update_shipping"
  | "add_note"
  | "archive_note";

export type OrderMutationBodies = Readonly<{
  transition_status: Readonly<{ expectedVersion: number; nextStatus: OrderStatus }>;
  transition_payment: Readonly<{ expectedVersion: number; nextPaymentStatus: OrderPaymentStatus }>;
  update_shipping: Readonly<{
    expectedVersion: number;
    shippingAddress: Readonly<OrderAddress>;
    tracking?: Readonly<OrderTracking>;
  }>;
  add_note: Readonly<{ body: string }>;
  archive_note: Readonly<Record<never, never>>;
}>;

type Invalid = Readonly<{ kind: "invalid" }>;
const INVALID = Object.freeze({ kind: "invalid" as const });

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  const parsed = object(value);
  if (parsed === null) return null;
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(parsed, key)) ||
    Object.keys(parsed).some((key) => !allowed.has(key))
  ) return null;
  return parsed;
}

function version(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 1 ? value as number : null;
}

function shipping(value: Record<string, unknown>): OrderMutationBodies["update_shipping"] | null {
  const expectedVersion = version(value.expectedVersion);
  if (expectedVersion === null) return null;
  try {
    const parsed = parseOrderDetail({
      id: SYNTHETIC_ID,
      orderNumber: "synthetic",
      source: "manual_import",
      customerName: "Synthetic Customer",
      customerEmail: "synthetic@example.com",
      currency: "TRY",
      totalCents: 0,
      status: "pending",
      paymentStatus: "pending",
      itemCount: 0,
      createdAt: SYNTHETIC_TIME,
      updatedAt: SYNTHETIC_TIME,
      version: 1,
      subtotalCents: 0,
      shippingCents: 0,
      discountCents: 0,
      shippingAddress: value.shippingAddress,
      ...(Object.hasOwn(value, "tracking") ? { tracking: value.tracking } : {}),
      items: [],
      events: [],
      notes: [],
    });
    return Object.freeze({
      expectedVersion,
      shippingAddress: parsed.shippingAddress,
      ...(parsed.tracking === undefined ? {} : { tracking: parsed.tracking }),
    });
  } catch { return null; }
}

function mutationBody<K extends OrderMutationKind>(value: unknown, kind: K): OrderMutationBodies[K] | null {
  if (kind === "transition_status") {
    const parsed = exact(value, ["expectedVersion", "nextStatus"]);
    const expectedVersion = version(parsed?.expectedVersion);
    if (
      parsed === null || expectedVersion === null || typeof parsed.nextStatus !== "string" ||
      !ORDER_STATUSES.includes(parsed.nextStatus as OrderStatus)
    ) return null;
    return Object.freeze({ expectedVersion, nextStatus: parsed.nextStatus as OrderStatus }) as OrderMutationBodies[K];
  }
  if (kind === "transition_payment") {
    const parsed = exact(value, ["expectedVersion", "nextPaymentStatus"]);
    const expectedVersion = version(parsed?.expectedVersion);
    if (
      parsed === null || expectedVersion === null || typeof parsed.nextPaymentStatus !== "string" ||
      !ORDER_PAYMENT_STATUSES.includes(parsed.nextPaymentStatus as OrderPaymentStatus)
    ) return null;
    return Object.freeze({ expectedVersion, nextPaymentStatus: parsed.nextPaymentStatus as OrderPaymentStatus }) as OrderMutationBodies[K];
  }
  if (kind === "update_shipping") {
    const parsed = exact(value, ["expectedVersion", "shippingAddress"], ["tracking"]);
    return (parsed === null ? null : shipping(parsed)) as OrderMutationBodies[K] | null;
  }
  if (kind === "add_note") {
    const parsed = exact(value, ["body"]);
    if (
      parsed === null || typeof parsed.body !== "string" || parsed.body.length < 1 || parsed.body.length > 2_000 ||
      parsed.body !== parsed.body.trim() || CONTROL.test(parsed.body)
    ) return null;
    return Object.freeze({ body: parsed.body }) as OrderMutationBodies[K];
  }
  const parsed = exact(value, []);
  return parsed === null ? null : Object.freeze({}) as OrderMutationBodies[K];
}

function exactJsonContentType(request: Request): boolean {
  return request.headers.get("content-type") === "application/json" &&
    request.headers.get("transfer-encoding") === null;
}

async function boundedJson(request: Request): Promise<unknown | null> {
  if (!exactJsonContentType(request) || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > BODY_MAXIMUM_BYTES)
  ) return null;
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
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { return null; }
}

export async function readOrderMutationInput<K extends OrderMutationKind>(
  request: Request,
  kind: K,
): Promise<Invalid | Readonly<{ kind: "valid"; operationId: string; value: OrderMutationBodies[K] }>> {
  const operationId = request.headers.get("idempotency-key");
  if (
    operationId === null || !UUID.test(operationId) || operationId !== operationId.trim() ||
    operationId.includes(",")
  ) return INVALID;
  const raw = await boundedJson(request);
  const value = raw === null ? null : mutationBody(raw, kind);
  return value === null
    ? INVALID
    : Object.freeze({ kind: "valid" as const, operationId, value });
}

export type OrderListInput = Readonly<{
  pageSize: number;
  cursor?: string;
  status?: OrderStatus;
  search?: string;
  sort: OrderSort;
}>;

export function readOrderListInput(request: Request): Invalid | Readonly<{ kind: "valid"; value: OrderListInput }> {
  let url: URL;
  try { url = new URL(request.url); } catch { return INVALID; }
  const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (
    new TextEncoder().encode(raw).byteLength > QUERY_MAXIMUM_BYTES ||
    (raw !== "" && (raw.startsWith("&") || raw.endsWith("&") || raw.includes("&&")))
  ) return INVALID;
  const entries = [...url.searchParams.entries()];
  if (
    entries.some(([key]) => !["pageSize", "cursor", "status", "search", "sort"].includes(key)) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) return INVALID;
  const rawPageSize = url.searchParams.get("pageSize");
  const pageSize = rawPageSize === null
    ? 20
    : /^(?:[1-9]|[1-9]\d|100)$/.test(rawPageSize) ? Number(rawPageSize) : null;
  const cursor = url.searchParams.get("cursor");
  const rawStatus = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const rawSort = url.searchParams.get("sort");
  if (
    pageSize === null || (cursor !== null && !CURSOR.test(cursor)) ||
    (rawStatus !== null && !ORDER_STATUSES.includes(rawStatus as OrderStatus)) ||
    (rawSort !== null && !ORDER_SORTS.includes(rawSort as OrderSort)) ||
    (search !== null && (
      search.length < 1 || search.length > 200 || search !== search.trim() || CONTROL.test(search)
    ))
  ) return INVALID;
  return Object.freeze({
    kind: "valid" as const,
    value: Object.freeze({
      pageSize,
      ...(cursor === null ? {} : { cursor }),
      ...(rawStatus === null ? {} : { status: rawStatus as OrderStatus }),
      ...(search === null ? {} : { search }),
      sort: (rawSort ?? "newest") as OrderSort,
    }),
  });
}

export function readOrderPathId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export type OrderPanelSessionCookieRead = Readonly<
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "present"; credential: string }
>;

export function readOrderPanelSessionCookie(request: Request): OrderPanelSessionCookieRead {
  try {
    const header = request.headers.get("cookie");
    if (header === null) return Object.freeze({ kind: "missing" as const });
    if (
      new TextEncoder().encode(header).byteLength > COOKIE_MAXIMUM_BYTES ||
      CONTROL.test(header)
    ) return INVALID;
    let credential: string | undefined;
    for (const rawPart of header.split(";")) {
      const part = rawPart.replace(/^[ \t]+/, "");
      const separator = part.indexOf("=");
      if (separator < 0 || part.slice(0, separator) !== PANEL_SESSION_COOKIE_NAME) continue;
      if (credential !== undefined) return INVALID;
      const value = part.slice(separator + 1);
      if (!value || value.trim() !== value || value.includes('"')) return INVALID;
      credential = value;
    }
    if (credential === undefined) return Object.freeze({ kind: "missing" as const });
    return Object.freeze({
      kind: "present" as const,
      credential: validatePersistentPanelSessionCredential(credential),
    });
  } catch { return INVALID; }
}
