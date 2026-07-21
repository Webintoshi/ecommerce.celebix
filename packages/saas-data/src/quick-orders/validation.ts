import {
  PLAN_FEATURE_KEYS,
  QUICK_ORDER_EXPIRY_HOURS,
  QUICK_ORDER_LINK_STATUSES,
  QUICK_ORDER_MAX_COMPONENT_CENTS,
  STORE_DOMAIN_TYPES,
  type PlanFeatureKey,
  type QuickOrderAddress,
  type QuickOrderLinkStatus,
  type StoreMembershipRole,
  type TenantContext,
} from "@celebix/saas-contracts";

import {
  isTrustedQuickLinkError,
  trustedQuickLinkError,
  type QuickOrderLinkErrorCode,
} from "./errors.ts";
import type { CreateQuickLinkItemInput, SealedQuickLinkToken } from "./types.ts";

export const QUICK_LINK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_DIGEST = /^[a-f0-9]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ROLES = new Set<StoreMembershipRole>(["store_owner", "admin", "editor", "analyst"]);
const FEATURES = new Set<string>(PLAN_FEATURE_KEYS);
const DOMAIN_TYPES = new Set<string>(STORE_DOMAIN_TYPES);
const MINIMUM_NOW = Date.parse("0001-01-01T00:00:00.000Z");
const MAXIMUM_NOW = Date.parse("9999-12-28T23:59:59.999Z");

type InputRecord = Readonly<Record<string, unknown>>;

function fail(code: QuickOrderLinkErrorCode = "invalid_input"): never {
  throw trustedQuickLinkError(code);
}

function contain<T>(operation: () => T, code: QuickOrderLinkErrorCode): T {
  try {
    return operation();
  } catch (error) {
    if (isTrustedQuickLinkError(error)) throw error;
    return fail(code);
  }
}

function record(value: unknown, code: QuickOrderLinkErrorCode): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value;
}

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  code: QuickOrderLinkErrorCode = "invalid_input",
): InputRecord {
  return contain(() => {
    const parsed = record(value, code);
    const descriptors = Object.getOwnPropertyDescriptors(parsed);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set([...required, ...optional]);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(descriptors, key))
    ) fail(code);
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") fail(code);
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(code);
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  }, code);
}

function arrayData(
  value: unknown,
  minimum: number,
  maximum: number,
  code: QuickOrderLinkErrorCode = "invalid_input",
): readonly unknown[] {
  return contain(() => {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) fail(code);
    const length = integer(lengthDescriptor.value, minimum, maximum, code);
    if (Reflect.ownKeys(descriptors).length !== length + 1) fail(code);
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(code);
      copy.push(descriptor.value);
    }
    return Object.freeze(copy);
  }, code);
}

function string(
  value: unknown,
  minimum: number,
  maximum: number,
  code: QuickOrderLinkErrorCode = "invalid_input",
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

function integer(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
  code: QuickOrderLinkErrorCode = "invalid_input",
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(code);
  return value as number;
}

function authorityUuid(value: unknown): string {
  if (typeof value !== "string" || !QUICK_LINK_UUID.test(value)) fail("durable_authority_invalid");
  return value;
}

function authorityTimestamp(value: unknown): string {
  const selected = string(value, 24, 24, "durable_authority_invalid");
  const parsed = new Date(selected);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== selected) fail("durable_authority_invalid");
  return selected;
}

function authorityFeatures(value: unknown): readonly PlanFeatureKey[] {
  return contain(() => {
    const entries = arrayData(value, 0, PLAN_FEATURE_KEYS.length, "durable_authority_invalid");
    const seen = new Set<string>();
    const copy: PlanFeatureKey[] = [];
    for (const feature of entries) {
      if (typeof feature !== "string" || !FEATURES.has(feature) || seen.has(feature)) fail("durable_authority_invalid");
      seen.add(feature);
      copy.push(feature as PlanFeatureKey);
    }
    return Object.freeze(copy);
  }, "durable_authority_invalid");
}

function authorityLimits(value: unknown): void {
  const parsed = exact(
    value,
    ["products", "staff", "storageBytes"],
    ["monthlyOrders", "customDomains"],
    "durable_authority_invalid",
  );
  integer(parsed.products, 0, Number.MAX_SAFE_INTEGER, "durable_authority_invalid");
  integer(parsed.staff, 0, Number.MAX_SAFE_INTEGER, "durable_authority_invalid");
  integer(parsed.storageBytes, 0, Number.MAX_SAFE_INTEGER, "durable_authority_invalid");
  if (Object.hasOwn(parsed, "monthlyOrders")) integer(parsed.monthlyOrders, 0, Number.MAX_SAFE_INTEGER, "durable_authority_invalid");
  if (Object.hasOwn(parsed, "customDomains")) integer(parsed.customDomains, 0, Number.MAX_SAFE_INTEGER, "durable_authority_invalid");
}

function canonicalLocale(value: unknown): void {
  const selected = string(value, 2, 35, "durable_authority_invalid");
  const canonical = Intl.getCanonicalLocales(selected);
  if (canonical.length !== 1 || canonical[0] !== selected) fail("durable_authority_invalid");
}

