import {
  FIXED_STOREFRONT_POLICIES,
  parsePublicPolicyIndex,
  parsePublicProduct,
  parsePublicProductSearch,
  type PublicPolicyPage,
  type PublicProduct,
  type PublicProductSearch,
  type StorefrontPolicyKey,
  type TenantContext,
} from "@celebix/saas-contracts";

import { CatalogRepositoryError } from "../catalog/errors.ts";
import { catalogAuthority, type ValidatedCatalogAuthority } from "../catalog/validation.ts";
import { StorefrontContentRepositoryError, type StorefrontContentErrorCode } from "./errors.ts";
import type { PublicPolicySourcePage, StorePolicyAdminPage, StorePolicyStatus } from "./types.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const DANGEROUS_MARKUP = /<[\s/]*(?:script|iframe|object|embed|form|style|link|meta)(?:[\s/>])/i;
const EVENT_HANDLER = /on[a-z]+\s*=/i;
const ACTIVE_CONTENT = /(?:javascript|data):/i;

function fail(code: StorefrontContentErrorCode = "invalid_input"): never {
  throw new StorefrontContentRepositoryError(code);
}

function object(value: unknown, code: StorefrontContentErrorCode): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail(code);
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(code);
    output[key] = descriptor.value;
  }
  return output;
}

export function exactStorefrontContentInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  code: StorefrontContentErrorCode = "invalid_input",
): Record<string, unknown> {
  const parsed = object(value, code);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) fail(code);
  return parsed;
}

function text(value: unknown, minimumBytes: number, maximumBytes: number, code: StorefrontContentErrorCode): string {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value)) fail(code);
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < minimumBytes || bytes > maximumBytes) fail(code);
  return value;
}

export function storefrontContentHostname(value: unknown): string {
  const selected = text(value, 3, 253, "invalid_input");
  if (!HOSTNAME.test(selected)) fail();
  return selected;
}

export function storefrontContentDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return new Date(value.getTime());
}

export function storefrontContentUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function storefrontContentPolicyKey(value: unknown): StorefrontPolicyKey {
  const definition = FIXED_STOREFRONT_POLICIES.find(({ key }) => key === value);
  if (!definition) fail();
  return definition.key;
}

export function storefrontContentStatus(value: unknown, code: StorefrontContentErrorCode = "invalid_input"): StorePolicyStatus {
  if (value !== "draft" && value !== "published") fail(code);
  return value;
}

export function storefrontContentVersion(value: unknown, code: StorefrontContentErrorCode = "invalid_input"): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(code);
  return value as number;
}

export function storefrontContentBody(value: unknown, status: StorePolicyStatus, code: StorefrontContentErrorCode = "invalid_input"): string {
  if (typeof value !== "string" || value !== value.trim() || Buffer.byteLength(value, "utf8") > 100_000) fail(code);
  if ((status === "published" && Buffer.byteLength(value, "utf8") === 0) || CONTROL.test(value)) fail(code);
  if (DANGEROUS_MARKUP.test(value) || EVENT_HANDLER.test(value) || ACTIVE_CONTENT.test(value)) fail(code);
  return value;
}

export function storefrontContentQuery(value: unknown): string {
  return text(value, 0, 200, "invalid_input");
}

export function storefrontContentLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 48) fail();
  return value as number;
}

export function storefrontContentCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const selected = text(value, 1, 512, "invalid_input");
  if (!CURSOR.test(selected)) fail();
  const date = new Date(selected.slice(0, 24));
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== selected.slice(0, 24)) fail();
  return selected;
}

export function storefrontContentProductIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  const ids = value.map(storefrontContentUuid);
  if (new Set(ids).size !== ids.length) fail();
  return Object.freeze(ids);
}

