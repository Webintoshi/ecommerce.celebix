import {
  parseAbandonedCartSummary,
  parseCustomerListItem,
  parseCustomerSummary,
  parseOrderDashboardSummary,
  parseOrderListItem,
  parseProduct,
  parseProductVariant,
  type Product,
  type ProductVariant,
} from "@celebix/saas-contracts";

import { projectToshiLocalReply } from "./response.ts";
import type { ToshiLocalIntent, ToshiLocalReply } from "./types.ts";

const CATALOG_SUMMARY_KEYS = Object.freeze([
  "activeMedia",
  "activeProducts",
  "activeVariants",
  "draftProducts",
  "outOfStockVariants",
  "productLimit",
  "productsWithoutMedia",
  "totalProducts",
]);
const CATALOG_PAGE_SIZE = 20;
const CATALOG_MAX_PAGES_PER_STATUS = 3;
const CATALOG_MAX_PRODUCTS = 60;
const CATALOG_MAX_VARIANTS_PER_PRODUCT = 100;
const CATALOG_DETAIL_CONCURRENCY = 4;
const RESULT_CAP = 10;

type CatalogSummary = Readonly<{
  totalProducts: number;
  outOfStockVariants: number;
}>;

export class ToshiLocalError extends Error {
  readonly code = "unavailable";

  constructor() {
    super("unavailable");
    this.name = "ToshiLocalError";
  }
}

export interface ToshiLocalClient {
  execute(intent: ToshiLocalIntent, signal?: AbortSignal): Promise<ToshiLocalReply>;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ToshiLocalError();
  return value;
}

function parseCatalogSummary(value: unknown): CatalogSummary {
  const summary = record(value);
  if (summary === null || JSON.stringify(Object.keys(summary).sort()) !== JSON.stringify(CATALOG_SUMMARY_KEYS)) {
    throw new ToshiLocalError();
  }
  const totalProducts = count(summary.totalProducts);
  const activeProducts = count(summary.activeProducts);
  const draftProducts = count(summary.draftProducts);
  const activeVariants = count(summary.activeVariants);
  const outOfStockVariants = count(summary.outOfStockVariants);
  const productsWithoutMedia = count(summary.productsWithoutMedia);
  count(summary.productLimit);
  count(summary.activeMedia);
  if (
    activeProducts + draftProducts !== totalProducts ||
    outOfStockVariants > activeVariants ||
    productsWithoutMedia > totalProducts
  ) throw new ToshiLocalError();
  return Object.freeze({ totalProducts, outOfStockVariants });
}

type SearchEnvelope<T> = Readonly<{ items: readonly T[]; nextCursor?: string }>;

function parseSearchEnvelope<T>(
  value: unknown,
  maximum: number,
  cursorMaximum: number,
  parser: (item: unknown) => T,
): SearchEnvelope<T> {
  const envelope = record(value);
  if (
    envelope === null || !Array.isArray(envelope.items) || envelope.items.length > maximum ||
    !["items", "items,nextCursor"].includes(Object.keys(envelope).sort().join(",")) ||
    (envelope.nextCursor !== undefined && (
      typeof envelope.nextCursor !== "string" ||
      !new RegExp(`^[A-Za-z0-9_-]{1,${cursorMaximum}}$`).test(envelope.nextCursor)
    ))
  ) throw new ToshiLocalError();
  return Object.freeze({
    items: Object.freeze(envelope.items.map(parser)),
    ...(envelope.nextCursor === undefined ? {} : { nextCursor: envelope.nextCursor }),
  });
}

function matchesProduct(product: Product, variants: readonly ProductVariant[], query: string): boolean {
  const normalizedQuery = query.toLocaleLowerCase("tr-TR");
  return [product.title, product.slug, ...variants.flatMap((variant) => variant.sku === undefined ? [] : [variant.sku])]
    .some((value) => value.toLocaleLowerCase("tr-TR").includes(normalizedQuery));
}

function productPath(status: "active" | "draft", cursor?: string): string {
  const query = new URLSearchParams({ limit: String(CATALOG_PAGE_SIZE), status });
  if (cursor !== undefined) query.set("cursor", cursor);
  return `/api/catalog/products?${query}`;
}

function parseProductDetail(value: unknown, expected: Product): Readonly<{ product: Product; variants: readonly ProductVariant[] }> {
  const detail = record(value);
  if (
    detail === null || Object.keys(detail).sort().join(",") !== "product,variants" ||
    !Array.isArray(detail.variants) || detail.variants.length > CATALOG_MAX_VARIANTS_PER_PRODUCT
  ) throw new ToshiLocalError();
  const product = parseProduct(detail.product);
  const variants = Object.freeze(detail.variants.map(parseProductVariant));
  if (
    product.id !== expected.id || variants.some((variant) => variant.productId !== product.id)
  ) throw new ToshiLocalError();
  return Object.freeze({ product, variants });
}

