import {
  FIXED_STOREFRONT_POLICIES,
  parsePublicPolicyIndex,
  parsePublicProduct,
  parsePublicProductSearch,
  parseRequiredPageKey,
  type PublicPolicyPage,
  type PublicProduct,
  type PublicProductSearch,
  type RequiredPageKey,
  type StorefrontPolicyKey,
  type TenantContext,
} from "@celebix/saas-contracts";

import { CatalogRepositoryError } from "../catalog/errors.ts";
import { catalogAuthority, type ValidatedCatalogAuthority } from "../catalog/validation.ts";
import { StorefrontContentRepositoryError, type StorefrontContentErrorCode } from "./errors.ts";
import type { PublicContentList, PublicContentLocales, PublicContentPage, PublicContentV2, PublicPolicySourcePage, PublicSitemapEntry, PublicSitemapShard, SitemapChangeFrequency, SitemapKind, StorePolicyAdminPage, StorePolicyStatus } from "./types.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^(?:(?:true|false)\||s2\|(?:0|[1-9]\d*)\|(?:true|false)\|)?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const DANGEROUS_MARKUP = /<[\s/]*(?:script|iframe|object|embed|form|style|link|meta)(?:[\s/>])/i;
const EVENT_HANDLER = /on[a-z]+\s*=/i;
const ACTIVE_CONTENT = /(?:javascript|data):/i;

function fail(code: StorefrontContentErrorCode = "invalid_input"): never {
  throw new StorefrontContentRepositoryError(code);
}

export function storefrontContentRequiredPageKey(value: unknown, code: StorefrontContentErrorCode = "invalid_input"): RequiredPageKey {
  try { return parseRequiredPageKey(value); } catch { return fail(code); }
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

export function storefrontContentUuid(value: unknown, code: StorefrontContentErrorCode = "invalid_input"): string {
  if (typeof value !== "string" || !UUID.test(value)) fail(code);
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
  return text(value, 0, 100, "invalid_input");
}

export function storefrontContentLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 48) fail();
  return value as number;
}

export function storefrontContentCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const selected = text(value, 1, 512, "invalid_input");
  if (!CURSOR.test(selected)) fail();
  const parts = selected.split("|");
  const dateText = parts.at(-2)!;
  const date = new Date(dateText);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== dateText) fail();
  if (parts[0] === "s2" && !Number.isSafeInteger(Number(parts[1]))) fail();
  return selected;
}

export function storefrontContentProductIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  const ids = value.map((item) => storefrontContentUuid(item));
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

export function storefrontContentPageSlug(value: unknown, code: StorefrontContentErrorCode = "invalid_input"): string {
  const slug = text(value, 1, 100, code);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(code);
  return slug;
}

export function parsePublicContentPage(value: unknown): PublicContentPage {
  const parsed = exactStorefrontContentInput(value, ["id", "slug", "title", "body", "updatedAt"], [], "unavailable");
  if (typeof parsed.id !== "string" || !UUID.test(parsed.id)) fail("unavailable");
  if (typeof parsed.body !== "string" || Buffer.byteLength(parsed.body, "utf8") > 256_000 || CONTROL.test(parsed.body)) fail("unavailable");
  return Object.freeze({
    id: parsed.id,
    slug: storefrontContentPageSlug(parsed.slug, "unavailable"),
    title: text(parsed.title, 1, 800, "unavailable"),
    body: parsed.body,
    updatedAt: timestamp(parsed.updatedAt, "unavailable"),
  });
}

const CONTENT_LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const SITEMAP_FREQUENCIES = new Set<SitemapChangeFrequency>(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
const SITEMAP_PATH = /^(?:\/|\/(?:urunler|products|blog)|\/(?:pages|blog|urun|products|kategori|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:\?lang=[a-z]{2,3}(?:-[A-Z]{2})?)?$/;

export function storefrontContentLocale(value: unknown, code: StorefrontContentErrorCode = "invalid_input"): string {
  const locale = text(value, 2, 6, code);
  if (!CONTENT_LOCALE.test(locale)) fail(code);
  return locale;
}

export function storefrontContentBlogLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 20) fail();
  return value as number;
}

export function storefrontContentSitemapKind(value: unknown): SitemapKind {
  if (value !== "products" && value !== "content") fail();
  return value;
}

export function storefrontContentSitemapPage(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= 10_000) fail();
  return value as number;
}

export function storefrontContentBlogCursor(value: unknown, locale: string): Readonly<{ kind: "blog_post"; locale: string; updatedAt: string; id: string }> | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { fail(); }
  const parsed = exactStorefrontContentInput(decoded, ["kind", "locale", "updatedAt", "id"]);
  if (parsed.kind !== "blog_post" || parsed.locale !== locale) fail();
  return Object.freeze({ kind: "blog_post", locale, updatedAt: timestamp(parsed.updatedAt, "invalid_input"), id: storefrontContentUuid(parsed.id) });
}

function nullablePlain(value: unknown, maxBytes: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > maxBytes || CONTROL.test(value)) fail("unavailable");
  return value;
}

