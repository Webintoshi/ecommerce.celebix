import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  parseOrderDetail,
  type OrderAddress,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderTracking,
  type StoreMembershipRole,
  type TenantContext,
} from "@celebix/saas-contracts";

import { OrderRepositoryError } from "./errors.ts";

export const ORDER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const ROLES = new Set<StoreMembershipRole>(["store_owner", "admin", "editor", "analyst"]);
const SYNTHETIC_ID = "11111111-1111-4111-8111-111111111111";
const SYNTHETIC_TIME = "2026-01-01T00:00:00.000Z";

function fail(code: ConstructorParameters<typeof OrderRepositoryError>[0] = "invalid_input"): never {
  throw new OrderRepositoryError(code);
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = object(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(parsed, key)) ||
    Object.keys(parsed).some((key) => !allowed.has(key))
  ) fail();
  return parsed;
}

export function exactOrderInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  return exact(value, required, optional);
}

export function orderUuid(value: unknown): string {
  if (typeof value !== "string" || !ORDER_UUID.test(value)) fail();
  return value;
}

export function positiveOrderVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail();
  return value as number;
}

export function trustedOrderNow(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return new Date(value.getTime());
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

export function orderAuthority(context: TenantContext, currentTime: Date): ValidatedOrderAuthority {
  const now = trustedOrderNow(currentTime);
  if (typeof context !== "object" || context === null || typeof context.principal !== "object" || context.principal === null) {
    fail("unauthenticated");
  }
  if (typeof context.store !== "object" || context.store === null || context.store.status !== "active") {
    fail("store_inactive");
  }
  if (typeof context.membership !== "object" || context.membership === null || context.membership.status !== "active") {
    fail("membership_denied");
  }
  if (typeof context.entitlements !== "object" || context.entitlements === null) fail("durable_authority_invalid");
  if (
    context.entitlements.status !== "active" ||
    !Array.isArray(context.entitlements.features) ||
    !context.entitlements.features.includes("orders")
  ) fail("feature_not_enabled");

  try {
    const storeId = orderUuid(context.store.id);
    const principalId = orderUuid(context.principal.id);
    const membershipId = orderUuid(context.membership.id);
    const planId = orderUuid(context.entitlements.planId);
    const planCode = context.entitlements.planCode;
    const planVersion = context.entitlements.version;
    if (
      context.schemaVersion !== 1 ||
      context.entitlements.schemaVersion !== 1 ||
      typeof context.membership.role !== "string" ||
      !ROLES.has(context.membership.role) ||
      typeof planCode !== "string" ||
      planCode.length < 1 ||
      planCode.length > 64 ||
      planCode !== planCode.trim() ||
      CONTROL.test(planCode) ||
      !Number.isSafeInteger(planVersion) ||
      planVersion < 1 ||
      typeof context.entitlements.validFrom !== "string"
    ) fail("durable_authority_invalid");
    const validFrom = new Date(context.entitlements.validFrom);
    const validUntil = context.entitlements.validUntil === undefined
      ? undefined
      : new Date(context.entitlements.validUntil);
    if (
      !Number.isFinite(validFrom.getTime()) ||
      validFrom.toISOString() !== context.entitlements.validFrom ||
      now < validFrom ||
      (validUntil !== undefined && (
        !Number.isFinite(validUntil.getTime()) ||
        validUntil.toISOString() !== context.entitlements.validUntil ||
        now >= validUntil
      ))
    ) fail("durable_authority_invalid");
    return Object.freeze({ storeId, principalId, membershipId, planId, planCode, planVersion, now });
  } catch (error) {
    if (error instanceof OrderRepositoryError && error.code !== "invalid_input") throw error;
    fail("durable_authority_invalid");
  }
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