async function mapBounded<T, R>(values: readonly T[], work: (value: T) => Promise<R>): Promise<readonly R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      output[index] = await work(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CATALOG_DETAIL_CONCURRENCY, values.length) }, worker));
  return Object.freeze(output);
}

function unavailable(error: unknown): ToshiLocalError {
  return error instanceof ToshiLocalError ? error : new ToshiLocalError();
}

export function createToshiLocalClient(fetcher: typeof fetch = fetch): ToshiLocalClient {
  async function read(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetcher(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      throw new ToshiLocalError();
    }
    return response.json();
  }

  async function findProducts(query: string, signal?: AbortSignal): Promise<Readonly<{ products: readonly Product[]; truncated: boolean }>> {
    const products: Product[] = [];
    const productIds = new Set<string>();
    let truncated = false;
    for (const status of ["active", "draft"] as const) {
      let cursor: string | undefined;
      const cursors = new Set<string>();
      for (let page = 0; page < CATALOG_MAX_PAGES_PER_STATUS; page += 1) {
        const envelope = parseSearchEnvelope(await read(productPath(status, cursor), signal), CATALOG_PAGE_SIZE, 2048, parseProduct);
        for (const product of envelope.items) {
          if (productIds.has(product.id)) throw new ToshiLocalError();
          productIds.add(product.id);
          if (products.length === CATALOG_MAX_PRODUCTS) {
            truncated = true;
            break;
          }
          products.push(product);
        }
        if (truncated || envelope.nextCursor === undefined) break;
        if (cursors.has(envelope.nextCursor)) throw new ToshiLocalError();
        cursors.add(envelope.nextCursor);
        if (page + 1 === CATALOG_MAX_PAGES_PER_STATUS) {
          truncated = true;
          break;
        }
        cursor = envelope.nextCursor;
      }
      if (truncated) break;
    }
    const details = await mapBounded(products, async (product) => parseProductDetail(await read(`/api/catalog/products/${product.id}`, signal), product));
    const matches = details.filter((detail) => matchesProduct(detail.product, detail.variants, query)).map((detail) => detail.product);
    return Object.freeze({ products: Object.freeze(matches.slice(0, RESULT_CAP)), truncated });
  }

  async function execute(intent: ToshiLocalIntent, signal?: AbortSignal): Promise<ToshiLocalReply> {
    try {
      switch (intent.kind) {
        case "store_summary": {
          const [catalog, orders, customers, abandoned] = await Promise.all([
            read("/api/catalog/summary", signal),
            read("/api/orders/summary", signal),
            read("/api/customers/summary", signal),
            read("/api/orders/abandoned-carts/summary", signal),
          ]);
          return projectToshiLocalReply(intent, {
            catalog: parseCatalogSummary(catalog),
            orders: parseOrderDashboardSummary(orders),
            customers: parseCustomerSummary(customers),
            abandoned: parseAbandonedCartSummary(abandoned),
          });
        }
        case "pending_orders":
          return projectToshiLocalReply(intent, parseOrderDashboardSummary(await read("/api/orders/summary", signal)));
        case "low_stock":
          return projectToshiLocalReply(intent, parseCatalogSummary(await read("/api/catalog/summary", signal)));
        case "find_product": {
          return projectToshiLocalReply(intent, await findProducts(intent.query, signal));
        }
        case "find_customer":
          {
            const result = parseSearchEnvelope(await read(`/api/customers?${new URLSearchParams({ search: intent.query, pageSize: "10" })}`, signal), 10, 1024, parseCustomerListItem);
            return projectToshiLocalReply(intent, Object.freeze({
              items: result.items,
              hasMore: result.nextCursor !== undefined,
            }));
          }
        case "find_order":
          {
            const result = parseSearchEnvelope(await read(`/api/orders?${new URLSearchParams({ search: intent.query, pageSize: "10", sort: "newest" })}`, signal), 10, 1024, parseOrderListItem);
            return projectToshiLocalReply(intent, Object.freeze({
              items: result.items,
              hasMore: result.nextCursor !== undefined,
            }));
          }
        case "navigate":
        case "unsupported":
          return projectToshiLocalReply(intent, null);
      }
    } catch (error) {
      throw unavailable(error);
    }
  }

  return Object.freeze({ execute });
}
