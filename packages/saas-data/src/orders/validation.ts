import {
  ORDER_PAYMENT_STATUSES,
  ORDER_SORTS,
  ORDER_STATUSES,
  PLAN_FEATURE_KEYS,
  STORE_DOMAIN_TYPES,
  parseOrderDetail,
  parseOrderDraftSaveIntent,
  type OrderAddress,
  type OrderDraftSaveIntent,
  type OrderPaymentStatus,
  type OrderSort,
  type OrderStatus,
  type OrderTracking,
  type PlanFeatureKey,
  type StoreMembershipRole,
  type TenantContext,
} from "@celebix/saas-contracts";

import { OrderRepositoryError, type OrderErrorCode } from "./errors.ts";

export const ORDER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
const ROLES = new Set<StoreMembershipRole>(["store_owner", "admin", "editor", "analyst"]);
const FEATURES = new Set<string>(PLAN_FEATURE_KEYS);
const DOMAIN_TYPES = new Set<string>(STORE_DOMAIN_TYPES);
const SYNTHETIC_ID = "11111111-1111-4111-8111-111111111111";
const SYNTHETIC_TIME = "2026-01-01T00:00:00.000Z";

function fail(code: OrderErrorCode = "invalid_input"): never {
  throw new OrderRepositoryError(code);
}

function contain<T>(operation: () => T, code: OrderErrorCode): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof OrderRepositoryError) throw error;
    fail(code);
  }
}

function object(value: unknown, code: OrderErrorCode): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value as Record<string, unknown>;
}

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  code: OrderErrorCode = "invalid_input",
): Readonly<Record<string, unknown>> {
  return contain(() => {
    const parsed = object(value, code);
    const allowed = new Set([...required, ...optional]);
    const keys = Object.keys(parsed);
    if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) fail(code);
    const copy: Record<string, unknown> = {};
    for (const key of keys) copy[key] = parsed[key];
    return Object.freeze(copy);
  }, code);
}

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number,
  code: OrderErrorCode,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) fail(code);
  return value;
}

function authorityUuid(value: unknown): string {
  if (typeof value !== "string" || !ORDER_UUID.test(value)) fail("durable_authority_invalid");
  return value;
}

function authorityInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail("durable_authority_invalid");
  return value as number;
}

function authorityTimestamp(value: unknown): string {
  const selected = boundedString(value, 24, 24, "durable_authority_invalid");
  const parsed = new Date(selected);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== selected) fail("durable_authority_invalid");
  return selected;
}

function authorityFeatures(value: unknown): readonly PlanFeatureKey[] {
  if (!Array.isArray(value) || value.length > PLAN_FEATURE_KEYS.length) fail("durable_authority_invalid");
  const copied = [...value];
  const seen = new Set<string>();
  for (const feature of copied) {
    if (typeof feature !== "string" || !FEATURES.has(feature) || seen.has(feature)) {
      fail("durable_authority_invalid");
    }
    seen.add(feature);
  }
  return Object.freeze(copied as PlanFeatureKey[]);
}

function authorityLimits(value: unknown): Readonly<Record<string, number>> {
  const parsed = exact(
    value,
    ["products", "staff", "storageBytes"],
    ["monthlyOrders", "customDomains"],
    "durable_authority_invalid",
  );
  return Object.freeze({
    products: authorityInteger(parsed.products),
    staff: authorityInteger(parsed.staff),
    storageBytes: authorityInteger(parsed.storageBytes),
    ...(Object.hasOwn(parsed, "monthlyOrders") ? { monthlyOrders: authorityInteger(parsed.monthlyOrders) } : {}),
    ...(Object.hasOwn(parsed, "customDomains") ? { customDomains: authorityInteger(parsed.customDomains) } : {}),
  });
}

function canonicalLocale(value: unknown): string {
  const selected = boundedString(value, 2, 35, "durable_authority_invalid");
  const canonical = Intl.getCanonicalLocales(selected);
  if (canonical.length !== 1 || canonical[0] !== selected) fail("durable_authority_invalid");
  return selected;
}