function validateResolvedHost(value: unknown, storeId: string, storeSlug: string): void {
  const parsed = exact(value, [
    "schemaVersion", "hostname", "domainId", "domainType", "storeId", "storeSlug",
    "canonicalHostname", "status", "cacheVersion",
  ], [], "durable_authority_invalid");
  const hostname = string(parsed.hostname, 1, 253, "durable_authority_invalid", HOSTNAME);
  const canonicalHostname = string(parsed.canonicalHostname, 1, 253, "durable_authority_invalid", HOSTNAME);
  if (
    parsed.schemaVersion !== 1 ||
    authorityUuid(parsed.domainId).length === 0 ||
    typeof parsed.domainType !== "string" || !DOMAIN_TYPES.has(parsed.domainType) ||
    authorityUuid(parsed.storeId) !== storeId ||
    string(parsed.storeSlug, 1, 63, "durable_authority_invalid", SLUG) !== storeSlug ||
    parsed.status !== "active" ||
    integer(parsed.cacheVersion, 1, Number.MAX_SAFE_INTEGER, "durable_authority_invalid") < 1 ||
    hostname !== hostname.toLowerCase() || canonicalHostname !== canonicalHostname.toLowerCase()
  ) fail("durable_authority_invalid");
}

export function exactQuickLinkInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): InputRecord {
  return exact(value, required, optional);
}

export function quickLinkUuid(value: unknown): string {
  if (typeof value !== "string" || !QUICK_LINK_UUID.test(value)) fail();
  return value;
}

export function quickLinkNow(value: unknown): Date {
  return contain(() => {
    if (!(value instanceof Date)) fail();
    const timestamp = Date.prototype.getTime.call(value);
    if (!Number.isFinite(timestamp) || timestamp < MINIMUM_NOW || timestamp > MAXIMUM_NOW) fail();
    return Object.freeze(new Date(timestamp)) as Date;
  }, "invalid_input");
}

export interface ValidatedQuickLinkAuthority {
  readonly storeId: string;
  readonly principalId: string;
  readonly membershipId: string;
  readonly planId: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly now: Date;
}

export function quickLinkAuthority(context: TenantContext, currentTime: Date): ValidatedQuickLinkAuthority {
  const now = quickLinkNow(currentTime);
  return contain(() => {
    const unsafeRoot = record(context, "durable_authority_invalid");
    const unsafeDescriptors = Object.getOwnPropertyDescriptors(unsafeRoot);
    if (!Object.hasOwn(unsafeDescriptors, "principal")) fail("unauthenticated");
    if (!Object.hasOwn(unsafeDescriptors, "store")) fail("store_inactive");
    if (!Object.hasOwn(unsafeDescriptors, "membership")) fail("membership_denied");
    const root = exact(context, [
      "schemaVersion", "requestId", "principal", "store", "membership", "entitlements", "locale",
    ], ["resolvedHost"], "durable_authority_invalid");
    if (root.schemaVersion !== 1) fail("durable_authority_invalid");
    string(root.requestId, 1, 128, "durable_authority_invalid");

    if (typeof root.principal !== "object" || root.principal === null || Array.isArray(root.principal)) fail("unauthenticated");
    const principal = exact(root.principal, ["id", "issuer", "subject"], [], "durable_authority_invalid");
    const principalId = authorityUuid(principal.id);
    string(principal.issuer, 1, 2_048, "durable_authority_invalid");
    string(principal.subject, 1, 512, "durable_authority_invalid");

    if (typeof root.store !== "object" || root.store === null || Array.isArray(root.store)) fail("store_inactive");
    const store = exact(root.store, ["id", "slug", "status"], [], "durable_authority_invalid");
    if (store.status !== "active") fail("store_inactive");
    const storeId = authorityUuid(store.id);
    const storeSlug = string(store.slug, 1, 63, "durable_authority_invalid", SLUG);

    if (typeof root.membership !== "object" || root.membership === null || Array.isArray(root.membership)) fail("membership_denied");
    const membership = exact(root.membership, ["id", "role", "status"], [], "durable_authority_invalid");
    if (membership.status !== "active") fail("membership_denied");
    const membershipId = authorityUuid(membership.id);
    if (typeof membership.role !== "string" || !ROLES.has(membership.role as StoreMembershipRole)) fail("durable_authority_invalid");

    const entitlements = exact(root.entitlements, [
      "schemaVersion", "planId", "planCode", "version", "status", "features", "limits", "validFrom",
    ], ["validUntil"], "durable_authority_invalid");
    if (entitlements.schemaVersion !== 1) fail("durable_authority_invalid");
    const planId = authorityUuid(entitlements.planId);
    const planCode = string(entitlements.planCode, 1, 64, "durable_authority_invalid");
    const planVersion = integer(entitlements.version, 1, Number.MAX_SAFE_INTEGER, "durable_authority_invalid");
    const features = authorityFeatures(entitlements.features);
    authorityLimits(entitlements.limits);
    const validFrom = authorityTimestamp(entitlements.validFrom);
    const validUntil = Object.hasOwn(entitlements, "validUntil") ? authorityTimestamp(entitlements.validUntil) : undefined;
    if (entitlements.status !== "active" || !features.includes("orders") || !features.includes("checkout")) {
      fail("feature_not_enabled");
    }
    if (
      now < new Date(validFrom) ||
      (validUntil !== undefined && (validUntil <= validFrom || now >= new Date(validUntil)))
    ) fail("durable_authority_invalid");

    canonicalLocale(root.locale);
    if (Object.hasOwn(root, "resolvedHost")) validateResolvedHost(root.resolvedHost, storeId, storeSlug);
    return Object.freeze({ storeId, principalId, membershipId, planId, planCode, planVersion, now });
  }, "durable_authority_invalid");
}