export function storefrontContentAuthority(context: unknown, now: unknown): ValidatedCatalogAuthority {
  try {
    return catalogAuthority(context as TenantContext, now as Date);
  } catch (error) {
    if (error instanceof CatalogRepositoryError) {
      const code = error.code === "invalid_input" ? "durable_authority_invalid" : error.code;
      if (["unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(code)) {
        fail(code as StorefrontContentErrorCode);
      }
    }
    fail("durable_authority_invalid");
  }
}

function timestamp(value: unknown, code: StorefrontContentErrorCode): string {
  const selected = text(value, 24, 24, code);
  const date = new Date(selected);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== selected) fail(code);
  return selected;
}

export function parsePublicPolicySource(value: unknown): PublicPolicySourcePage {
  const parsed = exactStorefrontContentInput(value, ["key", "label", "route", "published", "updatedAt"], ["body"], "unavailable");
  const definition = FIXED_STOREFRONT_POLICIES.find(({ key }) => key === parsed.key);
  if (!definition || parsed.label !== definition.label || parsed.route !== definition.route || typeof parsed.published !== "boolean") fail("unavailable");
  const published = parsed.published;
  if (published !== Object.hasOwn(parsed, "body")) fail("unavailable");
  const body = published ? storefrontContentBody(parsed.body, "published", "unavailable") : undefined;
  return Object.freeze({
    key: definition.key,
    label: definition.label,
    route: definition.route,
    published,
    ...(body === undefined ? {} : { body }),
    updatedAt: timestamp(parsed.updatedAt, "unavailable"),
  });
}

export function parsePolicyIndexPayload(value: unknown): readonly PublicPolicyPage[] {
  const parsed = exactStorefrontContentInput(value, ["items"], [], "unavailable");
  try { return parsePublicPolicyIndex(parsed.items); } catch { fail("unavailable"); }
}

export function parseProductSearchPayload(value: unknown): PublicProductSearch {
  try { return parsePublicProductSearch(value); } catch { fail("unavailable"); }
}

export function parseResolvedProductsPayload(value: unknown): readonly PublicProduct[] {
  const parsed = exactStorefrontContentInput(value, ["items"], [], "unavailable");
  if (!Array.isArray(parsed.items) || parsed.items.length > 100) fail("unavailable");
  try {
    const products = Object.freeze(parsed.items.map(parsePublicProduct));
    if (new Set(products.map(({ id }) => id)).size !== products.length) fail("unavailable");
    return products;
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError) throw error;
    fail("unavailable");
  }
}

export function parseStorePolicyAdminPage(value: unknown): StorePolicyAdminPage {
  const parsed = exactStorefrontContentInput(value, ["key", "label", "route", "ordinal", "status", "body", "version", "createdAt", "updatedAt"], [], "unavailable");
  const definitionIndex = FIXED_STOREFRONT_POLICIES.findIndex(({ key }) => key === parsed.key);
  const definition = FIXED_STOREFRONT_POLICIES[definitionIndex];
  if (!definition || parsed.label !== definition.label || parsed.route !== definition.route || parsed.ordinal !== definitionIndex + 1) fail("unavailable");
  const status = storefrontContentStatus(parsed.status, "unavailable");
  const body = storefrontContentBody(parsed.body, status, "unavailable");
  return Object.freeze({
    key: definition.key,
    label: definition.label,
    route: definition.route,
    ordinal: definitionIndex + 1,
    status,
    body,
    version: storefrontContentVersion(parsed.version, "unavailable"),
    createdAt: timestamp(parsed.createdAt, "unavailable"),
    updatedAt: timestamp(parsed.updatedAt, "unavailable"),
  });
}

export function parseStorePolicyAdminList(value: unknown): readonly StorePolicyAdminPage[] {
  const parsed = exactStorefrontContentInput(value, ["items"], [], "unavailable");
  if (!Array.isArray(parsed.items) || parsed.items.length !== FIXED_STOREFRONT_POLICIES.length) fail("unavailable");
  const pages = Object.freeze(parsed.items.map(parseStorePolicyAdminPage));
  if (pages.some((page, index) => page.key !== FIXED_STOREFRONT_POLICIES[index]?.key)) fail("unavailable");
  return pages;
}