function validateResolvedHost(value: unknown, storeId: string, storeSlug: string): void {
  const parsed = exact(value, [
    "schemaVersion", "hostname", "domainId", "domainType", "storeId", "storeSlug",
    "canonicalHostname", "status", "cacheVersion",
  ], [], "durable_authority_invalid");
  const hostname = boundedString(parsed.hostname, 1, 253, "durable_authority_invalid", HOSTNAME);
  const canonicalHostname = boundedString(parsed.canonicalHostname, 1, 253, "durable_authority_invalid", HOSTNAME);
  authorityUuid(parsed.domainId);
  authorityInteger(parsed.cacheVersion, 1);
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.domainType !== "string" ||
    !DOMAIN_TYPES.has(parsed.domainType) ||
    authorityUuid(parsed.storeId) !== storeId ||
    boundedString(parsed.storeSlug, 1, 63, "durable_authority_invalid", SLUG) !== storeSlug ||
    parsed.status !== "active" ||
    hostname !== hostname.toLowerCase() ||
    canonicalHostname !== canonicalHostname.toLowerCase()
  ) fail("durable_authority_invalid");
}

export function exactOrderInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  return exact(value, required, optional, "invalid_input");
}

export function orderUuid(value: unknown): string {
  if (typeof value !== "string" || !ORDER_UUID.test(value)) fail();
  return value;
}

export function positiveOrderVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail();
  return value as number;
}

export function orderDraftSaveIntent(
  value: unknown,
  expectedVersion?: number,
): Readonly<OrderDraftSaveIntent> {
  try {
    const parsed = parseOrderDraftSaveIntent(value);
    if (expectedVersion === undefined) {
      if (parsed.expectedVersion !== undefined) fail();
      return parsed;
    }
    const version = positiveOrderVersion(expectedVersion);
    if (parsed.expectedVersion !== undefined && parsed.expectedVersion !== version) fail();
    return Object.freeze({ ...parsed, expectedVersion: version });
  } catch (error) {
    if (error instanceof OrderRepositoryError) throw error;
    fail();
  }
}

export function trustedOrderNow(value: unknown): Date {
  return contain(() => {
    if (!(value instanceof Date)) fail();
    const timestamp = Date.prototype.getTime.call(value);
    if (!Number.isFinite(timestamp)) fail();
    return Object.freeze(new Date(timestamp)) as Date;
  }, "invalid_input");
}

export interface ValidatedOrderAuthority {
  readonly storeId: string;
  readonly principalId: string;
  readonly membershipId: string;
  readonly planId: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly now: Date;
}

