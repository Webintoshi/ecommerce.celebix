import {
  parseProduct,
  parseProductVariant,
  type ProductStatus,
  type StoreMembershipRole,
  type TenantContext,
} from "@celebix/saas-contracts";

import { CatalogRepositoryError } from "./errors.ts";
import type { CatalogProductFields, CatalogVariantFields } from "./types.ts";

export const CATALOG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SYNTHETIC_ID = "11111111-1111-4111-8111-111111111111";
const SYNTHETIC_STORE_ID = "22222222-2222-4222-8222-222222222222";
const SYNTHETIC_TIME = "2026-01-01T00:00:00.000Z";

function fail(code: ConstructorParameters<typeof CatalogRepositoryError>[0] = "invalid_input"): never {
  throw new CatalogRepositoryError(code);
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

export function catalogUuid(value: unknown): string {
  if (typeof value !== "string" || !CATALOG_UUID.test(value)) fail();
  return value;
}

export function positiveVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail();
  return value as number;
}

export function trustedNow(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return new Date(value.getTime());
}

export interface ValidatedCatalogAuthority {
  readonly storeId: string;
  readonly principalId: string;
  readonly membershipId: string;
  readonly planId: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly productsLimit: number;
  readonly now: Date;
  readonly role: StoreMembershipRole;
}

export function catalogAuthority(context: TenantContext, currentTime: Date): ValidatedCatalogAuthority {
  const now = trustedNow(currentTime);
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
  if (context.entitlements.status !== "active" || !Array.isArray(context.entitlements.features) || !context.entitlements.features.includes("catalog")) {
    fail("feature_not_enabled");
  }
  try {
    const storeId = catalogUuid(context.store.id);
    const principalId = catalogUuid(context.principal.id);
    const membershipId = catalogUuid(context.membership.id);
    const planId = catalogUuid(context.entitlements.planId);
    const planCode = context.entitlements.planCode;
    const planVersion = context.entitlements.version;
    const productsLimit = context.entitlements.limits?.products;
    const role = context.membership.role;
    if (
      context.schemaVersion !== 1 ||
      context.entitlements.schemaVersion !== 1 ||
      typeof planCode !== "string" ||
      planCode.length < 1 ||
      planCode.length > 64 ||
      planCode !== planCode.trim() ||
      !Number.isSafeInteger(planVersion) ||
      planVersion < 1 ||
      !Number.isSafeInteger(productsLimit) ||
      productsLimit < 0 ||
      !(["store_owner", "admin", "editor", "analyst"] as const).includes(role as StoreMembershipRole) ||
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
    return Object.freeze({ storeId, principalId, membershipId, planId, planCode, planVersion, productsLimit, now, role });
  } catch (error) {
    if (error instanceof CatalogRepositoryError && error.code !== "invalid_input") throw error;
    fail("durable_authority_invalid");
  }
}

export function productFields(value: unknown): CatalogProductFields {
  const parsed = exact(value, ["slug", "title", "status", "currency"], ["description"]);
  let projection;
  try {
    projection = parseProduct({
      id: SYNTHETIC_ID,
      storeId: SYNTHETIC_STORE_ID,
      ...parsed,
      createdAt: SYNTHETIC_TIME,
      updatedAt: SYNTHETIC_TIME,
      version: 1,
    });
  } catch { fail(); }
  if (projection.status === "archived") fail();
  return Object.freeze({
    slug: projection.slug,
    title: projection.title,
    ...(projection.description === undefined ? {} : { description: projection.description }),
    status: projection.status,
    currency: projection.currency,
  });
}

export function variantFields(value: unknown): CatalogVariantFields {
  const parsed = exact(
    value,
    ["title", "priceCents", "stockTracking", "stockQuantity", "attributes"],
    ["sku", "barcode", "compareAtCents", "costCents"],
  );
  let projection;
  try {
    projection = parseProductVariant({
      id: SYNTHETIC_ID,
      productId: SYNTHETIC_ID,
      storeId: SYNTHETIC_STORE_ID,
      ...parsed,
      status: "active",
      createdAt: SYNTHETIC_TIME,
      updatedAt: SYNTHETIC_TIME,
      version: 1,
    });
  } catch { fail(); }
  return Object.freeze({
    title: projection.title,
    ...(projection.sku === undefined ? {} : { sku: projection.sku }),
    ...(projection.barcode === undefined ? {} : { barcode: projection.barcode }),
    priceCents: projection.priceCents,
    ...(projection.compareAtCents === undefined ? {} : { compareAtCents: projection.compareAtCents }),
    ...(projection.costCents === undefined ? {} : { costCents: projection.costCents }),
    stockTracking: projection.stockTracking,
    stockQuantity: projection.stockQuantity,
    attributes: projection.attributes,
  });
}

export function pageSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) fail();
  return value as number;
}

export function statusFilter(value: unknown): ProductStatus | undefined {
  if (value === undefined) return undefined;
  if (value !== "draft" && value !== "active" && value !== "archived") fail();
  return value;
}

export function exactInput(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  return exact(value, required, optional);
}