function parseContentV2(value: unknown, includeBody: boolean): PublicContentV2 | Omit<PublicContentV2, "body"> {
  const required = ["id", "kind", "slug", "locale", "title", "bodyFormat", "excerpt", "seoTitle", "seoDescription", "publishedAt", "updatedAt", ...(includeBody ? ["body"] : [])];
  const parsed = exactStorefrontContentInput(value, required, ["requiredPageKey"], "unavailable");
  const kind = parsed.kind;
  if (kind !== "page" && kind !== "blog_post") fail("unavailable");
  const requiredPageKey = Object.hasOwn(parsed, "requiredPageKey") ? storefrontContentRequiredPageKey(parsed.requiredPageKey, "unavailable") : undefined;
  if (requiredPageKey !== undefined && kind !== "page") fail("unavailable");
  if (parsed.bodyFormat !== "legacy" && parsed.bodyFormat !== "normalized_html") fail("unavailable");
  const common = {
    id: storefrontContentUuid(parsed.id, "unavailable"), kind: kind as "page" | "blog_post",
    ...(requiredPageKey === undefined ? {} : { requiredPageKey }),
    slug: storefrontContentPageSlug(parsed.slug, "unavailable"),
    locale: storefrontContentLocale(parsed.locale, "unavailable"),
    title: text(parsed.title, 1, 800, "unavailable"),
    bodyFormat: parsed.bodyFormat as "legacy" | "normalized_html",
    excerpt: nullablePlain(parsed.excerpt, 4000),
    seoTitle: nullablePlain(parsed.seoTitle, 160),
    seoDescription: nullablePlain(parsed.seoDescription, 4000),
    publishedAt: parsed.publishedAt === null ? null : timestamp(parsed.publishedAt, "unavailable"),
    updatedAt: timestamp(parsed.updatedAt, "unavailable"),
  };
  if (!includeBody) return Object.freeze(common);
  // Legacy HTML is normalized by the shared renderer; rejecting it here would hide published historical pages.
  if (typeof parsed.body !== "string" || Buffer.byteLength(parsed.body, "utf8") > 80_000 || CONTROL.test(parsed.body)) fail("unavailable");
  return Object.freeze({ ...common, body: parsed.body });
}

export function parsePublicContentV2(value: unknown): PublicContentV2 { return parseContentV2(value, true) as PublicContentV2; }
export function parsePublicContentLocales(value: unknown): PublicContentLocales {
  const parsed = exactStorefrontContentInput(value, ["defaultLocale", "enabledLocales"], [], "unavailable");
  const defaultLocale = storefrontContentLocale(parsed.defaultLocale, "unavailable");
  if (!Array.isArray(parsed.enabledLocales) || parsed.enabledLocales.length < 1 || parsed.enabledLocales.length > 20) fail("unavailable");
  const enabledLocales = Object.freeze(parsed.enabledLocales.map((item) => storefrontContentLocale(item, "unavailable")));
  if (new Set(enabledLocales).size !== enabledLocales.length || !enabledLocales.includes(defaultLocale)) fail("unavailable");
  return Object.freeze({ defaultLocale, enabledLocales });
}
export function parsePublicBlogList(value: unknown, expectedLocale: string): PublicContentList {
  const parsed = exactStorefrontContentInput(value, ["items", "nextCursor"], [], "unavailable");
  if (!Array.isArray(parsed.items) || parsed.items.length > 20) fail("unavailable");
  const items = Object.freeze(parsed.items.map((item) => parseContentV2(item, false) as Omit<PublicContentV2, "body">));
  if (items.some((item) => item.kind !== "blog_post" || item.locale !== expectedLocale)) fail("unavailable");
  if (parsed.nextCursor !== null) {
    try { storefrontContentBlogCursor(parsed.nextCursor, expectedLocale); } catch { fail("unavailable"); }
  }
  return Object.freeze({ items, nextCursor: parsed.nextCursor as string | null });
}
export function parsePublicSitemapIndex(value: unknown): readonly PublicSitemapShard[] {
  const parsed = exactStorefrontContentInput(value, ["items"], [], "unavailable");
  if (!Array.isArray(parsed.items) || parsed.items.length > 10_000) fail("unavailable");
  const items = parsed.items.map((item) => {
    const row = exactStorefrontContentInput(item, ["kind", "page"], [], "unavailable");
    if (row.kind !== "products" && row.kind !== "content" || !Number.isSafeInteger(row.page) || (row.page as number) < 0 || (row.page as number) >= 10_000) fail("unavailable");
    return Object.freeze({ kind: row.kind as SitemapKind, page: row.page as number });
  });
  if (new Set(items.map(({ kind, page }) => `${kind}:${page}`)).size !== items.length) fail("unavailable");
  return Object.freeze(items);
}
export function parsePublicSitemapPage(value: unknown): readonly PublicSitemapEntry[] {
  const parsed = exactStorefrontContentInput(value, ["items"], [], "unavailable");
  if (!Array.isArray(parsed.items) || parsed.items.length > 1000) fail("unavailable");
  const items = parsed.items.map((item) => {
    const row = exactStorefrontContentInput(item, ["path", "updatedAt", "changeFrequency"], [], "unavailable");
    if (typeof row.path !== "string" || !SITEMAP_PATH.test(row.path) || !SITEMAP_FREQUENCIES.has(row.changeFrequency as SitemapChangeFrequency)) fail("unavailable");
    return Object.freeze({ path: row.path, updatedAt: timestamp(row.updatedAt, "unavailable"), changeFrequency: row.changeFrequency as SitemapChangeFrequency });
  });
  if (new Set(items.map(({ path }) => path)).size !== items.length) fail("unavailable");
  return Object.freeze(items);
}
