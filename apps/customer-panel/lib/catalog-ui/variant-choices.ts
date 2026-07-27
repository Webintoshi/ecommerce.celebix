import {
  parseProduct,
  parseProductVariant,
  type Product,
  type ProductVariant,
} from "@celebix/saas-contracts";

import { catalogApi, type ProductDetailResult, type ProductListResult } from "./client.ts";

const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const DEFAULT_LIMITS = Object.freeze({
  maximumPages: 25,
  maximumProducts: 500,
  maximumVariants: 2_000,
  maximumDetailConcurrency: 4,
});

export type CatalogProductChoice = Readonly<{
  productId: string;
  title: string;
}>;

export type CatalogVariantChoice = Readonly<{
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku?: string;
}>;

export type CatalogVariantChoices = Readonly<{
  products: readonly CatalogProductChoice[];
  variants: readonly CatalogVariantChoice[];
}>;

export type CatalogVariantChoiceApi = Readonly<{
  listProducts(
    input: Readonly<{ status: "active"; cursor?: string }>,
    signal?: AbortSignal,
  ): Promise<ProductListResult>;
  getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetailResult>;
}>;

type Limits = Readonly<Partial<{
  maximumPages: number;
  maximumProducts: number;
  maximumVariants: number;
  maximumDetailConcurrency: number;
}>>;

const unavailable = (): never => {
  throw new Error("catalog_variant_choices_unavailable");
};

function bounded(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > fallback) unavailable();
  return value;
}

function ownValue(
  descriptors: Record<PropertyKey, PropertyDescriptor | undefined>,
  key: string,
): unknown {
  const descriptor = descriptors[key];
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return unavailable();
  return descriptor.value;
}

function exactRoot(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) unavailable();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))
  ) unavailable();
  const copied = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") return unavailable();
    copied[key] = ownValue(descriptors, key);
  }
  return copied;
}

function dense<T>(
  value: unknown,
  maximum: number,
  parse: (entry: unknown) => T,
): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) unavailable();
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > maximum) unavailable();
  if (Reflect.ownKeys(descriptors).length !== (length as number) + 1) unavailable();
  const copied: T[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    copied.push(parse(ownValue(descriptors, String(index))));
  }
  return Object.freeze(copied);
}

export async function loadCatalogVariantChoices(
  api: CatalogVariantChoiceApi = catalogApi,
  signal: AbortSignal = new AbortController().signal,
  overrides: Limits = {},
): Promise<CatalogVariantChoices> {
  const limits = Object.freeze({
    maximumPages: bounded(overrides.maximumPages, DEFAULT_LIMITS.maximumPages),
    maximumProducts: bounded(overrides.maximumProducts, DEFAULT_LIMITS.maximumProducts),
    maximumVariants: bounded(overrides.maximumVariants, DEFAULT_LIMITS.maximumVariants),
    maximumDetailConcurrency: bounded(
      overrides.maximumDetailConcurrency,
      DEFAULT_LIMITS.maximumDetailConcurrency,
    ),
  });
  try {
    const products: Product[] = [];
    const productIds = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let pageNumber = 0; ; pageNumber += 1) {
      signal.throwIfAborted();
      if (pageNumber >= limits.maximumPages) unavailable();
      const page = exactRoot(
        await api.listProducts({ status: "active", ...(cursor ? { cursor } : {}) }, signal),
        ["items"],
        ["nextCursor"],
      );
      signal.throwIfAborted();
      const pageItems = dense(page.items, limits.maximumProducts, parseProduct);
      if (products.length + pageItems.length > limits.maximumProducts) unavailable();
      for (const product of pageItems) {
        if (product.status !== "active" || productIds.has(product.id)) unavailable();
        productIds.add(product.id);
        products.push(product);
      }
      if (!Object.hasOwn(page, "nextCursor")) break;
      const nextCursor = page.nextCursor;
      if (
        typeof nextCursor !== "string"
        || !CURSOR.test(nextCursor)
        || nextCursor === cursor
        || cursors.has(nextCursor)
      ) return unavailable();
      cursors.add(nextCursor);
      cursor = nextCursor;
    }

    const details: Array<Readonly<{ product: Product; variants: readonly ProductVariant[] }> | undefined> =
      new Array(products.length);
    let nextIndex = 0;
    let returnedVariantCount = 0;
    async function worker() {
      for (;;) {
        signal.throwIfAborted();
        const index = nextIndex;
        nextIndex += 1;
        if (index >= products.length) return;
        const expected = products[index]!;
        const detail = exactRoot(
          await api.getProduct(expected.id, signal),
          ["product", "variants"],
        );
        signal.throwIfAborted();
        const product = parseProduct(detail.product);
        const variants = dense(detail.variants, limits.maximumVariants, parseProductVariant);
        returnedVariantCount += variants.length;
        if (returnedVariantCount > limits.maximumVariants) unavailable();
        if (
          product.id !== expected.id
          || product.status !== "active"
          || product.title !== expected.title
        ) unavailable();
        details[index] = Object.freeze({ product, variants });
      }
    }
    await Promise.all(
      Array.from(
        { length: Math.min(products.length, limits.maximumDetailConcurrency) },
        () => worker(),
      ),
    );

    const variantIds = new Set<string>();
    const variants: CatalogVariantChoice[] = [];
    for (let index = 0; index < details.length; index += 1) {
      const detail = details[index];
      const product = products[index];
      if (!detail || !product) return unavailable();
      for (const variant of detail.variants) {
        if (variant.productId !== product.id || variantIds.has(variant.id)) unavailable();
        variantIds.add(variant.id);
        if (variant.status !== "active") continue;
        variants.push(Object.freeze({
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          variantTitle: variant.title,
          ...(variant.sku ? { sku: variant.sku } : {}),
        }));
      }
    }
    return Object.freeze({
      products: Object.freeze(products.map((product) => Object.freeze({
        productId: product.id,
        title: product.title,
      }))),
      variants: Object.freeze(variants),
    });
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof Error && error.message === "catalog_variant_choices_unavailable") throw error;
    return unavailable();
  }
}