export function quickLinkPageSize(value: unknown): number {
  return integer(value, 1, 100);
}

export function quickLinkStatusFilter(value: unknown): QuickOrderLinkStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !QUICK_ORDER_LINK_STATUSES.includes(value as QuickOrderLinkStatus)) fail();
  return value as QuickOrderLinkStatus;
}

export function quickLinkVersion(value: unknown): number {
  return integer(value, 1);
}

function base64url(value: unknown, minimum: number, maximum: number, exactLength?: number): string {
  const selected = string(value, minimum, maximum, "invalid_input", BASE64URL);
  if (exactLength !== undefined && selected.length !== exactLength) fail();
  try {
    if (Buffer.from(selected, "base64url").toString("base64url") !== selected) fail();
  } catch {
    fail();
  }
  return selected;
}

export function quickLinkDigest(value: unknown): string {
  return string(value, 64, 64, "invalid_input", TOKEN_DIGEST);
}

export function quickLinkSealedToken(value: unknown): Readonly<SealedQuickLinkToken> {
  const parsed = exact(value, ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  if (parsed.algorithm !== "A256GCM" || parsed.version !== 1) fail();
  const result = Object.freeze({
    algorithm: "A256GCM" as const,
    ciphertext: base64url(parsed.ciphertext, 1, 8_192),
    iv: base64url(parsed.iv, 16, 16, 16),
    keyId: string(parsed.keyId, 1, 128),
    tag: base64url(parsed.tag, 22, 22, 22),
    version: 1 as const,
  });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 12_288) fail();
  return result;
}

export function quickLinkAddress(value: unknown): Readonly<QuickOrderAddress> {
  const parsed = exact(value, ["recipientName", "phone", "line1", "city", "country"], ["line2", "district", "postalCode"]);
  const result = Object.freeze({
    recipientName: string(parsed.recipientName, 1, 200),
    phone: string(parsed.phone, 3, 32),
    line1: string(parsed.line1, 1, 300),
    ...(Object.hasOwn(parsed, "line2") ? { line2: string(parsed.line2, 1, 300) } : {}),
    ...(Object.hasOwn(parsed, "district") ? { district: string(parsed.district, 1, 200) } : {}),
    city: string(parsed.city, 1, 200),
    ...(Object.hasOwn(parsed, "postalCode") ? { postalCode: string(parsed.postalCode, 1, 32) } : {}),
    country: string(parsed.country, 2, 2, "invalid_input", /^[A-Z]{2}$/),
  });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 4_096) fail();
  return result;
}

export function quickLinkItems(value: unknown): readonly Readonly<CreateQuickLinkItemInput>[] {
  const entries = arrayData(value, 1, 100);
  const itemIds = new Set<string>();
  const result = entries.map((entry) => {
    const parsed = exact(entry, ["itemId", "variantId", "quantity"]);
    const itemId = quickLinkUuid(parsed.itemId);
    if (itemIds.has(itemId)) fail();
    itemIds.add(itemId);
    return Object.freeze({
      itemId,
      variantId: quickLinkUuid(parsed.variantId),
      quantity: integer(parsed.quantity, 1, 9_999),
    });
  });
  return Object.freeze(result);
}

export function quickLinkItemIds(value: unknown): readonly string[] {
  const entries = arrayData(value, 1, 100);
  const seen = new Set<string>();
  const result = entries.map((entry) => {
    const id = quickLinkUuid(entry);
    if (seen.has(id)) fail();
    seen.add(id);
    return id;
  });
  return Object.freeze(result);
}

export function quickLinkCustomerName(value: unknown): string {
  return string(value, 1, 200);
}

export function quickLinkEmail(value: unknown): string {
  return string(value, 3, 320, "invalid_input", EMAIL);
}

export function quickLinkPhone(value: unknown): string {
  return string(value, 3, 32);
}

export function quickLinkNote(value: unknown): string {
  return string(value, 1, 2_000);
}

export function quickLinkLabel(value: unknown): string {
  return string(value, 1, 200);
}

export function quickLinkComponentCents(value: unknown): number {
  return integer(value, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
}

export function quickLinkExpiryHours(value: unknown): 4 | 12 | 24 | 48 | 72 {
  if (!Number.isSafeInteger(value) || !QUICK_ORDER_EXPIRY_HOURS.includes(value as 4 | 12 | 24 | 48 | 72)) fail();
  return value as 4 | 12 | 24 | 48 | 72;
}