export function merchantAuthority(context: TenantContext, currentTime: Date, requiredFeature: PlanFeatureKey): ValidatedOrderAuthority {
  const now = trustedOrderNow(currentTime);
  return contain(() => {
    if (!FEATURES.has(requiredFeature)) fail("durable_authority_invalid");
    const unsafeRoot = object(context, "durable_authority_invalid");
    if (!Object.hasOwn(unsafeRoot, "principal")) fail("unauthenticated");
    if (!Object.hasOwn(unsafeRoot, "store")) fail("store_inactive");
    if (!Object.hasOwn(unsafeRoot, "membership")) fail("membership_denied");
    const root = exact(context, [
      "schemaVersion", "requestId", "principal", "store", "membership", "entitlements", "locale",
    ], ["resolvedHost"], "durable_authority_invalid");
    if (root.schemaVersion !== 1) fail("durable_authority_invalid");
    boundedString(root.requestId, 1, 128, "durable_authority_invalid");

    if (typeof root.principal !== "object" || root.principal === null || Array.isArray(root.principal)) fail("unauthenticated");
    const principal = exact(root.principal, ["id", "issuer", "subject"], [], "durable_authority_invalid");
    const principalId = authorityUuid(principal.id);
    boundedString(principal.issuer, 1, 2_048, "durable_authority_invalid");
    boundedString(principal.subject, 1, 512, "durable_authority_invalid");

    if (typeof root.store !== "object" || root.store === null || Array.isArray(root.store)) fail("store_inactive");
    const store = exact(root.store, ["id", "slug", "status"], [], "durable_authority_invalid");
    if (store.status !== "active") fail("store_inactive");
    const storeId = authorityUuid(store.id);
    const storeSlug = boundedString(store.slug, 1, 63, "durable_authority_invalid", SLUG);

    if (typeof root.membership !== "object" || root.membership === null || Array.isArray(root.membership)) fail("membership_denied");
    const membership = exact(root.membership, ["id", "role", "status"], [], "durable_authority_invalid");
    if (membership.status !== "active") fail("membership_denied");
    const membershipId = authorityUuid(membership.id);
    if (typeof membership.role !== "string" || !ROLES.has(membership.role as StoreMembershipRole)) {
      fail("durable_authority_invalid");
    }

    const entitlements = exact(root.entitlements, [
      "schemaVersion", "planId", "planCode", "version", "status", "features", "limits", "validFrom",
    ], ["validUntil"], "durable_authority_invalid");
    if (entitlements.schemaVersion !== 1) fail("durable_authority_invalid");
    const planId = authorityUuid(entitlements.planId);
    const planCode = boundedString(entitlements.planCode, 1, 64, "durable_authority_invalid");
    const planVersion = authorityInteger(entitlements.version, 1);
    const features = authorityFeatures(entitlements.features);
    authorityLimits(entitlements.limits);
    const validFrom = authorityTimestamp(entitlements.validFrom);
    const validUntil = Object.hasOwn(entitlements, "validUntil")
      ? authorityTimestamp(entitlements.validUntil)
      : undefined;
    if (
      entitlements.status !== "active" ||
      !features.includes(requiredFeature)
    ) fail("feature_not_enabled");
    if (
      now < new Date(validFrom) ||
      (validUntil !== undefined && (validUntil <= validFrom || now >= new Date(validUntil)))
    ) fail("durable_authority_invalid");

    canonicalLocale(root.locale);
    if (Object.hasOwn(root, "resolvedHost")) validateResolvedHost(root.resolvedHost, storeId, storeSlug);

    return Object.freeze({ storeId, principalId, membershipId, planId, planCode, planVersion, now });
  }, "durable_authority_invalid");
}

export function orderAuthority(context: TenantContext, currentTime: Date): ValidatedOrderAuthority {
  return merchantAuthority(context, currentTime, "orders");
}

export function orderPageSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) fail();
  return value as number;
}

export function orderStatus(value: unknown): OrderStatus {
  if (typeof value !== "string" || !ORDER_STATUSES.includes(value as OrderStatus)) fail();
  return value as OrderStatus;
}

export function orderStatusFilter(value: unknown): OrderStatus | undefined {
  return value === undefined ? undefined : orderStatus(value);
}

export function orderSort(value: unknown): OrderSort {
  const selected = value === undefined ? "newest" : value;
  if (typeof selected !== "string" || !ORDER_SORTS.includes(selected as OrderSort)) fail();
  return selected as OrderSort;
}

export function orderPaymentStatus(value: unknown): OrderPaymentStatus {
  if (typeof value !== "string" || !ORDER_PAYMENT_STATUSES.includes(value as OrderPaymentStatus)) fail();
  return value as OrderPaymentStatus;
}

export function orderSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    CONTROL.test(value)
  ) fail();
  return value;
}

export function orderNoteBody(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2_000 ||
    value !== value.trim() ||
    CONTROL.test(value)
  ) fail();
  return value;
}

export interface ValidatedShipping {
  readonly shippingAddress: Readonly<OrderAddress>;
  readonly tracking?: Readonly<OrderTracking>;
}

export function orderShipping(shippingAddress: unknown, tracking: unknown): ValidatedShipping {
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
      shippingAddress,
      ...(tracking === undefined ? {} : { tracking }),
      items: [],
      events: [],
      notes: [],
    });
    return Object.freeze({
      shippingAddress: parsed.shippingAddress,
      ...(parsed.tracking === undefined ? {} : { tracking: parsed.tracking }),
    });
  } catch {
    fail();
  }
}
